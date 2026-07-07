import express from "express";
import multer from "multer";
import path from "path";
import { getWebsites, addWebsite, deleteWebsite, uploadWebsites } from "../controllers/website.controller";

const upload = multer({ dest: path.join(__dirname, "../data/uploads/") });
const router = express.Router();

router.get("/websites", getWebsites);
router.post("/websites", addWebsite);
router.delete("/websites/:id", deleteWebsite);
router.post("/websites/upload", upload.single("file"), uploadWebsites);

export default router;
