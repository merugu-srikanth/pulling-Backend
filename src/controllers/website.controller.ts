import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { FileManager } from "../utils/fileManager";
import { parseWebsitesExcel } from "../services/export.service";

export const getWebsites = (_req: Request, res: Response) => {
  res.json(FileManager.getWebsites());
};

export const addWebsite = (req: Request, res: Response) => {
  const websites = FileManager.getWebsites();
  const newSite = {
    id: uuidv4(),
    url: req.body.url,
    name: req.body.name || new URL(req.body.url).hostname,
    type: req.body.type || "auto",
    status: "active",
    lastScraped: null,
    jobsFound: 0,
    errorMessage: null,
  };
  websites.push(newSite);
  FileManager.saveWebsites(websites);
  res.status(201).json(newSite);
};

export const deleteWebsite = (req: Request, res: Response) => {
  const websites = FileManager.getWebsites();
  const filtered = websites.filter((w: any) => w.id !== req.params.id);
  FileManager.saveWebsites(filtered);
  res.json({ success: true });
};

export const uploadWebsites = (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const newSites = parseWebsitesExcel(req.file.path);
    const existing = FileManager.getWebsites();
    const existingUrls = new Set(existing.map((w: any) => w.url));
    const toAdd = newSites.filter((s: any) => !existingUrls.has(s.url));
    FileManager.saveWebsites([...existing, ...toAdd]);
    res.json({ added: toAdd.length, skipped: newSites.length - toAdd.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
