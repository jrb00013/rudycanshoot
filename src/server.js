import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, basename, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { takeScreenshot, defaultOutputDir } from "./screenshot.js";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

const server = new McpServer({
  name: "rudycanshoot",
  version: "1.1.0",
});

server.tool(
  "take_screenshot",
  "Capture a screenshot of the screen, active window, or a region. Returns the file path of the saved image.",
  {
    mode: z
      .enum(["fullscreen", "window", "area"])
      .default("fullscreen")
      .describe("What to capture"),
    area: z
      .string()
      .optional()
      .describe("Region as 'x,y,width,height' — only used when mode=area"),
    filename: z
      .string()
      .optional()
      .describe("Output filename (default: screenshot-<timestamp>.png)"),
    outputDir: z
      .string()
      .optional()
      .describe("Directory to save into (default: ~/.rudycanshoot/captures/)"),
  },
  async ({ mode, area, filename, outputDir }) => {
    const path = await takeScreenshot({
      window: mode === "window",
      area: mode === "area" ? area : undefined,
      filename,
      outputDir,
    });
    return {
      content: [
        {
          type: "text",
          text: `Screenshot saved: ${path}`,
        },
        {
          type: "resource",
          resource: {
            uri: `file://${path}`,
            mimeType: "image/png",
            name: basename(path),
          },
        },
      ],
    };
  }
);

server.tool(
  "capture_url",
  "Headlessly render a web page (no visible browser) and screenshot it. Supports auth via cookies, a custom viewport, full-page capture, and waiting for dynamic content (e.g. maps) to settle. Returns the saved file path.",
  {
    url: z.string().describe("The page URL to capture"),
    width: z.number().int().min(1).default(1600).describe("Viewport width in px"),
    height: z.number().int().min(1).default(1000).describe("Viewport height in px"),
    fullPage: z.boolean().default(false).describe("Capture the full scrollable page"),
    waitMs: z.number().int().min(0).default(4000).describe("Settle delay after load (ms) for dynamic content"),
    waitSelector: z.string().optional().describe("Also wait until this CSS selector exists"),
    cookies: z.record(z.string()).optional().describe("Auth cookies as {name: value} (sent as a Cookie header)"),
    headers: z.record(z.string()).optional().describe("Extra HTTP headers as {name: value}"),
    filename: z.string().optional().describe("Output filename"),
    outputDir: z.string().optional().describe("Directory to save into"),
  },
  async ({ url, width, height, fullPage, waitMs, waitSelector, cookies, headers, filename, outputDir }) => {
    const { captureUrl } = await import("./url_capture.js");
    const path = await captureUrl({
      url, width, height, fullPage, waitMs, waitSelector,
      cookies: cookies && Object.keys(cookies).length ? cookies : null,
      headers: headers && Object.keys(headers).length ? headers : null,
      filename, outputDir,
    });
    return {
      content: [
        { type: "text", text: `URL screenshot saved: ${path}` },
        { type: "resource", resource: { uri: `file://${path}`, mimeType: "image/png", name: basename(path) } },
      ],
    };
  }
);

server.tool(
  "read_screenshot",
  "Read a previously captured screenshot as base64 so the AI can view it.",
  {
    path: z.string().describe("Absolute path to the screenshot file"),
  },
  async ({ path }) => {
    const data = await readFile(path);
    const ext = extname(path).slice(1).toLowerCase();
    const mimeType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
    return {
      content: [
        {
          type: "image",
          data: data.toString("base64"),
          mimeType,
        },
      ],
    };
  }
);

