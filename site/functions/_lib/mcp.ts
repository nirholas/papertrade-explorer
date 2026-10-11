/**
 * Stateless MCP server over Streamable HTTP (JSON-RPC 2.0) for Cloudflare Pages Functions.
 * No sessions, no cookies, no auth: every tool is read-only, so Origin is never trusted for anything.
 * The plumbing is generic: pass a config with tool definitions and call `handleMcp`.
 */

export const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const DEFAULT_PROTOCOL = '2025-06-18';
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_BATCH = 20;

type Json = Record<string, unknown>;

export interface ToolOutput {
  /** Human and model readable summary placed in `content`. */
  text: string;
  /** Machine readable result placed in `structuredContent`. */
  data: Json;
}

export interface McpTool<Ctx = unknown> {
  name: string;
  title: string;
  description: string;
  inputSchema: Json;
  outputSchema?: Json;
  annotations?: Json;
  handler: (args: Json, ctx: Ctx) => Promise<ToolOutput>;
}

/** Throw from a handler for an expected failure (bad input, not found, upstream down). Becomes `isError: true`. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface McpConfig<Ctx = unknown> {
  info: { name: string; title: string; version: string };
  instructions: string;
  tools: McpTool<Ctx>[];
  docsUrl?: string;
  /** tools/call budget per client per window. */
  rateLimit?: { limit: number; windowMs: number };
  toolTimeoutMs?: number;
}

export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'access-control-expose-headers': 'Mcp-Session-Id, Mcp-Protocol-Version, Retry-After',
  'access-control-max-age': '86400',
};

const rpcError = (id: unknown, code: number, message: string, data?: unknown) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } });
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });

// Rate limiting: a fixed window per client key, held in isolate memory. It bounds the damage of a
// runaway agent loop; it is not a security boundary (isolates are short lived and many).
const buckets = new Map<string, { start: number; count: number }>();
export function takeToken(key: string, limit: number, windowMs: number, cost = 1, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  if (buckets.size > 5000) for (const [k, b] of buckets) if (now - b.start > windowMs) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    buckets.set(key, { start: now, count: cost });
    return { ok: cost <= limit, retryAfterSec: 0 };
  }
  if (b.count + cost > limit) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.start + windowMs - now) / 1000)) };
  b.count += cost;
  return { ok: true, retryAfterSec: 0 };
}
export const resetRateLimits = () => buckets.clear();

/** Minimal JSON Schema check for tool arguments: type, required, enum, pattern, bounds, additionalProperties. */
export function validateArgs(schema: Json, args: unknown, path = 'arguments'): string | null {
  const type = schema.type;
  const types = Array.isArray(type) ? (type as string[]) : type ? [type as string] : [];
  const actual = args === null ? 'null' : Array.isArray(args) ? 'array' : Number.isInteger(args) ? 'integer' : typeof args;
  if (types.length && !types.some((t) => t === actual || (t === 'number' && actual === 'integer'))) return `${path} must be ${types.join(' or ')}, got ${actual}`;
  if (Array.isArray(schema.enum) && !schema.enum.includes(args)) return `${path} must be one of ${(schema.enum as unknown[]).map(String).join(', ')}`;
  if (typeof args === 'string') {
    if (typeof schema.minLength === 'number' && args.length < schema.minLength) return `${path} must be at least ${schema.minLength} characters`;
    if (typeof schema.maxLength === 'number' && args.length > schema.maxLength) return `${path} must be at most ${schema.maxLength} characters`;
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(args)) return `${path} does not match the expected format`;
  }
  if (typeof args === 'number') {
    if (typeof schema.minimum === 'number' && args < schema.minimum) return `${path} must be >= ${schema.minimum}`;
    if (typeof schema.maximum === 'number' && args > schema.maximum) return `${path} must be <= ${schema.maximum}`;
  }
  if (actual === 'object' && schema.type === 'object') {
    const obj = args as Json;
    const props = (schema.properties ?? {}) as Record<string, Json>;
    for (const key of (schema.required ?? []) as string[]) if (obj[key] === undefined) return `${path}.${key} is required`;
    for (const [key, value] of Object.entries(obj)) {
      if (props[key]) {
        const err = validateArgs(props[key], value, `${path}.${key}`);
        if (err) return err;
      } else if (schema.additionalProperties === false) return `${path}.${key} is not a known argument`;
    }
  }
  return null;
}

export function toolDescriptor<Ctx>(t: McpTool<Ctx>): Json {
  return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}), ...(t.annotations ? { annotations: t.annotations } : {}) };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new ToolError(`The tool did not finish within ${Math.round(ms / 1000)} seconds. Try again.`)), ms)))]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function callTool<Ctx>(config: McpConfig<Ctx>, name: string, rawArgs: unknown, ctx: Ctx): Promise<Json> {
  const tool = config.tools.find((t) => t.name === name);
  if (!tool) throw new RpcFailure(-32602, `Unknown tool: ${name}`);
  const args = rawArgs === undefined ? {} : rawArgs;
  const invalid = validateArgs(tool.inputSchema, args);
  if (invalid) return { isError: true, content: [{ type: 'text', text: `Invalid arguments: ${invalid}.` }] };
  try {
    const out = await withTimeout(tool.handler(args as Json, ctx), config.toolTimeoutMs ?? 25_000);
    return { content: [{ type: 'text', text: out.text }], structuredContent: out.data };
  } catch (e) {
    const message = e instanceof ToolError ? e.message : `Upstream failure: ${e instanceof Error ? e.message : String(e)}`;
    return { isError: true, content: [{ type: 'text', text: message }] };
  }
}

class RpcFailure extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

