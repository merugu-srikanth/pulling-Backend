import express from "express";
import { scrapeOne, scrapeAllWebsites, getLogs, getStats } from "../controllers/scrape.controller";

const router = express.Router();

router.get("/stats", getStats);
router.get("/logs", getLogs);
router.post("/scrape/all", scrapeAllWebsites);
router.post("/scrape/:id", scrapeOne);

export default router;
