import axios from "axios";
import * as cheerio from "cheerio";
import { v4 as uuidv4 } from "uuid";

const BASE = "https://nptel.ac.in";
const CONCURRENCY = 8;   // simultaneous requests for course detail pages
const BATCH_DELAY = 200; // ms between batches

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/json,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
};

export function isNptelUrl(url: string): boolean {
  try { return new URL(url).hostname.endsWith("nptel.ac.in"); } catch { return false; }
}

/* ─── SvelteKit dedup resolver ──────────────────────────────────────────── */
function sv(data: any[], idx: any): any {
  return typeof idx === "number" && idx >= 0 && idx < data.length ? data[idx] : idx;
}

/* ─── Step 1: Decode course listing from /courses/__data.json ────────────── */
function decodeListing(raw: any): any[] {
  const node = raw?.nodes?.[1];
  if (!node) return [];
  const data: any[] = node.data ?? [];
  if (!data.length) return [];

  const root = data[0];
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];

  // Discipline id → name map
  const discMap: Record<number, string> = {};
  const discRefs = sv(data, root.disciplines);
  if (Array.isArray(discRefs)) {
    for (const dRef of discRefs) {
      const d = sv(data, dRef);
      if (d && typeof d === "object") {
        const id = sv(data, d.id);
        const name = sv(data, d.name) || sv(data, d.disciplineName);
        if (id != null && name) discMap[Number(id)] = String(name);
      }
    }
  }

  const courseRefs = sv(data, root.courses);
  if (!Array.isArray(courseRefs)) return [];

  return courseRefs.map((ref: number) => {
    const obj = sv(data, ref);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const disciplineId = sv(data, obj.disciplineId);
    return {
      courseId:       String(sv(data, obj.id)            ?? ""),
      title:          String(sv(data, obj.title)          ?? ""),
      instituteName:  String(sv(data, obj.instituteName)  ?? ""),
      professor:      String(sv(data, obj.professor)      ?? ""),
      contentType:    String(sv(data, obj.contentType)    ?? ""),
      noccourse:      Boolean(sv(data, obj.noccourse)),
      selfPaced:      Boolean(sv(data, obj.selfPaced)),
      currentRun:     Boolean(sv(data, obj.currentRun)),
      disciplineId,
      disciplineName: discMap[disciplineId] ?? "",
    };
  }).filter(Boolean);
}

/* ─── Step 2: Parse dates from certificationHtml ────────────────────────── */
interface CourseDates {
  courseDuration:  string; // "Jul-Oct 2026"
  enrollmentStart: string; // "2026-05-22"
  enrollmentEnd:   string; // "2026-07-27"
  examRegStart:    string; // "2026-06-20"
  examRegEnd:      string; // "2026-08-14"
  examDate:        string; // "October 18, 2026"
  duration:        string; // "12 weeks"
  credits:         string;
  level:           string;
  language:        string;
  hasActiveReg:    boolean;
}

