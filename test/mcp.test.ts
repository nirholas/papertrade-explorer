import { beforeEach, describe, expect, it } from 'vitest';
import { CORS_HEADERS, handleMcp, resetRateLimits, takeToken, validateArgs, ToolError, type McpConfig } from '../site/functions/_lib/mcp';

const config: McpConfig<null> = {
  info: { name: 'unit', title: 'Unit', version: '1.2.3' },
  instructions: 'Use the tools.',
  docsUrl: 'https://example.test/docs/',
  rateLimit: { limit: 3, windowMs: 60_000 },
  tools: [
    {
      name: 'echo',
      title: 'Echo',
      description: 'Echoes the text.',
      inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 5 }, n: { type: 'integer', minimum: 0, maximum: 9 } }, required: ['text'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      handler: async (args) => ({ text: `echo ${args.text}`, data: { text: args.text } }),
    },
    { name: 'broken', title: 'Broken', description: 'Always fails.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, handler: async () => Promise.reject(new ToolError('upstream is down')) },
    { name: 'crash', title: 'Crash', description: 'Throws a raw error.', inputSchema: { type: 'object', properties: {} }, handler: async () => Promise.reject(new Error('boom')) },
  ],
};

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://example.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const call = async (req: Request, key = 'k1') => handleMcp(req, config, null, key);
const rpc = (id: number, method: string, params?: unknown) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });

beforeEach(() => resetRateLimits());

describe('initialize', () => {
  it('echoes a supported protocol version and advertises read-only tools', async () => {
    for (const v of ['2025-06-18', '2025-03-26', '2024-11-05']) {
      const res = await call(post(rpc(1, 'initialize', { protocolVersion: v, capabilities: {}, clientInfo: { name: 't', version: '1' } })));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(body.result.protocolVersion).toBe(v);
      expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
      expect(body.result.serverInfo).toEqual(config.info);
      expect(body.result.instructions).toBe('Use the tools.');
    }
  });

  it('falls back to 2025-06-18 for an unknown version', async () => {
    const body = await (await call(post(rpc(1, 'initialize', { protocolVersion: '1999-01-01' })))).json();
    expect(body.result.protocolVersion).toBe('2025-06-18');
  });
});

describe('transport', () => {
  it('answers notifications with 202 and no body', async () => {
    const res = await call(post({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('responds as one SSE message event when the client only accepts text/event-stream', async () => {
    const res = await call(post(rpc(7, 'ping'), { accept: 'text/event-stream' }));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text.startsWith('event: message\ndata: ')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(true);
    expect(JSON.parse(text.split('data: ')[1])).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });

  it('prefers JSON when the client accepts both', async () => {
    const res = await call(post(rpc(1, 'ping')));
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('answers a batch with an array and drops notifications from it', async () => {
    const res = await call(post([rpc(1, 'ping'), { jsonrpc: '2.0', method: 'notifications/initialized' }, rpc(2, 'tools/list')]));
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.map((r: { id: number }) => r.id)).toEqual([1, 2]);
    expect(body[1].result.tools.map((t: { name: string }) => t.name)).toEqual(['echo', 'broken', 'crash']);
  });

  it('GET with text/event-stream is 405 with Allow: POST', async () => {
    const res = await handleMcp(new Request('https://example.test/mcp', { headers: { accept: 'text/event-stream' } }), config, null);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('POST');
  });

  it('plain GET describes the server', async () => {
    const res = await handleMcp(new Request('https://example.test/mcp'), config, null);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ name: 'unit', transport: 'streamable-http', endpoint: 'https://example.test/mcp', docs: 'https://example.test/docs/', readOnly: true });
    expect(body.tools).toHaveLength(3);
  });

  it('DELETE is 405', async () => {
    const res = await handleMcp(new Request('https://example.test/mcp', { method: 'DELETE' }), config, null);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toContain('POST');
  });

  it('OPTIONS preflight allows every MCP header from any origin and sets no cookies', async () => {
    const res = await handleMcp(new Request('https://example.test/mcp', { method: 'OPTIONS', headers: { origin: 'https://evil.test', 'access-control-request-method': 'POST' } }), config, null);
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    const allowed = res.headers.get('access-control-allow-headers')!;
    for (const h of ['Content-Type', 'Mcp-Session-Id', 'Mcp-Protocol-Version', 'Authorization']) expect(allowed).toContain(h);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(CORS_HEADERS['access-control-allow-origin']).toBe('*');
  });

  it('puts CORS on POST responses too', async () => {
    const res = await call(post(rpc(1, 'ping')));
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('access-control-expose-headers')).toContain('Mcp-Session-Id');
  });
});

describe('protocol errors', () => {
  it('-32700 for invalid JSON', async () => {
    const res = await call(post('{nope'));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32700);
  });

  it('-32600 for a non-JSON-RPC object, an empty batch and a non-object member', async () => {
    expect((await (await call(post({ hello: 1 }))).json()).error.code).toBe(-32600);
    const empty = await call(post([]));
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe(-32600);
    const mixed = await (await call(post([rpc(1, 'ping'), 5]))).json();
    expect(mixed[0].result).toEqual({});
    expect(mixed[1].error.code).toBe(-32600);
  });

  it('-32601 for an unknown method', async () => {
    const body = await (await call(post(rpc(3, 'tools/destroy')))).json();
    expect(body.error).toMatchObject({ code: -32601 });
    expect(body.id).toBe(3);
  });

  it('-32602 for tools/call without a name, with bad arguments type, or an unknown tool', async () => {
    expect((await (await call(post(rpc(1, 'tools/call', {})))).json()).error.code).toBe(-32602);
    expect((await (await call(post(rpc(2, 'tools/call', { name: 'echo', arguments: [] })))).json()).error.code).toBe(-32602);
    expect((await (await call(post(rpc(3, 'tools/call', { name: 'nope', arguments: {} })))).json()).error.code).toBe(-32602);
  });

  it('413 for an oversized body', async () => {
    const res = await call(post(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(70_000) } })));
    expect(res.status).toBe(413);
  });

  it('returns empty lists for resources and prompts', async () => {
    expect((await (await call(post(rpc(1, 'resources/list')))).json()).result).toEqual({ resources: [] });
    expect((await (await call(post(rpc(2, 'prompts/list')))).json()).result).toEqual({ prompts: [] });
  });
});

