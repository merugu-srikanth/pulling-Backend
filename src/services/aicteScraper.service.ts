import axios from "axios";
import * as cheerio from "cheerio";
import { v4 as uuidv4 } from "uuid";

const BASE = "https://internship.aicte-india.org";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://internship.aicte-india.org/"
};

// Internship types exposed by recentlyposted.php
const RECENT_TYPES = ["Full Time", "Virtual Internship", "Part Time", "Up-Skilling/Training Program"];

type CheerioRoot = ReturnType<typeof cheerio.load>;

function extractCards($: CheerioRoot, pageUrl: string): any[] {
  const jobs: any[] = [];

  $(".card.internship-item").each((_, el) => {
    const card = $(el);

    const title = card.find("h3.job-title").text().trim();
    if (!title) return;

    const organization   = card.find("h5.company-name").text().trim();
    const internshipType = card.find("li.wfh span").text().trim();
    const postedDate     = card.find("li.posted-on span").text().trim();
    const location       = card.find("li.location span").text().trim().replace(/,\s*$/, "").trim();
    const startDate      = card.find("li.start-date span").text().trim();
    const duration       = card.find("li.duration span").text().trim();
    const stipend        = card.find("li.stipend span").text().trim();
    const lastDate       = card.find("li.apply-by span").text().trim();
    const detailHref     = card.find("a[href*='internship-details']").attr("href") || "";
    const applyLink      = detailHref ? new URL(detailHref, BASE).href : pageUrl;

    jobs.push({
      id:             uuidv4(),
      title,
      organization:   organization || "Unknown",
      vacancies:      0,
      qualification:  duration ? `Duration: ${duration}` : "As per notification",
      lastDate:       lastDate || "See notification",
      applyLink,
      source:         "internship.aicte-india.org",
      scrapedAt:      new Date().toISOString(),
      // AICTE-specific fields (stored in JSON, shown in detail modal)
      internshipType,
      location,
      startDate,
      duration,
      stipend,
      postedDate,
    });
  });

  return jobs;
}

function getMaxPage($: CheerioRoot): number {
  let maxPage = 1;
  $("a[href*='page=']").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/page=(\d+)/);
    if (m) maxPage = Math.max(maxPage, parseInt(m[1]));
  });
  return maxPage;
}

function buildPageUrl(baseUrl: string, page: number): string {
  const u = new URL(baseUrl);
  u.searchParams.set("page", String(page));
  if (!u.searchParams.has("internship_stipend")) {
    u.searchParams.set("internship_stipend", "paid");
  }
  return u.href;
}

// Only activate for fetch_city.php URLs (homepage falls through to generic HTML scraper)
export function isAicteUrl(url: string): boolean {
  return url.includes("internship.aicte-india.org") && url.includes("fetch_city.php");
}

// Activate for recentlyposted.php
export function isAicteRecentUrl(url: string): boolean {
  return url.includes("internship.aicte-india.org") && url.includes("recentlyposted.php");
}

// Parse "30-Jul-2026" → Date
function parseApplyDate(text: string): Date | null {
  const MONTHS: Record<string, number> = {
    jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11
  };
  const m = text.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return null;
  return new Date(parseInt(m[3]), month, parseInt(m[1]));
}

function isActive(lastDate: string): boolean {
  const d = parseApplyDate(lastDate);
  if (!d) return true; // include if unparseable
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d >= today;
}

// Extract cards from AJAX HTML (no <span> inside <li> — text is direct)
function extractRecentCards(html: string, pageUrl: string): any[] {
  const $ = cheerio.load(html || "");
  const jobs: any[] = [];

  $(".card.internship-item").each((_, el) => {
    const card = $(el);
    const title = card.find("h3, h2, .job-title").first().text().trim();
    if (!title) return;

    const organization   = card.find("h5, .company-name").first().text().trim();
    const internshipType = card.find("li.wfh").text().trim();
    const postedDate     = card.find("li.posted-on").text().trim();
    const location       = card.find("li.location").text().trim().replace(/,\s*$/, "").trim();
    const duration       = card.find("li.duration").text().trim();

    // "Start dateImmediately" → "Immediately"
    const startDate = card.find("li.start-date").text().trim().replace(/^start\s*date\s*/i, "").trim();

    // Two li.stipend: first = "Stipend X", second = "Number of Credits X"
    const stipendItems  = card.find("li.stipend");
    const stipend       = stipendItems.eq(0).text().trim().replace(/^stipend\s*/i, "").trim();
    const numberOfCredits = stipendItems.eq(1).text().trim().replace(/^number\s*of\s*credits\s*/i, "").trim();

    // li.user = "Number of Openings X"
    const numberOfOpenings = card.find("li.user").text().trim().replace(/^number\s*of\s*openings\s*/i, "").trim();

    // "Apply by30-Jul-2026" → "30-Jul-2026"
    const lastDate = card.find("li.apply-by").text().trim().replace(/^apply\s*by\s*/i, "").trim();

    const detailHref = card.find("a[href*='internship-details']").attr("href") || "";
    const applyLink  = detailHref ? new URL(detailHref, BASE).href : pageUrl;

    jobs.push({
      id:             uuidv4(),
      title,
      organization:   organization || "Unknown",
      vacancies:      parseInt(numberOfOpenings) || 0,
      qualification:  duration ? `Duration: ${duration}` : "As per notification",
      lastDate:       lastDate || "See notification",
      applyLink,
      source:         "internship.aicte-india.org",
      scrapedAt:      new Date().toISOString(),
      internshipType,
      location,
      startDate,
      duration,
      stipend,
      postedDate,
      numberOfCredits,
      numberOfOpenings,
    });
  });

  return jobs;
}

