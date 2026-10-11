/**
 * The nine read-only explorer tools. Every handler works against a `Deps` object (Papertrade API
 * client, wallet snapshot reader, HyperEVM JSON-RPC), so tests drive them with recorded real
 * responses and production wires them to the live services. Nothing here can sign, send or place
 * anything: the only upstream calls are GETs against the Papertrade API and read-only eth_* RPC.
 */
import {
  MAINNET,
  PapertradeClient,
  fetchWalletState,
  openInterestUsd,
  pendingStakingRewardRaw,
  priceFromRaw,
  priceToRaw,
  type AccountTrade,
  type Instrument,
  type LeaderboardAccount,
  type LeaderboardSortKey,
  type LeaderboardWindow,
  type RecentTradeEvent,
  type TradingState,
  type WalletState,
} from 'papertrade-sdk';
import { decodeBatchInput, executionResults, INTENT_EVENT_TOPIC, isBatchExecutorCall, KIND_LABEL, type DecodedIntent } from '../../../src/calldata';
import { distanceBand, positionView } from '../../../src/positions';
import { parseQuery } from '../../../src/query';
import { wad } from '../../../src/format';
import { OS_URL, SITE_URL, TOOLS, type ToolSpec } from './manifest';
import { ToolError, type McpTool, type ToolOutput } from './mcp';

type Json = Record<string, unknown>;

export const RPC_URLS = ['https://rpc.hyperliquid.xyz/evm', 'https://rpc.hypurrscan.io'];
const LOG_WINDOW = 999;
const SCAN_WINDOWS = 6;
const WINDOWS: LeaderboardWindow[] = ['24h', '7d', '30d', 'all'];
const MAX_HISTORY_PAGES = 4;
const USDC_UNIT = 1_000_000n;

export interface Deps {
  client: PapertradeClient;
  walletState(address: string): Promise<WalletState>;
  rpc<T>(method: string, params: unknown[]): Promise<T>;
  now(): number;
  /** Memoised per request so a tool never fetches the same market parameters twice. */
  cache: Map<string, Promise<unknown>>;
}

export interface Env {
  PAPERTRADE_API_URL?: string;
}

export function createDeps(env: Env = {}, fetchImpl: typeof fetch = fetch): Deps {
  const baseUrl = (env.PAPERTRADE_API_URL ?? MAINNET.apiUrl).replace(/\/+$/, '');
  const client = new PapertradeClient({ baseUrl, fetch: fetchImpl, clientBuild: 'papertrade-explorer-mcp', retries: 1, timeoutMs: 9000 });
  return {
    client,
    walletState: (address) => fetchWalletState(address as `0x${string}`, { baseUrl, fetch: fetchImpl, timeoutMs: 10_000 }),
    rpc: (method, params) => rpcWithFallback(fetchImpl, method, params),
    now: () => Date.now(),
    cache: new Map(),
  };
}

async function rpcWithFallback<T>(fetchImpl: typeof fetch, method: string, params: unknown[]): Promise<T> {
  let lastError = 'HyperEVM RPC did not respond.';
  for (const url of RPC_URLS) {
    try {
      const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(8000) });
      const text = await res.text();
      if (res.status === 429 || text.includes('rate limited')) {
        lastError = 'HyperEVM RPC is rate limiting. Try again in a few seconds.';
        continue;
      }
      const body = JSON.parse(text) as { result?: T; error?: { message: string } };
      if (body.error) {
        lastError = body.error.message;
        continue;
      }
      return body.result as T;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new ToolError(lastError);
}

const memo = <T>(deps: Deps, key: string, load: () => Promise<T>): Promise<T> => {
  let hit = deps.cache.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = load();
    deps.cache.set(key, hit);
    hit.catch(() => deps.cache.delete(key));
  }
  return hit;
};

const trading = (deps: Deps): Promise<TradingState> => memo(deps, 'trading', () => deps.client.tradingState());

async function liveMark(deps: Deps, ins: Pick<Instrument, 'id' | 'priceScale'>): Promise<bigint | null> {
  return memo(deps, `mark:${ins.id}`, async () => {
    const { points } = await deps.client.priceHistory({ instrumentId: ins.id, lookbackMs: 90_000, intervalMs: 1000 });
    const last = points[points.length - 1];
    return last ? priceToRaw(last.price, ins.priceScale) : null;
  });
}

