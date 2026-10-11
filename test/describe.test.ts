import { readFileSync } from 'node:fs';
import { decodeTradingState } from 'papertrade-sdk';
import { describe, expect, it } from 'vitest';
import { decodeBatchInput } from '../src/calldata';
import { describeIntent } from '../src/describe';

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const instruments = decodeTradingState(load('trading')).instruments;

describe('describeIntent', () => {
  it('describes real opens, closes, withdrawals and session keys', async () => {
    const open = (await decodeBatchInput(load('tx-open').to, load('tx-open').input)).intents.find((i) => i.kind === 'openPosition')!;
    expect(describeIntent(open, instruments)).toMatch(/^(Long|Short) (BTC|ETH) at \d+x, \$[\d,.]+ notional, \$[\d,.]+ margin/);

    const close = (await decodeBatchInput(load('tx-close').to, load('tx-close').input)).intents[0];
    expect(describeIntent(close, instruments)).toContain('<a href="#/position/0xdf59ab0bc4e175667b6e2bd77fdc585d088b5a2e/47034">#47034</a>');

    const mixed = (await decodeBatchInput(load('tx-stakeWithdraw').to, load('tx-stakeWithdraw').input)).intents;
    const withdraw = mixed.find((i) => i.kind === 'withdrawToCore')!;
    expect(describeIntent(withdraw, instruments)).toMatch(/^Withdraw \$[\d,.]+ USDC to HyperCore$/);

    const session = (await decodeBatchInput(load('tx-session').to, load('tx-session').input)).intents.find((i) => i.kind === 'registerSessionKey')!;
    expect(describeIntent(session, instruments)).toMatch(/^Trade-only key 0x[0-9a-f]{8}\.\.\.[0-9a-f]{6}, valid until /);
  });
});
