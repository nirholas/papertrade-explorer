---
title: Overview
description: What Papertrade Explorer is, what it can answer, and where to start.
order: 1
---

# Papertrade Explorer

Papertrade Explorer is an unofficial, read-only block explorer for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x synthetic perpetuals exchange on HyperEVM (chain 999). It turns wallets, positions, intents and settlement transactions into links you can open, share and ask an AI assistant about.

> Unofficial, not affiliated with Papertrade. High leverage can lose your whole margin. Everything here is read-only: nothing signs, sends, deposits, withdraws, stakes or places an order.

## What you can look up

| You have | You get |
| --- | --- |
| A wallet address | Balance, queued and locked funds, open positions valued at the live mark with bust price and distance to bust, PnL, PAPER held and staked, session keys, leaderboard rank in every window, trade history |
| A transaction hash | The HyperEVM transaction decoded into the Papertrade intents it carried, each with its wallet, session-key signer, fields, signature check and execution result |
| An intent id | Where it is: in the live feed, queued in the relayer, or settled on-chain |
| A position id | The open or closed position, once the owner is known |
| A leaderboard name | Matching ranked wallets |

## Three ways to use it

1. **The website** at [papertrade-explorer.pages.dev](https://papertrade-explorer.pages.dev). Paste anything into the search bar. See [Quickstart](/docs/quickstart/).
2. **Your AI assistant**, through the Model Context Protocol server at `https://papertrade-explorer.pages.dev/mcp`. Nine read-only tools. See [MCP server](/docs/mcp/) and [Connect your AI](/docs/connect-your-ai/).
3. **Plain HTTP**, through the REST mirror `POST /api/tools/{name}` and the OpenAPI 3.1 description at `/openapi.json`. See [Reference](/docs/reference/).

## How it works

The explorer holds no database and no keys. Every answer is computed on demand from two public sources: the Papertrade API at `exchange.papertrade.xyz` and the HyperEVM JSON-RPC. Position math (bust price, unrealized PnL, distance to bust) comes from the official `papertrade-sdk` formulas rather than a reimplementation, and settlement calldata is decoded and each EIP-712 signature is verified by recovery.

It runs on Cloudflare Pages: a static single-page app plus Pages Functions for the API proxy, the RPC proxy, link previews and the MCP server. The site stands alone and has no runtime dependence on any other site.

## Where to go next

- New here: [Quickstart](/docs/quickstart/).
- Need the protocol rules that change how numbers read: [Concepts](/docs/concepts/).
- Wiring up Claude, ChatGPT, Codex, Gemini, Cursor or another client: [Connect your AI](/docs/connect-your-ai/).
- Building on it: [Reference](/docs/reference/) and [Agent discovery](/docs/agent-discovery/).
- Running your own copy: [Self-hosting](/docs/self-hosting/).

## Embedding

Add `?embed=1` to the site URL to hide the marketing sections and show only the product. The main page can be framed by `papertrade-os.pages.dev` and other `*.pages.dev` hosts, so it also opens as a window inside Papertrade OS: [Open in Papertrade OS](https://papertrade-os.pages.dev/?open=explorer).
