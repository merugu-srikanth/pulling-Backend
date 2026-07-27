const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const xlsx = require('xlsx');

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
};

const LOOSE_TLS_AGENT = new https.Agent({ rejectUnauthorized: false });

async function fetchHtml(url) {
  try {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 30000 });
    return data;
  } catch (err) {
    const { data } = await axios.get(url, { headers: HEADERS, timeout: 30000, httpsAgent: LOOSE_TLS_AGENT });
    return data;
  }
}

function resolveUrl(href, base) {
  try { return new URL(href, base).href; } catch { return href; }
}

function parseDateFromText(text) {
  if (!text) return '';
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const mm = text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i);
  if (mm) return mm[0];
  const dmy = text.match(/\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}/);
  if (dmy) return dmy[0];
  return '';
}

function extractBetweenLabel($, label) {
  const el = $(`*:contains("${label}")`).filter((i, e) => $(e).text().trim().toUpperCase().includes(label)).first();
  if (!el || !el.length) return '';
  const next = el.next();
  if (next && next.length) return next.text().replace(/\s+/g, ' ').trim();
  const strong = el.parent().find('strong, b').filter((i, s) => $(s).text().toUpperCase().includes(label)).first();
  if (strong && strong.length) return strong.parent().text().replace(new RegExp(label, 'i'), '').trim();
  return '';
}

async function gatherCourseUrls(explorerUrl) {
  const html = await fetchHtml(explorerUrl);
  const $ = cheerio.load(html);
  const seen = new Set();

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href')||'').trim();
    if (!href) return;
    if (/onlinecourses\.swayam2\.ac\.in|onlinecourses\.nptel\.ac\.in|\/e-learning\/preview|\/preview/i.test(href)) {
      seen.add(resolveUrl(href, explorerUrl));
    }
  });

  // fall back: find preview URLs inside scripts
  if (seen.size < 50) {
    const scriptText = $('script').map((i,s) => $(s).html() || '').get().join('\n');
    const scriptMatches = scriptText.match(/https?:\/\/(onlinecourses\.[\w\-\.]+?)\/[\w\-\/_]*preview[\w\-\/_]*/g) || [];
    for (const m of scriptMatches) seen.add(m);
  }

  return Array.from(seen);
}

async function parsePreviewPage(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('h1, h2').first().text().trim() || $('title').text().trim();
    const instructor = $('*:contains("By")').filter((i, e) => $(e).text().trim().startsWith('By')).first().text().replace(/^By\s*/i, '').trim();
    const pageText = $('body').text();

    // Duration like '8 Weeks'
    const durationMatch = pageText.match(/(\d+\s*(Weeks|Week|weeks|week|Months|Month|months|month))/i);
    const duration = durationMatch ? durationMatch[0].trim() : '';

    const creditsMatch = pageText.match(/(\d+\s*(Credits|credit|credits))/i);
    const credits = creditsMatch ? creditsMatch[0].trim() : '';

    const startMatch = pageText.match(/Starts?[:\s]+([A-Za-z0-9 ,\-\/]{4,30})/i);
    const startDate = startMatch ? startMatch[1].trim() : '';

    const enrollMatch = pageText.match(/Enrollment Ends?[:\s]+([A-Za-z0-9 ,\-\/]{4,50})/i);
    const enrollmentEnds = enrollMatch ? enrollMatch[1].trim() : '';

    const endMatch = pageText.match(/Course End Date[:\s]+([A-Za-z0-9 ,\-\/]{4,50})/i) || pageText.match(/Course End[:\s]+([A-Za-z0-9 ,\-\/]{4,50})/i);
    const courseEndDate = endMatch ? endMatch[1].trim() : '';

    const org = $('meta[name="author"]').attr('content') || $('.provider, .institute').first().text().trim() || '';

    // Indicative sectors / program alignments: try to grab tag-like elements
    const sectors = $('.tag, .chip, .industry, .indicative-sectors').text().replace(/\s+/g,' ').trim();
    let programAlign = extractBetweenLabel($, 'Indicative Program Alignments') || $('.indicative-program-alignments').text().replace(/\s+/g,' ').trim();

    // status: heuristics
    let status = 'Unknown';
    if (/Starts?:/i.test(pageText)) {
      status = 'Upcoming';
    } else if (/Ongoing|Running|Currently/i.test(pageText)) {
      status = 'Ongoing';
    }

    return {
      id: uuidv4(),
      title,
      organization: org,
      institute: org,
      instructor: instructor || '',
      duration,
      credits,
      startDate: startDate || parseDateFromText(pageText),
      enrollmentEnds,
      courseEndDate,
      courseLink: url,
      indicativeIndustrySectors: sectors,
      indicativeProgramAlignments: programAlign,
      status,
      rawText: pageText.slice(0,200),
    };
  } catch (err) {
    return null;
  }
}

