import { describe, expect, it } from 'vitest';
import {
  appRoutes,
  defaultAppRoute,
  getAppRouteByPath,
  getWorkspaceLinkByHref,
  homeRoute,
  workspaceLinks,
} from './routes';

describe('navigation route definitions', () => {
  it('defines all public sidebar routes in appRoutes', () => {
    const protectedRoutes = appRoutes.filter(route => route.showInSidebar);
    const protectedPaths = protectedRoutes.map(route => route.path).sort();

    expect(protectedPaths).toEqual([
      '/alerts',
      '/analysis',
      '/audit',
      '/dashboard',
      '/devices',
      '/evidence',
      '/maintenance',
      '/model-training',
      '/monitor',
      '/training',
    ]);
  });

  it('maps route and workspace entries through shared lookup helpers', () => {
    expect(getAppRouteByPath(defaultAppRoute)).toEqual(
      expect.objectContaining({ path: '/monitor', hasCameraSubmenu: true }),
    );
    expect(getAppRouteByPath('/training')).toEqual(
      expect.objectContaining({ label: '算法对比', showInSidebar: true }),
    );
    expect(getWorkspaceLinkByHref('/annotation.html')).toEqual(
      expect.objectContaining({ kind: 'external', label: '数据标注' }),
    );
  });

  it('keeps public entry routes explicit', () => {
    expect(defaultAppRoute).toBe('/monitor');
    expect(homeRoute).toBe('/');
  });
});
