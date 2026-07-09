// Headless URL renderer: screenshots a web page with NO visible browser/UI, driving
// system Google Chrome / Chromium over the DevTools Protocol. Zero npm dependencies —
// uses Node's built-in fetch + WebSocket (Node >= 21). Supports auth via cookies/headers,
// custom viewport, full-page capture, and waiting for the page (load + settle + optional
// CSS selector) so dynamic content like maps finishes rendering before the shot.

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, resolve, basename, dirname } from "node:path";
import { homedir, tmpdir, platform } from "node:os";

function defaultOutputDir() {
  const dir = join(homedir(), ".rudycanshoot", "captures");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function timestampedName(prefix = "url") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.png`;
}

function findChrome() {
  if (process.env.RUDYCANSHOOT_CHROME) return process.env.RUDYCANSHOOT_CHROME;
  const os = platform();
  const candidates =
    os === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : os === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        ]
      : ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"];
  for (const c of candidates) {
    if (c.includes("/") || c.includes("\\")) {
      try { execFileSync(process.platform === "win32" ? "cmd" : "test", process.platform === "win32" ? ["/c", "if", "exist", c, "exit", "0"] : ["-x", c]); return c; } catch {}
    } else {
      try { return execFileSync("which", [c], { encoding: "utf8" }).trim(); } catch {}
    }
  }
  throw new Error(
    "No Chrome/Chromium found for URL capture. Install Google Chrome or Chromium, " +
    "or set RUDYCANSHOOT_CHROME to the executable path."
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Minimal CDP client over a single WebSocket (flat protocol via sessionId).
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }
      }, 60000);
    });
  }
}

async function connectWS(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const ws = new WebSocket(url);
      await new Promise((res, rej) => {
        ws.addEventListener("open", res, { once: true });
        ws.addEventListener("error", rej, { once: true });
      });
      return ws;
    } catch (e) {
      if (Date.now() > deadline) throw e;
      await sleep(150);
    }
  }
}

async function fetchJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
    if (Date.now() > deadline) throw new Error(`Chrome DevTools endpoint not reachable: ${url}`);
    await sleep(150);
  }
}

/**
 * Render a URL headlessly and save a PNG screenshot.
 *
 * @param {object} opts
 * @param {string} opts.url                 - Page to capture (required).
 * @param {number} [opts.width=1600]        - Viewport width.
 * @param {number} [opts.height=1000]       - Viewport height.
 * @param {number} [opts.deviceScaleFactor=1]
 * @param {boolean} [opts.fullPage=false]   - Capture the full scrollable page.
 * @param {number} [opts.waitMs=4000]       - Extra settle time after load (for maps/canvas).
 * @param {string} [opts.waitSelector]      - Also wait until this CSS selector exists.
 * @param {object} [opts.cookies]           - Auth cookies {name: value}, installed in the browser
 *                                            jar (scoped to the URL) so XHRs are authenticated.
 * @param {object} [opts.headers]           - Extra HTTP headers sent on every request.
 * @param {string} [opts.filename]          - Output filename.
 * @param {string} [opts.outputDir]         - Output directory.
 * @returns {Promise<string>} saved file path
 */
export async function captureUrl(opts = {}) {
  const {
    url,
    width = 1600,
    height = 1000,
    deviceScaleFactor = 1,
    fullPage = false,
    waitMs = 4000,
    waitSelector = null,
    cookies = null,
    headers = null,
    filename = timestampedName(),
    outputDir = defaultOutputDir(),
  } = opts;
  if (!url) throw new Error("captureUrl: 'url' is required");

  const chrome = findChrome();
  const port = 9222 + Math.floor(Math.random() * 2000);
  const userDataDir = join(tmpdir(), `rudycanshoot-chrome-${Date.now()}-${port}`);
  const args = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    "--no-sandbox",
    "--hide-scrollbars",
    "--disable-dev-shm-usage",
    "--no-first-run",
    // Software WebGL (SwiftShader) so canvas/WebGL pages — e.g. MapLibre GL / WebGL maps —
    // actually render in headless. Without this the GL canvas is blank.
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "about:blank",
  ];
  const proc = spawn(chrome, args, { stdio: "ignore", detached: false });

  let ws, cdp;
  try {
    const version = await fetchJson(`http://127.0.0.1:${port}/json/version`, 15000);
    ws = await connectWS(version.webSocketDebuggerUrl);
    cdp = new CDP(ws);

    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });

    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    // Install auth cookies in the browser jar (scoped to the target URL) BEFORE navigating,
    // so the SPA's auth XHRs (e.g. /api/auth/me/) are authenticated. Passing `url` lets
    // Chrome infer domain/path/secure. This is more reliable than a Cookie header.
    if (cookies && Object.keys(cookies).length) {
      for (const [name, value] of Object.entries(cookies)) {
        await cdp.send("Network.setCookie", { name, value, url }, sessionId);
      }
    }
    if (headers && Object.keys(headers).length) {
      await cdp.send("Network.setExtraHTTPHeaders", { headers }, sessionId);
    }
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor, mobile: false,
    }, sessionId);

    await cdp.send("Page.navigate", { url }, sessionId);
    // Wait for the load event (best-effort), then a settle delay for dynamic content.
    await new Promise((res) => {
      let done = false;
      const finish = () => { if (!done) { done = true; res(); } };
      ws.addEventListener("message", (ev) => {
        const m = JSON.parse(ev.data);
        if (m.method === "Page.loadEventFired") finish();
      });
      setTimeout(finish, 20000); // hard cap if load never fires
    });

    if (waitSelector) {
      const deadline = Date.now() + 15000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { result } = await cdp.send("Runtime.evaluate", {
          expression: `!!document.querySelector(${JSON.stringify(waitSelector)})`,
          returnByValue: true,
        }, sessionId);
        if (result?.value) break;
        if (Date.now() > deadline) break;
        await sleep(250);
      }
    }
    if (waitMs > 0) await sleep(waitMs);

    const shot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: !!fullPage,
      ...(fullPage ? {} : { clip: undefined }),
    }, sessionId);

    const outPath = resolve(join(outputDir, filename));
    mkdirSync(dirname(outPath), { recursive: true });
    await writeFile(outPath, Buffer.from(shot.data, "base64"));
    return outPath;
  } finally {
    try { ws?.close(); } catch {}
    try { proc.kill("SIGKILL"); } catch {}
  }
}

/** Build a Cookie header value from a {name: value} map. */
export function cookieHeader(cookies = {}) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}
