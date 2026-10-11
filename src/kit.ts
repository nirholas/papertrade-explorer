import { esc } from './format';

export interface Ctx {
  signal: AbortSignal;
  /** Register a cleanup that runs when the user leaves the view. */
  onDispose(fn: () => void): void;
}

export type Mount = (root: HTMLElement, ctx: Ctx) => void;

export const HYPEREVMSCAN = 'https://hyperevmscan.io';
export const scanAddress = (a: string) => `${HYPEREVMSCAN}/address/${a}`;
export const scanTx = (h: string) => `${HYPEREVMSCAN}/tx/${h}`;

export function messageOf(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Something went wrong.';
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export function skeleton(rows = 3, tall = false): string {
  const bars = Array.from({ length: rows }, (_, i) => `<div class="sk ${tall && i === 0 ? 'tall' : ''} ${['w80', 'w60', 'w40'][i % 3]}"></div>`).join('');
  return `<div class="skeleton" role="status" aria-label="Loading"><span class="sr">Loading</span>${bars}</div>`;
}

export function statSkeletons(n: number): string {
  return `<div class="grid stats" role="status" aria-label="Loading">${Array.from({ length: n }, () => '<div class="stat"><div class="sk w40"></div><div class="sk tall"></div></div>').join('')}</div>`;
}

export function errorState(title: string, detail: string, retry = true): string {
  return `<div class="state error" role="alert"><div class="glyph" aria-hidden="true">!</div><h3>${esc(title)}</h3><p>${esc(detail)}</p>${retry ? '<button type="button" class="btn" data-retry>Try again</button>' : ''}</div>`;
}

export function emptyState(title: string, body: string, extra = ''): string {
  return `<div class="state"><div class="glyph" aria-hidden="true">&#9783;</div><h3>${esc(title)}</h3><p>${body}</p>${extra}</div>`;
}

/**
 * Fill an element from an async source with a skeleton while loading and a retry button on failure.
 * The renderer returns HTML; `after` runs once it is in the DOM (for charts and handlers).
 */
export function loadInto<T>(el: HTMLElement, ctx: Ctx, loading: string, fetcher: (signal: AbortSignal) => Promise<T>, render: (data: T) => string, after?: (el: HTMLElement, data: T) => void): () => Promise<void> {
  const run = async (): Promise<void> => {
    el.setAttribute('aria-busy', 'true');
    el.innerHTML = loading;
    try {
      const data = await fetcher(ctx.signal);
      if (ctx.signal.aborted) return;
      el.innerHTML = render(data);
      applyBars(el);
      after?.(el, data);
    } catch (e) {
      if (isAbort(e) || ctx.signal.aborted) return;
      el.innerHTML = errorState('Could not load this section', messageOf(e));
      el.querySelector<HTMLButtonElement>('[data-retry]')?.addEventListener('click', () => void run());
    } finally {
      el.removeAttribute('aria-busy');
    }
  };
  void run();
  return run;
}

/** Bars carry their fill in data-w so no inline style attribute is needed (strict CSP). */
export function applyBars(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => el.style.setProperty('--w', `${Math.max(0, Math.min(100, Number(el.dataset.w) || 0))}%`));
}

export function copyButton(value: string, label = 'Copy'): string {
  return `<button type="button" class="iconbtn" data-copy="${esc(value)}" aria-label="${esc(label)} ${esc(value)}">${esc(label)}</button>`;
}

let toastTimer = 0;
export function toast(message: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 1800);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'sr';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? 'Copied' : 'Copy failed. Select the text and copy it manually.');
  }
}

export const extLink = (href: string, text: string) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(text)}</a>`;

export function stat(k: string, v: string, s = '', cls = ''): string {
  return `<div class="stat"><div class="k">${esc(k)}</div><div class="v ${cls}">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
}
