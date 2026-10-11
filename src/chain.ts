import type { Hex } from 'viem';
import { MAINNET } from 'papertrade-sdk';
import { INTENT_EVENT_TOPIC } from './calldata';

export interface ChainTx {
  hash: Hex;
  from: string;
  to: string | null;
  input: Hex;
  blockNumber: Hex | null;
  blockTimestamp?: Hex;
}

export interface ChainLog {
  address: string;
  topics: string[];
  data: string;
  logIndex?: string;
  transactionHash?: Hex;
  blockNumber?: Hex;
}

export interface ChainReceipt {
  status: Hex;
  gasUsed: Hex;
  logs: ChainLog[];
}

export class RpcError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
    this.name = 'RpcError';
  }
}

/** The explorer's own origin proxy for HyperEVM JSON-RPC (allowlisted read methods). */
export async function rpc<T>(method: string, params: unknown[], signal?: AbortSignal, endpoint = '/api/rpc'): Promise<T> {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal });
  let body: { result?: T; error?: { code: number; message: string } };
  try {
    body = await res.json();
  } catch {
    throw new RpcError(`HyperEVM RPC returned HTTP ${res.status} without JSON.`, res.status);
  }
  if (body.error) throw new RpcError(body.error.message, body.error.code);
  return body.result as T;
}

export const getTransaction = (hash: string, signal?: AbortSignal) => rpc<ChainTx | null>('eth_getTransactionByHash', [hash], signal);
export const getReceipt = (hash: string, signal?: AbortSignal) => rpc<ChainReceipt | null>('eth_getTransactionReceipt', [hash], signal);
export const getBlockNumber = async (signal?: AbortSignal) => Number.parseInt(await rpc<string>('eth_blockNumber', [], signal), 16);

/** The RPC caps eth_getLogs at 1000 blocks per call. */
export const LOG_WINDOW = 999;

export function intentLogFilter(intentId: string, fromBlock: number, toBlock: number) {
  return {
    address: MAINNET.contracts.batchExecutor,
    fromBlock: `0x${fromBlock.toString(16)}`,
    toBlock: `0x${toBlock.toString(16)}`,
    topics: [INTENT_EVENT_TOPIC, null, null, intentId.toLowerCase()],
  };
}

/**
 * Look for the BatchExecutor event of an intent in the most recent blocks.
 * Intents settle seconds after they are signed, so recent windows cover the live ones; older
 * intents are found through a wallet page (trades list links the settling tx).
 */
export async function findIntentTx(intentId: string, windows: number, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<ChainLog | null> {
  const head = await getBlockNumber(signal);
  for (let i = 0; i < windows; i++) {
    const to = head - i * (LOG_WINDOW + 1);
    const from = Math.max(0, to - LOG_WINDOW);
    const logs = await rpc<ChainLog[]>('eth_getLogs', [intentLogFilter(intentId, from, to)], signal);
    onProgress?.(i + 1, windows);
    if (logs.length) return logs[0];
  }
  return null;
}
