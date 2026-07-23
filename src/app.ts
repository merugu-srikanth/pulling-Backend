import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import scrapeRoutes from "./routes/scrape.routes";
import websiteRoutes from "./routes/website.routes";
import jobRoutes from "./routes/job.routes";
import settingsRoutes from "./routes/settings.routes";
import kanbanRoutes from "./routes/kanban.routes";
import authRoutes from "./routes/auth.routes";
import { authMiddleware, permissionMiddleware } from "./middleware/auth.middleware";

import { connectDB } from "./utils/db";

const app = express();

// Allow cross-origin requests from any origin and handle preflight explicitly
app.use(cors({ origin: true, credentials: true }));
app.options("*", cors({ origin: true, credentials: true }));

// Ensure CORS headers are present on all responses (defensive for serverless platforms)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );
  // Allow credentials if needed
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure Database connection is established for serverless environments (e.g. Vercel)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error: any) {
    console.error("[MongoDB] Connection middleware failed:", error.message);
    res.status(500).json({ error: "Database connection failed." });
  }
});

/* ─── Swagger Spec ────────────────────────────────────────────────────────── */
const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Government Vacancy Scraper API",
    version: "1.0.0",
    description:
      "REST API for scraping government job vacancies and AICTE internships. Supports website management, job listing, bulk export, and scheduler settings.",
    contact: { email: "merugusrikanth28@gmail.com" },
  },
  servers: [
    { url: "https://apicareerpull.vercel.app", description: "Production" },
    { url: "http://localhost:5000", description: "Local Development" },
  ],
  tags: [
    { name: "Stats", description: "Dashboard statistics" },
    { name: "Websites", description: "Manage scraping targets" },
    { name: "Scrape", description: "Trigger scraping jobs" },
    { name: "Jobs", description: "Browse and export collected job data" },
    { name: "Logs", description: "Scraping activity logs" },
    { name: "Settings", description: "Scheduler configuration" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["Stats"],
        summary: "Health check",
        responses: {
          200: {
            description: "Server is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" },
                    time: { type: "string", example: "2026-07-07T00:00:00.000Z" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats": {
      get: {
        tags: ["Stats"],
        summary: "Get dashboard statistics",
        responses: {
          200: {
            description: "Stats object",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    totalWebsites: { type: "integer" },
                    activeWebsites: { type: "integer" },
                    failedWebsites: { type: "integer" },
                    totalJobs: { type: "integer" },
                    jobsToday: { type: "integer" },
                    successRate: { type: "integer" },
                    lastRun: { type: "string", nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/websites": {
      get: {
        tags: ["Websites"],
        summary: "List all websites",
        responses: {
          200: {
            description: "Array of website objects",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Website" } },
              },
            },
          },
        },
      },
      post: {
        tags: ["Websites"],
        summary: "Add a new website to scrape",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string", example: "https://internship.aicte-india.org/recentlyposted.php" },
                  name: { type: "string", example: "AICTE Internships" },
                  type: { type: "string", example: "auto" },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Website created",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Website" } } },
          },
        },
      },
    },
    "/api/websites/upload": {
      post: {
        tags: ["Websites"],
        summary: "Bulk upload websites from Excel file",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: { type: "object", properties: { file: { type: "string", format: "binary" } } },
            },
          },
        },
        responses: {
          200: {
            description: "Upload result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { added: { type: "integer" }, skipped: { type: "integer" } },
                },
              },
            },
          },
        },
      },
    },
    "/api/websites/{id}": {
      delete: {
        tags: ["Websites"],
        summary: "Delete a website by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Deleted",
            content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } },
          },
        },
      },
    },
    "/api/scrape/all": {
      post: {
        tags: ["Scrape"],
        summary: "Trigger scraping on all active websites",
        responses: {
          200: {
            description: "Scrape results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    total: { type: "integer" },
                    success: { type: "integer" },
                    failed: { type: "integer" },
                    newJobs: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/scrape/{id}": {
      post: {
        tags: ["Scrape"],
        summary: "Trigger scraping on a single website",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Scrape result" },
          500: { description: "Scrape failed" },
        },
      },
    },
    "/api/jobs": {
      get: {
        tags: ["Jobs"],
        summary: "List collected jobs with pagination and search",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "search", in: "query", schema: { type: "string" }, description: "Search by title or organization" },
          { name: "source", in: "query", schema: { type: "string" }, description: "Filter by source domain" },
        ],
        responses: {
          200: {
            description: "Paginated jobs list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    jobs: { type: "array", items: { $ref: "#/components/schemas/Job" } },
                    total: { type: "integer" },
                    page: { type: "integer" },
                    limit: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/jobs/export": {
      get: {
        tags: ["Jobs"],
        summary: "Download all jobs as Excel file",
        responses: {
          200: {
            description: "Excel file download",
            content: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/export/aicte": {
      get: {
        tags: ["Jobs"],
        summary: "Download AICTE internships as Excel (portal format)",
        description:
          "Exports only AICTE-sourced internships with portal-specific columns: company_name, internship_type, internship_title, domain_sector, location, state, district_city, duration, start_date, stipend, stipend_category, no_of_credits, openings, posted_on, last_date_to_apply, view_details_link",
        responses: {
          200: {
            description: "AICTE Excel file download",
            content: {
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
        },
      },
    },
    "/api/jobs/all": {
      delete: {
        tags: ["Jobs"],
        summary: "Delete all jobs",
        responses: {
          200: {
            description: "All jobs deleted",
            content: { "application/json": { schema: { type: "object", properties: { deleted: { type: "integer" } } } } },
          },
        },
      },
    },
    "/api/jobs/bulk": {
      delete: {
        tags: ["Jobs"],
        summary: "Delete multiple jobs by IDs",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["ids"],
                properties: { ids: { type: "array", items: { type: "string" } } },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Jobs deleted",
            content: { "application/json": { schema: { type: "object", properties: { deleted: { type: "integer" } } } } },
          },
        },
      },
    },
    "/api/jobs/{id}": {
      delete: {
        tags: ["Jobs"],
        summary: "Delete a single job by ID",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Job deleted",
            content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" } } } } },
          },
        },
      },
    },
    "/api/logs": {
      get: {
        tags: ["Logs"],
        summary: "Get recent scraping logs (last 100 entries)",
        responses: {
          200: {
            description: "Array of log entries",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Log" } },
              },
            },
          },
        },
      },
    },
    "/api/settings": {
      get: {
        tags: ["Settings"],
        summary: "Get scheduler settings",
        responses: {
          200: {
            description: "Scheduler config",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Settings" } } },
          },
        },
      },
      put: {
        tags: ["Settings"],
        summary: "Update scheduler settings",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/Settings" } } },
        },
        responses: {
          200: {
            description: "Updated settings",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Settings" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Website: {
        type: "object",
        properties: {
          id: { type: "string" },
          url: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          status: { type: "string", enum: ["active", "error"] },
          lastScraped: { type: "string", nullable: true },
          jobsFound: { type: "integer" },
          errorMessage: { type: "string", nullable: true },
        },
      },
      Job: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          organization: { type: "string" },
          vacancies: { type: "integer" },
          qualification: { type: "string" },
          lastDate: { type: "string" },
          applyLink: { type: "string" },
          source: { type: "string" },
          scrapedAt: { type: "string" },
          internshipType: { type: "string", nullable: true },
          location: { type: "string", nullable: true },
          startDate: { type: "string", nullable: true },
          duration: { type: "string", nullable: true },
          stipend: { type: "string", nullable: true },
          numberOfCredits: { type: "string", nullable: true },
          numberOfOpenings: { type: "string", nullable: true },
          postedDate: { type: "string", nullable: true },
        },
      },
      Log: {
        type: "object",
        properties: {
          id: { type: "string" },
          websiteId: { type: "string" },
          websiteName: { type: "string" },
          status: { type: "string", enum: ["success", "error"] },
          jobsFound: { type: "integer" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          error: { type: "string", nullable: true },
        },
      },
      Settings: {
        type: "object",
        properties: {
          enabled: { type: "boolean" },
          intervalHours: { type: "integer" },
          lastRun: { type: "string", nullable: true },
          nextRun: { type: "string", nullable: true },
        },
      },
    },
  },
};

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "Vacancy Scraper API",
    customCss: ".swagger-ui .topbar { background-color: #1e40af; }",
  })
);

app.get("/api-docs.json", (_req, res) => res.json(swaggerSpec));

/* ─── Routes ──────────────────────────────────────────────────────────────── */
app.use("/api", authRoutes);
app.use("/api", authMiddleware, permissionMiddleware);
app.use("/api", scrapeRoutes);
app.use("/api", websiteRoutes);
app.use("/api", jobRoutes);
app.use("/api", settingsRoutes);
app.use("/api", kanbanRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

export default app;
