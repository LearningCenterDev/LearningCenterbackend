import { Router } from "express";
import { storage } from "../storage";
import { insertEnrollmentRequestSchema } from "../../shared/schema";
import { jwtAuthMiddleware } from "../auth/jwt";

const router = Router();

router.get("/requests", jwtAuthMiddleware, async (req, res) => {
    try {
        const { status, studentId, parentId } = req.query;
        let requests;
        if (status) {
            requests = await storage.getEnrollmentRequestsByStatus(status as any);
        } else if (studentId) {
            requests = await storage.getEnrollmentRequestsByStudent(studentId as string);
        } else if (parentId) {
            requests = await storage.getEnrollmentRequestsByParent(parentId as string);
        } else {
            requests = await storage.getAllEnrollmentRequests();
        }
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.post("/requests", jwtAuthMiddleware, async (req, res) => {
    try {
        const validatedData = insertEnrollmentRequestSchema.parse(req.body);
        const request = await storage.createEnrollmentRequest(validatedData);
        res.status(201).json(request);
    } catch (error) {
        res.status(400).json({ error: 'Failed' });
    }
});

router.patch("/requests/:id/parent-approve", jwtAuthMiddleware, async (req, res) => {
    try {
        const request = await storage.getEnrollmentRequest(req.params.id);
        if (!request) return res.status(404).json({ error: "Not found" });

        // Logic for parent approval (simplified for now as in the original)
        const enrollment = await storage.createEnrollment({
            studentId: request.studentId,
            courseId: request.courseId
        });

        const updatedRequest = await storage.updateEnrollmentRequest(req.params.id, {
            status: 'enrolled'
        });

        res.json({ enrollment, request: updatedRequest });
    } catch (error) {
        res.status(400).json({ error: 'Failed' });
    }
});

router.get("/user/:userId", async (req, res) => {
    try {
        const enrollments = await storage.getEnrollmentsByStudent(req.params.userId);
        res.json(enrollments);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

export default router;
