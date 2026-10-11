import { decodeAbiParameters, getAddress, type Address, type Hex } from 'viem';
import { MAINNET, domainFor, inspectSignedIntent, toWireMessage, type PapertradePrimaryType, type SignedIntent } from 'papertrade-sdk';

/** BatchExecutor entry point the relayer calls: `execute(Call[])`. Recovered from mainnet transactions. */
export const BATCH_SELECTOR = '0x251fb27d';

/** Topic0 of the BatchExecutor event emitted once per intent: topics [sig, batchId, index, intentId]. */
export const INTENT_EVENT_TOPIC = '0x8a23ef1120f3e42e722a0c0a599a66d55ab2650ecc39716f57e625684e349cad';

const CALL_PARAMS = [
  {
    type: 'tuple[]',
    components: [
      { type: 'address', name: 'target' },
      { type: 'bytes', name: 'data' },
      { type: 'uint256', name: 'flagA' },
      { type: 'uint256', name: 'flagB' },
      { type: 'bytes32', name: 'intentId' },
    ],
  },
] as const;

const SIG_TAIL = [
  { type: 'uint8', name: 'v' },
  { type: 'bytes32', name: 'r' },
  { type: 'bytes32', name: 's' },
] as const;

interface Shape {
  /** Candidate EIP-712 primary types. The signature recovers under exactly one of them. */
  candidates: PapertradePrimaryType[];
  params: readonly { type: string; name: string }[];
}

/**
 * Inner call shapes, keyed by 4-byte selector. Layout: the EIP-712 message fields in
 * order, then (uint8 v, bytes32 r, bytes32 s). Stake/Unstake and Claim/Distribute share
 * a layout, so the signature is recovered under each candidate type to tell them apart.
 */
const SHAPES: Record<string, Shape> = {
  '0x2792e706': {
    candidates: ['Close'],
    params: [{ type: 'address', name: 'user' }, { type: 'uint256[]', name: 'positionIds' }, { type: 'uint256', name: 'nonce' }, { type: 'uint64', name: 'deadline' }, ...SIG_TAIL],
  },
  '0xec6783f0': {
    candidates: ['OpenPosition'],
    params: [
      { type: 'address', name: 'user' },
      { type: 'uint32', name: 'instrumentId' },
      { type: 'bool', name: 'isLong' },
      { type: 'uint128', name: 'size' },
      { type: 'uint32', name: 'leverage' },
      { type: 'bool', name: 'useDebt' },
      { type: 'uint256', name: 'nonce' },
      { type: 'uint64', name: 'deadline' },
      ...SIG_TAIL,
    ],
  },
  '0x8d09f23f': {
    candidates: ['WithdrawToCore'],
    params: [{ type: 'address', name: 'user' }, { type: 'uint256', name: 'amount' }, { type: 'uint256', name: 'nonce' }, { type: 'uint64', name: 'deadline' }, ...SIG_TAIL],
  },
  '0x83115825': {
    candidates: ['Stake', 'Unstake'],
    params: [{ type: 'address', name: 'user' }, { type: 'uint256', name: 'amount' }, { type: 'uint256', name: 'nonce' }, { type: 'uint64', name: 'deadline' }, ...SIG_TAIL],
  },
  '0x9c96d4a1': {
    candidates: ['Claim', 'Distribute'],
    params: [{ type: 'address', name: 'user' }, { type: 'uint256', name: 'nonce' }, { type: 'uint64', name: 'deadline' }, ...SIG_TAIL],
  },
  '0x5f76a1d6': {
    candidates: ['RegisterSessionKey'],
    params: [
      { type: 'address', name: 'user' },
      { type: 'address', name: 'key' },
      { type: 'uint64', name: 'expiry' },
      { type: 'address', name: 'feeAddress' },
      { type: 'uint256', name: 'nonce' },
      { type: 'uint64', name: 'deadline' },
      ...SIG_TAIL,
    ],
  },
};

export type IntentKind = 'openPosition' | 'closePositions' | 'withdrawToCore' | 'paperStake' | 'paperUnstake' | 'paperClaim' | 'paperDistribute' | 'registerSessionKey' | 'unknown';

const KIND_BY_TYPE: Record<PapertradePrimaryType, IntentKind> = {
  OpenPosition: 'openPosition',
  Close: 'closePositions',
  WithdrawToCore: 'withdrawToCore',
  Stake: 'paperStake',
  Unstake: 'paperUnstake',
  Claim: 'paperClaim',
  Distribute: 'paperDistribute',
  RegisterSessionKey: 'registerSessionKey',
  CancelIntent: 'unknown',
};

