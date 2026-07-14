import { v4 as uuidv4 } from "uuid";
import { FileManager } from "../utils/fileManager";
import { detectType } from "../utils/detector";
import { scrapeHTML } from "./htmlScraper.service";
import { scrapeXML } from "./xmlScraper.service";
import { scrapeAICTE, isAicteUrl, scrapeAICTERecent, isAicteRecentUrl } from "./aicteScraper.service";
import { scrapeNPTEL, isNptelUrl } from "./nptelScraper.service";
import { scrapePmInternship, isPmInternshipUrl } from "./pmInternshipScraper.service";

async function scrapeOne(website: any): Promise<{ jobs: any[]; error: string | null }> {
  try {
    if (isPmInternshipUrl(website.url)) {
      const jobs = await scrapePmInternship(website.url);
      return { jobs, error: null };
    }

    if (isNptelUrl(website.url)) {
      const jobs = await scrapeNPTEL(website.url);
      return { jobs, error: null };
    }

    if (isAicteRecentUrl(website.url)) {
      const jobs = await scrapeAICTERecent(website.url);
      return { jobs, error: null };
    }

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
  const websites = await FileManager.getWebsites();
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

  const logs = await FileManager.getLogs();
  logs.unshift(logEntry);
  await FileManager.saveLogs(logs);

  const { jobs, error } = await scrapeOne(website);

  logEntry.endTime = new Date().toISOString();
  logEntry.status = error ? "failed" : "success";
  logEntry.jobsFound = jobs.length;
  logEntry.errorMessage = error;

  const updatedLogs = await FileManager.getLogs();
  const logIdx = updatedLogs.findIndex((l: any) => l.id === logEntry.id);
  if (logIdx >= 0) updatedLogs[logIdx] = logEntry;
  await FileManager.saveLogs(updatedLogs.slice(0, 500));

  const allWebsites = await FileManager.getWebsites();
  const websiteIdx = allWebsites.findIndex((w: any) => w.id === websiteId);
  if (websiteIdx >= 0) {
    allWebsites[websiteIdx].lastScraped = new Date().toISOString();
    allWebsites[websiteIdx].status = error ? "error" : "active";
    allWebsites[websiteIdx].jobsFound = jobs.length;
    allWebsites[websiteIdx].errorMessage = error;
    await FileManager.saveWebsites(allWebsites);
  }

  if (jobs.length > 0) {
    await FileManager.smartSaveJobs(jobs);
  }

  return { success: !error, jobsFound: jobs.length, error };
}

export async function scrapeAll(): Promise<any> {
  const websites = (await FileManager.getWebsites()).filter(
    (w: any) => w.status !== "inactive" && w.autoScrape !== false
  );
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
