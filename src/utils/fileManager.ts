import fs from "fs";
import path from "path";

// Vercel has a read-only filesystem; only /tmp is writable in production
const IS_VERCEL = !!process.env.VERCEL;
const DATA_DIR = IS_VERCEL
  ? "/tmp/scraper-data"
  : path.join(__dirname, "../data");

// Original bundled data dir (readable even on Vercel, but not writable)
const BUNDLED_DATA_DIR = path.join(__dirname, "../data");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJSON<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  }
  // Fallback: read from bundled data (committed files like scheduler.json)
  const bundledPath = path.join(BUNDLED_DATA_DIR, filename);
  if (fs.existsSync(bundledPath)) {
    return JSON.parse(fs.readFileSync(bundledPath, "utf-8")) as T;
  }
  return [] as unknown as T;
}

function writeJSON<T>(filename: string, data: T): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export const FileManager = {
  getJobs: () => readJSON<any[]>("jobs.json"),
  saveJobs: (data: any[]) => writeJSON("jobs.json", data),

  getWebsites: () => readJSON<any[]>("websites.json"),
  saveWebsites: (data: any[]) => writeJSON("websites.json", data),

  getLogs: () => readJSON<any[]>("logs.json"),
  saveLogs: (data: any[]) => writeJSON("logs.json", data),

  getScheduler: () => readJSON<any>("scheduler.json"),
  saveScheduler: (data: any) => writeJSON("scheduler.json", data),
};
