import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { FileManager } from "../utils/fileManager";
import { parseWebsitesExcel } from "../services/export.service";

export const updateWebsite = async (req: Request, res: Response) => {
  try {
    const updated = await FileManager.updateWebsite(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getWebsites = async (_req: Request, res: Response) => {
  res.json(await FileManager.getWebsites());
};

export const addWebsite = async (req: Request, res: Response) => {
  const websites = await FileManager.getWebsites();
  const newSite = {
    id: uuidv4(),
    url: req.body.url,
    name: req.body.name || new URL(req.body.url).hostname,
    type: req.body.type || "auto",
    status: "active",
    lastScraped: null,
    jobsFound: 0,
    errorMessage: null,
    autoScrape: true,
  };
  websites.push(newSite);
  await FileManager.saveWebsites(websites);
  res.status(201).json(newSite);
};

export const deleteWebsite = async (req: Request, res: Response) => {
  const websites = await FileManager.getWebsites();
  const filtered = websites.filter((w: any) => w.id !== req.params.id);
  await FileManager.saveWebsites(filtered);
  res.json({ success: true });
};

export const deleteAllWebsites = async (_req: Request, res: Response) => {
  try {
    await FileManager.saveWebsites([]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const uploadWebsites = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const newSites = parseWebsitesExcel(req.file.path);
    const existing = await FileManager.getWebsites();
    const existingUrls = new Set(existing.map((w: any) => w.url));
    const toAdd = newSites.filter((s: any) => !existingUrls.has(s.url));
    await FileManager.saveWebsites([...existing, ...toAdd]);
    res.json({ added: toAdd.length, skipped: newSites.length - toAdd.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
