import { Router } from "express";
import { storage } from "../storage";
import { jwtAuthMiddleware } from "../auth/jwt";
import { z } from "zod";
import bcrypt from "bcrypt";
import { insertUserSchema } from "../../shared/schema";
import { getTimezoneFromLocation } from "../../shared/timezone-utils";

const router = Router();

// 1. Get user by ID
router.get("/:id", async (req, res) => {
    try {
        const user = await storage.getUser(req.params.id);
        if (!user) return res.status(404).json({ error: "Not found" });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 2. Get activity logs
router.get("/:id/activity-logs", jwtAuthMiddleware, async (req: any, res) => {
    try {
        const currentUser = await storage.getUser(req.userId);
        const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'finance_admin';
        const isSelf = currentUser?.id === req.params.id;

        if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Unauthorized' });

        const logs = await storage.getActivityLogsByUser(req.params.id, 100);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 3. Get documents
router.get("/:id/documents", jwtAuthMiddleware, async (req: any, res) => {
    try {
        const currentUser = await storage.getUser(req.userId);
        const isAdmin = currentUser?.role === 'admin';
        const isSelf = currentUser?.id === req.params.id;

        if (!isAdmin && !isSelf) return res.status(403).json({ error: 'Unauthorized' });

        const documents = await storage.getUserDocuments(req.params.id);
        const filteredDocs = isAdmin ? documents : documents.filter((d: any) => d.isVisible);
        res.json(filteredDocs);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 4. List users
router.get("/", jwtAuthMiddleware, async (req: any, res) => {
    try {
        const role = req.query.role as any;
        const currentUser = await storage.getUser(req.userId);

        if (!currentUser) return res.status(401).json({ error: 'Unauthorized' });

        let users;
        if (currentUser.role === 'partner_admin') {
            if (!currentUser.partnerId) return res.status(403).json({ error: 'Partner admin not assigned' });
            users = await storage.getUsersByPartner(currentUser.partnerId);
            if (role) users = users.filter((u: any) => u.role === role);
        } else {
            users = role ? await storage.getUsersByRole(role) : await storage.getAllUsers();
        }

        res.json(users.map((u: any) => ({ ...u, password: undefined })));
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 5. Birthdays
router.get("/birthdays/today", async (req, res) => {
    try {
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();

        const allUsers = await storage.getAllUsers();
        const birthdayUserIds = allUsers
            .filter((user: any) => {
                if (!user.dateOfBirth) return false;
                const birthDate = new Date(user.dateOfBirth);
                return birthDate.getMonth() + 1 === todayMonth && birthDate.getDate() === todayDay;
            })
            .map((user: any) => user.id);

        res.json({ birthdayUserIds, date: today.toISOString().split('T')[0] });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 6. Create user
router.post("/", async (req, res) => {
    try {
        const { parentInfo, ...userData } = req.body;

        if (userData.email) {
            const existingUser = await storage.getUserByEmail(userData.email);
            if (existingUser) return res.status(400).json({ error: "User exists" });
        }

        if (userData.role === "student" && userData.state && userData.country) {
            userData.timezone = getTimezoneFromLocation(userData.state, userData.country);
        }

        if (userData.password) {
            userData.password = await bcrypt.hash(userData.password, 10);
        }

        const validatedData = insertUserSchema.parse({ ...userData, isActive: true });
        const user = await storage.createUser(validatedData);

        if (userData.role === "student" && parentInfo && parentInfo.email) {
            const existingParent = await storage.getUserByEmail(parentInfo.email);
            let parent;
            if (existingParent) {
                parent = existingParent;
            } else {
                const hashedPassword = await bcrypt.hash("password", 10);
                parent = await storage.createUser(insertUserSchema.parse({
                    email: parentInfo.email,
                    name: parentInfo.name,
                    firstName: parentInfo.name.split(' ')[0] || parentInfo.name,
                    lastName: parentInfo.name.split(' ').slice(1).join(' ') || '',
                    role: 'parent',
                    isActive: true,
                    password: hashedPassword
                }));
            }
            await storage.createParentChild({ parentId: parent.id, childId: user.id, relationship: "parent" });
            return res.status(201).json({ user, parent });
        }

        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ error: 'Failed' });
    }
});

// 7. Update user
router.patch("/:id", async (req, res) => {
    try {
        const updates = insertUserSchema.partial().parse(req.body);
        const user = await storage.updateUser(req.params.id, updates);
        if (!user) return res.status(404).json({ error: "Not found" });
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: 'Failed' });
    }
});

// 8. Delete user
router.delete("/:id", async (req, res) => {
    try {
        const success = await storage.deleteUser(req.params.id);
        if (!success) return res.status(404).json({ error: "Not found" });
        res.status(204).send();
    } catch (error) {
        res.status(400).json({ error: 'Failed' });
    }
});

// 9. Change password
router.post("/:id/change-password", async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await storage.getUser(req.params.id);
        if (!user || (user.password && !(await bcrypt.compare(currentPassword, user.password)))) {
            return res.status(400).json({ error: "Unauthorized" });
        }
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await storage.updateUser(req.params.id, { password: hashedPassword, requiresPasswordReset: false });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

// 10. Relationships
router.get("/:id/children", async (req, res) => {
    try {
        const relations = await storage.getChildrenByParent(req.params.id);
        const children = await Promise.all(relations.map((r: any) => storage.getUser(r.childId)));
        res.json(children.filter(Boolean));
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

router.get("/:id/parents", async (req, res) => {
    try {
        const relations = await storage.getParentsByChild(req.params.id);
        const parents = await Promise.all(relations.map((r: any) => storage.getUser(r.parentId)));
        res.json(parents.filter(Boolean)[0] || null);
    } catch (error) {
        res.status(500).json({ error: 'Failed' });
    }
});

export default router;
