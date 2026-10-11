export type QueryKind = 'address' | 'hash' | 'position' | 'leaderboard-name' | 'empty';

export interface ParsedQuery {
  kind: QueryKind;
  value: string;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;

/**
 * Classify what a user pasted into the search bar. A 32-byte hash is ambiguous: it is either a
 * HyperEVM transaction hash or a Papertrade intent id, and only the chain can tell which.
 */
export function parseQuery(input: string): ParsedQuery {
  const value = input.trim().replace(/^<|>$/g, '');
  if (!value) return { kind: 'empty', value };
  if (ADDRESS.test(value)) return { kind: 'address', value: value.toLowerCase() };
  if (HASH.test(value)) return { kind: 'hash', value: value.toLowerCase() };
  const pos = /^#?(?:position[\s:/-]*)?(\d{1,12})$/i.exec(value);
  if (pos) return { kind: 'position', value: pos[1] };
  return { kind: 'leaderboard-name', value };
}

export const isAddress = (v: string) => ADDRESS.test(v);
export const isHash = (v: string) => HASH.test(v);
