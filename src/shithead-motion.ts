import { cardId, type Card } from "./cards.js";
import { cardGeometry } from "./card-geometry.js";
import type { ShitheadState } from "./shithead-state.js";

type Pose = {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  node: HTMLElement;
  hidden: boolean;
};
type Snapshot = { cards: Map<string, Pose>; zones: Map<string, Pose> };
const positions = (state: ShitheadState) => {
  const result = new Map<string, string>();
  for (const zone of ["stock", "pile", "burned"] as const)
    for (const card of state[zone]) result.set(cardId(card), zone);
  state.players.forEach((player, index) => {
    for (const zone of ["hand", "faceUp", "faceDown"] as const)
      for (const card of player[zone]) result.set(cardId(card), `${index}-${zone}`);
  });
  return result;
};
const pose = (node: HTMLElement): Pose => {
  const geometry = cardGeometry(node);
  const dx = geometry.ox - geometry.width / 2,
    dy = geometry.oy - geometry.height / 2;
  return {
    ...geometry,
    x: geometry.x + dx - geometry.matrix.a * dx - geometry.matrix.c * dy,
    y: geometry.y + dy - geometry.matrix.b * dx - geometry.matrix.d * dy,
    node: node.cloneNode(true) as HTMLElement,
    hidden: node.dataset.concealed === "true",
  };
};
const transform = (p: Pose) => `translate3d(${p.x}px,${p.y}px,0) rotate(${p.angle}deg)`;

