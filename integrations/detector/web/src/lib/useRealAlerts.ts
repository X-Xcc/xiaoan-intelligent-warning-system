/**
 * useRealAlerts — 从真实 API 获取告警数据
 * 替代 useMockAlerts，仅告警走真实后端
 */

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPatch, subscribeSse } from "./api";
import type { Alert, PageResponse } from "../types";

/**
 * 从 /api/alerts 拉取告警列表（默认取最近 50 条）
 * 并订阅 SSE 实时推送新告警
 */
export function useRealAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  // 初始加载
  useEffect(() => {
    const ac = new AbortController();
    apiGet<PageResponse<Alert>>("/api/alerts?page=0&size=50", ac.signal)
      .then((page) => {
        setAlerts(page.items);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => ac.abort();
  }, []);

  // SSE 实时追加新告警
  useEffect(() => {
    return subscribeSse("alerts", (data: unknown) => {
      if (!Array.isArray(data)) return;
      setAlerts((prev) => {
        const incoming = new Map<string, Alert>();
        for (const alert of data as Alert[]) incoming.set(alert.id, alert);

        const merged = prev.map(alert => incoming.get(alert.id) ?? alert);
        const existingIds = new Set(merged.map(alert => alert.id));
        const fresh = (data as Alert[]).filter(alert => !existingIds.has(alert.id));

        return [...fresh, ...merged].slice(0, 200);
      });
    });
  }, []);

  // 更新告警状态
  const updateAlertStatus = useCallback(
    async (id: string, status: "confirmed" | "ignored") => {
      // 乐观更新
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status } : a))
      );
      try {
        await apiPatch(`/api/alerts/${id}`, { status });
      } catch {
        // 回滚
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === id ? { ...a, status: "pending" } : a
          )
        );
      }
    },
    []
  );

  return { alerts, loading, updateAlertStatus };
}
