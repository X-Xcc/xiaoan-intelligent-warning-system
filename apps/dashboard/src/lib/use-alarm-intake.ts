import { useCallback, useEffect, useRef, useState } from 'react';
import { commandApiBase, commandRequest } from './command-api';
import type { IntakeSource } from './intake-sheet';
import { withIntakeDemoEvents } from './intake-demo-data';

type AlarmEvent = IntakeSource & {
  id: string;
  kind?: string;
  createdAt?: string;
  meta?: {
    contact?: string;
    category?: string;
    caller?: string;
    reporter?: string;
    people?: string;
    person?: string;
  };
};

export function useAlarmIntake(enabled = true) {
  const [events, setEvents] = useState<Array<IntakeSource & { id: string }>>([]);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending: Promise<void> | null = null;
    let queued = false;
    let knownIds: Set<string> | null = null;
    let socket: WebSocket | undefined;
    let reconnect: number | undefined;
    let controller: AbortController | undefined;

    function load(): Promise<void> {
      if (!active) return Promise.resolve();
      if (pending) { queued = true; return pending; }
      controller = new AbortController();
      const deadline = window.setTimeout(() => controller?.abort(), 15000);
      pending = commandRequest<{ items: AlarmEvent[] }>('/events', '', { signal: controller.signal })
        .then((response) => {
          if (!Array.isArray(response.items)) throw new Error('Invalid alarm queue');
          if (!active) return;
          const incoming = response.items.filter((item) => item.id).map((item) => {
            const demoPlaceholder = item.id === 'YS-DEMO-001';
            return {
            ...item,
            sourceMode: 'live' as const,
            time: demoPlaceholder ? '20:13:50' : item.time,
            receivedAt: demoPlaceholder ? '2026-09-11T20:14:50' : item.receivedAt || item.createdAt,
            occurredAt: demoPlaceholder ? '2026-09-11T20:13:50' : item.occurredAt,
            description: demoPlaceholder
              ? '报警人小明报警称，20:13:50时许，王五在其摊位前寻衅滋事。地点位于8号摊位前。'
              : item.description,
            attention: demoPlaceholder
              ? '该人员在本地多个夜市，有的有类似6起寻衅滋事警情。且该人员有暴力前科，属重点人员，需要对其展开常规盘查'
              : item.attention,
            caller: demoPlaceholder ? '小明' : item.caller || item.reporter || item.meta?.caller || item.meta?.reporter,
            reporter: demoPlaceholder ? '小明' : item.reporter || item.caller || item.meta?.reporter || item.meta?.caller,
            people: demoPlaceholder ? '小明' : item.people || item.person || item.meta?.people || item.meta?.person,
            person: demoPlaceholder ? '小明' : item.person || item.people || item.meta?.person || item.meta?.people,
            phone: item.phone || item.meta?.contact,
            category: item.category || item.meta?.category,
            method: item.method || (item.kind === 'help' ? '小程序报警' : ''),
            };
          });
          const added = knownIds ? incoming.filter((item) => !knownIds!.has(item.id)).length : 0;
          knownIds = new Set(incoming.map((item) => item.id));
          if (added) setNotice(`收到 ${added} 条新警情`);
          setEvents(withIntakeDemoEvents(incoming));
          setOnline(true);
          setError('');
        })
        .catch(() => {
          if (!active) return;
          setOnline(false);
          setError('警情同步失败，已保留收到的警情，正在重试。');
        })
        .finally(() => {
          window.clearTimeout(deadline);
          pending = null;
          if (!active) return;
          setLoading(false);
          if (queued) { queued = false; void load(); }
        });
      return pending;
    }

    function connect() {
      if (!active) return;
      try {
        const url = new URL(`${commandApiBase}/events/realtime`, window.location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(url.href);
        socket.onopen = () => { void load(); };
        socket.onmessage = (message) => {
          try {
            const payload = JSON.parse(String(message.data));
            if (typeof payload.type === 'string') void load();
          } catch { /* Polling also recovers missed or malformed notifications. */ }
        };
        socket.onclose = () => {
          if (active) reconnect = window.setTimeout(connect, 3000);
        };
        socket.onerror = () => socket?.close();
      } catch { /* Polling remains available when WebSocket cannot connect. */ }
    }

    refreshRef.current = load;
    void load();
    connect();
    const interval = window.setInterval(() => { void load(); }, 5000);
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      refreshRef.current = async () => {};
      controller?.abort();
      window.clearInterval(interval);
      window.clearTimeout(reconnect);
      window.removeEventListener('focus', onFocus);
      socket?.close();
    };
  }, [enabled]);

  return { events, online, loading, error, notice, refresh };
}
