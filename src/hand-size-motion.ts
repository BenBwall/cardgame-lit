/** Resize the hand's reserved space without moving its cards' landing positions. */
export class HandSizeMotion {
  private observer?: ResizeObserver;
  private preference?: MediaQueryList;
  private animation?: Animation;
  private target?: number;

  constructor(private readonly root: () => DocumentFragment | HTMLElement) {}

  connect(): void {
    this.disconnect();
    this.preference = matchMedia("(prefers-reduced-motion: reduce)");
    this.preference.addEventListener("change", this.finish);
    const content = this.root().querySelector<HTMLElement>(".hand-content");
    if (!content) return;
    this.target = content.getBoundingClientRect().height;
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(content);
  }

  disconnect(): void {
    this.observer?.disconnect();
    this.preference?.removeEventListener("change", this.finish);
    this.finish();
    this.target = undefined;
  }

  private finish = (): void => {
    this.animation?.cancel();
    this.animation = undefined;
  };

  private resize = (): void => {
    const region = this.root().querySelector<HTMLElement>(".hand-region");
    const content = this.root().querySelector<HTMLElement>(".hand-content");
    if (!region?.isConnected || !content) return;
    const height = content.getBoundingClientRect().height;
    if (this.target !== undefined && Math.abs(height - this.target) < 0.1) return;
    // Natural content already has its new size. An active animation supplies the
    // visible size; otherwise start from the last measured natural height.
    const from = this.animation ? region.getBoundingClientRect().height : this.target;
    this.target = height;
    this.finish();
    if (from === undefined || this.preference?.matches || Math.abs(height - from) < 0.1) return;
    const animation = region.animate([{ height: `${from}px` }, { height: `${height}px` }], {
      duration: 560,
      easing: "cubic-bezier(.2,.7,.25,1)",
      fill: "both",
    });
    this.animation = animation;
    void animation.finished.then(
      () => {
        if (this.animation === animation) this.finish();
      },
      () => {},
    );
  };
}
