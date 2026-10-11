import { compact, esc, shortHex, usd, usdSigned, wad } from './format';

export interface PlacementRow {
  address: string;
  leaderboardName: string | null;
  totalWindowedPnl: string;
  realizedPnl: string;
  currentBalance: string;
  currentOpenPositionCount: number;
  currentUnrealizedPnl: string;
  totalVolume: string;
  _leaderboardRank?: number;
}

export type Placements = Partial<Record<'24h' | '7d' | '30d' | 'all', PlacementRow | null>>;

export interface WalletOg {
  title: string;
  description: string;
  url: string;
  target: string;
}

const WINDOW_LABEL: Record<string, string> = { '24h': '24h', '7d': '7d', '30d': '30d', all: 'all-time' };

/** Title and description for a wallet link preview, built from leaderboard placements. */
export function buildWalletOg(address: string, origin: string, placements: Placements): WalletOg {
  const addr = address.toLowerCase();
  const named = Object.values(placements).find((p) => p?.leaderboardName)?.leaderboardName ?? null;
  const who = named ? `${named} (${shortHex(addr)})` : shortHex(addr);
  const best = (['all', '24h'] as const).map((w) => [w, placements[w]] as const).find(([, p]) => p) ?? null;
  const parts: string[] = [];
  const ranks: string[] = [];
  for (const w of ['24h', '7d', '30d', 'all'] as const) {
    const rank = placements[w]?._leaderboardRank;
    if (rank) ranks.push(`#${rank.toLocaleString('en-US')} ${WINDOW_LABEL[w]}`);
  }
  if (best) {
    const [w, p] = best;
    parts.push(`${WINDOW_LABEL[w][0].toUpperCase()}${WINDOW_LABEL[w].slice(1)} PnL ${usdSigned(wad(p!.totalWindowedPnl))}`);
    parts.push(`balance ${usd(wad(p!.currentBalance))}`);
    parts.push(`${p!.currentOpenPositionCount} open ${p!.currentOpenPositionCount === 1 ? 'position' : 'positions'}`);
    parts.push(`volume ${usd(wad(p!.totalVolume)).replace(/\.\d+$/, '')}`);
  }
  const head = ranks.length ? `Leaderboard rank ${ranks.join(', ')}.` : 'Not on the Papertrade leaderboard yet.';
  const description = [head, parts.length ? `${parts.join(', ')}.` : '', 'Live positions, trades and PAPER on Papertrade (unofficial explorer).'].filter(Boolean).join(' ');
  const pnl = best ? ` ${usdSigned(wad(best[1]!.totalWindowedPnl))}` : '';
  const rankTitle = placements['24h']?._leaderboardRank ? ` #${compact(placements['24h']._leaderboardRank)}` : '';
  return {
    title: `${who} on Papertrade${rankTitle}${pnl ? ` |${pnl} ${WINDOW_LABEL[best![0]]}` : ''}`,
    description,
    url: `${origin}/w/${addr}`,
    target: `${origin}/#/wallet/${addr}`,
  };
}

/** HTML for crawlers (Open Graph, Twitter card) that sends humans straight to the hash route. */
export function renderOgHtml(og: WalletOg, imageUrl: string): string {
  const t = esc(og.title);
  const d = esc(og.description);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${esc(og.url)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Papertrade Explorer (unofficial)">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${esc(og.url)}">
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${esc(imageUrl)}">
<meta http-equiv="refresh" content="0;url=${esc(og.target)}">
<meta name="robots" content="noindex">
</head>
<body>
<p>Opening <a href="${esc(og.target)}">${t}</a></p>
<script>location.replace(${JSON.stringify(og.target).replace(/</g, '\\u003c')});</script>
</body>
</html>`;
}
