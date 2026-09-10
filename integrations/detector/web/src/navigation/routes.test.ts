import { describe, expect, it } from 'vitest';
import {
  appRoutes,
  defaultProtectedRoute,
  getAppRouteByPath,
  getWorkspaceLinkByHref,
  homeRoute,
  loginRoute,
  workspaceLinks,
} from './routes';

describe('navigation route definitions', () => {
  it('defines all protected sidebar routes in appRoutes', () => {
    const protectedRoutes = appRoutes.filter(route => route.requiresAuth && route.showInSidebar);
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
    expect(getAppRouteByPath(defaultProtectedRoute)).toEqual(
      expect.objectContaining({ path: '/monitor', hasCameraSubmenu: true }),
    );
    expect(getAppRouteByPath('/training')).toEqual(
      expect.objectContaining({ label: '算法对比', showInSidebar: true }),
    );
    expect(getWorkspaceLinkByHref('/annotation.html')).toEqual(
      expect.objectContaining({ kind: 'external', label: '数据标注' }),
    );
  });

  it('keeps auth and public entry routes explicit', () => {
    expect(defaultProtectedRoute).toBe('/monitor');
    expect(homeRoute).toBe('/');
    expect(loginRoute).toBe('/login');
  });
});
