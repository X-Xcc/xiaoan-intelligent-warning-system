import type { PlatformOverview } from '../pages/DashboardApp';

const aliases: Record<string, string> = { alarm: 'command', training: 'duty-plan' };

export function normalizeLiveOverview(payload: PlatformOverview): PlatformOverview {
  return {
    ...payload,
    stats: payload.stats ?? {},
    events: payload.events ?? [],
    businessSystems: (payload.businessSystems ?? []).map(system => ({
      ...system, key: aliases[system.key ?? ''] ?? system.key,
    })),
    dataCatalog: { ...payload.dataCatalog, domains: payload.dataCatalog?.domains ?? [] },
    ai_copilot: {
      ...payload.ai_copilot,
      skills: payload.ai_copilot?.skills ?? [],
    },
    aiCenter: payload.aiCenter ?? {},
    eventChain: payload.eventChain ?? [],
    governance: payload.governance ?? {},
  };
}
