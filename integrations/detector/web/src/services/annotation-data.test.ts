import { describe, expect, it } from 'vitest';
import {
  buildAnnotationRect,
  clampAnnotationZoom,
  cloneAnnotationRects,
  createAnnotationImageEntries,
  createDefaultAnnotationRect,
  deleteAnnotationRect,
  filterAnnotationImageFiles,
  getGroupedAnnotationRects,
  isValidAnnotationRectSize,
  moveAnnotationRect,
  resetAnnotationIds,
  stepAnnotationZoom,
  syncImageRects,
  updateAnnotationRect,
} from './annotation-data';

describe('annotation data helpers', () => {
  it('filters image files and creates entries', () => {
    const files = [
      { name: 'a.jpg' },
      { name: 'b.png' },
      { name: 'c.txt' },
    ] as File[];
    expect(filterAnnotationImageFiles(files).map(file => file.name)).toEqual(['a.jpg', 'b.png']);
  });

  it('builds, validates and clones rects', () => {
    resetAnnotationIds();
    expect(buildAnnotationRect({ x: 10, y: 20 }, { x: 30, y: 50 })).toEqual({ x: 10, y: 20, w: 20, h: 30 });
    expect(isValidAnnotationRectSize({ w: 6, h: 7 })).toBe(true);
    const rect = createDefaultAnnotationRect({ x: 10, y: 20 }, { x: 30, y: 50 });
    expect(rect.id).toBe('r1');
    const cloned = cloneAnnotationRects([rect]);
    expect(cloned).toEqual([rect]);
    expect(cloned).not.toBe([rect]);
  });

  it('moves, updates and deletes rects', () => {
    const rects = [{ id: 'r1', x: 10, y: 20, w: 30, h: 40, label: '打架', occlusion: 'visible', truncation: false }] as any;
    expect(moveAnnotationRect(rects, { id: 'r1', ox: 2, oy: 3 }, { x: 20, y: 30 })[0]).toMatchObject({ x: 18, y: 27 });
    expect(updateAnnotationRect(rects, 'r1', { label: '跌倒' })[0].label).toBe('跌倒');
    expect(deleteAnnotationRect(rects, 'r1')).toEqual([]);
  });

  it('groups rects, syncs image rects and handles zoom', () => {
    const rects = [
      { id: 'r1', x: 0, y: 0, w: 10, h: 10, label: '打架', occlusion: 'visible', truncation: false },
      { id: 'r2', x: 0, y: 0, w: 10, h: 10, label: '聚集', occlusion: 'visible', truncation: false },
    ] as any;
    expect(getGroupedAnnotationRects(rects).find(group => group.name === '打架')?.items).toHaveLength(1);
    const images = [{ name: 'a.jpg', rects: [] }, { name: 'b.jpg', rects: [] }] as any;
    expect(syncImageRects(images, 1, rects)[1].rects).toEqual(rects);
    expect(clampAnnotationZoom(10)).toBe(25);
    expect(clampAnnotationZoom(450)).toBe(400);
    expect(stepAnnotationZoom(100, 25)).toBe(125);
  });

  it('creates image entries with urls', () => {
    const original = URL.createObjectURL;
    URL.createObjectURL = ((file: File) => `blob:${file.name}`) as any;
    const entries = createAnnotationImageEntries([{ name: 'sample.jpg' }] as File[]);
    expect(entries[0]).toMatchObject({ name: 'sample.jpg', url: 'blob:sample.jpg', rects: [] });
    URL.createObjectURL = original;
  });
});
