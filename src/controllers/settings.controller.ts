import { Request, Response } from "express";
import { updateScheduler } from "../services/scheduler.service";
import { FileManager } from "../utils/fileManager";

export const getSettings = async (_req: Request, res: Response) => {
  res.json(await FileManager.getScheduler());
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    const updated = await updateScheduler(req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