const iso = (ms: number) => new Date(ms).toISOString();
const round = (n: number, dp = 2) => (Number.isFinite(n) ? Number(n.toFixed(dp)) : n);
const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (n: number) => (n > 0 ? `+${money(n)}` : money(n));
const short = (hex: string, head = 6, tail = 4) => (hex.length <= head + tail + 2 ? hex : `${hex.slice(0, head + 2)}...${hex.slice(-tail)}`);
const usdc6 = (raw: string) => Number(BigInt(raw) / USDC_UNIT) + Number(BigInt(raw) % USDC_UNIT) / 1e6;
const lower = (s: unknown) => String(s).toLowerCase();
const walletLink = (a: string) => `${SITE_URL}/#/wallet/${lower(a)}`;
const txLink = (h: string) => `${SITE_URL}/#/tx/${lower(h)}`;
const intentLink = (id: string, wallet?: string | null) => `${SITE_URL}/#/intent/${lower(id)}${wallet ? `?wallet=${lower(wallet)}` : ''}`;
const positionLink = (id: string, wallet: string) => `${SITE_URL}/#/position/${lower(wallet)}/${id}`;
const osLink = `${OS_URL}/?open=explorer`;

function tradeNet(t: Pick<AccountTrade, 'adjustedPnlRaw' | 'userPaidFeeRaw'>): number {
  return wad(BigInt(t.adjustedPnlRaw) - BigInt(t.userPaidFeeRaw));
}

/* ---------- get_positions ---------- */

async function valuePositions(deps: Deps, state: WalletState, onlyId?: string) {
  const t = await trading(deps);
  const open = state.positions.filter((p) => (onlyId ? p.positionId.toString() === onlyId : true));
  const marks: Record<string, number> = {};
  const rows = await Promise.all(
    open.map(async (p) => {
      const ins = t.instruments.find((i) => i.id === p.instrumentId);
      if (!ins) return null;
      const mark = await liveMark(deps, ins);
      if (mark !== null) marks[ins.symbol] = priceFromRaw(mark, ins.priceScale);
      const v = positionView(p, ins, mark);
      return {
        id: v.id,
        market: v.symbol,
        side: v.isLong ? 'long' : 'short',
        leverage: v.leverage,
        uses_debt: v.useDebt,
        margin_usd: round(v.margin),
        notional_usd: round(v.notional),
        entry_price: priceFromRaw(v.entryRaw, v.priceScale),
        mark_price: mark === null ? null : priceFromRaw(mark, v.priceScale),
        bust_price: priceFromRaw(v.bustRaw, v.priceScale),
        unrealized_pnl_usd: v.unrealized === null ? null : round(v.unrealized),
        distance_to_bust_pct: v.distance === null ? null : round(v.distance * 100, 4),
        risk: distanceBand(v.distance) === 'ok' ? 'ok' : distanceBand(v.distance) === 'warn' ? 'close' : 'near_bust',
        opened_at: iso(v.openedAtMs),
        intent_id: v.intentId,
        link: positionLink(v.id, state.address),
      };
    }),
  );
  const positions = rows.filter((r): r is NonNullable<typeof r> => r !== null);
  const totals = {
    count: positions.length,
    margin_usd: round(positions.reduce((a, p) => a + p.margin_usd, 0)),
    notional_usd: round(positions.reduce((a, p) => a + p.notional_usd, 0)),
    unrealized_pnl_usd: round(positions.reduce((a, p) => a + (p.unrealized_pnl_usd ?? 0), 0)),
  };
  return { marks, positions, totals };
}

function positionLine(p: Awaited<ReturnType<typeof valuePositions>>['positions'][number]): string {
  const dist = p.distance_to_bust_pct === null ? 'distance unknown' : p.distance_to_bust_pct < 0 ? 'past bust' : `${p.distance_to_bust_pct}% to bust`;
  return `#${p.id} ${p.side} ${p.market} ${p.leverage}x, margin ${money(p.margin_usd)}, entry ${p.entry_price}, mark ${p.mark_price ?? 'n/a'}, bust ${p.bust_price}, PnL ${p.unrealized_pnl_usd === null ? 'n/a' : signedMoney(p.unrealized_pnl_usd)}, ${dist} (${p.risk})`;
}

