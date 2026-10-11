import { fetchWalletState, type OpenPosition, type PendingOperation, type RecentTradeEvent } from 'papertrade-sdk';
import { client } from '../api';
import { decodeBatchInput, executionResults, KIND_LABEL, type DecodedIntent } from '../calldata';
import { findIntentTx, getReceipt, getTransaction, LOG_WINDOW } from '../chain';
import { describeIntent } from '../describe';
import { ago, dateTime, esc, shortHex, usd } from '../format';
import { copyButton, isAbort, messageOf, type Ctx } from '../kit';
import { tradingState } from '../marks';
import { intentHref, positionHref, txHref, walletHref } from '../router';
import { isAddress } from '../query';

const SCAN_WINDOWS = 6;

interface Facts {
  wallet: string | null;
  feed: RecentTradeEvent | null | 'pending';
  op: PendingOperation | null | 'pending' | 'skipped';
  position: OpenPosition | null | 'pending' | 'skipped';
  chain: { state: 'pending'; done: number } | { state: 'none' } | { state: 'error'; message: string } | { state: 'found'; txHash: string; blockNumber: number; intent: DecodedIntent | null; executed: boolean | null; description: string };
}

export function mountIntent(id: string, walletParam: string | null) {
  return (root: HTMLElement, ctx: Ctx): void => {
    const facts: Facts = { wallet: walletParam, feed: 'pending', op: walletParam ? 'pending' : 'skipped', position: walletParam ? 'pending' : 'skipped', chain: { state: 'pending', done: 0 } };

    function paint(): void {
      const rows: string[] = [];
      const line = (cls: 'ok' | 'bad' | 'wait', title: string, body: string) => rows.push(`<li class="${cls}"><span class="mark"></span><div><strong>${title}</strong><div class="muted">${body}</div></div></li>`);

      if (facts.feed === 'pending') line('wait', 'Live trade feed', 'Checking the latest trades...');
      else if (facts.feed) {
        const e = facts.feed;
        line('ok', 'In the live trade feed', `${esc(e.kind)} ${esc(e.side)} ${esc(e.instrument)} at ${e.leverage}x for ${usd(e.notionalUsd)}, position <a href="${positionHref(e.positionId, e.wallet)}">#${esc(e.positionId)}</a>, ${ago(e.ts)}${e.pnlUsd !== null ? `, PnL ${usd(e.pnlUsd)}` : ''}.`);
      } else line('wait', 'Not in the live trade feed', 'The feed only holds the newest trades, so older intents will not appear here.');

      if (facts.op === 'pending') line('wait', 'Relayer queue', 'Checking this wallet\'s pending operations...');
      else if (facts.op && facts.op !== 'skipped') line('ok', 'Pending in the relayer queue', `${esc(op(facts.op))}, accepted ${ago(facts.op.acceptedAtMs)}. It settles on-chain in the next batch, or expires at ${esc(dateTime(Number(facts.op.deadline) * 1000))}.`);
      else if (facts.op === null) line('wait', 'Not pending', 'This wallet has no queued operation with this id. It already settled, expired, or belongs to another wallet.');

      if (facts.position && facts.position !== 'pending' && facts.position !== 'skipped') line('ok', 'Created a live position', `Open position <a href="${positionHref(facts.position.positionId.toString(), facts.wallet)}">#${facts.position.positionId.toString()}</a> was opened by this intent.`);

      const c = facts.chain;
      if (c.state === 'pending') line('wait', 'Settlement on HyperEVM', `Scanning recent blocks for the BatchExecutor event (${c.done} of ${SCAN_WINDOWS} windows of ${LOG_WINDOW} blocks)...`);
      else if (c.state === 'none') line('wait', 'No settlement found in recent blocks', `Searched the last ${(SCAN_WINDOWS * (LOG_WINDOW + 1)).toLocaleString('en-US')} blocks (about ${Math.round((SCAN_WINDOWS * (LOG_WINDOW + 1)) / 60)} minutes). Older intents are found through the wallet page: open the wallet and follow the position or transaction links in its history.`);
      else if (c.state === 'error') line('bad', 'Could not search HyperEVM', esc(c.message));
      else {
        line(c.executed === false ? 'bad' : 'ok', c.executed === false ? 'Settled on-chain but the call failed' : 'Settled on-chain', `Block ${c.blockNumber.toLocaleString('en-US')}, transaction <a class="mono" href="${txHref(c.txHash)}">${esc(shortHex(c.txHash))}</a>${c.intent ? ` (${esc(KIND_LABEL[c.intent.kind])}${c.intent.verified ? ', signature verified' : ''})` : ''}.${c.description ? `<br>${c.description}` : ''}`);
      }

      const settled = c.state === 'found';
      const known = (typeof facts.feed === 'object' && facts.feed !== null) || (typeof facts.op === 'object' && facts.op !== null) || (typeof facts.position === 'object' && facts.position !== null) || settled;
      const searching = facts.feed === 'pending' || c.state === 'pending';
      root.querySelector('#in-facts')!.innerHTML = `<ul class="timeline">${rows.join('')}</ul>`;
      root.querySelector('#in-help')!.innerHTML = known || searching
        ? ''
        : `<div class="state"><h3>Nothing known about this intent yet</h3><p>Intent ids only exist in the relayer and in BatchExecutor events, so an intent that left the live feed is hard to find without its wallet. If you know the wallet, add it:</p></div>`;
      const walletForm = root.querySelector<HTMLElement>('#in-wallet-form')!;
      walletForm.hidden = !!facts.wallet || known || searching;
    }

    root.innerHTML = `
      <p class="eyebrow">Intent</p>
      <h1 class="wrapword mono h-hash">${esc(shortHex(id, 10, 8))}</h1>
      <div class="stack">
        <section class="card" aria-labelledby="in-h"><header><h2 id="in-h">What is known</h2></header>
          <dl class="kv"><dt>Intent id</dt><dd class="mono wrapword">${esc(id)} ${copyButton(id, 'Copy intent id')}</dd>${walletParam ? `<dt>Wallet</dt><dd class="mono wrapword"><a href="${walletHref(walletParam)}">${esc(walletParam)}</a></dd>` : ''}</dl>
          <div id="in-facts" aria-live="polite"></div>
          <div id="in-help"></div>
          <form id="in-wallet-form" class="filters" hidden>
            <label class="sr" for="in-wallet">Wallet address that signed this intent</label>
            <input type="search" id="in-wallet" placeholder="Wallet address (0x...)" spellcheck="false" autocomplete="off" maxlength="42">
            <button type="submit" class="btn">Check this wallet</button>
          </form>
          <p class="faint" id="in-wallet-err" role="alert"></p>
        </section>
        <div id="in-detail"></div>
      </div>`;

    root.querySelector<HTMLFormElement>('#in-wallet-form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = root.querySelector<HTMLInputElement>('#in-wallet')!.value.trim().toLowerCase();
      if (!isAddress(v)) {
        root.querySelector('#in-wallet-err')!.textContent = 'That is not a wallet address. It should be 0x followed by 40 hex characters.';
        return;
      }
      location.hash = intentHref(id, v);
    });
    paint();

    // 1. The live trade feed.
    client
      .recentTrades(ctx.signal)
      .then((r) => {
        const e = r.events.find((x) => x.intentId?.toLowerCase() === id) ?? null;
        facts.feed = e;
        if (e && !facts.wallet) {
          facts.wallet = e.wallet;
          void checkWallet(e.wallet);
        }
        paint();
      })
      .catch((e) => {
        if (isAbort(e)) return;
        facts.feed = null;
        paint();
      });

    // 2. The wallet's relayer state.
    async function checkWallet(wallet: string): Promise<void> {
      try {
        const s = await fetchWalletState(wallet as `0x${string}`, { baseUrl: '/api/papertrade', signal: ctx.signal, timeoutMs: 15000 });
        if (ctx.signal.aborted) return;
        facts.op = s.operations.find((o) => o.intentId.toLowerCase() === id) ?? null;
        facts.position = s.positions.find((p) => p.intentId?.toLowerCase() === id) ?? null;
      } catch (e) {
        if (isAbort(e)) return;
        facts.op = null;
        facts.position = null;
      }
      paint();
    }
    if (walletParam) void checkWallet(walletParam);

    // 3. Settlement on HyperEVM.
    (async () => {
      try {
        const log = await findIntentTx(id, SCAN_WINDOWS, (done) => {
          facts.chain = { state: 'pending', done };
          paint();
        }, ctx.signal);
        if (ctx.signal.aborted) return;
        if (!log || !log.transactionHash) {
          facts.chain = { state: 'none' };
          paint();
          return;
        }
        const [tx, receipt, trading] = await Promise.all([getTransaction(log.transactionHash, ctx.signal), getReceipt(log.transactionHash, ctx.signal), tradingState().catch(() => null)]);
        const batch = tx ? await decodeBatchInput(tx.to, tx.input) : { isBatch: false, intents: [] };
        const intent = batch.intents.find((i) => i.intentId.toLowerCase() === id) ?? null;
        const executed = receipt ? (executionResults(receipt.logs).get(id) ?? null) : null;
        facts.chain = {
          state: 'found',
          txHash: log.transactionHash,
          blockNumber: Number.parseInt(log.blockNumber ?? '0x0', 16),
          intent,
          executed,
          description: intent ? describeIntent(intent, trading?.instruments ?? []) : '',
        };
        if (intent?.user && !facts.wallet) {
          facts.wallet = intent.user;
          void checkWallet(intent.user);
        }
        paint();
      } catch (e) {
        if (isAbort(e) || ctx.signal.aborted) return;
        facts.chain = { state: 'error', message: messageOf(e) };
        paint();
      }
    })();
  };
}

function op(o: PendingOperation): string {
  return o.action.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
