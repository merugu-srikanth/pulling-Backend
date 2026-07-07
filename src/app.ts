import express from "express";
import cors from "cors";
import scrapeRoutes from "./routes/scrape.routes";
import websiteRoutes from "./routes/website.routes";
import jobRoutes from "./routes/job.routes";
import settingsRoutes from "./routes/settings.routes";

const app = express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", scrapeRoutes);
app.use("/api", websiteRoutes);
app.use("/api", jobRoutes);
app.use("/api", settingsRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

export default app;
