import axios from "axios";
import * as cheerio from "cheerio";
import { v4 as uuidv4 } from "uuid";

const BASE = "https://nptel.ac.in";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/json,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
};

export function isNptelUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("nptel.ac.in");
  } catch {
    return false;
  }
}

// Decode SvelteKit __data.json deduplication format
// Values are stored once in a flat `data` array; object fields hold integer indices into that array
function decodeSvelteKit(raw: any): any[] {
  const node = raw?.nodes?.[1];
  if (!node) return [];
  const data: any[] = node.data;
  if (!Array.isArray(data) || !data.length) return [];

  const val = (idx: any): any =>
    typeof idx === "number" && idx >= 0 && idx < data.length ? data[idx] : idx;

  const root = data[0];
  if (!root || typeof root !== "object" || Array.isArray(root)) return [];

  // Build discipline id → name map
  const disciplineMap: Record<number, string> = {};
  const discsIdx = root.disciplines;
  if (typeof discsIdx === "number") {
    const discs = val(discsIdx);
    if (Array.isArray(discs)) {
      discs.forEach((dRef: number) => {
        const d = val(dRef);
        if (d && typeof d === "object") {
          const id = val(d.id);
          const name = val(d.name) || val(d.disciplineName);
          if (id != null && name) disciplineMap[id] = String(name);
        }
      });
    }
  }

  const courseRefs = val(root.courses);
  if (!Array.isArray(courseRefs)) return [];

  return courseRefs.map((ref: number) => {
    const obj = val(ref);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const disciplineId = val(obj.disciplineId);
    return {
      courseId:      String(val(obj.id) ?? ""),
      title:         String(val(obj.title) ?? ""),
      instituteName: String(val(obj.instituteName) ?? ""),
      professor:     String(val(obj.professor) ?? ""),
      contentType:   String(val(obj.contentType) ?? ""),
      noccourse:     Boolean(val(obj.noccourse)),
      selfPaced:     Boolean(val(obj.selfPaced)),
      currentRun:    Boolean(val(obj.currentRun)),
      disciplineId,
      disciplineName: disciplineMap[disciplineId] ?? "",
    };
  }).filter(Boolean);
}

function toJob(c: any): any {
  return {
    id:            uuidv4(),
    title:         c.title || `NPTEL Course ${c.courseId}`,
    organization:  c.instituteName || "NPTEL",
    vacancies:     0,
    qualification: "As per course requirement",
    lastDate:      "See notification",
    applyLink:     `${BASE}/courses/${c.courseId}`,
    source:        "nptel.ac.in",
    scrapedAt:     new Date().toISOString(),
    // NPTEL-specific fields
    professor:     c.professor     || "",
    discipline:    c.disciplineName || "",
    contentType:   c.contentType   || "",
    noccourse:     c.noccourse     ?? false,
    selfPaced:     c.selfPaced     ?? false,
    currentRun:    c.currentRun    ?? false,
    courseId:      c.courseId      || "",
  };
}

async function scrapeViaApi(): Promise<any[]> {
  const { data: raw } = await axios.get(`${BASE}/courses/__data.json`, {
    headers: { ...HEADERS, Accept: "application/json" },
    timeout: 30000,
  });
  const courses = decodeSvelteKit(raw);
  if (courses.length === 0) throw new Error("No courses decoded from __data.json");
  return courses.map(toJob);
}

async function scrapeViaHtml(): Promise<any[]> {
  const { data: html } = await axios.get(`${BASE}/courses`, {
    headers: HEADERS,
    timeout: 30000,
  });
  const $ = cheerio.load(html);
  const jobs: any[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const m = href.match(/^\/courses\/(\d+)$/);
    if (!m) return;
    const courseId = m[1];
    if (seen.has(courseId)) return;
    seen.add(courseId);

    // Collect text from each direct child node in order
    const parts: string[] = [];
    $(el).contents().each((_, node) => {
      const t = node.type === "text"
        ? ((node as any).data || "").replace(/\s+/g, " ").trim()
        : $(node).text().replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
    });

    const filtered = parts.filter(p => p !== "Enroll Now");
    const title       = filtered[0] || `NPTEL Course ${courseId}`;
    const discipline  = filtered[1] || "";
    const professor   = filtered[2] || "";
    const institution = filtered[3] || "";

    jobs.push(toJob({
      courseId, title, instituteName: institution || "NPTEL",
      professor, disciplineName: discipline,
      contentType: "", noccourse: title.startsWith("NOC:"),
      selfPaced: false, currentRun: false,
    }));
  });

  return jobs;
}

export async function scrapeNPTEL(url: string): Promise<any[]> {
  console.log("[NPTEL] Trying __data.json API...");
  try {
    const jobs = await scrapeViaApi();
    console.log(`[NPTEL] API success: ${jobs.length} courses`);
    return jobs;
  } catch (err: any) {
    console.warn("[NPTEL] API failed, falling back to HTML:", err.message);
  }

  console.log("[NPTEL] HTML scraping...");
  const jobs = await scrapeViaHtml();
  console.log(`[NPTEL] HTML: ${jobs.length} courses`);
  return jobs;
}
