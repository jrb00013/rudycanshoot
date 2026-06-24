# Changelog

## [Unreleased]

## [1.1.0] - 2026-06-24

### Added
- Renamed to **rudycanshoot** — package name, CLI binary, and all docs updated
- capture_command MCP tool — headless terminal-to-PNG rendering
- annotate, diff, compare, highlight, redact, watermark, border, crop, resize, stitch, makeGrid, makeGif
- Pipeline class — chainable image processing API
- OCR via Tesseract, clipboard copy, Imgur upload
- Watch mode (ScreenshotWatcher) — periodic capture with EventEmitter
- Theme system — dark/light/monokai/dracula/solarized
- Capture history with tagging and filtering
- Persistent config at ~/.rudycanshoot/config.json
- generateReport — Markdown summary of capture history
- compareScreenshots — pixel-level similarity metrics
- CI workflow (GitHub Actions) with Node 18/20/22 matrix
- Test suite using node:test (no extra framework)
- Docs: API reference, recipes, AI tool setup, headless capture guide
- CONTRIBUTING.md, SECURITY.md, LICENSE
- .continue/config.json, .vscode/extensions.json


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
