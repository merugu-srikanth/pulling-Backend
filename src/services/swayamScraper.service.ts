import axios from "axios";
import * as cheerio from "cheerio";
import { v4 as uuidv4 } from "uuid";
import https from "https";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const LOOSE_TLS_AGENT = new https.Agent({ rejectUnauthorized: false });

export function isSwayamUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h.includes("swayam.gov.in") || h.includes("swayam2.ac.in") || h.includes("onlinecourses.swayam2.ac.in");
  } catch { return false; }
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 20000 });
    return data;
  } catch (err: any) {
    // fallback to looser TLS agent for some gov hosts
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 20000, httpsAgent: LOOSE_TLS_AGENT });
    return data;
  }
}

function parseDateFromText(text: string): string {
  const m1 = text.match(/Enrollment Ends?[:\s]+([^\n\r<]{4,40})/i);
  if (m1) return m1[1].trim();
  const m2 = text.match(/Enrollment[:\s]+([A-Za-z0-9 ,\-\/]+to[ A-Za-z0-9,\-\/]+)/i);
  if (m2) return m2[1].trim();
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const mm = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i);
  if (mm) return mm[0];
  return "";
}

function extractBetweenLabel($: cheerio.CheerioAPI, label: string): string {
  // Find element containing the label text, then read next siblings / paragraphs
  const el = $(`*:contains("${label}")`).filter((_, e) => $(e).text().trim().toUpperCase().includes(label)).first();
  if (!el || !el.length) return "";
  const next = el.next();
  if (next && next.length) return next.text().replace(/\s+/g, " ").trim();
  // fallback: look for strong or b inside parent
  const strong = el.parent().find('strong, b').filter((_, s) => $(s).text().toUpperCase().includes(label)).first();
  if (strong && strong.length) return strong.parent().text().replace(label, '').trim();
  return "";
}

export async function scrapeSwayam(listUrl: string): Promise<any[]> {
  // Attempt to collect course links from explorer page (and optionally follow "load more" endpoints)
  const jobs: any[] = [];
  const seen = new Set<string>();

  let html = "";
  try { html = await fetchHtml(listUrl); } catch (err) { return []; }
  const $ = cheerio.load(html);

  // Strategy A: anchor links to preview/course pages (onlinecourses.swayam2.ac.in)
  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href')||'').trim();
    if (!href) return;
    if (/onlinecourses\.swayam2\.ac\.in|\/e-learning\/preview|\/course\//i.test(href)) {
      const u = resolveUrl(href, listUrl);
      seen.add(u);
    }
  });

  // Strategy B: look for JS-driven load-more XHR endpoints inside scripts
  if (seen.size < 5) {
    const scriptText = $('script').map((i, s) => $(s).html() || '').get().join('\n');
    const apiUrls = Array.from(new Set((scriptText.match(/https?:\\/\\/[^'"\s\)]+/g) || []).map(s => s.replace(/\\/g, ''))));
    for (const candidate of apiUrls) {
      if (/explorer|onlinecourses|preview|search|course|api/i.test(candidate)) {
        try {
          const data = await axios.get(candidate, { headers: { ...HEADERS, Accept: 'application/json' }, timeout: 10000 }).then(r => r.data).catch(() => null);
          if (data) {
            // attempt to find urls inside returned JSON
            const s = JSON.stringify(data);
            const matches = s.match(/https?:\\/\\/[^\"]+/g) || [];
            matches.forEach(m => {
              const u = m.replace(/\\/g,'');
              if (/onlinecourses\.swayam2\.ac\.in|swayam2|swayam\.gov\.in|preview|course\//i.test(u)) seen.add(u);
            });
          }
        } catch (_) {}
      }
    }
  }

  const courseUrls = Array.from(seen).slice(0, 200);
  if (!courseUrls.length) return [];

  for (const cu of courseUrls) {
    try {
      const dhtml = await fetchHtml(cu);
      const $$ = cheerio.load(dhtml);

      const title = $$('h1, h2').first().text().trim() || $$('title').text().trim();
      const instructor = $$('*:contains("By")').filter((_, e) => $$(e).text().trim().startsWith('By')).first().text().replace(/^By\s*/i, '').trim();
      const org = $$('meta[name="author"]').attr('content') || $$('a[href*="/institute"], .institute, .provider').first().text().trim();
      const bodyText = $$.text();

      const intended = (extractBetweenLabel($$, 'INTENDED AUDIENCE') || (bodyText.match(/INTENDED AUDIENCE[:\s]*([A-Za-z0-9,\.\s]+)/i) || [])[1] || '').replace(/[:\n]+/g,'').trim();
      const align = (extractBetweenLabel($$, 'Indicative Program Alignments') || (bodyText.match(/Indicative Program Alignments[:\s]*([A-Za-z0-9,\.,\-\s]+)/i) || [])[1] || '').replace(/[:\n]+/g,'').trim();
      const lastDate = parseDateFromText(bodyText) || '';

      // filter out expired if possible
      let isExpired = false;
      if (lastDate) {
        const parsed = Date.parse(lastDate);
        if (!isNaN(parsed)) isExpired = parsed < Date.now();
      }
      if (isExpired) continue;

      const job = {
        id: uuidv4(),
        title: title || 'Swayam Course',
        organization: org || 'Swayam',
        vacancies: 0,
        qualification: intended || 'UG, PG',
        lastDate: lastDate || 'See course page',
        applyLink: cu,
        source: new URL(cu).hostname.replace('www.', ''),
        scrapedAt: new Date().toISOString(),
        instructor: instructor || '',
        programAlignments: align || '',
      };

      jobs.push(job);
    } catch (err) {
      // ignore individual course errors
    }
  }

  return jobs;
}

// Simple resolver for relative URLs
function resolveUrl(href: string, base: string): string {
  try { return new URL(href, base).href; } catch { return href; }
}
