const KEY = 'papertrade-explorer.recent.v1';
const MAX = 8;

export interface RecentSearch {
  value: string;
  href: string;
  label: string;
  at: number;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadRecent(store: Storage | null = storage()): RecentSearch[] {
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is RecentSearch => !!r && typeof r.value === 'string' && typeof r.href === 'string' && typeof r.label === 'string' && typeof r.at === 'number' && r.href.startsWith('#/'))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function addRecent(entry: Omit<RecentSearch, 'at'>, store: Storage | null = storage(), now = Date.now()): RecentSearch[] {
  const next = [{ ...entry, at: now }, ...loadRecent(store).filter((r) => r.href !== entry.href)].slice(0, MAX);
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: recents are a convenience */
  }
  return next;
}

export function clearRecent(store: Storage | null = storage()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
