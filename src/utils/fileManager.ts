import { connectDB } from "./db";
import { JobModel, WebsiteModel, LogModel, SchedulerModel } from "../models/schemas";

const DEFAULT_SCHEDULER = {
  enabled: true,
  cronExpression: "22 17 * * *",
  lastRun: null as string | null,
  nextRun: null as string | null,
  retryCount: 3,
  retryDelay: 5000,
};

export const FileManager = {
  async getJobs(): Promise<any[]> {
    await connectDB();
    return JobModel.find({}).select("-_id -__v").lean() as Promise<any[]>;
  },

  async saveJobs(data: any[]): Promise<void> {
    await connectDB();
    if (!data.length) {
      await JobModel.deleteMany({});
      return;
    }
    const ids = data.map((j) => j.id).filter(Boolean);
    const ops: any[] = data.map((job) => ({
      updateOne: {
        filter: { id: job.id },
        update: { $set: job },
        upsert: true,
      },
    }));
    await (JobModel.bulkWrite as any)(ops, { ordered: false });
    if (ids.length) await JobModel.deleteMany({ id: { $nin: ids } });
  },

  async getWebsites(): Promise<any[]> {
    await connectDB();
    return WebsiteModel.find({}).select("-_id -__v").lean() as Promise<any[]>;
  },

  async saveWebsites(data: any[]): Promise<void> {
    await connectDB();
    await WebsiteModel.deleteMany({});
    if (data.length) await WebsiteModel.insertMany(data, { ordered: false } as any);
  },

  async getLogs(): Promise<any[]> {
    await connectDB();
    return LogModel.find({}).select("-_id -__v").sort({ startTime: -1 }).lean() as Promise<any[]>;
  },

  async saveLogs(data: any[]): Promise<void> {
    await connectDB();
    await LogModel.deleteMany({});
    if (data.length) await LogModel.insertMany(data, { ordered: false } as any);
  },

  async getScheduler(): Promise<any> {
    await connectDB();
    const doc = await SchedulerModel.findOne({ key: "config" }).select("-_id -__v -key").lean();
    return doc || { ...DEFAULT_SCHEDULER };
  },

  async saveScheduler(data: any): Promise<void> {
    await connectDB();
    const { key: _k, ...rest } = data;
    await SchedulerModel.updateOne(
      { key: "config" },
      { $set: { ...rest, key: "config" } },
      { upsert: true }
    );
  },
};
