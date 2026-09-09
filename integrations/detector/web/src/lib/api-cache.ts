const cache = new Map<string, { data: unknown; ts: number }>();
const pending = new Map<string, Promise<unknown>>();
const CACHE_TTL = 30_000;

export function invalidateCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function clearRequestState(): void {
  cache.clear();
  pending.clear();
}

export async function cachedFetch<T>(path: string, fetchFn: () => Promise<T>): Promise<T> {
  const entry = cache.get(path);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  if (pending.has(path)) return pending.get(path) as Promise<T>;

  const promise = fetchFn()
    .then(data => {
      cache.set(path, { data, ts: Date.now() });
      pending.delete(path);
      return data;
    })
    .catch(error => {
      pending.delete(path);
      throw error;
    });

  pending.set(path, promise as Promise<unknown>);
  return promise;
}
