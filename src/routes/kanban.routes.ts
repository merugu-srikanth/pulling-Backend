import { Router, Request, Response } from "express";
import {
  KanbanUserModel,
  KanbanTaskModel,
  KanbanTaskActivityModel,
  KanbanDailyReportModel
} from "../models/kanban";

const router = Router();

// Help function to log activity
async function logTaskActivity(
  taskId: string,
  action: string,
  previousValue: string,
  newValue: string,
  updatedByUserId?: string
) {
  try {
    await KanbanTaskActivityModel.create({
      taskId,
      action,
      previousValue,
      newValue,
      updatedBy: updatedByUserId || null
    });
  } catch (error) {
    console.error("Failed to log task activity:", error);
  }
}

// ─── User APIs ──────────────────────────────────────────────────────────────
router.get("/kanban/users", async (req: Request, res: Response) => {
  try {
    let users = await KanbanUserModel.find({});
    if (users.length === 0) {
      // Seed default users
      users = await KanbanUserModel.create([
        { name: "Srikanth", email: "srikanth@company.com", role: "Manager" },
        { name: "Rahul", email: "rahul@company.com", role: "Developer" },
        { name: "Mahesh", email: "mahesh@company.com", role: "Developer" },
        { name: "Admin", email: "admin@company.com", role: "Administrator" }
      ]);
    }
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Task APIs ──────────────────────────────────────────────────────────────
router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const { title, description, priority, assignedTo, assignedBy, dueDate, estimatedHours, remarks, tags } = req.body;
    const task = new KanbanTaskModel({
      title,
      description,
      priority,
      status: "Todo",
      assignedTo: assignedTo || null,
      assignedBy: assignedBy || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      startDate: null,
      completedDate: null,
      estimatedHours: estimatedHours || 0,
      actualHours: 0,
      remarks: remarks || "",
      tags: tags || [],
      attachments: [],
      isDeleted: false
    });
    await task.save();

    await logTaskActivity(
      task._id.toString(),
      "Task Created",
      "",
      `Created with title "${title}"`,
      assignedBy
    );

    res.status(201).json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/tasks", async (req: Request, res: Response) => {
  try {
    const filters: any = { isDeleted: false };
    if (req.query.assignedTo) {
      filters.assignedTo = req.query.assignedTo;
    }
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.priority) {
      filters.priority = req.query.priority;
    }

    const tasks = await KanbanTaskModel.find(filters)
      .populate("assignedTo")
      .populate("assignedBy")
      .sort({ updatedAt: -1 });
    res.json(tasks);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const task = await KanbanTaskModel.findById(req.params.id)
      .populate("assignedTo")
      .populate("assignedBy");
    if (!task || task.isDeleted) {
      return res.status(404).json({ error: "Task not found" });
    }

    const activities = await KanbanTaskActivityModel.find({ taskId: task._id })
      .populate("updatedBy")
      .sort({ createdAt: -1 });

    res.json({ task, activities });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      priority,
      status,
      assignedTo,
      dueDate,
      estimatedHours,
      actualHours,
      remarks,
      tags,
      updatedBy
    } = req.body;

    const task = await KanbanTaskModel.findById(req.params.id);
    if (!task || task.isDeleted) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Keep track of changes for logs
    const changes: string[] = [];
    if (title && title !== task.title) {
      changes.push(`Title: "${task.title}" → "${title}"`);
      task.title = title;
    }
    if (description !== undefined && description !== task.description) {
      changes.push(`Description updated`);
      task.description = description;
    }
    if (priority && priority !== task.priority) {
      changes.push(`Priority: ${task.priority} → ${priority}`);
      task.priority = priority;
    }
    if (status && status !== task.status) {
      changes.push(`Status: ${task.status} → ${status}`);
      task.status = status;
      if (status === "In Progress" && !task.startDate) {
        task.startDate = new Date();
      }
      if (status === "Completed") {
        task.completedDate = new Date();
      } else if (task.status === "Completed" && status !== "Completed") {
        task.completedDate = null;
      }
    }
    if (assignedTo !== undefined && String(assignedTo) !== String(task.assignedTo)) {
      changes.push(`Assignee changed`);
      task.assignedTo = assignedTo || null;
    }
    if (dueDate !== undefined) {
      const prevDate = task.dueDate ? new Date(task.dueDate).toDateString() : "None";
      const newDate = dueDate ? new Date(dueDate).toDateString() : "None";
      if (prevDate !== newDate) {
        changes.push(`Due Date: ${prevDate} → ${newDate}`);
        task.dueDate = dueDate ? new Date(dueDate) : null;
      }
    }
    if (estimatedHours !== undefined && estimatedHours !== task.estimatedHours) {
      changes.push(`Est. Hours: ${task.estimatedHours} → ${estimatedHours}`);
      task.estimatedHours = estimatedHours;
    }
    if (actualHours !== undefined && actualHours !== task.actualHours) {
      changes.push(`Actual Hours: ${task.actualHours} → ${actualHours}`);
      task.actualHours = actualHours;
    }
    if (remarks !== undefined && remarks !== task.remarks) {
      changes.push(`Remarks updated`);
      task.remarks = remarks;
    }
    if (tags !== undefined) {
      task.tags = tags;
    }

    await task.save();

    if (changes.length > 0) {
      await logTaskActivity(
        task._id.toString(),
        "Task Updated",
        "",
        changes.join(", "),
        updatedBy
      );
    }

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const task = await KanbanTaskModel.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    task.isDeleted = true;
    await task.save();

    await logTaskActivity(
      task._id.toString(),
      "Task Deleted",
      "",
      "Soft deleted task",
      req.query.updatedBy as string
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Drag & Drop / PATCH status ─────────────────────────────────────────────
router.patch("/tasks/:id/status", async (req: Request, res: Response) => {
  try {
    const { status, updatedBy } = req.body;
    const task = await KanbanTaskModel.findById(req.params.id);
    if (!task || task.isDeleted) {
      return res.status(404).json({ error: "Task not found" });
    }

    const prevStatus = task.status;
    task.status = status;

    if (status === "In Progress" && !task.startDate) {
      task.startDate = new Date();
    }
    if (status === "Completed") {
      task.completedDate = new Date();
    } else if (prevStatus === "Completed" && status !== "Completed") {
      task.completedDate = null;
    }

    await task.save();

    await logTaskActivity(
      task._id.toString(),
      "Status Changed",
      prevStatus,
      status,
      updatedBy
    );

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Assign user ────────────────────────────────────────────────────────────
router.patch("/tasks/:id/assign", async (req: Request, res: Response) => {
  try {
    const { assignedTo, updatedBy } = req.body;
    const task = await KanbanTaskModel.findById(req.params.id);
    if (!task || task.isDeleted) {
      return res.status(404).json({ error: "Task not found" });
    }

    const prevAssignee = task.assignedTo;
    task.assignedTo = assignedTo || null;
    await task.save();

    await logTaskActivity(
      task._id.toString(),
      "Assignee Changed",
      prevAssignee ? prevAssignee.toString() : "Unassigned",
      assignedTo ? assignedTo.toString() : "Unassigned",
      updatedBy
    );

    res.json(task);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Daily Report APIs ──────────────────────────────────────────────────────
router.post("/daily-report", async (req: Request, res: Response) => {
  try {
    const { userId, date, completedTasks, pendingTasks, remarks, blockers, tomorrowPlan } = req.body;
    if (!userId || !date) {
      return res.status(400).json({ error: "userId and date are required" });
    }

    const reportDate = new Date(date);
    // Set hours to UTC midnight or start of day to search accurately
    const startOfDay = new Date(reportDate.setUTCHours(0, 0, 0, 0));
    const endOfDay = new Date(reportDate.setUTCHours(23, 59, 59, 999));

    // Upsert the report for the day for this user
    let report = await KanbanDailyReportModel.findOne({
      userId,
      date: { $gte: startOfDay, $lte: endOfDay }
    });

    if (report) {
      report.completedTasks = completedTasks || "";
      report.pendingTasks = pendingTasks || "";
      report.remarks = remarks || "";
      report.blockers = blockers || "";
      report.tomorrowPlan = tomorrowPlan || "";
      await report.save();
    } else {
      report = new KanbanDailyReportModel({
        userId,
        date: startOfDay,
        completedTasks,
        pendingTasks,
        remarks,
        blockers,
        tomorrowPlan
      });
      await report.save();
    }

    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/daily-report", async (req: Request, res: Response) => {
  try {
    const reports = await KanbanDailyReportModel.find({})
      .populate("userId")
      .sort({ date: -1 });
    res.json(reports);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/daily-report/:date", async (req: Request, res: Response) => {
  try {
    const reportDate = new Date(req.params.date);
    const startOfDay = new Date(reportDate.setUTCHours(0, 0, 0, 0));
    const endOfDay = new Date(reportDate.setUTCHours(23, 59, 59, 999));

    const reports = await KanbanDailyReportModel.find({
      date: { $gte: startOfDay, $lte: endOfDay }
    }).populate("userId");

    res.json(reports);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Dashboard APIs ─────────────────────────────────────────────────────────
router.get("/dashboard/task-summary", async (req: Request, res: Response) => {
  try {
    const tasks = await KanbanTaskModel.find({ isDeleted: false });
    
    const summary = {
      Todo: 0,
      "In Progress": 0,
      Review: 0,
      Completed: 0,
      Pending: 0,
      Cancelled: 0,
      Overdue: 0
    };

    const now = new Date();

    tasks.forEach((task) => {
      const status = task.status as keyof typeof summary;
      if (summary[status] !== undefined) {
        summary[status]++;
      }
      
      // Calculate overdue if task is not Completed or Cancelled and dueDate is past
      if (
        task.dueDate &&
        new Date(task.dueDate) < now &&
        task.status !== "Completed" &&
        task.status !== "Cancelled"
      ) {
        summary.Overdue++;
      }
    });

    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
