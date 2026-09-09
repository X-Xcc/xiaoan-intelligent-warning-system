import { describe, expect, it, vi } from 'vitest';
import { canGoNextEvidencePage, createEvidenceLightbox, EVIDENCE_PAGE_SIZE, getEvidenceType, getEvidenceTotalPages } from './evidence-data';

describe('evidence data helpers', () => {
  it('maps tab index to evidence type', () => {
    expect(getEvidenceType(0)).toBeUndefined();
    expect(getEvidenceType(1)).toBe('打架');
    expect(getEvidenceType(4)).toBe('人员聚集');
  });

  it('computes evidence pagination helpers', () => {
    expect(getEvidenceTotalPages(0)).toBe(0);
    expect(getEvidenceTotalPages(25)).toBe(3);
    expect(canGoNextEvidencePage(0, 25)).toBe(true);
    expect(canGoNextEvidencePage(2, 25)).toBe(false);
    expect(EVIDENCE_PAGE_SIZE).toBe(12);
  });

  it('creates lightbox state from evidence item', () => {
    const item = { id: 'ev-1', snapshotUrl: '/images/demo.jpg' } as any;
    expect(createEvidenceLightbox(item)).toEqual({ src: '/images/demo.jpg', item });
  });
});
