# Changelog

## [Unreleased]

### Added
- `capture_command` MCP tool — render shell command output as terminal PNG, no display required
- `annotate_screenshot` MCP tool — add text labels to captured images
- `diff_screenshots` MCP tool — compare before/after screenshots (highlight, heatmap, side-by-side modes)
- `ocr_screenshot` MCP tool — extract text from images via Tesseract
- Theme system: dark, light, monokai, dracula, solarized
- Watch mode: `ScreenshotWatcher` class for periodic capture
- Clipboard support: `copyImageToClipboard` for Linux (xclip/wl-copy), macOS, Windows
- Image grid: `makeGrid` for compositing multiple screenshots into one
- Crop and resize utilities
- Image metadata extraction
- Capture history with tagging
- Config system (`~/.rudycanshoot/config.json`)
- GitHub Actions CI workflow
- Full test suite using `node:test`
- Docs: MCP tools reference, AI tool setup guide, headless terminal capture guide

## [1.0.0] - 2026-06-24

### Added
- Initial release
- MCP server with `take_screenshot`, `read_screenshot`, `list_screenshots` tools
- CLI: `capture`, `serve`, `install`, `list` commands
- Auto-installer for Claude Code, Cursor, Windsurf, Codex, Gemini, OpenCode, Continue, Cline, Aider, GitHub Copilot
- Linux screenshot backends: grim, scrot, maim, ImageMagick import, xwd
- macOS: `screencapture`
- Windows: PowerShell + System.Windows.Forms
- AI tool config files: CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/mcp.json, .mcp.json, .windsurfrules, .clinerules/, .claude/commands/, .opencode/agents/