/** Board flights use opaque keys so hidden card values never become DOM attributes. */
export class ShitheadMotion {
  private keys = new Map<string, string>();
  private cleanups = new Set<() => void>();
  private flights = new Map<string, HTMLElement>();
  private generation = 0;
  private preference?: MediaQueryList;
  constructor(
    private readonly root: () => ShadowRoot,
    private readonly face: (card: Card) => HTMLElement,
    private readonly drawFlip = (): { axis: "X" | "Y"; startAngle: number } => ({
      axis: "X",
      startAngle: 180,
    }),
    private readonly backStyle: (card: Card) => string = () => "",
  ) {}
  key(card: Card): string {
    const id = cardId(card);
    if (!this.keys.has(id)) this.keys.set(id, crypto.randomUUID());
    return this.keys.get(id)!;
  }
  connect(): void {
    this.preference = matchMedia("(prefers-reduced-motion: reduce)");
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
    this.generation++;
    for (const cleanup of [...this.cleanups]) cleanup();
    this.flights.clear();
  };
  capture(preview?: HTMLElement): Snapshot {
    const cards = new Map<string, Pose>(),
      zones = new Map<string, Pose>();
    for (const node of this.root().querySelectorAll<HTMLElement>("[data-board-key]"))
      cards.set(node.dataset.boardKey!, pose(node));
    for (const node of this.root().querySelectorAll<HTMLElement>("[data-board-zone]"))
      zones.set(node.dataset.boardZone!, pose(node));
    for (const [key, node] of this.flights) cards.set(key, pose(node));
    if (preview?.dataset.boardKey) cards.set(preview.dataset.boardKey, pose(preview));
    preview?.remove();
    this.finish();
    return { cards, zones };
  }
  async animate(before: Snapshot, old: ShitheadState, next: ShitheadState): Promise<void> {
    if (this.preference?.matches || !this.root().host.isConnected) return;
    const generation = this.generation;
    const after = this.captureTargets();
    const oldPositions = positions(old),
      newPositions = positions(next);
    const cards = [
      ...next.stock,
      ...next.pile,
      ...next.burned,
      ...next.players.flatMap((p) => [...p.hand, ...p.faceUp, ...p.faceDown]),
    ];
    const burns = next.burned.length > old.burned.length;
    const blindFailure =
      !burns &&
      !next.pile.length &&
      next.players[old.turn].faceDown.length < old.players[old.turn].faceDown.length &&
      next.players[old.turn].hand.length > old.players[old.turn].hand.length;
    const jobs: Promise<void>[] = [];
    let drawIndex = 0,
      burnIndex = 0;
    for (const card of cards) {
      const id = cardId(card),
        key = this.key(card),
        fromZone = oldPositions.get(id),
        toZone = newPositions.get(id)!;
      const target = after.cards.get(key);
      const from = before.cards.get(key) ?? before.zones.get(fromZone!);
      const to = target?.pose ?? after.zones.get(toZone);
      if (!from || !to) continue;
      const changed = fromZone !== toZone;
      if (
        !changed &&
        (!target ||
          (Math.hypot(from.x - to.x, from.y - to.y) < 0.75 &&
            Math.abs(from.angle - to.angle) < 0.1))
      )
        continue;
      if (toZone === "stock" || (toZone === "burned" && fromZone === "burned")) continue;
      const faceWasKnown =
        fromZone === "pile" || fromZone?.endsWith("faceUp") || fromZone === "0-hand";
      const faceIsKnown =
        toZone === "pile" ||
        toZone?.endsWith("faceUp") ||
        toZone === "0-hand" ||
        toZone === "burned";
      // Only public faces enter a flight. Hidden-to-hidden moves keep a plain back.
      const node =
        faceWasKnown || faceIsKnown ? this.face(card) : (from.node.cloneNode(true) as HTMLElement);
      if (!faceWasKnown && !faceIsKnown) node.style.cssText += this.backStyle(card);
      const delay = fromZone === "stock" ? 360 + drawIndex++ * 95 : 0;
      if (burns && toZone === "burned") {
        const middle = after.zones.get("pile")!;
        jobs.push(
          this.fly(
            key,
            node,
            from,
            middle,
            faceWasKnown ? 0 : 180,
            0,
            fromZone === "pile" ? 0 : 380,
            0,
            undefined,
            generation,
          ).then(async () => {
            if (generation !== this.generation) return;
            await this.fly(
              key,
              this.face(card),
              middle,
              to,
              0,
              0,
              450,
              (fromZone === "pile" ? 480 : 100) + burnIndex++ * 18,
              target?.node,
              generation,
              true,
            );
          }),
        );
      } else if (blindFailure && changed && toZone === `${old.turn}-hand`) {
        const middle = after.zones.get("pile")!;
        target?.node.setAttribute("data-board-arriving", "");
        const restore = () => {
          target?.node.removeAttribute("data-board-arriving");
          this.cleanups.delete(restore);
        };
        this.cleanups.add(restore);
        jobs.push(
          this.fly(
            key,
            node,
            from,
            middle,
            faceWasKnown ? 0 : 180,
            0,
            fromZone === "pile" ? 0 : 420,
            0,
            undefined,
            generation,
          ).then(async () => {
            if (generation === this.generation)
              await this.fly(
                key,
                this.face(card),
                middle,
                to,
                0,
                faceIsKnown ? 0 : 180,
                500,
                fromZone === "pile" ? 620 : 200,
                target?.node,
                generation,
              );
            restore();
          }),
        );
      } else {
        const flip =
          fromZone === "stock" ? this.drawFlip() : { axis: "Y" as const, startAngle: 180 };
        jobs.push(
          this.fly(
            key,
            node,
            from,
            to,
            faceWasKnown ? 0 : flip.startAngle,
            faceIsKnown ? 0 : 180,
            changed ? 520 : 300,
            delay,
            target?.node,
            generation,
            false,
            flip.axis,
          ),
        );
      }
    }
    await Promise.all(jobs);
  }
  private captureTargets() {
    const cards = new Map<string, { pose: Pose; node: HTMLElement }>(),
      zones = new Map<string, Pose>();
    for (const node of this.root().querySelectorAll<HTMLElement>("[data-board-key]"))
      cards.set(node.dataset.boardKey!, { pose: pose(node), node });
    for (const node of this.root().querySelectorAll<HTMLElement>("[data-board-zone]"))
      zones.set(node.dataset.boardZone!, pose(node));
    return { cards, zones };
  }
  private fly(
    key: string,
    node: HTMLElement,
    from: Pose,
    to: Pose,
    flipFrom: number,
    flipTo: number,
    duration: number,
    delay: number,
    target: HTMLElement | undefined,
    generation: number,
    burn = false,
    axis: "X" | "Y" = "Y",
  ): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    node.className = `card ${node.querySelector(".flight-flipper") ? "card-shell" : "back"} board-flight`;
    node.removeAttribute("data-board-key");
    node.removeAttribute("data-card-id");
    node.removeAttribute("aria-label");
    node.setAttribute("aria-hidden", "true");
    node.inert = true;
    const randomBack = node.style.getPropertyValue("--card-random-back-image");
    node.style.cssText = `position:fixed;left:0;top:0;width:${from.width}px;height:${from.height}px;z-index:500;pointer-events:none;transform-origin:center;transform:${transform(from)};`;
    if (randomBack) node.style.setProperty("--card-random-back-image", randomBack);
    node.dataset.flightKind = burn ? "burn" : flipFrom !== flipTo ? "flip" : "move";
    this.root().append(node);
    this.flights.set(key, node);
    target?.setAttribute("data-board-arriving", "");
    const animation = node.animate(
      [
        {
          transform: transform(from),
          width: `${from.width}px`,
          height: `${from.height}px`,
          opacity: 1,
        },
        {
          transform: transform(to),
          width: `${to.width}px`,
          height: `${to.height}px`,
          opacity: burn ? 0.25 : 1,
        },
      ],
      { duration, delay, easing: "cubic-bezier(.22,.7,.25,1)", fill: "both" },
    );
    const flipper = node.querySelector<HTMLElement>(".flight-flipper");
    if (flipper) flipper.dataset.flipAxis = axis;
    const flip = flipper?.animate(
      [
        { transform: `rotate${axis}(${flipFrom}deg)` },
        { transform: `rotate${axis}(${flipTo}deg)` },
      ],
      { duration, delay, easing: "ease-in-out", fill: "both" },
    );
    return new Promise((resolve) => {
      const cleanup = () => {
        animation.cancel();
        flip?.cancel();
        node.remove();
        target?.removeAttribute("data-board-arriving");
        if (this.flights.get(key) === node) this.flights.delete(key);
        this.cleanups.delete(cleanup);
        resolve();
      };
      this.cleanups.add(cleanup);
      void animation.finished.then(cleanup, cleanup);
    });
  }
}
