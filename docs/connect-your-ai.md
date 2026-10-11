---
title: Connect your AI
description: Copy-paste setup for Claude, ChatGPT, Codex, Gemini, Cursor, VS Code, Windsurf, Zed, Cline, Goose, Continue and OpenAPI frameworks.
order: 6
---

# Connect your AI

One endpoint works everywhere: `https://papertrade-explorer.pages.dev/mcp`. It needs no key. Menu names in hosted apps change often, so where a path is given it describes the current layout and may differ slightly in your version.

## Claude Code

```bash
claude mcp add --transport http papertrade-explorer https://papertrade-explorer.pages.dev/mcp
```

Add `--scope project` to write a shared `.mcp.json`, or `--scope user` for every project. The file form:

```json
{
  "mcpServers": {
    "papertrade-explorer": {
      "type": "http",
      "url": "https://papertrade-explorer.pages.dev/mcp"
    }
  }
}
```

## Claude Desktop and claude.ai

Add a custom connector: Settings, Connectors, Add custom connector, then enter the URL `https://papertrade-explorer.pages.dev/mcp`. No authentication is needed.

For Claude Desktop versions that only read the config file, bridge with `mcp-remote` in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "papertrade-explorer": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://papertrade-explorer.pages.dev/mcp"]
    }
  }
}
```

## Claude API (MCP connector)

```python
import anthropic

client = anthropic.Anthropic()
response = client.beta.messages.create(
    model="claude-sonnet-4-5",
    max_tokens=1024,
    messages=[{"role": "user", "content": "Who leads the Papertrade 24h leaderboard?"}],
    mcp_servers=[{
        "type": "url",
        "url": "https://papertrade-explorer.pages.dev/mcp",
        "name": "papertrade-explorer",
    }],
    tools=[{"type": "mcp_toolset", "mcp_server_name": "papertrade-explorer"}],
    betas=["mcp-client-2025-11-20"],
)
print(response.content)
```

Use any current model id. Every server in `mcp_servers` must be referenced by exactly one `mcp_toolset`. Check the Anthropic docs for a newer beta header if this one is retired.

## OpenAI Codex CLI

```bash
codex mcp add papertrade-explorer --url https://papertrade-explorer.pages.dev/mcp
```

Or edit `~/.codex/config.toml`:

```toml
[mcp_servers.papertrade-explorer]
url = "https://papertrade-explorer.pages.dev/mcp"
```

## OpenAI Responses API

```bash
curl https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "tools": [{
      "type": "mcp",
      "server_label": "papertrade_explorer",
      "server_url": "https://papertrade-explorer.pages.dev/mcp",
      "require_approval": "never",
      "allowed_tools": ["get_wallet", "get_positions", "get_leaderboard", "get_protocol_overview"]
    }],
    "input": "Show the top wallet on the 24h Papertrade leaderboard."
  }'
```

Every tool is read-only, so `require_approval: "never"` is safe here. Drop `allowed_tools` to expose all nine.

## ChatGPT

Enable developer mode: Settings, Connectors, Advanced settings, Developer mode. Then create a connector with the name `Papertrade Explorer` and the MCP server URL `https://papertrade-explorer.pages.dev/mcp`, with no authentication. Availability depends on your plan.

## Gemini CLI

```bash
gemini mcp add --transport http papertrade-explorer https://papertrade-explorer.pages.dev/mcp
```

Or in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "papertrade-explorer": {
      "httpUrl": "https://papertrade-explorer.pages.dev/mcp"
    }
  }
}
```

## Cursor

`.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` globally:

```json
{
  "mcpServers": {
    "papertrade-explorer": {
      "url": "https://papertrade-explorer.pages.dev/mcp"
    }
  }
}
```

## VS Code

`.vscode/mcp.json`:

```json
{
  "servers": {
    "papertrade-explorer": {
      "type": "http",
      "url": "https://papertrade-explorer.pages.dev/mcp"
    }
  }
}
```

## Windsurf

In `~/.codeium/windsurf/mcp_config.json` (open it from the Cascade MCP panel if your install keeps it elsewhere):

```json
{
  "mcpServers": {
    "papertrade-explorer": {
      "serverUrl": "https://papertrade-explorer.pages.dev/mcp"
    }
  }
}
```

## Zed

In Zed `settings.json`:

```json
{
  "context_servers": {
    "papertrade-explorer": {
      "url": "https://papertrade-explorer.pages.dev/mcp"
    }
  }
}
```

## Cline

In `cline_mcp_settings.json`. Set the type explicitly, because Cline defaults to the older SSE transport:

```json
{
  "mcpServers": {
    "papertrade-explorer": {
      "type": "streamableHttp",
      "url": "https://papertrade-explorer.pages.dev/mcp"
    }
  }
}
```

## Goose

Interactive: run `goose configure`, choose Add Extension, then Remote Extension (Streamable HTTP), and enter the URL. One-off session:

```bash
goose session --with-streamable-http-extension "https://papertrade-explorer.pages.dev/mcp"
```

## Continue

`.continue/mcpServers/papertrade-explorer.yaml`:

```yaml
name: Papertrade Explorer
version: 0.0.1
schema: v1
mcpServers:
  - name: papertrade-explorer
    type: streamable-http
    url: https://papertrade-explorer.pages.dev/mcp
```

## Any framework with OpenAPI or function calling

Import `https://papertrade-explorer.pages.dev/openapi.json`. Each tool is an operation on `POST /api/tools/{name}` with its argument schema, so LangChain, LlamaIndex, the OpenAI tools format and custom agents can call it directly with a plain HTTP request. No MCP client is required.

## Check that it works

Ask: "Use the Papertrade explorer to show the protocol overview." The assistant should call `get_protocol_overview` and report live values. If it cannot see the tools, confirm the URL ends in `/mcp` and that your client supports Streamable HTTP.
