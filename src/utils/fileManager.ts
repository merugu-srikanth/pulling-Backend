import { connectDB } from "./db";
import { JobModel, WebsiteModel, LogModel, SchedulerModel } from "../models/schemas";

const DATE_FIELDS = ["lastDate", "startDate", "examDate", "enrollmentStart", "enrollmentEnd", "examRegStart", "examRegEnd"];

const DEFAULT_SCHEDULER = {
  enabled: true,
  cronExpression: "22 17 * * *",
  lastRun: null as string | null,
  nextRun: null as string | null,
  retryCount: 3,
  retryDelay: 5000,
};

export const FileManager = {
  async getJobs(opts: { search?: string; source?: string; page?: number; limit?: number; opportunityCategory?: string } = {}): Promise<{ jobs: any[]; total: number }> {
    await connectDB();
    const { search, source, page = 1, limit = 20, opportunityCategory } = opts;
    const filter: any = {};
    if (source) filter.source = source;
    if (search) {
      const re = new RegExp(search, "i");
      filter.$or = [{ title: re }, { organization: re }];
    }

    const internshipTypes = ["Internship", "Student Training", "Research Internship", "Project Training", "Student Project", "Fellowship", "Apprenticeship", "Trainee", "Other Student Opportunity"];
    if (opportunityCategory === "internship") {
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { opportunityType: { $in: internshipTypes } },
          { internshipType: { $exists: true, $ne: null } }
        ]
      });
    } else if (opportunityCategory === "job") {
      filter.$and = filter.$and || [];
      filter.$and.push({
        opportunityType: { $nin: internshipTypes },
        internshipType: { $exists: false }
      });
    }

    const [jobs, total] = await Promise.all([
      JobModel.find(filter).select("-_id -__v").skip((page - 1) * limit).limit(limit).lean(),
      JobModel.countDocuments(filter),
    ]);
    return { jobs: jobs as any[], total };
  },

  async getAllJobs(): Promise<any[]> {
    await connectDB();
    return JobModel.find({}).select("-_id -__v").lean() as Promise<any[]>;
  },

  async countJobs(filter: any = {}): Promise<number> {
    await connectDB();
    return JobModel.countDocuments(filter);
  },

  async getJobSources(): Promise<string[]> {
    await connectDB();
    const sources = await JobModel.distinct("source");
    return sources.filter(Boolean).sort() as string[];
  },

  async deleteJobById(id: string): Promise<void> {
    await connectDB();
    await JobModel.deleteOne({ id });
  },

  async deleteJobsByIds(ids: string[]): Promise<number> {
    await connectDB();
    const result = await JobModel.deleteMany({ id: { $in: ids } });
    return result.deletedCount;
  },

  async deleteAllJobDocs(): Promise<number> {
    await connectDB();
    const result = await JobModel.deleteMany({});
    return result.deletedCount;
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

  async smartSaveJobs(newJobs: any[]): Promise<void> {
    await connectDB();
    if (!newJobs.length) return;

    const withId    = newJobs.filter((j) => j.id);
    const withoutId = newJobs.filter((j) => !j.id);
    const ops: any[] = [];

    if (withId.length) {
      const ids = withId.map((j) => j.id);
      const existingDocs = await JobModel.find({ id: { $in: ids } }).lean();
      const existingMap = new Map((existingDocs as any[]).map((d) => [d.id, d]));

      for (const job of withId) {
        const existing = existingMap.get(job.id) as any;

        if (!existing) {
          ops.push({
            updateOne: {
              filter: { id: job.id },
              update: { $set: { ...job, isUpdated: false, updatedFields: [], previousValues: {} } },
              upsert: true,
            },
          });
        } else {
          const changedFields = DATE_FIELDS.filter(
            (f) => job[f] && existing[f] && job[f] !== existing[f]
          );

          if (changedFields.length > 0) {
            const previousValues = Object.fromEntries(changedFields.map((f) => [f, existing[f]]));
            ops.push({
              updateOne: {
                filter: { id: job.id },
                update: { $set: { ...job, isUpdated: true, updatedFields: changedFields, previousValues } },
              },
            });
          } else if (existing.isUpdated) {
            // Dates now stable after a previous change — clear the flag
            ops.push({
              updateOne: {
                filter: { id: job.id },
                update: { $set: { isUpdated: false, updatedFields: [], previousValues: {} } },
              },
            });
          }
          // else: completely unchanged — skip
        }
      }
    }

    if (withoutId.length) {
      const titles = withoutId.map((j) => j.title).filter(Boolean);
      const existingByTitle = await JobModel.find({ title: { $in: titles } }).lean();
      const existingTitles = new Set((existingByTitle as any[]).map((d) => d.title?.toLowerCase()));

      for (const job of withoutId) {
        if (!existingTitles.has(job.title?.toLowerCase())) {
          ops.push({
            insertOne: {
              document: { ...job, isUpdated: false, updatedFields: [], previousValues: {} },
            },
          });
        }
      }
    }

    if (ops.length > 0) {
      await (JobModel.bulkWrite as any)(ops, { ordered: false });
    }
  },

  async updateWebsite(id: string, data: Partial<any>): Promise<any> {
    await connectDB();
    return WebsiteModel.findOneAndUpdate(
      { id },
      { $set: data },
      { new: true, lean: true, projection: { __v: 0 } }
    );
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
