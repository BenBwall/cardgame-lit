import { cardId } from "./cards.js";
import { cardGeometry } from "./card-geometry.js";
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
  shadow: string;
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
  private flights = new Map<
    string,
    {
      node: HTMLElement;
      stop: () => void;
      retarget: (from: Pose, to: Pose) => void;
      anchor: { x: number; y: number; angle: number };
    }
  >();
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

  finishCard(id: string): void {
    this.flights.get(id)?.stop();
  }

  private destination(node: HTMLElement): Pose {
    const pose = this.pose(node);
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    pose.x -= matrix.e;
    pose.y -= matrix.f;
    pose.angle = Number(node.dataset.restAngle ?? 0);
    pose.origin = "50% 50%";
    return pose;
  }

  private pose(node: HTMLElement, flying = false): Pose {
    const geometry = cardGeometry(node);
    const flipper = flying ? node.querySelector<HTMLElement>(".flight-flipper") : null;
    const flipMatrix = flipper ? new DOMMatrix(getComputedStyle(flipper).transform) : undefined;
    return {
      node: node.cloneNode(true) as HTMLElement,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      angle: geometry.angle,
      origin: geometry.origin,
      flying,
      flip: flipMatrix ? (Math.atan2(-flipMatrix.m13, flipMatrix.m11) * 180) / Math.PI : undefined,
      shadow: getComputedStyle(node.querySelector(".flight-front") ?? node).boxShadow,
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
    this.version++;
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
      const active = this.flights.get(id);
      let from = before.cards.get(id);
      // A newly exposed card beneath the played pile stays in place.
      if (!from && previousZone === zone && zone === "played") continue;
      const destination = target ?? (zone === "deck" ? deck : zone === "played" ? played : null);
      if (!destination) {
        active?.stop();
        continue;
      }
      const to = this.destination(destination);
      if (active) {
        const sameDestination =
          previousZone === zone &&
          (target === active.node || (!target && active.node.hasAttribute("data-flight-ghost"))) &&
          Math.hypot(active.anchor.x - to.x, active.anchor.y - to.y) < 0.1 &&
          Math.abs(active.anchor.angle - to.angle) < 0.1;
        // Unrelated updates must not touch the animation objects, time, or easing.
        if (sameDestination) continue;
        if (previousZone === zone && target === active.node && from) {
          active.retarget(from, to);
          continue;
        }
        active.stop();
        // Capture resting styles after stopping only this affected card.
        to.shadow = getComputedStyle(
          destination.querySelector(".flight-front") ?? destination,
        ).boxShadow;
      }
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
      if (
        !changedZone &&
        !from.flying &&
        Math.hypot(from.x - to.x, from.y - to.y) < 1 &&
        Math.abs(from.angle - to.angle) < 0.1
      )
        continue;
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
      this.shuffle?.cancel();
      this.shuffle = deck.animate(
        [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-9deg)" },
          { transform: "rotate(9deg)" },
          { transform: "rotate(-5deg)" },
          { transform: "rotate(0deg)" },
        ],
        { duration: 1000, easing: "ease-in-out" },
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
    // Keep the real destination element throughout arrival: no duplicate face or
    // opacity handoff. Only cards leaving the DOM (e.g. returning to the deck)
    // need a temporary visual copy.
    const node = target ?? from.node;
    const origin = node.style.transformOrigin;
    if (!target) {
      node.classList.remove("drag-preview");
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
      node.dataset.flightGhost = "";
      node.style.cssText = `left:${to.x}px;top:${to.y}px;width:${from.width}px;height:${from.height}px;`;
      this.root().appendChild(node);
    }
    node.style.transformOrigin = from.origin;
    node.classList.add("card-flight");
    node.dataset.flightId = id;
    node.dataset.flightKind = kind;
    target?.setAttribute("data-in-flight", "");
    const endAngle = to.angle;
    const duration = kind === "draw" ? 1200 : kind === "arrange" ? 560 : 840;
    const flip =
      kind === "draw" || kind === "return-deck" || from.flip !== undefined
        ? this.flip(node, from.flip ?? 0, kind === "return-deck" ? 180 : 0, duration)
        : undefined;
    const arc = kind === "draw" ? 45 : kind === "arrange" ? 8 : 24;
    const animation = node.animate(
      [
        {
          transform: transform(from.x - to.x, from.y - to.y, from.angle),
          transformOrigin: from.origin,
        },
        {
          transform: transform(
            (from.x - to.x) / 2,
            (from.y - to.y) / 2 - arc,
            (from.angle + endAngle) / 2,
          ),
          offset: 0.5,
        },
        { transform: transform(0, 0, endAngle), transformOrigin: to.origin },
      ],
      { duration, easing: "cubic-bezier(.2,.7,.25,1)", fill: "both" },
    );
    const surfaces = [...node.querySelectorAll<HTMLElement>(".flight-front, .flight-back")];
    const shadows = surfaces.map((surface) => {
      const shadow = from.flying ? from.shadow : "0 0.5rem 1.5rem #0004";
      const animation = surface.animate(
        [{ boxShadow: shadow }, { boxShadow: shadow, offset: 0.65 }, { boxShadow: to.shadow }],
        { duration, easing: "ease-in-out", fill: "both" },
      );
      void animation.finished.catch(() => {});
      return animation;
    });
    const stop = () => {
      if (this.flights.get(id) !== flight) return;
      this.flights.delete(id);
      node.classList.remove("card-flight");
      node.removeAttribute("data-flight-id");
      node.removeAttribute("data-flight-kind");
      node.removeAttribute("data-in-flight");
      node.style.transformOrigin = origin;
      if (!target) node.remove();
      animation.cancel();
      flip?.cancel();
      for (const shadow of shadows) shadow.cancel();
    };
    const retarget = (current: Pose, destination: Pose) => {
      const effect = animation.effect as KeyframeEffect;
      const progress = Number(effect.getComputedTiming().progress ?? 0);
      if (progress >= 1) {
        stop();
        this.fly(id, current, destination, target, "arrange");
        return;
      }
      const frames = effect
        .getKeyframes()
        .filter((frame) => Math.abs(frame.computedOffset - progress) > 0.00001)
        .map((frame) => {
          const fraction = Math.max(0, (frame.computedOffset - progress) / (1 - progress));
          const matrix = new DOMMatrix(String(frame.transform));
          const angle = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
          return {
            offset: frame.computedOffset,
            transform: transform(
              matrix.e + (flight.anchor.x - destination.x) * (1 - fraction),
              matrix.f + (flight.anchor.y - destination.y) * (1 - fraction),
              angle + (destination.angle - flight.anchor.angle) * fraction,
            ),
            transformOrigin: String(frame.transformOrigin ?? destination.origin),
          };
        });
      frames.push({
        offset: progress,
        transform: transform(current.x - destination.x, current.y - destination.y, current.angle),
        transformOrigin: current.origin,
      });
      effect.setKeyframes(frames.sort((a, b) => a.offset - b.offset));
      flight.anchor = { x: destination.x, y: destination.y, angle: destination.angle };
    };
    const flight = { node, stop, retarget, anchor: { x: to.x, y: to.y, angle: to.angle } };
    this.flights.set(id, flight);
    void animation.finished.then(stop, stop);
  }

  private flip(node: HTMLElement, from: number, to: number, duration: number): Animation {
    const flipper = node.querySelector<HTMLElement>(".flight-flipper")!;
    const animation = flipper.animate(
      [{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }],
      { duration, easing: "ease-in-out", fill: "both" },
    );
    void animation.finished.catch(() => {});
    return animation;
  }
}
