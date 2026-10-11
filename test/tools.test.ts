import { readFileSync } from 'node:fs';
import type { WalletState } from 'papertrade-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callTool, resetRateLimits } from '../site/functions/_lib/mcp';
import { TOOLS } from '../site/functions/_lib/manifest';
import { buildTools, createDeps, type Deps } from '../site/functions/_lib/tools';
import { MCP_CONFIG } from '../site/functions/_lib/config';

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const walletFixture: WalletState = JSON.parse(readFileSync(new URL('./fixtures/wallet-state.json', import.meta.url), 'utf8'), (_k, v) => (v && typeof v === 'object' && '__bigint' in v ? BigInt(v.__bigint) : v));

const CAPTURED_AT = 1791691785000;
const tx = load('tx-close');
const intentId = '0xa45bce0d4543bb7d21c581dfab0a42deb52fc0233e22d34f7c5c5e87250742b2';
const WALLET = '0x67891c4b5d4474ffcab2e09b8dfa3d4c4236828c';

/** Serves recorded real Papertrade API responses by path. Every request is logged for call-budget checks. */
function fakeApi(log: string[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    log.push(url.pathname);
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/state/trading') return ok(load('trading'));
    if (url.pathname === '/query/protocol/summary') return ok(load('protocol-summary'));
    if (url.pathname === '/query/protocol/trades/recent') return ok(load('recent-trades'));
    if (url.pathname === '/state/leaderboard/accounts') return ok(load('leaderboard-24h'));
    if (url.pathname.startsWith('/state/leaderboard/accounts/')) return ok(load('placement-all'));
    if (url.pathname.endsWith('/leaderboard-badges')) return ok({ ok: true, badges: { daily: { first: 1, top3: 2, top15: 3 }, weekly: { first: 0, top3: 0, top15: 0 }, monthly: { first: 0, top3: 0, top15: 0 }, allTime: { first: 0, top3: 0, top15: 0 } }, total: 6 });
    if (url.pathname.endsWith('/trades')) return ok(load('account-trades'));
    const m = /^\/query\/markets\/(\d)\/price-history$/.exec(url.pathname);
    if (m) return ok(load(`price-history-${m[1]}`));
    return new Response('not recorded', { status: 404 });
  }) as typeof fetch;
}

function deps(log: string[] = []): Deps {
  const d = createDeps({}, fakeApi(log));
  d.walletState = async (address) => {
    log.push('wallet-state');
    return { ...walletFixture, address: address as `0x${string}` };
  };
  d.now = () => CAPTURED_AT;
  d.rpc = (async (method: string, params: unknown[]) => {
    log.push(`rpc:${method}`);
    if (method === 'eth_getTransactionByHash') return params[0] === tx.hash ? tx : null;
    if (method === 'eth_getTransactionReceipt') return params[0] === tx.hash ? tx.receipt : null;
    if (method === 'eth_blockNumber') return `0x${(Number.parseInt(tx.blockNumber, 16) + 10).toString(16)}`;
    if (method === 'eth_getLogs') {
      const topics = (params[0] as { topics: (string | null)[] }).topics;
      return tx.receipt.logs.filter((l: { topics: string[] }) => l.topics[3] === topics[3]).map((l: object) => ({ ...l, transactionHash: tx.hash, blockNumber: tx.blockNumber }));
    }
    throw new Error(`unexpected rpc ${method}`);
  }) as Deps['rpc'];
  return d;
}

const run = async (name: string, args: Record<string, unknown>, d = deps()) => (await callTool(MCP_CONFIG, name, args, d)) as { isError?: boolean; content: { type: string; text: string }[]; structuredContent: any };

beforeEach(() => {
  resetRateLimits();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(CAPTURED_AT);
});
afterEach(() => vi.useRealTimers());

describe('manifest and handlers', () => {
  it('every manifest tool has a handler and a complete, read-only definition', () => {
    const tools = buildTools();
    expect(tools.length).toBeGreaterThanOrEqual(4);
    expect(tools.length).toBeLessThanOrEqual(10);
    for (const t of tools) {
      expect(typeof t.handler).toBe('function');
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe('object');
      expect(t.outputSchema).toBeDefined();
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    }
    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });

  it('no tool name or description offers a way to sign, send or place anything', () => {
    for (const t of TOOLS) expect(t.name).not.toMatch(/sign|send|transfer|swap|withdraw_|deposit|place|submit/);
  });
});

