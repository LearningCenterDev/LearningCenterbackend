import { Router } from "express";
import { storage } from "../storage";
import { getSession } from "../auth";
import { z } from "zod";
import bcrypt from "bcrypt";
import {
    generateAccessToken,
    createRefreshTokenForUser,
    validateRefreshToken,
    revokeRefreshToken,
    revokeUserRefreshTokens,
    jwtAuthMiddleware,
} from "../auth/jwt";
import { sendWelcomeEmail } from "../email";

const router = Router();

// Login schema for validation
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
});

// Signup schema
const signupSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    role: z.enum(["student", "parent", "teacher"]),
});

// Request password reset schema
const requestPasswordResetSchema = z.object({
    email: z.string().email("Please enter a valid email address"),
    notes: z.string().optional(),
});

// Authentication routes
router.post('/login', async (req, res) => {
    try {
        const { email, password } = loginSchema.parse(req.body);

        const user = await storage.getUserByEmail(email);

        if (!user || !user.password) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: "Account is not active. Please wait for parent authorization." });
        }

        const accessToken = generateAccessToken({
            userId: user.id,
            email: user.email || '',
            role: user.role,
        });

        const refreshToken = await createRefreshTokenForUser(
            user.id,
            req.ip || null,
            req.headers['user-agent'] || null
        );

        (req.session as any).userId = user.id;
        await new Promise<void>((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        storage.createActivityLog({
            userId: user.id,
            action: 'login',
            description: 'User logged in',
            metadata: { email: user.email },
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
        }).catch(err => console.error('Error logging login activity:', err));

        if (user.requiresPasswordReset) {
            return res.json({
                success: true,
                user: { ...user, password: undefined, oneTimePassword: undefined },
                accessToken,
                refreshToken,
                requiresPasswordReset: true
            });
        }

        res.json({
            success: true,
            user: { ...user, password: undefined, oneTimePassword: undefined },
            accessToken,
            refreshToken,
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(400).json({ error: "Invalid request" });
    }
});

router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: "Refresh token is required" });
        }

        const userId = await validateRefreshToken(refreshToken);
        if (!userId) {
            return res.status(401).json({ error: "Invalid or expired refresh token" });
        }

        const user = await storage.getUser(userId);
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }

        if (!user.isActive) {
            return res.status(403).json({ error: "Account is not active" });
        }

        await revokeRefreshToken(refreshToken);

        const newAccessToken = generateAccessToken({
            userId: user.id,
            email: user.email || '',
            role: user.role,
        });

        const newRefreshToken = await createRefreshTokenForUser(
            user.id,
            req.ip || null,
            req.headers['user-agent'] || null
        );

        res.json({
            success: true,
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
        });
    } catch (error) {
        console.error("Token refresh error:", error);
        res.status(500).json({ error: "Failed to refresh token" });
    }
});

router.get('/user', jwtAuthMiddleware, async (req: any, res) => {
    try {
        const userId = req.userId;
        const user = await storage.getUser(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ ...user, password: undefined, oneTimePassword: undefined });
    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

router.post('/logout', async (req, res) => {
    const userId = (req.session as any)?.userId;
    const { refreshToken } = req.body;

    if (refreshToken) {
        try {
            await revokeRefreshToken(refreshToken);
        } catch (error) {
            console.error('Error revoking refresh token:', error);
        }
    }

    if (userId) {
        storage.createActivityLog({
            userId,
            action: 'logout',
            description: 'User logged out',
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
        }).catch(error => console.error('Error logging logout activity:', error));
    }

    await new Promise<void>((resolve) => {
        req.session.destroy((err: any) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
            resolve();
        });
    });

    res.clearCookie('connect.sid', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({ success: true });
});

router.post('/revoke-all', jwtAuthMiddleware, async (req: any, res) => {
    try {
        const userId = req.userId;
        if (!userId) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        await revokeUserRefreshTokens(userId);

        await new Promise<void>((resolve) => {
            req.session.destroy((err: any) => {
                if (err) {
                    console.error('Error destroying session:', err);
                }
                resolve();
            });
        });

        res.json({ success: true, message: "All sessions revoked" });
    } catch (error) {
        console.error("Error revoking all tokens:", error);
        res.status(500).json({ error: "Failed to revoke all sessions" });
    }
});

router.post('/signup', async (req, res) => {
    try {
        const { email, password, firstName, lastName, role } = signupSchema.parse(req.body);

        const existingUser = await storage.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: "A user with this email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await storage.createUser({
            email,
            password: hashedPassword,
            firstName,
            lastName,
            name: `${firstName} ${lastName}`,
            role,
            isActive: true,
        });

        const accessToken = generateAccessToken({
            userId: newUser.id,
            email: newUser.email || '',
            role: newUser.role,
        });

        const refreshToken = await createRefreshTokenForUser(
            newUser.id,
            req.ip || null,
            req.headers['user-agent'] || null
        );

        try {
            await sendWelcomeEmail(email, `${firstName} ${lastName}`);
        } catch (emailError) {
            console.error("Failed to send welcome email:", emailError);
        }

        (req.session as any).userId = newUser.id;

        res.json({
            success: true,
            user: { ...newUser, password: undefined },
            accessToken,
            refreshToken,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error("Signup error:", error);
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: "Failed to create account" });
    }
});

router.post('/request-password-reset', async (req, res) => {
    try {
        const { email, notes } = requestPasswordResetSchema.parse(req.body);

        const user = await storage.getUserByEmail(email);
        if (!user) {
            return res.json({
                success: true,
                message: "Your password reset request has been submitted to an administrator for review."
            });
        }

        const existingRequests = await storage.getPasswordResetRequestsByUser(user.id);
        const hasPendingRequest = existingRequests.some(req => req.status === 'pending');

        if (hasPendingRequest) {
            return res.status(400).json({
                error: "You already have a pending password reset request. Please wait for administrator approval."
            });
        }

        await storage.createPasswordResetRequest({
            userId: user.id,
            status: 'pending',
            notes: notes || null,
        });

        res.json({
            success: true,
            message: "Your password reset request has been submitted to an administrator for review."
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ error: error.errors[0].message });
        }
        console.error("Request password reset error:", error);
        res.status(500).json({ error: "Failed to submit password reset request" });
    }
});

export default router;
