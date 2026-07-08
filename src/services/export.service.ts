import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

export function exportAICTEInternshipsToExcel(jobs: any[]): string {
  const aicteJobs = jobs.filter(
    (j: any) => j.source === "internship.aicte-india.org" && j.internshipType
  );

  const rows = aicteJobs.map((j: any) => {
    // Portal uses "Programme" (British spelling)
    let internshipType = (j.internshipType || "").replace(
      "Up-Skilling/Training Program",
      "Up-Skilling/Training Programme"
    );

    // Derive stipend_category
    const stipend = (j.stipend || "").trim();
    const stipendCategory =
      !stipend || stipend.toLowerCase() === "unpaid" ? "Unpaid" : "Paid";

    return {
      company_name:       j.organization || "",
      internship_type:    internshipType,
      internship_title:   j.title || "",
      domain_sector:      "",
      location:           j.location || "",
      state:              "",
      district_city:      j.location || "",
      duration:           j.duration || "",
      start_date:         j.startDate || "",
      stipend:            stipend,
      stipend_category:   stipendCategory,
      no_of_credits:      j.numberOfCredits || "",
      openings:           j.numberOfOpenings || j.vacancies || "",
      posted_on:          j.postedDate || "",
      last_date_to_apply: j.lastDate || "",
      view_details_link:  j.applyLink || "",
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 32 }, // company_name
    { wch: 28 }, // internship_type
    { wch: 52 }, // internship_title
    { wch: 20 }, // domain_sector
    { wch: 22 }, // location
    { wch: 15 }, // state
    { wch: 22 }, // district_city
    { wch: 12 }, // duration
    { wch: 15 }, // start_date
    { wch: 15 }, // stipend
    { wch: 15 }, // stipend_category
    { wch: 13 }, // no_of_credits
    { wch: 10 }, // openings
    { wch: 15 }, // posted_on
    { wch: 20 }, // last_date_to_apply
    { wch: 72 }, // view_details_link
  ];

  XLSX.utils.book_append_sheet(wb, ws, "AICTE Internships");

  const exportDir = process.env.VERCEL ? "/tmp/scraper-exports" : path.join(__dirname, "../data/exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const filename = `aicte_internships_${Date.now()}.xlsx`;
  const filePath = path.join(exportDir, filename);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

export function exportJobsToExcel(jobs: any[]): string {
  const exportDir = process.env.VERCEL ? "/tmp/scraper-exports" : path.join(__dirname, "../data/exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const PRIORITY = ["title", "organization", "vacancies", "qualification", "lastDate", "applyLink", "source", "scrapedAt",
    "internshipType", "location", "startDate", "duration", "stipend", "stipendCategory", "numberOfCredits", "numberOfOpenings", "postedDate"];

  // Collect every key that appears in ANY job (excluding internal id)
  const allKeys = new Set<string>();
  for (const j of jobs) Object.keys(j).forEach(k => k !== "id" && allKeys.add(k));

  const orderedKeys = [
    ...PRIORITY.filter(k => allKeys.has(k)),
    ...[...allKeys].filter(k => !PRIORITY.includes(k) && k !== "id"),
  ];

  const rows = jobs.map(j => {
    const row: Record<string, any> = {};
    for (const k of orderedKeys) row[k] = j[k] ?? "";
    return row;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: orderedKeys });

  // Auto-width: max 60 chars
  ws["!cols"] = orderedKeys.map(k => ({
    wch: Math.min(60, Math.max(k.length + 4, ...rows.slice(0, 50).map(r => String(r[k] ?? "").length + 2)))
  }));

  XLSX.utils.book_append_sheet(wb, ws, "Jobs");

  const filename = `jobs_${Date.now()}.xlsx`;
  const filePath = path.join(exportDir, filename);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

export function exportNPTELToExcel(jobs: any[]): string {
  const nptelJobs = jobs.filter((j: any) => j.source === "nptel.ac.in");

  const rows = nptelJobs.map((j: any) => ({
    course_id:       j.courseId      || "",
    course_title:    (j.title || "").replace(/^NOC:/, "").trim(),
    professor:       j.professor     || "",
    institution:     j.organization  || "",
    discipline:      j.discipline    || "",
    content_type:    j.contentType   || "",
    noc_course:      j.noccourse     ? "Yes" : "No",
    self_paced:      j.selfPaced     ? "Yes" : "No",
    currently_open:  j.currentRun    ? "Yes" : "No",
    enroll_now_link: j.applyLink     || "",
    scraped_at:      j.scrapedAt     || "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 14 },  // course_id
    { wch: 55 },  // course_title
    { wch: 30 },  // professor
    { wch: 22 },  // institution
    { wch: 28 },  // discipline
    { wch: 14 },  // content_type
    { wch: 12 },  // noc_course
    { wch: 12 },  // self_paced
    { wch: 15 },  // currently_open
    { wch: 60 },  // enroll_now_link
    { wch: 22 },  // scraped_at
  ];

  XLSX.utils.book_append_sheet(wb, ws, "NPTEL Courses");

  const exportDir = process.env.VERCEL ? "/tmp/scraper-exports" : path.join(__dirname, "../data/exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const filename = `nptel_courses_${Date.now()}.xlsx`;
  const filePath = path.join(exportDir, filename);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

export function parseWebsitesExcel(filePath: string): any[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[] = XLSX.utils.sheet_to_json(ws);
  return rows.map((row: any, i: number) => ({
    id: `w${Date.now()}_${i}`,
    url: row.url || row.URL || row.Url || "",
    name: row.name || row.Name || row.site || "",
    type: row.type || "auto",
    status: "active",
    lastScraped: null,
    jobsFound: 0,
    errorMessage: null,
  })).filter((w: any) => w.url);
}
