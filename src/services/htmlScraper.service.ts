import axios from "axios";
import * as cheerio from "cheerio";
import https from "https";
type CheerioStatic = ReturnType<typeof cheerio.load>;
import { v4 as uuidv4 } from "uuid";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
};

// Permissive TLS agent for government sites with older TLS configs
const LOOSE_TLS_AGENT = new https.Agent({ rejectUnauthorized: false });

/* ─── URL resolver ────────────────────────────────────────────────────── */
function resolveUrl(href: string, pageUrl: string): string {
  if (!href) return "";
  try {
    return new URL(href, pageUrl).href;
  } catch {
    return href;
  }
}

/* ─── Text helpers ────────────────────────────────────────────────────── */
function extractOrg(text: string, title: string): string {
  const orgKeywords = ["Issued by", "Organization", "Posted by", "Board", "Department", "Ministry",
    "జారీ చేసినది", "संस्था", "विभाग"];
  for (const kw of orgKeywords) {
    const re = new RegExp(kw + "\\s*[-–:]\\s*([^\\n\\r,;]{3,60})", "i");
    const m = text.match(re);
    if (m) return m[1].trim();
  }
  const knownOrgs = ["UPSC","SSC","IBPS","RRB","RRC","NHM","DRDO","ISRO","HAL","AIIMS","ESIC","IIT","NIT",
    "TSPSC","APPSC","KPSC","MPSC","BPSC","JPSC","RPSC","OPSC","GPSC","HPSC",
    "UPSSSC","DSSSB","UKPSC","TNPSC","MPPSC","CGPSC","WBPSC","HPPSC",
    "TMC","JIPMER","NIMHANS","SAI","ICAR","CSIR","SBI","BOB","PNB","LIC","GIC"];
  for (const org of knownOrgs) {
    if (title.toUpperCase().includes(org)) return org;
  }
  return title.split(":")[0].trim().substring(0, 40) || "Unknown";
}

function extractVacancies(text: string): number {
  const patterns = [
    /(\d[\d,]+)\s*(?:post|vacancy|vacancies|seat|position|opening|recruitment|नियुक्ति)/i,
    /(?:total|approximately|around|upto)\s*(\d[\d,]+)\s*(?:post|vacancy|seat)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseInt(m[1].replace(/,/g, ""), 10);
  }
  return 0;
}

function extractQualification(text: string): string {
  if (/10th|matriculation|sslc|class\s*x\b/i.test(text)) return "10th Pass";
  if (/12th|intermediate|hsc|plus\s*two|class\s*xii/i.test(text)) return "12th Pass";
  if (/diploma/i.test(text)) return "Diploma";
  if (/b\.?e\.?|b\.?tech|engineering|b\.?arch/i.test(text)) return "B.E / B.Tech";
  if (/m\.?b\.?b\.?s|medical\s*pg|mbbs/i.test(text)) return "MBBS / Medical PG";
  if (/ph\.?d|doctorate/i.test(text)) return "Post Graduate";
  if (/m\.?tech|m\.?e\.?|m\.?sc|m\.?com|mca|mba|post.?grad|master/i.test(text)) return "Post Graduate";
  if (/b\.?sc|b\.?com|b\.?ca|b\.?ba|graduate|graduation|degree/i.test(text)) return "Graduate";
  if (/inter\b|inter,/i.test(text)) return "12th Pass";
  return "As per notification";
}

function extractDate(text: string): string {
  // Labeled last date takes priority
  const labeled = text.match(/last\s+date[:\s]+([^\n,;]{5,30})/i);
  if (labeled) return labeled[1].trim().substring(0, 20);

  // Find all numeric dates — return the LAST one (typically deadline, not issue date)
  const allNumDates = [...text.matchAll(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/g)];
  if (allNumDates.length > 0) return allNumDates[allNumDates.length - 1][0];

  const monthMatch = text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+(\d{4})/i);
  if (monthMatch) return monthMatch[0].trim().substring(0, 20);

  return "See notification";
}

function buildJob(title: string, href: string, context: string, pageUrl: string): any {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  return {
    id: uuidv4(),
    title: clean(title).substring(0, 200),
    organization: extractOrg(context, clean(title)),
    vacancies: extractVacancies(context),
    qualification: extractQualification(context),
    lastDate: extractDate(context),
    applyLink: resolveUrl(href, pageUrl),
    source: new URL(pageUrl).hostname.replace("www.", ""),
    scrapedAt: new Date().toISOString(),
  };
}

