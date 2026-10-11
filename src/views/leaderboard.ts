import type { LeaderboardAccount } from 'papertrade-sdk';
import { fetchLeaderboard, LB_PAGE_SIZE, type LeaderboardPage } from '../api';
import { ago, compact, esc, paper, shortHex, signClass, usd, usdSigned, wad } from '../format';
import { applyBars, emptyState, errorState, isAbort, messageOf, skeleton, stat, statSkeletons, type Ctx } from '../kit';
import { LB_WINDOWS, leaderboardHref, walletHref, type LbSortKey, type LbWindow, type Route } from '../router';

type State = Extract<Route, { name: 'leaderboard' }>;

interface Column {
  key: LbSortKey;
  label: string;
  right: boolean;
  cell(a: LeaderboardAccount, rank: number): string;
  /** Direction applied the first time a column header is chosen. */
  first: 'asc' | 'desc';
}

const pnlCell = (raw: string) => {
  const v = wad(raw);
  return `<span class="${signClass(v)}">${usdSigned(v)}</span>`;
};

const COLUMNS: Column[] = [
  { key: 'rank', label: 'Rank', right: false, first: 'asc', cell: (a, r) => `<span class="rank ${r <= 3 ? `r${r}` : ''}">${r.toLocaleString('en-US')}</span>` },
  {
    key: 'address',
    label: 'Wallet',
    right: false,
    first: 'asc',
    cell: (a) => `<a href="${walletHref(a.address)}" class="mono">${a.leaderboardName ? `<strong>${esc(a.leaderboardName)}</strong> <span class="faint">${esc(shortHex(a.address))}</span>` : esc(shortHex(a.address, 8, 6))}</a>`,
  },
  { key: 'totalWindowedPnl', label: 'PnL (window)', right: true, first: 'desc', cell: (a) => pnlCell(a.totalWindowedPnl) },
  { key: 'realizedPnl', label: 'Realized', right: true, first: 'desc', cell: (a) => pnlCell(a.realizedPnl) },
  { key: 'currentUnrealizedPnl', label: 'Unrealized', right: true, first: 'desc', cell: (a) => pnlCell(a.currentUnrealizedPnl) },
  { key: 'currentBalance', label: 'Balance', right: true, first: 'desc', cell: (a) => usd(wad(a.currentBalance)) },
  { key: 'currentQueued', label: 'Queued', right: true, first: 'desc', cell: (a) => usd(wad(a.currentQueued)) },
  { key: 'currentOpenNotional', label: 'Open notional', right: true, first: 'desc', cell: (a) => usd(wad(a.currentOpenNotional)) },
  { key: 'currentOpenPositionCount', label: 'Open', right: true, first: 'desc', cell: (a) => String(a.currentOpenPositionCount) },
  { key: 'totalVolume', label: 'Volume', right: true, first: 'desc', cell: (a) => `$${compact(wad(a.totalVolume))}` },
  { key: 'paperTotal', label: 'PAPER', right: true, first: 'desc', cell: (a) => compact(wad(a.paperTotal)) },
  { key: 'lastActiveTs', label: 'Last active', right: true, first: 'desc', cell: (a) => `<span class="muted">${ago(a.lastActiveTs * 1000)}</span>` },
];

const WINDOW_LABEL: Record<LbWindow, string> = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'All time' };

