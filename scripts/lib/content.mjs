import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Bundle the import-free manifest module and load it, so generators share one source of truth. */
export async function loadManifest() {
  const result = await build({
    entryPoints: [path.join(ROOT, 'site/functions/_lib/manifest.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
  });
  const code = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

export function parseFrontmatter(raw) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length) };
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

function typeOf(p) {
  if (Array.isArray(p.type)) return p.type.join(' or ');
  if (p.enum) return p.enum.map((v) => `\`${v}\``).join(', ');
  return p.type ?? 'any';
}

/** Markdown reference for every tool, generated from the manifest so docs match the server. */
export function toolsMarkdown(tools) {
  const summary = ['| Tool | Purpose |', '| --- | --- |'];
  for (const t of tools) summary.push(`| [\`${t.name}\`](#${t.name.replace(/_/g, '-')}) | ${cell(t.title)} |`);
  const parts = [summary.join('\n')];
  for (const t of tools) {
    const props = t.inputSchema.properties ?? {};
    const req = new Set(t.inputSchema.required ?? []);
    const rows = Object.entries(props).map(([k, v]) => {
      const def = v.default !== undefined ? ` Default \`${JSON.stringify(v.default)}\`.` : '';
      return `| \`${k}\` | ${typeOf(v)} | ${req.has(k) ? 'yes' : 'no'} | ${cell(v.description ?? '')}${def} |`;
    });
    const inputTable = rows.length
      ? ['| Argument | Type | Required | Description |', '| --- | --- | --- | --- |', ...rows].join('\n')
      : 'No arguments.';
    const out = Object.keys(t.outputSchema.properties ?? {}).map((k) => `\`${k}\``).join(', ');
    const example = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: t.name, arguments: t.examples[0] ?? {} } }, null, 2);
    parts.push(
      [
        `### ${t.name.replace(/_/g, '-')}`,
        '',
        `**\`${t.name}\`**. ${t.title}.`,
        '',
        t.description,
        '',
        'Read-only. Annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`.',
        '',
        inputTable,
        '',
        `Structured result fields: ${out}.`,
        '',
        '```json',
        example,
        '```',
      ].join('\n'),
    );
  }
  return parts.join('\n\n');
}

/** Load docs/*.md plus a Changelog page rendered from CHANGELOG.md. Sorted by `order`. */
export async function loadDocs(manifest) {
  const dir = path.join(ROOT, 'docs');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md'));
  const pages = [];
  for (const f of files) {
    const { meta, body } = parseFrontmatter(await readFile(path.join(dir, f), 'utf8'));
    const slug = f === 'index.md' ? '' : f.slice(0, -3);
    let md = body.trim();
    if (md.includes('<!--TOOLS-->')) md = md.replace('<!--TOOLS-->', toolsMarkdown(manifest.TOOLS));
    pages.push({ slug, title: meta.title ?? slug, description: meta.description ?? '', order: Number(meta.order ?? 99), md });
  }
  const changelog = (await readFile(path.join(ROOT, 'CHANGELOG.md'), 'utf8')).replace(/^# Changelog\s*/, '').trim();
  pages.push({
    slug: 'changelog',
    title: 'Changelog',
    description: 'Release history of Papertrade Explorer.',
    order: 11,
    md: `# Changelog\n\n${changelog}`,
  });
  pages.sort((a, b) => a.order - b.order);
  return pages;
}

export const docUrl = (siteUrl, slug) => `${siteUrl}/docs/${slug ? `${slug}/` : ''}`;
export const twinPath = (slug) => `docs/${slug || 'index'}.md`;