async function dispatch<Ctx>(config: McpConfig<Ctx>, msg: Json, ctx: Ctx): Promise<Json | null> {
  const isNotification = msg.id === undefined;
  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    // A JSON-RPC response sent by the client (no method) needs no reply.
    if (msg.jsonrpc === '2.0' && msg.method === undefined && ('result' in msg || 'error' in msg)) return null;
    return rpcError(msg.id, -32600, 'Invalid Request: expected a JSON-RPC 2.0 object with a string method.');
  }
  if (isNotification) return null;
  const params = (msg.params ?? {}) as Json;
  try {
    switch (msg.method) {
      case 'initialize': {
        const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
        const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : DEFAULT_PROTOCOL;
        return rpcResult(msg.id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: config.info, instructions: config.instructions });
      }
      case 'ping':
        return rpcResult(msg.id, {});
      case 'tools/list':
        return rpcResult(msg.id, { tools: config.tools.map(toolDescriptor) });
      case 'tools/call': {
        if (typeof params.name !== 'string' || !params.name) return rpcError(msg.id, -32602, 'Invalid params: tools/call requires a string "name".');
        if (params.arguments !== undefined && (typeof params.arguments !== 'object' || params.arguments === null || Array.isArray(params.arguments))) return rpcError(msg.id, -32602, 'Invalid params: "arguments" must be an object.');
        return rpcResult(msg.id, await callTool(config, params.name, params.arguments, ctx));
      }
      case 'resources/list':
        return rpcResult(msg.id, { resources: [] });
      case 'resources/templates/list':
        return rpcResult(msg.id, { resourceTemplates: [] });
      case 'prompts/list':
        return rpcResult(msg.id, { prompts: [] });
      default:
        return rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  } catch (e) {
    if (e instanceof RpcFailure) return rpcError(msg.id, e.code, e.message);
    return rpcError(msg.id, -32603, 'Internal error');
  }
}

const wantsSseOnly = (accept: string) => /text\/event-stream/i.test(accept) && !/application\/json|\*\/\*/i.test(accept);

function reply(request: Request, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  const headers: Record<string, string> = { ...CORS_HEADERS, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra };
  if (wantsSseOnly(request.headers.get('accept') ?? '') && status === 200) {
    return new Response(`event: message\ndata: ${JSON.stringify(body)}\n\n`, { status, headers: { ...headers, 'content-type': 'text/event-stream; charset=utf-8' } });
  }
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'content-type': 'application/json; charset=utf-8' } });
}

export function describeServer<Ctx>(config: McpConfig<Ctx>, endpoint: string): Json {
  return {
    name: config.info.name,
    title: config.info.title,
    version: config.info.version,
    transport: 'streamable-http',
    endpoint,
    method: 'POST',
    protocolVersions: SUPPORTED_PROTOCOLS,
    stateless: true,
    readOnly: true,
    tools: config.tools.map((t) => ({ name: t.name, title: t.title, description: t.description })),
    docs: config.docsUrl,
    note: 'Send JSON-RPC 2.0 with POST. This URL is not a web page. See the docs for client setup.',
  };
}

export async function handleMcp<Ctx>(request: Request, config: McpConfig<Ctx>, ctx: Ctx, clientKey = 'anonymous'): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (method === 'GET' || method === 'HEAD') {
    if (/text\/event-stream/i.test(request.headers.get('accept') ?? '')) return reply(request, 405, rpcError(null, -32000, 'This server has no server-initiated stream. Use POST.'), { allow: 'POST, OPTIONS' });
    return new Response(method === 'HEAD' ? null : JSON.stringify(describeServer(config, new URL(request.url).origin + new URL(request.url).pathname), null, 2), {
      status: 200,
      headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300', link: config.docsUrl ? `<${config.docsUrl}>; rel="help"` : '' },
    });
  }
  if (method !== 'POST') return reply(request, 405, rpcError(null, -32000, 'Method not allowed. Use POST.'), { allow: 'POST, OPTIONS' });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return reply(request, 413, rpcError(null, -32600, 'Request body too large.'));
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return reply(request, 413, rpcError(null, -32600, 'Request body too large.'));
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(request, 400, rpcError(null, -32700, 'Parse error: the body is not valid JSON.'));
  }

  const batch = Array.isArray(body);
  const messages = (batch ? body : [body]) as unknown[];
  if (batch && messages.length === 0) return reply(request, 400, rpcError(null, -32600, 'Invalid Request: empty batch.'));
  if (messages.length > MAX_BATCH) return reply(request, 400, rpcError(null, -32600, `Invalid Request: at most ${MAX_BATCH} messages per batch.`));
  const objects = messages.map((m) => (typeof m === 'object' && m !== null && !Array.isArray(m) ? (m as Json) : null));

  const calls = objects.filter((m) => m?.method === 'tools/call' && m.id !== undefined).length;
  if (calls && config.rateLimit) {
    const gate = takeToken(clientKey, config.rateLimit.limit, config.rateLimit.windowMs, calls);
    if (!gate.ok) {
      return reply(request, 429, rpcError(null, -32000, `Rate limit exceeded: at most ${config.rateLimit.limit} tool calls per ${Math.round(config.rateLimit.windowMs / 1000)} seconds. Retry in ${gate.retryAfterSec || 1} seconds.`), { 'retry-after': String(gate.retryAfterSec || 1) });
    }
  }

  const out = (await Promise.all(objects.map((m) => (m ? dispatch(config, m, ctx) : Promise.resolve(rpcError(null, -32600, 'Invalid Request: each message must be an object.')))))).filter((r): r is Json => r !== null);
  if (out.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return reply(request, 200, batch ? out : out[0]);
}