/* ─── Skip patterns ────────────────────────────────────────────────────── */
const SKIP_HREF = /^(#|javascript:|mailto:|tel:)/i;
const SKIP_TEXT = /^(home|about|contact|login|register|sign\s?in|sign\s?up|menu|search|back|next|previous|more$|read more|click here|apply here|download|share|facebook|twitter|instagram|youtube|whatsapp|privacy|disclaimer|copyright|sitemap|tag|category|page \d+$|gateway|subscribe|newsletter|your gateway|all rights|terms|conditions|follow us|get latest|latest update|notification alert|job alert$|join us|connect with|issued date|method of appointment|sl\.?\s*no|s\.?\s*no\.)/i;
const NAV_CLASSES = /nav|menu|header|footer|sidebar|social|breadcrumb|ad-|advert|banner|cookie|popup|modal/i;

function isNavElement($: CheerioStatic, el: any): boolean {
  let node = el;
  for (let i = 0; i < 5; i++) {
    const cls = ($(node).attr("class") || "") + ($(node).attr("id") || "");
    if (NAV_CLASSES.test(cls)) return true;
    const parent = $(node).parent();
    if (!parent.length) break;
    node = parent[0];
  }
  return false;
}

/* ─── Strategy 1: Structured selectors ───────────────────────────────── */
const STRUCTURED_SELECTORS = [
  // Eenadu-style: <a> wraps entire card containing h3
  { row: "a",         titleSel: ".govt-text h3, .govt-text h2",                 selfLink: true },
  // Article / card pattern
  { row: "article",   titleSel: "h1,h2,h3,h4,.entry-title,.post-title",         selfLink: false },
  // Div cards
  { row: ".post-box,.result-box,.job-card,.job-item,.notification-item,.noti-item,.alert-item,.sarkari-box,.board-section,.latest-job",
    titleSel: "h1,h2,h3,h4,a,.title,.job-title",                                selfLink: false },
  // Drupal Views tables (CSIR, NIC-based govt portals) — title in .views-field-title
  { row: "table tr",  titleSel: "td.views-field-title",                          selfLink: false },
  // Generic named tables
  { row: "table.table tr, table.notification-table tr, #notificationTable tr, table.views-table tr",
    titleSel: "td:nth-child(2), td:nth-child(1)",                                selfLink: false },
  // Generic table rows — smart cell pick (skip counter cells)
  { row: "table tr",  titleSel: "td",                                            selfLink: false },
  // List items
  { row: "ul.job-list li, ul.notification-list li, ul.noti-list li, ol.job-list li",
    titleSel: "a,h3,h4",                                                         selfLink: false },
  { row: "li.post,li.job,li.notification,li.noti",
    titleSel: "a,h3",                                                             selfLink: false },
];

function tryStructuredSelectors($: CheerioStatic, pageUrl: string): any[] {
  for (const sel of STRUCTURED_SELECTORS) {
    const rows = $(sel.row);
    if (rows.length < 2) continue;

    const jobs: any[] = [];
    const seen = new Set<string>();

    rows.each((_, el) => {
      if (isNavElement($, el)) return;

      // For generic "td" selector, pick the first cell with enough meaningful text
      let titleEl = $(el).find(sel.titleSel).first();
      let rawTitleOverride = "";
      if (sel.titleSel === "td") {
        const cells = $(el).find("td");
        const cellCount = cells.length;
        let best: any = null;
        let bestText = "";
        cells.each((_, td) => {
          const t = $(td).text().replace(/\s+/g, " ").trim();
          const isDateCell = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/.test(t);
          const isMethodCell = /^(recruitment|deputation|promotion|transfer|direct|contract|absorption)\s*$/i.test(t);
          if (t.length >= 10 && !isDateCell && !isMethodCell && !/^\d+$/.test(t) && !best) {
            best = td; bestText = t;
          }
        });
        if (!best) return;
        titleEl = $(best);
        // For 5-column gov tables (Employment News style): next qualifying cell = POST title
        if (cellCount >= 5) {
          const nextTd = $(best).next("td");
          if (nextTd.length) {
            const nextText = nextTd.text().replace(/\s+/g, " ").trim();
            const isNextDate = /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}$/.test(nextText);
            const isNextMethod = /^(recruitment|deputation|promotion|transfer|direct|contract|absorption)\s*$/i.test(nextText);
            if (nextText.length >= 6 && !isNextDate && !isNextMethod)
              rawTitleOverride = `${nextText} – ${bestText}`;
          }
        }
      }

      const rawTitle = rawTitleOverride || titleEl.text().replace(/\s+/g, " ").trim();
      if (rawTitle.length < 12 || rawTitle.length > 300) return;
      // Skip pure-number counter cells
      if (/^\d+$/.test(rawTitle)) return;
      if (SKIP_TEXT.test(rawTitle)) return;

      const key = rawTitle.toLowerCase().substring(0, 60);
      if (seen.has(key)) return;
      seen.add(key);

      let href = "";
      if (sel.selfLink && $(el).is("a")) {
        href = $(el).attr("href") || "";
      } else {
        // Prefer the "Details" link in the row over the first link
        const detailsLink = $(el).find("a[href*='career'], a[href*='recruit'], a[href*='notif'], a[href*='vacancy'], a[href*='job'], a[href*='advt']").first();
        const firstLink = $(el).find("a").first();
        const linkEl = detailsLink.length ? detailsLink : firstLink;
        href = linkEl.attr("href") || titleEl.closest("a").attr("href") || "";
      }
      if (!href) href = pageUrl;  // fallback for linkless rows (e.g. Employment News)
      if (SKIP_HREF.test(href)) return;

      const context = $(el).text();
      jobs.push(buildJob(rawTitle, href, context, pageUrl));
    });

    const valid = jobs.filter(j => j.title.length >= 12);
    if (valid.length >= 3) return valid.slice(0, 50);
  }
  return [];
}

