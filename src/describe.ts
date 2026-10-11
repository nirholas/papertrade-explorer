import type { Instrument } from 'papertrade-sdk';
import type { DecodedIntent } from './calldata';
import { dateTime, esc, paper, shortHex, usd, wad } from './format';
import { positionHref } from './router';

const USDC_UNIT = 1_000_000n;

function usdc6(raw: string): number {
  const v = BigInt(raw);
  return Number(v / USDC_UNIT) + Number(v % USDC_UNIT) / 1e6;
}

/** One-line, HTML-escaped description of what a decoded intent asked for. */
export function describeIntent(i: DecodedIntent, instruments: Pick<Instrument, 'id' | 'symbol'>[]): string {
  const f = i.fields;
  switch (i.kind) {
    case 'openPosition': {
      const ins = instruments.find((x) => String(x.id) === String(f.instrumentId));
      const lev = Number(f.leverage);
      const notional = wad(String(f.size));
      return `${f.isLong ? 'Long' : 'Short'} ${esc(ins?.symbol ?? `instrument ${f.instrumentId}`)} at ${lev}x, ${usd(notional)} notional, ${usd(lev ? notional / lev : notional)} margin${f.useDebt ? ', using debt' : ''}`;
    }
    case 'closePositions': {
      const ids = (Array.isArray(f.positionIds) ? f.positionIds : []).map(String);
      const links = ids.map((id) => `<a href="${positionHref(id, i.user)}">#${esc(id)}</a>`).join(', ');
      return `Close ${ids.length === 1 ? 'position' : 'positions'} ${links}`;
    }
    case 'withdrawToCore':
      return `Withdraw ${usd(usdc6(String(f.amount)))} USDC to HyperCore`;
    case 'paperStake':
      return `Stake ${paper(wad(String(f.amount)))}`;
    case 'paperUnstake':
      return `Unstake ${paper(wad(String(f.amount)))}`;
    case 'paperClaim':
      return 'Claim pending USDC staking rewards';
    case 'paperDistribute':
      return 'Distribute staking rewards';
    case 'registerSessionKey':
      return `Trade-only key ${esc(shortHex(String(f.key), 8, 6))}, valid until ${esc(dateTime(Number(f.expiry) * 1000))}`;
    default:
      return `Call ${esc(i.selector)} on ${esc(shortHex(i.target))}`;
  }
}
