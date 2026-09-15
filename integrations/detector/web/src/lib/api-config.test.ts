import { describe, expect, it } from 'vitest';
import { API_BASE, getWorkspaceApiUrl, isZeroPort } from './api-config';

describe('api config helpers', () => {
  it('builds workspace api base from current window location', () => {
    expect(API_BASE).toBe('http://localhost:3000');
    expect(getWorkspaceApiUrl('/api/alerts')).toBe('http://localhost:3000/api/alerts');
  });

  it('exposes zero-port flag based on current port', () => {
    expect(isZeroPort).toBe(false);
  });

});
