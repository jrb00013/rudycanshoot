# rudycanshoot

An MCP server + CLI that lets AI assistants take and view screenshots. Works with Claude Code, Cursor, Windsurf, Codex CLI, Gemini CLI, OpenCode, Continue, Cline, Aider, and GitHub Copilot.

## Install

```bash
npm install -g rudycanshoot
```

Or run without installing:

```bash
npx rudycanshoot serve
```

## Quick Start

### 1. Auto-configure your AI tools

```bash
# All tools at once
rudycanshoot install --all

# Or a specific tool
rudycanshoot install --tool claude-code
rudycanshoot install --tool cursor
rudycanshoot install --tool windsurf
rudycanshoot install --tool codex
rudycanshoot install --tool gemini
rudycanshoot install --tool opencode
rudycanshoot install --tool continue
rudycanshoot install --tool cline
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
| `outputDir` | string | `~/.rudycanshoot/captures/` | Where to save |

---

## CLI

```bash
# Take a screenshot
rudycanshoot capture
rudycanshoot capture --mode window
rudycanshoot capture --mode area --area 0,0,1920,1080
rudycanshoot capture --output /tmp/snap.png

# List recent screenshots
rudycanshoot list

# Start MCP server (used by AI tools — usually run automatically)
rudycanshoot serve

# Configure AI tools
rudycanshoot install --all
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
