import type { Camera } from '../types';

export function createLayoutMonitorLinks(cameras: Camera[]) {
  return cameras.map((camera, index) => ({
    id: camera.id,
    label: `视频${index + 1}`,
    href: `/monitor?cam=${camera.id}`,
    isOnline: camera.status === 'online',
  }));
}

export function shouldOpenMonitorMenu(pathname: string, defaultProtectedRoute: string) {
  return pathname === defaultProtectedRoute;
}
