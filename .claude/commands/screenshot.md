# screenshot

Take a screenshot and show it to Claude.

## Usage

```
/screenshot               — fullscreen
/screenshot window        — active window
/screenshot area x,y,w,h — specific region
```

## Steps

1. Call `mcp__screenshot-mcp__take_screenshot` with the appropriate mode
2. Call `mcp__screenshot-mcp__read_screenshot` with the returned path to load the image
3. Analyze and describe what is visible in the screenshot
