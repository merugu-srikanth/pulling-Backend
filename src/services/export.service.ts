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

  const exportDir = path.join(__dirname, "../data/exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const filename = `aicte_internships_${Date.now()}.xlsx`;
  const filePath = path.join(exportDir, filename);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

export function exportJobsToExcel(jobs: any[]): string {
  const rows = jobs.map((j) => ({
    Title: j.title,
    Organization: j.organization,
    Vacancies: j.vacancies,
    Qualification: j.qualification,
    "Last Date": j.lastDate,
    "Apply Link": j.applyLink,
    Source: j.source,
    "Scraped At": j.scrapedAt,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws["!cols"] = [
    { wch: 50 }, { wch: 30 }, { wch: 12 }, { wch: 20 },
    { wch: 15 }, { wch: 40 }, { wch: 25 }, { wch: 22 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Jobs");

  const exportDir = path.join(__dirname, "../data/exports");
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const filename = `jobs_${Date.now()}.xlsx`;
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
