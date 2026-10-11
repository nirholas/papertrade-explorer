import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWalletOg, renderOgHtml, type PlacementRow } from '../src/og';

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const row = load('placement-all').selfRow as PlacementRow;
const ADDR = '0x67891c4b5d4474ffcab2e09b8dfa3d4c4236828c';

describe('wallet Open Graph', () => {
  it('puts rank and PnL from a real leaderboard row into the title and description', () => {
    const og = buildWalletOg(ADDR, 'https://papertrade-explorer.pages.dev', { all: row, '24h': row });
    expect(og.title).toContain('rvw');
    expect(og.title).toMatch(/#2/);
    expect(og.title).toContain('+$87,135.64');
    expect(og.description).toContain('#2 24h');
    expect(og.description).toContain('balance $8,000.75');
    expect(og.url).toBe(`https://papertrade-explorer.pages.dev/w/${ADDR}`);
    expect(og.target).toBe(`https://papertrade-explorer.pages.dev/#/wallet/${ADDR}`);
  });

  it('degrades honestly for an unranked wallet', () => {
    const og = buildWalletOg(ADDR, 'https://x.test', {});
    expect(og.description).toContain('Not on the Papertrade leaderboard yet');
  });

  it('escapes hostile leaderboard names and redirects humans to the hash route', () => {
    const evil = { ...row, leaderboardName: '"><script>alert(1)</script>' };
    const html = renderOgHtml(buildWalletOg(ADDR, 'https://x.test', { all: evil }), 'https://x.test/og.png');
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('property="og:title"');
    expect(html).toContain(`http-equiv="refresh" content="0;url=https://x.test/#/wallet/${ADDR}"`);
    expect(html).toContain(`location.replace("https://x.test/#/wallet/${ADDR}")`);
  });
});
