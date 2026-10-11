import { INSTRUCTIONS, SERVER_INFO, SITE_URL } from './manifest';
import type { McpConfig } from './mcp';
import { buildTools, type Deps } from './tools';

/** The one MCP server definition, shared by /mcp, the REST mirror and the tests. */
export const MCP_CONFIG: McpConfig<Deps> = {
  info: SERVER_INFO,
  instructions: INSTRUCTIONS,
  tools: buildTools(),
  docsUrl: `${SITE_URL}/docs/mcp/`,
  rateLimit: { limit: 60, windowMs: 60_000 },
};
