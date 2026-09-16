/** Unrotated coordinates plus the visible rotation, without rounding to whole pixels. */
export function cardGeometry(node: HTMLElement) {
  const style = getComputedStyle(node);
  const matrix = new DOMMatrix(style.transform);
  const rect = node.getBoundingClientRect();
  const width = parseFloat(style.width);
  const height = parseFloat(style.height);
  const [ox, oy] = style.transformOrigin.split(" ").map(parseFloat);
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
  const x =
    rect.left -
    Math.min(...corners.map(([x, y]) => matrix.a * (x - ox) + matrix.c * (y - oy) + ox));
  const y =
    rect.top - Math.min(...corners.map(([x, y]) => matrix.b * (x - ox) + matrix.d * (y - oy) + oy));
  return {
    x,
    y,
    width,
    height,
    angle: (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI,
    origin: style.transformOrigin,
    ox,
    oy,
    matrix,
  };
}
