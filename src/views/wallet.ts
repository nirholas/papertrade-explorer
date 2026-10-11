import { pendingStakingRewardRaw, streamWallet, type AccountTrade, type Instrument, type LeaderboardBadges, type LeaderboardWindow, type PortfolioRange, type TradingState, type WalletState, type WalletStreamStatus } from 'papertrade-sdk';
import { client } from '../api';
import { areaChart, portfolioPoints, type AreaChart, type Metric } from '../chart';
import { ago, compact, dateTime, esc, paper, pct, priceText, shortHex, signClass, until, usd, usdSigned, wad } from '../format';
import { applyBars, copyButton, emptyState, errorState, extLink, isAbort, loadInto, messageOf, scanAddress, skeleton, stat, statSkeletons, type Ctx } from '../kit';
import { pollMarks, tradingState, type Marks } from '../marks';
import { distanceBand, positionView } from '../positions';
import { intentHref, LB_WINDOWS, positionHref, txHref } from '../router';
import { PAGE_SIZE_TRADES } from './constants';

const RANGES: PortfolioRange[] = ['1h', '1d', '1w', 'all'];
const WINDOW_LABEL: Record<LeaderboardWindow, string> = { '24h': '24 hours', '7d': '7 days', '30d': '30 days', all: 'All time' };
const STATUS_LABEL: Record<WalletStreamStatus, string> = { connecting: 'Connecting', live: 'Live', reconnecting: 'Reconnecting', stopped: 'Stopped' };

const ACTION_LABEL: Record<string, string> = {
  openPosition: 'Open position',
  closePositions: 'Close positions',
  withdrawToCore: 'Withdraw to HyperCore',
  paperStake: 'Stake PAPER',
  paperUnstake: 'Unstake PAPER',
  paperClaim: 'Claim rewards',
  paperDistribute: 'Distribute rewards',
  registerSessionKey: 'Register session key',
};

export function tradeNet(t: Pick<AccountTrade, 'adjustedPnlRaw' | 'userPaidFeeRaw'>): number {
  return wad(BigInt(t.adjustedPnlRaw) - BigInt(t.userPaidFeeRaw));
}

