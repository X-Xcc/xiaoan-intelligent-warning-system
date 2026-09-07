export const routePaths = {
  platform: '/platform',
  command: '/command',
  case: '/case',
  community: '/community',
  'duty-plan': '/duty-situation/training',
  'duty-situation': '/duty-situation',
  'contact-review': '/contact-review',
  'ai-center': '/ai-center',
  admin: '/admin',
  video: '/video',
  'night-market-command': '/night-market/command',
} as const;
export const appBasePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export type PlatformView = keyof typeof routePaths;
export type EventFilter = 'all' | 'pending' | 'active' | 'complete';
type EventSummary = {
  id?: string;
  title?: string;
  area?: string;
  bay?: string;
  owner?: string;
  status?: string;
  level?: string;
};

export function routePath(view: PlatformView): string {
  return `${appBasePath}${routePaths[view]}`;
}

export function viewForPath(path: string): PlatformView {
  const localPath = appBasePath && path.startsWith(appBasePath) ? path.slice(appBasePath.length) || '/' : path;
  if (localPath === '/duty-plan' || localPath.startsWith('/duty-plan/')) return 'duty-plan';
  return (Object.keys(routePaths) as PlatformView[]).sort((a, b) => routePaths[b].length - routePaths[a].length).find((view) =>
    localPath === routePaths[view] || localPath.startsWith(`${routePaths[view]}/`),
  ) ?? 'platform';
}

export function formatMetric(value?: number | null): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : '—';
}

export function eventCategory(status?: string): EventFilter {
  if (/完成|闭环|归档/.test(status ?? '')) return 'complete';
  if (/^待|已提交|新警情/.test(status ?? '')) return 'pending';
  return 'active';
}

export function filterEvents<T extends EventSummary>(events: T[] | undefined, filter: EventFilter, query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return (events ?? []).filter((event) => {
    if (filter !== 'all' && eventCategory(event.status) !== filter) return false;
    return !needle || [event.title, event.area, event.bay, event.owner, event.id].some((field) => field?.toLocaleLowerCase().includes(needle));
  });
}
