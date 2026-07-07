import express from "express";
import { getJobs, deleteJob, deleteJobsMany, deleteAllJobs, exportJobs, exportAICTEJobs } from "../controllers/job.controller";

const router = express.Router();

router.get("/jobs", getJobs);
router.get("/jobs/export", exportJobs);
router.get("/jobs/export/aicte", exportAICTEJobs);
router.delete("/jobs/all", deleteAllJobs);
router.delete("/jobs/bulk", deleteJobsMany);
router.delete("/jobs/:id", deleteJob);

export default router;