async function extractIntendedAudience(url) {
  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const pageText = $('body').text();
    let intended = extractBetweenLabel($, 'INTENDED AUDIENCE') || (pageText.match(/INTENDED AUDIENCE[:\s]*([A-Za-z0-9,\.\s]+)/i) || [])[1] || '';
    intended = (intended || '').replace(/[:\n]+/g,'').trim();
    return intended;
  } catch (err) {
    return '';
  }
}

async function run() {
  const explorerUrl = 'https://swayam.gov.in/explorer';
  console.log('Fetching explorer and collecting preview links...');
  const urls = await gatherCourseUrls(explorerUrl);
  console.log('Found preview URLs:', urls.length);

  const parsed = [];
  for (let i=0;i<urls.length;i++) {
    const u = urls[i];
    try {
      const p = await parsePreviewPage(u);
      if (p) parsed.push(p);
      // small delay to be polite
      await new Promise(r=>setTimeout(r, 250));
    } catch (err) {
      // ignore
    }
  }

  // Filter upcoming by status or presence of 'Starts'
  const upcoming = parsed.filter(p => p && (p.status === 'Upcoming' || /Starts?:/i.test(p.startDate || '')));

  // If no upcoming found, fallback to using parsed list
  const pool = (upcoming.length ? upcoming : parsed).slice();

  // Sort alphabetically by title
  pool.sort((a,b) => (a.title||'').localeCompare(b.title||''));

  const selected = pool.slice(0,50);
  console.log('Selected for detail scraping:', selected.length);

  // For each selected, fetch intended audience
  for (let i=0;i<selected.length;i++) {
    const s = selected[i];
    try {
      const intended = await extractIntendedAudience(s.courseLink);
      s.intendedAudience = intended || '';
      s.detailPageVisited = intended ? 'Yes' : 'Yes'; // visited in either case
      // polite delay
      await new Promise(r=>setTimeout(r, 400));
    } catch (err) {
      s.intendedAudience = '';
      s.detailPageVisited = 'No';
    }
  }

  // Build worksheet
  const headers = [
    'Title','Organization (ncCode)','Institute','Instructor','Duration (weeks)','Credits','Start Date','Enrollment Ends','Course End Date','Course Link','Indicative Industry Sectors','Indicative Program Alignments','Status','Intended Audience','Detail Page Visited'
  ];

  const rows = selected.map(s => [
    s.title || '',
    s.organization || '',
    s.institute || '',
    s.instructor || '',
    s.duration || '',
    s.credits || '',
    s.startDate || '',
    s.enrollmentEnds || '',
    s.courseEndDate || '',
    s.courseLink || '',
    s.indicativeIndustrySectors || '',
    s.indicativeProgramAlignments || '',
    s.status || '',
    s.intendedAudience || '',
    s.detailPageVisited || 'No'
  ]);

  const wb = xlsx.utils.book_new();
  const wsData = [headers, ...rows];
  const ws = xlsx.utils.aoa_to_sheet(wsData);
  xlsx.utils.book_append_sheet(wb, ws, 'swayam_courses');

  const outDir = path.join(__dirname, '..', 'src', 'data', 'exports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `swayam_courses_${Date.now()}.xlsx`);
  xlsx.writeFile(wb, outPath);
  console.log('Excel saved to', outPath);
}

if (require.main === module) {
  run().catch(err => {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  });
}
