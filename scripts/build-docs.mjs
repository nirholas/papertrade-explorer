// Renders docs/*.md (plus CHANGELOG.md) to static HTML, markdown twins and a search index in site/public/docs.
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { Marked } from 'marked';
import { ROOT, loadManifest, loadDocs, docUrl } from './lib/content.mjs';

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

/** Render one markdown body. Returns the HTML and the h2/h3 table of contents. */
export function renderMarkdown(md) {
  const toc = [];
  const used = new Map();
  const marked = new Marked({ gfm: true });
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(text);
        const n = used.get(id) ?? 0;
        used.set(id, n + 1);
        if (n) id = `${id}-${n}`;
        if (depth === 2 || depth === 3) toc.push({ depth, id, text: text.replace(/`/g, '') });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${inner}</h${depth}>\n`;
      },
      table(token) {
        const head = token.header.map((c, i) => `<th${token.align[i] ? ` align="${token.align[i]}"` : ''}>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const rows = token.rows.map((r) => `<tr>${r.map((c, i) => `<td${token.align[i] ? ` align="${token.align[i]}"` : ''}>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`;
      },
      code({ text, lang }) {
        const l = (lang ?? '').split(/\s+/)[0];
        return `<pre${l ? ` data-lang="${esc(l)}"` : ''}><code>${esc(text)}</code></pre>\n`;
      },
      html({ text }) {
        return esc(text);
      },
    },
  });
  return { html: marked.parse(md), toc };
}

/** Plain-text sections for the client-side search index. */
export function indexSections(md) {
  const sections = [];
  let current = { h: '', id: '', lines: [] };
  let inFence = false;
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence;
    const m = !inFence && /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      sections.push(current);
      const h = m[2].replace(/`/g, '');
      current = { h, id: slugify(h), lines: [] };
    } else current.lines.push(line);
  }
  sections.push(current);
  return sections
    .map((s) => ({
      h: s.h,
      id: s.id,
      x: s.lines.join(' ').replace(/```\w*/g, ' ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_>|#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1200),
    }))
    .filter((s) => s.h || s.x);
}

function pageHtml({ page, pages, html, toc, siteUrl, version }) {
  const i = pages.indexOf(page);
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const url = docUrl(siteUrl, page.slug);
  const href = (p) => `/docs/${p.slug ? `${p.slug}/` : ''}`;
  const twin = `/docs/${page.slug || 'index'}.md`;
  const title = page.slug ? `${page.title} - Papertrade Explorer docs` : 'Papertrade Explorer docs';
  const nav = pages.map((p) => `<li><a href="${href(p)}"${p === page ? ' aria-current="page"' : ''}>${esc(p.title)}</a></li>`).join('');
  const tocHtml = toc.length ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${toc.map((t) => `<li class="d${t.depth}"><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ul></nav>` : '';
  const pn = `<nav class="prevnext" aria-label="Pages">${prev ? `<a class="prev" href="${href(prev)}"><span>Previous</span>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a class="next" href="${href(next)}"><span>Next</span>${esc(next.title)}</a>` : '<span></span>'}</nav>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(page.description)}">
<meta name="color-scheme" content="light dark">
<link rel="canonical" href="${url}">
<link rel="alternate" type="text/markdown" href="${siteUrl}${twin}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Papertrade Explorer (unofficial)">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${siteUrl}/og.png">
<meta name="twitter:card" content="summary_large_image">
<script src="/docs/docs-theme.js"></script>
<link rel="stylesheet" href="/docs/docs.css">
<script src="/docs/docs.js" defer></script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<div class="disclaimer" role="note">Unofficial, not affiliated with Papertrade. High leverage can lose your whole margin.</div>
<header class="bar">
  <button class="icon-btn menu-btn" type="button" aria-label="Toggle navigation" aria-controls="sidebar" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
  <a class="brand" href="/docs/">Papertrade <b>Explorer</b> <span class="tag">docs</span></a>
  <div class="search" role="search">
    <label class="sr" for="doc-search">Search the docs</label>
    <input id="doc-search" type="search" placeholder="Search docs" autocomplete="off" spellcheck="false" aria-controls="doc-results" aria-expanded="false">
    <ol id="doc-results" class="results" hidden></ol>
  </div>
  <a class="bar-link" href="/">App</a>
  <a class="bar-link" href="https://github.com/nirholas/papertrade-explorer" rel="noopener noreferrer">GitHub</a>
  <button class="icon-btn theme-btn" type="button" aria-label="Toggle dark and light theme"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button>
</header>
<div class="shell">
  <aside class="sidebar" id="sidebar" aria-label="Documentation">
    <ul>${nav}</ul>
    <p class="side-links"><a href="/llms.txt">llms.txt</a> <a href="/openapi.json">openapi.json</a> <a href="/mcp">/mcp</a></p>
  </aside>
  <main id="content" tabindex="-1">
    <article class="doc">
${html}
    <p class="twin"><a href="${twin}">View as markdown</a> <span>Docs for v${esc(version)}</span></p>
    ${pn}
    </article>
  </main>
  ${tocHtml}
</div>
<footer class="foot"><p><strong>Unofficial, not affiliated with Papertrade.</strong> Read-only. Nothing here signs, sends or places anything. Apache-2.0.</p></footer>
</body>
</html>
`;
}

export async function buildDocs() {
  const m = await loadManifest();
  const pages = await loadDocs(m);
  const root = path.join(ROOT, 'site/public/docs');
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  const index = [];
  for (const page of pages) {
    const { html, toc } = renderMarkdown(page.md);
    const dir = page.slug ? path.join(root, page.slug) : root;
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), pageHtml({ page, pages, html, toc, siteUrl: m.SITE_URL, version: m.SITE_VERSION }));
    await writeFile(path.join(root, `${page.slug || 'index'}.md`), `${page.md}\n`);
    index.push({ t: page.title, u: `/docs/${page.slug ? `${page.slug}/` : ''}`, s: indexSections(page.md) });
  }
  await writeFile(path.join(root, 'search-index.json'), JSON.stringify(index));
  const { cp } = await import('node:fs/promises');
  for (const f of ['docs.css', 'docs.js', 'docs-theme.js']) await cp(path.join(ROOT, 'scripts/docs-assets', f), path.join(root, f));
  return pages.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const n = await buildDocs();
  console.log(`docs: ${n} pages`);
}
