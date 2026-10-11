import { esc } from '../format';
import { emptyState } from '../kit';

export function mountNotFound(hash: string) {
  return (root: HTMLElement): void => {
    root.innerHTML = `<section class="card">${emptyState('That page does not exist', `Nothing is mapped to <code class="mono">${esc(hash || '/')}</code>. Paste a wallet address, transaction hash, intent id or position number into the search bar.`, '<a class="btn" href="#/">Back to the start</a>')}</section>`;
  };
}
