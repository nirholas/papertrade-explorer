const WAD = 10n ** 18n;

export function esc(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/** Wad (18 dp, decimal string or bigint) to a JS number. Display only. */
export function wad(raw: string | bigint | null | undefined): number {
  if (raw === null || raw === undefined || raw === '') return 0;
  const v = BigInt(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const n = Number(abs / WAD) + Number(abs % WAD) / 1e18;
  return neg ? -n : n;
}

const usdFmt = (max: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: max, minimumFractionDigits: Math.min(2, max) });
const usd2 = usdFmt(2);
const usd0 = usdFmt(0);

export function usd(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100000 ? usd0.format(value) : usd2.format(value);
}

export function usdSigned(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return usd(0);
  return `${value > 0 ? '+' : '-'}${usd(Math.abs(value))}`;
}

export function compact(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  for (const [limit, suffix] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const) {
    if (abs >= limit) return `${sign}${(abs / limit).toFixed(abs / limit >= 100 ? 0 : 2).replace(/\.?0+$/, '')}${suffix}`;
  }
  return `${sign}${abs.toFixed(abs >= 100 ? 0 : 2).replace(/\.?0+$/, '')}`;
}

export function paper(value: number): string {
  return `${compact(value)} PAPER`;
}

export function pct(fraction: number, digits = 2): string {
  if (!Number.isFinite(fraction)) return '-';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function shortHex(hex: string, head = 6, tail = 4): string {
  return hex.length <= head + tail + 2 ? hex : `${hex.slice(0, head + 2)}...${hex.slice(-tail)}`;
}

export function priceText(raw: string | bigint, scale: string | number | bigint): string {
  const s = Number(scale);
  const decimals = Math.max(0, Math.round(Math.log10(s)));
  return usdFmt(decimals).format(Number(raw) / s);
}

export function ago(ms: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function until(ms: number, now = Date.now()): string {
  const s = Math.round((ms - now) / 1000);
  if (s <= 0) return 'expired';
  if (s < 3600) return `${Math.ceil(s / 60)}m left`;
  if (s < 86400) return `${Math.floor(s / 3600)}h left`;
  return `${Math.floor(s / 86400)}d left`;
}

export function dateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function signClass(value: number): string {
  return value > 0 ? 'pos' : value < 0 ? 'neg' : '';
}
