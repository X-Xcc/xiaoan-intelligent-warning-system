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
  '2026-09-06 14:18',
  '2026-09-05 18:42',
  '2026-09-04 11:07',
  '2026-09-02 16:25',
  '2026-09-01 09:36',
  '2026-08-30 20:14',
  '2026-08-29 13:51',
  '2026-08-27 17:09',
  '2026-08-25 10:22',
  '2026-08-23 15:44',
  '2026-08-21 19:28',
  '2026-08-20 08:56',
  '2026-08-18 12:35',
  '2026-08-16 16:10',
  '2026-08-14 14:03',
  '2026-08-12 09:48',
  '2026-08-11 18:17',
  '2026-08-10 11:26',
  '2026-08-09 15:08',
  '2026-08-08 10:41',
] as const;

const companionSequence = [0, 0, 1, 0, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 9];
const behaviorSequence: ContactBehavior[] = [
  '可疑接触', '可疑观察', '可疑跟随', '可疑接触', '可疑观察',
  '可疑跟随', '可疑接触', '可疑观察', '可疑跟随', '可疑接触',
  '可疑观察', '可疑跟随', '可疑接触', '可疑观察', '可疑跟随',
  '可疑接触', '可疑观察', '可疑跟随', '可疑接触', '可疑观察',
];

export const contactReviewRecords: ContactReviewRecord[] = locations.map(([location, camera], index) => ({
  id: `CR-${String(index + 1).padStart(3, '0')}`,
  assetPath: index < 2
    ? `/contact-review-assets/contact-${String(index + 1).padStart(2, '0')}-self-portrait.png`
    : `/contact-review-assets/contact-${String(index + 1).padStart(2, '0')}.png`,
  occurredAt: occurredAt[index],
  location,
  camera,
  behavior: behaviorSequence[index],
  companion: companionSequence[index] === 0 ? recurringCompanion : uniqueCompanions[companionSequence[index] - 1],
  status: '待复核',
}));

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
    ['数据性质', '记录编号', '演示时间 UTC+8', '演示地点', '机位编号', '可疑行为', '同行对象编号', '虚构姓名', '状态', '人工备注', '素材路径'],
    ...records.map((record) => ['合成演示，非真实证据', record.id, record.occurredAt, record.location, record.camera,
      record.behavior, record.companion.id, record.companion.name, draft[record.id]?.status ?? record.status, draft[record.id]?.note ?? '', record.assetPath]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}
