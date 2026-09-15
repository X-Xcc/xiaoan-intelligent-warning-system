import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cpu,
  FolderLock,
  GitCompare,
  History,
  LayoutDashboard,
  Pencil,
  Settings2,
  Video,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface AppRouteDefinition {
  path: string;
  label: string;
  icon?: LucideIcon;
  showInSidebar?: boolean;
  hasCameraSubmenu?: boolean;
  componentKey?: AppRouteComponentKey;
}

export type AppRouteComponentKey =
  | 'Dashboard'
  | 'Monitor'
  | 'Alerts'
  | 'Devices'
  | 'Evidence'
  | 'Analysis'
  | 'Maintenance'
  | 'Audit'
  | 'ModelTraining'
  | 'Training';

export interface WorkspaceLinkDefinition {
  label: string;
  href: string;
  icon: LucideIcon;
  kind: 'app' | 'external';
}

export const appRoutes: AppRouteDefinition[] = [
  { path: '/dashboard', label: '控制面板', icon: LayoutDashboard, showInSidebar: true, componentKey: 'Dashboard' },
  { path: '/monitor', label: '实时监控', icon: Video, showInSidebar: true, hasCameraSubmenu: true, componentKey: 'Monitor' },
  { path: '/alerts', label: '告警中心', icon: AlertTriangle, showInSidebar: true, componentKey: 'Alerts' },
  { path: '/evidence', label: '视频证据', icon: FolderLock, showInSidebar: true, componentKey: 'Evidence' },
  { path: '/devices', label: '设备管理', icon: Settings2, showInSidebar: true, componentKey: 'Devices' },
  { path: '/analysis', label: '数据分析', icon: BarChart3, showInSidebar: true, componentKey: 'Analysis' },
  { path: '/audit', label: '审计日志', icon: History, showInSidebar: true, componentKey: 'Audit' },
  { path: '/model-training', label: '模型微调', icon: Cpu, showInSidebar: true, componentKey: 'ModelTraining' },
  { path: '/training', label: '算法对比', icon: GitCompare, showInSidebar: true, componentKey: 'Training' },
  { path: '/maintenance', label: '运维中心', icon: Wrench, showInSidebar: true, componentKey: 'Maintenance' },
];

export const workspaceLinks: WorkspaceLinkDefinition[] = [
  { label: '数据标注', href: '/annotation.html', icon: Pencil, kind: 'external' },
];

export const sidebarRoutes = appRoutes.filter(route => route.showInSidebar);

export function getAppRouteByPath(path: string): AppRouteDefinition | undefined {
  return appRoutes.find(route => route.path === path);
}

export function getWorkspaceLinkByHref(href: string): WorkspaceLinkDefinition | undefined {
  return workspaceLinks.find(link => link.href === href);
}

export const defaultAppRoute = '/monitor';
export const homeRoute = '/';
