/**
 * REST mirror of the MCP tools for OpenAPI-based agents: POST /api/tools/{name} with the tool
 * arguments as the JSON body returns the same result as an MCP tools/call. Read-only.
 */
import { CORS_HEADERS, MAX_BODY_BYTES, callTool, takeToken } from '../../_lib/mcp';
import { TOOL_NAMES } from '../../_lib/manifest';
import { createDeps, type Env } from '../../_lib/tools';
import { MCP_CONFIG } from '../../_lib/config';

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return json(405, { error: 'Use POST with a JSON body.' }, { allow: 'POST, OPTIONS' });
  const name = String(params.name ?? '');
  if (!TOOL_NAMES.includes(name)) return json(404, { error: `Unknown tool. Available: ${TOOL_NAMES.join(', ')}` });
  const gate = takeToken(request.headers.get('cf-connecting-ip') ?? 'anonymous', 60, 60_000);
  if (!gate.ok) return json(429, { error: 'Rate limit exceeded.' }, { 'retry-after': String(gate.retryAfterSec || 1) });
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json(413, { error: 'Request body too large.' });
  let args: unknown = {};
  if (text.trim()) {
    try {
      args = JSON.parse(text);
    } catch {
      return json(400, { error: 'The body is not valid JSON.' });
    }
  }
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return json(400, { error: 'The body must be a JSON object of tool arguments.' });
  const result = (await callTool(MCP_CONFIG, name, args, createDeps(env))) as { isError?: boolean };
  return json(result.isError ? 422 : 200, result);
};