server.tool(
  "list_screenshots",
  "List recent screenshots captured by this tool.",
  {
    limit: z.number().int().min(1).max(100).default(20).describe("Max number of results"),
  },
  async ({ limit }) => {
    const dir = defaultOutputDir();
    let files;
    try {
      files = await readdir(dir);
    } catch {
      return { content: [{ type: "text", text: "No screenshots yet." }] };
    }

    const imageFiles = files.filter((f) =>
      [".png", ".jpg", ".jpeg", ".xwd"].includes(extname(f).toLowerCase())
    );

    const withStats = await Promise.all(
      imageFiles.map(async (f) => {
        const fullPath = join(dir, f);
        const s = await stat(fullPath);
        return { name: f, path: fullPath, mtime: s.mtimeMs, size: s.size };
      })
    );

    withStats.sort((a, b) => b.mtime - a.mtime);
    const recent = withStats.slice(0, limit);

    if (recent.length === 0) {
      return { content: [{ type: "text", text: "No screenshots found." }] };
    }

    const lines = recent.map(
      (f) =>
        `${new Date(f.mtime).toISOString().slice(0, 19)}  ${(f.size / 1024).toFixed(1)}K  ${f.path}`
    );

    return {
      content: [
        {
          type: "text",
          text: `Recent screenshots (${recent.length}):\n\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

server.tool(
  "capture_command",
  "Run a shell command and render its output as a styled terminal screenshot PNG. Works without a display — uses Python/Pillow to render text on a dark terminal background. Returns the file path.",
  {
    command: z.string().describe("Shell command to run (passed to sh -c)"),
    title: z.string().optional().describe("Title bar label (default: the command itself)"),
    outputDir: z.string().optional().describe("Directory to save into"),
    filename: z.string().optional().describe("Output filename (default: terminal-<timestamp>.png)"),
    timeout: z.number().int().min(1).max(120).default(30).describe("Command timeout in seconds"),
    fontSize: z.number().int().min(8).max(24).default(13).describe("Font size for rendering"),
  },
  async ({ command, title, outputDir, filename, timeout, fontSize }) => {
    const dir = outputDir || defaultOutputDir();
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = filename || `terminal-${ts}.png`;
    const outPath = join(dir, name);

    const renderScript = join(__dirname, "terminal_render.py");
    const args = [
      renderScript,
      "--cmd", command,
      "--output", outPath,
      "--timeout", String(timeout),
      "--font-size", String(fontSize),
    ];
    if (title) args.push("--title", title);

    try {
      await execFileAsync("python3", args, { timeout: (timeout + 10) * 1000 });
    } catch (err) {
      return {
        content: [{ type: "text", text: `Failed to render terminal screenshot: ${err.message}` }],
      };
    }

    return {
      content: [
        { type: "text", text: `Terminal screenshot saved: ${outPath}` },
        {
          type: "resource",
          resource: {
            uri: `file://${outPath}`,
            mimeType: "image/png",
            name: basename(outPath),
          },
        },
      ],
    };
  }
);


// annotate_screenshot tool
server.tool(
  "annotate_screenshot",
  "Add a text label to an existing screenshot. Returns the annotated image path.",
  {
    path: z.string().describe("Input image path"),
    text: z.string().describe("Text to add"),
    outputPath: z.string().optional().describe("Where to write annotated image (default: replaces input)"),
    position: z.enum(["top", "bottom", "center"]).default("bottom"),
    color: z.string().default("#00ff88").describe("Text color as hex, e.g. #ff0000"),
    fontSize: z.number().int().min(8).max(72).default(18),
  },
  async ({ path: inputPath, text, outputPath, position, color, fontSize }) => {
    const { annotateImage } = await import("./annotate.js");
    const out = outputPath || inputPath.replace(/\.png$/, "_annotated.png");
    await annotateImage(inputPath, out, { text, position, color, fontSize });
    return { content: [{ type: "text", text: `Annotated: ${out}` }] };
  }
);

// diff_screenshots tool
server.tool(
  "diff_screenshots",
  "Compare two screenshots and render a difference image.",
  {
    before: z.string().describe("Path to 'before' image"),
    after: z.string().describe("Path to 'after' image"),
    outputPath: z.string().describe("Where to save the diff image"),
    mode: z.enum(["highlight", "heatmap", "side-by-side"]).default("highlight"),
  },
  async ({ before, after, outputPath, mode }) => {
    const { diffScreenshots } = await import("./diff.js");
    await diffScreenshots(before, after, outputPath, mode);
    return { content: [{ type: "text", text: `Diff saved: ${outputPath}` }] };
  }
);

