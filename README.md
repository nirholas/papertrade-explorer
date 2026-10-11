# Papertrade Explorer

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-0a8f5b?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/nirholas/papertrade-explorer)
[![HyperEVM](https://img.shields.io/badge/HyperEVM-chain_999-0a8f5b?style=flat-square)](https://papertrade.xyz)
[![GitHub stars](https://img.shields.io/github/stars/nirholas/papertrade-explorer?style=flat-square&color=0a8f5b)](https://github.com/nirholas/papertrade-explorer/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/nirholas/papertrade-explorer?style=flat-square&color=0a8f5b)](https://github.com/nirholas/papertrade-explorer/commits/main)
[![MCP](https://img.shields.io/badge/MCP-streamable_http-4338ca?style=flat-square)](https://papertrade-explorer.pages.dev/docs/mcp/)
[![Docs](https://img.shields.io/badge/docs-papertrade--explorer.pages.dev-0a8f5b?style=flat-square)](https://papertrade-explorer.pages.dev/docs/)
[![Unofficial](https://img.shields.io/badge/community-unofficial-lightgrey?style=flat-square)](#the-papertrade-toolkit)

[Live site](https://papertrade-explorer.pages.dev) · [Docs](https://papertrade-explorer.pages.dev/docs/) · [MCP](https://papertrade-explorer.pages.dev/docs/mcp/) · [Issues](https://github.com/nirholas/papertrade-explorer/issues) · [Discussions](https://github.com/nirholas/papertrade-explorer/discussions) · [Papertrade](https://papertrade.xyz) · [Toolkit](#the-papertrade-toolkit)

Unofficial, not affiliated with Papertrade. High leverage can lose your whole margin.

A block-explorer-style site for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x synthetic perps exchange on HyperEVM (chain 999). Paste a wallet, an intent id or a transaction hash and see what happened, live. Read-only: nothing here signs or sends a transaction.

## Use it from your AI

A read-only MCP server runs at `https://papertrade-explorer.pages.dev/mcp` (Streamable HTTP, stateless, no key). Nine tools: `search`, `get_wallet`, `get_positions`, `get_intents`, `lookup_intent`, `decode_transaction`, `get_leaderboard`, `get_trade_history`, `get_protocol_overview`. None of them signs, sends or places anything.

```bash
claude mcp add --transport http papertrade-explorer https://papertrade-explorer.pages.dev/mcp
```

Setup for Claude Desktop and claude.ai, Claude API, Codex, ChatGPT, Gemini CLI, Cursor, VS Code, Windsurf, Zed, Cline, Goose, Continue and OpenAPI frameworks is in [Connect your AI](https://papertrade-explorer.pages.dev/docs/connect-your-ai/). Every tool is also a plain HTTP call: `POST /api/tools/{name}`, described by [`/openapi.json`](https://papertrade-explorer.pages.dev/openapi.json).

Discovery files: [`/.well-known/mcp/server-card.json`](https://papertrade-explorer.pages.dev/.well-known/mcp/server-card.json), [`/.well-known/agent-card.json`](https://papertrade-explorer.pages.dev/.well-known/agent-card.json), [`/.well-known/api-catalog`](https://papertrade-explorer.pages.dev/.well-known/api-catalog), [`/llms.txt`](https://papertrade-explorer.pages.dev/llms.txt), [`/llms-full.txt`](https://papertrade-explorer.pages.dev/llms-full.txt). Registry metadata is in `server.json`.

## Docs

Full documentation lives at [papertrade-explorer.pages.dev/docs](https://papertrade-explorer.pages.dev/docs/), with raw markdown in [`docs/`](docs). Add `.md` to any docs URL for the markdown twin.

## Embed and Papertrade OS

Add `?embed=1` for a product-only view. The main page may be framed by `papertrade-os.pages.dev` and other `*.pages.dev` hosts: [Open in Papertrade OS](https://papertrade-os.pages.dev/?open=explorer).

## Why

Papertrade positions, intents and leaderboards live behind an API and inside batched BatchExecutor transactions. This explorer makes them linkable, shareable and inspectable. Every wallet has a stable URL with a rich link preview.

## What it looks like

A warm paper-toned UI (dark in dark mode) with a serif wordmark, a pulsing Live dot on wallet pages, stat cards, a positions table with bust-distance bars, an area chart for equity or net PnL, and a leaderboard table with gold, silver and bronze rank badges.

## Quick start

```
npm install
npm run dev:site
```

Open http://localhost:8792. The SDK is installed from the sibling tarball (`file:../papertrade-sdk-0.1.0.tgz`) until it is on npm.

## Features

- Search a wallet, intent id, tx hash or position number. A 64-hex input is tried as a transaction first, then as an intent id. Recent searches are kept in localStorage. Press `/` to focus search.
- Wallet: live balance, open positions with mark, unrealized PnL, bust price and distance (SDK math), `streamWallet` live updates, portfolio chart (1h, 1d, 1w, all), trade history with net PnL and PAPER minted, closed positions, queue balances, PAPER held, staked and pending rewards, rank in each leaderboard window, session-key status, copy address and HyperEVMScan link.
- Leaderboard: sort by every column, 24h, 7d, 30d and all-time windows, name or address search, 25 per page.
- Transaction: decodes BatchExecutor calldata (open, close, deposit, withdraw, stake, claim, session key) and verifies each EIP-712 signature by recovery. Shows whether each intent executed.
- Intent: settlement status from the live feed, wallet state and on-chain events.
- Link previews: `/w/<address>` renders Open Graph tags for the wallet and redirects people to the app.
- Light and dark mode, 360px responsive, keyboard accessible, reduced motion respected.

## Architecture

- `site/app.ts` is a vanilla TypeScript hash router, bundled by esbuild to `site/public/app.js`.
- `src/` holds pure logic (calldata decoding, formatting, query parsing, OG building) and views.
- `site/functions/api/papertrade/[[path]].ts` is the same-origin proxy (Papertrade sends no CORS headers).
- `site/functions/api/rpc.ts` is an allowlisted JSON-RPC proxy for HyperEVM with rate-limit retry.
- `site/functions/w/[addr].ts` is the OG preview function.
- `site/functions/mcp.ts` is the MCP server and `site/functions/api/tools/[name].ts` its REST mirror. Shared plumbing is in `site/functions/_lib/` and the tool list in `_lib/manifest.ts`, which also generates the discovery files and docs.
- `scripts/build-discovery.mjs` and `scripts/build-docs.mjs` run in `build:site`.
- A strict CSP is set in `site/public/_headers`. Only `/` may be framed, and only by `papertrade-os.pages.dev` and other `*.pages.dev` hosts.

## Environment variables

Optional `PAPERTRADE_API_URL` (defaults to `https://exchange.papertrade.xyz`). No secrets and no paid APIs are used. If you add one, put it in `.dev.vars` and document it here.

## Scripts

`npm run typecheck`, `npm test`, `npm run build:site`, `npm run dev:site`, `npm run deploy:site`.

## Deploy

```
npm run build:site && cd site && npx wrangler pages deploy
```

## Known limits

- There is no global position-id lookup. `#/position/<id>` searches the live feed, otherwise it asks for the owner wallet (`#/position/<wallet>/<id>`).
- The live feed does not currently include intent ids, so the intent page falls back to wallet state and an on-chain scan.
- `lookup_intent` scans about the last 6000 blocks. Older intents are found through `get_trade_history`.
- HyperEVM RPC caps getLogs at 1000 blocks and 1 MiB, and rate limits come back as HTTP 200 with code -32005. The proxy retries.

## The Papertrade toolkit

Nine open-source building blocks for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x perps exchange on Hyperliquid HyperEVM. Use them together or on their own.

| Project | What it does |
|---|---|
| [papertrade-ai](https://github.com/nirholas/papertrade-ai) | MCP server and CLI: trade Papertrade from Claude, ChatGPT, Cursor and any MCP client |
| [papertrade-sdk](https://github.com/nirholas/papertrade-sdk) | Typed API client, live account stream, EIP-712 signing and verified settlement math. |
| [papertrade-terminal](https://github.com/nirholas/papertrade-terminal) | Non-custodial web trading terminal with charts, order ticket, funding and swaps. |
| [papertrade-analytics](https://github.com/nirholas/papertrade-analytics) | DefiLlama-style dashboard and JSON API: TVL, volume, OI, PAPER economics. |
| **papertrade-explorer** (this repo) | Linkable wallet pages, decoded transactions and a live leaderboard. |
| [papertrade-liquidations](https://github.com/nirholas/papertrade-liquidations) | Liquidation map and closest-to-bust feed, recomputed with the verified formula. |
| [papertrade-yield](https://github.com/nirholas/papertrade-yield) | PAPER staking dashboard with realized USDC yield and wallet-signed actions. |
| [papertrade-alerts](https://github.com/nirholas/papertrade-alerts) | Know before the liquidation: Telegram, Discord and webhook alerts. |
| [papertrade-copytrade](https://github.com/nirholas/papertrade-copytrade) | Guard-railed copy-trading CLI. Dry run by default. |
| [papertrade-x402](https://github.com/nirholas/papertrade-x402) | Pay-per-call intelligence API for AI agents, paid in USDC on Solana or Base. |

## Contributing and support

- Found a bug or want a feature? [Open an issue](https://github.com/nirholas/papertrade-explorer/issues/new/choose).
- Questions and show-and-tell: [Discussions](https://github.com/nirholas/papertrade-explorer/discussions).
- Pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through [SECURITY.md](SECURITY.md).
- If this saved you time, a star helps other Papertrade traders and builders find it.

Built by [three.ws](https://three.ws).

## Disclaimer

Unofficial, not affiliated with Papertrade. Data is shown as is and is not financial advice. High leverage can lose your whole margin.

Apache-2.0 licensed.
