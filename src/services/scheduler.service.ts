import cron from "node-cron";
import { FileManager } from "../utils/fileManager";
import { scrapeAll } from "./scraper.service";

let currentTask: cron.ScheduledTask | null = null;

export async function startScheduler(): Promise<void> {
  const config = await FileManager.getScheduler();
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
    const cfg = await FileManager.getScheduler();
    cfg.lastRun = new Date().toISOString();
    await FileManager.saveScheduler(cfg);
    await scrapeAll();
    console.log("[Scheduler] Scheduled scrape complete.");
  });

  console.log(`[Scheduler] Started with expression: ${config.cronExpression}`);
}

export async function stopScheduler(): Promise<void> {
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  const config = await FileManager.getScheduler();
  config.enabled = false;
  await FileManager.saveScheduler(config);
}

export async function updateScheduler(updates: any): Promise<any> {
  const config = await FileManager.getScheduler();
  const newConfig = { ...config, ...updates };
  await FileManager.saveScheduler(newConfig);

  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (newConfig.enabled) {
    await startScheduler();
  }
  return newConfig;
}
