import { cardId } from "./cards.js";
import type { GameState } from "./game-state.js";

type Zone = "deck" | "hand" | "played";
type Pose = {
  node: HTMLElement;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  origin: string;
  flying?: boolean;
  flip?: number;
};
type Snapshot = {
  version: number;
  cards: Map<string, Pose>;
  zones: Map<string, Zone>;
  deck?: Pose;
  played?: Pose;
};
const zones = (game: GameState) => {
  const result = new Map<string, Zone>();
  for (const zone of ["deck", "hand", "played"] as const)
    for (const card of game[zone]) result.set(cardId(card), zone);
  return result;
};
const transform = (x: number, y: number, angle: number) =>
  `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;

/** Animate the visual cards while game state and controls remain immediately usable. */
export class CardMotion {
  private version = 0;
  private flights = new Map<string, { node: HTMLElement; stop: () => void }>();
  private shuffle?: Animation;
  private preference?: MediaQueryList;

  constructor(private readonly root: () => DocumentFragment | HTMLElement) {}

  connect(): void {
    this.preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.preference.addEventListener("change", this.finish);
    window.addEventListener("resize", this.finish);
    window.addEventListener("scroll", this.finish, true);
  }

  disconnect(): void {
    this.finish();
    this.preference?.removeEventListener("change", this.finish);
    window.removeEventListener("resize", this.finish);
    window.removeEventListener("scroll", this.finish, true);
  }

  finish = (): void => {
    this.version++;
    for (const flight of [...this.flights.values()]) flight.stop();
    this.shuffle?.cancel();
    this.shuffle = undefined;
  };

  private pose(node: HTMLElement, flying = false): Pose {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const matrix = new DOMMatrix(style.transform);
    const flipper = flying ? node.querySelector<HTMLElement>(".flight-flipper") : null;
    const flipMatrix = flipper ? new DOMMatrix(getComputedStyle(flipper).transform) : undefined;
    return {
      node: node.cloneNode(true) as HTMLElement,
      x: flying ? matrix.e : rect.left,
      y: flying ? matrix.f : rect.top,
      width: flying ? node.offsetWidth : rect.width,
      height: flying ? node.offsetHeight : rect.height,
      angle: flying ? (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI : 0,
      origin: flying ? style.transformOrigin : "50% 50%",
      flying,
      flip: flipMatrix ? (Math.atan2(-flipMatrix.m13, flipMatrix.m11) * 180) / Math.PI : undefined,
    };
  }

  capture(game: GameState, released?: HTMLElement): Snapshot {
    const root = this.root();
    const cards = new Map<string, Pose>();
    for (const node of root.querySelectorAll<HTMLElement>("[data-motion-id]"))
      cards.set(node.dataset.motionId!, this.pose(node, node.classList.contains("drag-preview")));
    // Continue interrupted flights from what is actually on screen, not their destinations.
    for (const [id, flight] of this.flights) cards.set(id, this.pose(flight.node, true));
    if (released?.dataset.motionId) cards.set(released.dataset.motionId, this.pose(released, true));
    const deck = root.querySelector<HTMLElement>("#draw-card");
    const played = root.querySelector<HTMLElement>(".played-pile .card");
    this.finish();
    released?.remove();
    return {
      version: this.version,
      cards,
      zones: zones(game),
      deck: deck ? this.pose(deck) : undefined,
      played: played ? this.pose(played) : undefined,
    };
  }

  animate(before: Snapshot, game: GameState, shuffle = false): void {
    if (before.version !== this.version || this.preference?.matches) return;
    const root = this.root();
    if (!root.isConnected) return;
    const nextZones = zones(game);
    const targets = new Map<string, HTMLElement>();
    for (const node of root.querySelectorAll<HTMLElement>("[data-motion-id]"))
      targets.set(node.dataset.motionId!, node);
    const deck = root.querySelector<HTMLElement>("#draw-card");
    const played = root.querySelector<HTMLElement>(".played-pile .card");
    for (const id of new Set([...before.cards.keys(), ...targets.keys()])) {
      const previousZone = before.zones.get(id);
      const zone = nextZones.get(id);
      const target = targets.get(id);
      let from = before.cards.get(id);
      // A newly exposed card beneath the played pile stays in place.
      if (!from && previousZone === zone && zone === "played") continue;
      const destination = target ?? (zone === "deck" ? deck : zone === "played" ? played : null);
      if (!destination) continue;
      const to = this.pose(destination);
      // Land at the layout slot; the normal hover/focus lift resumes after landing.
      const targetTransform = new DOMMatrix(getComputedStyle(destination).transform);
      to.x -= targetTransform.e;
      to.y -= targetTransform.f;
      if (!from) {
        const pile = previousZone === "played" ? before.played : before.deck;
        if (!pile) continue;
        from = {
          ...pile,
          node: to.node,
          angle: 0,
          flip: previousZone === "deck" ? 180 : undefined,
        };
      }
      if (!target && previousZone === zone) continue;
      const changedZone = previousZone !== zone;
      if (!changedZone && !from.flying && Math.hypot(from.x - to.x, from.y - to.y) < 1) continue;
      const kind =
        previousZone === "deck"
          ? "draw"
          : zone === "deck"
            ? "return-deck"
            : from.flying
              ? "land"
              : changedZone
                ? "play"
                : "arrange";
      this.fly(id, from, to, target, kind);
    }
    if (shuffle && deck) {
      this.shuffle = deck.animate(
        [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-9deg)" },
          { transform: "rotate(9deg)" },
          { transform: "rotate(-5deg)" },
          { transform: "rotate(0deg)" },
        ],
        { duration: 500, easing: "ease-in-out" },
      );
    }
  }

  private fly(
    id: string,
    from: Pose,
    to: Pose,
    target: HTMLElement | undefined,
    kind: string,
  ): void {
    const node = from.node;
    node.classList.remove("drag-preview");
    node.classList.add("card-flight");
    for (const attribute of [
      "id",
      "data-card-id",
      "data-motion-id",
      "data-drag-source",
      "data-drop-side",
      "data-in-flight",
      "aria-describedby",
    ])
      node.removeAttribute(attribute);
    node.setAttribute("aria-hidden", "true");
    node.inert = true;
    node.tabIndex = -1;
    node.dataset.flightId = id;
    node.dataset.flightKind = kind;
    node.style.cssText = `width:${from.width}px;height:${from.height}px;transform-origin:${from.origin};`;
    this.root().appendChild(node);
    target?.setAttribute("data-in-flight", "");
    const endAngle = 0;
    const duration = kind === "draw" ? 600 : kind === "arrange" ? 280 : 420;
    const flip =
      kind === "draw" || kind === "return-deck" || from.flip !== undefined
        ? this.flip(node, from.flip ?? 0, kind === "return-deck" ? 180 : 0, duration)
        : undefined;
    const arc = kind === "draw" ? 45 : kind === "arrange" ? 8 : 24;
    const animation = node.animate(
      [
        { transform: transform(from.x, from.y, from.angle) },
        {
          transform: transform(
            (from.x + to.x) / 2,
            (from.y + to.y) / 2 - arc,
            (from.angle + endAngle) / 2,
          ),
          offset: 0.5,
        },
        { transform: transform(to.x, to.y, endAngle) },
      ],
      { duration, easing: "cubic-bezier(.2,.7,.25,1)", fill: "both" },
    );
    const stop = () => {
      if (this.flights.get(id)?.node !== node) return;
      this.flights.delete(id);
      target?.removeAttribute("data-in-flight");
      node.remove();
      animation.cancel();
      flip?.cancel();
    };
    this.flights.set(id, { node, stop });
    void animation.finished.then(stop, stop);
  }

  private flip(node: HTMLElement, from: number, to: number, duration: number): Animation {
    const face = node.querySelector(".flight-front") ?? node;
    const front = document.createElement("span");
    front.className = "card face flight-front";
    front.dataset.suit = node.dataset.suit;
    front.append(...[...face.childNodes].map((child) => child.cloneNode(true)));
    const back = document.createElement("span");
    back.className = "card back flight-back";
    back.textContent = "✦";
    const flipper = document.createElement("span");
    flipper.className = "flight-flipper";
    flipper.append(front, back);
    node.replaceChildren(flipper);
    node.classList.add("flipping");
    const animation = flipper.animate(
      [{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }],
      { duration, easing: "ease-in-out", fill: "both" },
    );
    void animation.finished.catch(() => {});
    return animation;
  }
}
