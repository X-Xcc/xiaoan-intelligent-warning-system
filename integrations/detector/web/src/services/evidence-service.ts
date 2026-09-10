import { subscribeSse } from '../lib/api';
import { exportAlerts, fetchEvidenceList } from './dataService';
import { EVIDENCE_PAGE_SIZE, getEvidenceType } from './evidence-data';

export function subscribeEvidenceRefresh(onRefresh: () => void): () => void {
  return subscribeSse('alerts', onRefresh);
}

export async function loadEvidencePage(selectedDate: string, activeTab: number, page: number, signal?: AbortSignal) {
  return fetchEvidenceList(
    {
      date: selectedDate,
      type: getEvidenceType(activeTab),
      page,
      size: EVIDENCE_PAGE_SIZE,
    },
    signal,
  );
}

export function exportEvidenceReport(selectedDate: string, activeTab: number): void {
  exportAlerts({
    since: selectedDate || undefined,
    type: getEvidenceType(activeTab),
  });
}
