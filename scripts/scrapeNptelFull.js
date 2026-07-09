#!/usr/bin/env node
/**
 * NPTEL Comprehensive Course Scraper
 *
 * Run from the backend folder:
 *   node scripts/scrapeNptelFull.js
 *
 * Output:
 *   nptel_all_courses.xlsx  (written next to this script)
 *
 * What it does:
 *   Phase 1 – Fetch listing API  (1 request)  → all ~912 courses
 *   Phase 2 – Per-course: fetch __data.json + HTML page concurrently
 *             → dates, abstract, YouTube URL, certificate type
 *   Phase 3 – Fetch Syllabus tab page per course (best-effort)
 *   Phase 4 – Write single Excel file with 30 columns
 */

const axios   = require("axios");
const cheerio = require("cheerio");
const XLSX    = require("xlsx");
const path    = require("path");
const fs      = require("fs");

/* ── Config ────────────────────────────────────────────────────────────── */
const BASE         = "https://nptel.ac.in";
const CONCURRENCY  = 6;    // parallel requests per batch
const BATCH_DELAY  = 350;  // ms between batches (be polite)
// Save to project root (one level up from backend/)
const OUTPUT       = path.join(__dirname, "../../nptel_all_courses.xlsx");

const HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/json,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
};

/* ── SvelteKit dedup helpers ───────────────────────────────────────────── */
function sv(data, idx) {
  return typeof idx === "number" && idx >= 0 && idx < data.length ? data[idx] : idx;
}

function svStr(data, idx) {
  const v = sv(data, idx);
  return v != null ? String(v) : "";
}

/* ── Phase 1: Decode listing __data.json ───────────────────────────────── */
function decodeListing(raw) {
  const node = raw?.nodes?.[1];
  if (!node) return [];
  const data = node.data ?? [];
  if (!data.length) return [];

  const root = data[0];
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];

  // Build discipline id → name map
  const discMap = {};
  const discRefs = sv(data, root.disciplines);
  if (Array.isArray(discRefs)) {
    for (const dRef of discRefs) {
      const d = sv(data, dRef);
      if (d && typeof d === "object" && !Array.isArray(d)) {
        const id   = sv(data, d.id);
        const name = sv(data, d.name) || sv(data, d.disciplineName);
        if (id != null && name) discMap[Number(id)] = String(name);
      }
    }
  }

  const courseRefs = sv(data, root.courses);
  if (!Array.isArray(courseRefs)) return [];

  return courseRefs.map(ref => {
    const obj = sv(data, ref);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const disciplineId = sv(data, obj.disciplineId);
    return {
      courseId:       svStr(data, obj.id),
      title:          svStr(data, obj.title),
      instituteName:  svStr(data, obj.instituteName),
      professor:      svStr(data, obj.professor),
      contentType:    svStr(data, obj.contentType),
      noccourse:      Boolean(sv(data, obj.noccourse)),
      selfPaced:      Boolean(sv(data, obj.selfPaced)),
      currentRun:     Boolean(sv(data, obj.currentRun)),
      disciplineId,
      disciplineName: discMap[disciplineId] ?? "",
    };
  }).filter(Boolean);
}

