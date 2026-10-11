import { streamWallet, type AccountTrade, type Instrument, type TradingState, type WalletState } from 'papertrade-sdk';
import { client } from '../api';
import { ago, dateTime, esc, pct, priceText, signClass, usd, usdSigned, paper, wad } from '../format';
import { copyButton, emptyState, errorState, isAbort, messageOf, skeleton, stat, type Ctx } from '../kit';
import { pollMarks, tradingState, type Marks } from '../marks';
import { distanceBand, positionView } from '../positions';
import { isAddress } from '../query';
import { intentHref, positionHref, txHref, walletHref } from '../router';
import { tradeNet } from './wallet';

const MAX_TRADE_PAGES = 8;

export function mountPosition(id: string, walletParam: string | null) {
  return (root: HTMLElement, ctx: Ctx): void => {
    root.innerHTML = `<p class="eyebrow">Position</p><h1>Position #${esc(id)}</h1><div class="stack" id="ps-body">${skeleton(4, true)}</div>`;
    const body = root.querySelector<HTMLElement>('#ps-body')!;

    function askWallet(note: string): void {
      body.innerHTML = `<section class="card">${emptyState('Which wallet owns this position?', note)}
        <form id="ps-form" class="filters"><label class="sr" for="ps-w">Owner wallet address</label><input type="search" id="ps-w" placeholder="Wallet address (0x...)" maxlength="42" spellcheck="false" autocomplete="off"><button class="btn" type="submit">Look up position</button></form>
        <p class="neg" id="ps-err" role="alert"></p></section>`;
      body.querySelector<HTMLFormElement>('#ps-form')!.addEventListener('submit', (e) => {
        e.preventDefault();
        const v = body.querySelector<HTMLInputElement>('#ps-w')!.value.trim().toLowerCase();
        if (!isAddress(v)) {
          body.querySelector('#ps-err')!.textContent = 'That is not a wallet address. It should be 0x followed by 40 hex characters.';
          return;
        }
        location.hash = positionHref(id, v);
      });
    }

    if (!walletParam) {
      client
        .recentTrades(ctx.signal)
        .then((r) => {
          const e = r.events.find((x) => x.positionId === id);
          if (e) {
            history.replaceState(null, '', positionHref(id, e.wallet));
            watch(e.wallet);
          } else {
            askWallet('Position ids are not indexed by id, so the owner is needed to look one up. It is not among the newest trades in the live feed. Paste the owner wallet and we will find it in their open positions or trade history.');
          }
        })
        .catch((e) => {
          if (isAbort(e)) return;
          body.innerHTML = errorState('Could not search the live trade feed', messageOf(e));
          body.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
        });
    } else {
      watch(walletParam);
    }

    function watch(wallet: string): void {
      body.innerHTML = skeleton(4, true);
      let state: WalletState | null = null;
      let trading: TradingState | null = null;
      let marks: Marks = new Map();
      let closed: AccountTrade | null | 'searching' = 'searching';
      let searched = false;

      async function findClosed(): Promise<void> {
        closed = 'searching';
        let cursor: string | undefined;
        try {
          for (let page = 0; page < MAX_TRADE_PAGES; page++) {
            const r = await client.accountTrades(wallet as `0x${string}`, cursor ? { cursor } : {}, ctx.signal);
            const hit = r.items.find((t) => t.positionId === id);
            if (hit) {
              closed = hit;
              return paint();
            }
            if (!r.nextCursor) break;
            cursor = r.nextCursor;
          }
          closed = null;
        } catch (e) {
          if (isAbort(e)) return;
          closed = null;
        }
        paint();
      }

      function paint(): void {
        if (!state || !trading) return;
        const open = state.positions.find((p) => p.positionId.toString() === id);
        const header = `<p class="muted">Owner <a class="mono" href="${walletHref(wallet)}">${esc(wallet)}</a> ${copyButton(wallet, 'Copy address')}</p>`;
        if (open) {
          const ins = trading.instruments.find((i) => i.id === open.instrumentId) as Instrument;
          const v = positionView(open, ins, marks.get(open.instrumentId) ?? null);
          const band = distanceBand(v.distance);
          body.innerHTML = `${header}
            <div class="addr-line"><span class="chip pos">Open</span><span class="side ${v.isLong ? 'long' : 'short'}">${v.isLong ? 'Long' : 'Short'} ${v.leverage}x</span><strong>${esc(v.symbol)}</strong><span class="live" data-status="live"><span class="dot"></span>Live</span></div>
            <div class="grid stats">
              ${stat('Unrealized PnL', v.unrealized === null ? '-' : usdSigned(v.unrealized), 'At the live mark', signClass(v.unrealized ?? 0))}
              ${stat('Mark price', v.markRaw === null ? '...' : priceText(v.markRaw, v.priceScale))}
              ${stat('Entry price', priceText(v.entryRaw, v.priceScale))}
              ${stat('Bust price', priceText(v.bustRaw, v.priceScale), v.distance === null ? '' : v.distance < 0 ? 'Mark is past the bust price' : `${pct(v.distance, 3)} away`, band === 'danger' ? 'neg' : '')}
              ${stat('Margin', usd(v.margin), `${usd(v.notional)} notional`)}
              ${stat('Opened', ago(v.openedAtMs), esc(dateTime(v.openedAtMs)))}
            </div>
            <section class="card"><dl class="kv"><dt>Position id</dt><dd class="mono">${esc(v.id)}</dd><dt>Funding</dt><dd>${v.useDebt ? 'Margin partly funded by debt' : 'Margin from balance'}</dd>${v.intentId ? `<dt>Opened by intent</dt><dd class="mono wrapword"><a href="${intentHref(v.intentId, wallet)}">${esc(v.intentId)}</a></dd>` : ''}</dl></section>`;
          return;
        }
        if (!searched) {
          searched = true;
          void findClosed();
        }
        if (closed === 'searching') {
          body.innerHTML = `${header}${skeleton(3, true)}<p class="muted">Not open. Searching this wallet's trade history...</p>`;
          return;
        }
        if (!closed) {
          body.innerHTML = `${header}${emptyState('Position not found for this wallet', `Position #${esc(id)} is not open for this wallet and is not in its last ${MAX_TRADE_PAGES * 75} closed trades. Check the position id, or open the <a href="${walletHref(wallet)}">wallet page</a>.`)}`;
          return;
        }
        const t = closed;
        const net = tradeNet(t);
        const priceRows = `<dt>Entry</dt><dd class="num">${priceText(t.entryPriceRaw, t.priceScaleRaw)}</dd><dt>Exit</dt><dd class="num">${priceText(t.exitPriceRaw, t.priceScaleRaw)}</dd>`;
        body.innerHTML = `${header}
          <div class="addr-line">${t.kind === 'Liquidated' ? '<span class="chip neg">Liquidated</span>' : '<span class="chip">Closed</span>'}<span class="side ${t.isLong ? 'long' : 'short'}">${t.isLong ? 'Long' : 'Short'} ${t.leverage}x</span><strong>${esc(t.symbol)}</strong></div>
          <div class="grid stats">
            ${stat('Net PnL', usdSigned(net), t.kind === 'Liquidated' ? 'Margin lost' : `${usd(wad(t.userPaidFeeRaw))} win fee paid`, signClass(net))}
            ${stat('PAPER minted', paper(wad(t.paperMintedRaw)), `on ${usd(wad(t.paperMintBasisRaw))} loss basis`)}
            ${stat('Margin', usd(wad(t.marginRaw)), `${usd(wad(t.marginRaw) * t.leverage)} notional`)}
            ${stat('Held', `${Math.max(1, Math.round((t.timestampMs - t.openedAtMs) / 1000))}s`, `Opened ${esc(dateTime(t.openedAtMs))}`)}
          </div>
          <section class="card"><dl class="kv">${priceRows}<dt>Closed</dt><dd>${esc(dateTime(t.timestampMs))} (${ago(t.timestampMs)})</dd><dt>Transaction</dt><dd class="mono wrapword"><a href="${txHref(t.txHash)}">${esc(t.txHash)}</a></dd></dl></section>`;
      }

      const stop = streamWallet({
        wallet: wallet as `0x${string}`,
        baseUrl: '/api/papertrade',
        signal: ctx.signal,
        onState: (s) => {
          const wasOpen = state?.positions.some((p) => p.positionId.toString() === id);
          state = s;
          if (wasOpen && !s.positions.some((p) => p.positionId.toString() === id)) searched = false;
          paint();
        },
      });
      ctx.onDispose(stop);
      tradingState()
        .then((t) => {
          trading = t;
          paint();
        })
        .catch((e) => {
          if (isAbort(e)) return;
          body.innerHTML = errorState('Could not load market parameters', messageOf(e));
          body.querySelector('[data-retry]')?.addEventListener('click', () => location.reload());
        });
      ctx.onDispose(
        pollMarks({
          instruments: () => {
            const ids = new Set(state?.positions.filter((p) => p.positionId.toString() === id).map((p) => p.instrumentId));
            return (trading?.instruments ?? []).filter((i) => ids.has(i.id));
          },
          onMarks: (m) => {
            marks = m;
            paint();
          },
          signal: ctx.signal,
        }),
      );
    }
  };
}
