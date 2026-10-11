# Changelog

## 0.1.0 (2026-10-10)

- Initial release.
- Wallet pages with live streaming, open positions, bust distance, portfolio chart, trade history, queue balances, PAPER, ranks and session keys.
- Leaderboard with sortable columns, window switcher, search and 0-based paging.
- Intent, position and transaction pages. Transactions are decoded with viem against BatchExecutor calldata and every intent signature is verified.
- Pages Function that serves per-wallet Open Graph previews at /w/<address>.
- Search bar with recent searches and the / shortcut.
- Unit tests built on recorded real API and RPC responses.
