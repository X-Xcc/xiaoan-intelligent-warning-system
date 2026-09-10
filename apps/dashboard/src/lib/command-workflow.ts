export const stages = ['b1', 'b2', 'b3', 'b4', 'handover'] as const;
export type CommandStage = typeof stages[number];
export type CommandMode = 'rehearsal' | 'playback';
export type ControlState = {
  stage: CommandStage; reveal: number; paused: boolean; runKey: string;
  mode: CommandMode; eventId: string | null; revision: number;
};
export type Point = { latitude: number; longitude: number };
export type CommandRoute = {
  routeSource: 'manual' | 'scenario_route' | 'local_estimate';
  staffId?: string; staffName?: string; groupLabel?: string; notice: string; mapUrl?: string;
  summaryVersion?: number; locationVersion?: number; recommendationId?: string;
  reviewStatus?: string; dispatchedAt?: string; notificationStatus?: string;
  segments: Array<{ mode: string; distanceMeters: number; estimatedSeconds: number | null; points: Point[] }>;
};
export type Material = {
  evidenceId: string; kind: string; name: string; url?: string; uploadId?: string;
  description?: string; discoveredAt?: string; discoveredBy?: string; registeredBy?: string; sha256?: string;
};
export type Verification = {
  verificationId: string; subjectName: string; resultStatus: string; lookupStatus?: string;
  personKey?: string | null; basis: string[]; method: string; dataTime: string;
  confidence: number | null; matchScore: number | null; auditId?: string; fallbackReason?: string;
};
export type Handover = {
  handoverId: string; version: number; status: string; summary: string; evidenceIds: string[];
  rejectionReason?: string; acceptedBy?: string; submittedBy?: string; auditId?: string;
};
export type RelatedAlert = {
  eventId: string; occurredAt: string; locationText: string; basis: string[]; relation: string;
};
export type CommandContext = {
  version: number; stage: string; updatedAt: string; sourceMode: 'live' | 'desensitized_demo';
  runKey?: string; scenarioId?: string; lastAuditId?: string;
  intake: {
    transcript: string; locationText: string; speakerName?: string; contactMasked?: string;
    transcriptSource: string; locationSource: string; locationVersion: number; coordinates?: Point | null;
    segments?: Array<{ startMs: number; endMs: number; text: string }>;
  };
  summary: {
    version: number; text: string; category: string; riskTags: string[]; dangerFactors: string[];
    reviewStatus: string; basis: string[]; dataTime: string; generationMethod: string;
    confirmedBy?: string; confirmedAt?: string;
  };
  relatedAlerts: RelatedAlert[]; dispatch?: CommandRoute; verification?: Verification;
  evidenceIndex: Material[]; handover?: Handover; handoverHistory?: Handover[];
};
export type CommandEvent = {
  id: string; title: string; bay: string; status: string; owner: string; description: string;
  meta: { command: CommandContext; assignment?: { staffId: string; staffName: string } };
  timeline?: Array<{ id: string | number; action: string; operator: string; createdAt: string }>;
};
export type CommandResponse = { event: CommandEvent; command: CommandContext; auditId?: string; requestId?: string };

export function initialControl(runKey: string, mode: CommandMode): ControlState {
  return { stage: 'b1', reveal: 0, paused: true, runKey, mode, eventId: null, revision: 0 };
}

export function localDateTimeInput(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function advanceControl(state: ControlState, action: 'next' | 'previous' | 'pause' | 'reset'): ControlState {
  const next = { ...state, revision: state.revision + 1 };
  if (action === 'reset') return { ...next, stage: 'b1', reveal: 0, paused: true };
  if (action === 'pause') return { ...next, paused: !state.paused };
  const index = stages.indexOf(state.stage);
  if (action === 'next') {
    return state.reveal < 3 ? { ...next, reveal: state.reveal + 1 }
      : { ...next, stage: stages[Math.min(index + 1, stages.length - 1)], reveal: index === stages.length - 1 ? 3 : 0 };
  }
  return state.reveal > 0 ? { ...next, reveal: state.reveal - 1 }
    : { ...next, stage: stages[Math.max(0, index - 1)], reveal: index ? 3 : 0 };
}

export function acceptsResponse(eventId: string, version: number, response: CommandResponse): boolean {
  return response.event.id === eventId && response.command.version >= version;
}

export function actionAllowed(event: CommandEvent | null, roles: string[], action: string, mode: CommandMode, online: boolean) {
  if (!event || mode !== 'rehearsal' || !online || event.status === '已完成') return false;
  const command = event.meta.command;
  const role = action.startsWith('summary') || action === 'intake' ? 'intake'
    : action.startsWith('dispatch') ? 'dispatch'
      : action === 'handover/review' ? 'analyze' : 'field';
  if (!roles.includes(role)) return false;
  const handover = command.handover?.status;
  if (handover === 'accepted' && action !== 'status') return false;
  if (handover === 'submitted' && !['handover/review', 'status'].includes(action)) return false;
  if (action === 'intake' || action === 'summary/confirm') return event.status === '已提交';
  if (action.startsWith('dispatch')) return event.status === '已提交'
    && command.summary.reviewStatus === 'confirmed'
    && (action !== 'dispatch' || command.dispatch?.reviewStatus === 'confirmed');
  if (action === 'handover/review') return handover === 'submitted';
  if (action === 'status') return ['已派单', '已接收', '已到达', '处理中'].includes(event.status);
  return ['已到达', '处理中'].includes(event.status);
}

type Pending = { fingerprint: string; payload: Record<string, unknown> & { requestId: string } };
type LedgerStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  & Partial<Pick<Storage, 'length' | 'key'>>;
export function commandRequestId(source: Pick<Crypto, 'getRandomValues'> = crypto): string {
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export class RequestLedger {
  private requests = new Map<string, Pending>();
  constructor(private storage?: LedgerStorage, private prefix = 'command-pending') {}
  begin(eventId: string, action: string, fields: Record<string, unknown>) {
    const key = `${this.prefix}:${eventId}:${action}`;
    const fingerprint = JSON.stringify(fields);
    const saved = this.storage?.getItem(key);
    const current: Pending | undefined = this.requests.get(key) ?? (saved ? JSON.parse(saved) : undefined);
    if (current) {
      if (current.fingerprint !== fingerprint) throw new Error('前一请求的结果尚未核对，请先核对回执');
      return current.payload;
    }
    const pending = { fingerprint, payload: { ...fields, requestId: commandRequestId() } };
    this.requests.set(key, pending);
    this.storage?.setItem(key, JSON.stringify(pending));
    return pending.payload;
  }
  resolve(eventId: string, action: string) {
    const key = `${this.prefix}:${eventId}:${action}`;
    this.requests.delete(key);
    this.storage?.removeItem(key);
  }
  pending(eventId: string): Array<{ action: string; payload: Pending['payload'] }> {
    const prefix = `${this.prefix}:${eventId}:`;
    const keys = new Set(this.requests.keys());
    if (this.storage?.key) {
      for (let index = 0; index < (this.storage.length ?? 0); index++) {
        const key = this.storage.key(index);
        if (key?.startsWith(prefix)) keys.add(key);
      }
    }
    const pending = [];
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      try {
        const entry: Pending | undefined = this.requests.get(key) ?? JSON.parse(this.storage?.getItem(key) || 'null');
        if (entry?.payload && typeof entry.payload.requestId === 'string') {
          pending.push({ action: key.slice(prefix.length), payload: entry.payload });
        }
      } catch { /* Ignore malformed browser drafts, never send them as requests. */ }
    }
    return pending;
  }
}
