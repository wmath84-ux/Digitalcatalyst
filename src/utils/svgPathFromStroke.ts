/**
 * Converts an array of stroke outline points (from perfect-freehand)
 * into an SVG path data string.
 * 
 * @param points - Array of [x, y] coordinate pairs
 * @returns SVG path data string
 */
export function getSvgPathFromStroke(points: number[][]): string {
  if (!points.length) {
    return '';
  }

  let path = '';
  let prev = points[0];
  let movedTo = false;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const isLast = i === points.length - 1;

    if (!movedTo) {
      path += `M ${prev[0].toFixed(2)} ${prev[1].toFixed(2)}`;
      movedTo = true;
    }

    if (!isLast) {
      const next = points[i + 1];
      const midPoint = [
        (point[0] + next[0]) / 2,
        (point[1] + next[1]) / 2,
      ];
      path += ` Q ${point[0].toFixed(2)} ${point[1].toFixed(2)} ${midPoint[0].toFixed(2)} ${midPoint[1].toFixed(2)}`;
      prev = midPoint;
    } else {
      path += ` L ${point[0].toFixed(2)} ${point[1].toFixed(2)}`;
    }
  }

  path += ' Z';
  return path;
}
