import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ago, compact, esc, priceText, shortHex, usd, usdSigned, wad } from '../src/format';

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

describe('format', () => {
  it('converts wad strings from real API rows', () => {
    const trades = load('account-trades');
    const loss = trades.items.find((t: { adjustedPnlRaw: string }) => t.adjustedPnlRaw.startsWith('-'));
    expect(usdSigned(wad(loss.adjustedPnlRaw))).toBe('-$3,179.97');
    expect(usd(wad('9011740000000000000000'))).toBe('$9,011.74');
    expect(wad(0n)).toBe(0);
  });
  it('formats prices by price scale', () => {
    expect(priceText('251655', '100')).toBe('$2,516.55');
    expect(priceText('829915', '10')).toBe('$82,991.5');
  });
  it('compacts, shortens and times', () => {
    expect(compact(4619980.5)).toBe('4.62M');
    expect(shortHex('0x67891c4b5d4474ffcab2e09b8dfa3d4c4236828c')).toBe('0x67891c...828c');
    expect(ago(1000, 61_000)).toBe('1m ago');
  });
  it('escapes untrusted strings', () => {
    expect(esc('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;');
  });
});
