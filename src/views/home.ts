import { client } from '../api';
import { ago, compact, esc, shortHex, usd, wad } from '../format';
import { emptyState, loadInto, skeleton, stat, statSkeletons, type Ctx } from '../kit';
import { intentHref, positionHref, walletHref } from '../router';

export function mountHome(root: HTMLElement, ctx: Ctx): void {
  root.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Unofficial explorer for Papertrade on HyperEVM</p>
      <h1>Look up any wallet, position or intent.</h1>
      <p class="lede">Papertrade is a fully on-chain 1000x synthetic perps exchange. This explorer shows live positions with bust prices, portfolio history, the leaderboard, and decodes settlement transactions into the intents they carried.</p>
    </section>
    <ul class="paste-list" aria-label="What you can paste into the search bar">
      <li><b>A wallet address</b><code>0x + 40 hex characters</code><p class="muted">Live balance, open positions, PnL, rank, session keys and trade history.</p></li>
      <li><b>A transaction hash</b><code>0x + 64 hex characters</code><p class="muted">A HyperEVM settlement tx, decoded into every intent in its batch.</p></li>
      <li><b>An intent id</b><code>0x + 64 hex characters</code><p class="muted">Where a signed intent is: queued, settled, or failed.</p></li>
      <li><b>A position id or a name</b><code>48503, or part of a leaderboard name</code><p class="muted">Find a position by id, or search leaderboard names.</p></li>
    </ul>
    <div class="stack">
      <div id="hm-stats">${statSkeletons(4)}</div>
      <section class="card" aria-labelledby="hm-t"><header><h2 id="hm-t">Latest trades</h2><span class="muted">Live feed. Open a wallet, position or intent from any row.</span></header><div id="hm-trades">${skeleton(5, true)}</div></section>
    </div>`;

  loadInto(
    root.querySelector<HTMLElement>('#hm-stats')!,
    ctx,
    statSkeletons(4),
    (signal) => client.protocolSummary(signal),
    (s) => `<div class="grid stats">
      ${stat('Value locked', `$${compact(wad(s.balances.tvl))}`, `$${compact(wad(s.balances.lp))} LP`)}
      ${stat('Lifetime volume', `$${compact(wad(s.activity.volume))}`, `${s.activity.open.toLocaleString('en-US')} open positions`)}
      ${stat('PAPER supply', compact(wad(s.paper.supply)), `${compact(wad(s.paper.staked))} staked`)}
      ${stat('Fees', usd(wad(s.fees.lifetime)), `${usd(wad(s.fees.pending))} pending`)}
    </div>`,
  );

  loadInto(
    root.querySelector<HTMLElement>('#hm-trades')!,
    ctx,
    skeleton(5, true),
    (signal) => client.recentTrades(signal),
    (r) =>
      r.events.length
        ? `<div class="tablewrap"><table><thead><tr><th>When</th><th>Event</th><th>Market</th><th class="r">Notional</th><th>Wallet</th><th>Position</th><th>Intent</th></tr></thead><tbody>${r.events
            .slice(0, 12)
            .map(
              (e) => `<tr>
                <td class="muted">${ago(e.ts)}</td>
                <td><span class="chip ${e.kind === 'liquidation' ? 'neg' : ''}">${esc(e.kind)}</span></td>
                <td><span class="side ${e.side}">${esc(e.side)} ${e.leverage}x</span> ${esc(e.instrument)}</td>
                <td class="r">${usd(e.notionalUsd)}</td>
                <td class="mono"><a href="${walletHref(e.wallet)}">${esc(shortHex(e.wallet, 6, 4))}</a></td>
                <td><a href="${positionHref(e.positionId, e.wallet)}">#${esc(e.positionId)}</a></td>
                <td class="mono">${e.intentId ? `<a href="${intentHref(e.intentId, e.wallet)}">${esc(shortHex(e.intentId, 6, 4))}</a>` : '<span class="faint">-</span>'}</td>
              </tr>`,
            )
            .join('')}</tbody></table></div>`
        : emptyState('No trades in the feed', 'The live feed is empty right now. It fills as soon as anyone trades.'),
  );
}
