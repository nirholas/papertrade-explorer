import { isAddress, isHash } from './query';

export const LB_WINDOWS = ['24h', '7d', '30d', 'all'] as const;
export type LbWindow = (typeof LB_WINDOWS)[number];

export const LB_SORT_KEYS = [
  'rank',
  'address',
  'lastActiveTs',
  'totalWindowedPnl',
  'realizedPnl',
  'currentUnrealizedPnl',
  'currentBalance',
  'currentQueued',
  'currentOpenNotional',
  'totalVolume',
  'paperTotal',
  'currentOpenPositionCount',
] as const;
export type LbSortKey = (typeof LB_SORT_KEYS)[number];

export type Route =
  | { name: 'home' }
  | { name: 'wallet'; address: string }
  | { name: 'tx'; hash: string }
  | { name: 'intent'; id: string; wallet: string | null }
  | { name: 'position'; id: string; wallet: string | null }
  | { name: 'leaderboard'; window: LbWindow; sortKey: LbSortKey; sortDir: 'asc' | 'desc'; page: number; q: string }
  | { name: 'notfound'; hash: string };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const params = new URLSearchParams(queryPart);
  const seg = pathPart.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  if (seg.length === 0) return { name: 'home' };
  const walletParam = params.get('wallet')?.toLowerCase() ?? null;
  const wallet = walletParam && isAddress(walletParam) ? walletParam : null;
  switch (seg[0]) {
    case 'wallet':
      return seg[1] && isAddress(seg[1]) ? { name: 'wallet', address: seg[1].toLowerCase() } : { name: 'notfound', hash: raw };
    case 'tx':
      return seg[1] && isHash(seg[1]) ? { name: 'tx', hash: seg[1].toLowerCase() } : { name: 'notfound', hash: raw };
    case 'intent':
      return seg[1] && isHash(seg[1]) ? { name: 'intent', id: seg[1].toLowerCase(), wallet } : { name: 'notfound', hash: raw };
    case 'position': {
      if (seg.length >= 3 && isAddress(seg[1]) && /^\d+$/.test(seg[2])) return { name: 'position', id: seg[2], wallet: seg[1].toLowerCase() };
      return seg[1] && /^\d+$/.test(seg[1]) ? { name: 'position', id: seg[1], wallet } : { name: 'notfound', hash: raw };
    }
    case 'leaderboard': {
      const window = (LB_WINDOWS as readonly string[]).includes(params.get('window') ?? '') ? (params.get('window') as LbWindow) : '24h';
      const sortKey = (LB_SORT_KEYS as readonly string[]).includes(params.get('sort') ?? '') ? (params.get('sort') as LbSortKey) : 'totalWindowedPnl';
      const sortDir = params.get('dir') === 'asc' ? 'asc' : 'desc';
      const page = Math.max(0, Number.parseInt(params.get('page') ?? '0', 10) || 0);
      return { name: 'leaderboard', window, sortKey, sortDir, page, q: (params.get('q') ?? '').slice(0, 64) };
    }
    default:
      return { name: 'notfound', hash: raw };
  }
}

export function leaderboardHref(r: { window: LbWindow; sortKey: LbSortKey; sortDir: 'asc' | 'desc'; page: number; q: string }): string {
  const p = new URLSearchParams();
  if (r.window !== '24h') p.set('window', r.window);
  if (r.sortKey !== 'totalWindowedPnl') p.set('sort', r.sortKey);
  if (r.sortDir !== 'desc') p.set('dir', r.sortDir);
  if (r.page > 0) p.set('page', String(r.page));
  if (r.q) p.set('q', r.q);
  const qs = p.toString();
  return `#/leaderboard${qs ? `?${qs}` : ''}`;
}

export const walletHref = (a: string) => `#/wallet/${a.toLowerCase()}`;
export const txHref = (h: string) => `#/tx/${h.toLowerCase()}`;
export const intentHref = (id: string, wallet?: string | null) => `#/intent/${id.toLowerCase()}${wallet ? `?wallet=${wallet.toLowerCase()}` : ''}`;
export const positionHref = (id: string, wallet?: string | null) => (wallet ? `#/position/${wallet.toLowerCase()}/${id}` : `#/position/${id}`);
