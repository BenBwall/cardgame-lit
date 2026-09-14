import { DragMotion } from "./drag-motion.js";

const DRAG_DISTANCE = 6;

type Drag = {
  pointerId: number;
  source: HTMLButtonElement;
  hand: HTMLElement;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  targetX: number;
  targetY: number;
  motion: DragMotion;
  frame?: number;
  lastFrame?: number;
  preview?: HTMLElement;
  marker?: HTMLElement;
  destination?: number;
};

/** Pointer capture keeps mouse, pen, and touch drags local to this hand. */
export class HandDrag {
  private drag?: Drag;
  private suppressClick = false;

  constructor(private readonly drop: (id: string, destination: number) => void) {}

  pointerDown = (event: PointerEvent): void => {
    if (this.drag || !event.isPrimary || event.button !== 0) return;
    this.suppressClick = false;
    const source = (event.target as Element).closest<HTMLButtonElement>("button[data-card-id]");
    const hand = event.currentTarget as HTMLElement;
    if (!source || !hand.contains(source)) return;
    const rect = source.getBoundingClientRect();
    this.drag = {
      pointerId: event.pointerId,
      source,
      hand,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      targetX: rect.left,
      targetY: rect.top,
      motion: new DragMotion(rect.left, rect.top),
    };
    source.setPointerCapture(event.pointerId);
    window.addEventListener("blur", this.cancel);
  };

  pointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.preview) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_DISTANCE)
        return;
      this.suppressClick = true;
      const preview = drag.source.cloneNode(true) as HTMLElement;
      preview.classList.add("drag-preview");
      preview.removeAttribute("data-card-id");
      preview.removeAttribute("aria-describedby");
      preview.setAttribute("aria-hidden", "true");
      preview.inert = true;
      preview.tabIndex = -1;
      preview.style.transformOrigin = `${drag.offsetX}px ${drag.offsetY}px`;
      drag.source.getRootNode().appendChild(preview);
      drag.preview = preview;
      drag.source.setAttribute("data-drag-source", "");
      drag.hand.setAttribute("data-dragging", "");
    }
    event.preventDefault();
    drag.targetX = event.clientX - drag.offsetX;
    drag.targetY = event.clientY - drag.offsetY;
    if (drag.frame === undefined) this.animate(performance.now());
    this.position(event.clientX, event.clientY);
  };

  private animate = (time: number): void => {
    const drag = this.drag;
    if (!drag?.preview) return;
    const elapsed = drag.lastFrame === undefined ? 0 : (time - drag.lastFrame) / 1000;
    drag.lastFrame = time;
    drag.motion.step(
      drag.targetX,
      drag.targetY,
      elapsed,
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    const { x, y, angle } = drag.motion;
    drag.preview.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;
    drag.frame = requestAnimationFrame(this.animate);
  };

  private position(x: number, y: number): void {
    const drag = this.drag;
    if (!drag) return;
    drag.marker?.removeAttribute("data-drop-side");
    drag.marker = undefined;
    drag.destination = undefined;
    const bounds = drag.hand.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return;
    const cards = [...drag.hand.querySelectorAll<HTMLButtonElement>("button[data-card-id]")].filter(
      (card) => card !== drag.source,
    );
    let nearest:
      | { card: HTMLButtonElement; index: number; distance: number; after: boolean }
      | undefined;
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const distance = Math.hypot(x - center, y - (rect.top + rect.height / 2));
      if (!nearest || distance < nearest.distance)
        nearest = { card, index, distance, after: x >= center };
    });
    if (!nearest) return;
    drag.marker = nearest.card;
    drag.destination = nearest.index + Number(nearest.after);
    nearest.card.setAttribute("data-drop-side", nearest.after ? "after" : "before");
  }

  pointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.preview) this.position(event.clientX, event.clientY);
    const destination = drag.destination;
    const id = drag.source.dataset.cardId;
    const tapped =
      !drag.preview &&
      event.pointerType === "touch" &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_DISTANCE;
    // Let the browser release capture after pointerup so touch taps keep their click target.
    this.clear(false);
    if (tapped) {
      // Touch browsers can suppress compatibility clicks immediately after a drag.
      // Activate a tap once and swallow any later native click for this gesture.
      this.suppressClick = true;
      drag.source.click();
    }
    if (id && destination !== undefined) this.drop(id, destination);
  };

  pointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.drag?.pointerId) this.cancel();
  };

  cancel = (): void => {
    this.clear(true);
  };

  private clear(releaseCapture: boolean): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = undefined;
    if (drag.frame !== undefined) cancelAnimationFrame(drag.frame);
    drag.preview?.remove();
    drag.marker?.removeAttribute("data-drop-side");
    drag.source.removeAttribute("data-drag-source");
    drag.hand.removeAttribute("data-dragging");
    if (releaseCapture && drag.source.hasPointerCapture(drag.pointerId))
      drag.source.releasePointerCapture(drag.pointerId);
    window.removeEventListener("blur", this.cancel);
  }

  consumeClick(event: MouseEvent): boolean {
    // Keyboard activation has detail=0. The next real pointerdown starts a fresh click.
    if (!this.suppressClick || event.detail === 0) return false;
    this.suppressClick = false;
    event.preventDefault();
    return true;
  }
}
