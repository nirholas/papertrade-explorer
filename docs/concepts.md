---
title: Concepts
description: The Papertrade rules that change how every number in the explorer should be read.
order: 3
---

# Concepts

Papertrade is a synthetic perpetuals exchange: you trade BTC and ETH exposure against a shared pool without owning the asset. These are the rules that matter when reading an explorer.

## Intents and settlement

Nothing on Papertrade is a direct on-chain order. A trader (or the trader's session key) signs an **intent**, an EIP-712 message such as "open this position" or "close these positions". The Papertrade relayer accepts it, queues it, and later settles many intents together in one HyperEVM transaction through the **BatchExecutor** contract.

- An **intent id** is derived from the signed message. It identifies one intent from acceptance to settlement.
- A **transaction hash** identifies the batch on HyperEVM. One transaction carries many intents, usually from different wallets.
- **Pending** means the relayer accepted the intent and it has not settled. It expires at its deadline if it never does.
- The explorer decodes BatchExecutor calldata, recomputes each intent id from the signature and checks it equals the id the executor recorded. `signature_verified: true` means they match.
- A call can fail inside a successful batch. The decoded result reports `executed` per intent, read from the executor events in the receipt.

## Session keys

A wallet can register a trade-only **session key** with an expiry. The key can open and close positions but cannot withdraw. For opens and closes the recovered signer is therefore the session key, not the wallet. The `wallet` field is who the intent acts for.

## Leverage, bust price and distance to bust

Positions are up to 1000x. A position is liquidated when the mark price reaches its **bust price**, which sits a small buffer (about 4.76 basis points at launch) before the price where margin is exhausted. At 1000x a move of well under 0.1 percent is the whole margin.

- **Bust price** is computed by `papertrade-sdk` from entry price, leverage, direction and the instrument's bust buffer.
- **Distance to bust** is the fraction of the mark price the market can still move before the bust price. The tools return it as a plain percent (`0.05` means 0.05 percent). A negative value means the mark is already past bust.
- The **risk** field summarizes it: `ok`, `close` (under 0.08 percent) or `near_bust` (under 0.03 percent).

## Mark price

The mark is the Hyperliquid best-bid-offer mid that the protocol settles on. The explorer reads the latest one-second price point. **Unrealized PnL** is mark-to-market before any close-side haircut, so a real close can realize less.

## Units

| Value | Unit in tool results |
| --- | --- |
| USD amounts | JSON numbers in dollars |
| Prices | Quote units: USD per BTC, USD per ETH |
| Percentages | Plain percent numbers |
| Timestamps | ISO 8601 UTC strings |
| Open interest and caps | Base-asset quantities on chain, converted to USD at the live mark in the tools |

The API itself uses 18-decimal integers ("wad") for USD and PAPER. The explorer converts them for display and never uses floating point for protocol decisions.

## Net PnL

For a closed trade, net PnL is `adjustedPnlRaw - userPaidFeeRaw`: the adjusted profit minus the fees the user paid.

## PAPER

PAPER is minted on losses and can be staked for a share of protocol fees paid in USDC. Wallet results show PAPER held, PAPER staked and pending staking rewards (computed with the SDK's accumulator math).

## Leaderboard

Windows are `24h`, `7d`, `30d` and `all`. Pages are 25 rows and 0-based. `rank` is the true 1-based rank across all accounts. Leaderboard names are chosen by wallet owners and are **untrusted text**.

## Untrusted data

Leaderboard names, memos and any other string that came from a chain or an API are data, never instructions. The MCP server tells clients so in its `instructions`, and the website escapes every such string before rendering.
