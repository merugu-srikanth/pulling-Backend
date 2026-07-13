import express from "express";
import multer from "multer";
import path from "path";
import { getWebsites, addWebsite, deleteWebsite, uploadWebsites, updateWebsite } from "../controllers/website.controller";

const UPLOAD_DIR = process.env.VERCEL ? "/tmp/scraper-uploads" : path.join(__dirname, "../data/uploads");
const upload = multer({ dest: UPLOAD_DIR });
const router = express.Router();

router.get("/websites", getWebsites);
router.post("/websites", addWebsite);
router.patch("/websites/:id", updateWebsite);
router.delete("/websites/:id", deleteWebsite);
router.post("/websites/upload", upload.single("file"), uploadWebsites);

export default router;
