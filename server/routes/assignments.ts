import { Router } from "express";
import { storage } from "../storage";
import { insertAssignmentSchema } from "../../shared/schema";
import { jwtAuthMiddleware } from "../auth/jwt";

const router = Router();

router.get("/course/:courseId", async (req, res) => {
    try {
        const assignments = await storage.getAssignmentsByCourse(req.params.courseId);
        res.json(assignments);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post("/", jwtAuthMiddleware, async (req, res) => {
    try {
        const validatedData = insertAssignmentSchema.parse(req.body);
        const assignment = await storage.createAssignment(validatedData);
        res.status(201).json(assignment);
    } catch (error) {
        res.status(400).json({ error: 'Failed' });
    }
});

router.get("/student/:studentId", async (req, res) => {
    try {
        const enrollments = await storage.getEnrollmentsByStudent(req.params.studentId);
        const courseIds = enrollments.map(e => e.courseId);
        const assignments = [];
        for (const courseId of courseIds) {
            const courseAssignments = await storage.getPublishedAssignmentsByCourse(courseId);
            assignments.push(...courseAssignments);
        }
        res.json(assignments);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

export default router;
