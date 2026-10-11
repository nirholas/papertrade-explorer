/**
 * Read-only same-origin proxy for the HyperEVM JSON-RPC. Mounted at /api/rpc.
 * Only a short allowlist of read methods is forwarded, one request per call, so the
 * browser can stay on a strict `connect-src 'self'` policy. It holds no keys and signs nothing.
 */
const RPCS = ['https://rpc.hyperliquid.xyz/evm', 'https://rpc.hypurrscan.io'];
const METHODS = new Set(['eth_getTransactionByHash', 'eth_getTransactionReceipt', 'eth_getLogs', 'eth_blockNumber', 'eth_getBlockByNumber']);
const MAX_BODY_BYTES = 4096;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export const onRequest: PagesFunction = async ({ request }) => {
  if (request.method !== 'POST') return json(405, { error: { code: -32600, message: 'POST a single JSON-RPC request.' } });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { error: { code: -32600, message: 'Request too large.' } });
  let rpc: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try {
    rpc = JSON.parse(text);
  } catch {
    return json(400, { error: { code: -32700, message: 'Invalid JSON.' } });
  }
  if (Array.isArray(rpc) || typeof rpc !== 'object' || rpc === null || typeof rpc.method !== 'string' || !METHODS.has(rpc.method)) {
    return json(403, { error: { code: -32601, message: 'Only read-only explorer methods are proxied.' } });
  }
  const body = JSON.stringify({ jsonrpc: '2.0', id: typeof rpc.id === 'number' ? rpc.id : 1, method: rpc.method, params: Array.isArray(rpc.params) ? rpc.params : [] });

  let last: Response | null = null;
  for (const url of RPCS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
        const payload = await res.text();
        const limited = res.status === 429 || payload.includes('rate limited');
        if (res.ok && !limited) return new Response(payload, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        last = new Response(payload, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
        if (limited) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        else break;
      } catch {
        break;
      }
    }
  }
  return last ?? json(502, { error: { code: -32000, message: 'HyperEVM RPC did not respond.' } });
};
