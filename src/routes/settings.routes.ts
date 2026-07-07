import express from "express";
import { getSettings, updateSettings } from "../controllers/settings.controller";

const router = express.Router();

router.get("/settings", getSettings);
router.put("/settings", updateSettings);

export default router;
