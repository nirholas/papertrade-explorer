import { priceToRaw, type Instrument } from 'papertrade-sdk';
import { client } from './api';

export type Marks = Map<number, bigint>;

let tradingCache: Promise<Awaited<ReturnType<typeof client.tradingState>>> | null = null;

/** Trading state is shared by every view and refreshed at most once a minute. */
export function tradingState(force = false) {
  if (!tradingCache || force) {
    tradingCache = client.tradingState();
    tradingCache.catch(() => (tradingCache = null));
    window.setTimeout(() => (tradingCache = null), 60_000);
  }
  return tradingCache;
}

/** Latest Papertrade mark price (the Hyperliquid BBO mid) for an instrument, as a raw price. */
export async function fetchMark(instrument: Pick<Instrument, 'id' | 'priceScale'>, signal?: AbortSignal): Promise<bigint | null> {
  const { points } = await client.priceHistory({ instrumentId: instrument.id, lookbackMs: 90_000, intervalMs: 1000 }, signal);
  const last = points[points.length - 1];
  return last ? priceToRaw(last.price, instrument.priceScale) : null;
}

/** Poll marks for a changing set of instruments until the signal aborts. */
export function pollMarks(opts: { instruments: () => Instrument[]; onMarks: (marks: Marks) => void; signal: AbortSignal; everyMs?: number }): () => void {
  const marks: Marks = new Map();
  let timer = 0;
  const tick = async () => {
    const wanted = opts.instruments();
    let changed = false;
    await Promise.all(
      wanted.map(async (ins) => {
        try {
          const m = await fetchMark(ins, opts.signal);
          if (m !== null && marks.get(ins.id) !== m) {
            marks.set(ins.id, m);
            changed = true;
          }
        } catch {
          /* keep the previous mark; the next tick retries */
        }
      }),
    );
    if (changed && !opts.signal.aborted) opts.onMarks(new Map(marks));
    if (!opts.signal.aborted) timer = window.setTimeout(() => void tick(), wanted.length ? (opts.everyMs ?? 4000) : 700);
  };
  void tick();
  return () => window.clearTimeout(timer);
}
