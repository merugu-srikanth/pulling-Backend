import { Request, Response } from "express";
import { FileManager } from "../utils/fileManager";
import { exportJobsToExcel, exportAICTEInternshipsToExcel } from "../services/export.service";

export const getJobs = (req: Request, res: Response) => {
  let jobs = FileManager.getJobs();

  const { search, source, page = "1", limit = "20" } = req.query;

  if (search) {
    const q = String(search).toLowerCase();
    jobs = jobs.filter(
      (j: any) =>
        j.title?.toLowerCase().includes(q) ||
        j.organization?.toLowerCase().includes(q)
    );
  }

  if (source) {
    jobs = jobs.filter((j: any) => j.source === source);
  }

  const total = jobs.length;
  const pageNum = parseInt(String(page), 10);
  const limitNum = parseInt(String(limit), 10);
  const paginated = jobs.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  res.json({ jobs: paginated, total, page: pageNum, limit: limitNum });
};

export const deleteJob = (req: Request, res: Response) => {
  const jobs = FileManager.getJobs();
  FileManager.saveJobs(jobs.filter((j: any) => j.id !== req.params.id));
  res.json({ success: true });
};

export const deleteJobsMany = (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array required" });
  }
  const idSet = new Set(ids);
  const jobs = FileManager.getJobs();
  const remaining = jobs.filter((j: any) => !idSet.has(j.id));
  FileManager.saveJobs(remaining);
  res.json({ deleted: jobs.length - remaining.length });
};

export const deleteAllJobs = (_req: Request, res: Response) => {
  const jobs = FileManager.getJobs();
  FileManager.saveJobs([]);
  res.json({ deleted: jobs.length });
};

export const getJobSources = (_req: Request, res: Response) => {
  const jobs = FileManager.getJobs();
  const sources = [...new Set(jobs.map((j: any) => j.source).filter(Boolean))].sort();
  res.json(sources);
};

export const exportJobs = (req: Request, res: Response) => {
  try {
    let jobs = FileManager.getJobs();
    const { source } = req.query;
    if (source) jobs = jobs.filter((j: any) => j.source === String(source));
    const filePath = exportJobsToExcel(jobs);
    res.download(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const exportAICTEJobs = (req: Request, res: Response) => {
  try {
    let jobs = FileManager.getJobs();
    const { source } = req.query;
    if (source) jobs = jobs.filter((j: any) => j.source === String(source));
    const filePath = exportAICTEInternshipsToExcel(jobs);
    res.download(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