export function mountWallet(address: string) {
  return (root: HTMLElement, ctx: Ctx): void => {
    root.innerHTML = `
      <section class="wallet-head" aria-labelledby="w-title">
        <p class="eyebrow">Wallet</p>
        <h1 id="w-title" class="sr">Wallet ${esc(address)}</h1>
        <div class="addr-line">
          <span class="addr" id="w-addr">${esc(address)}</span>
          ${copyButton(address, 'Copy address')}
          ${extLink(scanAddress(address), 'View on HyperEVMScan').replace('<a ', '<a class="iconbtn" ')}
        </div>
        <div class="addr-line" id="w-meta">
          <span class="live" id="w-live" data-status="connecting" role="status"><span class="dot" aria-hidden="true"></span><span id="w-live-text">Connecting</span></span>
          <span id="w-name"></span>
          <span id="w-sync" class="faint"></span>
        </div>
      </section>
      <div class="stack">
        <div id="w-stats">${statSkeletons(4)}</div>
        <section class="card" aria-labelledby="h-pos"><header><h2 id="h-pos">Open positions</h2><span class="muted" id="w-pos-sub"></span></header><div id="w-positions">${skeleton(3, true)}</div></section>
        <div id="w-ops"></div>
        <section class="card" aria-labelledby="h-chart">
          <header><h2 id="h-chart">Portfolio</h2>
            <div class="addr-line">
              <div class="seg" role="group" aria-label="Metric" id="w-metric"><button type="button" data-metric="equity" aria-pressed="true">Equity</button><button type="button" data-metric="pnl" aria-pressed="false">Net PnL</button></div>
              <div class="seg" role="group" aria-label="Range" id="w-range">${RANGES.map((r) => `<button type="button" data-range="${r}" aria-pressed="${r === '1d'}">${r}</button>`).join('')}</div>
            </div>
          </header>
          <div id="w-chart"></div>
        </section>
        <div class="grid two">
          <section class="card" aria-labelledby="h-rank"><header><h2 id="h-rank">Leaderboard</h2></header><div id="w-ranks">${skeleton(4)}</div></section>
          <section class="card" aria-labelledby="h-sess"><header><h2 id="h-sess">Session keys</h2></header><div id="w-sessions">${skeleton(2)}</div></section>
        </div>
        <section class="card" aria-labelledby="h-queue"><header><h2 id="h-queue">Queue balances</h2></header><div id="w-queue">${skeleton(2)}</div></section>
        <section class="card" aria-labelledby="h-trades"><header><h2 id="h-trades">Trade history</h2>
          <div class="seg" role="group" aria-label="Filter trades" id="w-filter"><button type="button" data-filter="all" aria-pressed="true">All</button><button type="button" data-filter="losses" aria-pressed="false">Losses</button></div>
        </header><div id="w-trades">${skeleton(4, true)}</div></section>
      </div>`;

    const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
    let state: WalletState | null = null;
    let trading: TradingState | null = null;
    let marks: Marks = new Map();

    const instruments = () => trading?.instruments ?? [];
    const instrumentOf = (id: number): Instrument | undefined => instruments().find((i) => i.id === id);

    function renderLive(): void {
      if (!state || !trading) return;
      const s = state;
      const positions = s.positions.map((p) => {
        const ins = instrumentOf(p.instrumentId);
        return ins ? positionView(p, ins, marks.get(p.instrumentId) ?? null) : null;
      });
      const views = positions.filter((p): p is NonNullable<typeof p> => p !== null);
      const unrealized = views.reduce((a, v) => a + (v.unrealized ?? 0), 0);
      const marginIn = views.reduce((a, v) => a + v.margin, 0);
      const notional = views.reduce((a, v) => a + v.notional, 0);
      const pending = pendingStakingRewardRaw({ stakedRaw: s.paper.staked, accRewardPerShareRaw: trading.accRewardPerShareRaw, rewardDebtRaw: s.paper.rewardDebt, pendingBaseRaw: s.paper.pendingBase });

      $('w-sync').textContent = `Indexed to block ${s.indexedThroughBlock.toLocaleString('en-US')}, ${ago(s.indexedThroughTimestamp * (s.indexedThroughTimestamp < 1e12 ? 1000 : 1))}`;
      $('w-stats').innerHTML = `
        <div class="grid stats eight">
          ${stat('Balance', usd(wad(s.balance)), `${usd(wad(s.funds.availableBalance))} available`)}
          ${stat('Queued', usd(wad(s.queued)), `${s.queueNodeCount} queue ${s.queueNodeCount === 1 ? 'node' : 'nodes'}`)}
          ${stat('Margin in positions', usd(marginIn), `${usd(notional)} notional`)}
          ${stat('Unrealized PnL', views.some((v) => v.unrealized !== null) ? usdSigned(unrealized) : '-', views.length ? 'At the live mark price' : 'No open positions', signClass(unrealized))}
          ${stat('Lifetime realized', usdSigned(wad(s.lifetime.realizedPnlRaw)), `${usd(wad(s.lifetime.feesPaidRaw))} fees paid`, signClass(wad(s.lifetime.realizedPnlRaw)))}
          ${stat('Traded notional', usd(wad(s.lifetime.tradedNotionalRaw)), `${usd(wad(s.lifetime.depositedRaw))} in, ${usd(wad(s.lifetime.withdrawnRaw))} out`)}
          ${stat('PAPER held', paper(wad(s.paper.balance)), 'Minted on losses')}
          ${stat('PAPER staked', paper(wad(s.paper.staked)), `${usd(wad(pending))} pending rewards`)}
        </div>`;

      $('w-pos-sub').textContent = views.length ? `${views.length} open` : '';
      $('w-positions').innerHTML = views.length
        ? `<div class="tablewrap"><table><thead><tr><th>Market</th><th>Side</th><th class="r">Entry</th><th class="r">Mark</th><th class="r">Unrealized PnL</th><th class="r">Margin</th><th class="r">Bust price</th><th>Distance to bust</th><th>Opened</th></tr></thead><tbody>${views
            .map((v) => {
              const band = distanceBand(v.distance);
              const runway = v.distance === null ? 0 : Math.max(0, v.distance * v.leverage * 100);
              return `<tr>
                <td><a href="${positionHref(v.id, address)}"><strong>${esc(v.symbol)}</strong> <span class="faint">#${esc(v.id)}</span></a></td>
                <td><span class="side ${v.isLong ? 'long' : 'short'}">${v.isLong ? 'Long' : 'Short'} ${v.leverage}x</span></td>
                <td class="r">${priceText(v.entryRaw, v.priceScale)}</td>
                <td class="r">${v.markRaw === null ? '<span class="faint">...</span>' : priceText(v.markRaw, v.priceScale)}</td>
                <td class="r ${signClass(v.unrealized ?? 0)}">${v.unrealized === null ? '-' : usdSigned(v.unrealized)}</td>
                <td class="r">${usd(v.margin)}</td>
                <td class="r">${priceText(v.bustRaw, v.priceScale)}</td>
                <td><div class="dist"><span class="num ${band === 'ok' ? '' : band === 'warn' ? '' : 'neg'}">${v.distance === null ? '-' : v.distance < 0 ? 'Past bust' : pct(v.distance, 3)}</span><div class="bar ${band === 'ok' ? '' : band}" role="img" aria-label="Distance to bust ${v.distance === null ? 'unknown' : pct(v.distance, 3)}"><i data-w="${runway.toFixed(1)}"></i></div></div></td>
                <td class="muted">${ago(v.openedAtMs)}</td>
              </tr>`;
            })
            .join('')}</tbody></table></div>`
        : emptyState('No open positions', 'This wallet is flat right now. Closed trades are listed below, and this table updates live the moment a position opens.');

      const ops = s.operations;
      $('w-ops').innerHTML = ops.length
        ? `<section class="card" aria-labelledby="h-ops"><header><h2 id="h-ops">Pending operations</h2><span class="muted">${ops.length} queued</span></header><div class="tablewrap"><table><thead><tr><th>Action</th><th>Intent</th><th>Accepted</th><th>Expires</th></tr></thead><tbody>${ops
            .map(
              (o) =>
                `<tr><td>${esc(ACTION_LABEL[o.action] ?? o.action)}</td><td class="mono"><a href="${intentHref(o.intentId, address)}">${esc(shortHex(o.intentId))}</a></td><td class="muted">${ago(o.acceptedAtMs)}</td><td class="muted">${until(Number(o.deadline) * 1000)}</td></tr>`,
            )
            .join('')}</tbody></table></div></section>`
        : '';

      const keys = Object.entries(s.sessionKeys);
      $('w-sessions').innerHTML = keys.length
        ? `<ul class="timeline">${keys
            .map(([key, expiry]) => {
              const ms = Number(expiry) * 1000;
              const active = ms > Date.now();
              return `<li class="${active ? 'ok' : 'bad'}"><span class="mark"></span><div><span class="chip ${active ? 'pos' : 'neg'}">${active ? 'Active' : 'Expired'}</span> <span class="mono">${esc(shortHex(key, 8, 6))}</span><div class="faint" title="${esc(dateTime(ms))}">${active ? `Expires ${until(ms).replace(' left', '')} from now` : `Expired ${ago(ms)}`}. Can trade, cannot withdraw.</div></div></li>`;
            })
            .join('')}</ul>`
        : emptyState('No session keys', 'This wallet has not registered a session key, so trades need a signature from the wallet itself.');

      applyBars(root);
    }

    // Live wallet stream.
    const stop = streamWallet({
      wallet: address as `0x${string}`,
      baseUrl: '/api/papertrade',
      signal: ctx.signal,
      onStatus: (status) => {
        const live = root.querySelector<HTMLElement>('#w-live');
        const text = root.querySelector<HTMLElement>('#w-live-text');
        if (!live || !text || ctx.signal.aborted) return;
        live.dataset.status = status;
        text.textContent = STATUS_LABEL[status];
      },
      onState: (next, kind) => {
        if (ctx.signal.aborted) return;
        state = next;
        renderLive();
        if (kind === 'update' && (next.closedPositions.length || next.intentOutcomes.length)) scheduleRefresh();
      },
    });
    ctx.onDispose(stop);

    tradingState()
      .then((t) => {
        trading = t;
        renderLive();
      })
      .catch((e) => {
        if (isAbort(e)) return;
        $('w-stats').innerHTML = errorState('Could not load market parameters', messageOf(e));
        $('w-stats').querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
      });

    ctx.onDispose(
      pollMarks({
        instruments: () => {
          const ids = new Set(state?.positions.map((p) => p.instrumentId));
          return instruments().filter((i) => ids.has(i.id));
        },
        onMarks: (m) => {
          marks = m;
          renderLive();
        },
        signal: ctx.signal,
      }),
    );

    // Portfolio chart.
    let chart: AreaChart | null = null;
    let range: PortfolioRange = '1d';
    let metric: Metric = 'equity';
    const chartEl = $('w-chart');
    const reloadChart = loadInto(
      chartEl,
      ctx,
      '<div class="chartbox"><div class="skeleton"><div class="sk tall"></div><div class="sk w80"></div></div></div>',
      (signal) => client.portfolioHistory(address as `0x${string}`, range, signal),
      (h) => {
        const pts = portfolioPoints(h, metric);
        return pts.length >= 2 ? '<div class="chartbox"><div class="tv" id="w-tv"></div></div>' : emptyState('No history in this range yet', 'Equity is sampled while the wallet has balance or positions. Try a longer range, or come back after this wallet trades.');
      },
      (el, h) => {
        chart?.destroy();
        chart = null;
        const host = el.querySelector<HTMLElement>('#w-tv');
        if (!host) return;
        chart = areaChart(host);
        chart.setData(portfolioPoints(h, metric));
      },
    );
    ctx.onDispose(() => chart?.destroy());
    root.querySelector('#w-range')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-range]');
      if (!b) return;
      range = b.dataset.range as PortfolioRange;
      root.querySelectorAll('#w-range button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      void reloadChart();
    });
    root.querySelector('#w-metric')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-metric]');
      if (!b) return;
      metric = b.dataset.metric as Metric;
      root.querySelectorAll('#w-metric button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      void reloadChart();
    });

    // Leaderboard placement and badges.
    loadInto(
      $('w-ranks'),
      ctx,
      skeleton(4),
      async (signal) => {
        const [placements, badges] = await Promise.all([Promise.all(LB_WINDOWS.map((w) => client.leaderboardPlacement(address as `0x${string}`, w, signal))), client.leaderboardBadges(address as `0x${string}`, signal)]);
        return { placements, badges };
      },
      ({ placements, badges }) => {
        const rows = LB_WINDOWS.map((w, i) => {
          const row = placements[i].selfRow;
          const rank = row?._leaderboardRank ?? (placements[i].selfIndex !== null ? placements[i].selfIndex! + 1 : null);
          if (!row || rank === null) return `<tr><td>${WINDOW_LABEL[w]}</td><td class="r faint" colspan="2">Unranked</td></tr>`;
          const pnl = wad(row.totalWindowedPnl);
          const page = Math.floor((rank - 1) / 25);
          return `<tr><td>${WINDOW_LABEL[w]}</td><td class="r"><a href="#/leaderboard?${new URLSearchParams({ ...(w === '24h' ? {} : { window: w }), ...(page ? { page: String(page) } : {}) }).toString()}"><span class="rank ${rank <= 3 ? `r${rank}` : ''}">#${rank.toLocaleString('en-US')}</span></a></td><td class="r ${signClass(pnl)}">${usdSigned(pnl)}</td></tr>`;
        }).join('');
        const name = placements.map((p) => p.selfRow?.leaderboardName).find(Boolean);
        if (name) $('w-name').innerHTML = `<span class="chip accent">${esc(name)}</span>`;
        return `<table><thead><tr><th>Window</th><th class="r">Rank</th><th class="r">PnL</th></tr></thead><tbody>${rows}</tbody></table>${badgeChips(badges)}`;
      },
    );

    // Queue balances.
    loadInto(
      $('w-queue'),
      ctx,
      skeleton(2),
      (signal) => client.queueBalances(address as `0x${string}`, {}, signal),
      (q) => {
        const total = wad(q.account.total);
        return q.account.count || total
          ? `<div class="grid stats">${stat('This wallet in the queue', usd(total), `${q.account.count} ${q.account.count === 1 ? 'entry' : 'entries'}`)}${stat('Whole queue', usd(wad(q.total)), `${q.count.toLocaleString('en-US')} entries from all wallets`)}</div>`
          : emptyState('Nothing queued', `This wallet has no balance waiting in the settlement queue. The whole queue holds ${usd(wad(q.total))} across ${q.count.toLocaleString('en-US')} entries.`);
      },
    );

    // Trade history.
    let filter: 'all' | 'losses' = 'all';
    let trades: AccountTrade[] = [];
    let cursor: string | null = null;
    const tradesEl = $('w-trades');
    const renderTrades = (more: boolean, loadingMore = false, err = '') => {
      if (!trades.length) {
        tradesEl.innerHTML = emptyState(filter === 'losses' ? 'No losing trades' : 'No closed trades yet', filter === 'losses' ? 'Nothing in this wallet\'s history closed at a loss.' : 'When this wallet closes or is liquidated, the result appears here with net PnL and the PAPER it minted.');
        return;
      }
      const net = trades.reduce((a, t) => a + tradeNet(t), 0);
      const mint = trades.reduce((a, t) => a + wad(t.paperMintedRaw), 0);
      const wins = trades.filter((t) => tradeNet(t) > 0).length;
      tradesEl.innerHTML = `
        <p class="muted">${trades.length}${more ? '+' : ''} trades loaded. Net <strong class="${signClass(net)}">${usdSigned(net)}</strong>, ${wins} winning, ${paper(mint)} minted.</p>
        <div class="tablewrap"><table><thead><tr><th>Closed</th><th>Market</th><th>Side</th><th class="r">Entry</th><th class="r">Exit</th><th class="r">Margin</th><th class="r">Net PnL</th><th class="r">PAPER minted</th><th>Result</th><th>Links</th></tr></thead><tbody>${trades
          .map((t) => {
            const n = tradeNet(t);
            const minted = wad(t.paperMintedRaw);
            return `<tr>
              <td class="muted" title="${esc(dateTime(t.timestampMs))}">${ago(t.timestampMs)}</td>
              <td><strong>${esc(t.symbol)}</strong></td>
              <td><span class="side ${t.isLong ? 'long' : 'short'}">${t.isLong ? 'Long' : 'Short'} ${t.leverage}x</span></td>
              <td class="r">${priceText(t.entryPriceRaw, t.priceScaleRaw)}</td>
              <td class="r">${priceText(t.exitPriceRaw, t.priceScaleRaw)}</td>
              <td class="r">${usd(wad(t.marginRaw))}</td>
              <td class="r ${signClass(n)}">${usdSigned(n)}</td>
              <td class="r">${minted > 0 ? compact(minted) : '-'}</td>
              <td>${t.kind === 'Liquidated' ? '<span class="chip neg">Liquidated</span>' : '<span class="chip">Closed</span>'}</td>
              <td><a href="${positionHref(t.positionId, address)}">#${esc(t.positionId)}</a> <a href="${txHref(t.txHash)}">tx</a></td>
            </tr>`;
          })
          .join('')}</tbody></table></div>
        ${err ? `<p class="neg" role="alert">${esc(err)}</p>` : ''}
        ${more ? `<div class="pager"><button type="button" class="btn ghost" id="w-more" ${loadingMore ? 'disabled' : ''}>${loadingMore ? 'Loading' : `Load next ${PAGE_SIZE_TRADES}`}</button></div>` : ''}`;
      tradesEl.querySelector('#w-more')?.addEventListener('click', () => void loadTrades(true));
    };
    async function loadTrades(append: boolean): Promise<void> {
      if (!append) {
        tradesEl.innerHTML = skeleton(4, true);
        trades = [];
        cursor = null;
      } else {
        renderTrades(true, true);
      }
      try {
        const page = await client.accountTrades(address as `0x${string}`, { filter, ...(append && cursor ? { cursor } : {}) }, ctx.signal);
        if (ctx.signal.aborted) return;
        trades = append ? [...trades, ...page.items] : page.items;
        cursor = page.nextCursor;
        renderTrades(!!cursor);
      } catch (e) {
        if (isAbort(e) || ctx.signal.aborted) return;
        if (append) {
          renderTrades(true, false, messageOf(e));
        } else {
          tradesEl.innerHTML = errorState('Could not load trade history', messageOf(e));
          tradesEl.querySelector('[data-retry]')?.addEventListener('click', () => void loadTrades(false));
        }
      }
    }
    void loadTrades(false);
    root.querySelector('#w-filter')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]');
      if (!b || b.dataset.filter === filter) return;
      filter = b.dataset.filter as 'all' | 'losses';
      root.querySelectorAll('#w-filter button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      void loadTrades(false);
    });

    let refreshTimer = 0;
    function scheduleRefresh(): void {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadTrades(false);
        void reloadChart();
      }, 2500);
    }
    ctx.onDispose(() => window.clearTimeout(refreshTimer));
  };
}

function badgeChips(b: LeaderboardBadges): string {
  const labels: [keyof LeaderboardBadges['badges'], string][] = [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['allTime', 'All time']];
  const chips = labels.flatMap(([k, label]) => {
    const v = b.badges[k];
    return [v.first ? `<span class="chip warn">${label} #1 x${v.first}</span>` : '', v.top3 ? `<span class="chip accent">${label} top 3 x${v.top3}</span>` : '', v.top15 ? `<span class="chip">${label} top 15 x${v.top15}</span>` : ''];
  }).filter(Boolean);
  return chips.length ? `<h3 class="sec-head">Badges</h3><div class="addr-line">${chips.join('')}</div>` : '<p class="muted">No leaderboard badges yet. Finishing a day, week or month in the top 15 earns one.</p>';
}