// compare_screenshots tool
server.tool(
  "compare_screenshots",
  "Get pixel-level similarity metrics between two screenshots.",
  {
    before: z.string().describe("Path to first image"),
    after: z.string().describe("Path to second image"),
  },
  async ({ before, after }) => {
    const { compareScreenshots } = await import("./compare.js");
    const result = await compareScreenshots(before, after);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// record_video — temporary screen recording + optional frame transfer for AI viewing
server.tool(
  "record_video",
  "Record a temporary screen video for visual monitoring. By default returns evenly spaced frames as images so the AI can watch/understand what happened, plus the saved video path.",
  {
    durationSec: z
      .number()
      .min(0.5)
      .max(120)
      .default(5)
      .describe("How long to record (seconds)"),
    fps: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(4)
      .describe("Capture frame rate (frame-sampling backend)"),
    area: z
      .string()
      .optional()
      .describe("Optional region as 'x,y,width,height'"),
    temporary: z
      .boolean()
      .default(true)
      .describe("Store under ~/.rudycanshoot/videos/tmp/ for easy cleanup"),
    returnFrames: z
      .boolean()
      .default(true)
      .describe("Include extracted frames as images the AI can view"),
    maxFrames: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(12)
      .describe("Max frames returned to the AI when returnFrames=true"),
    filename: z.string().optional().describe("Output filename"),
    outputDir: z.string().optional().describe("Override output directory"),
  },
  async ({ durationSec, fps, area, temporary, returnFrames, maxFrames, filename, outputDir }) => {
    const { recordVideo, readVideoFrames, cleanupFrameDir } = await import("./video.js");
    const result = await recordVideo({
      durationSec,
      fps,
      area,
      temporary,
      filename,
      outputDir,
    });

    const content = [
      {
        type: "text",
        text: [
          `Video saved: ${result.path}`,
          `backend=${result.backend} duration=${result.durationSec}s fps=${result.fps} temporary=${result.temporary}`,
          result.encodeWarning ? `note: ${result.encodeWarning}` : null,
          returnFrames
            ? `Returning up to ${maxFrames} frames so you can visually review the recording.`
            : "Frames not returned (returnFrames=false). Use read_video to inspect.",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        type: "resource",
        resource: {
          uri: `file://${result.path}`,
          mimeType: result.path.endsWith(".gif") ? "image/gif" : "video/mp4",
          name: basename(result.path),
        },
      },
    ];

    if (returnFrames) {
      const viewed = await readVideoFrames(result.path, { maxFrames });
      content[0].text += `\nframes=${viewed.frames.length}`;
      for (let i = 0; i < viewed.frames.length; i++) {
        const fr = viewed.frames[i];
        content.push({
          type: "text",
          text: `Frame ${i + 1}/${viewed.frames.length} (${basename(fr.path)})`,
        });
        content.push({
          type: "image",
          data: fr.base64,
          mimeType: fr.mimeType,
        });
      }
      await cleanupFrameDir(viewed.outputDir);
    }

    return { content };
  }
);

server.tool(
  "read_video",
  "Extract frames from a saved video/GIF and return them as images so the AI can watch and understand the recording.",
  {
    path: z.string().describe("Absolute path to the video or GIF"),
    maxFrames: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(12)
      .describe("Max evenly spaced frames to return"),
  },
  async ({ path: videoPath, maxFrames }) => {
    const { readVideoFrames, cleanupFrameDir } = await import("./video.js");
    const viewed = await readVideoFrames(videoPath, { maxFrames });
    const content = [
      {
        type: "text",
        text: `Video ${videoPath}\nduration≈${viewed.durationSec ?? "?"}s\nframes returned: ${viewed.frames.length}`,
      },
    ];
    for (let i = 0; i < viewed.frames.length; i++) {
      const fr = viewed.frames[i];
      content.push({
        type: "text",
        text: `Frame ${i + 1}/${viewed.frames.length}`,
      });
      content.push({
        type: "image",
        data: fr.base64,
        mimeType: fr.mimeType,
      });
    }
    await cleanupFrameDir(viewed.outputDir);
    return { content };
  }
);

server.tool(
  "list_videos",
  "List recent screen recordings (including temporary ones).",
  {
    limit: z.number().int().min(1).max(100).default(20),
  },
  async ({ limit }) => {
    const { listVideos } = await import("./video.js");
    const videos = await listVideos({ limit });
    if (videos.length === 0) {
      return { content: [{ type: "text", text: "No videos yet." }] };
    }
    const lines = videos.map(
      (v) =>
        `${new Date(v.mtime).toISOString().slice(0, 19)}  ${(v.size / 1024).toFixed(1)}K  ${v.temporary ? "tmp" : "keep"}  ${v.path}`
    );
    return {
      content: [{ type: "text", text: `Recent videos (${videos.length}):\n\n${lines.join("\n")}` }],
    };
  }
);

server.tool(
  "cleanup_videos",
  "Delete temporary screen recordings (default) or all recordings.",
  {
    all: z.boolean().default(false).describe("If true, delete all videos not just tmp/"),
    olderThanMinutes: z
      .number()
      .min(0)
      .default(0)
      .describe("Only delete files older than this many minutes (0 = all matching)"),
  },
  async ({ all, olderThanMinutes }) => {
    const { cleanupVideos } = await import("./video.js");
    const result = await cleanupVideos({
      all,
      olderThanMs: olderThanMinutes > 0 ? olderThanMinutes * 60_000 : 0,
    });
    return {
      content: [{ type: "text", text: `Removed ${result.removed} video file(s).` }],
    };
  }
);

export async function startServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("rudycanshoot MCP server started\n");
}
