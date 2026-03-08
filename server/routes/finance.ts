import { Router, Response } from "express";
import { storage } from "../storage";
import { jwtAuthMiddleware, AuthenticatedRequest, requireRole } from "../auth/jwt";

const router = Router();

// 1. Get all invoices (Admin/Finance Admin only)
router.get("/invoices", jwtAuthMiddleware, requireRole("admin", "finance_admin"), (async (req: any, res: Response) => {
    try {
        const invoices = await storage.getAllInvoices();
        res.json(invoices);
    } catch (error) {
        console.error("Error fetching invoices:", error);
        res.status(500).json({ error: 'Failed' });
    }
}) as any);

// 2. Get all payments (Admin/Finance Admin only)
router.get("/payments", jwtAuthMiddleware, requireRole("admin", "finance_admin"), (async (req: any, res: Response) => {
    try {
        const payments = await storage.getAllPayments();
        res.json(payments);
    } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ error: 'Failed' });
    }
}) as any);

// 3. Get all fee plans
router.get("/fee-plans", jwtAuthMiddleware, (async (req: any, res: Response) => {
    try {
        const plans = await storage.getAllFeePlans();
        res.json(plans);
    } catch (error) {
        console.error("Error fetching fee plans:", error);
        res.status(500).json({ error: 'Failed' });
    }
}) as any);

export default router;
