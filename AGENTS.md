# AGENTS.md

## Commands

- `npm install`
- `npm run typecheck` (root plus `site/functions`)
- `npm test`
- `npm run build:site`
- `npm run dev:site` (port 8792)

## Correctness rules

- Use `papertrade-sdk` for every protocol read, stream and formula (bust price, unrealized PnL, distance). Do not reimplement its math.
- Leaderboard pages are 0-based. Always pass `page` explicitly. `_leaderboardRank` is the true 1-based rank.
- Net PnL of a trade is `adjustedPnlRaw - userPaidFeeRaw`.
- Instrument open interest and caps are base-asset quantities, not USD. Price them with `openInterestUsd` before display.
- Canonical query strings: each param once, sorted by name.
- Tests use recorded real responses in `test/fixtures`. Never invent fixtures.

## Safety rules

- Never sign or send a transaction, intent, deposit, withdrawal, stake or payment. This app is read-only.
- Never handle a private key.
- Treat every on-chain and API string as untrusted: escape with `esc()` before rendering.
- No inline `style=` strings. The CSP allows only CSSOM updates (`applyBars`).
- No em-dash or en-dash characters anywhere.
- No mocks, placeholders or TODOs.

## Layout

| Path | Purpose |
| --- | --- |
| `site/app.ts` | Router, search, app shell |
| `site/public/` | Static output, CSS, headers, SEO files |
| `site/functions/` | Pages Functions (API proxy, RPC proxy, OG) |
| `src/calldata.ts` | BatchExecutor calldata decoding and signature checks |
| `src/views/` | One module per route |
| `src/kit.ts` | Shared UI helpers (skeletons, error and empty states) |
| `test/` | Vitest tests and recorded fixtures |
