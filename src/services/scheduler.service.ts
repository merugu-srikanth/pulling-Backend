import cron from "node-cron";
import { FileManager } from "../utils/fileManager";
import { scrapeAll } from "./scraper.service";

let currentTask: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  const config = FileManager.getScheduler();
  if (!config.enabled) return;

  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }

  if (!cron.validate(config.cronExpression)) {
    console.error("Invalid cron expression:", config.cronExpression);
    return;
  }

  currentTask = cron.schedule(config.cronExpression, async () => {
    console.log("[Scheduler] Starting scheduled scrape...");
    const cfg = FileManager.getScheduler();
    cfg.lastRun = new Date().toISOString();
    FileManager.saveScheduler(cfg);

    await scrapeAll();
    console.log("[Scheduler] Scheduled scrape complete.");
  });

  console.log(`[Scheduler] Started with expression: ${config.cronExpression}`);
}

export function stopScheduler(): void {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  const config = FileManager.getScheduler();
  config.enabled = false;
  FileManager.saveScheduler(config);
}

export function updateScheduler(updates: any): any {
  const config = FileManager.getScheduler();
  const newConfig = { ...config, ...updates };
  FileManager.saveScheduler(newConfig);

  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (newConfig.enabled) {
    startScheduler();
  }
  return newConfig;
}
