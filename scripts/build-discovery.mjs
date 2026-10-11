// Generates the agent-discovery files in site/public from the manifest and the docs sources.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, loadManifest, loadDocs, docUrl, twinPath } from './lib/content.mjs';

const m = await loadManifest();
const docs = await loadDocs(m);
const pub = path.join(ROOT, 'site/public');
const { SITE_URL, SITE_VERSION, SERVER_INFO, INSTRUCTIONS, TOOLS, REPO_URL, OS_URL, DISCLAIMER } = m;
const today = new Date().toISOString().slice(0, 10);

async function out(rel, content) {
  const file = path.join(pub, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

const DESCRIPTION =
  'Read-only explorer for Papertrade (1000x synthetic perps on HyperEVM). Look up wallets, positions valued at the live mark, intents, decoded settlement transactions and the leaderboard. Unofficial, not affiliated with Papertrade.';

const toolList = TOOLS.map((t) => ({
  name: t.name,
  title: t.title,
  description: t.description,
  inputSchema: t.inputSchema,
  outputSchema: t.outputSchema,
  annotations: t.annotations,
}));

const serverCard = {
  $schema: 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
  protocolVersion: '2025-06-18',
  serverInfo: SERVER_INFO,
  description: DESCRIPTION,
  documentationUrl: `${SITE_URL}/docs/mcp/`,
  repository: REPO_URL,
  license: 'Apache-2.0',
  transport: { type: 'streamable-http', endpoint: `${SITE_URL}/mcp` },
  capabilities: { tools: { listChanged: false } },
  authentication: { required: false, schemes: [] },
  instructions: INSTRUCTIONS,
  tools: toolList,
};
await out('.well-known/mcp/server-card.json', serverCard);
await out('.well-known/mcp.json', serverCard);

const agentCard = {
  protocolVersion: '0.3.0',
  name: SERVER_INFO.title,
  description: DESCRIPTION,
  url: `${SITE_URL}/mcp`,
  preferredTransport: 'JSONRPC',
  version: SITE_VERSION,
  documentationUrl: `${SITE_URL}/docs/`,
  provider: { organization: 'nirholas', url: 'https://github.com/nirholas' },
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  securitySchemes: {},
  security: [],
  defaultInputModes: ['application/json', 'text/plain'],
  defaultOutputModes: ['application/json', 'text/plain'],
  skills: TOOLS.map((t) => ({
    id: t.name,
    name: t.title,
    description: t.description,
    tags: ['papertrade', 'hyperevm', 'read-only', 'explorer'],
    examples: [`Call ${t.name} with ${JSON.stringify(t.examples[0] ?? {})}`],
    inputModes: ['application/json'],
    outputModes: ['application/json'],
  })),
};
await out('.well-known/agent-card.json', agentCard);
await out('.well-known/agent.json', agentCard);

await out('.well-known/api-catalog', {
  linkset: [
    {
      anchor: `${SITE_URL}/api/tools`,
      'service-desc': [{ href: `${SITE_URL}/openapi.json`, type: 'application/json' }],
      'service-doc': [{ href: `${SITE_URL}/docs/reference/`, type: 'text/html' }],
    },
    {
      anchor: `${SITE_URL}/mcp`,
      'service-desc': [{ href: `${SITE_URL}/.well-known/mcp/server-card.json`, type: 'application/json' }],
      'service-doc': [{ href: `${SITE_URL}/docs/mcp/`, type: 'text/html' }],
    },
    {
      anchor: `${SITE_URL}/`,
      describedby: [
        { href: `${SITE_URL}/llms.txt`, type: 'text/plain' },
        { href: `${SITE_URL}/llms-full.txt`, type: 'text/plain' },
        { href: `${SITE_URL}/docs/`, type: 'text/html' },
      ],
    },
  ],
});

const toolOps = {};
for (const t of TOOLS) {
  toolOps[`/api/tools/${t.name}`] = {
    post: {
      operationId: t.name,
      summary: t.title,
      description: `${t.description}\n\nRead-only. Same code path as MCP tools/call.`,
      tags: ['tools'],
      requestBody: { required: true, content: { 'application/json': { schema: t.inputSchema, example: t.examples[0] ?? {} } } },
      responses: {
        200: { description: 'Structured tool result.', content: { 'application/json': { schema: t.outputSchema } } },
        400: { $ref: '#/components/responses/Error' },
        413: { $ref: '#/components/responses/Error' },
        422: { $ref: '#/components/responses/Error' },
        429: { $ref: '#/components/responses/Error' },
      },
    },
  };
}
await out('openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Papertrade Explorer API (unofficial)',
    version: SITE_VERSION,
    description: `${DISCLAIMER} Every operation is read-only.`,
    license: { name: 'Apache-2.0', identifier: 'Apache-2.0' },
    contact: { name: 'nirholas', url: REPO_URL },
  },
  servers: [{ url: SITE_URL }],
  externalDocs: { description: 'Documentation', url: `${SITE_URL}/docs/` },
  tags: [{ name: 'mcp', description: 'Model Context Protocol' }, { name: 'tools', description: 'REST mirror of the MCP tools' }],
  paths: {
    '/mcp': {
      post: {
        operationId: 'mcp',
        summary: 'MCP Streamable HTTP endpoint (stateless JSON-RPC 2.0, batches accepted)',
        tags: ['mcp'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { oneOf: [{ $ref: '#/components/schemas/JsonRpcRequest' }, { type: 'array', maxItems: 20, items: { $ref: '#/components/schemas/JsonRpcRequest' } }] },
              example: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
            },
          },
        },
        responses: {
          200: { description: 'JSON-RPC response, or one SSE message event when Accept is only text/event-stream.', content: { 'application/json': { schema: { type: 'object' } }, 'text/event-stream': { schema: { type: 'string' } } } },
          202: { description: 'Notification accepted. No body.' },
          400: { description: 'Parse or request error.' },
          413: { description: 'Body larger than 64 KiB.' },
          429: { description: 'Rate limit hit.' },
        },
      },
      get: { operationId: 'mcpInfo', summary: 'JSON description of the MCP server', tags: ['mcp'], responses: { 200: { description: 'Server description.', content: { 'application/json': { schema: { type: 'object' } } } }, 405: { description: 'Returned when Accept is text/event-stream.' } } },
    },
    ...toolOps,
  },
  components: {
    schemas: {
      JsonRpcRequest: {
        type: 'object',
        required: ['jsonrpc', 'method'],
        properties: { jsonrpc: { const: '2.0' }, id: { type: ['string', 'integer'] }, method: { type: 'string' }, params: { type: 'object' } },
      },
      Error: { type: 'object', properties: { error: { type: 'string' } } },
    },
    responses: {
      Error: { description: 'Error.', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
});

const toolLines = TOOLS.map((t) => `- ${t.name}: ${t.title}.`).join('\n');
const docLines = docs.map((p) => `- [${p.title}](${SITE_URL}/${twinPath(p.slug)}): ${p.description}`).join('\n');
const llms = `# Papertrade Explorer

> ${DISCLAIMER} A block-explorer-style web app and read-only MCP server for Papertrade (1000x synthetic perps on HyperEVM, chain 999).

Site: ${SITE_URL}
Source: ${REPO_URL} (Apache-2.0)
MCP endpoint (Streamable HTTP, no auth): ${SITE_URL}/mcp
Open as a window in Papertrade OS: ${OS_URL}/?open=explorer

## Tools (all read-only)

${toolLines}

## Docs (raw markdown)

${docLines}

## Machine-readable

- [OpenAPI 3.1](${SITE_URL}/openapi.json)
- [MCP server card](${SITE_URL}/.well-known/mcp/server-card.json)
- [A2A agent card](${SITE_URL}/.well-known/agent-card.json)
- [API catalog](${SITE_URL}/.well-known/api-catalog)
- [Full docs in one file](${SITE_URL}/llms-full.txt)

## Web routes (hash routing, client side)

- /#/wallet/<address>: live balance, positions, bust distance, history, PAPER, ranks, session keys.
- /#/position/<id>, /#/intent/<id>, /#/tx/<hash>, /#/leaderboard.
- /w/<address>: server-rendered link preview for a wallet.
- Add ?embed=1 for a product-only view.
`;
await out('llms.txt', llms);
await writeFile(path.join(ROOT, 'llms.txt'), llms);

const full = [`# Papertrade Explorer: full documentation`, '', `> ${DISCLAIMER}`, '', `Source: ${SITE_URL}/docs/`, ...docs.flatMap((p) => ['', '---', '', `<!-- ${docUrl(SITE_URL, p.slug)} -->`, '', p.md])].join('\n');
await out('llms-full.txt', `${full}\n`);

await out(
  'robots.txt',
  `# Papertrade Explorer. AI crawlers are welcome to read everything except /api/.
Content-Signal: search=yes, ai-input=yes, ai-train=no

User-agent: *
Allow: /
Disallow: /api/

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`,
);

const urls = [
  '/',
  '/#/leaderboard',
  ...docs.map((p) => `/docs/${p.slug ? `${p.slug}/` : ''}`),
  '/llms.txt',
  '/llms-full.txt',
  '/openapi.json',
  '/.well-known/mcp/server-card.json',
  '/.well-known/agent-card.json',
];
await out(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`,
);
console.log(`discovery: ${TOOLS.length} tools, ${docs.length} docs pages`);
