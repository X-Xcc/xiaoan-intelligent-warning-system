import { API_BASE, getToken } from '../lib/api';
import type { EvidenceItem } from './dataService';

export const EVIDENCE_PAGE_SIZE = 12;
export const EVIDENCE_TABS = ['全部', '打架', '跌倒', '离岗', '人员聚集'] as const;

export function getEvidenceType(activeTab: number): string | undefined {
  return activeTab === 0 ? undefined : EVIDENCE_TABS[activeTab];
}

export function getEvidenceTotalPages(total: number, pageSize = EVIDENCE_PAGE_SIZE): number {
  return Math.ceil(total / pageSize);
}

export function canGoNextEvidencePage(page: number, total: number, pageSize = EVIDENCE_PAGE_SIZE): boolean {
  return (page + 1) * pageSize < total;
}

export function getEvidencePrevPage(page: number) {
  return Math.max(0, page - 1);
}

export function getEvidenceNextPage(page: number) {
  return page + 1;
}

export function createEvidenceLightbox(item: EvidenceItem) {
  return {
    src: item.snapshotUrl || '',
    item,
  };
}

export async function downloadEvidenceSnapshot(item: EvidenceItem): Promise<void> {
  const rawUrl = item.snapshotUrl;
  if (!rawUrl) throw new Error('无可用图片');

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = rawUrl.startsWith('http') ? rawUrl : `${API_BASE}${rawUrl}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`下载失败: ${res.status}`);
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objUrl;
  link.download = item.imageFilename || `evidence_${item.id}.jpg`;
  link.click();
  URL.revokeObjectURL(objUrl);
}
