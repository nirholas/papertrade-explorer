import { getTransaction } from '../src/chain';
import { esc, shortHex } from '../src/format';
import { copyText, errorState, messageOf, type Ctx, type Mount } from '../src/kit';
import { parseQuery } from '../src/query';
import { addRecent, clearRecent, loadRecent } from '../src/recent';
import { intentHref, leaderboardHref, parseHash, positionHref, txHref, walletHref, type Route } from '../src/router';
import { mountHome } from '../src/views/home';
import { mountIntent } from '../src/views/intent';
import { mountLeaderboard } from '../src/views/leaderboard';
import { mountNotFound } from '../src/views/notfound';
import { mountPosition } from '../src/views/position';
import { mountTx } from '../src/views/tx';
import { mountWallet } from '../src/views/wallet';

const view = document.getElementById('view') as HTMLElement;
const form = document.getElementById('search') as HTMLFormElement;
const input = document.getElementById('q') as HTMLInputElement;
const recentBox = document.getElementById('recent') as HTMLElement;

let current: { controller: AbortController; disposers: (() => void)[] } | null = null;

function describe(route: Route): { title: string; mount: Mount; recent?: { value: string; href: string; label: string } } {
  switch (route.name) {
    case 'home':
      return { title: 'Papertrade Explorer (unofficial)', mount: mountHome };
    case 'wallet':
      return { title: `Wallet ${shortHex(route.address)} | Papertrade Explorer`, mount: mountWallet(route.address), recent: { value: route.address, href: walletHref(route.address), label: `Wallet ${shortHex(route.address, 6, 4)}` } };
    case 'tx':
      return { title: `Transaction ${shortHex(route.hash)} | Papertrade Explorer`, mount: mountTx(route.hash), recent: { value: route.hash, href: txHref(route.hash), label: `Tx ${shortHex(route.hash, 6, 4)}` } };
    case 'intent':
      return { title: `Intent ${shortHex(route.id)} | Papertrade Explorer`, mount: mountIntent(route.id, route.wallet), recent: { value: route.id, href: intentHref(route.id, route.wallet), label: `Intent ${shortHex(route.id, 6, 4)}` } };
    case 'position':
      return { title: `Position #${route.id} | Papertrade Explorer`, mount: mountPosition(route.id, route.wallet), recent: { value: route.id, href: positionHref(route.id, route.wallet), label: `Position #${route.id}` } };
    case 'leaderboard':
      return { title: 'Leaderboard | Papertrade Explorer', mount: mountLeaderboard(route) };
    case 'notfound':
      return { title: 'Not found | Papertrade Explorer', mount: mountNotFound(route.hash) };
  }
}

function render(): void {
  current?.controller.abort();
  current?.disposers.forEach((d) => d());
  const controller = new AbortController();
  const disposers: (() => void)[] = [];
  current = { controller, disposers };
  const ctx: Ctx = { signal: controller.signal, onDispose: (fn) => disposers.push(fn) };
  const route = parseHash(location.hash);
  const { title, mount, recent } = describe(route);
  document.title = title;
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((a) => (route.name === a.dataset.nav ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
  if (recent) addRecent(recent);
  hideRecent();
  view.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    mount(view, ctx);
  } catch (e) {
    view.innerHTML = errorState('This page failed to render', messageOf(e));
    view.querySelector('[data-retry]')?.addEventListener('click', render);
  }
  view.focus({ preventScroll: true });
}

// Search.
function setMessage(text: string, html = false): void {
  let el = form.querySelector<HTMLElement>('.search-msg');
  if (!text) return void el?.remove();
  if (!el) {
    el = document.createElement('p');
    el.className = 'search-msg';
    el.setAttribute('role', 'alert');
    form.append(el);
  }
  if (html) el.innerHTML = text;
  else el.textContent = text;
}

async function submit(raw: string): Promise<void> {
  setMessage('');
  const q = parseQuery(raw);
  switch (q.kind) {
    case 'empty':
      input.focus();
      return;
    case 'address':
      return go(walletHref(q.value));
    case 'position':
      return go(positionHref(q.value));
    case 'leaderboard-name':
      return go(leaderboardHref({ window: '24h', sortKey: 'totalWindowedPnl', sortDir: 'desc', page: 0, q: q.value }));
    case 'hash': {
      // A 32-byte hash is a tx hash or an intent id. The chain knows which.
      form.setAttribute('aria-busy', 'true');
      try {
        const tx = await getTransaction(q.value);
        go(tx ? txHref(q.value) : intentHref(q.value));
      } catch (e) {
        setMessage(`Could not reach HyperEVM to tell a transaction from an intent id (${esc(messageOf(e))}). Open it as a <a href="${txHref(q.value)}">transaction</a> or an <a href="${intentHref(q.value)}">intent</a>.`, true);
      } finally {
        form.removeAttribute('aria-busy');
      }
    }
  }
}

function go(href: string): void {
  input.value = '';
  input.blur();
  if (location.hash === href) render();
  else location.hash = href;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  void submit(input.value);
});

// Recent searches.
function showRecent(): void {
  const items = loadRecent();
  if (!items.length || input.value.trim()) return hideRecent();
  recentBox.innerHTML = `<h2>Recent searches <button type="button" id="recent-clear">Clear</button></h2>${items.map((r) => `<a role="option" href="${esc(r.href)}"><span>${esc(r.label)}</span><span>${esc(new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))}</span></a>`).join('')}`;
  recentBox.hidden = false;
  input.setAttribute('aria-expanded', 'true');
}
function hideRecent(): void {
  recentBox.hidden = true;
  input.setAttribute('aria-expanded', 'false');
}
input.addEventListener('focus', showRecent);
input.addEventListener('input', () => {
  setMessage('');
  showRecent();
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideRecent();
  if (e.key === 'ArrowDown') recentBox.querySelector<HTMLElement>('a')?.focus();
});
recentBox.addEventListener('keydown', (e) => {
  const links = [...recentBox.querySelectorAll<HTMLElement>('a')];
  const i = links.indexOf(document.activeElement as HTMLElement);
  if (e.key === 'ArrowDown' && i >= 0) (links[i + 1] ?? links[0]).focus();
  if (e.key === 'ArrowUp' && i >= 0) (i === 0 ? input : links[i - 1]).focus();
  if (e.key === 'Escape') {
    hideRecent();
    input.focus();
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.preventDefault();
});
recentBox.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).id === 'recent-clear') {
    clearRecent();
    hideRecent();
    input.focus();
  } else if ((e.target as HTMLElement).closest('a')) hideRecent();
});
document.addEventListener('click', (e) => {
  if (!form.contains(e.target as Node)) hideRecent();
});

// Global shortcuts and delegated actions.
document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
    e.preventDefault();
    input.focus();
    input.select();
  }
});
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-copy]');
  if (btn?.dataset.copy) void copyText(btn.dataset.copy);
});

window.addEventListener('hashchange', render);
render();