// Get max page number from AJAX pagination HTML
function getMaxPageAjax($pag: CheerioRoot): number {
  let max = 1;
  $pag("[data-page]").each((_, el) => {
    const n = parseInt($pag(el).attr("data-page") || "0");
    if (n > max) max = n;
  });
  return max;
}

export async function scrapeAICTERecent(pageUrl: string): Promise<any[]> {
  // Step 1: GET the page to obtain a PHPSESSID cookie
  const pageRes = await axios.get(pageUrl, {
    headers: { ...HEADERS, Accept: "text/html,application/xhtml+xml" },
    timeout: 25000
  });
  const setCookies: string[] = (pageRes.headers["set-cookie"] as string[]) || [];
  const cookieStr = setCookies.map(c => c.split(";")[0]).join("; ");

  const postHeaders: Record<string, string> = {
    "User-Agent":     HEADERS["User-Agent"],
    "Accept":         "application/json, text/javascript, */*; q=0.01",
    "Content-Type":   "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
    "Referer":        pageUrl,
    "Origin":         BASE,
    "Cookie":         cookieStr
  };

  const allJobs: any[] = [];
  const seenLinks = new Set<string>();

  for (const type of RECENT_TYPES) {
    console.log(`[AICTE Recent] Scraping type: "${type}"`);

    try {
      // Page 1
      const params1 = new URLSearchParams({ action: "load_internship", internship_type: type, page: "1" });
      const res1 = await axios.post<{ list: string; pagination: string }>(
        `${BASE}/class/class_internship.php`, params1.toString(), { headers: postHeaders, timeout: 20000 }
      );

      const $pag1 = cheerio.load(res1.data.pagination || "");
      const maxPage = getMaxPageAjax($pag1);
      const p1Jobs  = extractRecentCards(res1.data.list || "", pageUrl);
      console.log(`[AICTE Recent] "${type}": ${maxPage} pages, page 1: ${p1Jobs.length} cards`);

      let zeroActiveStreak = 0;

      const addActive = (jobs: any[]): number => {
        let added = 0;
        for (const job of jobs) {
          if (!seenLinks.has(job.applyLink) && isActive(job.lastDate)) {
            seenLinks.add(job.applyLink);
            allJobs.push(job);
            added++;
          }
        }
        return added;
      };

      const added1 = addActive(p1Jobs);
      if (p1Jobs.length > 0 && added1 === 0) zeroActiveStreak++;

      // Pages 2..maxPage
      for (let page = 2; page <= maxPage; page++) {
        if (zeroActiveStreak >= 2) break; // older pages will also be expired

        await new Promise(r => setTimeout(r, 400));

        const params = new URLSearchParams({ action: "load_internship", internship_type: type, page: String(page) });
        const res = await axios.post<{ list: string; pagination: string }>(
          `${BASE}/class/class_internship.php`, params.toString(), { headers: postHeaders, timeout: 20000 }
        );

        const pageJobs = extractRecentCards(res.data.list || "", pageUrl);
        const added    = addActive(pageJobs);
        console.log(`[AICTE Recent] "${type}" page ${page}/${maxPage}: ${added} active`);

        if (pageJobs.length > 0 && added === 0) {
          zeroActiveStreak++;
        } else {
          zeroActiveStreak = 0;
        }
      }
    } catch (err: any) {
      console.error(`[AICTE Recent] "${type}" failed: ${err.message}`);
    }
  }

  console.log(`[AICTE Recent] Total active internships: ${allJobs.length}`);
  return allJobs;
}

export async function scrapeAICTE(url: string): Promise<any[]> {
  let fetchUrl = url;

  fetchUrl = buildPageUrl(url, 1);

  // Page 1
  const { data: html1 } = await axios.get(fetchUrl, { headers: HEADERS, timeout: 30000 });
  const $1 = cheerio.load(html1);

  const maxPage  = getMaxPage($1);
  const allJobs  = extractCards($1, fetchUrl);
  console.log(`[AICTE] ${maxPage} pages detected — page 1: ${allJobs.length} internships`);

  // Pages 2..maxPage
  for (let page = 2; page <= maxPage; page++) {
    try {
      const pageUrl = buildPageUrl(fetchUrl, page);
      const { data: html } = await axios.get(pageUrl, { headers: HEADERS, timeout: 30000 });
      const $p = cheerio.load(html);
      const pageJobs = extractCards($p, pageUrl);
      allJobs.push(...pageJobs);
      console.log(`[AICTE] page ${page}/${maxPage}: ${pageJobs.length} internships`);
      await new Promise(r => setTimeout(r, 400)); // polite delay
    } catch (err: any) {
      console.error(`[AICTE] page ${page} failed: ${err.message}`);
    }
  }

  console.log(`[AICTE] Total: ${allJobs.length} internships across ${maxPage} pages`);
  return allJobs;
}
