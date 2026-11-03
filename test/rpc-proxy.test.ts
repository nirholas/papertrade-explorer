import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../site/functions/api/rpc';

const ok = { jsonrpc: '2.0', id: 1, result: '0x1234' };

function call() {
  const request = new Request('https://fixture.invalid/api/rpc', { method: 'POST', body: JSON.stringify({ id: 1, method: 'eth_blockNumber', params: [] }) });
  return (onRequest as unknown as (c: { request: Request }) => Promise<Response>)({ request });
}

function stubFetch(responder: (url: string, n: number) => Response) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    return responder(url, urls.length);
  });
  return urls;
}

afterEach(() => vi.unstubAllGlobals());

describe('/api/rpc failover', () => {
  it('fails over when an endpoint answers HTTP 200 with a "rate limit exceeded" JSON-RPC error', async () => {
    const urls = stubFetch((url) =>
      Response.json(url.includes('hyperliquid') ? { jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'rate limit exceeded' } } : ok),
    );
    const res = await call();
    expect((await res.json()) as unknown).toEqual(ok);
    expect(urls.some((u) => u.includes('hypurrscan'))).toBe(true);
  });

  it('still fails over on the legacy "rate limited" wording and on HTTP 429', async () => {
    const firsts = [() => Response.json({ error: { code: -32005, message: 'rate limited' } }), () => new Response('Too many requests', { status: 429 })];
    for (const first of firsts) {
      const urls = stubFetch((url) => (url.includes('hyperliquid') ? first() : Response.json(ok)));
      const res = await call();
      expect(((await res.json()) as { result: string }).result).toBe('0x1234');
      expect(urls.some((u) => u.includes('hypurrscan'))).toBe(true);
    }
  });

  it('does not retry a non-throttling JSON-RPC error', async () => {
    const urls = stubFetch(() => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'invalid argument' } }));
    const res = await call();
    expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32602);
    expect(urls).toHaveLength(1);
  });

  it('does not treat a -32005 result-size error as throttling', async () => {
    const urls = stubFetch(() => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32005, message: 'query returned more than 10000 results' } }));
    await call();
    expect(urls).toHaveLength(1);
  });
});
