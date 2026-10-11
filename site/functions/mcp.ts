/**
 * Model Context Protocol server (Streamable HTTP, stateless). Mounted at /mcp.
 * Read-only: see _lib/tools.ts. Plumbing and protocol rules live in _lib/mcp.ts.
 */
import { MCP_CONFIG } from './_lib/config';
import { handleMcp } from './_lib/mcp';
import { createDeps, type Env } from './_lib/tools';

export const onRequest: PagesFunction<Env> = ({ request, env }) => {
  const ip = request.headers.get('cf-connecting-ip') ?? 'anonymous';
  return handleMcp(request, MCP_CONFIG, createDeps(env), ip);
};
