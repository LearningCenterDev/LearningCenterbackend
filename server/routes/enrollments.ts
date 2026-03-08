import { Router, Response } from "express";
import { storage } from "../storage";
import { insertEnrollmentRequestSchema } from "../../shared/schema";
import { jwtAuthMiddleware, AuthenticatedRequest } from "../auth/jwt";

const router = Router();

// 1. Get enrollment requests with filters
router.get("/requests", jwtAuthMiddleware, (async (req: any, res: Response) => {
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
        console.error("Error fetching enrollment requests:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}) as any);

// 2. Create new enrollment request
router.post("/requests", jwtAuthMiddleware, (async (req: any, res: Response) => {
    try {
        const validatedData = insertEnrollmentRequestSchema.parse(req.body);
        const request = await storage.createEnrollmentRequest(validatedData);
        res.status(201).json(request);
    } catch (error: any) {
        console.error("Error creating enrollment request:", error);
        res.status(400).json({ error: error.message || 'Failed to create request' });
    }
}) as any);

// 3. Parent approval workflow
router.patch("/requests/:id/parent-approve", jwtAuthMiddleware, (async (req: any, res: Response) => {
    try {
        const requestId = req.params.id;
        const request = await storage.getEnrollmentRequest(requestId);

        if (!request) return res.status(404).json({ error: "Enrollment request not found" });

        // Logic for parent approval: Create enrollment and update request status
        const enrollment = await storage.createEnrollment({
            studentId: request.studentId,
            courseId: request.courseId,
            // enrolledAt is handled by database defaultNow()
        });

        const updatedRequest = await storage.updateEnrollmentRequest(requestId, {
            status: 'enrolled'
        });

        res.json({ enrollment, request: updatedRequest });
    } catch (error: any) {
        console.error("Error approving enrollment (parent):", error);
        res.status(400).json({ error: error.message || 'Approval failed' });
    }
}) as any);

// 4. Get student's enrollments
router.get("/user/:userId", jwtAuthMiddleware, (async (req: any, res: Response) => {
    try {
        const enrollments = await storage.getEnrollmentsByStudent(req.params.userId);
        res.json(enrollments);
    } catch (error: any) {
        console.error("Error fetching student enrollments:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
}) as any);

export default router;
