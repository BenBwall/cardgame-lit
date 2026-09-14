import { expect, test } from "bun:test";
import { DragMotion } from "../src/drag-motion.js";

test("lean follows horizontal direction symmetrically, then reverses with inertia", () => {
  const right = new DragMotion(0, 0);
  const left = new DragMotion(0, 0);
  for (let frame = 1; frame <= 20; frame++) {
    right.step(frame * 5, 0, 1 / 60);
    left.step(-frame * 5, 0, 1 / 60);
  }
  expect(right.angle).toBeGreaterThan(5);
  expect(left.angle).toBeCloseTo(-right.angle);
  const previous = right.angle;
  right.step(95, 0, 1 / 60);
  expect(right.angle).toBeGreaterThan(0); // Momentum survives the direction change.
  expect(Math.abs(right.angle - previous)).toBeLessThan(3);
  for (let frame = 2; frame <= 20; frame++) right.step(100 - frame * 5, 0, 1 / 60);
  expect(right.angle).toBeLessThan(-5);
});

test("a stopped card settles upright and vertical movement does not create sideways lean", () => {
  const motion = new DragMotion(0, 0);
  for (let frame = 1; frame <= 20; frame++) motion.step(frame * 5, frame * 3, 1 / 60);
  for (let frame = 0; frame < 120; frame++) motion.step(100, 60, 1 / 60);
  expect(motion.x).toBeCloseTo(100, 3);
  expect(motion.y).toBeCloseTo(60, 3);
  expect(motion.angle).toBeCloseTo(0, 3);
  const vertical = new DragMotion(0, 0);
  for (let frame = 1; frame <= 20; frame++) vertical.step(0, frame * 5, 1 / 60);
  expect(vertical.angle).toBe(0);
});

test("motion remains stable after delayed frames and reduced motion follows directly", () => {
  const motion = new DragMotion(0, 0);
  motion.step(1000, 1000, 5);
  expect(Math.abs(motion.x - 1000)).toBeLessThan(32);
  expect(Math.abs(motion.angle)).toBeLessThan(20);
  motion.step(300, 200, 1 / 60, true);
  expect([motion.x, motion.y, motion.angle]).toEqual([300, 200, 0]);
  motion.step(300, 200, 1 / 60);
  expect([motion.x, motion.y, motion.angle]).toEqual([300, 200, 0]);
});
