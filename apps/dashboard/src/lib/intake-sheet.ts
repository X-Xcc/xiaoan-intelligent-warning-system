export type IntakeSource = {
  sourceMode?: 'live' | 'desensitized_demo';
  id?: string;
  title?: string;
  area?: string;
  bay?: string;
  time?: string;
  status?: string;
  level?: string;
  owner?: string;
  description?: string;
  occurredAt?: string;
  receivedAt?: string;
  reporter?: string;
  caller?: string;
  phone?: string;
  person?: string;
  involvedPersons?: string | string[];
  category?: string;
} & Partial<Record<
  'number' | 'unit' | 'receiver' | 'dispatchedAt' | 'gender' | 'address' | 'method' |
  'callers' | 'involved' | 'people' | 'officer' | 'policeCount' | 'assistantCount' |
  'vehicle' | 'departedAt' | 'disposition' | 'result' | 'notes' | 'signature' |
  'reviewer' | 'filledAt' | 'dispatchUnit' | 'dispatchNote' | 'location' | 'risk',
  string
>>;

function text(value?: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function localDateTime(value?: string): string {
  const source = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(source);
  if (!match) return '';
  const [, year, month, day, hour, minute, second = '00'] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  if (!Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day) || Number(hour) > 23 || Number(minute) > 59 ||
    Number(second) > 59) return '';
  return `${year}-${month}-${day}T${hour}:${minute}${match[6] ? `:${second}` : ''}`;
}

function categoryFromText(value: string): string {
  const categories: Array<[RegExp, string]> = [
    [/交通事故/, '交通事故'],
    [/火灾|起火/, '火灾事故'],
    [/刑事案件/, '刑事案件'],
    [/治安案件/, '治安案件'],
    [/纠纷/, '纠纷类'],
    [/投诉/, '投诉类'],
    [/求助|失联|走失/, '求助类'],
  ];
  return categories.find(([pattern]) => pattern.test(value))?.[1] ?? '';
}

export function buildIntakeDraft(event: IntakeSource): Record<string, string> {
  const title = text(event.title);
  const description = text(event.description);
  const location = text(event.location) || text(event.bay);
  const involved = Array.isArray(event.involvedPersons)
    ? event.involvedPersons.map(text).filter(Boolean).join('；')
    : text(event.involvedPersons);

  // Source ownership is workflow responsibility, not proof of the attending officer.
  return {
    number: text(event.number) || text(event.id),
    unit: text(event.unit) || text(event.area) || (location.includes('·') ? location.split('·')[0].trim() : ''),
    receivedAt: localDateTime(event.receivedAt),
    receiver: text(event.receiver),
    dispatchedAt: localDateTime(event.dispatchedAt),
    caller: text(event.caller) || text(event.reporter),
    gender: text(event.gender),
    phone: text(event.phone),
    address: text(event.address),
    method: text(event.method),
    occurredAt: localDateTime(event.occurredAt),
    location,
    category: text(event.category) || categoryFromText(title) || categoryFromText(description),
    callers: text(event.callers),
    involved: text(event.involved),
    people: text(event.people) || involved || text(event.person),
    details: description || title,
    officer: text(event.officer),
    policeCount: text(event.policeCount),
    assistantCount: text(event.assistantCount),
    vehicle: text(event.vehicle),
    departedAt: localDateTime(event.departedAt),
    disposition: text(event.disposition),
    result: text(event.result),
    notes: text(event.notes),
    signature: text(event.signature),
    reviewer: text(event.reviewer),
    filledAt: localDateTime(`${text(event.filledAt)}T00:00`).slice(0, 10),
    risk: text(event.risk) || text(event.level),
    dispatchUnit: text(event.dispatchUnit),
    dispatchNote: text(event.dispatchNote),
  };
}
