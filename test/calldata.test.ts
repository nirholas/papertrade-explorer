import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeBatchInput, executionResults, isBatchExecutorCall, KIND_LABEL } from '../src/calldata';

const load = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));

describe('decodeBatchInput', () => {
  it('decodes the Close batch from a mainnet tx (selector 0x2792e706) and verifies every intent id', async () => {
    const tx = load('tx-close');
    const batch = await decodeBatchInput(tx.to, tx.input);
    expect(batch.isBatch).toBe(true);
    expect(batch.intents).toHaveLength(4);
    for (const i of batch.intents) {
      expect(i.selector).toBe('0x2792e706');
      expect(i.kind).toBe('closePositions');
      expect(i.verified).toBe(true);
      expect(i.target).toBe('0x6cd5661646289fb6e65ea5c032310fded797d0a2');
    }
    expect(batch.intents[0].user).toBe('0xdf59ab0bc4e175667b6e2bd77fdc585d088b5a2e');
    expect(batch.intents[0].fields.positionIds).toEqual(['47034']);
    expect(batch.intents[1].user).toBe('0x67891c4b5d4474ffcab2e09b8dfa3d4c4236828c');
    expect(batch.intents[0].intentId).toBe('0xa45bce0d4543bb7d21c581dfab0a42deb52fc0233e22d34f7c5c5e87250742b2');
    expect(batch.intents[0].signer).not.toBe(batch.intents[0].user);
  });

  it('decodes an OpenPosition', async () => {
    const tx = load('tx-open');
    const batch = await decodeBatchInput(tx.to, tx.input);
    const open = batch.intents.find((i) => i.kind === 'openPosition');
    expect(open).toBeDefined();
    expect(open!.verified).toBe(true);
    expect(open!.fields).toMatchObject({ isLong: expect.any(Boolean), leverage: expect.any(String), size: expect.any(String) });
  });

  it('tells Stake from Unstake and Claim from Distribute by signature recovery', async () => {
    const stake = await decodeBatchInput(load('tx-stakeWithdraw').to, load('tx-stakeWithdraw').input);
    const kinds = stake.intents.map((i) => i.kind);
    expect(kinds.some((k) => k === 'paperStake' || k === 'paperUnstake')).toBe(true);
    expect(kinds).toContain('withdrawToCore');
    expect(stake.intents.every((i) => i.verified)).toBe(true);
    const claim = await decodeBatchInput(load('tx-claim').to, load('tx-claim').input);
    expect(claim.intents.some((i) => i.kind === 'paperClaim' || i.kind === 'paperDistribute')).toBe(true);
    expect(claim.intents.every((i) => i.verified)).toBe(true);
  });

  it('decodes RegisterSessionKey', async () => {
    const tx = load('tx-session');
    const batch = await decodeBatchInput(tx.to, tx.input);
    const reg = batch.intents.find((i) => i.kind === 'registerSessionKey');
    expect(reg?.verified).toBe(true);
    expect(reg?.fields.key).toMatch(/^0x[0-9a-f]{40}$/);
    expect(reg?.signer).toBe(reg?.user);
  });

  it('labels every kind', () => {
    expect(KIND_LABEL.closePositions).toBe('Close positions');
  });

  it('rejects calls that are not BatchExecutor batches', async () => {
    expect(isBatchExecutorCall('0x0000000000000000000000000000000000000001', '0x251fb27d')).toBe(false);
    expect((await decodeBatchInput('0x233ff29b239abc1d7748605da9b205c3e008626e', '0x12345678')).isBatch).toBe(false);
    expect((await decodeBatchInput('0x233ff29b239abc1d7748605da9b205c3e008626e', '0x251fb27d00')).isBatch).toBe(false);
  });
});

describe('executionResults', () => {
  it('maps executor events to per-intent success', () => {
    const tx = load('tx-close');
    const res = executionResults(tx.receipt.logs);
    expect(res.size).toBe(4);
    expect([...res.values()].every(Boolean)).toBe(true);
    expect(res.get('0xa45bce0d4543bb7d21c581dfab0a42deb52fc0233e22d34f7c5c5e87250742b2')).toBe(true);
  });
});