export const KIND_LABEL: Record<IntentKind, string> = {
  openPosition: 'Open position',
  closePositions: 'Close positions',
  withdrawToCore: 'Withdraw to HyperCore',
  paperStake: 'Stake PAPER',
  paperUnstake: 'Unstake PAPER',
  paperClaim: 'Claim staking rewards',
  paperDistribute: 'Distribute rewards',
  registerSessionKey: 'Register session key',
  unknown: 'Unrecognized call',
};

export interface DecodedIntent {
  /** Position inside the batch. */
  index: number;
  kind: IntentKind;
  selector: Hex;
  target: Address;
  /** The intent id the executor recorded for this call. */
  intentId: Hex;
  /** Wallet the intent acts for. Null when the call could not be decoded. */
  user: Address | null;
  /** Address recovered from the signature (the wallet, or its session key for opens and closes). */
  signer: Address | null;
  /** True when the intent id recomputed from the signature equals the recorded one. */
  verified: boolean;
  nonce: string | null;
  deadline: number | null;
  /** Decoded message fields as decimal strings and booleans. */
  fields: Record<string, string | boolean | string[]>;
  data: Hex;
}

export interface DecodedBatch {
  isBatch: boolean;
  intents: DecodedIntent[];
}

const EXECUTOR = MAINNET.contracts.batchExecutor.toLowerCase();

export function isBatchExecutorCall(to: string | null | undefined, input: string): boolean {
  return !!to && to.toLowerCase() === EXECUTOR && input.toLowerCase().startsWith(BATCH_SELECTOR);
}

async function decodeInner(index: number, target: Address, data: Hex, recordedId: Hex): Promise<DecodedIntent> {
  const selector = data.slice(0, 10).toLowerCase() as Hex;
  const base: DecodedIntent = { index, kind: 'unknown', selector, target, intentId: recordedId, user: null, signer: null, verified: false, nonce: null, deadline: null, fields: {}, data };
  const shape = SHAPES[selector];
  if (!shape) return base;
  let values: readonly unknown[];
  try {
    values = decodeAbiParameters(shape.params as never, `0x${data.slice(10)}` as Hex);
  } catch {
    return base;
  }
  const raw: Record<string, unknown> = {};
  shape.params.forEach((p, i) => (raw[p.name] = values[i]));
  const user = String(raw.user).toLowerCase() as Address;

  for (const type of shape.candidates) {
    let wire: Record<string, string | boolean | string[]>;
    try {
      wire = toWireMessage(type, raw);
    } catch {
      continue;
    }
    const signed = { ...wire, v: String(raw.v), r: raw.r as Hex, s: raw.s as Hex } as SignedIntent;
    try {
      const { signer, intentId } = await inspectSignedIntent(domainFor(type), type, signed);
      const match = intentId.toLowerCase() === recordedId.toLowerCase();
      if (match || type === shape.candidates[shape.candidates.length - 1]) {
        return {
          ...base,
          kind: match ? KIND_BY_TYPE[type] : shape.candidates.length === 1 ? KIND_BY_TYPE[type] : 'unknown',
          user,
          signer,
          verified: match,
          nonce: String(raw.nonce),
          deadline: Number(raw.deadline),
          fields: wire,
        };
      }
    } catch {
      continue;
    }
  }
  return { ...base, user, nonce: String(raw.nonce), deadline: Number(raw.deadline) };
}

/** Decode a BatchExecutor transaction's calldata into the intents it carried. */
export async function decodeBatchInput(to: string | null | undefined, input: Hex): Promise<DecodedBatch> {
  if (!isBatchExecutorCall(to, input)) return { isBatch: false, intents: [] };
  let calls: readonly { target: Address; data: Hex; intentId: Hex }[];
  try {
    [calls] = decodeAbiParameters(CALL_PARAMS as never, `0x${input.slice(10)}` as Hex) as unknown as [typeof calls];
  } catch {
    return { isBatch: false, intents: [] };
  }
  const intents = await Promise.all(calls.map((c, i) => decodeInner(i, getAddress(c.target).toLowerCase() as Address, c.data, c.intentId)));
  return { isBatch: true, intents };
}

/** Per-intent execution result read from the BatchExecutor events of a receipt. */
export function executionResults(logs: { address: string; topics: readonly string[]; data: string }[]): Map<string, boolean> {
  const out = new Map<string, boolean>();
  for (const log of logs) {
    if (log.address.toLowerCase() !== EXECUTOR || log.topics[0]?.toLowerCase() !== INTENT_EVENT_TOPIC || !log.topics[3]) continue;
    out.set(log.topics[3].toLowerCase(), BigInt(`0x${log.data.slice(2, 66) || '0'}`) === 1n);
  }
  return out;
}
