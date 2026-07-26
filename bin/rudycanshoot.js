#!/usr/bin/env node
import { program } from "commander";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { basename, join, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, "../package.json"));

// commander option accumulator for repeatable flags (--cookie, --header)
const collect = (val, acc) => { acc.push(val); return acc; };

program
  .name("rudycanshoot")
  .description(pkg.description)
  .version(pkg.version);

program
  .command("serve")
  .description("Start the MCP server (stdio transport — used by AI tools)")
  .action(async () => {
    const { startServer } = await import("../src/server.js");
    await startServer();
  });

program
  .command("capture")
  .description("Take a screenshot from the command line")
  .option("-m, --mode <mode>", "fullscreen | window | area", "fullscreen")
  .option("-a, --area <x,y,w,h>", "Region to capture (requires --mode area)")
  .option("-o, --output <path>", "Output file path")
  .option("-d, --dir <dir>", "Output directory")
  .action(async (opts) => {
    const { takeScreenshot } = await import("../src/screenshot.js");
    const path = await takeScreenshot({
      window: opts.mode === "window",
      area: opts.mode === "area" ? opts.area : undefined,
      filename: opts.output ? require("path").basename(opts.output) : undefined,
      outputDir: opts.dir || (opts.output ? require("path").dirname(opts.output) : undefined),
    });
    console.log(path);
  });

program
  .command("install")
  .description("Auto-configure AI tools to use this MCP server")
  .option("--all", "Install for all supported tools")
  .option(
    "--tool <tool>",
    "Install for a specific tool (claude-code, cursor, windsurf, codex, gemini, opencode, continue, cline, aider, github-copilot)"
  )
  .action(async (opts) => {
    const { install, AVAILABLE_TOOLS } = await import("../src/install.js");
    if (!opts.all && !opts.tool) {
      console.log("Supported tools:", AVAILABLE_TOOLS.join(", "));
      console.log("Use --all to install for all, or --tool <name> for one.");
      process.exit(1);
    }
    await install(opts.all ? "all" : opts.tool);
  });

program
  .command("list")
  .description("List recent screenshots")
  .option("-n, --limit <n>", "Max results", "20")
  .action(async (opts) => {
    const { readdir, stat } = await import("node:fs/promises");
    const { extname } = await import("node:path");
    const { join } = await import("node:path");
    const { defaultOutputDir } = await import("../src/screenshot.js");
    const dir = defaultOutputDir();
    const files = await readdir(dir).catch(() => []);
    const imgs = files.filter((f) =>
      [".png", ".jpg", ".jpeg", ".xwd"].includes(extname(f).toLowerCase())
    );
    const withStats = await Promise.all(
      imgs.map(async (f) => {
        const fp = join(dir, f);
        const s = await stat(fp);
        return { path: fp, mtime: s.mtimeMs, size: s.size };
      })
    );
    withStats.sort((a, b) => b.mtime - a.mtime);
    withStats.slice(0, Number(opts.limit)).forEach((f) => {
      console.log(`${new Date(f.mtime).toISOString().slice(0, 19)}  ${(f.size / 1024).toFixed(1)}K  ${f.path}`);
    });
  });


program
  .command("watch")
  .description("Periodically capture screenshots")
  .option("-i, --interval <ms>", "Interval in milliseconds", "5000")
  .option("-n, --count <n>", "Max captures (0 = unlimited)", "0")
  .option("-m, --mode <mode>", "fullscreen | window | area", "fullscreen")
  .option("-d, --dir <dir>", "Output directory")
  .option("--gif <path>", "Compile all frames into a GIF when done")
  .action(async (opts) => {
    const { ScreenshotWatcher } = await import("../src/watch.js");
    const { makeGif } = await import("../src/gif.js");
    const limit = Number(opts.count) || Infinity;
    const frames = [];
    const watcher = new ScreenshotWatcher({
      intervalMs: Number(opts.interval),
      mode: opts.mode,
      outputDir: opts.dir,
      limit,
    })
      .on("capture", ({ path, count }) => {
        console.log(`[${count}] ${path}`);
        frames.push(path);
      })
      .on("stopped", async ({ count }) => {
        console.log(`Stopped after ${count} captures.`);
        if (opts.gif && frames.length > 0) {
          const gifPath = await makeGif(frames, opts.gif);
          console.log("GIF:", gifPath);
        }
      })
      .start();
    process.on("SIGINT", () => watcher.stop());
  });

