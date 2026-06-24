# AI Tool Setup Guide

How each AI coding tool picks up rudycanshoot as an MCP server.

---

## Claude Code

**Global config:** `~/.claude/settings.json`
```json
{
  "mcpServers": {
    "rudycanshoot": {
      "command": "rudycanshoot",
      "args": ["serve"]
    }
  }
}
```

**Project-level:** `.mcp.json` in your repo root (already included in this repo)

**Slash command:** `.claude/commands/screenshot.md` — use `/screenshot` in chat

**Instructions file:** `CLAUDE.md` — Claude reads this automatically in any project

---

## Cursor

**Global config:** `~/.cursor/mcp.json`

**Project config:** `.cursor/mcp.json` (already included — auto-loaded when you open this folder)

Restart Cursor after adding. Tools appear under "MCP Tools" in the chat sidebar.

---

## Windsurf

**Config:** `~/.codeium/windsurf/mcp_config.json`

Windsurf only supports global MCP config (no project-level). The `install --tool windsurf` command writes this for you.

Max 100 MCP tools total; 20 tool-calls per turn limit.

---

## Codex CLI (OpenAI)

Codex reads `AGENTS.md` in the current directory or any parent. The `AGENTS.md` in this repo documents the available tools.

For global config: add to `~/AGENTS.md`.

---

## Gemini CLI

**Config:** `~/.gemini/settings.json`
```json
{
  "mcpServers": {
    "rudycanshoot": {
      "command": "rudycanshoot",
      "args": ["serve"]
    }
  }
}
```

Also reads `GEMINI.md` from the current directory (included in this repo).

---

## OpenCode

**Config:** `~/.config/opencode/opencode.json`
```json
{
  "mcp": {
    "servers": {
      "rudycanshoot": { "command": "rudycanshoot", "args": ["serve"] }
    }
  }
}
```

**Agent file:** `.opencode/agents/screenshot.md` (included in this repo)

---

## Continue.dev

**Config:** `~/.continue/config.json` — add to `mcpServers` array:
```json
{
  "name": "rudycanshoot",
  "command": "rudycanshoot",
  "args": ["serve"]
}
```

---

## Cline (VS Code)

Add to VS Code `settings.json`:
```json
{
  "cline.mcpServers": {
    "rudycanshoot": {
      "command": "rudycanshoot",
      "args": ["serve"]
    }
  }
}
```

Rules file `.clinerules/rudycanshoot.md` is included and auto-loaded.

---

## GitHub Copilot

Copilot does not support MCP natively. The `.github/copilot-instructions.md` file (included) tells Copilot about the tool conventions when working in this repo.

---

## Aider

Aider does not support MCP. Use rudycanshoot from your editor instead, and reference screenshots by path in your aider chat.
