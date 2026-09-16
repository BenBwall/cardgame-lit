import { expect, test } from "bun:test";
import { mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../server/http.js";

const openssl = Bun.which("openssl");
test.skipIf(!openssl)(
  "HTTPS and WSS work with direct Bun TLS",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "cardgame-tls-"));
    const cert = join(directory, "cert.pem"),
      key = join(directory, "key.pem");
    let app: ReturnType<typeof startServer> | undefined;
    try {
      const result = Bun.spawnSync([
        openssl!,
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        key,
        "-out",
        cert,
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
      ]);
      expect(result.exitCode).toBe(0);
      app = startServer({ port: 0, tls: { cert: Bun.file(cert), key: Bun.file(key) } });
      expect(app.server.url.protocol).toBe("https:");
      const request = (path: string, body?: unknown, credential?: string) =>
        fetch(new URL(path, app!.server.url), {
          // Self-signed test certificate only. Production browser verification is never disabled.
          tls: { rejectUnauthorized: false },
          method: body ? "POST" : "GET",
          headers: {
            Origin: "https://people.arcada.fi",
            "Content-Type": "application/json",
            ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      expect((await request("/health")).status).toBe(200);
      const admission = await (
        await request("/rooms", { username: "TLS", gameId: "shithead", options: {} })
      ).json();
      const { ticket } = await (
        await request(
          `/rooms/${admission.code}/ticket`,
          { playerId: admission.playerId },
          admission.credential,
        )
      ).json();
      const NativeSocket = WebSocket as unknown as {
        new (url: string, options: Bun.WebSocketOptions): WebSocket;
      };
      const ws = new NativeSocket(
        `${app.server.url.origin.replace("https:", "wss:")}/rooms/${admission.code}/socket`,
        {
          tls: { rejectUnauthorized: false },
          headers: {
            Origin: "https://people.arcada.fi",
            "Sec-WebSocket-Protocol": `cardgame.v1, ticket.${ticket}`,
          },
        },
      );
      const message = await new Promise<string>((resolve, reject) => {
        ws.onmessage = (e) => resolve(String(e.data));
        ws.onerror = () => reject(new Error("WSS handshake failed"));
      });
      expect(JSON.parse(message)).toMatchObject({
        type: "snapshot",
        room: { self: admission.playerId },
      });
      ws.close();
    } finally {
      await app?.stop();
      await unlink(cert).catch(() => {});
      await unlink(key).catch(() => {});
      await rmdir(directory);
    }
  },
  10_000,
);
