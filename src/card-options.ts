import { ArrowDown, ArrowUp, ArrowRight, ArrowLeft } from "@lucide/icons";

export type FlipAxis = "X" | "Y";
export type DrawFlip = Readonly<{ axis: FlipAxis; startAngle: 180 | -180 }>;
export type HandLayout = "fan" | "grid";

export const flipOptions = [
  { label: "Top to bottom", icon: ArrowDown, axis: "X", startAngle: 180 },
  { label: "Bottom to top", icon: ArrowUp, axis: "X", startAngle: -180 },
  { label: "Left to right", icon: ArrowRight, axis: "Y", startAngle: -180 },
  { label: "Right to left", icon: ArrowLeft, axis: "Y", startAngle: 180 },
] as const;
