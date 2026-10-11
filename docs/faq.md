---
title: FAQ
description: Common questions about the explorer, the MCP server and Papertrade data.
order: 10
---

# FAQ

## Is this official?

No. Papertrade Explorer is an unofficial community tool and is not affiliated with Papertrade.

## Can the AI tools move my funds?

No. Every tool is read-only. Nothing signs or sends a transaction, and the explorer never asks for a key or a seed phrase.

## Do I need an API key or an account?

No. The endpoint is public and rate limited per client.

## Why does my 64-character hash return two possibilities?

A 32-byte hash can be a HyperEVM transaction hash or a Papertrade intent id. `search` asks HyperEVM which one it is. Use `decode_transaction` for a transaction and `lookup_intent` for an intent id.

## Why was my intent id not found?

`lookup_intent` scans about the last 100 minutes of blocks. For older intents, call `get_trade_history` for the wallet, which lists settled trades with their transactions. Pass `wallet` to also check the relayer queue.

## What does distance to bust mean?

The percent the mark price can still move against the position before it reaches its bust price. A position at 1000x can have a distance of only a few hundredths of a percent. See [Concepts](/docs/concepts/).

## Why do PnL values differ from the Papertrade app?

Unrealized PnL here is mark-to-market at the latest mark before any close-side haircut. A real close can realize slightly less, and marks move every second.

## Which clients are supported?

Any client that speaks MCP Streamable HTTP, and any HTTP client through the REST mirror. See [Connect your AI](/docs/connect-your-ai/).

## Can I embed it?

Yes. Add `?embed=1` for a product-only view. The main page may be framed by `papertrade-os.pages.dev` and other `*.pages.dev` hosts.

## Where is the source?

[github.com/nirholas/papertrade-explorer](https://github.com/nirholas/papertrade-explorer), Apache-2.0.