export function mountLeaderboard(initial: State) {
  return (root: HTMLElement, ctx: Ctx): void => {
    let state: State = { ...initial };
    let controller: AbortController | null = null;
    let typing = 0;

    root.innerHTML = `
      <p class="eyebrow">Leaderboard</p>
      <h1>Who is winning on Papertrade</h1>
      <p class="lede">Every tracked wallet, ranked live. Sort by any column, switch the window, or search a wallet name or address.</p>
      <div class="filters">
        <div class="seg" role="group" aria-label="Window" id="lb-window">${LB_WINDOWS.map((w) => `<button type="button" data-window="${w}" aria-pressed="${w === state.window}">${WINDOW_LABEL[w]}</button>`).join('')}</div>
        <label class="sr" for="lb-q">Search leaderboard by name or address</label>
        <input type="search" id="lb-q" placeholder="Search name or address" value="${esc(state.q)}" maxlength="64" autocomplete="off" spellcheck="false">
      </div>
      <div id="lb-summary">${statSkeletons(4)}</div>
      <section class="card" aria-label="Leaderboard table"><div id="lb-table">${skeleton(6, true)}</div></section>`;

    const table = root.querySelector<HTMLElement>('#lb-table')!;
    const summary = root.querySelector<HTMLElement>('#lb-summary')!;
    const input = root.querySelector<HTMLInputElement>('#lb-q')!;

    const href = () => leaderboardHref(state);

    function sync(mode: 'push' | 'replace'): void {
      const url = href();
      if (url !== location.hash) (mode === 'push' ? history.pushState : history.replaceState).call(history, null, '', url);
    }

    function paintControls(): void {
      root.querySelectorAll('#lb-window button').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.window === state.window)));
    }

    async function load(): Promise<void> {
      controller?.abort();
      const mine = (controller = new AbortController());
      const stopOnLeave = () => mine.abort();
      ctx.signal.addEventListener('abort', stopOnLeave, { once: true });
      table.setAttribute('aria-busy', 'true');
      table.innerHTML = skeleton(6, true);
      try {
        const data = await fetchLeaderboard(state, mine.signal);
        if (mine.signal.aborted) return;
        paintSummary(data);
        paintTable(data);
      } catch (e) {
        if (isAbort(e) || mine.signal.aborted) return;
        summary.innerHTML = '';
        table.innerHTML = errorState('Could not load the leaderboard', messageOf(e));
        table.querySelector('[data-retry]')?.addEventListener('click', () => void load());
      } finally {
        if (controller === mine) table.removeAttribute('aria-busy');
      }
    }

    function paintSummary(d: LeaderboardPage): void {
      const s = d.summary;
      summary.innerHTML = `<div class="grid stats">
        ${stat('Tracked wallets', s.uniqueAccounts.toLocaleString('en-US'), state.q ? `${d.count.toLocaleString('en-US')} match "${esc(state.q)}"` : 'With any history')}
        ${stat('Tracked balance', `$${compact(wad(s.trackedBalance))}`, `$${compact(wad(s.trackedQueued))} queued`)}
        ${stat('Open notional', `$${compact(wad(s.trackedOpenNotional))}`, 'Across all open positions')}
        ${stat('PAPER tracked', paper(wad(s.trackedPaper)), 'Held and staked')}
      </div>`;
    }

    function paintTable(d: LeaderboardPage): void {
      if (!d.accounts.length) {
        table.innerHTML = emptyState(state.q ? 'No wallets match that search' : 'No wallets in this window yet', state.q ? `Nothing on the ${WINDOW_LABEL[state.window]} leaderboard matches "${esc(state.q)}". Try part of a name, or paste a full wallet address into the search bar above to open it directly.` : 'Wallets appear here once they trade.', state.q ? '<button type="button" class="btn ghost" id="lb-clear">Clear search</button>' : '');
        table.querySelector('#lb-clear')?.addEventListener('click', () => {
          input.value = '';
          state = { ...state, q: '', page: 0 };
          sync('push');
          void load();
        });
        return;
      }
      const base = d.pageInfo.page * LB_PAGE_SIZE;
      const head = COLUMNS.map((c) => {
        const active = state.sortKey === c.key;
        const aria = active ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
        return `<th class="${c.right ? 'r' : ''}" scope="col" aria-sort="${aria}"><button type="button" class="sort" data-sort="${c.key}">${esc(c.label)}<span aria-hidden="true">${active ? (state.sortDir === 'asc' ? '▲' : '▼') : ''}</span></button></th>`;
      }).join('');
      const body = d.accounts
        .map((a, i) => `<tr>${COLUMNS.map((c) => `<td class="${c.right ? 'r' : ''}">${c.cell(a, a._leaderboardRank ?? base + i + 1)}</td>`).join('')}</tr>`)
        .join('');
      const { page, totalPages } = d.pageInfo;
      table.innerHTML = `
        <div class="tablewrap"><table><caption class="sr">Papertrade leaderboard, ${WINDOW_LABEL[state.window]} window, page ${page + 1} of ${totalPages}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>
        <nav class="pager" aria-label="Pagination">
          <button type="button" class="btn ghost small" data-page="0" ${page <= 0 ? 'disabled' : ''}>First</button>
          <button type="button" class="btn ghost small" data-page="${page - 1}" ${page <= 0 ? 'disabled' : ''}>Previous</button>
          <span class="muted num">Page ${(page + 1).toLocaleString('en-US')} of ${totalPages.toLocaleString('en-US')}</span>
          <button type="button" class="btn ghost small" data-page="${page + 1}" ${page + 1 >= totalPages ? 'disabled' : ''}>Next</button>
          <button type="button" class="btn ghost small" data-page="${totalPages - 1}" ${page + 1 >= totalPages ? 'disabled' : ''}>Last</button>
        </nav>`;
      applyBars(table);
    }

    table.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const sort = target.closest<HTMLButtonElement>('button[data-sort]');
      if (sort) {
        const key = sort.dataset.sort as LbSortKey;
        const col = COLUMNS.find((c) => c.key === key)!;
        state = { ...state, sortKey: key, sortDir: state.sortKey === key ? (state.sortDir === 'asc' ? 'desc' : 'asc') : col.first, page: 0 };
        sync('push');
        void load().then(() => root.querySelector<HTMLButtonElement>(`button[data-sort="${key}"]`)?.focus());
        return;
      }
      const pager = target.closest<HTMLButtonElement>('button[data-page]');
      if (pager && !pager.disabled) {
        state = { ...state, page: Math.max(0, Number(pager.dataset.page)) };
        sync('push');
        void load();
        root.scrollIntoView({ block: 'start' });
      }
    });
    root.querySelector('#lb-window')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-window]');
      if (!b || b.dataset.window === state.window) return;
      state = { ...state, window: b.dataset.window as LbWindow, page: 0 };
      paintControls();
      sync('push');
      void load();
    });
    input.addEventListener('input', () => {
      window.clearTimeout(typing);
      typing = window.setTimeout(() => {
        const q = input.value.trim();
        if (q === state.q) return;
        state = { ...state, q, page: 0 };
        sync('replace');
        void load();
      }, 300);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && input.value) {
        input.value = '';
        input.dispatchEvent(new Event('input'));
      }
    });
    ctx.onDispose(() => {
      window.clearTimeout(typing);
      controller?.abort();
    });
    void load();
  };
}
