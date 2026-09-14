export type ReviewStatus = '待复核' | '已标记' | '已排除';

export type CompanionProfile = {
  id: string;
  label: string;
  name: string;
  source: string;
  note: string;
};

export type ContactReviewRecord = {
  id: string;
  assetPath: string;
  occurredAt: string;
  location: string;
  camera: string;
  behavior: ContactBehavior;
  companion: CompanionProfile;
  status: ReviewStatus;
};

export type ContactBehavior = '可疑接触' | '可疑观察' | '可疑跟随';
export const contactBehaviors: ContactBehavior[] = ['可疑接触', '可疑观察', '可疑跟随'];
export const CONTACT_SEARCH_CORPUS_SIZE = 3248;
export const IDENTITY_SEARCH_RECORD_ID = 'CR-020';

export type ContactSearchStage = {
  scanned: number;
  matched: number;
  phase: 'scanning' | 'complete';
};

export function createContactSearchStages(resultCount: number, corpusSize = CONTACT_SEARCH_CORPUS_SIZE): ContactSearchStage[] {
  const safeResultCount = Math.max(0, resultCount);
  const safeCorpusSize = Math.max(1, corpusSize);
  const checkpoints = [96, 768, 1664, 2688, safeCorpusSize];
  const ratios = [0.1, 0.3, 0.55, 0.85, 1];
  return checkpoints.map((checkpoint, index) => ({
    scanned: Math.min(safeCorpusSize, checkpoint),
    matched: Math.min(safeResultCount, Math.round(safeResultCount * ratios[index])),
    phase: index === checkpoints.length - 1 ? 'complete' : 'scanning',
  }));
}

export const CONTACT_DEMO_DATE = '2026-09-06';
export const CONTACT_STORAGE_KEY = 'contact-review-demo-v1';
export type ContactReviewDraft = Record<string, { status: ReviewStatus; note: string }>;

const recurringCompanion: CompanionProfile = {
  id: 'P-2048',
  label: '同行对象 2048',
  name: 'xxx',
  source: '合成脚本预设 · 非身份识别',
  note: '虚构角色，未接入真实身份资料',
};

const uniqueCompanions = Array.from({ length: 9 }, (_, index): CompanionProfile => ({
  id: `P-${3011 + index}`,
  label: `同行对象 ${3011 + index}`,
  name: ['林予安', '陈景和', '周明远', '许知夏', '吴成川', '沈雨禾', '郑怀远', '宋清宁', '何嘉木'][index],
  source: '合成脚本预设 · 非身份识别',
  note: '虚构角色，未接入真实身份资料',
}));

const locations = [
  ['东城服务中心外侧', 'CAM-07'],
  ['滨江步行街北入口', 'CAM-03'],
  ['市民广场东侧长廊', 'CAM-11'],
  ['科技园一号门', 'CAM-04'],
  ['文化馆南侧通道', 'CAM-12'],
  ['公交枢纽西侧落客区', 'CAM-02'],
  ['社区服务站门厅', 'CAM-09'],
  ['商业街停车区入口', 'CAM-05'],
  ['河畔步道观景平台', 'CAM-13'],
  ['大学城共享大厅', 'CAM-08'],
  ['图书馆北侧连廊', 'CAM-14'],
  ['会展中心东广场', 'CAM-10'],
  ['园区食堂外摆区', 'CAM-06'],
  ['体育中心南门', 'CAM-15'],
  ['老城街区拐角处', 'CAM-16'],
  ['社区公园西入口', 'CAM-01'],
  ['市政大厅前坪', 'CAM-07'],
  ['火车站南侧广场', 'CAM-03'],
  ['创新园咖啡外摆区', 'CAM-04'],
  ['公共文化中心入口', 'CAM-11'],
] as const;

const occurredAt = [
  '2026-09-06 20:32:50',
  '2026-09-05 20:31:50',
  '2026-09-04 20:30:50',
  '2026-09-02 20:29:50',
  '2026-09-01 20:28:50',
  '2026-08-30 20:27:50',
  '2026-08-29 20:26:50',
  '2026-08-27 20:25:50',
  '2026-08-25 20:24:50',
  '2026-08-23 20:23:50',
  '2026-08-21 20:22:50',
  '2026-08-20 20:21:50',
  '2026-08-18 20:20:50',
  '2026-08-16 20:19:50',
  '2026-08-14 20:18:50',
  '2026-08-12 20:17:50',
  '2026-08-11 20:16:50',
  '2026-08-10 20:15:50',
  '2026-08-09 20:14:50',
  '2026-08-08 20:13:50',
] as const;

const companionSequence = [0, 0, 1, 0, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 9];
const behaviorSequence: ContactBehavior[] = [
  '可疑接触', '可疑观察', '可疑跟随', '可疑接触', '可疑观察',
  '可疑跟随', '可疑接触', '可疑观察', '可疑跟随', '可疑接触',
  '可疑观察', '可疑跟随', '可疑接触', '可疑观察', '可疑跟随',
  '可疑接触', '可疑观察', '可疑跟随', '可疑接触', '可疑观察',
];

