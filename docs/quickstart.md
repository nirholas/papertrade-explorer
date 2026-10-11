---
title: Quickstart
description: Look up a wallet in the browser, then ask your AI assistant the same question in two minutes.
order: 2
---

# Quickstart

## In the browser

1. Open [papertrade-explorer.pages.dev](https://papertrade-explorer.pages.dev).
2. Paste a wallet address, a transaction hash, an intent id, a position id or part of a leaderboard name into the search bar. Press `/` to focus it from anywhere.
3. A 64-hex string is ambiguous (a transaction hash or an intent id), so the explorer asks HyperEVM which it is.
4. Wallet pages update live. Every wallet has a stable link: `https://papertrade-explorer.pages.dev/#/wallet/<address>`. Sharing `https://papertrade-explorer.pages.dev/w/<address>` gives a rich link preview and sends people to the same page.

## With an AI assistant

The MCP endpoint is:

```
https://papertrade-explorer.pages.dev/mcp
```

Claude Code, one command:

```bash
claude mcp add --transport http papertrade-explorer https://papertrade-explorer.pages.dev/mcp
```

Then ask: "Look up the top wallet on the Papertrade 24h leaderboard and show its open positions with distance to bust." The assistant calls `get_leaderboard`, then `get_positions`, and answers from live data.

Other clients (Claude Desktop, claude.ai, Codex, ChatGPT, Gemini CLI, Cursor, VS Code, Windsurf, Zed, Cline, Goose, Continue) are covered in [Connect your AI](/docs/connect-your-ai/).

## With curl

Call a tool over plain HTTP, no MCP client needed:

```bash
curl -s https://papertrade-explorer.pages.dev/api/tools/get_protocol_overview \
  -H 'content-type: application/json' -d '{"recent_trades":3}'
```

Or speak MCP directly:

```bash
curl -s https://papertrade-explorer.pages.dev/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Run it locally

```bash
npm install
npm run dev:site
```

Open `http://localhost:8792`. The MCP endpoint is then `http://localhost:8792/mcp`. See [Self-hosting](/docs/self-hosting/) to deploy your own.
