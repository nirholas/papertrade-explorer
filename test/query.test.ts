import { describe, expect, it } from 'vitest';
import { canonicalQuery } from 'papertrade-sdk';
import { parseQuery } from '../src/query';
import { leaderboardHref, parseHash } from '../src/router';
import { addRecent, clearRecent, loadRecent } from '../src/recent';

const A = '0x67891C4B5D4474FFCAB2E09B8DFA3D4C4236828C';
const H = '0x172bcd8373a9b131d594192070fed10231411b8a7ea3539aea74f70ae09d987f';

describe('parseQuery', () => {
  it('classifies addresses, 32-byte hashes, position ids and names', () => {
    expect(parseQuery(`  ${A} `)).toEqual({ kind: 'address', value: A.toLowerCase() });
    expect(parseQuery(H)).toEqual({ kind: 'hash', value: H });
    expect(parseQuery('#48503')).toEqual({ kind: 'position', value: '48503' });
    expect(parseQuery('rvw')).toEqual({ kind: 'leaderboard-name', value: 'rvw' });
    expect(parseQuery('0x1234').kind).toBe('leaderboard-name');
    expect(parseQuery('  ').kind).toBe('empty');
  });
});

describe('router', () => {
  it('parses every route', () => {
    expect(parseHash('#/wallet/' + A)).toEqual({ name: 'wallet', address: A.toLowerCase() });
    expect(parseHash('#/tx/' + H)).toEqual({ name: 'tx', hash: H });
    expect(parseHash(`#/intent/${H}?wallet=${A}`)).toEqual({ name: 'intent', id: H, wallet: A.toLowerCase() });
    expect(parseHash('#/position/48503')).toEqual({ name: 'position', id: '48503', wallet: null });
    expect(parseHash(`#/position/${A}/48503`)).toEqual({ name: 'position', id: '48503', wallet: A.toLowerCase() });
    expect(parseHash('#/wallet/nope').name).toBe('notfound');
    expect(parseHash('').name).toBe('home');
  });

  it('round-trips leaderboard state and keeps pages 0-based', () => {
    const r = parseHash('#/leaderboard?window=7d&sort=paperTotal&dir=asc&page=3&q=rv');
    expect(r).toEqual({ name: 'leaderboard', window: '7d', sortKey: 'paperTotal', sortDir: 'asc', page: 3, q: 'rv' });
    if (r.name !== 'leaderboard') throw new Error('route');
    expect(leaderboardHref(r)).toBe('#/leaderboard?window=7d&sort=paperTotal&dir=asc&page=3&q=rv');
    expect(parseHash('#/leaderboard')).toMatchObject({ window: '24h', sortKey: 'totalWindowedPnl', sortDir: 'desc', page: 0 });
    expect(parseHash('#/leaderboard?sort=bogus&page=-4')).toMatchObject({ sortKey: 'totalWindowedPnl', page: 0 });
  });

  it('builds the canonical leaderboard query the API requires (page 0 kept, sorted names)', () => {
    expect(canonicalQuery({ page: 0, pageSize: 25, q: undefined, sortDir: 'desc', sortKey: 'rank', window: 'all' })).toBe('?page=0&pageSize=25&sortDir=desc&sortKey=rank&window=all');
  });
});

describe('recent searches', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
  };
  it('dedupes, caps at 8, ignores corrupt data and non-hash hrefs', () => {
    const s = mem();
    for (let i = 0; i < 12; i++) addRecent({ value: String(i), href: `#/position/${i}`, label: `p${i}` }, s, i);
    addRecent({ value: '11', href: '#/position/11', label: 'again' }, s, 99);
    const list = loadRecent(s);
    expect(list).toHaveLength(8);
    expect(list[0].label).toBe('again');
    s.setItem('papertrade-explorer.recent.v1', JSON.stringify([{ value: 'x', href: 'javascript:alert(1)', label: 'x', at: 1 }]));
    expect(loadRecent(s)).toEqual([]);
    s.setItem('papertrade-explorer.recent.v1', '{bad');
    expect(loadRecent(s)).toEqual([]);
    clearRecent(s);
    expect(loadRecent(s)).toEqual([]);
  });
});
