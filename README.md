# screenshot-mcp

An MCP server + CLI that lets AI assistants take and view screenshots. Works with Claude Code, Cursor, Windsurf, Codex CLI, Gemini CLI, OpenCode, Continue, Cline, Aider, and GitHub Copilot.

## Install

```bash
npm install -g screenshot-mcp
```

Or run without installing:

```bash
npx screenshot-mcp serve
```

## Quick Start

### 1. Auto-configure your AI tools

```bash
# All tools at once
screenshot-mcp install --all

# Or a specific tool
screenshot-mcp install --tool claude-code
screenshot-mcp install --tool cursor
screenshot-mcp install --tool windsurf
screenshot-mcp install --tool codex
screenshot-mcp install --tool gemini
screenshot-mcp install --tool opencode
screenshot-mcp install --tool continue
screenshot-mcp install --tool cline
```

### 2. Restart your AI tool

The MCP server will now appear in your AI assistant's tool list.

### 3. Use it

Ask your AI: *"Take a screenshot and show me what's on screen."*

---

## MCP Tools

| Tool | Description |
|------|-------------|
| `take_screenshot` | Capture fullscreen, active window, or a region |
| `read_screenshot` | Read a saved image so the AI can view it |
| `list_screenshots` | List recent captures |

### take_screenshot parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `mode` | `fullscreen\|window\|area` | `fullscreen` | What to capture |
| `area` | string | — | `x,y,width,height` — required when mode=area |
| `filename` | string | auto | Output filename |
| `outputDir` | string | `~/.screenshot-mcp/captures/` | Where to save |

---

## CLI

```bash
# Take a screenshot
screenshot-mcp capture
screenshot-mcp capture --mode window
screenshot-mcp capture --mode area --area 0,0,1920,1080
screenshot-mcp capture --output /tmp/snap.png

# List recent screenshots
screenshot-mcp list

# Start MCP server (used by AI tools — usually run automatically)
screenshot-mcp serve

# Configure AI tools
screenshot-mcp install --all
```

---

## Supported AI Tools

| Tool | Config location | What's installed |
|------|----------------|-----------------|
| **Claude Code** | `~/.claude/settings.json` | MCP server entry + `/screenshot` command |
| **Cursor** | `~/.cursor/mcp.json` | MCP server entry |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | MCP server entry |
| **Codex CLI** | `~/AGENTS.md` | Tool documentation |
| **Gemini CLI** | `~/.gemini/settings.json` | MCP server entry |
| **OpenCode** | `~/.config/opencode/opencode.json` | MCP server + agent |
| **Continue** | `~/.continue/config.json` | MCP server entry |
| **Cline** | `~/.clinerules/` | Rules file |
| **Aider** | `~/.aider.conf.yml` | Comment reference |
| **GitHub Copilot** | `~/.github/copilot-instructions.md` | Instructions |

---

## Screenshot Backends

### Linux

Installed automatically when available, in priority order:

| Tool | Display | Install |
|------|---------|---------|
| `grim` | Wayland | `sudo apt install grim` |
| `scrot` | X11 | `sudo apt install scrot` |
| `maim` | X11 | `sudo apt install maim` |
| `import` | X11 | `sudo apt install imagemagick` |
| `xwd` | X11 | `sudo apt install x11-apps` |

### macOS

Uses the built-in `screencapture` command — no extra install needed.

### Windows

Uses PowerShell + `System.Windows.Forms` — no extra install needed.

---

## Project Config Files (for contributors)

When you clone this repo, your AI tool will auto-discover:

| File | Tool |
|------|------|
| `CLAUDE.md` | Claude Code |
| `AGENTS.md` | Codex CLI, OpenCode |
| `GEMINI.md` | Gemini CLI |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.cursor/mcp.json` | Cursor |
| `.mcp.json` | Claude Code (project-level) |
| `.windsurfrules` | Windsurf |
| `.clinerules/` | Cline |
| `.claude/commands/screenshot.md` | Claude Code `/screenshot` command |
| `.opencode/agents/screenshot.md` | OpenCode agent |

---

## License

MIT
