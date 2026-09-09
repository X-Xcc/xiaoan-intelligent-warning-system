import { saveAnnotation, uploadAnnotationImage } from './dataService';
import type { AnnotationRect } from './annotation-data';

export async function submitAnnotation(imageName: string, imageWidth: number, imageHeight: number, rects: AnnotationRect[]) {
  return saveAnnotation(imageName, {
    imageFilename: imageName,
    imageWidth,
    imageHeight,
    annotator: 'admin',
    annotatedAt: new Date().toISOString(),
    status: 'reviewed',
    labels: [...new Set(rects.map(rect => rect.label))],
    bboxes: rects.map(rect => ({
      id: rect.id,
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      labels: [rect.label],
      confidence: 1,
      source: 'manual',
    })),
  });
}

export async function uploadAnnotationAsset(file: File) {
  return uploadAnnotationImage(file);
}
