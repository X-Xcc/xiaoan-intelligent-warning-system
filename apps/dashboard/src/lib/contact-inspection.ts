import { CONTACT_REDACTED_VALUE, contactReviewRecords, type ContactReviewRecord } from './contact-review';

export type ContactPerson = 'reference' | 'unknown';
export type ContactRole = 'victim' | 'suspect';
export const contactRoleLabels: Record<ContactRole, string> = { victim: '受害者', suspect: '嫌疑人' };
export type ContactAnnotation = {
  id: string;
  label: string;
  person: ContactPerson;
  role?: ContactRole;
  bounds: readonly [x: number, y: number, width: number, height: number];
};

export function contactAnnotationLabel(annotation: ContactAnnotation): string {
  const personLabel = annotation.role ? contactRoleLabels[annotation.role] : annotation.person === 'reference' ? '参考对象' : '人物';
  return `${personLabel} ${annotation.label}`;
}

// Head bounds are reviewed percentages of each full source image, not detector output.
const faceAnnotationsByAsset: Readonly<Record<string, readonly ContactAnnotation[]>> = {
  '/contact-review-assets/night-market-cam-03.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [43.4, 17.9, 5.0, 13.4] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [52.4, 4.3, 4.3, 12.3] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [64.6, 4.5, 4.3, 13.4] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [11.0, 13.2, 5.6, 14.3] },
  ],
  '/contact-review-assets/night-market-cam-04.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [12.8, 15.3, 7.4, 15.1] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [30.5, 13.4, 5.0, 13.0] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [37.5, 4.2, 3.3, 11.5] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [42.8, 5.7, 3.7, 11.3] },
  ],
  '/contact-review-assets/night-market-cam-05.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [29.7, 41.4, 6.7, 13.5] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [36.8, 43.4, 6.8, 13.1] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [47.3, 30.6, 3.9, 11.0] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [55.0, 32.1, 4.8, 11.3] },
  ],
  '/contact-review-assets/night-market-cam-06.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [44.3, 32.2, 4.2, 11.0] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [50.4, 21.9, 3.1, 9.6] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [59.8, 20.4, 3.1, 9.7] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [63.3, 15.7, 3.0, 8.4] },
  ],
  '/contact-review-assets/night-market-cam-07.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [36.9, 23.5, 3.8, 12.3] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [41.5, 25.4, 4.3, 12.5] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [50.6, 13.9, 3.2, 10.6] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [59.3, 11.2, 3.0, 10.4] },
  ],
  '/contact-review-assets/night-market-cam-08.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [29.6, 29.4, 6.5, 16.1] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [36.9, 32.2, 6.7, 15.0] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [47.2, 16.5, 4.1, 13.2] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [55.0, 18.8, 4.7, 13.2] },
  ],
  '/contact-review-assets/night-market-cam-09.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [42.7, 25.7, 6.5, 16.3] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [29.9, 22.3, 4.6, 13.0] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [43.3, 5.6, 3.9, 11.2] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [36.5, 2.4, 3.1, 9.4] },
  ],
  '/contact-review-assets/night-market-cam-10.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [31.8, 23.4, 5.1, 12.5] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [39.1, 14.3, 3.4, 12.3] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [45.9, 16.9, 4.2, 12.5] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [54.3, 15.3, 3.5, 12.7] },
  ],
  '/contact-review-assets/night-market-sequence-01.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [18.9, 33.1, 6.8, 10.3] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [41.4, 37.3, 6.7, 9.4] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [63.3, 24.8, 4.9, 7.2] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [56.3, 23.0, 4.0, 7.0] },
  ],
  '/contact-review-assets/night-market-cam-11.jpg': [
    { id: '01', label: '01', person: 'reference', bounds: [52, 29, 8, 15] },
    { id: '02', label: '02', person: 'unknown', bounds: [34, 7, 7, 14] },
    { id: '04', label: '04', person: 'unknown', bounds: [45, 7, 7, 14] },
  ],
  '/contact-review-assets/night-market-cam-12.jpg': [
    { id: '02', label: '02', person: 'unknown', bounds: [39, 8, 7, 11] },
    { id: '04', label: '04', person: 'unknown', bounds: [19, 32, 9, 16] },
    { id: '06', label: '06', person: 'unknown', bounds: [28, 13, 9, 17] },
  ],
  '/contact-review-assets/night-market-sequence-02.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [28.9, 37.7, 8.2, 16.6] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [52.5, 16.8, 5.0, 11.2] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [66.5, 17.9, 5.6, 12.3] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [54.5, 30.9, 7.3, 11.7] },
  ],
  '/contact-review-assets/night-market-sequence-03.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [29.1, 39.0, 8.1, 16.6] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [36.0, 37.3, 7.7, 14.1] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [51.6, 17.6, 5.5, 12.9] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [56.3, 21.6, 8.0, 14.8] },
  ],
  '/contact-review-assets/night-market-sequence-04.jpg': [
    { id: '01', label: '01', person: 'reference', role: 'victim', bounds: [20.8, 35.3, 5.7, 9.6] },
    { id: '02', label: '02', person: 'unknown', role: 'suspect', bounds: [41.7, 33.4, 10.8, 14.5] },
    { id: '03', label: '03', person: 'unknown', role: 'suspect', bounds: [64.1, 28.7, 3.9, 7.9] },
    { id: '04', label: '04', person: 'unknown', role: 'suspect', bounds: [71.6, 29.9, 4.6, 7.6] },
  ],
};

