import axios from "axios";
import * as cheerio from "cheerio";
type CheerioStatic = ReturnType<typeof cheerio.load>;
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

function extractBetweenLabel($: CheerioStatic, label: string): string {
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
    // Extract explicit preview URLs present inside scripts (these are static strings)
    const scriptMatches = scriptText.match(/https?:\/\/onlinecourses\.swayam2\.ac\.in\/[A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-]+)*\/preview/g) || [];
    for (const m of Array.from(new Set(scriptMatches))) {
      seen.add(m);
    }
  }

  const courseUrls = Array.from(seen).slice(0, 200);
  if (!courseUrls.length) return [];

  for (const cu of courseUrls) {
    try {
      let dhtml = await fetchHtml(cu);
      let $$ = cheerio.load(dhtml);

      // If server HTML is mostly empty (client-rendered), use headless browser to render
      const bodyText = $$('body').text().replace(/\s+/g, ' ').trim();
      if (bodyText.length < 80) {
        try {
          let puppeteer: any = null;
          if (!process.env.VERCEL) {
            try {
              puppeteer = await import('puppeteer');
              puppeteer = puppeteer.default ?? puppeteer;
            } catch {
              puppeteer = null;
            }
          }

          if (puppeteer) {
            const browser = await puppeteer.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            });
            const page = await browser.newPage();
            await page.setUserAgent(HEADERS['User-Agent']);
            await page.goto(cu, { waitUntil: 'networkidle2', timeout: 30000 });
            // give client scripts a bit more time to populate content
            await new Promise(r=>setTimeout(r, 1200));

            // try to extract structured fields directly from rendered page
            const rendered = await page.evaluate(() => {
            const textOf = (el: Element | null) => el ? (el.textContent||'').trim() : '';
            const findByLabel = (lbl: string) => {
              const nodes = Array.from(document.querySelectorAll('*')).filter(n=> (n.textContent||'').toUpperCase().includes(lbl.toUpperCase()));
              if (!nodes.length) return '';
              const n = nodes[0] as Element;
              if (n.nextElementSibling) return textOf(n.nextElementSibling);
              const strong = Array.from(n.querySelectorAll('strong,b')).find(s=> (s.textContent||'').toUpperCase().includes(lbl.toUpperCase()));
              if (strong) return textOf(strong.parentElement);
              return textOf(n).replace(new RegExp(lbl, 'i'), '').trim();
            };

            const title = textOf(document.querySelector('h1') || document.querySelector('h2')) || document.title || '';
            const instructorNode = Array.from(document.querySelectorAll('*')).find(e=> (e.textContent||'').trim().startsWith('By')) as Element | undefined;
            const instructor = instructorNode ? ((instructorNode.textContent||'').replace(/^By\s*/i,'').trim()) : '';
            const intended = findByLabel('INTENDED AUDIENCE');
            const align = findByLabel('Indicative Program Alignments');
            const body = (document.body && document.body.innerText) || '';
            const ld = (body.match(/Enrollment Ends?[:\s]+([^\n]{4,50})/i) || [])[1] || '';
            return { title, instructor, intended, align, lastDate: ld };
          });

          // if we got significant rendered text, use it; otherwise fall back to raw HTML parse
            if (rendered && (rendered.title || rendered.intended || rendered.lastDate)) {
              // incorporate into $$ by injecting minimal HTML to allow downstream selectors
              dhtml = await page.content();
              $$ = cheerio.load(dhtml);
              // stash extracted fields onto $$ namespace by setting variables (we'll reuse rendered values below)
              ($$ as any).__rendered = rendered;
            } else {
              dhtml = await page.content();
              $$ = cheerio.load(dhtml);
            }

            await browser.close();
          }
        } catch (err) {
          // fallback: keep original $$
        }
      }

      // Check for rendered payload from puppeteer
      const rendered: any = ($$ as any).__rendered || null;
      const title = (rendered && rendered.title) || $$('h1, h2').first().text().trim() || $$('title').text().trim();
      const instructor = (rendered && rendered.instructor) || $$('*:contains("By")').filter((_, e) => $$(e).text().trim().startsWith('By')).first().text().replace(/^By\s*/i, '').trim();
      const org = $$('meta[name="author"]').attr('content') || $$('a[href*="/institute"], .institute, .provider').first().text().trim();
      const pageText = $$('body').text();

      const intended = (rendered && rendered.intended) || (extractBetweenLabel($$, 'INTENDED AUDIENCE') || (pageText.match(/INTENDED AUDIENCE[:\s]*([A-Za-z0-9,\.\s]+)/i) || [])[1] || '').replace(/[:\n]+/g,'').trim();
      const align = (rendered && rendered.align) || (extractBetweenLabel($$, 'Indicative Program Alignments') || (pageText.match(/Indicative Program Alignments[:\s]*([A-Za-z0-9,\.,\-\s]+)/i) || [])[1] || '').replace(/[:\n]+/g,'').trim();
      const lastDate = (rendered && rendered.lastDate) || parseDateFromText(pageText) || '';

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
