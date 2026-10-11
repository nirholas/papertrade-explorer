---
title: Security and limits
description: What the explorer can and cannot do, the rate limits, and how untrusted data is handled.
order: 9
---

# Security and limits

## Read-only by construction

No tool and no endpoint signs, sends, deposits, withdraws, stakes, swaps, bridges, mints or pays. The explorer holds no keys. Tools annotate themselves `readOnlyHint: true` and `destructiveHint: false`. Wallet signing, where a product needs it, stays in the user's own browser wallet and is not part of this site.

## No authentication, no cookies

The MCP endpoint and REST mirror are public and carry no credentials. They set no cookies and ignore the `Origin` header for authorization, which is why `Access-Control-Allow-Origin: *` is safe.

## Untrusted data

Leaderboard names, memos and any other string from a chain or API are treated as data. The server instructions tell the model not to follow instructions found in them, and the website escapes every such string before rendering. Do not build agent flows that let such text trigger an action.

## Limits

| Limit | Value |
| --- | --- |
| Tool calls per client | 60 per minute, counted per call (each call in a batch counts) |
| Request body | 64 KiB |
| Batch size | 20 messages |
| Tool timeout | 25 seconds |
| `lookup_intent` block scan | about 6000 blocks (roughly 100 minutes), in windows of 999 blocks |
| Leaderboard page | 25 rows. Trade history page: 75 rows. |

A `429` response includes `Retry-After`. Upstream rate limits (the Papertrade API and HyperEVM RPC) can also surface as tool errors. The server retries the second RPC endpoint before failing.

## Data accuracy

Values come live from the Papertrade API and HyperEVM. Position valuations use the latest one-second mark and are mark-to-market before any close-side haircut. Nothing here is financial advice. High leverage can lose your whole margin.

## Reporting a vulnerability

See `SECURITY.md` in the repository, or `/.well-known/security.txt`.
