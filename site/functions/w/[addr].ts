import { buildWalletOg, renderOgHtml, type PlacementRow, type Placements } from '../../../src/og';

interface Env {
  PAPERTRADE_API_URL?: string;
}

const UPSTREAM = 'https://exchange.papertrade.xyz';
const WINDOWS = ['24h', '7d', '30d', 'all'] as const;

async function placement(base: string, addr: string, window: string): Promise<PlacementRow | null> {
  try {
    const res = await fetch(`${base}/state/leaderboard/accounts/${addr}?window=${window}`, { headers: { accept: 'application/json' }, cf: { cacheTtl: 30, cacheEverything: true } });
    if (!res.ok) return null;
    const body = (await res.json()) as { selfRow: PlacementRow | null };
    return body.selfRow;
  } catch {
    return null;
  }
}

/** /w/<address>: Open Graph preview for a wallet that sends people to the hash route. */
export const onRequestGet: PagesFunction<Env> = async ({ params, request, env }) => {
  const addr = String(params.addr ?? '').toLowerCase();
  const origin = new URL(request.url).origin;
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return Response.redirect(`${origin}/`, 302);
  const base = (env.PAPERTRADE_API_URL ?? UPSTREAM).replace(/\/+$/, '');
  const rows = await Promise.all(WINDOWS.map((w) => placement(base, addr, w)));
  const placements: Placements = Object.fromEntries(WINDOWS.map((w, i) => [w, rows[i]]));
  const html = renderOgHtml(buildWalletOg(addr, origin, placements), `${origin}/og.png`);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-robots-tag': 'noindex' } });
};
