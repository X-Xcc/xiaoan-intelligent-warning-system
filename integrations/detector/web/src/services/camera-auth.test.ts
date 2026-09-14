import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  localStorage.setItem('jwt_token', 'fixture-camera-jwt');
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

it('camera list and update ignore obsolete JWTs and use anonymous transport', async () => {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ data: [{ id: 'fixture', name: 'Camera', type: 'rtsp',
      address: 'rtsp://camera.example.invalid/live' }] }))
    .mockResolvedValueOnce(Response.json({ data: { cameras: ['fixture'] } }))
    .mockResolvedValueOnce(Response.json({ data: { id: 'fixture' } }));
  vi.stubGlobal('fetch', fetchMock);
  const { fetchCameras, updateCamera } = await import('./dataService');
  const cameras = await fetchCameras();
  expect(cameras[0].id).toBe('fixture');
  await updateCamera('fixture', { name: 'Renamed camera' });
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
    'http://localhost:3000/api/camera_config',
    'http://localhost:3000/api/cameras',
    'http://localhost:3000/api/camera_config/fixture',
  ]);
  for (const [url, options] of fetchMock.mock.calls) {
    expect(new Headers(options?.headers).get('Authorization')).toBeNull();
    expect(String(url)).not.toContain('fixture-camera-jwt');
  }
  expect(fetchMock.mock.calls[2][1]?.method).toBe('PUT');
});
