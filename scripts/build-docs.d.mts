export function esc(s: unknown): string;
export function slugify(s: string): string;
export function renderMarkdown(md: string): { html: string; toc: { depth: number; id: string; text: string }[] };
export function indexSections(md: string): { h: string; id: string; x: string }[];
export function buildDocs(): Promise<number>;
