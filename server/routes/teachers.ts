import { Router } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/featured", async (req, res) => {
    try {
        const teachers = await storage.getUsersByRole("teacher");
        const activeTeachers = teachers.filter(t => t.isActive);
        const shuffled = activeTeachers.sort(() => Math.random() - 0.5);
        const selected = shuffled.slice(0, 4);
        const featuredTeachers = selected.map(t => ({
            id: t.id,
            name: t.name || `${t.firstName} ${t.lastName}`,
            avatarUrl: t.avatarUrl || t.profileImageUrl,
            bio: t.bio,
            education: t.education,
            certifications: t.certifications,
            subject: t.subject
        }));
        res.json(featuredTeachers);
    } catch (error) {
        console.error("Error fetching featured teachers:", error);
        res.status(500).json({ error: "Failed to fetch featured teachers" });
    }
});

router.get("/all", async (req, res) => {
    try {
        const teachers = await storage.getUsersByRole("teacher");
        const activeTeachers = teachers.filter(t => t.isActive);
        const allTeachers = activeTeachers.map(t => ({
            id: t.id,
            name: t.name || `${t.firstName} ${t.lastName}`,
            avatarUrl: t.avatarUrl || t.profileImageUrl,
            coverPhotoUrl: t.coverPhotoUrl,
            bio: t.bio,
            education: t.education,
            certifications: t.certifications,
            subject: t.subject
        }));
        res.json(allTeachers);
    } catch (error) {
        console.error("Error fetching teachers:", error);
        res.status(500).json({ error: "Failed to fetch teachers" });
    }
});

router.get("/public/:teacherId", async (req, res) => {
    try {
        const teacher = await storage.getUser(req.params.teacherId);
        if (!teacher || teacher.role !== "teacher" || !teacher.isActive) {
            return res.status(404).json({ error: "Teacher not found" });
        }
        res.json({
            id: teacher.id,
            name: teacher.name || `${teacher.firstName} ${teacher.lastName}`,
            avatarUrl: teacher.avatarUrl || teacher.profileImageUrl,
            coverPhotoUrl: teacher.coverPhotoUrl,
            bio: teacher.bio,
            education: teacher.education,
            certifications: teacher.certifications,
            subject: teacher.subject
        });
    } catch (error) {
        console.error("Error fetching teacher details:", error);
        res.status(500).json({ error: "Failed to fetch teacher details" });
    }
});

export default router;
