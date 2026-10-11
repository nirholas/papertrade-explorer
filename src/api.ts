import { PapertradeClient, type LeaderboardAccounts, type LeaderboardSortKey, type LeaderboardWindow } from 'papertrade-sdk';
import type { LbSortKey } from './router';

export const client = new PapertradeClient({ baseUrl: '/api/papertrade', clientBuild: 'papertrade-explorer' });

export interface LeaderboardPage extends Omit<LeaderboardAccounts, 'summary'> {
  summary: LeaderboardAccounts['summary'];
  pageInfo: { page: number; totalPages: number };
}

export const LB_PAGE_SIZE = 25;

/** Leaderboard rows. Pages are 0-based and the page size is fixed at 25 by the API. */
export function fetchLeaderboard(opts: { window: LeaderboardWindow; sortKey: LbSortKey; sortDir: 'asc' | 'desc'; page: number; q: string }, signal?: AbortSignal) {
  return client.leaderboard(
    { window: opts.window, sortKey: opts.sortKey as LeaderboardSortKey, sortDir: opts.sortDir, page: opts.page, pageSize: LB_PAGE_SIZE, q: opts.q || undefined },
    signal,
  ) as unknown as Promise<LeaderboardPage>;
}
