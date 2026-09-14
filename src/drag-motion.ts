const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/** A light spring follows the pointer; horizontal lag makes the card lean. */
export class DragMotion {
  angle = 0;
  private velocityX = 0;
  private velocityY = 0;
  private angularVelocity = 0;

  constructor(
    public x: number,
    public y: number,
  ) {}

  step(targetX: number, targetY: number, elapsed: number, reducedMotion = false): void {
    if (reducedMotion) {
      this.x = targetX;
      this.y = targetY;
      this.angle = this.velocityX = this.velocityY = this.angularVelocity = 0;
      return;
    }
    // Keep fast gestures close to the pointer, and resume safely after a stalled frame.
    this.x = targetX - clamp(targetX - this.x, 32);
    this.y = targetY - clamp(targetY - this.y, 32);
    let remaining = Math.min(Math.max(elapsed, 0), 0.05);
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 120);
      const lean = clamp((targetX - this.x) * 0.65, 18);
      this.velocityX += ((targetX - this.x) * 650 - this.velocityX * 40) * dt;
      this.velocityY += ((targetY - this.y) * 650 - this.velocityY * 40) * dt;
      this.angularVelocity += ((lean - this.angle) * 220 - this.angularVelocity * 22) * dt;
      this.x += this.velocityX * dt;
      this.y += this.velocityY * dt;
      this.angle += this.angularVelocity * dt;
      remaining -= dt;
    }
  }
}
