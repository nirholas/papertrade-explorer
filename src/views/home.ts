import { client } from '../api';
import { ago, compact, esc, shortHex, usd, wad } from '../format';
import { emptyState, loadInto, skeleton, stat, statSkeletons, type Ctx } from '../kit';
import { intentHref, positionHref, walletHref } from '../router';
import { OS_URL, TOOLS } from '../../site/functions/_lib/manifest';

const OS_LINK = `${OS_URL}/?open=explorer`;

const FEATURES: { title: string; body: string }[] = [
  { title: 'Wallets that stay live', body: 'Balance, queued and locked funds, PAPER, session keys and rank in every window, streamed as the wallet changes.' },
  { title: 'Positions at the live mark', body: 'Bust price and distance to bust for every open position, valued on the same mark the protocol settles on.' },
  { title: 'Transactions decoded', body: 'BatchExecutor calldata becomes the intents it carried, each signature recomputed and checked against the executor.' },
  { title: 'Intents followed end to end', body: 'See whether a signed intent is in the feed, queued in the relayer or settled on HyperEVM.' },
  { title: 'Leaderboard', body: 'Ranked wallets for 24h, 7d, 30d and all time with sortable columns, name search and paging.' },
  { title: 'Built for agents', body: 'A read-only MCP server, a REST mirror, OpenAPI, llms.txt and agent cards. Nothing signs or sends.' },
];

const CLIENTS: { name: string; anchor: string }[] = [
  { name: 'Claude', anchor: 'claude-code' },
  { name: 'ChatGPT', anchor: 'chatgpt' },
  { name: 'Codex', anchor: 'openai-codex-cli' },
  { name: 'Gemini', anchor: 'gemini-cli' },
  { name: 'Cursor', anchor: 'cursor' },
  { name: 'VS Code', anchor: 'vs-code' },
  { name: 'Windsurf', anchor: 'windsurf' },
  { name: 'Zed', anchor: 'zed' },
  { name: 'Cline', anchor: 'cline' },
  { name: 'Goose', anchor: 'goose' },
  { name: 'Continue', anchor: 'continue' },
];

function connectSnippets(url: string): { id: string; label: string; hint: string; code: string }[] {
  return [
    { id: 'claude', label: 'Claude Code', hint: 'Run in a terminal.', code: `claude mcp add --transport http papertrade-explorer ${url}` },
    { id: 'codex', label: 'Codex', hint: 'Run in a terminal.', code: `codex mcp add papertrade-explorer --url ${url}` },
    { id: 'gemini', label: 'Gemini CLI', hint: 'Run in a terminal.', code: `gemini mcp add --transport http papertrade-explorer ${url}` },
    { id: 'cursor', label: 'Cursor', hint: 'Save as .cursor/mcp.json.', code: JSON.stringify({ mcpServers: { 'papertrade-explorer': { url } } }, null, 2) },
    { id: 'vscode', label: 'VS Code', hint: 'Save as .vscode/mcp.json.', code: JSON.stringify({ servers: { 'papertrade-explorer': { type: 'http', url } } }, null, 2) },
    { id: 'url', label: 'claude.ai, ChatGPT', hint: 'Add a custom connector and paste this URL.', code: url },
  ];
}

function marketingHtml(): string {
  const url = `${location.origin}/mcp`;
  const snippets = connectSnippets(url);
  return `
    <div class="cta-row">
      <a class="btn" href="/docs/">Read the docs</a>
      <a class="btn ghost" href="/docs/connect-your-ai/">Connect your AI</a>
      <a class="btn ghost" href="${esc(OS_LINK)}" target="_blank" rel="noopener noreferrer">Open in Papertrade OS</a>
    </div>
    <section class="mk" aria-labelledby="mk-f"><h2 id="mk-f">What it does</h2>
      <ul class="feature-grid">${FEATURES.map((f) => `<li><h3>${esc(f.title)}</h3><p class="muted">${esc(f.body)}</p></li>`).join('')}</ul>
    </section>
    <section class="mk" aria-labelledby="mk-w"><h2 id="mk-w">Works with your AI</h2>
      <p class="muted">One read-only MCP endpoint, no key. Pick your client for a verified setup.</p>
      <ul class="works-with">${CLIENTS.map((c) => `<li><a href="/docs/connect-your-ai/#${c.anchor}">${esc(c.name)}</a></li>`).join('')}</ul>
      <div class="card connect">
        <div class="seg" role="tablist" aria-label="Client">${snippets.map((s, i) => `<button type="button" role="tab" id="ct-${s.id}" aria-controls="cp-${s.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-tab="${s.id}">${esc(s.label)}</button>`).join('')}</div>
        ${snippets.map((s, i) => `<div role="tabpanel" id="cp-${s.id}" aria-labelledby="ct-${s.id}" ${i === 0 ? '' : 'hidden'}><p class="muted">${esc(s.hint)}</p><pre class="snippet"><code>${esc(s.code)}</code></pre><button type="button" class="btn small" data-copy="${esc(s.code)}">Copy</button></div>`).join('')}
      </div>
    </section>
    <section class="mk" aria-labelledby="mk-t"><h2 id="mk-t">Nine read-only tools</h2>
      <ul class="tool-grid">${TOOLS.map((t) => `<li><code>${esc(t.name)}</code><p class="muted">${esc(t.title)}</p></li>`).join('')}</ul>
      <p class="muted">Schemas and examples are in the <a href="/docs/mcp/">MCP docs</a>. Machine-readable: <a href="/openapi.json">openapi.json</a>, <a href="/.well-known/mcp/server-card.json">server card</a>, <a href="/.well-known/agent-card.json">agent card</a>, <a href="/llms.txt">llms.txt</a>.</p>
    </section>
    <section class="mk" aria-labelledby="mk-q"><h2 id="mk-q">Quickstart</h2>
      <ol class="steps">
        <li><b>Search.</b> Paste a wallet, transaction hash, intent id or position id above. Press <kbd>/</kbd> to focus the box.</li>
        <li><b>Share.</b> Every wallet has a link with a rich preview: <code class="wrapword">/w/&lt;address&gt;</code>.</li>
        <li><b>Ask.</b> Add the MCP URL to your assistant and ask about any wallet in plain language.</li>
      </ol>
    </section>`;
}

function wireTabs(root: HTMLElement): void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const select = (tab: HTMLButtonElement): void => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = root.querySelector<HTMLElement>(`#${t.getAttribute('aria-controls')}`);
      if (panel) panel.hidden = !on;
    }
  };
  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = tabs[(i + d + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  }
}

