import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { AdminUserModel } from "../models/auth.model";
import { authMiddleware, requireSuperAdmin } from "../middleware/auth.middleware";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "gov-vacancy-scraper-jwt-secret-key-12345";

// Default Super Admin seeder helper
async function ensureSuperAdminSeeded() {
  try {
    const superAdmin = await AdminUserModel.findOne({ email: "srikanthmerugu04@gmail.com" });
    if (!superAdmin) {
      const hashedPassword = await bcrypt.hash("SuperAdmin", 10);
      await AdminUserModel.create({
        name: "Super Admin",
        email: "srikanthmerugu04@gmail.com",
        password: hashedPassword,
        role: "super_admin",
        permissions: {
          scraping: true,
          task_manager: true
        }
      });
      console.log("[Seeder] Default Super Admin seeded successfully.");
    }
  } catch (error) {
    console.error("[Seeder] Failed to seed Super Admin:", error);
  }
}

// Ensure seeded on start (removed to prevent blocking Vercel cold starts)

// ─── Authentication APIs ───────────────────────────────────────────────────

// Login
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    // Ensure Super Admin is seeded when anyone tries to login
    await ensureSuperAdminSeeded();

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const admin = await AdminUserModel.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = jwt.sign({ id: admin._id }, JWT_SECRET, { expiresIn: "24h" });

    // Exclude password from output
    const userProfile = {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions
    };

    res.json({ token, user: userProfile });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get self info
router.get("/auth/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    res.json({ user: (req as any).user });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Super Admin Operations ────────────────────────────────────────────────

// Get all admins
router.get("/auth/admins", authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const admins = await AdminUserModel.find({}).select("-password");
    res.json(admins);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new admin
router.post("/auth/create-admin", authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, permissions } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required." });
    }

    const existing = await AdminUserModel.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ error: "Admin with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = new AdminUserModel({
      name,
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: role || "moderator",
      permissions: permissions || { scraping: false, task_manager: false }
    });

    await newAdmin.save();

    // Remove password before responding
    const responseData = newAdmin.toObject();
    delete responseData.password;

    res.status(201).json(responseData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Edit admin details / roles / permissions
router.put("/auth/admins/:id", authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, permissions } = req.body;
    const admin = await AdminUserModel.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ error: "Admin user not found." });
    }

    // Do not allow self-demoting of role or email change of the original super admin
    if (admin.email === "srikanthmerugu04@gmail.com" && role && role !== "super_admin") {
      return res.status(400).json({ error: "Cannot change the primary Super Admin role." });
    }

    if (name) admin.name = name;
    if (email) admin.email = email.toLowerCase().trim();
    if (role) admin.role = role;
    if (permissions) admin.permissions = permissions;

    if (password && password.trim() !== "") {
      admin.password = await bcrypt.hash(password, 10);
    }

    await admin.save();

    const responseData = admin.toObject();
    delete responseData.password;

    res.json(responseData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete admin
router.delete("/auth/admins/:id", authMiddleware, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const admin = await AdminUserModel.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ error: "Admin user not found." });
    }

    if (admin.email === "srikanthmerugu04@gmail.com") {
      return res.status(400).json({ error: "Cannot delete the primary Super Admin account." });
    }

    await AdminUserModel.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
