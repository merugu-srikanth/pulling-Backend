import mongoose, { Schema } from "mongoose";

const jobSchema = new Schema({
  id:             { type: String, required: true, unique: true },
  title:          String,
  organization:   String,
  vacancies:      Number,
  qualification:  String,
  lastDate:       String,
  applyLink:      String,
  source:         String,
  scrapedAt:      String,
  
  // Advanced change tracking & cache headers
  rawContentHash:         String,
  cleanContentHash:       String,
  opportunityContentHash: String,
  etag:                   String,
  lastModified:           String,
  firstSeen:              String,
  lastSeen:               String,
  lastVerified:           String,
  lastChanged:            String,
  lastAIProcessed:        String,
  changeType:             { type: String, default: "NEW" },
  isUpdated:              { type: Boolean, default: false },
  previousValues:         { type: Schema.Types.Mixed, default: {} },
  evidence:               { type: Schema.Types.Mixed, default: {} },
  
  // AI status tracking
  aiStatus:               { type: String, enum: ["PENDING", "PROCESSED", "FAILED", "RETRY"], default: "PENDING" },
  retryCount:             { type: Number, default: 0 },
  lastError:              String,

  // UI status, deadline & links
  status:                 String,
  deadline:               String,
  applicationUrl:         String,

  // Legacy/AICTE fields compatibility
  internshipType:    String,
  location:          String,
  state:             String,
  district:          String,
  startDate:         String,
  duration:          String,
  stipend:           String,
  stipendCategory:   String,
  numberOfCredits:   String,
  numberOfOpenings:  String,
  postedDate:        String,
  companyName:       String,
  domainSector:      String,
  // NPTEL fields
  professor:       String,
  discipline:      String,
  contentType:     String,
  noccourse:       Boolean,
  selfPaced:       Boolean,
  currentRun:      Boolean,
  courseId:        String,
  courseDuration:  String,
  enrollmentStart: String,
  enrollmentEnd:   String,
  examRegStart:    String,
  examRegEnd:      String,
  examDate:        String,
  credits:         String,
  level:           String,
  language:        String,
  courseType:      String,
  // PM Internship specific
  pmInsurance:        String,
  pmTransport:        String,
  pmHealthBenefits:   String,
}, { _id: false, strict: false });

const websiteSchema = new Schema({
  id:                     { type: String, required: true, unique: true },
  url:                    String,
  name:                   String,
  type:                   String,
  status:                 String,
  lastScraped:            String,
  jobsFound:              Number,
  errorMessage:           String,
  autoScrape:             { type: Boolean, default: true },
  
  // Cache and change tracking
  etag:                   String,
  lastModified:           String,
  rawContentHash:         String,
  cleanContentHash:       String,
  opportunityContentHash: String,
}, { _id: false });

const logSchema = new Schema({
  id:               { type: String, required: true, unique: true },
  websiteId:        String,
  websiteUrl:       String,
  startTime:        String,
  endTime:          String,
  status:           String,
  jobsFound:        Number,
  errorMessage:     String,
  promptTokens:     { type: Number, default: 0 },
  completionTokens: { type: Number, default: 0 },
}, { _id: false });

const schedulerSchema = new Schema({
  key:            { type: String, default: "config" },
  enabled:        Boolean,
  cronExpression: String,
  lastRun:        String,
  nextRun:        String,
  retryCount:     Number,
  retryDelay:     Number,
}, { _id: false });

export const JobModel       = (mongoose.models["Job"]       || mongoose.model("Job",       jobSchema))       as mongoose.Model<any>;
export const WebsiteModel   = (mongoose.models["Website"]   || mongoose.model("Website",   websiteSchema))   as mongoose.Model<any>;
export const LogModel       = (mongoose.models["Log"]       || mongoose.model("Log",       logSchema))       as mongoose.Model<any>;
export const SchedulerModel = (mongoose.models["Scheduler"] || mongoose.model("Scheduler", schedulerSchema)) as mongoose.Model<any>;
