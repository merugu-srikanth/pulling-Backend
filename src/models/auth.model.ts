import mongoose, { Schema, Document } from "mongoose";

export interface IAdminUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: "super_admin" | "moderator";
  permissions: {
    scraping: boolean;
    task_manager: boolean;
  };
}

const AdminUserSchema = new Schema<IAdminUser>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["super_admin", "moderator"], default: "moderator" },
  permissions: {
    scraping: { type: Boolean, default: false },
    task_manager: { type: Boolean, default: false }
  }
}, { timestamps: true });

export const AdminUserModel = (mongoose.models.AdminUser || mongoose.model<IAdminUser>("AdminUser", AdminUserSchema)) as mongoose.Model<any>;