describe('get_positions', () => {
  it('values the open positions of a real wallet snapshot at the live mark with SDK math', async () => {
    const r = await run('get_positions', { address: walletFixture.address });
    expect(r.isError).toBeUndefined();
    const { positions, totals, marks } = r.structuredContent;
    expect(positions).toHaveLength(walletFixture.positions.length);
    expect(totals.count).toBe(positions.length);
    for (const p of positions) {
      expect(['BTC', 'ETH']).toContain(p.market);
      expect(p.mark_price).toBeGreaterThan(0);
      expect(p.bust_price).toBeGreaterThan(0);
      expect(p.margin_usd * p.leverage).toBeCloseTo(p.notional_usd, 0);
      expect(typeof p.unrealized_pnl_usd).toBe('number');
      expect(p.link).toContain('/#/position/');
      if (p.side === 'long') expect(p.bust_price).toBeLessThan(p.entry_price);
      else expect(p.bust_price).toBeGreaterThan(p.entry_price);
    }
    expect(Object.keys(marks).length).toBeGreaterThan(0);
    expect(r.content[0].text).toContain('open positions');
  });

  it('narrows to one position id and reports an unknown id as an error', async () => {
    const id = walletFixture.positions[0].positionId.toString();
    const one = await run('get_positions', { address: walletFixture.address, position_id: id });
    expect(one.structuredContent.positions.map((p: { id: string }) => p.id)).toEqual([id]);
    const missing = await run('get_positions', { address: walletFixture.address, position_id: '1' });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain('not found');
  });

  it('finds a closed position in the trade history', async () => {
    const closedId = load('account-trades').items[0].positionId;
    const r = await run('get_positions', { address: walletFixture.address, position_id: closedId });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.closed.position_id).toBe(closedId);
    expect(r.content[0].text).toContain('closed');
  });

  it('rejects a malformed address before any upstream call', async () => {
    const log: string[] = [];
    const r = await run('get_positions', { address: '0x123' }, deps(log));
    expect(r.isError).toBe(true);
    expect(log).toEqual([]);
  });

  it('keeps the upstream budget small: one snapshot, one trading state, one mark per market', async () => {
    const log: string[] = [];
    await run('get_positions', { address: walletFixture.address }, deps(log));
    expect(log.filter((p) => p === 'wallet-state')).toHaveLength(1);
    expect(log.filter((p) => p === '/state/trading')).toHaveLength(1);
    expect(log.filter((p) => p.includes('price-history')).length).toBeLessThanOrEqual(2);
  });
});

describe('get_wallet', () => {
  it('returns the balance sheet, ranks for all four windows and session keys', async () => {
    const log: string[] = [];
    const r = await run('get_wallet', { address: WALLET }, deps(log));
    const d = r.structuredContent;
    expect(d.address).toBe(WALLET);
    expect(d.balance_usd).toBeCloseTo(Number(walletFixture.balance / 10n ** 14n) / 10000, 1);
    expect(d.open_positions).toBe(walletFixture.positions.length);
    expect(d.ranks.map((x: { window: string }) => x.window)).toEqual(['24h', '7d', '30d', 'all']);
    expect(d.ranks[0].rank).toBe(2);
    expect(d.leaderboard_name).toBe('rvw');
    expect(d.badges.total).toBe(6);
    expect(log.length).toBeLessThanOrEqual(8);
    expect(r.content[0].text).toContain('untrusted label');
  });
});

describe('get_intents', () => {
  it('lists the relayer queue of the wallet snapshot', async () => {
    const r = await run('get_intents', { address: WALLET });
    expect(r.structuredContent.count).toBe(walletFixture.operations.length);
    expect(r.content[0].text.length).toBeGreaterThan(10);
  });
});

describe('decode_transaction', () => {
  it('decodes a real settlement batch, verifies signatures and execution', async () => {
    const r = await run('decode_transaction', { tx_hash: tx.hash });
    const d = r.structuredContent;
    expect(d.found).toBe(true);
    expect(d.is_batch).toBe(true);
    expect(d.status).toBe('success');
    expect(d.intents).toHaveLength(4);
    expect(d.intents[0]).toMatchObject({ kind: 'closePositions', intent_id: intentId, signature_verified: true, executed: true });
    expect(d.intents[0].summary).toMatch(/^Close position #\d+/);
    expect(r.content[0].text).toContain('BatchExecutor batch with 4 intents');
  });

  it('reports a missing transaction as a clean not-found result', async () => {
    const r = await run('decode_transaction', { tx_hash: `0x${'ab'.repeat(32)}` });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.found).toBe(false);
  });
});

