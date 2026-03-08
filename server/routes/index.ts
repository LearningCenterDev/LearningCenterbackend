import { Express } from "express";
import cors from "cors";
import authRoutes from "./auth";
import userRoutes from "./users";
import teacherRoutes from "./teachers";
import courseRoutes from "./courses";
import uploadRoutes from "./uploads";
import enrollmentRoutes from "./enrollments";
import assignmentRoutes from "./assignments";
import financeRoutes from "./finance";

export function registerModularRoutes(app: Express) {
    // Enable CORS for frontend-backend separation
    app.use(cors({
        origin: process.env.VITE_APP_URL || "http://localhost:5173",
        credentials: true,
    }));

    app.use("/api/auth", authRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/teachers", teacherRoutes);
    app.use("/api/courses", courseRoutes);
    app.use("/api/upload", uploadRoutes);
    app.use("/api/enrollments", enrollmentRoutes);
    app.use("/api/assignments", assignmentRoutes);
    app.use("/api/finance", financeRoutes);
}
