import { getWorkspaceApiUrl } from './api-config';

export function apiDownload(path: string, signal?: AbortSignal): void {
  fetch(getWorkspaceApiUrl(path), { signal })
    .then(res => {
      if (!res.ok) {
        throw new Error(`下载失败: HTTP ${res.status}`);
      }
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = '';
      anchor.click();
      URL.revokeObjectURL(url);
    })
    .catch(error => {
      if ((error as Error).name !== 'AbortError') console.error(error);
    });
}
