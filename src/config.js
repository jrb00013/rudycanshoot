import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CONFIG_DIR = join(homedir(), ".rudycanshoot");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULTS = {
  outputDir: join(homedir(), ".rudycanshoot", "captures"),
  defaultMode: "fullscreen",
  fontSize: 13,
  theme: "dark",
  historyLimit: 1000,
  watchInterval: 5000,
  autoAnnotate: false,
  annotateColor: "#00ff88",
  annotatePosition: "bottom",
  ocrLanguage: "eng",
};

export async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_FILE, "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveConfig(updates) {
  await mkdir(CONFIG_DIR, { recursive: true });
  const current = await loadConfig();
  const next = { ...current, ...updates };
  await writeFile(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}

export async function resetConfig() {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(DEFAULTS, null, 2));
  return { ...DEFAULTS };
}

export { DEFAULTS };
