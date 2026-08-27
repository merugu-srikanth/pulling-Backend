import { Request, Response } from "express";
import { FileManager } from "../utils/fileManager";
import { exportJobsToExcel, exportAICTEInternshipsToExcel, exportNPTELToExcel } from "../services/export.service";

export const getJobs = async (req: Request, res: Response) => {
  const { search, source, page = "1", limit = "20", opportunityCategory } = req.query;
  const { jobs, total } = await FileManager.getJobs({
    search: search ? String(search) : undefined,
    source: source ? String(source) : undefined,
    page: parseInt(String(page), 10),
    limit: parseInt(String(limit), 10),
    opportunityCategory: opportunityCategory ? String(opportunityCategory) : undefined,
  });
  res.json({ jobs, total, page: parseInt(String(page), 10), limit: parseInt(String(limit), 10) });
};

export const deleteJob = async (req: Request, res: Response) => {
  await FileManager.deleteJobById(req.params.id);
  res.json({ success: true });
};

export const deleteJobsMany = async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array required" });
  }
  const deleted = await FileManager.deleteJobsByIds(ids);
  res.json({ deleted });
};

export const deleteAllJobs = async (_req: Request, res: Response) => {
  const deleted = await FileManager.deleteAllJobDocs();
  res.json({ deleted });
};

export const getJobSources = async (_req: Request, res: Response) => {
  const sources = await FileManager.getJobSources();
  res.json(sources);
};

export const exportJobs = async (req: Request, res: Response) => {
  try {
    let jobs = await FileManager.getAllJobs();
    const { source } = req.query;
    if (source) jobs = jobs.filter((j: any) => j.source === String(source));
    const filePath = exportJobsToExcel(jobs);
    res.download(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const exportAICTEJobs = async (req: Request, res: Response) => {
  try {
    let jobs = await FileManager.getAllJobs();
    const { source } = req.query;
    if (source) jobs = jobs.filter((j: any) => j.source === String(source));
    const filePath = exportAICTEInternshipsToExcel(jobs);
    res.download(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const exportNPTELJobs = async (_req: Request, res: Response) => {
  try {
    const jobs = await FileManager.getAllJobs();
    const filePath = exportNPTELToExcel(jobs);
    res.download(filePath);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
