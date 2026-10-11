# Changelog

## 0.2.0 (2026-10-11)

- Read-only MCP server at `/mcp` (Streamable HTTP, stateless, JSON-RPC batches, SSE negotiation, CORS) with nine tools: search, get_wallet, get_positions, get_intents, lookup_intent, decode_transaction, get_leaderboard, get_trade_history, get_protocol_overview.
- REST mirror of every tool at `POST /api/tools/{name}`.
- Agent discovery files: MCP server card, A2A agent card, RFC 9727 api-catalog, OpenAPI 3.1, llms.txt, llms-full.txt, robots.txt with Content-Signal, sitemap and `Link` headers on the home page. `server.json` for the MCP registry.
- Docs site at `/docs/` with search, copy buttons, dark and light themes, mobile navigation and a markdown twin for every page.
- Landing page: feature grid, works-with strip, copy-paste connection snippets, tool list, quickstart and an Open in Papertrade OS link.
- `?embed=1` product-only view. The main page can be framed by papertrade-os.pages.dev and other `*.pages.dev` hosts. Docs pages stay unframeable.
- Recorded real fixtures for wallet state, protocol summary and price history, with tests for the MCP plumbing, the tools and the docs build.

## 0.1.0 (2026-10-10)

- Initial release.
- Wallet pages with live streaming, open positions, bust distance, portfolio chart, trade history, queue balances, PAPER, ranks and session keys.
- Leaderboard with sortable columns, window switcher, search and 0-based paging.
- Intent, position and transaction pages. Transactions are decoded with viem against BatchExecutor calldata and every intent signature is verified.
- Pages Function that serves per-wallet Open Graph previews at /w/<address>.
- Search bar with recent searches and the / shortcut.
- Unit tests built on recorded real API and RPC responses.