async function getPositions(args: Json, deps: Deps): Promise<ToolOutput> {
  const address = lower(args.address);
  const positionId = args.position_id === undefined ? undefined : String(args.position_id);
  const state = await deps.walletState(address);
  const valued = await valuePositions(deps, state, positionId);
  let closed: Json | null = null;
  if (positionId && !valued.positions.length) {
    let cursor: string | undefined;
    for (let page = 0; page < MAX_HISTORY_PAGES && !closed; page++) {
      const r = await deps.client.accountTrades(address as `0x${string}`, cursor ? { cursor } : {});
      const hit = r.items.find((t) => t.positionId === positionId);
      if (hit) closed = tradeRow(hit);
      if (!r.nextCursor) break;
      cursor = r.nextCursor;
    }
    if (!closed) throw new ToolError(`Position #${positionId} is not open for ${address} and was not found in its latest ${MAX_HISTORY_PAGES * 75} closed trades. Check the owner address.`);
  }
  const data = { address, as_of: iso(deps.now()), ...valued, closed };
  if (closed) {
    return { text: `Position #${positionId} is closed. ${tradeLine(closed as ReturnType<typeof tradeRow>)}`, data };
  }
  const lines = valued.positions.map(positionLine);
  const head = valued.positions.length
    ? `${address} has ${valued.totals.count} open ${valued.totals.count === 1 ? 'position' : 'positions'}: margin ${money(valued.totals.margin_usd)}, notional ${money(valued.totals.notional_usd)}, unrealized PnL ${signedMoney(valued.totals.unrealized_pnl_usd)} at the live mark (before close-side haircut).`
    : `${address} has no open positions.`;
  return { text: [head, ...lines].join('\n'), data };
}

/* ---------- get_wallet ---------- */

