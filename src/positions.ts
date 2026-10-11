import { distanceToLiquidation, liquidationPriceRaw, unrealizedPnlUsd, type Instrument, type OpenPosition } from 'papertrade-sdk';
import { wad } from './format';

export interface PositionView {
  id: string;
  symbol: string;
  instrumentId: number;
  priceScale: bigint;
  isLong: boolean;
  leverage: number;
  useDebt: boolean;
  entryRaw: bigint;
  markRaw: bigint | null;
  bustRaw: bigint;
  margin: number;
  notional: number;
  /** Mark-to-market PnL before any close-side haircut. Null until a mark is known. */
  unrealized: number | null;
  /** Fraction of the mark price the market can move before the bust price. Negative once past it. */
  distance: number | null;
  openedAtMs: number;
  intentId: string | null;
}

/** Open-position numbers computed with the SDK's protocol math (bust price, PnL, distance). */
export function positionView(p: OpenPosition, instrument: Instrument, mark: bigint | null): PositionView {
  const bustRaw = liquidationPriceRaw({ entryPriceRaw: p.entryPriceRaw, leverage: p.leverage, isLong: p.isLong, bustBufferRaw: instrument.bustBufferRaw });
  const margin = wad(p.marginRaw);
  return {
    id: p.positionId.toString(),
    symbol: instrument.symbol,
    instrumentId: instrument.id,
    priceScale: instrument.priceScale,
    isLong: p.isLong,
    leverage: p.leverage,
    useDebt: p.useDebt,
    entryRaw: p.entryPriceRaw,
    markRaw: mark,
    bustRaw,
    margin,
    notional: margin * p.leverage,
    unrealized: mark === null ? null : unrealizedPnlUsd({ isLong: p.isLong, entryPriceRaw: p.entryPriceRaw, markPriceRaw: mark, marginRaw: p.marginRaw, leverage: p.leverage }),
    distance: mark === null ? null : distanceToLiquidation({ isLong: p.isLong, markPriceRaw: mark, bustPriceRaw: bustRaw }),
    openedAtMs: p.openedAtMs,
    intentId: p.intentId,
  };
}

/** Color band for the distance bar: green is safe, amber is close, red is nearly gone. */
export function distanceBand(distance: number | null): 'ok' | 'warn' | 'danger' {
  if (distance === null) return 'ok';
  if (distance <= 0.0003) return 'danger';
  if (distance <= 0.0008) return 'warn';
  return 'ok';
}
