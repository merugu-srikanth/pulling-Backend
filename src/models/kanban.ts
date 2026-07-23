import mongoose, { Schema, Document } from "mongoose";

// --- User Schema ---
export interface IUser extends Document {
  name: string;
  email: string;
  role: string;
}

const UserSchema = new Schema<IUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  role: { type: String, default: "Developer" },
}, { timestamps: true });

// --- Task Schema ---
export interface ITask extends Document {
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: "Todo" | "In Progress" | "Review" | "Completed" | "Pending" | "Cancelled";
  assignedTo: mongoose.Types.ObjectId | null;
  assignedBy: mongoose.Types.ObjectId | null;
  dueDate: Date | null;
  startDate: Date | null;
  completedDate: Date | null;
  estimatedHours: number;
  actualHours: number;
  remarks: string;
  tags: string[];
  attachments: string[];
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>({
  title: { type: String, required: true },
  description: { type: String, default: "" },
  priority: { type: String, enum: ["Low", "Medium", "High", "Critical"], default: "Medium" },
  status: { type: String, enum: ["Todo", "In Progress", "Review", "Completed", "Pending", "Cancelled"], default: "Todo" },
  assignedTo: { type: Schema.Types.ObjectId, ref: "KanbanUser", default: null },
  assignedBy: { type: Schema.Types.ObjectId, ref: "KanbanUser", default: null },
  dueDate: { type: Date, default: null },
  startDate: { type: Date, default: null },
  completedDate: { type: Date, default: null },
  estimatedHours: { type: Number, default: 0 },
  actualHours: { type: Number, default: 0 },
  remarks: { type: String, default: "" },
  tags: { type: [String], default: [] },
  attachments: { type: [String], default: [] },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

// --- Task Activity Schema ---
export interface ITaskActivity extends Document {
  taskId: mongoose.Types.ObjectId;
  action: string;
  previousValue: string;
  newValue: string;
  updatedBy: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const TaskActivitySchema = new Schema<ITaskActivity>({
  taskId: { type: Schema.Types.ObjectId, ref: "KanbanTask", required: true },
  action: { type: String, required: true },
  previousValue: { type: String, default: "" },
  newValue: { type: String, default: "" },
  updatedBy: { type: Schema.Types.ObjectId, ref: "KanbanUser", default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

// --- Daily Report Schema ---
export interface IDailyReport extends Document {
  userId: mongoose.Types.ObjectId;
  date: Date;
  completedTasks: string;
  pendingTasks: string;
  remarks: string;
  blockers: string;
  tomorrowPlan: string;
}

const DailyReportSchema = new Schema<IDailyReport>({
  userId: { type: Schema.Types.ObjectId, ref: "KanbanUser", required: true },
  date: { type: Date, required: true },
  completedTasks: { type: String, default: "" },
  pendingTasks: { type: String, default: "" },
  remarks: { type: String, default: "" },
  blockers: { type: String, default: "" },
  tomorrowPlan: { type: String, default: "" },
}, { timestamps: true });

// Exporting Models
export const KanbanUserModel = (mongoose.models.KanbanUser || mongoose.model<IUser>("KanbanUser", UserSchema)) as mongoose.Model<any>;
export const KanbanTaskModel = (mongoose.models.KanbanTask || mongoose.model<ITask>("KanbanTask", TaskSchema)) as mongoose.Model<any>;
export const KanbanTaskActivityModel = (mongoose.models.KanbanTaskActivity || mongoose.model<ITaskActivity>("KanbanTaskActivity", TaskActivitySchema)) as mongoose.Model<any>;
export const KanbanDailyReportModel = (mongoose.models.KanbanDailyReport || mongoose.model<IDailyReport>("KanbanDailyReport", DailyReportSchema)) as mongoose.Model<any>;
