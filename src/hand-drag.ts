import { DragMotion } from "./drag-motion.js";
import { cardGeometry } from "./card-geometry.js";

const DRAG_DISTANCE = 6;

type Drag = {
  pointerId: number;
  source: HTMLButtonElement;
  hand?: HTMLElement;
  root: ParentNode;
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
  zone?: HTMLElement;
  destination?: number;
  dropZone?: string;
};

/** Pointer capture keeps mouse, pen, and touch card drags within their component. */
export class HandDrag {
  private drag?: Drag;
  private suppressClick = false;

  constructor(
    private readonly drop: (
      id: string,
      destination: number | undefined,
      preview: HTMLElement,
      dropZone: string | undefined,
    ) => void,
    private readonly acceptsDropZone: (id: string, dropZone: string) => boolean = () => false,
  ) {}

  get active(): boolean {
    return !!this.drag;
  }

  pointerDown = (event: PointerEvent): void => {
    if (this.drag || !event.isPrimary || event.button !== 0) return;
    this.suppressClick = false;
    const source = (event.target as Element).closest<HTMLButtonElement>(
      "button[data-card-id], button[data-drag-id]",
    );
    const current = event.currentTarget as HTMLElement;
    if (!source || !current.contains(source)) return;
    const hand =
      source.closest<HTMLElement>("[data-drag-hand]") ??
      (current.matches(".hand") ? current : undefined);
    const pose = cardGeometry(source);
    const dx = event.clientX - pose.x - pose.ox;
    const dy = event.clientY - pose.y - pose.oy;
    const offsetX = pose.matrix.a * dx + pose.matrix.b * dy + pose.ox;
    const offsetY = pose.matrix.c * dx + pose.matrix.d * dy + pose.oy;
    const x = event.clientX - offsetX;
    const y = event.clientY - offsetY;
    const drag: Drag = {
      pointerId: event.pointerId,
      source,
      hand,
      root: source.getRootNode() as ParentNode,
      startX: event.clientX,
      startY: event.clientY,
      offsetX,
      offsetY,
      targetX: x,
      targetY: y,
      motion: new DragMotion(
        x,
        y,
        (offsetX / pose.width - 0.5) * 2,
        (offsetY / pose.height - 0.5) * 2,
      ),
    };
    drag.motion.angle = pose.angle;
    this.drag = drag;
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
      drag.hand?.setAttribute("data-dragging", "");
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
    drag.zone?.removeAttribute("data-drop-active");
    drag.marker = undefined;
    drag.zone = undefined;
    drag.destination = undefined;
    drag.dropZone = undefined;
    if (drag.hand) {
      const bounds = drag.hand.getBoundingClientRect();
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
        const cards = [
          ...drag.hand.querySelectorAll<HTMLButtonElement>("button[data-card-id]"),
        ].filter((card) => card !== drag.source);
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
        return;
      }
    }
    const id = drag.source.dataset.dragId ?? drag.source.dataset.cardId;
    if (!id) return;
    const zones = [...drag.root.querySelectorAll<HTMLElement>("[data-drop-zone]")].flatMap(
      (zone) => {
        const name = zone.dataset.dropZone;
        if (!name || zone === drag.source || zone.contains(drag.source)) return [];
        const rect = zone.getBoundingClientRect();
        return x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom &&
          this.acceptsDropZone(id, name)
          ? [
              {
                zone,
                distance: Math.hypot(
                  x - (rect.left + rect.width / 2),
                  y - (rect.top + rect.height / 2),
                ),
              },
            ]
          : [];
      },
    );
    const zone = zones.sort((a, b) => a.distance - b.distance)[0]?.zone;
    if (!zone?.dataset.dropZone) return;
    drag.zone = zone;
    drag.dropZone = zone.dataset.dropZone;
    zone.setAttribute("data-drop-active", "");
  }

  pointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.preview) this.position(event.clientX, event.clientY);
    const destination = drag.destination;
    const dropZone = drag.dropZone;
    const id = drag.source.dataset.dragId ?? drag.source.dataset.cardId;
    if (drag.preview && id) {
      this.release(false, destination, dropZone);
      return;
    }
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
  };

  pointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.drag?.pointerId) this.cancel();
  };

  cancel = (): void => {
    this.release(true);
  };

  dispose = (): void => {
    this.clear(true);
  };

  private release(releaseCapture: boolean, destination?: number, dropZone?: string): void {
    const drag = this.drag;
    if (!drag) return;
    const preview = drag.preview;
    const id = drag.source.dataset.dragId ?? drag.source.dataset.cardId;
    drag.preview = undefined;
    this.clear(releaseCapture);
    if (preview && id) this.drop(id, destination, preview, dropZone);
    else preview?.remove();
  }

  private clear(releaseCapture: boolean): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = undefined;
    if (drag.frame !== undefined) cancelAnimationFrame(drag.frame);
    drag.preview?.remove();
    drag.marker?.removeAttribute("data-drop-side");
    drag.zone?.removeAttribute("data-drop-active");
    drag.source.removeAttribute("data-drag-source");
    drag.hand?.removeAttribute("data-dragging");
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
