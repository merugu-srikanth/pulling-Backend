export interface Job {
  id: string;
  title: string;
  organization: string;
  vacancies: number;
  qualification: string;
  lastDate: string;
  applyLink: string;
  source: string;
  scrapedAt: string;
}

export interface Website {
  id: string;
  url: string;
  name: string;
  type: "html" | "xml" | "auto";
  status: "active" | "inactive" | "error";
  lastScraped: string | null;
  jobsFound: number;
  errorMessage: string | null;
}

export interface ScrapeLog {
  id: string;
  websiteId: string;
  websiteUrl: string;
  startTime: string;
  endTime: string | null;
  status: "running" | "success" | "failed";
  jobsFound: number;
  errorMessage: string | null;
}

export interface SchedulerConfig {
  enabled: boolean;
  cronExpression: string;
  lastRun: string | null;
  nextRun: string | null;
  retryCount: number;
  retryDelay: number;
}
