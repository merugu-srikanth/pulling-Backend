import { v4 as uuidv4 } from "uuid";
import { FileManager } from "../utils/fileManager";
import { detectType } from "../utils/detector";
import { scrapeHTML } from "./htmlScraper.service";
import { scrapeXML } from "./xmlScraper.service";
import { scrapeAICTE, isAicteUrl, scrapeAICTERecent, isAicteRecentUrl } from "./aicteScraper.service";

async function scrapeOne(website: any): Promise<{ jobs: any[]; error: string | null }> {
  try {
    // AICTE recently-posted page — AJAX-based, active-only scraper
    if (isAicteRecentUrl(website.url)) {
      const jobs = await scrapeAICTERecent(website.url);
      return { jobs, error: null };
    }

    // AICTE city-filtered internship portal — dedicated multi-page scraper
    if (isAicteUrl(website.url)) {
      const jobs = await scrapeAICTE(website.url);
      return { jobs, error: null };
    }

    let type = website.type;
    if (type === "auto") {
      type = await detectType(website.url);
    }

    const jobs = type === "xml"
      ? await scrapeXML(website.url)
      : await scrapeHTML(website.url);

    return { jobs, error: null };
  } catch (err: any) {
    return { jobs: [], error: err.message || "Unknown error" };
  }
}

export async function scrapeWebsite(websiteId: string): Promise<any> {
  const websites = FileManager.getWebsites();
  const website = websites.find((w: any) => w.id === websiteId);
  if (!website) throw new Error("Website not found");

  const logEntry: any = {
    id: uuidv4(),
    websiteId,
    websiteUrl: website.url,
    startTime: new Date().toISOString(),
    endTime: null,
    status: "running",
    jobsFound: 0,
    errorMessage: null,
  };

  const logs = FileManager.getLogs();
  logs.unshift(logEntry);
  FileManager.saveLogs(logs);

  const { jobs, error } = await scrapeOne(website);

  logEntry.endTime = new Date().toISOString();
  logEntry.status = error ? "failed" : "success";
  logEntry.jobsFound = jobs.length;
  logEntry.errorMessage = error;

  const updatedLogs = FileManager.getLogs();
  const logIdx = updatedLogs.findIndex((l: any) => l.id === logEntry.id);
  if (logIdx >= 0) updatedLogs[logIdx] = logEntry;
  FileManager.saveLogs(updatedLogs.slice(0, 500));

  const websiteIdx = websites.findIndex((w: any) => w.id === websiteId);
  if (websiteIdx >= 0) {
    websites[websiteIdx].lastScraped = new Date().toISOString();
    websites[websiteIdx].status = error ? "error" : "active";
    websites[websiteIdx].jobsFound = jobs.length;
    websites[websiteIdx].errorMessage = error;
    FileManager.saveWebsites(websites);
  }

  if (jobs.length > 0) {
    const existing = FileManager.getJobs();
    const existingTitles = new Set(existing.map((j: any) => j.title.toLowerCase()));
    const newJobs = jobs.filter((j: any) => !existingTitles.has(j.title.toLowerCase()));
    FileManager.saveJobs([...newJobs, ...existing]);
  }

  return { success: !error, jobsFound: jobs.length, error };
}

export async function scrapeAll(): Promise<any> {
  const websites = FileManager.getWebsites().filter((w: any) => w.status !== "inactive");
  const results = { total: websites.length, success: 0, failed: 0, totalJobs: 0 };

  for (const website of websites) {
    const result = await scrapeWebsite(website.id);
    if (result.success) {
      results.success++;
      results.totalJobs += result.jobsFound;
    } else {
      results.failed++;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