function parseCertHtml(html: string): CourseDates {
  const result: CourseDates = {
    courseDuration: "", enrollmentStart: "", enrollmentEnd: "",
    examRegStart: "", examRegEnd: "", examDate: "",
    duration: "", credits: "", level: "", language: "",
    hasActiveReg: false,
  };
  if (!html) return result;

  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ");

  // Exam date: "Date and Time of Exams: <b> October 18, 2026</b>"
  const examMatch = html.match(/Date and Time of Exams[:\s]*<b[^>]*>\s*([^<]+)<\/b>/i)
    || text.match(/Date and Time of Exams[:\s]+([A-Za-z]+ \d{1,2},?\s+\d{4})/i);
  if (examMatch) result.examDate = examMatch[1].trim();

  // Course duration label: "Jul-Oct 2026" or "Jan-Apr 2026"
  const durLabel = text.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[-–](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/i);
  if (durLabel) result.courseDuration = durLabel[0].trim();

  // YYYY-MM-DD date ranges (enrollment, exam registration)
  const isoRanges = [...text.matchAll(/(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/g)];
  if (isoRanges[0]) { result.enrollmentStart = isoRanges[0][1]; result.enrollmentEnd = isoRanges[0][2]; }
  if (isoRanges[1]) { result.examRegStart    = isoRanges[1][1]; result.examRegEnd    = isoRanges[1][2]; }

  // Labeled fallbacks
  if (!result.enrollmentStart) {
    const m = text.match(/Enrollment[:\s]+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    if (m) { result.enrollmentStart = m[1]; result.enrollmentEnd = m[2]; }
  }
  if (!result.examRegStart) {
    const m = text.match(/Exam\s+Registration[:\s]+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    if (m) { result.examRegStart = m[1]; result.examRegEnd = m[2]; }
  }

  // Detect if registration is actually open (not just "announcements will be made")
  const noRegYet = /announcements will be made|form is open for registrations|will be notified/i.test(text);
  result.hasActiveReg = !noRegYet && (!!result.enrollmentStart || !!result.examDate);

  return result;
}

/* ─── Step 3: Fetch individual course detail page ────────────────────────── */
async function fetchDetail(courseId: string): Promise<{ dates: CourseDates; meta: Record<string, string> }> {
  const empty: CourseDates = {
    courseDuration: "", enrollmentStart: "", enrollmentEnd: "",
    examRegStart: "", examRegEnd: "", examDate: "",
    duration: "", credits: "", level: "", language: "", hasActiveReg: false,
  };
  try {
    const { data: raw } = await axios.get(`${BASE}/courses/${courseId}/__data.json`, {
      headers: { ...HEADERS, Accept: "application/json" },
      timeout: 12000,
    });

    const node = raw?.nodes?.[1];
    if (!node) return { dates: empty, meta: {} };
    const data: any[] = node.data ?? [];

    // Navigate: data[0].courseOutline → courseObj → courseObj.syllabus → syllabusObj
    const pageRoot = data[0];
    const courseObj = sv(data, pageRoot?.courseOutline);
    const syllabusObj = sv(data, courseObj?.syllabus);

    // Get certificationHtml directly from syllabus
    let certHtml: string = "";
    const rawCertHtml = sv(data, syllabusObj?.certificationHtml);
    if (typeof rawCertHtml === "string") {
      certHtml = rawCertHtml;
    } else {
      // Fallback: brute-force search for the certification HTML block
      let maxLen = 0;
      for (const item of data) {
        if (typeof item === "string" && item.length > maxLen &&
           (item.includes("Date and Time") || item.includes("proctored") ||
            item.includes("enrollment") || item.includes("certificate"))) {
          certHtml = item;
          maxLen = item.length;
        }
      }
    }

    // Decode meta array from syllabusObj.meta (labels: Duration, Credits, Level, Type, Language)
    const meta: Record<string, string> = {};
    const metaArr = sv(data, syllabusObj?.meta);
    if (Array.isArray(metaArr)) {
      for (const itemRef of metaArr) {
        const item = sv(data, itemRef);
        if (item && typeof item === "object") {
          const label = String(sv(data, item.label) ?? "").toLowerCase().trim();
          const value = String(sv(data, item.value) ?? "").trim();
          if (label && value) meta[label] = value;
        }
      }
    }

    return { dates: parseCertHtml(certHtml), meta };
  } catch {
    return { dates: empty, meta: {} };
  }
}

/* ─── Concurrency-limited batch fetcher ─────────────────────────────────── */
async function fetchAllDetails(courseIds: string[]): Promise<Map<string, { dates: CourseDates; meta: Record<string, string> }>> {
  const results = new Map<string, { dates: CourseDates; meta: Record<string, string> }>();

  for (let i = 0; i < courseIds.length; i += CONCURRENCY) {
    const batch = courseIds.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(batch.map(id => fetchDetail(id).then(r => ({ id, r }))));
    settled.forEach(({ id, r }) => results.set(id, r));

    const done = Math.min(i + CONCURRENCY, courseIds.length);
    console.log(`[NPTEL] Details: ${done}/${courseIds.length}`);

    if (done < courseIds.length) await new Promise(r => setTimeout(r, BATCH_DELAY));
  }

  return results;
}

/* ─── Build job object ───────────────────────────────────────────────────── */
function toJob(c: any, dates: CourseDates, meta: Record<string, string>): any {
  const titleClean = (c.title || "").replace(/^NOC:/, "").trim();
  const dur = meta["duration"] || dates.duration || "";
  const level = meta["level"] || dates.level || "";

  return {
    id:            uuidv4(),
    title:         c.title || titleClean || `NPTEL Course ${c.courseId}`,
    organization:  c.instituteName || "NPTEL",
    vacancies:     0,
    qualification: [level, dur].filter(Boolean).join(" | ") || "As per course",
    lastDate:      dates.enrollmentEnd || dates.examDate || "See course page",
    applyLink:     `${BASE}/courses/${c.courseId}`,
    source:        "nptel.ac.in",
    scrapedAt:     new Date().toISOString(),
    // NPTEL-specific
    professor:       c.professor       || "",
    discipline:      c.disciplineName  || "",
    contentType:     c.contentType     || "",
    noccourse:       c.noccourse       ?? false,
    selfPaced:       c.selfPaced       ?? false,
    currentRun:      c.currentRun      ?? false,
    courseId:        c.courseId        || "",
    // Dates
    courseDuration:  dates.courseDuration  || "",
    enrollmentStart: dates.enrollmentStart || "",
    enrollmentEnd:   dates.enrollmentEnd   || "",
    examRegStart:    dates.examRegStart    || "",
    examRegEnd:      dates.examRegEnd      || "",
    examDate:        dates.examDate        || "",
    // Meta
    duration:  meta["duration"]  || "",
    credits:   meta["credits"]   || "",
    level:     meta["level"]     || "",
    language:  meta["language"]  || "",
    courseType: meta["type"]     || "",
  };
}

/* ─── Main export ────────────────────────────────────────────────────────── */
export async function scrapeNPTEL(_url: string): Promise<any[]> {
  const today = new Date().toISOString().split("T")[0];
  // Vercel free tier kills functions after 10s — skip detail fetching there
  const isVercel = !!process.env.VERCEL;

  // ── Phase 1: get all courses from listing ──
  console.log("[NPTEL] Fetching course listing...");
  let courses: any[] = [];
  try {
    const { data: raw } = await axios.get(`${BASE}/courses/__data.json`, {
      headers: { ...HEADERS, Accept: "application/json" },
      timeout: isVercel ? 8000 : 30000,
    });
    courses = decodeListing(raw);
    console.log(`[NPTEL] Listing decoded: ${courses.length} courses`);
  } catch (err: any) {
    console.warn("[NPTEL] Listing API failed:", err.message);
  }

  // ── HTML fallback (gets 50-100 visible cards) ──
  if (courses.length === 0) {
    console.log("[NPTEL] HTML fallback...");
    const { data: html } = await axios.get(`${BASE}/courses`, { headers: HEADERS, timeout: isVercel ? 7000 : 30000 });
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const m = href.match(/^\/courses\/(\d+)$/);
      if (!m || seen.has(m[1])) return;
      seen.add(m[1]);
      const parts: string[] = [];
      $(el).contents().each((_, node) => {
        const t = node.type === "text"
          ? ((node as any).data || "").replace(/\s+/g, " ").trim()
          : $(node).text().replace(/\s+/g, " ").trim();
        if (t) parts.push(t);
      });
      const filtered = parts.filter(p => p !== "Enroll Now");
      courses.push({
        courseId: m[1], title: filtered[0] || `NPTEL Course ${m[1]}`,
        instituteName: filtered[3] || "NPTEL", professor: filtered[2] || "",
        disciplineName: filtered[1] || "", contentType: "",
        noccourse: (filtered[0] || "").startsWith("NOC:"),
        selfPaced: false, currentRun: false,
      });
    });
    console.log(`[NPTEL] HTML got ${courses.length} courses`);
  }

  if (!courses.length) return [];

  // ── Vercel mode: listing only (no detail pages — 10s function limit) ──
  if (isVercel) {
    const active = courses.filter((c: any) => c.currentRun || c.selfPaced);
    console.log(`[NPTEL] Vercel mode: ${active.length} active/self-paced courses (no date enrichment)`);
    return active.map((c: any) => toJob(c, {} as CourseDates, {}));
  }

  // ── Phase 2: fetch individual course details for dates (local only) ──
  console.log(`[NPTEL] Fetching details for ${courses.length} courses (${CONCURRENCY} concurrent)...`);
  const courseIds = courses.map((c: any) => c.courseId).filter(Boolean);
  const detailMap = await fetchAllDetails(courseIds);

  // ── Phase 3: build jobs, keep only active/upcoming ──
  const jobs: any[] = [];
  for (const c of courses) {
    const { dates, meta } = detailMap.get(c.courseId) || { dates: {} as CourseDates, meta: {} };

    // Filter: skip courses where enrollment already closed
    if (dates.enrollmentEnd && dates.enrollmentEnd < today) continue;
    // Also skip if registration not active AND examDate is in the past
    if (!dates.hasActiveReg && dates.examDate) {
      const parsed = new Date(dates.examDate);
      if (!isNaN(parsed.getTime()) && parsed < new Date()) continue;
    }

    jobs.push(toJob(c, dates || ({} as CourseDates), meta || {}));
  }

  console.log(`[NPTEL] ${jobs.length} active courses with upcoming enrollment/exam`);
  return jobs;
}
