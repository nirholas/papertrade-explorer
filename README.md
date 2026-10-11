# Papertrade Explorer

Unofficial, not affiliated with Papertrade. High leverage can lose your whole margin.

A block-explorer-style site for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x synthetic perps exchange on HyperEVM (chain 999). Paste a wallet, an intent id or a transaction hash and see what happened, live. Read-only: nothing here signs or sends a transaction.

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
- A strict CSP is set in `site/public/_headers`.

## Environment variables

None. No secrets and no paid APIs are used. If you add one, put it in `.dev.vars` and document it here.

## Scripts

`npm run typecheck`, `npm test`, `npm run build:site`, `npm run dev:site`, `npm run deploy:site`.

## Deploy

```
npm run build:site && cd site && npx wrangler pages deploy
```

## Known limits

- There is no global position-id lookup. `#/position/<id>` searches the live feed, otherwise it asks for the owner wallet (`#/position/<wallet>/<id>`).
- The live feed does not currently include intent ids, so the intent page falls back to wallet state and an on-chain scan.
- HyperEVM RPC caps getLogs at 1000 blocks and 1 MiB, and rate limits come back as HTTP 200 with code -32005. The proxy retries.

## Related

[papertrade-sdk](https://github.com/nirholas/papertrade-sdk), [papertrade-ai](https://github.com/nirholas/papertrade-ai), [papertrade-terminal](https://github.com/nirholas/papertrade-terminal), [papertrade-analytics](https://github.com/nirholas/papertrade-analytics), [papertrade-liquidations](https://github.com/nirholas/papertrade-liquidations).

## Disclaimer

Unofficial, not affiliated with Papertrade. Data is shown as is and is not financial advice. High leverage can lose your whole margin.

MIT licensed.
