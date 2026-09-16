/** Keep enough of each card exposed to select it, using more fans for large hands. */
export function fanLayout(count: number, width: number, scale = 1) {
  const cardWidth = 72 * scale;
  const rowHeight = 168 * scale;
  const capacity = Math.max(
    2,
    Math.min(12, Math.floor((width - cardWidth * 1.6) / (24 * scale)) + 1),
  );
  const rows = Math.max(1, Math.ceil(count / capacity));
  const columns = Math.ceil(count / rows);
  return {
    height: rows * rowHeight,
    slots: Array.from({ length: count }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const size = Math.min(columns, count - row * columns);
      const position = size > 1 ? (column / (size - 1)) * 2 - 1 : 0;
      const step =
        size > 1 ? Math.max(0, Math.min(38 * scale, (width - cardWidth * 1.6) / (size - 1))) : 0;
      return {
        x: (width - cardWidth - step * (size - 1)) / 2 + column * step,
        y: row * rowHeight + 20 * scale + position ** 2 * Math.min(28, (size - 1) * 4) * scale,
        angle: position * Math.min(27, (size - 1) * 4),
      };
    }),
  };
}