program
  .command("url <url>")
  .description("Headlessly render a web page and screenshot it (no visible browser)")
  .option("-o, --output <path>", "Output file path")
  .option("-d, --dir <dir>", "Output directory")
  .option("--width <px>", "Viewport width", "1600")
  .option("--height <px>", "Viewport height", "1000")
  .option("--full-page", "Capture the full scrollable page")
  .option("--wait <ms>", "Settle delay after load (for maps/canvas)", "4000")
  .option("--wait-selector <css>", "Also wait until this CSS selector exists")
  .option("--cookie <name=value>", "Auth cookie, repeatable", collect, [])
  .option("--header <k:v>", "Extra HTTP header, repeatable", collect, [])
  .action(async (url, opts) => {
    const { captureUrl } = await import("../src/url_capture.js");
    const cookies = {};
    for (const c of opts.cookie) {
      const i = c.indexOf("=");
      if (i > 0) cookies[c.slice(0, i)] = c.slice(i + 1);
    }
    const headers = {};
    for (const h of opts.header) {
      const i = h.indexOf(":");
      if (i > 0) headers[h.slice(0, i).trim()] = h.slice(i + 1).trim();
    }
    const path = await captureUrl({
      url,
      width: Number(opts.width),
      height: Number(opts.height),
      fullPage: !!opts.fullPage,
      waitMs: Number(opts.wait),
      waitSelector: opts.waitSelector,
      cookies: Object.keys(cookies).length ? cookies : null,
      headers: Object.keys(headers).length ? headers : null,
      filename: opts.output ? basename(opts.output) : undefined,
      outputDir: opts.dir || (opts.output ? dirname(opts.output) : undefined),
    });
    console.log(path);
  });

program
  .command("record")
  .description("Record a temporary screen video for AI visual monitoring")
  .option("-t, --duration <sec>", "Duration in seconds", "5")
  .option("-f, --fps <n>", "Frames per second", "4")
  .option("-a, --area <x,y,w,h>", "Region to capture")
  .option("-o, --output <path>", "Output file path")
  .option("-d, --dir <dir>", "Output directory")
  .option("--keep", "Store in videos/ instead of videos/tmp/")
  .option("--frames <n>", "Also extract N frames to a sibling frames/ dir", "0")
  .action(async (opts) => {
    const { recordVideo, extractFrames } = await import("../src/video.js");
    const pathMod = await import("node:path");
    const result = await recordVideo({
      durationSec: Number(opts.duration),
      fps: Number(opts.fps),
      area: opts.area,
      temporary: !opts.keep,
      filename: opts.output ? pathMod.basename(opts.output) : undefined,
      outputDir: opts.dir || (opts.output ? pathMod.dirname(opts.output) : undefined),
    });
    console.log(result.path);
    console.error(`backend=${result.backend} duration=${result.durationSec}s fps=${result.fps}`);
    const n = Number(opts.frames);
    if (n > 0) {
      const { framePaths } = await extractFrames(result.path, { maxFrames: n });
      framePaths.forEach((p) => console.log(p));
    }
  });

program
  .command("videos")
  .description("List recent screen recordings")
  .option("-n, --limit <n>", "Max results", "20")
  .action(async (opts) => {
    const { listVideos } = await import("../src/video.js");
    const videos = await listVideos({ limit: Number(opts.limit) });
    videos.forEach((v) => {
      console.log(
        `${new Date(v.mtime).toISOString().slice(0, 19)}  ${(v.size / 1024).toFixed(1)}K  ${v.temporary ? "tmp" : "keep"}  ${v.path}`
      );
    });
  });

program
  .command("cleanup-videos")
  .description("Delete temporary (or all) screen recordings")
  .option("--all", "Delete all videos, not just tmp/")
  .option("--older-than <minutes>", "Only delete older than N minutes", "0")
  .action(async (opts) => {
    const { cleanupVideos } = await import("../src/video.js");
    const result = await cleanupVideos({
      all: !!opts.all,
      olderThanMs: Number(opts.olderThan) > 0 ? Number(opts.olderThan) * 60_000 : 0,
    });
    console.log(`Removed ${result.removed} video file(s).`);
  });

program.parse();
