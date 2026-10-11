export const ROOT: string;
export function loadManifest(): Promise<typeof import('../../site/functions/_lib/manifest')>;
export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string };
export function toolsMarkdown(tools: import('../../site/functions/_lib/manifest').ToolSpec[]): string;
export function loadDocs(manifest: unknown): Promise<{ slug: string; title: string; description: string; order: number; md: string }[]>;
export function docUrl(siteUrl: string, slug: string): string;
export function twinPath(slug: string): string;