/* ── Phase 2a: Parse certificationHtml for dates ──────────────────────── */
function parseCertHtml(html) {
  const r = {
    courseDuration: "", enrollmentStart: "", enrollmentEnd: "",
    examRegStart: "", examRegEnd: "", examDate: "", certificateType: "",
    hasActiveReg: false,
  };
  if (!html) return r;

  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ");

  // Exam date formats: "October 18, 2026" or "2026-10-18"
  const examMatch =
    html.match(/Date and Time of Exams[:\s]*<b[^>]*>\s*([^<]+)<\/b>/i) ||
    text.match(/Date and Time of Exams[:\s]+([A-Za-z]+ \d{1,2},?\s+\d{4})/i) ||
    text.match(/Exam Date[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (examMatch) r.examDate = examMatch[1].trim();

  // Course duration label "Jul-Oct 2026"
  const durLabel = text.match(
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-–](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i
  );
  if (durLabel) r.courseDuration = durLabel[0].trim();

  // ISO date ranges (enrollment then exam registration)
  const isoRanges = [...text.matchAll(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/g)];
  if (isoRanges[0]) { r.enrollmentStart = isoRanges[0][1]; r.enrollmentEnd = isoRanges[0][2]; }
  if (isoRanges[1]) { r.examRegStart    = isoRanges[1][1]; r.examRegEnd    = isoRanges[1][2]; }

  // Labeled fallbacks
  if (!r.enrollmentStart) {
    const m = text.match(/Enrollment[:\s]+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    if (m) { r.enrollmentStart = m[1]; r.enrollmentEnd = m[2]; }
  }
  if (!r.examRegStart) {
    const m = text.match(/Exam\s+Registration[:\s]+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    if (m) { r.examRegStart = m[1]; r.examRegEnd = m[2]; }
  }

  // Certificate type (Swayam Certification, Elite+Silver, etc.)
  const certMatch = text.match(/(?:Certificate(?:\s+Type)?|Certification)[:\s]+([^\n.<]{5,80})/i);
  if (certMatch) r.certificateType = certMatch[1].trim();

  r.hasActiveReg = !/announcements will be made|will be notified/i.test(text) &&
    (!!r.enrollmentStart || !!r.examDate);

  return r;
}

/* ── Phase 2b: Parse course __data.json for meta + abstract ───────────── */
function parseDetailJson(raw) {
  const out = { certHtml: "", abstract: "", syllabus: "", meta: {}, youtubeUrl: "" };
  try {
    const node = raw?.nodes?.[1];
    if (!node) return out;
    const data = node.data ?? [];

    // Navigate: data[0].courseOutline → courseObj → courseObj.syllabus → syllabusObj
    const pageRoot = data[0];
    const courseObj = sv(data, pageRoot?.courseOutline);
    const syllabusObj = sv(data, courseObj?.syllabus);

    // Get certificationHtml directly from syllabusObj
    const rawCertHtml = sv(data, syllabusObj?.certificationHtml);
    if (typeof rawCertHtml === "string") {
      out.certHtml = rawCertHtml;
    }

    // Get abstract from syllabusObj.aboutHtml
    const rawAboutHtml = sv(data, syllabusObj?.aboutHtml);
    if (typeof rawAboutHtml === "string" && rawAboutHtml.length > 50) {
      const $ = require("cheerio").load(rawAboutHtml);
      out.abstract = $("body").text().replace(/\s+/g, " ").trim().substring(0, 3000);
    }

    // Decode meta from syllabusObj.meta (Duration, Credits, Level, Type, Language)
    const metaArr = sv(data, syllabusObj?.meta);
    if (Array.isArray(metaArr)) {
      for (const itemRef of metaArr) {
        const item = sv(data, itemRef);
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const label = svStr(data, item.label).toLowerCase().trim();
          const value = svStr(data, item.value).trim();
          if (label && value) out.meta[label] = value;
        }
      }
    }

    // Fallback: brute-force search if certHtml or abstract still missing
    const plainTexts = [];
    for (const item of data) {
      if (typeof item !== "string") continue;

      // YouTube URL in any string
      if (!out.youtubeUrl) {
        const ytMatch = item.match(/(?:youtube\.com\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        if (ytMatch) out.youtubeUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
      }

      // Fallback certHtml if not found via syllabus path
      if (!out.certHtml && item.includes("<") &&
         (item.includes("Date and Time") || item.includes("proctored") ||
          item.includes("enrollment") || item.includes("certificate"))) {
        out.certHtml = item;
      }

      // Collect long plain-text for abstract/syllabus fallback
      if (!out.abstract && item.length > 150 && !item.includes("<") && !item.startsWith("http")) {
        plainTexts.push(item);
      }
    }

    // Use plain text fallbacks if structured extraction didn't get them
    if (!out.abstract && plainTexts.length) {
      plainTexts.sort((a, b) => b.length - a.length);
      out.abstract = plainTexts[0].trim().substring(0, 3000);
      if (plainTexts[1]) out.syllabus = plainTexts[1].trim().substring(0, 4000);
    }
  } catch {}
  return out;
}

/* ── Phase 2c: Parse main HTML page for YouTube URL & abstract ─────────── */
function parseMainHtml(html) {
  const r = { youtubeUrl: "", abstract: "", taList: "", downloads: "", statistics: "" };
  try {
    const $ = cheerio.load(html);

    // YouTube embed iframe
    const ytFrame = $("iframe").filter((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || "";
      return src.includes("youtube") || src.includes("youtu.be");
    }).first();
    if (ytFrame.length) {
      r.youtubeUrl = (ytFrame.attr("src") || ytFrame.attr("data-src") || "").trim();
    }

    // og:video or og:video:url
    if (!r.youtubeUrl) {
      r.youtubeUrl = $('meta[property="og:video"]').attr("content") ||
                     $('meta[property="og:video:url"]').attr("content") || "";
    }

    // Course Abstract section text
    let abstractEl = null;
    $("h2, h3, h4, strong, b").each((_, el) => {
      if (/course abstract/i.test($(el).text())) {
        abstractEl = el;
        return false; // break
      }
    });
    if (abstractEl) {
      // Try the next sibling paragraph/div
      let sibling = $(abstractEl).next();
      while (sibling.length && !sibling.text().trim()) sibling = sibling.next();
      if (sibling.length) {
        r.abstract = sibling.text().replace(/\s+/g, " ").trim().substring(0, 3000);
      }
    }

    // Fallback: meta description
    if (!r.abstract) {
      r.abstract = $('meta[name="description"]').attr("content") ||
                   $('meta[property="og:description"]').attr("content") || "";
    }

    // TA List — rendered as text table/list if available
    let taEl = null;
    $("h2, h3, h4").each((_, el) => {
      if (/TA list|Teaching Assistant/i.test($(el).text())) {
        taEl = el;
        return false;
      }
    });
    if (taEl) {
      r.taList = $(taEl).nextAll("table, ul, p").first().text().replace(/\s+/g, " ").trim().substring(0, 1000);
    }

    // Downloads section
    let dlEl = null;
    $("h2, h3, h4").each((_, el) => {
      if (/downloads?/i.test($(el).text())) {
        dlEl = el;
        return false;
      }
    });
    if (dlEl) {
      r.downloads = $(dlEl).next().text().replace(/\s+/g, " ").trim().substring(0, 500);
    }

    // Statistics
    let statsEl = null;
    $("h2, h3, h4").each((_, el) => {
      if (/statistics/i.test($(el).text())) {
        statsEl = el;
        return false;
      }
    });
    if (statsEl) {
      r.statistics = $(statsEl).next().text().replace(/\s+/g, " ").trim().substring(0, 500);
    }

  } catch {}
  return r;
}

/* ── Phase 3: Parse syllabus tab HTML ─────────────────────────────────── */
function parseSyllabusHtml(html) {
  try {
    const $ = cheerio.load(html);
    // Remove nav, header, footer noise
    $("nav, header, footer, script, style").remove();

    // Look for syllabus content: week list, module list, or main content area
    let text = "";
    const weekEls = $('[class*="week"], [class*="module"], [class*="syllabus"]');
    if (weekEls.length) {
      text = weekEls.text();
    } else {
      // Fallback: anything under a "Syllabus" heading
      $("h2, h3, h4").each((_, el) => {
        if (/syllabus/i.test($(el).text())) {
          text = $(el).nextAll().text();
          return false;
        }
      });
    }

    if (!text) text = $("main, #main, .content, .main-content").first().text();
    return text.replace(/\s+/g, " ").trim().substring(0, 4000);
  } catch {
    return "";
  }
}

/* ── Fetch one course: all pages concurrently ─────────────────────────── */
async function fetchCourse(courseId) {
  const courseUrl = `${BASE}/courses/${courseId}`;
  const empty = {
    courseDuration: "", enrollmentStart: "", enrollmentEnd: "",
    examRegStart: "", examRegEnd: "", examDate: "", certificateType: "",
    duration: "", credits: "", level: "", language: "", courseType: "",
    abstract: "", syllabusText: "", youtubeUrl: "",
    taList: "", statistics: "", downloads: "", toppersNote: "",
    activeReg: false,
  };

  try {
    // Fetch __data.json and main HTML in parallel
    const [jsonRes, htmlRes] = await Promise.allSettled([
      axios.get(`${courseUrl}/__data.json`, {
        headers: { ...HEADERS, Accept: "application/json" },
        timeout: 14000,
      }),
      axios.get(courseUrl, { headers: HEADERS, timeout: 12000 }),
    ]);

    // Process JSON
    const detail  = jsonRes.status === "fulfilled" ? parseDetailJson(jsonRes.value.data) : { certHtml: "", abstract: "", meta: {} };
    const dates   = parseCertHtml(detail.certHtml);
    const htmlOut = htmlRes.status === "fulfilled" ? parseMainHtml(htmlRes.value.data) : {};

    // Fetch syllabus tab (best-effort, don't fail whole course if this 404s)
    let syllabusText = "";
    try {
      const sylRes = await axios.get(`${courseUrl}/syllabus`, {
        headers: HEADERS,
        timeout: 10000,
      });
      syllabusText = parseSyllabusHtml(sylRes.data);
    } catch {}

    return {
      courseDuration:  dates.courseDuration  || "",
      enrollmentStart: dates.enrollmentStart || "",
      enrollmentEnd:   dates.enrollmentEnd   || "",
      examRegStart:    dates.examRegStart    || "",
      examRegEnd:      dates.examRegEnd      || "",
      examDate:        dates.examDate        || "",
      certificateType: dates.certificateType || "",
      activeReg:       dates.hasActiveReg,
      duration:        detail.meta["duration"]  || "",
      credits:         detail.meta["credits"]   || "",
      level:           detail.meta["level"]     || "",
      language:        detail.meta["language"]  || "",
      courseType:      detail.meta["type"]      || "",
      // Abstract: prefer HTML section parse, fallback to __data.json long text
      abstract:        (htmlOut.abstract || detail.abstract || "").substring(0, 3000),
      // Syllabus: prefer dedicated tab fetch, fallback to __data.json plain text, fallback to HTML parse
      syllabusText:    (syllabusText || detail.syllabus || "").substring(0, 4000),
      // YouTube: prefer __data.json embed URL, fallback to HTML iframe
      youtubeUrl:      detail.youtubeUrl || htmlOut.youtubeUrl || "",
      taList:          htmlOut.taList      || "",
      statistics:      htmlOut.statistics  || "",
      downloads:       htmlOut.downloads   || "",
      toppersNote:     "",
    };
  } catch (err) {
    console.warn(`  [skip] ${courseId}: ${err.message}`);
    return empty;
  }
}

/* ── Concurrency-limited batch runner ─────────────────────────────────── */
async function runBatches(items, fn, concurrency, delayMs) {
  const results = new Map();
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.all(batch.map(id => fn(id).then(r => ({ id, r }))));
    settled.forEach(({ id, r }) => results.set(id, r));

    const done = Math.min(i + concurrency, items.length);
    const pct  = ((done / items.length) * 100).toFixed(1);
    process.stdout.write(`\r  Progress: ${done}/${items.length}  (${pct}%)   `);

    if (done < items.length) await new Promise(r => setTimeout(r, delayMs));
  }
  process.stdout.write("\n");
  return results;
}

/* ── Build Excel row ───────────────────────────────────────────────────── */
function buildRow(c, d, scrapedAt) {
  const isActive = c.currentRun || c.selfPaced || d.activeReg || !!d.enrollmentStart;
  return {
    course_id:            c.courseId || "",
    course_title:         (c.title || "").replace(/^NOC:\s*/i, "").trim(),
    course_url:           `${BASE}/courses/${c.courseId}`,
    category_discipline:  c.disciplineName || "",
    course_type:          d.courseType || c.contentType || "",
    institute:            c.instituteName || "",
    instructor:           c.professor || "",
    course_duration:      d.courseDuration || "",
    duration_weeks:       d.duration || "",
    credits:              d.credits || "",
    level:                d.level || "",
    language:             d.language || "",
    enrollment_start:     d.enrollmentStart || "",
    enrollment_end:       d.enrollmentEnd || "",
    exam_reg_start:       d.examRegStart || "",
    exam_reg_end:         d.examRegEnd || "",
    exam_date:            d.examDate || "",
    certificate_type:     d.certificateType || "",
    syllabus:             d.syllabusText || "",
    course_abstract:      d.abstract || "",
    statistics:           d.statistics || "",
    ta_list:              d.taList || "",
    toppers_note:         d.toppersNote || "",
    downloads:            d.downloads || "",
    youtube_intro_url:    d.youtubeUrl || "",
    noc_course:           c.noccourse ? "Yes" : "No",
    self_paced:           c.selfPaced ? "Yes" : "No",
    active_status:        isActive ? "Active" : "Closed",
    enroll_now_link:      `${BASE}/courses/${c.courseId}`,
    scraped_at:           scrapedAt,
  };
}

/* ── Write Excel ──────────────────────────────────────────────────────── */
function writeExcel(rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 14 },  // course_id
    { wch: 55 },  // course_title
    { wch: 50 },  // course_url
    { wch: 30 },  // category_discipline
    { wch: 14 },  // course_type
    { wch: 24 },  // institute
    { wch: 32 },  // instructor
    { wch: 16 },  // course_duration
    { wch: 14 },  // duration_weeks
    { wch: 10 },  // credits
    { wch: 18 },  // level
    { wch: 12 },  // language
    { wch: 18 },  // enrollment_start
    { wch: 18 },  // enrollment_end
    { wch: 18 },  // exam_reg_start
    { wch: 18 },  // exam_reg_end
    { wch: 22 },  // exam_date
    { wch: 22 },  // certificate_type
    { wch: 60 },  // syllabus
    { wch: 60 },  // course_abstract
    { wch: 30 },  // statistics
    { wch: 40 },  // ta_list
    { wch: 20 },  // toppers_note
    { wch: 30 },  // downloads
    { wch: 55 },  // youtube_intro_url
    { wch: 12 },  // noc_course
    { wch: 12 },  // self_paced
    { wch: 14 },  // active_status
    { wch: 50 },  // enroll_now_link
    { wch: 24 },  // scraped_at
  ];

  XLSX.utils.book_append_sheet(wb, ws, "NPTEL Courses");
  XLSX.writeFile(wb, OUTPUT);
}

/* ── Main ─────────────────────────────────────────────────────────────── */
async function main() {
  const start = Date.now();
  console.log("=".repeat(60));
  console.log("NPTEL Comprehensive Scraper");
  console.log(`Output: ${OUTPUT}`);
  console.log("=".repeat(60));

  // Phase 1: Listing
  console.log("\n[Phase 1] Fetching course listing...");
  let courses = [];
  try {
    const { data: raw } = await axios.get(`${BASE}/courses/__data.json`, {
      headers: { ...HEADERS, Accept: "application/json" },
      timeout: 30000,
    });
    courses = decodeListing(raw);
    console.log(`  Found ${courses.length} courses`);
  } catch (err) {
    console.error("  Listing API failed:", err.message);
    process.exit(1);
  }

  if (!courses.length) {
    console.error("  No courses decoded from listing — aborting.");
    process.exit(1);
  }

  // Phase 2+3: Detail pages + Syllabus tab per course
  console.log(`\n[Phase 2+3] Fetching details + syllabus (${CONCURRENCY} concurrent, ~${Math.ceil(courses.length / CONCURRENCY)} batches)...`);
  console.log(`  Estimated time: ${Math.ceil(courses.length / CONCURRENCY * (BATCH_DELAY / 1000 + 1.5))} seconds\n`);

  const courseIds = courses.map(c => c.courseId).filter(Boolean);
  const detailMap = await runBatches(courseIds, fetchCourse, CONCURRENCY, BATCH_DELAY);

  // Build rows
  const scrapedAt = new Date().toISOString();
  const rows = courses.map(c => buildRow(c, detailMap.get(c.courseId) || {}, scrapedAt));

  const activeCount = rows.filter(r => r.active_status === "Active").length;
  console.log(`\n[Result] ${rows.length} total courses (${activeCount} active)`);

  // Write Excel
  console.log(`\n[Phase 4] Writing Excel...`);
  writeExcel(rows);

  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone in ${secs}s  →  ${OUTPUT}`);
  console.log(`Columns: ${Object.keys(rows[0] || {}).length}   Rows: ${rows.length}`);
}

main().catch(err => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
