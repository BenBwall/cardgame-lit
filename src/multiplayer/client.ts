import {
  serverUrl,
  type Admission,
  type Command,
  type RoomView,
  type ServerMessage,
} from "@cardgame/multiplayer/protocol.js";

export type ConnectionState = "idle" | "connecting" | "connected" | "reconnecting" | "closed";
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Credentials and pending commands live only in this object, never browser storage. */
export class OnlineClient {
  room?: RoomView;
  status: ConnectionState = "idle";
  error = "";
  pending?: Command;
  private admission?: Admission;
  private socket?: WebSocket;
  private sequence = 0;
  private generation = 0;
  private attempts = 0;
  private leaving = false;
  private retry?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private requests = new AbortController();
  readonly url: string;
  constructor(
    url: string,
    private changed: () => void,
  ) {
    this.url = serverUrl(url);
  }

  private async request(path: string, body: unknown, authenticated = false) {
    const response = await fetch(this.url + path, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([this.requests.signal, AbortSignal.timeout(12_000)]),
      headers: {
        "Content-Type": "application/json",
        ...(authenticated ? { Authorization: `Bearer ${this.admission!.credential}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new RequestError(result.error ?? "Server request failed.", response.status);
    return result;
  }
  async enter(username: string, gameId: string, options: unknown, code?: string): Promise<void> {
    this.status = "connecting";
    this.error = "";
    this.changed();
    const generation = this.generation;
    try {
      const admission: Admission = code
        ? await this.request(`/rooms/${encodeURIComponent(code.trim())}/join`, { username })
        : await this.request("/rooms", { username, gameId, options });
      if (generation !== this.generation) return;
      this.admission = admission;
      await this.connect();
    } catch (error) {
      if (generation !== this.generation) return;
      this.error =
        error instanceof RequestError
          ? error.message
          : "Could not reach the online server. Try again.";
      this.status = "idle";
      this.changed();
    }
  }
  private async connect(): Promise<void> {
    const admission = this.admission;
    if (!admission) return;
    const generation = this.generation;
    this.status = this.room ? "reconnecting" : "connecting";
    this.changed();
    try {
      const { ticket } = await this.request(
        `/rooms/${admission.code}/ticket`,
        { playerId: admission.playerId },
        true,
      );
      if (generation !== this.generation) return;
      const url = new URL(`/rooms/${admission.code}/socket`, this.url);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url, ["cardgame.v1", `ticket.${ticket}`]);
      this.socket = socket;
      const watch = () => {
        clearTimeout(this.watchdog);
        this.watchdog = setTimeout(() => socket.close(), 50_000);
      };
      watch();
      socket.onmessage = (event) => {
        if (generation !== this.generation || this.socket !== socket) return;
        watch();
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          socket.close();
          return;
        }
        if (message.type === "ping") {
          socket.send(JSON.stringify({ type: "pong" }));
          return;
        }
        if (message.type === "snapshot") {
          const first = this.status !== "connected";
          if (first) this.error = "";
          if (!this.room || message.room.revision >= this.room.revision) this.room = message.room;
          this.sequence = Math.max(this.sequence, message.sequence);
          this.status = "connected";
          this.attempts = 0;
          // Retry the identical envelope after reconnect: never rebase an uncertain action.
          if (first && this.pending) socket.send(JSON.stringify(this.pending));
        } else if (message.type === "ack") {
          if (message.sequence === this.pending?.sequence) this.pending = undefined;
          if (!message.accepted) this.error = message.error ?? "Move rejected.";
        } else if (message.type === "error") this.error = message.error;
        else if (message.type === "closed") {
          this.finish(this.leaving ? "" : message.reason);
          return;
        }
        this.changed();
      };
      socket.onclose = (event) => {
        if (generation !== this.generation || this.socket !== socket) return;
        clearTimeout(this.watchdog);
        if (event.code === 4000 || event.code === 4001) {
          this.finish(event.reason || "Session ended.");
          return;
        }
        this.scheduleReconnect();
      };
      socket.onerror = () => {
        if (generation !== this.generation || this.socket !== socket) return;
        this.error = "Connection interrupted. Reconnecting…";
        this.changed();
      };
    } catch (error) {
      if (generation !== this.generation) return;
      if (error instanceof RequestError && [401, 404].includes(error.status))
        this.finish(error.message);
      else this.scheduleReconnect();
    }
  }
  private scheduleReconnect() {
    if (!this.admission) return;
    if (this.admission.expiresAt <= Date.now() || this.attempts >= 18) {
      this.finish("Session expired. Create or join a new room.");
      return;
    }
    this.status = "reconnecting";
    this.changed();
    clearTimeout(this.retry);
    this.retry = setTimeout(
      () => {
        void this.connect();
      },
      Math.min(10_000, 500 * 2 ** this.attempts++) + Math.random() * 300,
    );
  }
  send(type: Command["type"], action?: unknown): void {
    if (
      !this.room ||
      this.status !== "connected" ||
      this.pending ||
      this.socket?.readyState !== WebSocket.OPEN
    )
      return;
    const command = { type, action, sequence: this.sequence + 1, revision: this.room.revision };
    const encoded = JSON.stringify(command);
    if (new TextEncoder().encode(encoded).length > 4096) {
      this.error = "This move is too large to send.";
      this.changed();
      return;
    }
    this.error = "";
    this.sequence++;
    this.pending = command;
    this.socket.send(encoded);
    this.changed();
  }
  async leave(): Promise<void> {
    if (!this.admission) {
      this.finish("");
      return;
    }
    const generation = this.generation;
    this.leaving = true;
    try {
      await this.request(
        `/rooms/${this.admission.code}/leave`,
        { playerId: this.admission.playerId },
        true,
      );
    } catch (error) {
      // The server's room-closed frame may arrive first and abort this fetch.
      if (generation !== this.generation) return;
      this.leaving = false;
      if (!(error instanceof RequestError) || ![401, 404].includes(error.status)) {
        this.error =
          "Could not leave yet. Retry when connected, or close this tab; the room will expire.";
        this.changed();
        return;
      }
    }
    if (generation !== this.generation) return;
    this.finish("");
  }
  private finish(message: string) {
    this.dispose();
    this.room = undefined;
    this.status = "closed";
    this.error = message;
    this.changed();
  }
  dispose(): void {
    this.generation++;
    clearTimeout(this.retry);
    clearTimeout(this.watchdog);
    this.requests.abort();
    this.requests = new AbortController();
    this.socket?.close();
    this.socket = undefined;
    this.admission = undefined;
    this.pending = undefined;
    this.sequence = 0;
    this.leaving = false;
  }
}
