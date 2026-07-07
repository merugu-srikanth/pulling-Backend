import fs from "fs";
import path from "path";

const DATA_DIR = path.join(__dirname, "../data");

function readJSON<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return [] as unknown as T;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function writeJSON<T>(filename: string, data: T): void {
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
