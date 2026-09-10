const currentPort = typeof window !== 'undefined' ? window.location.port : '5000';
const currentProtocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
const currentHostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const API_BASE = `${currentProtocol}//${currentHostname}:${currentPort || '5000'}`;
export const isZeroPort = currentPort === '5001';

export function getWorkspaceApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
