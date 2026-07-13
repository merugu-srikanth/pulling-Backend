import { Request, Response } from "express";
import { scrapeWebsite, scrapeAll } from "../services/scraper.service";
import { FileManager } from "../utils/fileManager";

export const scrapeOne = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await scrapeWebsite(id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const scrapeAllWebsites = async (_req: Request, res: Response) => {
  try {
    const result = await scrapeAll();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getLogs = async (_req: Request, res: Response) => {
  const logs = await FileManager.getLogs();
  res.json(logs.slice(0, 100));
};

export const getStats = async (_req: Request, res: Response) => {
  const [jobs, websites, logs] = await Promise.all([
    FileManager.getJobs(),
    FileManager.getWebsites(),
    FileManager.getLogs(),
  ]);

  const today = new Date().toISOString().split("T")[0];
  const todayJobs = jobs.filter((j: any) => j.scrapedAt?.startsWith(today));
  const successLogs = logs.filter((l: any) => l.status === "success");
  const lastRun = logs[0]?.startTime || null;
  const successRate = logs.length > 0
    ? Math.round((successLogs.length / logs.length) * 100)
    : 0;

  res.json({
    totalWebsites: websites.length,
    activeWebsites: websites.filter((w: any) => w.status === "active").length,
    failedWebsites: websites.filter((w: any) => w.status === "error").length,
    totalJobs: jobs.length,
    jobsToday: todayJobs.length,
    successRate,
    lastRun,
  });
};