export const contactAnnotations: Readonly<Record<string, readonly ContactAnnotation[]>> = Object.fromEntries(
  contactReviewRecords.map(record => {
    const annotations = faceAnnotationsByAsset[record.assetPath] ?? [];
    return [record.id, annotations.map(annotation => ({
      ...annotation,
      role: annotation.role ?? (annotation.person === 'reference' ? 'victim' : 'suspect'),
    }))];
  }),
);

export type IdentityField = readonly [label: string, value: string, wide?: boolean];
const reviewedDemoNames: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'CR-020': { '01': '小王', '04': '赵六' },
  'CR-019': { '04': '张三', '03': '李四' },
};

export function contactRoleIdentity(recordId: string, annotation?: ContactAnnotation): readonly IdentityField[] {
  if (!annotation?.role) return [];
  const fields: IdentityField[] = [
    ['演示角色', reviewedDemoNames[recordId]?.[annotation.id] ?? contactRoleLabels[annotation.role]],
    ['人员编号', CONTACT_REDACTED_VALUE],
  ];
  if (annotation.role !== 'suspect') fields.push(['姓名', CONTACT_REDACTED_VALUE]);
  fields.push(['身份资料', CONTACT_REDACTED_VALUE], ['标注来源', '人工指定 · 演示预设', true]);
  return fields;
}

export const referenceIdentity: readonly IdentityField[] = [
  ['姓名', CONTACT_REDACTED_VALUE], ['人员编号', CONTACT_REDACTED_VALUE], ['性别', CONTACT_REDACTED_VALUE],
  ['出生日期', CONTACT_REDACTED_VALUE], ['民族', CONTACT_REDACTED_VALUE],
  ['国籍 / 地区', CONTACT_REDACTED_VALUE], ['公民身份号码', CONTACT_REDACTED_VALUE, true],
];
export const referenceResidence: readonly IdentityField[] = [
  ['户籍地址', CONTACT_REDACTED_VALUE, true], ['现居住址', CONTACT_REDACTED_VALUE, true],
  ['联系电话', CONTACT_REDACTED_VALUE], ['职业', CONTACT_REDACTED_VALUE],
];

export function contactComparisonRecords(origin: ContactReviewRecord): ContactReviewRecord[] {
  const timestamp = (record: ContactReviewRecord) => Date.parse(`${record.occurredAt.replace(' ', 'T')}+08:00`);
  const originTime = timestamp(origin);
  return contactReviewRecords.filter(record => record.id !== origin.id).sort((a, b) =>
    Math.abs(timestamp(a) - originTime) - Math.abs(timestamp(b) - originTime) || a.id.localeCompare(b.id),
  );
}

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
