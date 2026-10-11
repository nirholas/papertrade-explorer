# AGENTS.md

## Commands

- `npm install`
- `npm run typecheck` (root plus `site/functions`)
- `npm test`
- `npm run build:site` (app bundle, discovery files, docs)
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
| `site/functions/` | Pages Functions (API proxy, RPC proxy, OG, MCP, tool REST mirror) |
| `site/functions/_lib/manifest.ts` | Single source of truth for tools, server info and instructions. Edit tools here, then rebuild. |
| `site/functions/_lib/mcp.ts`, `tools.ts`, `config.ts` | MCP plumbing, tool handlers, wiring |
| `docs/*.md` | Docs source. `scripts/build-docs.mjs` renders it to `site/public/docs/` (gitignored) |
| `scripts/build-discovery.mjs` | Generates the well-known files, openapi.json, llms*.txt, robots.txt, sitemap.xml and root llms.txt (committed) |
| `src/calldata.ts` | BatchExecutor calldata decoding and signature checks |
| `src/views/` | One module per route |
| `src/kit.ts` | Shared UI helpers (skeletons, error and empty states) |
| `test/` | Vitest tests and recorded fixtures |

## MCP and HTTP API

- The server at `/mcp` is read-only and stateless. Add a tool by adding a `ToolSpec` to `manifest.ts` and a handler to `tools.ts`, then run `npm run build:site` and commit the regenerated discovery files.
- Every tool needs `inputSchema`, `outputSchema`, annotations (`readOnlyHint: true`) and a test in `test/tools.test.ts` built on recorded fixtures.
- Keep upstream calls per tool bounded and never add a tool that signs, sends, swaps, stakes or pays.
- `_headers`: only `/` and `/index.html` may be framed (`frame-ancestors` for papertrade-os.pages.dev and `*.pages.dev`). Duplicate headers from matching rules are comma-joined, so never put a second CSP in `/*`.
- Docs JS and CSS must stay external files (no inline script or style) because of the CSP.
