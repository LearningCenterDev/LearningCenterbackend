import { Router } from "express";
import { storage } from "../storage";
import { jwtAuthMiddleware } from "../auth/jwt";

const router = Router();

router.get("/invoices", jwtAuthMiddleware, async (req: any, res) => {
    try {
        const invoices = await storage.getAllInvoices();
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get("/payments", jwtAuthMiddleware, async (req: any, res) => {
    try {
        const payments = await storage.getAllPayments();
        res.json(payments);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get("/fee-plans", jwtAuthMiddleware, async (req: any, res) => {
    try {
        const plans = await storage.getAllFeePlans();
        res.json(plans);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

export default router;
