# Headless Terminal Capture

rudycanshoot can render terminal output as styled PNG images without any display server.
This is useful when running in CI, SSH sessions, or AI tool contexts where there's no X11/Wayland display.

## How it works

`capture_command` runs a shell command via `subprocess`, captures stdout+stderr, then uses
Python/Pillow to render the text onto a dark terminal-styled canvas with:

- macOS-style traffic light dots in the title bar
- Monospace font (DejaVu Sans Mono or fallback)
- Configurable themes (dark, light, monokai, dracula, solarized)
- ANSI color code parsing — colored terminal output renders correctly

## CLI usage

```bash
# Render output of any command
rudycanshoot capture-command "v4l2-ctl --list-devices"

# With custom title and theme
rudycanshoot capture-command "git log --oneline -20" \
  --title "Recent commits" \
  --theme monokai \
  --output commits.png

# From stdin
cat output.log | rudycanshoot capture-command --stdin --title "build log"
```

## MCP tool usage

```json
{
  "tool": "capture_command",
  "arguments": {
    "command": "python3 boson_ffc_test.py",
    "title": "Boson FFC test — CCI attempt",
    "fontSize": 13,
    "timeout": 60
  }
}
```

## Supported ANSI colors

Standard 8-color (30-37, 90-97) foreground codes are rendered. Background codes and
256-color/truecolor codes are stripped and replaced with the theme's default text color.

## Font requirements

On Linux, DejaVu Sans Mono is preferred (`sudo apt install fonts-dejavu`).
Falls back to Liberation Mono, Ubuntu Mono, FreeMono, and finally PIL's built-in bitmap font.

## Adding new themes

Add an entry to `src/themes.js`. Theme colors are RGB tuples, e.g.:

```js
export const THEMES = {
  myTheme: {
    bg: [20, 20, 35],
    bar: [35, 35, 55],
    text: [230, 230, 255],
    // ... etc
  }
};
```