describe('lookup_intent', () => {
  it('finds a settled intent by scanning recent blocks and decodes it', async () => {
    const r = await run('lookup_intent', { intent_id: intentId });
    expect(r.structuredContent.state).toBe('settled');
    expect(r.structuredContent.settlement.tx_hash).toBe(tx.hash);
    expect(r.structuredContent.settlement.intent.signature_verified).toBe(true);
    expect(r.content[0].text).toContain('settled on HyperEVM');
  });

  it('says not_found when nothing knows the intent', async () => {
    const r = await run('lookup_intent', { intent_id: `0x${'cd'.repeat(32)}` });
    expect(r.structuredContent.state).toBe('not_found');
    expect(r.content[0].text).toContain('get_trade_history');
  });

  it('caps the log scan at six windows', async () => {
    const log: string[] = [];
    await run('lookup_intent', { intent_id: `0x${'cd'.repeat(32)}` }, deps(log));
    expect(log.filter((l) => l === 'rpc:eth_getLogs')).toHaveLength(6);
  });
});

describe('get_leaderboard and get_trade_history', () => {
  it('returns USD numbers and true ranks from the recorded leaderboard', async () => {
    const r = await run('get_leaderboard', { window: '24h' });
    const d = r.structuredContent;
    expect(d.accounts.length).toBeGreaterThan(0);
    expect(d.accounts[0].rank).toBe(load('leaderboard-24h').accounts[0]._leaderboardRank ?? 1);
    expect(typeof d.accounts[0].windowed_pnl_usd).toBe('number');
    expect(d.total_accounts).toBe(load('leaderboard-24h').count);
    expect(r.content[0].text).toContain('untrusted');
  });

  it('rejects an unknown window and an out-of-range page', async () => {
    expect((await run('get_leaderboard', { window: '1y' })).isError).toBe(true);
    expect((await run('get_leaderboard', { page: -1 })).isError).toBe(true);
  });

  it('computes net PnL as adjusted PnL minus fees and passes the cursor through', async () => {
    const r = await run('get_trade_history', { address: WALLET });
    const first = load('account-trades').items[0];
    const net = Number(BigInt(first.adjustedPnlRaw) - BigInt(first.userPaidFeeRaw)) / 1e18;
    expect(r.structuredContent.trades[0].net_pnl_usd).toBeCloseTo(net, 2);
    expect(r.structuredContent.trades[0].tx_hash).toBe(first.txHash);
    expect(r.structuredContent.next_cursor).toBe(load('account-trades').nextCursor ?? null);
  });
});

describe('get_protocol_overview', () => {
  it('summarises TVL, markets with USD open interest and the latest trades', async () => {
    const r = await run('get_protocol_overview', { recent_trades: 3 });
    const d = r.structuredContent;
    expect(d.tvl_usd).toBeGreaterThan(0);
    expect(d.markets.map((m: { symbol: string }) => m.symbol)).toEqual(expect.arrayContaining(['BTC', 'ETH']));
    for (const m of d.markets) {
      expect(m.mark_price).toBeGreaterThan(0);
      expect(m.long_oi_usd).toBeGreaterThanOrEqual(0);
      expect(m.long_cap_usd).toBeGreaterThan(m.long_oi_usd);
    }
    expect(d.recent_trades).toHaveLength(3);
    expect(d.trading_paused).toBe(false);
  });
});

describe('search', () => {
  it('routes an address to a wallet summary', async () => {
    const r = await run('search', { query: WALLET.toUpperCase().replace('0X', '0x') });
    expect(r.structuredContent).toMatchObject({ kind: 'wallet', value: WALLET, next_tool: 'get_positions' });
  });

  it('tells a transaction from an intent id', async () => {
    const t = await run('search', { query: tx.hash });
    expect(t.structuredContent.kind).toBe('transaction');
    const i = await run('search', { query: intentId });
    expect(i.structuredContent.kind).toBe('intent');
    expect(i.structuredContent.result.state).toBe('settled');
  });

  it('resolves a position id from the live feed and falls back to asking for the owner', async () => {
    const feedId = load('recent-trades').events[0].positionId;
    const known = await run('search', { query: `#${feedId}` });
    expect(known.structuredContent.result.owner).toBe(load('recent-trades').events[0].wallet);
    const unknown = await run('search', { query: '1' });
    expect(unknown.structuredContent.result.owner).toBeNull();
    expect(unknown.content[0].text).toContain('owner address');
  });

  it('searches leaderboard names for anything else', async () => {
    const r = await run('search', { query: 'rvw' });
    expect(r.structuredContent.kind).toBe('leaderboard-name');
  });
});

describe('upstream failure', () => {
  it('surfaces an API outage as an isError result, not a protocol error', async () => {
    const d = createDeps({}, (async () => new Response('down', { status: 503 })) as typeof fetch);
    d.walletState = async () => walletFixture;
    const r = (await callTool(MCP_CONFIG, 'get_protocol_overview', {}, d)) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text.length).toBeGreaterThan(5);
  });
});
