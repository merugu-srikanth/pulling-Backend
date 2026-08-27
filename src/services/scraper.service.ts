import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import https from "https";
import { FileManager } from "../utils/fileManager";
import { ContentExtractor } from "./content-extractor.service";
import { OpportunityValidator } from "./opportunity-validator.service";
import { ChangeDetectionService } from "./change-detection.service";
import { OpportunityDedupService } from "./opportunity-dedup.service";
import { extractOpportunitiesWithAI } from "./openai.service";
import { scrapeXML } from "./xmlScraper.service";

const LOOSE_TLS_AGENT = new https.Agent({ rejectUnauthorized: false });
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

interface FetchResult {
  status: number;
  data: string;
  etag: string | null;
  lastModified: string | null;
}

async function fetchWithConditionalHeaders(url: string, etag: string | null, lastModified: string | null): Promise<FetchResult> {
  const headers: any = { ...HEADERS };
  if (etag) headers["If-None-Match"] = etag;
  if (lastModified) headers["If-Modified-Since"] = lastModified;

  try {
    const response = await axios.get(url, {
      headers,
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (status) => status === 200 || status === 304,
    });

    return {
      status: response.status,
      data: response.status === 304 ? "" : (typeof response.data === "string" ? response.data : JSON.stringify(response.data)),
      etag: response.headers["etag"] || null,
      lastModified: response.headers["last-modified"] || null,
    };
  } catch (err) {
    // Retry with loose TLS
    const response = await axios.get(url, {
      headers,
      timeout: 30000,
      maxRedirects: 5,
      httpsAgent: LOOSE_TLS_AGENT,
      validateStatus: (status) => status === 200 || status === 304,
    });

    return {
      status: response.status,
      data: response.status === 304 ? "" : (typeof response.data === "string" ? response.data : JSON.stringify(response.data)),
      etag: response.headers["etag"] || null,
      lastModified: response.headers["last-modified"] || null,
    };
  }
}

