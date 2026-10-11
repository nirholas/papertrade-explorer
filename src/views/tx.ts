import type { Hex } from 'viem';
import { decodeBatchInput, executionResults, isBatchExecutorCall, KIND_LABEL, type DecodedBatch } from '../calldata';
import { getReceipt, getTransaction, rpc, type ChainReceipt, type ChainTx } from '../chain';
import { describeIntent } from '../describe';
import { dateTime, esc, shortHex } from '../format';
import { copyButton, emptyState, extLink, loadInto, scanAddress, scanTx, skeleton, type Ctx } from '../kit';
import { tradingState } from '../marks';
import { intentHref, walletHref } from '../router';

export interface TxData {
  tx: ChainTx;
  receipt: ChainReceipt | null;
  timestampMs: number | null;
  batch: DecodedBatch;
  instruments: { id: number; symbol: string }[];
}

export async function loadTx(hash: string, signal?: AbortSignal): Promise<TxData | null> {
  const [tx, receipt] = await Promise.all([getTransaction(hash, signal), getReceipt(hash, signal)]);
  if (!tx) return null;
  const [block, trading, batch] = await Promise.all([
    tx.blockNumber ? rpc<{ timestamp: Hex } | null>('eth_getBlockByNumber', [tx.blockNumber, false], signal).catch(() => null) : Promise.resolve(null),
    tradingState().catch(() => null),
    decodeBatchInput(tx.to, tx.input),
  ]);
  return { tx, receipt, timestampMs: block ? Number.parseInt(block.timestamp, 16) * 1000 : null, batch, instruments: trading?.instruments ?? [] };
}

export function renderTx(d: TxData): string {
  const { tx, receipt, batch } = d;
  const ok = receipt ? receipt.status === '0x1' : null;
  const results = receipt ? executionResults(receipt.logs) : new Map<string, boolean>();
  const block = tx.blockNumber ? Number.parseInt(tx.blockNumber, 16) : null;
  const rows = batch.intents
    .map((i) => {
      const result = results.get(i.intentId.toLowerCase());
      return `<tr>
        <td class="num">${i.index + 1}</td>
        <td>${esc(KIND_LABEL[i.kind])}</td>
        <td>${i.user ? `<a class="mono" href="${walletHref(i.user)}">${esc(shortHex(i.user, 8, 6))}</a>` : '<span class="faint">unknown</span>'}</td>
        <td class="wrap">${describeIntent(i, d.instruments)}</td>
        <td class="mono"><a href="${intentHref(i.intentId, i.user)}">${esc(shortHex(i.intentId))}</a></td>
        <td>${i.verified ? '<span class="chip pos" title="The intent id recomputed from this signature equals the one the executor recorded.">Signature verified</span>' : '<span class="chip warn">Unverified</span>'}</td>
        <td>${result === undefined ? '<span class="chip">No event</span>' : result ? '<span class="chip pos">Executed</span>' : '<span class="chip neg">Failed</span>'}</td>
      </tr>`;
    })
    .join('');
  return `
    <section class="card" aria-labelledby="tx-h">
      <header><h2 id="tx-h">Transaction</h2>${ok === null ? '' : ok ? '<span class="chip pos">Success</span>' : '<span class="chip neg">Reverted</span>'}</header>
      <dl class="kv">
        <dt>Hash</dt><dd class="mono wrapword">${esc(tx.hash)} ${copyButton(tx.hash, 'Copy hash')} ${extLink(scanTx(tx.hash), 'HyperEVMScan').replace('<a ', '<a class="iconbtn" ')}</dd>
        <dt>Block</dt><dd class="num">${block === null ? 'Pending' : block.toLocaleString('en-US')}${d.timestampMs ? ` <span class="muted">(${esc(dateTime(d.timestampMs))})</span>` : ''}</dd>
        <dt>From</dt><dd class="mono wrapword"><a href="${esc(scanAddress(tx.from))}" target="_blank" rel="noopener noreferrer">${esc(tx.from)}</a> <span class="faint">(relayer)</span></dd>
        <dt>To</dt><dd class="mono wrapword"><a href="${esc(scanAddress(tx.to ?? ''))}" target="_blank" rel="noopener noreferrer">${esc(tx.to ?? 'Contract creation')}</a>${batch.isBatch ? ' <span class="chip accent">BatchExecutor</span>' : ''}</dd>
        ${receipt ? `<dt>Gas used</dt><dd class="num">${Number.parseInt(receipt.gasUsed, 16).toLocaleString('en-US')}</dd>` : ''}
      </dl>
    </section>
    ${
      batch.isBatch
        ? `<section class="card" aria-labelledby="tx-i"><header><h2 id="tx-i">Intents in this batch</h2><span class="muted">${batch.intents.length} ${batch.intents.length === 1 ? 'intent' : 'intents'}, decoded from calldata</span></header>
           <div class="tablewrap"><table><thead><tr><th>#</th><th>Action</th><th>Wallet</th><th>Details</th><th>Intent</th><th>Signature</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table></div></section>`
        : emptyState(
            isBatchExecutorCall(tx.to, tx.input) ? 'Could not decode this batch' : 'Not a Papertrade batch',
            isBatchExecutorCall(tx.to, tx.input)
              ? 'The calldata starts with the BatchExecutor selector but its layout is not one this explorer knows. Open the transaction on HyperEVMScan for the raw input.'
              : 'Papertrade settles user intents through the BatchExecutor contract. This transaction is something else on HyperEVM, so there are no intents to list.',
            `<p>${extLink(scanTx(tx.hash), 'Open on HyperEVMScan')}</p>`,
          )
    }`;
}

export function mountTx(hash: string) {
  return (root: HTMLElement, ctx: Ctx): void => {
    root.innerHTML = `<p class="eyebrow">Transaction</p><h1 class="wrapword mono h-hash">${esc(shortHex(hash, 10, 8))}</h1><div class="stack" id="tx-body"></div>`;
    loadInto(
      root.querySelector<HTMLElement>('#tx-body')!,
      ctx,
      skeleton(5, true),
      (signal) => loadTx(hash, signal),
      (d) =>
        d
          ? renderTx(d)
          : emptyState('Transaction not found on HyperEVM', `No transaction with this hash was found. It may not be mined yet. If this is a Papertrade intent id, <a href="${intentHref(hash)}">look it up as an intent</a>.`),
    );
  };
}
