export type AmapClientConfig = Readonly<{
  key: string;
  securityJsCode: string;
}>;

const EMPTY_AMAP: AmapClientConfig = Object.freeze({ key: '', securityJsCode: '' });
const API_BASE = (import.meta.env.VITE_API_BASE_URL?.trim() || '/api').replace(/\/+$/, '');
const CONFIG_TIMEOUT_MS = 3000;

function parseAmapConfig(value: unknown): AmapClientConfig | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.key !== 'string' || !candidate.key.trim()) return undefined;
  if (candidate.securityJsCode !== undefined && typeof candidate.securityJsCode !== 'string') return undefined;
  return Object.freeze({
    key: candidate.key.trim(),
    securityJsCode: typeof candidate.securityJsCode === 'string' ? candidate.securityJsCode.trim() : '',
  });
}

// DEV-only fallback is eliminated from production builds. Keep direct Vite
// property accesses here, rather than embedding the entire import.meta.env.
const developmentAmap = import.meta.env.DEV ? parseAmapConfig({
  key: import.meta.env.VITE_AMAP_KEY,
  securityJsCode: import.meta.env.VITE_AMAP_SECURITY_JS_CODE,
}) : undefined;

let runtimeAmap: AmapClientConfig | undefined;
let loadPromise: Promise<void> | undefined;

// JS SDK credentials are inherently visible in browser memory/network traffic,
// even if migrated privately. Never put server/model secrets in this config,
// log it, or persist it in browser storage.
export function getAmapConfig(): AmapClientConfig {
  return runtimeAmap ?? developmentAmap ?? EMPTY_AMAP;
}

async function fetchDeploymentConfig(): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<undefined>(resolve => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(undefined);
      }, CONFIG_TIMEOUT_MS);
    });
    const request = async () => {
      const response = await fetch(`${API_BASE}/deployment/client-config`, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error',
      });
      if (!response.ok) return undefined;
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object') return undefined;
      return parseAmapConfig((body as Record<string, unknown>).amap);
    };
    // Bound both fetch and body decoding. A late response must not change the
    // config after React has mounted with the fallback.
    runtimeAmap = await Promise.race([request(), deadline]);
  } catch {
    // Offline, older backends and invalid responses must not block the app.
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function loadDeploymentConfig(): Promise<void> {
  return loadPromise ??= fetchDeploymentConfig();
}
