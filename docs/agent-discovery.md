---
title: Agent discovery
description: The machine-readable files an agent or crawler can use to find and understand this site.
order: 7
---

# Agent discovery

Every file below is a real static file, generated from the same source as the MCP server, so they cannot drift from the tools.

| URL | Content type | What it is |
| --- | --- | --- |
| `/.well-known/mcp/server-card.json` | `application/json` | MCP server card: server info, the Streamable HTTP endpoint, capabilities and the tool list |
| `/.well-known/mcp.json` | `application/json` | Alias of the server card |
| `/.well-known/agent-card.json` | `application/json` | A2A agent card with one skill per tool |
| `/.well-known/agent.json` | `application/json` | Alias of the agent card |
| `/.well-known/api-catalog` | `application/linkset+json` | RFC 9727 catalog linking the OpenAPI file, the MCP endpoint, the docs and llms.txt |
| `/openapi.json` | `application/json` | OpenAPI 3.1 for `/mcp` and `/api/tools/{name}` |
| `/llms.txt` | `text/plain` | Short site summary with links to every docs page |
| `/llms-full.txt` | `text/plain` | The complete documentation in one file |
| `/robots.txt` | `text/plain` | Crawl rules with a Content-Signal and explicit allows for GPTBot, ClaudeBot, Claude-User, OAI-SearchBot, Google-Extended and PerplexityBot |
| `/sitemap.xml` | `application/xml` | All pages including docs |
| `/docs/<page>.md` | `text/markdown` | Raw markdown of any docs page |

The home page also sends `Link` headers: `rel="service-desc"` (OpenAPI), `rel="api-catalog"` and `rel="mcp"`.

## Registry metadata

`server.json` at the repository root describes the server for the official MCP registry under the name `io.github.nirholas/papertrade-explorer`, with a Streamable HTTP remote at the live `/mcp`. It is metadata only. Publishing it is a separate, owner-controlled step.

## Fetching docs as markdown

Add `.md` to any docs path:

```bash
curl -s https://papertrade-explorer.pages.dev/docs/concepts.md
```