async function getWallet(args: Json, deps: Deps): Promise<ToolOutput> {
  const address = lower(args.address);
  const [state, t, placements, badges] = await Promise.all([
    deps.walletState(address),
    trading(deps),
    Promise.all(WINDOWS.map((w) => deps.client.leaderboardPlacement(address as `0x${string}`, w))),
    deps.client.leaderboardBadges(address as `0x${string}`).catch(() => null),
  ]);
  const pending = pendingStakingRewardRaw({ stakedRaw: state.paper.staked, accRewardPerShareRaw: t.accRewardPerShareRaw, rewardDebtRaw: state.paper.rewardDebt, pendingBaseRaw: state.paper.pendingBase });
  const now = deps.now();
  const ranks = WINDOWS.map((w, i) => {
    const row = placements[i].selfRow;
    const rank = row?._leaderboardRank ?? (placements[i].selfIndex !== null ? placements[i].selfIndex! + 1 : null);
    return { window: w, rank, pnl_usd: row ? round(wad(row.totalWindowedPnl)) : null, volume_usd: row ? round(wad(row.totalVolume)) : null };
  });
  const name = placements.map((p) => p.selfRow?.leaderboardName).find(Boolean) ?? null;
  const keys = Object.entries(state.sessionKeys).map(([key, expiry]) => ({ key, expires_at: iso(Number(expiry) * 1000), active: Number(expiry) * 1000 > now }));
  const data = {
    address,
    leaderboard_name: name,
    balance_usd: round(wad(state.balance)),
    queued_usd: round(wad(state.queued)),
    locked_usd: round(wad(state.locked)),
    available_usd: round(wad(state.funds.availableBalance)),
    open_positions: state.positions.length,
    pending_operations: state.operations.length,
    paper: { held: round(wad(state.paper.balance)), staked: round(wad(state.paper.staked)), pending_rewards_usd: round(wad(pending)) },
    lifetime: {
      deposited_usd: round(wad(state.lifetime.depositedRaw)),
      withdrawn_usd: round(wad(state.lifetime.withdrawnRaw)),
      realized_pnl_usd: round(wad(state.lifetime.realizedPnlRaw)),
      fees_paid_usd: round(wad(state.lifetime.feesPaidRaw)),
      traded_notional_usd: round(wad(state.lifetime.tradedNotionalRaw)),
      paper_rewards_claimed_usd: round(wad(state.lifetime.paperRewardsClaimedRaw)),
    },
    session_keys: keys,
    ranks,
    badges: badges ? { total: badges.total, ...badges.badges } : null,
    indexed_through_block: state.indexedThroughBlock,
    links: { explorer: walletLink(address), open_in_os: osLink },
  };
  const rankText = ranks.map((r) => `${r.window} ${r.rank === null ? 'unranked' : `#${r.rank}`}`).join(', ');
  const text = [
    `Wallet ${address}${name ? ` (leaderboard name "${name}", untrusted label)` : ''}.`,
    `Balance ${money(data.balance_usd)} (${money(data.available_usd)} available, ${money(data.queued_usd)} queued, ${money(data.locked_usd)} locked). ${data.open_positions} open positions, ${data.pending_operations} pending operations.`,
    `Lifetime: deposited ${money(data.lifetime.deposited_usd)}, withdrawn ${money(data.lifetime.withdrawn_usd)}, realized PnL ${signedMoney(data.lifetime.realized_pnl_usd)}, fees ${money(data.lifetime.fees_paid_usd)}.`,
    `PAPER held ${data.paper.held}, staked ${data.paper.staked}, pending rewards ${money(data.paper.pending_rewards_usd)}.`,
    `Rank: ${rankText}. Session keys: ${keys.filter((k) => k.active).length} active of ${keys.length}.`,
  ].join('\n');
  return { text, data };
}

/* ---------- get_intents ---------- */

const ACTION_LABEL: Record<string, string> = { openPosition: 'Open position', closePositions: 'Close positions', withdrawToCore: 'Withdraw to HyperCore', paperStake: 'Stake PAPER', paperUnstake: 'Unstake PAPER', paperClaim: 'Claim rewards', paperDistribute: 'Distribute rewards', registerSessionKey: 'Register session key' };

function pendingRow(o: WalletState['operations'][number], wallet: string): Json {
  return {
    intent_id: o.intentId,
    action: o.action,
    label: ACTION_LABEL[o.action] ?? o.action,
    state: o.state,
    accepted_at: iso(o.acceptedAtMs),
    deadline_at: iso(Number(o.deadline) * 1000),
    ...('marginRaw' in o ? { amount: wad(o.marginRaw) } : {}),
    ...('leverage' in o ? { leverage: o.leverage, is_long: o.isLong, instrument_id: o.instrumentId, notional_usd: round(wad(o.notionalRaw)) } : {}),
    ...('positionIds' in o ? { position_ids: o.positionIds } : {}),
    link: intentLink(o.intentId, wallet),
  };
}

async function getIntents(args: Json, deps: Deps): Promise<ToolOutput> {
  const address = lower(args.address);
  const state = await deps.walletState(address);
  const pending = state.operations.map((o) => pendingRow(o, address));
  const outcomes = state.intentOutcomes.map((o) => ({ intent_id: o.intentId, outcome: o.outcome }));
  const text = pending.length
    ? [`${address} has ${pending.length} pending ${pending.length === 1 ? 'intent' : 'intents'} in the relayer queue:`, ...pending.map((p) => `${p.label} ${p.intent_id}, accepted ${p.accepted_at}, expires ${p.deadline_at}`)].join('\n')
    : `${address} has no intents waiting in the relayer queue. Recently settled intents appear in get_trade_history.`;
  return { text, data: { address, count: pending.length, pending, recent_outcomes: outcomes } };
}

/* ---------- decode_transaction / lookup_intent ---------- */

interface ChainTx {
  hash: string;
  from: string;
  to: string | null;
  input: string;
  blockNumber: string | null;
}
interface ChainReceipt {
  status: string;
  gasUsed: string;
  logs: { address: string; topics: string[]; data: string; transactionHash?: string; blockNumber?: string }[];
}

function intentText(i: DecodedIntent, instruments: Instrument[]): string {
  const f = i.fields;
  switch (i.kind) {
    case 'openPosition': {
      const ins = instruments.find((x) => String(x.id) === String(f.instrumentId));
      const lev = Number(f.leverage);
      const notional = wad(String(f.size));
      return `${f.isLong ? 'Long' : 'Short'} ${ins?.symbol ?? `instrument ${f.instrumentId}`} at ${lev}x, ${money(notional)} notional, ${money(lev ? notional / lev : notional)} margin${f.useDebt ? ', using debt' : ''}`;
    }
    case 'closePositions': {
      const ids = (Array.isArray(f.positionIds) ? f.positionIds : []).map(String);
      return `Close ${ids.length === 1 ? 'position' : 'positions'} ${ids.map((x) => `#${x}`).join(', ')}`;
    }
    case 'withdrawToCore':
      return `Withdraw ${money(usdc6(String(f.amount)))} USDC to HyperCore`;
    case 'paperStake':
      return `Stake ${round(wad(String(f.amount)))} PAPER`;
    case 'paperUnstake':
      return `Unstake ${round(wad(String(f.amount)))} PAPER`;
    case 'paperClaim':
      return 'Claim pending USDC staking rewards';
    case 'paperDistribute':
      return 'Distribute staking rewards';
    case 'registerSessionKey':
      return `Register trade-only session key ${short(String(f.key), 8, 6)} valid until ${iso(Number(f.expiry) * 1000)}`;
    default:
      return `Call ${i.selector} on ${short(i.target)}`;
  }
}

function intentRow(i: DecodedIntent, instruments: Instrument[], executed: boolean | null): Json {
  return {
    index: i.index,
    kind: i.kind,
    label: KIND_LABEL[i.kind],
    summary: intentText(i, instruments),
    intent_id: i.intentId,
    wallet: i.user,
    signer: i.signer,
    signature_verified: i.verified,
    executed,
    nonce: i.nonce,
    deadline_at: i.deadline === null ? null : iso(i.deadline * 1000),
    fields: i.fields,
    link: intentLink(i.intentId, i.user),
  };
}

async function decodeTx(deps: Deps, hash: string): Promise<{ data: Json; text: string }> {
  const [tx, receipt] = await Promise.all([deps.rpc<ChainTx | null>('eth_getTransactionByHash', [hash]), deps.rpc<ChainReceipt | null>('eth_getTransactionReceipt', [hash])]);
  if (!tx) {
    return { text: `No HyperEVM transaction ${hash} was found. It may not exist, or it is not yet indexed by the RPC.`, data: { tx_hash: hash, found: false, status: null, block_number: null, is_batch: false, intents: [] } };
  }
  const t = await trading(deps).catch(() => null);
  const instruments = t?.instruments ?? [];
  const batch = isBatchExecutorCall(tx.to, tx.input) ? await decodeBatchInput(tx.to, tx.input as `0x${string}`) : { isBatch: false, intents: [] as DecodedIntent[] };
  const results = receipt ? executionResults(receipt.logs) : new Map<string, boolean>();
  const status = receipt ? (receipt.status === '0x1' ? 'success' : 'reverted') : null;
  const intents = batch.intents.map((i) => intentRow(i, instruments, receipt ? (results.get(lower(i.intentId)) ?? null) : null));
  const blockNumber = tx.blockNumber ? Number.parseInt(tx.blockNumber, 16) : null;
  const data = { tx_hash: lower(tx.hash), found: true, status, block_number: blockNumber, from: tx.from, to: tx.to, is_batch: batch.isBatch, intents, links: { explorer: txLink(hash), hyperevmscan: `https://hyperevmscan.io/tx/${hash}` } };
  const head = batch.isBatch
    ? `Transaction ${hash} is a Papertrade BatchExecutor batch with ${intents.length} ${intents.length === 1 ? 'intent' : 'intents'}, ${status ?? 'pending'} at block ${blockNumber ?? 'n/a'}.`
    : `Transaction ${hash} (${status ?? 'pending'}, block ${blockNumber ?? 'n/a'}) is not a Papertrade BatchExecutor batch. From ${tx.from} to ${tx.to ?? 'contract creation'}.`;
  const lines = intents.map((i) => `${(i.index as number) + 1}. ${i.summary} by ${i.wallet ?? 'unknown'}, ${i.signature_verified ? 'signature verified' : 'signature NOT verified'}, ${i.executed === null ? 'result unknown' : i.executed ? 'executed' : 'call failed'}`);
  return { text: [head, ...lines].join('\n'), data };
}

async function decodeTransaction(args: Json, deps: Deps): Promise<ToolOutput> {
  return decodeTx(deps, lower(args.tx_hash));
}

async function scanForIntent(deps: Deps, intentId: string): Promise<{ transactionHash: string; blockNumber: number } | null> {
  const head = Number.parseInt(await deps.rpc<string>('eth_blockNumber', []), 16);
  for (let i = 0; i < SCAN_WINDOWS; i++) {
    const to = head - i * (LOG_WINDOW + 1);
    const from = Math.max(0, to - LOG_WINDOW);
    const logs = await deps.rpc<{ transactionHash?: string; blockNumber?: string }[]>('eth_getLogs', [
      { address: MAINNET.contracts.batchExecutor, fromBlock: `0x${from.toString(16)}`, toBlock: `0x${to.toString(16)}`, topics: [INTENT_EVENT_TOPIC, null, null, intentId] },
    ]);
    if (logs.length && logs[0].transactionHash) return { transactionHash: logs[0].transactionHash, blockNumber: Number.parseInt(logs[0].blockNumber ?? '0x0', 16) };
  }
  return null;
}

const feedRow = (e: RecentTradeEvent) => ({ kind: e.kind, side: e.side, market: e.instrument, leverage: e.leverage, notional_usd: e.notionalUsd, wallet: e.wallet, position_id: e.positionId, at: iso(e.ts), pnl_usd: e.pnlUsd });

async function lookupIntent(args: Json, deps: Deps): Promise<ToolOutput> {
  const id = lower(args.intent_id);
  let wallet = args.wallet ? lower(args.wallet) : null;
  const feedEvent = await deps.client.recentTrades().then((r) => r.events.find((e) => lower(e.intentId ?? '') === id) ?? null).catch(() => null);
  if (feedEvent && !wallet) wallet = lower(feedEvent.wallet);

  const [pendingOp, found] = await Promise.all([
    wallet ? deps.walletState(wallet).then((s) => s.operations.find((o) => lower(o.intentId) === id) ?? null).catch(() => null) : Promise.resolve(null),
    scanForIntent(deps, id),
  ]);

  let settlement: Json | null = null;
  if (found) {
    const decoded = await decodeTx(deps, lower(found.transactionHash));
    const intent = ((decoded.data.intents as Json[]) ?? []).find((i) => lower(i.intent_id) === id) ?? null;
    settlement = { tx_hash: lower(found.transactionHash), block_number: found.blockNumber, status: decoded.data.status, intent, link: txLink(found.transactionHash) };
  }
  const state = settlement ? 'settled' : pendingOp ? 'pending' : feedEvent ? 'seen_in_feed' : 'not_found';
  const data = { intent_id: id, state, wallet, feed: feedEvent ? feedRow(feedEvent) : null, pending: pendingOp && wallet ? pendingRow(pendingOp, wallet) : null, settlement, link: intentLink(id, wallet) };
  const text =
    state === 'settled'
      ? `Intent ${id} settled on HyperEVM in tx ${settlement!.tx_hash} at block ${found!.blockNumber}${(settlement!.intent as Json | null) ? `: ${(settlement!.intent as Json).summary}, ${(settlement!.intent as Json).signature_verified ? 'signature verified' : 'signature not verified'}, ${(settlement!.intent as Json).executed === false ? 'the call failed' : 'executed'}` : ''}.`
      : state === 'pending'
        ? `Intent ${id} is queued in the relayer for ${wallet} and has not settled yet. It settles in the next batch or expires at ${(data.pending as Json).deadline_at}.`
        : state === 'seen_in_feed'
          ? `Intent ${id} is in the live trade feed (${feedEvent!.kind} ${feedEvent!.side} ${feedEvent!.instrument}) but its settlement was not found in the last ${SCAN_WINDOWS * (LOG_WINDOW + 1)} blocks.`
          : `Intent ${id} was not found in the live feed${wallet ? ', the wallet queue' : ''} or the last ${SCAN_WINDOWS * (LOG_WINDOW + 1)} blocks (about 100 minutes). Older intents are reachable through get_trade_history for the owning wallet.${wallet ? '' : ' Pass the wallet to also check the relayer queue.'}`;
  return { text, data };
}

/* ---------- get_leaderboard / get_trade_history ---------- */

function accountRow(a: LeaderboardAccount, fallbackRank: number | null): Json {
  return {
    rank: a._leaderboardRank ?? fallbackRank,
    address: a.address,
    name: a.leaderboardName,
    windowed_pnl_usd: round(wad(a.totalWindowedPnl)),
    realized_pnl_usd: round(wad(a.realizedPnl)),
    unrealized_pnl_usd: round(wad(a.currentUnrealizedPnl)),
    volume_usd: round(wad(a.totalVolume)),
    balance_usd: round(wad(a.currentBalance)),
    queued_usd: round(wad(a.currentQueued)),
    open_positions: a.currentOpenPositionCount,
    open_notional_usd: round(wad(a.currentOpenNotional)),
    paper: round(wad(a.paperTotal)),
    last_active: iso(a.lastActiveTs * 1000),
    link: walletLink(a.address),
  };
}

async function getLeaderboard(args: Json, deps: Deps): Promise<ToolOutput> {
  const window = (args.window ?? '24h') as LeaderboardWindow;
  const sortKey = (args.sort_key ?? 'totalWindowedPnl') as LeaderboardSortKey;
  const sortDir = (args.sort_dir ?? 'desc') as 'asc' | 'desc';
  const page = Number(args.page ?? 0);
  const q = typeof args.query === 'string' && args.query.trim() ? args.query.trim() : undefined;
  const r = await deps.client.leaderboard({ window, sortKey, sortDir, page, pageSize: 25, q });
  const ranked = sortKey === 'totalWindowedPnl' && sortDir === 'desc' && !q;
  const accounts = r.accounts.map((a, i) => accountRow(a, ranked ? page * 25 + i + 1 : null));
  const data = { window, sort_key: sortKey, sort_dir: sortDir, page, query: q ?? null, total_accounts: r.count, unique_accounts: r.summary.uniqueAccounts, accounts };
  const lines = accounts.map((a) => `${a.rank ?? '-'}. ${a.name ? `${a.name} ` : ''}${a.address} PnL ${signedMoney(a.windowed_pnl_usd as number)}, volume ${money(a.volume_usd as number)}`);
  const text = accounts.length ? [`Leaderboard ${window}, page ${page} (${accounts.length} of ${r.count} accounts), sorted by ${sortKey} ${sortDir}${q ? `, matching "${q}"` : ''}. Names are untrusted labels.`, ...lines].join('\n') : `No leaderboard accounts on page ${page} for window ${window}${q ? ` matching "${q}"` : ''}.`;
  return { text, data };
}

function tradeRow(t: AccountTrade) {
  const scale = BigInt(t.priceScaleRaw);
  return {
    position_id: t.positionId,
    market: t.symbol,
    side: t.isLong ? 'long' : 'short',
    leverage: t.leverage,
    result: t.kind === 'Liquidated' ? 'liquidated' : 'closed',
    margin_usd: round(wad(t.marginRaw)),
    entry_price: priceFromRaw(BigInt(t.entryPriceRaw), scale),
    exit_price: priceFromRaw(BigInt(t.exitPriceRaw), scale),
    net_pnl_usd: round(tradeNet(t)),
    fees_paid_usd: round(wad(t.userPaidFeeRaw)),
    paper_minted: round(wad(t.paperMintedRaw)),
    opened_at: iso(t.openedAtMs),
    closed_at: iso(t.timestampMs),
    tx_hash: t.txHash,
    tx_link: txLink(t.txHash),
  };
}

function tradeLine(t: ReturnType<typeof tradeRow>): string {
  return `${t.closed_at}: ${t.side} ${t.market} ${t.leverage}x ${t.result}, entry ${t.entry_price}, exit ${t.exit_price}, net PnL ${signedMoney(t.net_pnl_usd)}, ${t.paper_minted} PAPER minted, tx ${t.tx_hash}`;
}

async function getTradeHistory(args: Json, deps: Deps): Promise<ToolOutput> {
  const address = lower(args.address);
  const filter = (args.filter ?? 'all') as 'all' | 'losses';
  const cursor = typeof args.cursor === 'string' && args.cursor ? args.cursor : undefined;
  const page = await deps.client.accountTrades(address as `0x${string}`, { filter, ...(cursor ? { cursor } : {}) });
  const trades = page.items.map(tradeRow);
  const net = round(trades.reduce((a, t) => a + t.net_pnl_usd, 0));
  const wins = trades.filter((t) => t.net_pnl_usd > 0).length;
  const data = { address, filter, trades, summary: { count: trades.length, net_pnl_usd: net, winning: wins }, next_cursor: page.nextCursor };
  const text = trades.length
    ? [`${address}: ${trades.length} ${filter === 'losses' ? 'losing ' : ''}trades on this page, net ${signedMoney(net)}, ${wins} winning.${page.nextCursor ? ' More available via next_cursor.' : ''}`, ...trades.map(tradeLine)].join('\n')
    : `${address} has no ${filter === 'losses' ? 'losing ' : 'closed '}trades${cursor ? ' on this page' : ''}.`;
  return { text, data };
}

/* ---------- get_protocol_overview ---------- */

async function getProtocolOverview(args: Json, deps: Deps): Promise<ToolOutput> {
  const wanted = Number(args.recent_trades ?? 10);
  const [summary, t, feed] = await Promise.all([deps.client.protocolSummary(), trading(deps), wanted > 0 ? deps.client.recentTrades().catch(() => null) : Promise.resolve(null)]);
  const markets = await Promise.all(
    t.instruments
      .filter((i) => i.active && !i.retired)
      .map(async (i) => {
        const mark = await liveMark(deps, i).catch(() => null);
        const price = (m: bigint) => openInterestUsd(m, mark ?? 0n, i.priceScale);
        return {
          symbol: i.symbol,
          mark_price: mark === null ? null : priceFromRaw(mark, i.priceScale),
          max_leverage: i.maxLeverage,
          openable: i.openable,
          paused: i.paused,
          close_only: i.closeOnly,
          long_oi_usd: mark === null ? null : round(price(i.longOiRaw)),
          short_oi_usd: mark === null ? null : round(price(i.shortOiRaw)),
          long_cap_usd: mark === null ? null : round(price(i.longCapRaw)),
          short_cap_usd: mark === null ? null : round(price(i.shortCapRaw)),
          max_position_notional_usd: round(wad(i.maxPositionNotionalRaw)),
        };
      }),
  );
  const recent = (feed?.events ?? []).slice(0, wanted).map((e) => ({ ...feedRow(e), intent_id: e.intentId, link: e.intentId ? intentLink(e.intentId, e.wallet) : walletLink(e.wallet) }));
  const data = {
    tvl_usd: round(wad(summary.balances.tvl)),
    lp_usd: round(wad(summary.balances.lp)),
    margin_usd: round(wad(summary.balances.margin)),
    queue_usd: round(wad(summary.balances.queue)),
    lifetime_volume_usd: round(wad(summary.activity.volume)),
    open_positions: summary.activity.open,
    fees: { lifetime_usd: round(wad(summary.fees.lifetime)), pending_usd: round(wad(summary.fees.pending)) },
    paper: { supply: round(wad(summary.paper.supply)), staked: round(wad(summary.paper.staked)) },
    trading_paused: t.tradingPaused,
    minimum_open_notional_usd: round(wad(t.minimumOpenNotionalRaw)),
    indexed_through_block: t.indexedThroughBlock,
    markets,
    recent_trades: recent,
  };
  const text = [
    `Papertrade: value locked ${money(data.tvl_usd)}, LP ${money(data.lp_usd)}, lifetime volume ${money(data.lifetime_volume_usd)}, ${data.open_positions} open positions, trading ${data.trading_paused ? 'PAUSED' : 'live'}.`,
    ...markets.map((m) => `${m.symbol}: mark ${m.mark_price ?? 'n/a'}, max ${m.max_leverage}x, ${m.openable ? 'openable' : 'not openable'}, OI long ${m.long_oi_usd === null ? 'n/a' : money(m.long_oi_usd)} short ${m.short_oi_usd === null ? 'n/a' : money(m.short_oi_usd)}`),
    ...(recent.length ? [`Latest ${recent.length} trades:`, ...recent.map((r) => `${r.at} ${r.kind} ${r.side} ${r.market} ${r.leverage}x ${money(r.notional_usd as number)} by ${r.wallet}`)] : []),
  ].join('\n');
  return { text, data };
}

/* ---------- search ---------- */

async function search(args: Json, deps: Deps): Promise<ToolOutput> {
  const parsed = parseQuery(String(args.query));
  switch (parsed.kind) {
    case 'address': {
      const r = await getWallet({ address: parsed.value }, deps);
      return { text: r.text, data: { kind: 'wallet', value: parsed.value, next_tool: 'get_positions', result: r.data } };
    }
    case 'hash': {
      const tx = await deps.rpc<ChainTx | null>('eth_getTransactionByHash', [parsed.value]);
      if (tx) {
        const r = await decodeTx(deps, parsed.value);
        return { text: r.text, data: { kind: 'transaction', value: parsed.value, next_tool: 'decode_transaction', result: r.data } };
      }
      const r = await lookupIntent({ intent_id: parsed.value }, deps);
      return { text: `No transaction has this hash, so it was treated as an intent id. ${r.text}`, data: { kind: 'intent', value: parsed.value, next_tool: 'lookup_intent', result: r.data } };
    }
    case 'position': {
      const feed = await deps.client.recentTrades().catch(() => null);
      const hit = feed?.events.find((e) => e.positionId === parsed.value) ?? null;
      const owner = hit ? lower(hit.wallet) : null;
      return {
        text: owner ? `Position #${parsed.value} belongs to ${owner} per the live feed. Call get_positions with address and position_id for its valuation.` : `Position #${parsed.value} is not among the newest trades in the live feed. Position ids are not indexed by id, so call get_positions with the owner address and this position_id.`,
        data: { kind: 'position', value: parsed.value, next_tool: 'get_positions', result: { position_id: parsed.value, owner, link: owner ? positionLink(parsed.value, owner) : null } },
      };
    }
    case 'leaderboard-name': {
      const r = await getLeaderboard({ window: 'all', query: parsed.value }, deps);
      return { text: r.text, data: { kind: 'leaderboard-name', value: parsed.value, next_tool: 'get_wallet', result: r.data } };
    }
    default:
      throw new ToolError('Provide an address, transaction hash, intent id, position id or a name to search.');
  }
}

const HANDLERS: Record<string, (args: Json, deps: Deps) => Promise<ToolOutput>> = {
  search,
  get_wallet: getWallet,
  get_positions: getPositions,
  get_intents: getIntents,
  lookup_intent: lookupIntent,
  decode_transaction: decodeTransaction,
  get_leaderboard: getLeaderboard,
  get_trade_history: getTradeHistory,
  get_protocol_overview: getProtocolOverview,
};

export const handlerFor = (name: string) => HANDLERS[name];

/** Tool definitions: metadata from the manifest, behavior from the handlers above. */
export function buildTools(specs: ToolSpec[] = TOOLS): McpTool<Deps>[] {
  return specs.map((s) => ({
    name: s.name,
    title: s.title,
    description: s.description,
    inputSchema: s.inputSchema,
    outputSchema: s.outputSchema,
    annotations: s.annotations,
    handler: HANDLERS[s.name],
  }));
}