async function scrapeOne(website: any): Promise<{ jobs: any[]; error: string | null; skipped: boolean; promptTokens: number; completionTokens: number }> {
  try {
    // Level 1: HTTP Conditional Requests
    const fetchResult = await fetchWithConditionalHeaders(website.url, website.etag, website.lastModified);
    
    if (fetchResult.status === 304) {
      console.log(`[Scraper] 304 Not Modified for ${website.url}. Skipping.`);
      return { jobs: [], error: null, skipped: true, promptTokens: 0, completionTokens: 0 };
    }

    const rawHtml = fetchResult.data;

    // Check if raw HTML matches previous raw content hash
    const rawHash = ChangeDetectionService.generateHash(rawHtml);
    if (website.rawContentHash && rawHash === website.rawContentHash) {
      console.log(`[Scraper] Raw content hash matches for ${website.url}. Skipping.`);
      // Update conditional headers if returned new ones
      await FileManager.updateWebsite(website.id, {
        etag: fetchResult.etag || website.etag,
        lastModified: fetchResult.lastModified || website.lastModified,
      });
      return { jobs: [], error: null, skipped: true, promptTokens: 0, completionTokens: 0 };
    }

    // Support XML sitemaps or feeds directly
    const isXml = website.url.endsWith(".xml") || website.url.includes("sitemap") || website.type === "xml";
    if (isXml) {
      const jobs = await scrapeXML(website.url);
      await FileManager.updateWebsite(website.id, {
        rawContentHash: rawHash,
        etag: fetchResult.etag,
        lastModified: fetchResult.lastModified,
      });
      return { jobs, error: null, skipped: false, promptTokens: 0, completionTokens: 0 };
    }

    // Level 2: Clean text hash checking
    const cleanText = ContentExtractor.cleanHtmlToText(rawHtml);
    const cleanHash = ChangeDetectionService.generateHash(cleanText);

    if (website.cleanContentHash && cleanHash === website.cleanContentHash) {
      console.log(`[Scraper] Clean content hash matches for ${website.url}. Skipping.`);
      await FileManager.updateWebsite(website.id, {
        rawContentHash: rawHash,
        cleanContentHash: cleanHash,
        etag: fetchResult.etag || website.etag,
        lastModified: fetchResult.lastModified || website.lastModified,
      });
      return { jobs: [], error: null, skipped: true, promptTokens: 0, completionTokens: 0 };
    }

    // Level 3: Meaningful opportunity content hash checking
    const { changed: opChanged, hash: opHash } = ChangeDetectionService.hasOpportunityChanged(cleanText, website.opportunityContentHash);
    if (!opChanged) {
      console.log(`[Scraper] Opportunity content hash matches for ${website.url}. Skipping.`);
      await FileManager.updateWebsite(website.id, {
        rawContentHash: rawHash,
        cleanContentHash: cleanHash,
        opportunityContentHash: opHash,
        etag: fetchResult.etag || website.etag,
        lastModified: fetchResult.lastModified || website.lastModified,
      });
      return { jobs: [], error: null, skipped: true, promptTokens: 0, completionTokens: 0 };
    }

    // Level 4: Keyword Relevance Filter
    const relevant = OpportunityValidator.isRelevant(cleanText);
    if (!relevant) {
      console.log(`[Scraper] Page content is not relevant based on keyword dictionary: ${website.url}. Skipping.`);
      await FileManager.updateWebsite(website.id, {
        rawContentHash: rawHash,
        cleanContentHash: cleanHash,
        opportunityContentHash: opHash,
        etag: fetchResult.etag,
        lastModified: fetchResult.lastModified,
      });
      return { jobs: [], error: null, skipped: true, promptTokens: 0, completionTokens: 0 };
    }

    // Level 5: OpenAI Structured Extraction
    console.log(`[Scraper] Page changed & relevant. Calling OpenAI Structured Outputs for: ${website.url}`);
    const { jobs, usage } = await extractOpportunitiesWithAI(website.url, cleanText);

    // Save success metadata on the website
    await FileManager.updateWebsite(website.id, {
      rawContentHash: rawHash,
      cleanContentHash: cleanHash,
      opportunityContentHash: opHash,
      etag: fetchResult.etag,
      lastModified: fetchResult.lastModified,
    });

    return { jobs, error: null, skipped: false, promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens };
  } catch (err: any) {
    return { jobs: [], error: err.message || "Unknown error during AI scraping", skipped: false, promptTokens: 0, completionTokens: 0 };
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
    promptTokens: 0,
    completionTokens: 0,
  };

  const logs = await FileManager.getLogs();
  logs.unshift(logEntry);
  await FileManager.saveLogs(logs);

  const { jobs, error, skipped, promptTokens, completionTokens } = await scrapeOne(website);

  logEntry.endTime = new Date().toISOString();
  logEntry.status = error ? "failed" : (skipped ? "skipped" : "success");
  logEntry.jobsFound = jobs.length;
  logEntry.errorMessage = error;
  logEntry.promptTokens = promptTokens;
  logEntry.completionTokens = completionTokens;

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

  let activeIds: string[] = [];
  if (jobs.length > 0) {
    activeIds = await OpportunityDedupService.deduplicateAndSave(jobs);
  }
  
  // Clean up any previously open opportunities from this source that are no longer listed
  if (!error && !skipped) {
    await OpportunityDedupService.handleRemovedOpportunities(website.url, activeIds);
  }

  return { success: !error, jobsFound: jobs.length, skipped, error, promptTokens, completionTokens };
}

export async function scrapeAll(): Promise<any> {
  // First expire any past deadlines automatically using deterministic logic
  await OpportunityDedupService.expireJobsWithPassedDeadlines();

  const websites = (await FileManager.getWebsites()).filter(
    (w: any) => w.status !== "inactive" && w.autoScrape !== false
  );
  const results = { total: websites.length, success: 0, failed: 0, skipped: 0, totalJobs: 0 };

  for (const website of websites) {
    const result = await scrapeWebsite(website.id);
    if (result.success) {
      if (result.skipped) {
        results.skipped++;
      } else {
        results.success++;
        results.totalJobs += result.jobsFound;
      }
    } else {
      results.failed++;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  return results;
}
