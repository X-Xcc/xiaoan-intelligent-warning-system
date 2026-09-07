import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision';

export function containRect(width: number, height: number, videoWidth: number, videoHeight: number) {
  if (![width, height, videoWidth, videoHeight].every((value) => Number.isFinite(value) && value > 0)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const scale = Math.min(width / videoWidth, height / videoHeight);
  const fittedWidth = videoWidth * scale;
  const fittedHeight = videoHeight * scale;
  return { x: (width - fittedWidth) / 2, y: (height - fittedHeight) / 2, width: fittedWidth, height: fittedHeight };
}

export function visibleLandmark(point?: NormalizedLandmark): point is NormalizedLandmark {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && Number.isFinite(point.visibility) && point.visibility >= 0.5);
}

export function poseSummary(points: NormalizedLandmark[]) {
  const visible = points.filter(visibleLandmark).length;
  const visibility = visible ? Math.round(points.reduce((sum, point) =>
    sum + (Number.isFinite(point.visibility) ? Math.max(0, Math.min(1, point.visibility)) : 0), 0) / points.length * 100) : null;
  return { visible, visibility };
}

export function jointAngle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark, width: number, height: number) {
  const ax = (a.x - b.x) * width;
  const ay = (a.y - b.y) * height;
  const cx = (c.x - b.x) * width;
  const cy = (c.y - b.y) * height;
  const magnitude = Math.hypot(ax, ay) * Math.hypot(cx, cy);
  return magnitude > 0.00001 ? Math.acos(Math.max(-1, Math.min(1, (ax * cx + ay * cy) / magnitude))) * 180 / Math.PI : null;
}

export function drawPose(
  canvas: HTMLCanvasElement, points: NormalizedLandmark[], videoWidth: number, videoHeight: number,
  connections: typeof PoseLandmarker.POSE_CONNECTIONS, pixelRatio = 1,
) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(2, Math.max(1, pixelRatio));
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  if (!points.length) return;
  // Match object-fit: contain, including letterboxing and portrait videos.
  const fitted = containRect(bounds.width, bounds.height, videoWidth, videoHeight);
  if (!fitted.width || !fitted.height) return;
  const project = (point: NormalizedLandmark) => ({ x: fitted.x + point.x * fitted.width, y: fitted.y + point.y * fitted.height });
  context.save();
  context.beginPath();
  context.rect(fitted.x, fitted.y, fitted.width, fitted.height);
  context.clip();
  context.lineWidth = 2.5;
  context.lineCap = 'round';
  context.strokeStyle = '#58e6ff';
  for (const { start, end } of connections) {
    if (!visibleLandmark(points[start]) || !visibleLandmark(points[end])) continue;
    const from = project(points[start]);
    const to = project(points[end]);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.fillStyle = '#ffad18';
  for (const point of points.filter(visibleLandmark)) {
    const projected = project(point);
    context.beginPath();
    context.arc(projected.x, projected.y, 3.5, 0, Math.PI * 2);
    context.fill();
  }
  context.font = '600 14px "Microsoft YaHei", sans-serif';
  context.lineWidth = 3;
  context.strokeStyle = '#102023';
  context.fillStyle = '#ffffff';
  for (const [a, b, c] of [[11, 13, 15], [12, 14, 16]]) {
    if (![points[a], points[b], points[c]].every(visibleLandmark)) continue;
    const angle = jointAngle(points[a], points[b], points[c], videoWidth, videoHeight);
    if (angle === null) continue;
    const joint = project(points[b]);
    const label = `${Math.round(angle)}\u00b0`;
    const x = Math.max(fitted.x + 4, Math.min(joint.x + 8, fitted.x + fitted.width - 44));
    const y = Math.max(fitted.y + 18, joint.y - 10);
    context.strokeText(label, x, y);
    context.fillText(label, x, y);
  }
  context.restore();
}
