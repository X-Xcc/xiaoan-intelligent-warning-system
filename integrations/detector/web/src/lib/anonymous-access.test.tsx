import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appRoutes } from '../navigation/routes';

describe('anonymous workspace', () => {
  it('makes every workspace route public', () => {
    expect(appRoutes.every(route => !('requiresAuth' in route) || !route.requiresAuth)).toBe(true);
  });

  it('has no login guard, login page, or logout control', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const layout = readFileSync('src/components/Layout.tsx', 'utf8');
    const home = readFileSync('src/pages/Home.tsx', 'utf8');
    expect(app).not.toMatch(/AuthProvider|useAuth|ProtectedRoute|pages\/Login/);
    expect(layout).not.toMatch(/useAuth|logout|LogOut/);
    expect(home).not.toContain('navigate("/login")');
  });
});
