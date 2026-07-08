import express from "express";
import { getJobs, getJobSources, deleteJob, deleteJobsMany, deleteAllJobs, exportJobs, exportAICTEJobs, exportNPTELJobs } from "../controllers/job.controller";

const router = express.Router();

router.get("/jobs", getJobs);
router.get("/jobs/sources", getJobSources);
router.get("/jobs/export", exportJobs);
router.get("/jobs/export/aicte", exportAICTEJobs);
router.get("/jobs/export/nptel", exportNPTELJobs);
router.delete("/jobs/all", deleteAllJobs);
router.delete("/jobs/bulk", deleteJobsMany);
router.delete("/jobs/:id", deleteJob);

export default router;
