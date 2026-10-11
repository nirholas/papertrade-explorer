---
title: Reference
description: HTTP endpoints, the REST tool mirror, the OpenAPI description and the npm scripts.
order: 4
---

# Reference

The explorer has no CLI and no SDK of its own. Its public surface is a set of HTTP endpoints on `https://papertrade-explorer.pages.dev`.

## Endpoints

| Method and path | Purpose |
| --- | --- |
| `POST /mcp` | MCP server (Streamable HTTP, stateless). See [MCP server](/docs/mcp/). |
| `GET /mcp` | JSON description of the server with doc links. |
| `POST /api/tools/{name}` | REST mirror of every MCP tool. Body is the tool arguments as a JSON object. |
| `GET /openapi.json` | OpenAPI 3.1 description of the above. |
| `GET /llms.txt`, `/llms-full.txt` | Plain-text site summary and the full docs in one file. |
| `GET /.well-known/mcp/server-card.json` | MCP server card. |
| `GET /.well-known/agent-card.json` | A2A agent card. |
| `GET /.well-known/api-catalog` | RFC 9727 API catalog. |
| `GET /w/{address}` | Wallet link with a rich preview, redirects to the wallet page. |

## REST tool mirror

`POST /api/tools/{name}` runs one tool and returns its structured result. It is the same code path as MCP `tools/call`.

```bash
curl -s https://papertrade-explorer.pages.dev/api/tools/get_leaderboard \
  -H 'content-type: application/json' \
  -d '{"window":"24h","page":0}'
```

| Status | Meaning |
| --- | --- |
| 200 | The tool ran. The body is the structured result. |
| 400 | Body is not valid JSON. |
| 404 | Unknown tool name. |
| 405 | Method other than POST or OPTIONS. |
| 413 | Body larger than 64 KiB. |
| 422 | The tool reported an error (bad arguments, not found upstream). The body has the message. |
| 429 | Rate limit hit. `Retry-After` says when to retry. |

## Tools

The nine tools, with their schemas, are listed in [MCP server](/docs/mcp/#tools). Every tool is read-only.

## Upstream sources

| Source | Used for |
| --- | --- |
| `https://exchange.papertrade.xyz` | Wallet state, leaderboard, trade history, protocol summary, price history, recent trades |
| `https://rpc.hyperliquid.xyz/evm`, fallback `https://rpc.hypurrscan.io` | Transactions, receipts and BatchExecutor logs |

Set `PAPERTRADE_API_URL` to point the explorer at another API host.

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run dev:site` | Build and serve the site and functions locally with Wrangler on port 8792. |
| `npm run build:site` | Bundle the app, generate discovery files and render the docs. |
| `npm run typecheck` | Type-check the app and the functions. |
| `npm test` | Run the unit tests against recorded real fixtures. |