const nightMarketAssets = Array.from({ length: 8 }, (_, index) =>
  `/contact-review-assets/night-market-cam-${String(index + 3).padStart(2, '0')}.jpg`,
);
const shuffledNightMarketOrder = [5, 1, 7, 0, 3, 6, 2, 4, 1, 5, 2, 7, 4, 0, 6, 3, 7, 2, 5, 1];
const recordAssetOverrides: Record<number, string> = {
  16: '/contact-review-assets/night-market-sequence-04.jpg',
  17: '/contact-review-assets/night-market-sequence-03.jpg',
  18: '/contact-review-assets/night-market-sequence-02.jpg',
  19: '/contact-review-assets/night-market-sequence-01.jpg',
};

export const contactReviewRecords: ContactReviewRecord[] = locations.map(([location, camera], index) => ({
  id: `CR-${String(index + 1).padStart(3, '0')}`,
  assetPath: recordAssetOverrides[index] ?? nightMarketAssets[shuffledNightMarketOrder[index]],
  occurredAt: occurredAt[index],
  location,
  camera,
  behavior: behaviorSequence[index],
  companion: companionSequence[index] === 0 ? recurringCompanion : uniqueCompanions[companionSequence[index] - 1],
  status: '待复核',
}));

export const CONTACT_REDACTED_VALUE = '已脱敏';
const companionDisplayLabels = new Map(
  [...new Set(contactReviewRecords.map((record) => record.companion.id))]
    .map((id, index) => [id, `脱敏对象 ${String(index + 1).padStart(2, '0')}`] as const),
);

export function contactCompanionDisplayLabel(companion: Pick<CompanionProfile, 'id'>) {
  return companionDisplayLabels.get(companion.id) ?? '脱敏对象';
}

export type ContactFilterField = 'all' | 'camera' | 'location' | 'behavior' | 'companion' | 'status';

export function filterContactRecords(
  records: ContactReviewRecord[],
  field: ContactFilterField,
  query: string,
): ContactReviewRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return records;

  return records.filter((record) => {
    const values: Record<Exclude<ContactFilterField, 'all'>, string> = {
      camera: record.camera,
      location: record.location,
      behavior: record.behavior,
      companion: `${record.companion.id} ${record.companion.label} ${record.companion.name}`,
      status: record.status,
    };
    return field === 'all'
      ? Object.values(values).some((value) => value.toLocaleLowerCase().includes(needle))
      : values[field].toLocaleLowerCase().includes(needle);
  });
}

export function recordStatusLabel(status: ReviewStatus) {
  return status;
}

export function contactDateWindow(days: number, anchor = CONTACT_DEMO_DATE) {
  const start = new Date(`${anchor}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to: anchor };
}

export type ContactFilters = {
  query?: string;
  field?: ContactFilterField;
  from?: string;
  to?: string;
  location?: string;
  behaviors?: ContactBehavior[];
  companion?: string;
  status?: 'all' | ReviewStatus;
  sort?: 'newest' | 'oldest' | 'frequency';
};

export function selectContactRecords(records: ContactReviewRecord[], filters: ContactFilters): ContactReviewRecord[] {
  const counts = new Map<string, number>();
  records.forEach((record) => counts.set(record.companion.id, (counts.get(record.companion.id) ?? 0) + 1));
  return filterContactRecords(records, filters.field ?? 'all', filters.query ?? '').filter((record) => {
    const date = record.occurredAt.slice(0, 10);
    return (!filters.from || date >= filters.from) && (!filters.to || date <= filters.to)
      && (!filters.location || record.location === filters.location)
      && (!filters.behaviors?.length || filters.behaviors.length === contactBehaviors.length || filters.behaviors.includes(record.behavior))
      && (!filters.companion || record.companion.id === filters.companion)
      && (!filters.status || filters.status === 'all' || record.status === filters.status);
  }).sort((a, b) => {
    const frequency = (counts.get(b.companion.id) ?? 0) - (counts.get(a.companion.id) ?? 0);
    if (filters.sort === 'frequency' && frequency) return frequency;
    return filters.sort === 'oldest' ? a.occurredAt.localeCompare(b.occurredAt) : b.occurredAt.localeCompare(a.occurredAt);
  });
}

export function selectIdentitySearchRecords(
  records: ContactReviewRecord[],
  filters: ContactFilters,
): ContactReviewRecord[] {
  return selectContactRecords(records, filters).filter(
    (record) => record.camera.toLocaleLowerCase() === 'cam-11' && record.id === IDENTITY_SEARCH_RECORD_ID,
  );
}

export function parseContactDraft(raw: string | null): ContactReviewDraft {
  try {
    const data = JSON.parse(raw ?? '{}');
    if (data?.version !== 1 || !data.reviews || typeof data.reviews !== 'object') return {};
    const clean: ContactReviewDraft = {};
    for (const record of contactReviewRecords) {
      const item = data.reviews[record.id];
      if (item && ['待复核', '已标记', '已排除'].includes(item.status) && typeof item.note === 'string') {
        clean[record.id] = { status: item.status, note: item.note.slice(0, 2000) };
      }
    }
    return clean;
  } catch { return {}; }
}

export function contactReviewCsv(records: ContactReviewRecord[], draft: ContactReviewDraft): string {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const rows = [
    ['数据性质', '记录编号', '演示时间 UTC+8', '演示地点', '机位编号', '可疑行为', '脱敏对象', '身份资料', '状态', '人工备注', '素材路径'],
    ...records.map((record) => ['合成演示，非真实证据', record.id, record.occurredAt, record.location, record.camera,
      record.behavior, contactCompanionDisplayLabel(record.companion), CONTACT_REDACTED_VALUE,
      draft[record.id]?.status ?? record.status, draft[record.id]?.note ?? '', record.assetPath]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