export function mountHome(root: HTMLElement, ctx: Ctx): void {
  root.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Unofficial explorer for Papertrade on HyperEVM</p>
      <h1>Look up any wallet, position or intent.</h1>
      <p class="lede">Papertrade is a fully on-chain 1000x synthetic perps exchange. This explorer shows live positions with bust prices, portfolio history, the leaderboard, and decodes settlement transactions into the intents they carried.</p>
    </section>
    <ul class="paste-list" aria-label="What you can paste into the search bar">
      <li><b>A wallet address</b><code>0x + 40 hex characters</code><p class="muted">Live balance, open positions, PnL, rank, session keys and trade history.</p></li>
      <li><b>A transaction hash</b><code>0x + 64 hex characters</code><p class="muted">A HyperEVM settlement tx, decoded into every intent in its batch.</p></li>
      <li><b>An intent id</b><code>0x + 64 hex characters</code><p class="muted">Where a signed intent is: queued, settled, or failed.</p></li>
      <li><b>A position id or a name</b><code>48503, or part of a leaderboard name</code><p class="muted">Find a position by id, or search leaderboard names.</p></li>
    </ul>
    <div class="stack">
      <div id="hm-stats">${statSkeletons(4)}</div>
      <section class="card" aria-labelledby="hm-t"><header><h2 id="hm-t">Latest trades</h2><span class="muted">Live feed. Open a wallet, position or intent from any row.</span></header><div id="hm-trades">${skeleton(5, true)}</div></section>
    </div>
    <div class="marketing">${marketingHtml()}</div>`;
  wireTabs(root);

  loadInto(
    root.querySelector<HTMLElement>('#hm-stats')!,
    ctx,
    statSkeletons(4),
    (signal) => client.protocolSummary(signal),
    (s) => `<div class="grid stats">
      ${stat('Value locked', `$${compact(wad(s.balances.tvl))}`, `$${compact(wad(s.balances.lp))} LP`)}
      ${stat('Lifetime volume', `$${compact(wad(s.activity.volume))}`, `${s.activity.open.toLocaleString('en-US')} open positions`)}
      ${stat('PAPER supply', compact(wad(s.paper.supply)), `${compact(wad(s.paper.staked))} staked`)}
      ${stat('Fees', usd(wad(s.fees.lifetime)), `${usd(wad(s.fees.pending))} pending`)}
    </div>`,
  );

  loadInto(
    root.querySelector<HTMLElement>('#hm-trades')!,
    ctx,
    skeleton(5, true),
    (signal) => client.recentTrades(signal),
    (r) =>
      r.events.length
        ? `<div class="tablewrap"><table><thead><tr><th>When</th><th>Event</th><th>Market</th><th class="r">Notional</th><th>Wallet</th><th>Position</th><th>Intent</th></tr></thead><tbody>${r.events
            .slice(0, 12)
            .map(
              (e) => `<tr>
                <td class="muted">${ago(e.ts)}</td>
                <td><span class="chip ${e.kind === 'liquidation' ? 'neg' : ''}">${esc(e.kind)}</span></td>
                <td><span class="side ${e.side}">${esc(e.side)} ${e.leverage}x</span> ${esc(e.instrument)}</td>
                <td class="r">${usd(e.notionalUsd)}</td>
                <td class="mono"><a href="${walletHref(e.wallet)}">${esc(shortHex(e.wallet, 6, 4))}</a></td>
                <td><a href="${positionHref(e.positionId, e.wallet)}">#${esc(e.positionId)}</a></td>
                <td class="mono">${e.intentId ? `<a href="${intentHref(e.intentId, e.wallet)}">${esc(shortHex(e.intentId, 6, 4))}</a>` : '<span class="faint">-</span>'}</td>
              </tr>`,
            )
            .join('')}</tbody></table></div>`
        : emptyState('No trades in the feed', 'The live feed is empty right now. It fills as soon as anyone trades.'),
  );
}
