import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../site/functions/_lib/manifest';
import { buildDocs, esc, indexSections, renderMarkdown, slugify } from '../scripts/build-docs.mjs';
import { loadDocs, loadManifest, parseFrontmatter, toolsMarkdown } from '../scripts/lib/content.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const pub = (rel: string) => readFileSync(path.join(ROOT, 'site/public', rel), 'utf8');

describe('docs renderer', () => {
  it('gives headings stable ids, anchors and a table of contents', () => {
    const { html, toc } = renderMarkdown('# Title\n\n## Get started\n\n### get-positions\n\n## Get started\n');
    expect(html).toContain('<h2 id="get-started">');
    expect(html).toContain('<h2 id="get-started-1">');
    expect(toc.map((t) => t.id)).toEqual(['get-started', 'get-positions', 'get-started-1']);
  });

  it('escapes code and raw html so docs cannot inject markup', () => {
    const { html } = renderMarkdown('```bash\ncurl <x> "a"\n```\n\n<script>alert(1)</script>\n');
    expect(html).toContain('curl &lt;x&gt; &quot;a&quot;');
    expect(html).not.toContain('<script>');
    expect(esc('<&>"')).toBe('&lt;&amp;&gt;&quot;');
  });

  it('wraps tables for horizontal scrolling', () => {
    expect(renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |\n').html).toContain('<div class="table-wrap"><table>');
  });

  it('indexes sections as plain text and ignores headings inside code fences', () => {
    const sections = indexSections('# One\n\nHello [link](/x) `code`\n\n```\n# not a heading\n```\n\n## Two\n\nBody\n');
    expect(sections.map((s) => s.h)).toEqual(['One', 'Two']);
    expect(sections[0].x).toContain('Hello link code');
    expect(sections[0].x).toContain('# not a heading'.replace('#', ''));
    expect(slugify('Hello, World!')).toBe('hello-world');
  });

  it('parses frontmatter', () => {
    expect(parseFrontmatter('---\ntitle: A\norder: 2\n---\nBody')).toEqual({ meta: { title: 'A', order: '2' }, body: 'Body' });
    expect(parseFrontmatter('No meta').body).toBe('No meta');
  });
});

describe('docs content', () => {
  it('documents every tool with its arguments', () => {
    const md = toolsMarkdown(TOOLS);
    for (const t of TOOLS) {
      expect(md).toContain(`**\`${t.name}\`**`);
      for (const k of Object.keys(t.inputSchema.properties as object)) expect(md).toContain(`\`${k}\``);
    }
  });

  it('has every required page and the changelog', async () => {
    const pages = await loadDocs(await loadManifest());
    const slugs = pages.map((p) => p.slug);
    for (const s of ['', 'quickstart', 'concepts', 'reference', 'mcp', 'connect-your-ai', 'agent-discovery', 'self-hosting', 'security-and-limits', 'faq', 'changelog']) expect(slugs).toContain(s);
    const mcp = pages.find((p) => p.slug === 'mcp');
    expect(mcp?.md).not.toContain('<!--TOOLS-->');
    expect(mcp?.md).toContain('get_positions');
  });

  it('never uses em or en dashes and keeps the disclaimer', async () => {
    const pages = await loadDocs(await loadManifest());
    for (const p of pages) expect(p.md, p.slug).not.toMatch(/[–—]/);
    expect(pages[0].md).toContain('not affiliated');
  });
});

describe('build output', () => {
  it('renders html, a markdown twin and a search index per page', async () => {
    const n = await buildDocs();
    expect(n).toBeGreaterThanOrEqual(11);
    const html = pub('docs/mcp/index.html');
    expect(html).toContain('<link rel="canonical" href="https://papertrade-explorer.pages.dev/docs/mcp/">');
    expect(html).toContain('href="/docs/mcp.md"');
    expect(html).not.toContain('<script>');
    expect(pub('docs/mcp.md')).toContain('get_wallet');
    const index = JSON.parse(pub('docs/search-index.json')) as { t: string; u: string }[];
    expect(index.map((i) => i.u)).toContain('/docs/connect-your-ai/');
  });
});

describe('discovery files', () => {
  it('are generated from the manifest and stay valid', () => {
    execFileSync('node', ['scripts/build-discovery.mjs'], { cwd: ROOT });
    const card = JSON.parse(pub('.well-known/mcp/server-card.json'));
    expect(card.transport).toEqual({ type: 'streamable-http', endpoint: 'https://papertrade-explorer.pages.dev/mcp' });
    expect(card.tools.map((t: { name: string }) => t.name)).toEqual(TOOLS.map((t) => t.name));
    expect(pub('.well-known/mcp.json')).toBe(pub('.well-known/mcp/server-card.json'));

    const agent = JSON.parse(pub('.well-known/agent-card.json'));
    expect(agent.skills.map((s: { id: string }) => s.id)).toEqual(TOOLS.map((t) => t.name));
    expect(pub('.well-known/agent.json')).toBe(pub('.well-known/agent-card.json'));

    const api = JSON.parse(pub('openapi.json'));
    expect(api.openapi).toBe('3.1.0');
    expect(Object.keys(api.paths)).toContain('/mcp');
    for (const t of TOOLS) expect(api.paths[`/api/tools/${t.name}`].post.operationId).toBe(t.name);

    const catalog = JSON.parse(pub('.well-known/api-catalog'));
    expect(catalog.linkset.length).toBeGreaterThan(0);

    const robots = pub('robots.txt');
    expect(robots).toContain('Content-Signal:');
    for (const bot of ['GPTBot', 'ClaudeBot', 'Claude-User', 'OAI-SearchBot', 'Google-Extended', 'PerplexityBot']) expect(robots).toContain(`User-agent: ${bot}`);

    expect(pub('sitemap.xml')).toContain('/docs/mcp/');
    expect(pub('llms.txt')).toContain('/docs/mcp.md');
    expect(pub('llms-full.txt').length).toBeGreaterThan(5000);
    for (const f of ['llms.txt', 'llms-full.txt', 'openapi.json', 'robots.txt']) expect(pub(f), f).not.toMatch(/[–—]/);
  });

  it('serves the embeddable app route and a strict docs policy from _headers', () => {
    const headers = pub('_headers');
    const block = (name: string) => headers.split('\n\n').find((b) => b.startsWith(`${name}\n`)) ?? '';
    expect(block('/')).toContain("frame-ancestors 'self' https://papertrade-os.pages.dev https://*.pages.dev");
    expect(block('/')).toContain('rel="api-catalog"');
    expect(block('/docs/*')).toContain("frame-ancestors 'none'");
    expect(block('/*')).not.toContain('Content-Security-Policy');
    expect(block('/*')).toContain('X-Content-Type-Options: nosniff');
    expect(block('/.well-known/api-catalog')).toContain('application/linkset+json');
  });
});
