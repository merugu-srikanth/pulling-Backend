import { Request, Response } from "express";
import { FileManager } from "../utils/fileManager";
import { updateScheduler } from "../services/scheduler.service";

export const getSettings = (_req: Request, res: Response) => {
  res.json(FileManager.getScheduler());
};

export const updateSettings = (req: Request, res: Response) => {
  try {
    const updated = updateScheduler(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
