/** Short-lived in-memory cache for list API responses (stale-while-revalidate). */

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 20_000;
const store = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export function cacheKey(path: string, orgId?: string | null): string {
  return `${orgId ?? "anon"}:${path}`;
}

export function getCached<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached<T>(key: string, value: T, ttlMs: number = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.includes(prefix)) {
      store.delete(key);
    }
  }
}

export async function cachedApiFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { ttlMs?: number; bypass?: boolean }
): Promise<T> {
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  if (!options?.bypass) {
    const hit = getCached<T>(key);
    if (hit !== null) {
      if (!inflight.has(key)) {
        const refresh = fetcher()
          .then((fresh) => {
            setCached(key, fresh, ttlMs);
            return fresh;
          })
          .catch(() => hit)
          .finally(() => {
            inflight.delete(key);
          });
        inflight.set(key, refresh);
      }
      return hit;
    }
  }
  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }
  const request = fetcher()
    .then((value) => {
      setCached(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}
