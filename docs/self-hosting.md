---
title: Self-hosting
description: Run the explorer locally and deploy your own copy to Cloudflare Pages.
order: 8
---

# Self-hosting

The explorer is a static site plus Cloudflare Pages Functions. It needs no database, no KV and no secrets.

## Requirements

- Node.js 20 or newer
- A Cloudflare account (free plan is enough)

## Run locally

```bash
git clone https://github.com/nirholas/papertrade-explorer
cd papertrade-explorer
npm install
npm run dev:site
```

The site and functions are served at `http://localhost:8792`, including `/mcp` and `/api/tools/{name}`.

## Deploy to Cloudflare Pages

```bash
npm run build:site
cd site
npx wrangler pages deploy --project-name <your-project> --branch main
```

Log in first with `npx wrangler login`, or set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for non-interactive deploys. Create the project once with `npx wrangler pages project create <your-project>`.

`build:site` bundles the app, generates the discovery files and renders these docs into `site/public/`. The generated discovery and docs files carry the canonical host from `site/functions/_lib/manifest.ts`. Change `SITE_URL` there to your own domain before building a fork.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAPERTRADE_API_URL` | `https://exchange.papertrade.xyz` | Upstream API host |

Set it as a Pages environment variable or a plain variable in `wrangler.toml`.

## Headers and framing

`site/public/_headers` sets a strict content security policy with no inline script. The main app route may be framed by `https://papertrade-os.pages.dev` and `https://*.pages.dev` through `frame-ancestors`. Docs pages cannot be framed. If you embed your fork in another host, add that host to the `/` rule.

## Pages Functions routing

`site/public/_routes.json` sends `/mcp`, `/api/*` and `/w/*` to functions and serves everything else as static files, so the well-known files and docs never fall back to the single-page app.