/* ─── Strategy 2: Universal link extraction fallback ─────────────────── */
function universalLinkExtraction($: CheerioStatic, pageUrl: string): any[] {
  const jobs: any[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    if (isNavElement($, el)) return;

    const href = $(el).attr("href") || "";
    if (SKIP_HREF.test(href)) return;

    // Get text — prefer text inside h2/h3/h4 child, else direct text
    const innerHeading = $(el).find("h1,h2,h3,h4").first().text().trim();
    const directText = $(el).text().trim();
    const title = (innerHeading || directText).replace(/\s+/g, " ");

    if (title.length < 12 || title.length > 280) return;
    if (SKIP_TEXT.test(title)) return;
    if (seen.has(title.toLowerCase())) return;

    // Must look like a job notification (keyword filter)
    const isJobLike = /recruit|vacanc|notif|post|job|hiring|opening|appoint|exam|result|admit|syllabus|sarkari|naukri|भर्ती|नियुक्ति|రిక్రూట్|నోటిఫికేషన్|నియామక/i.test(title + href);
    if (!isJobLike && title.split(" ").length < 5) return;

    seen.add(title.toLowerCase());

    // Context = parent element text
    const parent = $(el).parent();
    const context = parent.text() + " " + $(el).closest("li, div, tr").text();

    jobs.push(buildJob(title, href, context, pageUrl));
  });

  return jobs.slice(0, 50);
}

/* ─── Main extract ────────────────────────────────────────────────────── */
function extractJobs($: CheerioStatic, pageUrl: string): any[] {
  // Remove noise: scripts, styles, nav, footer, ads
  $("script, style, nav, footer, header, .advertisement, .ads, [class*='ad-'], [id*='ad-']").remove();

  const structured = tryStructuredSelectors($, pageUrl);
  if (structured.length >= 3) return structured;

  // Fallback: universal link scan
  const universal = universalLinkExtraction($, pageUrl);
  if (universal.length > 0) return universal;

  return [];
}

/* ─── Public API ──────────────────────────────────────────────────────── */
async function fetchPage(url: string, loose = false): Promise<string> {
  const { data } = await axios.get(url, {
    headers: HEADERS,
    timeout: 25000,
    maxRedirects: 5,
    ...(loose ? { httpsAgent: LOOSE_TLS_AGENT } : {}),
  });
  return data;
}

export async function scrapeHTML(url: string, retryCount = 3): Promise<any[]> {
  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      // First try normal, then fall back to permissive TLS (needed for many .gov.in sites)
      let html: string;
      try {
        html = await fetchPage(url, false);
      } catch (tlsErr: any) {
        if (/certificate|TLS|SSL|handshake|CERT/i.test(tlsErr.message)) {
          html = await fetchPage(url, true);
        } else {
          throw tlsErr;
        }
      }
      const $ = cheerio.load(html);
      return extractJobs($, url);
    } catch (err: any) {
      if (attempt === retryCount) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return [];
}