describe('tools/call', () => {
  it('returns text content and structuredContent', async () => {
    const body = await (await call(post(rpc(1, 'tools/call', { name: 'echo', arguments: { text: 'hi' } })))).json();
    expect(body.result.content).toEqual([{ type: 'text', text: 'echo hi' }]);
    expect(body.result.structuredContent).toEqual({ text: 'hi' });
    expect(body.result.isError).toBeUndefined();
  });

  it('turns invalid arguments, ToolError and thrown errors into isError results', async () => {
    const missing = (await (await call(post(rpc(1, 'tools/call', { name: 'echo', arguments: {} })))).json()).result;
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain('text is required');
    const tooLong = (await (await call(post(rpc(2, 'tools/call', { name: 'echo', arguments: { text: 'abcdefgh' } })))).json()).result;
    expect(tooLong.isError).toBe(true);
    const extra = (await (await call(post(rpc(3, 'tools/call', { name: 'echo', arguments: { text: 'a', other: 1 } })))).json()).result;
    expect(extra.content[0].text).toContain('not a known argument');
    resetRateLimits();
    const broken = (await (await call(post(rpc(4, 'tools/call', { name: 'broken', arguments: {} })))).json()).result;
    expect(broken).toEqual({ isError: true, content: [{ type: 'text', text: 'upstream is down' }] });
    const crash = (await (await call(post(rpc(5, 'tools/call', { name: 'crash' })))).json()).result;
    expect(crash.isError).toBe(true);
    expect(crash.content[0].text).toContain('boom');
  });

  it('rate limits tool calls per client with 429 and Retry-After, but never ping', async () => {
    for (let i = 0; i < 3; i++) expect((await call(post(rpc(i, 'tools/call', { name: 'echo', arguments: { text: 'a' } })), 'client-a')).status).toBe(200);
    const limited = await call(post(rpc(9, 'tools/call', { name: 'echo', arguments: { text: 'a' } })), 'client-a');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await call(post(rpc(10, 'ping')), 'client-a')).status).toBe(200);
    expect((await call(post(rpc(11, 'tools/call', { name: 'echo', arguments: { text: 'a' } })), 'client-b')).status).toBe(200);
  });

  it('counts every call in a batch against the budget', async () => {
    const batch = [1, 2, 3, 4].map((i) => rpc(i, 'tools/call', { name: 'echo', arguments: { text: 'a' } }));
    expect((await call(post(batch), 'client-c')).status).toBe(429);
  });
});

describe('helpers', () => {
  it('takeToken resets after the window', () => {
    expect(takeToken('x', 1, 1000, 1, 0).ok).toBe(true);
    expect(takeToken('x', 1, 1000, 1, 500).ok).toBe(false);
    expect(takeToken('x', 1, 1000, 1, 1500).ok).toBe(true);
  });

  it('validateArgs checks type, enum, pattern and bounds', () => {
    const schema = { type: 'object', properties: { a: { type: 'string', pattern: '^0x[0-9a-f]{2}$' }, w: { type: 'string', enum: ['24h', '7d'] }, p: { type: 'integer', minimum: 0, maximum: 3 } }, additionalProperties: false };
    expect(validateArgs(schema, { a: '0xab', w: '7d', p: 2 })).toBeNull();
    expect(validateArgs(schema, { a: 'zz' })).toContain('format');
    expect(validateArgs(schema, { w: '1y' })).toContain('one of');
    expect(validateArgs(schema, { p: 1.5 })).toContain('integer');
    expect(validateArgs(schema, { p: 4 })).toContain('<=');
  });
});
