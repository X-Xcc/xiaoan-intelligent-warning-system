import { contactReviewRecords, type ContactReviewRecord } from './contact-review';

export type ContactPerson = 'reference' | 'unknown';
export type ContactAnnotation = {
  person: ContactPerson;
  bounds: readonly [x: number, y: number, width: number, height: number];
};

// Percentages are manually authored against each existing full frame, not detector output.
const frameBounds: Array<readonly [ContactAnnotation['bounds'], ContactAnnotation['bounds']]> = [
  [[58, 16, 9, 16], [46, 20, 14, 63]],
  [[44, 25, 8, 14], [28, 32, 14, 55]],
  [[48, 32, 6, 8], [57, 35, 6, 31]],
  [[54, 36, 4, 7], [61, 38, 5, 22]],
  [[41, 39, 5, 8], [52, 40, 6, 27]],
  [[39, 39, 7, 10], [53, 40, 8, 39]],
  [[39, 35, 6, 9], [54, 36, 8, 36]],
  [[42, 22, 6, 9], [53, 24, 8, 38]],
  [[52, 38, 6, 9], [38, 39, 7, 30]],
  [[38, 30, 6, 9], [52, 34, 7, 36]],
  [[42, 42, 5, 8], [53, 44, 7, 33]],
  [[57, 26, 7, 10], [69, 30, 9, 35]],
  [[46, 39, 7, 10], [62, 40, 10, 40]],
  [[43, 26, 7, 10], [55, 32, 8, 39]],
  [[49, 38, 6, 9], [63, 39, 7, 34]],
  [[54, 37, 7, 10], [38, 40, 9, 39]],
  [[41, 37, 5, 9], [52, 40, 7, 31]],
  [[49, 38, 6, 9], [59, 42, 9, 31]],
  [[41, 35, 7, 10], [56, 37, 9, 37]],
  [[47, 32, 6, 9], [57, 36, 7, 29]],
];

export const contactAnnotations: Readonly<Record<string, readonly ContactAnnotation[]>> = Object.fromEntries(
  contactReviewRecords.map((record, index) => [record.id, [
    { person: 'reference', bounds: frameBounds[index][0] },
    { person: 'unknown', bounds: frameBounds[index][1] },
  ]]),
);

export type IdentityField = readonly [label: string, value: string, wide?: boolean];
export const referenceIdentity: readonly IdentityField[] = [
  ['姓名', 'xxx'], ['人员编号', 'REF-001'], ['性别', '男'], ['出生日期', '1994-06-18'],
  ['民族', '未提供'], ['国籍 / 地区', '中国'], ['公民身份号码', '未提供', true],
];
export const referenceResidence: readonly IdentityField[] = [
  ['户籍地址', '演示省演示市示例区示例路 001 号', true],
  ['现居住址', '演示省演示市示例区样例小区 1 栋 101 室', true],
  ['联系电话', '未提供'], ['职业', '未提供'],
];

// Explicit illustrative association only. Preserve dates/places from the source records.
export function contactGaitRoute(origin: ContactReviewRecord): ContactReviewRecord[] {
  const route = [origin];
  const cameras = new Set([origin.camera]);
  const start = contactReviewRecords.findIndex(record => record.id === origin.id);
  for (let offset = 1; offset < contactReviewRecords.length && route.length < 5; offset++) {
    const record = contactReviewRecords[(Math.max(start, 0) + offset) % contactReviewRecords.length];
    if (cameras.has(record.camera)) continue;
    cameras.add(record.camera);
    route.push(record);
  }
  return route.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
