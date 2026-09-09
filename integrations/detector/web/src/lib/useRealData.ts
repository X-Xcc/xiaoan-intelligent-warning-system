/**
 * 真实数据 hooks — 替代 useMock.ts 中的同名函数
 * 每个 hook: REST 初始加载 + SSE 实时更新
 */

import { useState, useEffect } from "react";
import type {
  FpsStats,
  ModelInfo,
  RegionalStat,
  SystemStatus,
  TrendData,
  AuditLog,
} from "../types";
import {
  loadAuditLogs,
  loadAuditTrend,
  loadAutomationRate,
  loadFpsStats,
  loadModelInfo,
  loadRegionalStats,
  loadSystemStatus,
  loadTrendData,
  subscribeAuditLogs,
  subscribeSystemStatus,
} from "../services/realtime-data";

export function useRealSystemStatus(): SystemStatus {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    cpuUsage: 0,
    memoryUsage: 0,
    storageUsage: 0,
    gpuUsage: 0,
    version: "—",
    lastUpdate: new Date().toLocaleString(),
    engine: undefined,
    onlineDevices: 0,
    totalDevices: 0,
    activeModels: 0,
    totalModels: 0,
    dataDirSizeMb: 0,
    detectionCount: 0,
    services: [],
  });

  useEffect(() => {
    const abortController = new AbortController();
    loadSystemStatus(abortController.signal).then(setSystemStatus).catch(() => {});
    return () => abortController.abort();
  }, []);

  useEffect(() => subscribeSystemStatus(setSystemStatus), []);

  return systemStatus;
}

export function useRealModelInfo() {
  const [modelInfo, setModelInfo] = useState<ModelInfo>({ model_size_mb: 0, device: "—", precision: "—" });

  useEffect(() => {
    const abortController = new AbortController();
    loadModelInfo(abortController.signal).then(setModelInfo).catch(() => {});
    return () => abortController.abort();
  }, []);

  return modelInfo;
}

export function useRealTrendData(range: "day" | "week" | "month" | "quarter") {
  const [trendData, setTrendData] = useState<TrendData>({ labels: [], data: {} });

  useEffect(() => {
    const abortController = new AbortController();
    loadTrendData(range, abortController.signal).then(setTrendData).catch(() => {});
    return () => abortController.abort();
  }, [range]);

  return trendData;
}

export function useRealRegionalStats() {
  const [regionalStats, setRegionalStats] = useState<RegionalStat[]>([]);

  useEffect(() => {
    const abortController = new AbortController();
    loadRegionalStats(abortController.signal).then(setRegionalStats).catch(() => {});
    return () => abortController.abort();
  }, []);

  return regionalStats;
}

export function useRealFpsStats() {
  const [fpsStats, setFpsStats] = useState<FpsStats>({ avg: 0, min: 0, max: 0, count: 0 });

  useEffect(() => {
    const abortController = new AbortController();
    loadFpsStats(abortController.signal).then(setFpsStats).catch(() => {});
    return () => abortController.abort();
  }, []);

  return fpsStats;
}

export function useRealAuditLogs(): AuditLog[] {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    const abortController = new AbortController();
    loadAuditLogs(abortController.signal).then(setLogs).catch(() => {});
    return () => abortController.abort();
  }, []);

  useEffect(() => subscribeAuditLogs(setLogs), []);

  return logs;
}

export function useRealAuditTrend(range: "day" | "week" = "week") {
  const [trend, setTrend] = useState<TrendData>({ labels: [], data: {} });

  useEffect(() => {
    const abortController = new AbortController();
    loadAuditTrend(range, abortController.signal).then(setTrend).catch(() => {});
    return () => abortController.abort();
  }, [range]);

  return trend;
}

export function useRealAutomationRate() {
  const [rate, setRate] = useState({ rate: 0 });

  useEffect(() => {
    loadAutomationRate().then(setRate).catch(() => {});
  }, []);

  return rate;
}
