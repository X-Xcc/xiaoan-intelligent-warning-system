export interface AnnotationRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  occlusion: 'partial' | 'visible';
  truncation: boolean;
}

export interface AnnotationHistoryEntry {
  rects: AnnotationRect[];
}

export interface AnnotationImageEntry {
  file: File;
  url: string;
  name: string;
  rects: AnnotationRect[];
}

export const ANNOTATION_LABELS = [
  { name: '打架', color: '#ef4444' },
  { name: '跌倒', color: '#f97316' },
  { name: '聚集', color: '#3b82f6' },
  { name: '离岗', color: '#22c55e' },
];

let annotationId = 0;

export function resetAnnotationIds() {
  annotationId = 0;
}

export function createAnnotationId() {
  annotationId += 1;
  return `r${annotationId}`;
}

export function cloneAnnotationRects(rects: AnnotationRect[]) {
  return JSON.parse(JSON.stringify(rects)) as AnnotationRect[];
}

export function filterAnnotationImageFiles(files: File[]) {
  return files.filter(file => /\.(jpg|jpeg|png)$/i.test(file.name));
}

export function createAnnotationImageEntries(files: File[]) {
  return files.map(file => ({
    file,
    url: URL.createObjectURL(file),
    name: file.name,
    rects: [],
  } satisfies AnnotationImageEntry));
}

export function syncImageRects(images: AnnotationImageEntry[], index: number, rects: AnnotationRect[]) {
  return images.map((image, currentIndex) => currentIndex === index ? { ...image, rects } : image);
}

export function buildAnnotationRect(drawStart: { x: number; y: number }, drawCur: { x: number; y: number }) {
  const x = Math.min(drawStart.x, drawCur.x);
  const y = Math.min(drawStart.y, drawCur.y);
  const w = Math.abs(drawCur.x - drawStart.x);
  const h = Math.abs(drawCur.y - drawStart.y);
  return { x, y, w, h };
}

export function isValidAnnotationRectSize(rect: { w: number; h: number }) {
  return rect.w > 5 && rect.h > 5;
}

export function createDefaultAnnotationRect(drawStart: { x: number; y: number }, drawCur: { x: number; y: number }): AnnotationRect {
  const { x, y, w, h } = buildAnnotationRect(drawStart, drawCur);
  return {
    id: createAnnotationId(),
    x,
    y,
    w,
    h,
    label: '打架',
    occlusion: 'visible',
    truncation: false,
  };
}

export function moveAnnotationRect(rects: AnnotationRect[], dragOffset: { id: string; ox: number; oy: number }, point: { x: number; y: number }) {
  return rects.map(rect => rect.id === dragOffset.id ? { ...rect, x: point.x - dragOffset.ox, y: point.y - dragOffset.oy } : rect);
}

export function deleteAnnotationRect(rects: AnnotationRect[], selectedId: string | null) {
  if (!selectedId) return rects;
  return rects.filter(rect => rect.id !== selectedId);
}

export function updateAnnotationRect(rects: AnnotationRect[], selectedId: string | null, patch: Partial<AnnotationRect>) {
  if (!selectedId) return rects;
  return rects.map(rect => rect.id === selectedId ? { ...rect, ...patch } : rect);
}

export function getGroupedAnnotationRects(rects: AnnotationRect[]) {
  return ANNOTATION_LABELS.map(label => ({
    ...label,
    items: rects.filter(rect => rect.label === label.name),
  }));
}

export function clampAnnotationZoom(zoom: number) {
  return Math.max(25, Math.min(400, zoom));
}

export function stepAnnotationZoom(zoom: number, delta: number) {
  return clampAnnotationZoom(zoom + delta);
}
