import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getSession } from "./auth";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { getTimezoneFromLocation } from "../shared/timezone-utils";
import {
  generateAccessToken,
  createRefreshTokenForUser,
  validateRefreshToken,
  revokeRefreshToken,
  revokeUserRefreshTokens,
  jwtAuthMiddleware,
  type AuthenticatedRequest,
} from "./auth/jwt";
import { sendParentWelcomeEmail, sendProspectConfirmationEmail, sendProspectAdminNotificationEmail } from "./services/resend";
import { sendPasswordResetEmail, sendWelcomeEmail } from "./email";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import {
  insertUserSchema,
  insertCourseSchema,
  insertEnrollmentSchema,
  insertEnrollmentRequestSchema,
  insertCourseActivationRequestSchema,
  insertAssignmentSchema,
  insertSubmissionSchema,
  insertGradeSchema,
  insertAttendanceSchema,
  insertMessageSchema,
  insertParentChildSchema,
  insertAnnouncementSchema,
  insertScheduleSchema,
  insertSubjectSchema,
  insertStudentTeacherAssignmentSchema,
  insertScheduleRecurrenceSchema,
  insertScheduleRecurrenceExceptionSchema,
  insertScheduleSubstitutionSchema,
  insertTeacherClassCountSchema,
  insertFeePlanSchema,
  insertStudentFeeAssignmentSchema,
  insertDiscountSchema,
  insertStudentDiscountSchema,
  insertStateFeeStructureSchema,
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  insertPaymentSchema,
  insertProspectStudentSchema,
  insertRescheduleProposalSchema,
} from "../shared/schema";
import { generateRecurrenceOccurrences } from "./recurrence-utils";
import { ObjectStorageService } from "./objectStorage";
import { websocketService } from "./websocket-service";
import { syncScheduleToCalendar } from "./services/calendar-sync-helper";

// Login schema for validation
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Initialize object storage service
const objectStorageService = new ObjectStorageService();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Demo users initialization
async function initializeDemoUsers() {
  try {
    // Hash the demo password
    const hashedPassword = await bcrypt.hash("password", 10);

    // Demo users to create
    const demoUsers = [
      {
        id: "demo-student-1",
        email: "student@example.com",
        password: hashedPassword,
        name: "John Student",
        firstName: "John",
        lastName: "Student",
        role: "student" as const,
        isActive: true, // Active for demo/testing purposes
      },
      {
        id: "demo-teacher-1",
        email: "teacher@example.com",
        password: hashedPassword,
        name: "Sarah Teacher",
        firstName: "Sarah",
        lastName: "Teacher",
        role: "teacher" as const,
        isActive: true, // Teachers can login immediately
      },
      {
        id: "demo-parent-1",
        email: "parent@example.com",
        password: hashedPassword,
        name: "Michael Parent",
        firstName: "Michael",
        lastName: "Parent",
        role: "parent" as const,
        isActive: true, // Parents can login immediately
      },
      {
        id: "demo-admin-1",
        email: "admin@example.com",
        password: hashedPassword,
        name: "Emma Admin",
        firstName: "Emma",
        lastName: "Admin",
        role: "admin" as const,
        isActive: true, // Admins can login immediately
      },
    ];

    // Create or update demo users
    for (const demoUser of demoUsers) {
      const existingUser = await storage.getUserByEmail(demoUser.email);
      if (!existingUser) {
        await storage.createUser(demoUser);
        console.log(`Created demo user: ${demoUser.email}`);
      } else {
        // Update password and isActive status if needed
        const updates: any = {};
        if (existingUser.password === "password") {
          updates.password = hashedPassword;
        }
        if (existingUser.isActive !== demoUser.isActive) {
          updates.isActive = demoUser.isActive;
        }
        if (Object.keys(updates).length > 0) {
          await storage.updateUser(existingUser.id, updates);
          console.log(`Updated demo user: ${demoUser.email}`);
        }
      }
    }
  } catch (error) {
    console.error("Error initializing demo users:", error);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup session middleware
  app.use(getSession());

  // Initialize demo users in storage if they don't exist
  await initializeDemoUsers();

  // Authentication routes moved to server/routes/auth.ts

  // Activity log endpoint (admin or finance_admin only, or self-access)
  app.get('/api/users/:id/activity-logs', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'finance_admin';
      const isSelf = currentUser?.id === req.params.id;

      if (!currentUser || (!isAdmin && !isSelf)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const logs = await storage.getActivityLogsByUser(req.params.id, 100);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      res.status(500).json({ error: 'Failed to fetch activity logs' });
    }
  });

  // User Documents routes (admin only can upload/delete, users can view their own)
  app.get('/api/users/:userId/documents', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      const targetUserId = req.params.userId;
      const isAdmin = currentUser?.role === 'admin';
      const isSelf = currentUser?.id === targetUserId;

      if (!currentUser || (!isAdmin && !isSelf)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const documents = await storage.getUserDocuments(targetUserId);
      // Non-admins only see visible documents
      const filteredDocs = isAdmin ? documents : documents.filter(d => d.isVisible);
      res.json(filteredDocs);
    } catch (error) {
      console.error('Error fetching user documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  app.post('/api/users/:userId/documents', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can upload documents' });
      }

      const targetUserId = req.params.userId;
      const { name, description, url, type, size, isVisible } = req.body;

      if (!name || !url) {
        return res.status(400).json({ error: 'Name and URL are required' });
      }

      const document = await storage.createUserDocument({
        userId: targetUserId,
        name,
        description: description || null,
        url,
        type: type || null,
        size: size || null,
        isVisible: isVisible !== false, // Default to true
        uploadedBy: currentUser.id,
      });

      res.status(201).json(document);
    } catch (error) {
      console.error('Error creating user document:', error);
      res.status(500).json({ error: 'Failed to create document' });
    }
  });

  // Toggle document visibility (admin only)
  app.patch('/api/users/:userId/documents/:documentId/visibility', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can update document visibility' });
      }

      const { isVisible } = req.body;
      if (typeof isVisible !== 'boolean') {
        return res.status(400).json({ error: 'isVisible must be a boolean' });
      }

      const document = await storage.getUserDocument(req.params.documentId);
      if (!document || document.userId !== req.params.userId) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const updated = await storage.updateUserDocumentVisibility(req.params.documentId, isVisible);
      res.json(updated);
    } catch (error) {
      console.error('Error updating document visibility:', error);
      res.status(500).json({ error: 'Failed to update document visibility' });
    }
  });

  // Download a user document (admin or document owner)
  app.get('/api/users/:userId/documents/:documentId/download', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      const isAdmin = currentUser?.role === 'admin';
      const isOwner = req.params.userId === currentUser?.id;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const document = await storage.getUserDocument(req.params.documentId);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (document.userId !== req.params.userId) {
        return res.status(400).json({ error: 'Document does not belong to this user' });
      }

      const url = document.url;
      if (!url) {
        return res.status(404).json({ error: 'Document file not found' });
      }

      // Get file from private storage
      const file = await objectStorageService.getPrivateObject(url);
      if (!file) {
        return res.status(404).json({ error: 'Document file not found in storage' });
      }

      // Set filename for download
      res.setHeader('Content-Disposition', `inline; filename="${document.name}"`);

      // Stream the file
      await objectStorageService.downloadObject(file, res, 0, true);
    } catch (error) {
      console.error('Error downloading document:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download document' });
      }
    }
  });

  app.delete('/api/users/:userId/documents/:documentId', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({ error: 'Only admins can delete documents' });
      }

      const documentId = req.params.documentId;
      const document = await storage.getUserDocument(documentId);

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (document.userId !== req.params.userId) {
        return res.status(400).json({ error: 'Document does not belong to this user' });
      }

      // Try to delete from object storage (don't fail if storage deletion fails)
      try {
        const url = document.url;
        if (url) {
          // Extract storage path from URL
          let storagePath = '';

          if (url.startsWith('/')) {
            // Private storage path format: /{bucket}/{.private}/{filename}
            storagePath = url;
          } else if (url.includes('/public-objects/')) {
            // Legacy object storage URL format
            const urlObj = new URL(url, 'http://localhost');
            storagePath = urlObj.pathname.substring('/public-objects/'.length);
          } else if (url.includes('storage.googleapis.com')) {
            // GCS URL format: https://storage.googleapis.com/{bucket}/{path}
            const urlObj = new URL(url);
            // pathParts[0] is empty, [1] is bucket, rest is the path
            const pathParts = urlObj.pathname.split('/').filter(p => p);
            if (pathParts.length >= 2) {
              const bucketName = pathParts[0];
              const objectPath = pathParts.slice(1).join('/');
              storagePath = `/${bucketName}/${objectPath}`;
            }
          }

          if (storagePath) {
            await objectStorageService.deleteObject(storagePath);
          }
        }
      } catch (storageError) {
        console.warn('Failed to delete file from object storage (continuing with DB deletion):', storageError);
      }

      await storage.deleteUserDocument(documentId);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting user document:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // User routes
  app.get("/api/users/:id", async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Teacher and User routes moved to server/routes/teachers.ts and server/routes/users.ts

  // Get users with birthdays today
  app.get("/api/users/birthdays/today", async (req, res) => {
    try {
      const today = new Date();
      const todayMonth = today.getMonth() + 1; // JavaScript months are 0-indexed
      const todayDay = today.getDate();

      const allUsers = await storage.getAllUsers();
      const birthdayUserIds = allUsers
        .filter(user => {
          if (!user.dateOfBirth) return false;
          const birthDate = new Date(user.dateOfBirth);
          return birthDate.getMonth() + 1 === todayMonth && birthDate.getDate() === todayDay;
        })
        .map(user => user.id);

      res.json({ birthdayUserIds, date: today.toISOString().split('T')[0] });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Helper function to get allowed user IDs for messaging based on role relationships
  async function getAllowedMessageRecipients(userId: string): Promise<Set<string>> {
    const currentUser = await storage.getUser(userId);
    if (!currentUser) {
      throw new Error("User not found");
    }

    const allowedUserIds = new Set<string>();

    // Admin and Finance Admin can message everyone
    if (currentUser.role === "admin" || currentUser.role === "finance_admin") {
      const allUsers = await storage.getAllUsers();
      allUsers.forEach(u => {
        if (u.id !== currentUser.id) {
          allowedUserIds.add(u.id);
        }
      });
      return allowedUserIds;
    }

    // Get all admins (everyone can message admins)
    const admins = await storage.getUsersByRole("admin");
    admins.forEach(admin => allowedUserIds.add(admin.id));

    // Student: can message only teachers explicitly assigned to them in enrolled courses + admins
    if (currentUser.role === "student") {
      // Get enrolled courses
      const enrollments = await storage.getEnrollmentsByStudent(currentUser.id);
      const enrolledCourseIds = enrollments.map(e => e.courseId);

      // Get parent-approved enrollment requests
      const studentEnrollmentRequests = await storage.getEnrollmentRequestsByStudent(currentUser.id);
      const approvedRequests = studentEnrollmentRequests.filter(
        request => request.status === 'parent_approved'
      );
      const approvedCourseIds = approvedRequests.map(request => request.courseId);

      // Combine unique course IDs
      const allCourseIds = Array.from(new Set([...enrolledCourseIds, ...approvedCourseIds]));

      // Get teachers explicitly assigned to this student in their enrolled courses
      for (const courseId of allCourseIds) {
        const assignment = await storage.getAssignmentByStudentAndCourse(currentUser.id, courseId);
        // Only add teacher if explicitly assigned to this student in this course
        if (assignment?.teacherId) {
          allowedUserIds.add(assignment.teacherId);
        }
      }
    }

    // Parent: can message teachers explicitly assigned to their children in enrolled courses + admins
    if (currentUser.role === "parent") {
      // Get all children
      const children = await storage.getChildrenByParent(currentUser.id);

      for (const relationship of children) {
        // Get each child's enrolled courses
        const enrollments = await storage.getEnrollmentsByStudent(relationship.childId);
        const enrolledCourseIds = enrollments.map(e => e.courseId);

        // Get parent-approved enrollment requests
        const studentEnrollmentRequests = await storage.getEnrollmentRequestsByStudent(relationship.childId);
        const approvedRequests = studentEnrollmentRequests.filter(
          request => request.status === 'parent_approved'
        );
        const approvedCourseIds = approvedRequests.map(request => request.courseId);

        // Combine unique course IDs
        const allCourseIds = Array.from(new Set([...enrolledCourseIds, ...approvedCourseIds]));

        // Get teachers explicitly assigned to this child in their enrolled courses
        for (const courseId of allCourseIds) {
          const assignment = await storage.getAssignmentByStudentAndCourse(relationship.childId, courseId);
          // Only add teacher if explicitly assigned to this child in this course
          if (assignment?.teacherId) {
            allowedUserIds.add(assignment.teacherId);
          }
        }
      }
    }

    // Teacher: can message only students explicitly assigned to them + parents of those students + admins
    if (currentUser.role === "teacher") {
      // Get all students explicitly assigned to this teacher
      const teacherAssignments = await storage.getAssignmentsByTeacher(currentUser.id);
      const studentIds = new Set<string>();

      teacherAssignments.forEach(assignment => {
        if (assignment.studentId) {
          studentIds.add(assignment.studentId);
          allowedUserIds.add(assignment.studentId);
        }
      });

      // Get parents of those students
      for (const studentId of Array.from(studentIds)) {
        const parents = await storage.getParentsByChild(studentId);
        parents.forEach(relationship => {
          allowedUserIds.add(relationship.parentId);
        });
      }
    }

    return allowedUserIds;
  }

  // Get users available for messaging based on role relationships
  app.get("/api/users/available-for-messaging/:userId", async (req, res) => {
    try {
      const allowedUserIds = await getAllowedMessageRecipients(req.params.userId);

      // Fetch user details for all allowed user IDs
      const availableUsers = [];
      for (const userId of Array.from(allowedUserIds)) {
        const user = await storage.getUser(userId);
        if (user) {
          availableUsers.push(user);
        }
      }

      res.json(availableUsers);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const { parentInfo, ...userData } = req.body;

      // Check if email already exists
      if (userData.email) {
        const existingUser = await storage.getUserByEmail(userData.email);
        if (existingUser) {
          return res.status(400).json({
            error: "A user with this email already exists",
            message: "A user with this email already exists. Please use a different email address."
          });
        }
      }

      // Validate that student and parent emails are different
      const isStudent = userData.role === "student";
      if (isStudent && parentInfo && parentInfo.email) {
        if (parentInfo.email.toLowerCase() === userData.email?.toLowerCase()) {
          return res.status(400).json({
            error: "Student and parent cannot have the same email address",
            message: "Please use a different email address for the parent/guardian."
          });
        }
      }

      // Validate state and country required for students
      if (isStudent) {
        if (!userData.state || userData.state.trim() === '') {
          return res.status(400).json({
            error: "State is required for students",
            message: "Please provide the student's state/province."
          });
        }
        if (!userData.country || userData.country.trim() === '') {
          return res.status(400).json({
            error: "Country is required for students",
            message: "Please provide the student's country."
          });
        }

        // Auto-assign timezone based on state and country
        const detectedTimezone = getTimezoneFromLocation(userData.state, userData.country);
        userData.timezone = detectedTimezone;
      }

      // Store the original password before hashing (for parent creation)
      const originalPassword = userData.password;

      // Hash password if provided
      if (userData.password) {
        userData.password = await bcrypt.hash(userData.password, 10);
      }

      // All users can login immediately (parent authorization temporarily disabled)
      // Parent authorization workflow available for future updates
      const userDataWithStatus = {
        ...userData,
        isActive: true, // All users active by default
      };

      const validatedData = insertUserSchema.parse(userDataWithStatus);
      const user = await storage.createUser(validatedData);

      // Auto-assign fee plan based on student's state if applicable
      if (isStudent && user.state) {
        try {
          const stateFeeStructure = await storage.getStateFeeStructureByStateCode(user.state);
          if (stateFeeStructure) {
            const existingAssignment = await storage.getStudentFeeAssignmentByStudent(user.id);
            if (!existingAssignment) {
              await storage.createStudentFeeAssignment({
                studentId: user.id,
                feePlanId: stateFeeStructure.feePlanId,
                discountType: stateFeeStructure.adjustmentType,
                discountValue: stateFeeStructure.adjustmentValue.toString(),
                status: 'active',
                notes: `Auto-assigned based on state: ${stateFeeStructure.stateName}`,
              });
              console.log(`Auto-assigned fee plan to student ${user.id} based on state ${user.state}`);
            }
          }
        } catch (feeError) {
          console.error('Failed to auto-assign fee plan:', feeError);
        }
      }

      // If creating a student with parent information, create parent user
      if (isStudent && parentInfo && parentInfo.email) {
        // Check if parent already exists with this email
        const existingParent = await storage.getUserByEmail(parentInfo.email);

        let parent;
        if (existingParent) {
          // Check if existing user has the 'parent' role
          if (existingParent.role !== 'parent') {
            // Delete the student we just created since we can't link them
            await storage.deleteUser(user.id);
            return res.status(400).json({
              error: `The email "${parentInfo.email}" is already registered as a ${existingParent.role}. Please use a different email for the parent.`
            });
          }

          // If parent exists with correct role, link the student to them
          parent = existingParent;

          // Create parent-child relationship in junction table
          await storage.createParentChild({
            parentId: parent.id,
            childId: user.id,
            relationship: "parent",
          });
        } else {
          // Create new parent user with same password as child
          const parentPassword = originalPassword || "password"; // Use child's password or default
          const hashedPassword = await bcrypt.hash(parentPassword, 10);
          const parentData = {
            email: parentInfo.email,
            name: parentInfo.name,
            firstName: parentInfo.name.split(' ')[0] || parentInfo.name,
            lastName: parentInfo.name.split(' ').slice(1).join(' ') || '',
            role: 'parent' as const,
            phone: parentInfo.phone || null,
            password: hashedPassword, // Same password as child
            isActive: true, // Parent can login immediately
          };

          const validatedParentData = insertUserSchema.parse(parentData);
          parent = await storage.createUser(validatedParentData);

          // Create parent-child relationship in junction table
          await storage.createParentChild({
            parentId: parent.id,
            childId: user.id,
            relationship: "parent",
          });

          // Email sending temporarily disabled - available for future updates
          // try {
          //   await sendParentWelcomeEmail(
          //     parentInfo.email,
          //     parentInfo.name,
          //     userData.name || `${userData.firstName} ${userData.lastName}`,
          //     oneTimePassword
          //   );
          //   console.log(`Welcome email sent to parent: ${parentInfo.email}`);
          // } catch (emailError) {
          //   console.error('Failed to send email:', emailError);
          //   // Continue even if email fails - parent can still access via OTP stored in database
          // }
          console.log(`Parent account created (email disabled): ${parentInfo.email} | Password: ${parentPassword}`);
        }

        return res.status(201).json({
          user,
          parent,
          message: existingParent
            ? "Student created and linked to existing parent account."
            : `Student and parent created. Parent can login with same password as student.`,
        });
      }

      res.status(201).json(user);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      // Clean up data before validation
      const cleanedData = { ...req.body };

      // Only convert empty strings to undefined for fields that should be removed when empty
      // This preserves the partial() behavior where undefined means "don't update"
      Object.keys(cleanedData).forEach(key => {
        if (cleanedData[key] === '') {
          delete cleanedData[key]; // Remove empty strings entirely
        }
      });

      // Parse and validate - partial() allows undefined (missing) fields
      const updates = insertUserSchema.partial().parse(cleanedData);

      // Get current user to check if state changed
      const currentUser = await storage.getUser(req.params.id);
      const stateChanged = currentUser && updates.state && currentUser.state !== updates.state;

      // Auto-derive timezone from location when state or country is updated
      // Only do this if timezone is not being explicitly set in this request
      if (!cleanedData.timezone && (updates.state !== undefined || updates.country !== undefined)) {
        const effectiveState = updates.state ?? currentUser?.state;
        const effectiveCountry = updates.country ?? currentUser?.country;
        if (effectiveState || effectiveCountry) {
          updates.timezone = getTimezoneFromLocation(effectiveState, effectiveCountry);
        } else {
          updates.timezone = 'UTC';
        }
      }

      const user = await storage.updateUser(req.params.id, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Auto-assign fee plan if student's state changed and they don't have an active assignment
      if (stateChanged && user.role === 'student' && user.state) {
        try {
          const stateFeeStructure = await storage.getStateFeeStructureByStateCode(user.state);
          if (stateFeeStructure) {
            const existingAssignment = await storage.getStudentFeeAssignmentByStudent(user.id);
            if (!existingAssignment || existingAssignment.status !== 'active') {
              if (existingAssignment) {
                await storage.updateStudentFeeAssignment(existingAssignment.id, {
                  feePlanId: stateFeeStructure.feePlanId,
                  discountType: stateFeeStructure.adjustmentType,
                  discountValue: stateFeeStructure.adjustmentValue.toString(),
                  status: 'active',
                  notes: `Auto-updated based on state change: ${stateFeeStructure.stateName}`,
                });
              } else {
                await storage.createStudentFeeAssignment({
                  studentId: user.id,
                  feePlanId: stateFeeStructure.feePlanId,
                  discountType: stateFeeStructure.adjustmentType,
                  discountValue: stateFeeStructure.adjustmentValue.toString(),
                  status: 'active',
                  notes: `Auto-assigned based on state: ${stateFeeStructure.stateName}`,
                });
              }
              console.log(`Auto-assigned/updated fee plan for student ${user.id} based on state ${user.state}`);
            }
          }
        } catch (feeError) {
          console.error('Failed to auto-assign fee plan on update:', feeError);
        }
      }

      res.json(user);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/users/:id", async (req, res) => {
    try {
      console.log(`[DELETE USER] Attempting to delete user: ${req.params.id}`);
      const success = await storage.deleteUser(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "User not found" });
      }
      console.log(`[DELETE USER] Successfully deleted user: ${req.params.id}`);
      res.status(204).send();
    } catch (error) {
      console.log(`[DELETE USER] Error deleting user ${req.params.id}:`, error instanceof Error ? error.message : error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Password change endpoint
  app.post("/api/users/:id/change-password", async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password are required" });
      }

      // Get user for verification
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password (only check if user has a password - some might not)
      if (user.password) {
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
          return res.status(400).json({ error: "Current password is incorrect" });
        }
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user password and clear OTP flags
      const updatedUser = await storage.updateUser(req.params.id, {
        password: hashedPassword,
        oneTimePassword: null,
        requiresPasswordReset: false
      });
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
      console.error('Password change error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin hard reset password (doesn't require current password)
  app.post("/api/users/:id/reset-password", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const { newPassword, requirePasswordChange } = req.body;
      const currentUserId = req.userId;

      if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
      }

      // Get current user to check if they're admin
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Security: Only admins can reset passwords
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can reset passwords" });
      }

      // Get target user
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user password
      const updatedUser = await storage.updateUser(req.params.id, {
        password: hashedPassword,
        oneTimePassword: null,
        requiresPasswordReset: requirePasswordChange ?? true // Force password change on next login by default
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Reset password for first-time OTP login (parents)
  app.post("/api/auth/reset-password", jwtAuthMiddleware, async (req, res) => {
    try {
      const { newPassword } = req.body;
      const userId = req.userId;

      if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
      }

      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify user requires password reset
      if (!user.requiresPasswordReset) {
        return res.status(400).json({ error: "Password reset not required for this account" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user password and clear OTP flags
      const updatedUser = await storage.updateUser(userId, {
        password: hashedPassword,
        oneTimePassword: null,
        requiresPasswordReset: false
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        success: true,
        message: "Password set successfully",
        user: { ...updatedUser, password: undefined, oneTimePassword: undefined }
      });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Parent activation endpoints
  app.get("/api/activate/:token", async (req, res) => {
    try {
      const { token } = req.params;

      // Get pending activation
      const activation = await storage.getPendingParentActivationByToken(token);

      if (!activation) {
        return res.status(404).json({ error: "Invalid activation link" });
      }

      // Check if expired
      if (new Date() > new Date(activation.expiresAt)) {
        return res.status(400).json({ error: "Activation link has expired" });
      }

      // Get student to verify they're still inactive
      const student = await storage.getUser(activation.studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      if (student.isActive) {
        return res.status(400).json({ error: "This student has already been activated" });
      }

      // Return parent information for the form
      res.json({
        parentName: activation.parentName,
        parentEmail: activation.parentEmail,
        parentPhone: activation.parentPhone,
        studentName: student.name || `${student.firstName} ${student.lastName}`,
      });
    } catch (error) {
      console.error('Activation validation error:', error);
      res.status(500).json({ error: "Failed to validate activation link" });
    }
  });

  app.post("/api/activate/:token/password", async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;

      // Validate password
      if (!password || password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
      }

      // Get pending activation
      const activation = await storage.getPendingParentActivationByToken(token);

      if (!activation) {
        return res.status(404).json({ error: "Invalid activation link" });
      }

      // Check if expired
      if (new Date() > new Date(activation.expiresAt)) {
        return res.status(400).json({ error: "Activation link has expired" });
      }

      // Get student to verify they're still inactive
      const student = await storage.getUser(activation.studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }

      if (student.isActive) {
        return res.status(400).json({ error: "This student has already been activated" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create parent user
      const [firstName, ...lastNameParts] = activation.parentName.split(' ');
      const lastName = lastNameParts.join(' ') || firstName;

      const parent = await storage.createUser({
        email: activation.parentEmail,
        password: hashedPassword,
        name: activation.parentName,
        firstName: firstName,
        lastName: lastName,
        role: "parent",
        phone: activation.parentPhone,
        isActive: true, // Parent is active immediately
      });

      // Link parent to student
      await storage.updateUser(student.id, {
        parentId: parent.id,
        isActive: true // Activate student
      });

      // Create parent-child relationship
      await storage.createParentChild({
        parentId: parent.id,
        childId: student.id,
        relationship: "parent",
      });

      // Delete pending activation
      await storage.deletePendingParentActivation(activation.id);

      // Set session for the parent
      (req.session as any).userId = parent.id;

      res.json({
        success: true,
        message: "Account activated successfully",
        user: { ...parent, password: undefined }
      });
    } catch (error) {
      console.error('Activation error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to activate account' });
    }
  });

  // Serve public object storage files using ObjectStorageService
  app.get("/public-objects/:fileName", async (req, res) => {
    try {
      const fileName = req.params.fileName;
      console.log(`Serving file from object storage: ${fileName}`);

      // Search for the file in public object search paths
      const file = await objectStorageService.searchPublicObject(fileName);

      if (!file) {
        console.log(`File not found: ${fileName}`);
        return res.status(404).json({ error: "File not found" });
      }

      // Download and stream the file to response
      await objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error serving file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error serving file" });
      }
    }
  });

  // General file upload endpoint - uploads file to private storage and returns URL
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Generate unique filename
      const fileExtension = file.originalname.split('.').pop() || 'bin';
      const fileName = `document-${uuidv4()}.${fileExtension}`;

      // Upload to private storage
      const storagePath = await objectStorageService.uploadToPrivateDir(fileName, file.buffer, file.mimetype);

      res.json({
        url: storagePath,
        fileName: file.originalname,
        type: file.mimetype,
        size: file.size
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload file' });
    }
  });

  // Get presigned URL for profile image upload
  app.post("/api/upload/profile-image/url", async (req, res) => {
    try {
      const { userId, uploadType, fileExtension } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      if (!uploadType || !['avatar', 'cover'].includes(uploadType)) {
        return res.status(400).json({ error: "Invalid upload type. Must be 'avatar' or 'cover'" });
      }
      if (!fileExtension) {
        return res.status(400).json({ error: "File extension is required" });
      }

      const { ObjectStorageService } = await import('./objectStorage.js');
      const objectStorageService = new ObjectStorageService();

      // Generate unique filename
      const fileName = `${uploadType}-${userId}-${uuidv4()}.${fileExtension}`;

      // Get presigned upload URL
      const uploadUrl = await objectStorageService.getPublicObjectUploadURL(fileName);

      res.json({
        uploadUrl,
        fileName,
        publicUrl: `/public-objects/${fileName}`
      });
    } catch (error) {
      console.error('Error getting upload URL:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get upload URL' });
    }
  });

  // Update user profile with uploaded image URL
  app.post("/api/upload/profile-image/complete", async (req, res) => {
    try {
      const { userId, uploadType, fileName } = req.body;

      if (!userId || !uploadType || !fileName) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const imageUrl = `/public-objects/${fileName}`;

      // Update user profile with appropriate field
      const updateData = uploadType === 'avatar'
        ? { avatarUrl: imageUrl, profileImageUrl: imageUrl } // Update both fields for compatibility
        : { coverPhotoUrl: imageUrl };

      const updatedUser = await storage.updateUser(userId, updateData);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({
        success: true,
        imageUrl,
        message: `${uploadType === 'avatar' ? 'Avatar' : 'Cover photo'} uploaded successfully`
      });
    } catch (error) {
      console.error('Error completing upload:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to complete upload' });
    }
  });

  // Get presigned URL for course cover image upload
  app.post("/api/upload/course-cover/url", async (req, res) => {
    try {
      const { fileExtension } = req.body;

      if (!fileExtension) {
        return res.status(400).json({ error: "File extension is required" });
      }

      const fileName = `course-cover-${uuidv4()}.${fileExtension}`;

      // Get presigned upload URL
      const uploadUrl = await objectStorageService.getPublicObjectUploadURL(fileName);

      res.json({
        uploadUrl,
        fileName,
        publicUrl: `/public-objects/${fileName}`
      });
    } catch (error) {
      console.error('Error getting upload URL:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get upload URL' });
    }
  });

  // Complete course cover image upload
  app.post("/api/upload/course-cover/complete", async (req, res) => {
    try {
      const { fileName } = req.body;

      if (!fileName) {
        return res.status(400).json({ error: "File name is required" });
      }

      const imageUrl = `/public-objects/${fileName}`;

      res.json({
        success: true,
        imageUrl,
        message: "Course cover image uploaded successfully"
      });
    } catch (error) {
      console.error('Error completing upload:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to complete upload' });
    }
  });

  app.get("/api/users/:id/children", async (req, res) => {
    try {
      // Get children using parent_children junction table
      const parentChildRelations = await storage.getChildrenByParent(req.params.id);

      // Get full user details for each child
      const children = await Promise.all(
        parentChildRelations.map(async (relation) => {
          const child = await storage.getUser(relation.childId);
          return child;
        })
      );

      // Filter out any null values (in case a user was deleted)
      const validChildren = children.filter(child => child !== null);

      res.json(validChildren);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/users/:id/parents", async (req, res) => {
    try {
      // Get parent-child relationships from junction table
      const parentChildRelations = await storage.getParentsByChild(req.params.id);

      // Get full user details for each parent
      const parents = await Promise.all(
        parentChildRelations.map(async (relation) => {
          const parent = await storage.getUser(relation.parentId);
          return parent;
        })
      );

      // Filter out any null values (in case a user was deleted)
      const validParents = parents.filter(parent => parent !== null);

      // Return first parent (students typically have one parent/guardian)
      res.json(validParents[0] || null);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Course routes
  app.get("/api/courses/:id", async (req, res) => {
    try {
      const course = await storage.getCourse(req.params.id);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Include teacher data if available
      let teacher = null;
      if (course.teacherId) {
        teacher = await storage.getUser(course.teacherId);
        // Remove sensitive fields from teacher data
        if (teacher) {
          const { password, oneTimePassword, resetToken, resetTokenExpiry, ...safeTeacher } = teacher;
          teacher = safeTeacher;
        }
      }

      // Fetch curriculum units with their subsections
      const curriculumUnits = await storage.getCurriculumUnitsByCourse(req.params.id);
      const unitsWithSubsections = await Promise.all(
        curriculumUnits.map(async (unit) => {
          const subsections = await storage.getCurriculumSubsectionsByUnit(unit.id);
          return {
            ...unit,
            subsections
          };
        })
      );

      res.json({ ...course, teacher, curriculumUnits: unitsWithSubsections });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/courses", async (req, res) => {
    try {
      const active = req.query.active === 'true';
      let courses = await storage.getAllCourses();

      if (active) {
        courses = courses.filter(course => course.isActive);
      }

      res.json(courses);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/courses", async (req, res) => {
    try {
      const validatedData = insertCourseSchema.parse(req.body);
      const course = await storage.createCourse(validatedData);
      res.status(201).json(course);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/courses/:id", async (req, res) => {
    try {
      const updates = insertCourseSchema.partial().parse(req.body);
      const course = await storage.updateCourse(req.params.id, updates);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }
      res.json(course);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/courses/:id", async (req, res) => {
    try {
      const success = await storage.deleteCourse(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Course not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to delete course' });
    }
  });

  app.patch("/api/courses/:id/toggle-status", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const course = await storage.getCourse(req.params.id);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only admin or course teacher can toggle status
      if (user.role !== 'admin' && course.teacherId !== user.id) {
        return res.status(403).json({ error: "Forbidden: Only admin or course teacher can toggle course status" });
      }

      const updatedCourse = await storage.updateCourse(req.params.id, {
        isActive: !course.isActive
      });

      res.json(updatedCourse);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Course Resources routes
  app.get("/api/courses/:courseId/resources", async (req, res) => {
    try {
      const resources = await storage.getCourseResourcesByCourse(req.params.courseId);
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/courses/:courseId/resources", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const course = await storage.getCourse(req.params.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only admin or course teacher (including assigned teachers) can add resources
      const hasAccess = user.role === 'admin' || await storage.teacherHasCourseAccess(user.id, req.params.courseId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Forbidden: Only admin or course teacher can add resources" });
      }

      const multer = (await import('multer')).default;
      const { v4: uuidv4 } = await import('uuid');

      // Configure multer for memory storage
      const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      }).single('file');

      upload(req as any, res, async (err: any) => {
        if (err) {
          return res.status(400).json({ error: err.message });
        }

        const fileReq = req as any;
        const { title, description, type, resourceUrl, isShared: isSharedStr, studentIds: studentIdsStr } = req.body;
        const isShared = isSharedStr === 'false' ? false : true;
        const studentIds: string[] = studentIdsStr ? JSON.parse(studentIdsStr) : [];

        if (!title || !type) {
          return res.status(400).json({ error: "Title and type are required" });
        }

        // Validate that at least one student is selected when not shared
        if (!isShared && studentIds.length === 0) {
          return res.status(400).json({ error: "At least one student must be selected when assigning to specific students" });
        }

        try {
          let finalResourceUrl = resourceUrl || '';
          let fileName = '';
          let fileSize = 0;
          let mimeType = '';

          // If it's a file upload
          if (type === 'file' && fileReq.file) {
            const fs = await import('fs');
            const path = await import('path');

            const fileExtension = fileReq.file.originalname.split('.').pop();
            fileName = `resource-${req.params.courseId}-${uuidv4()}.${fileExtension}`;
            const filePath = `/public/uploads/${fileName}`;

            const fullPath = path.join(process.cwd(), filePath);

            // Ensure directory exists
            await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });

            // Write file
            await fs.promises.writeFile(fullPath, fileReq.file.buffer);

            // Set resource data
            finalResourceUrl = `/public/${fileName}`;
            fileName = fileReq.file.originalname;
            fileSize = fileReq.file.size;
            mimeType = fileReq.file.mimetype;
          } else if (type === 'link') {
            finalResourceUrl = resourceUrl;
          }

          if (!finalResourceUrl) {
            return res.status(400).json({ error: "Resource URL or file is required" });
          }

          const resource = await storage.createCourseResource({
            courseId: req.params.courseId,
            title,
            description: description || null,
            type,
            resourceUrl: finalResourceUrl,
            fileName: fileName || null,
            fileSize: fileSize || null,
            mimeType: mimeType || null,
            uploadedBy: user.id,
            isShared,
          });

          // Create individual student mappings if not shared
          if (!isShared && studentIds.length > 0) {
            for (const studentId of studentIds) {
              await storage.createResourceStudentMapping({
                resourceId: resource.id,
                studentId,
              });
            }
          }

          // Create notifications for enrolled students and send real-time WebSocket update
          try {
            const enrollments = await storage.getEnrollmentsByCourse(req.params.courseId);
            const notifyStudentIds: string[] = [];
            for (const enrollment of enrollments) {
              // If shared, notify all; if not shared, only notify assigned students
              if (isShared || studentIds.includes(enrollment.studentId)) {
                notifyStudentIds.push(enrollment.studentId);
                await storage.createNotification({
                  userId: enrollment.studentId,
                  type: 'resource',
                  title: 'New Resource Available',
                  message: `A new resource "${title}" has been added to ${course.title}`,
                  relatedId: resource.id,
                  relatedType: 'course_resource',
                });
              }
            }
            // Send real-time WebSocket notification
            websocketService.notifyNewResource(req.params.courseId, title, notifyStudentIds);
          } catch (notifError) {
            console.error('Failed to create resource notifications:', notifError);
          }

          res.status(201).json(resource);
        } catch (error) {
          res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
        }
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/resources/:id", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const resource = await storage.getCourseResource(req.params.id);
      if (!resource) {
        return res.status(404).json({ error: "Resource not found" });
      }

      const course = await storage.getCourse(resource.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only admin or course teacher (including assigned teachers) can delete resources
      const hasAccess = user.role === 'admin' || await storage.teacherHasCourseAccess(user.id, resource.courseId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Forbidden: Only admin or course teacher can delete resources" });
      }

      const deleted = await storage.deleteCourseResource(req.params.id);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Resource not found" });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // =====================================================
  // Curriculum Unit Routes (Admin-only for CRUD)
  // =====================================================

  // Get all curriculum units for a course
  app.get("/api/courses/:courseId/curriculum", async (req, res) => {
    try {
      const units = await storage.getCurriculumUnitsByCourse(req.params.courseId);

      // Get subsections for each unit
      const unitsWithSubsections = await Promise.all(units.map(async (unit) => {
        const subsections = await storage.getCurriculumSubsectionsByUnit(unit.id);
        return { ...unit, subsections };
      }));

      res.json(unitsWithSubsections);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Create a curriculum unit (admin only)
  app.post("/api/courses/:courseId/curriculum", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Only admins can create curriculum units" });
      }

      const course = await storage.getCourse(req.params.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      const { title, description, orderIndex } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      const unit = await storage.createCurriculumUnit({
        courseId: req.params.courseId,
        title,
        description: description || null,
        orderIndex: orderIndex ?? 0,
      });

      res.status(201).json(unit);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update a curriculum unit (admin only)
  app.patch("/api/curriculum/:unitId", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Only admins can update curriculum units" });
      }

      const unit = await storage.getCurriculumUnit(req.params.unitId);
      if (!unit) {
        return res.status(404).json({ error: "Curriculum unit not found" });
      }

      const { title, description, orderIndex } = req.body;
      const updatedUnit = await storage.updateCurriculumUnit(req.params.unitId, {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(orderIndex !== undefined && { orderIndex }),
      });

      res.json(updatedUnit);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete a curriculum unit (admin only)
  app.delete("/api/curriculum/:unitId", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Only admins can delete curriculum units" });
      }

      const deleted = await storage.deleteCurriculumUnit(req.params.unitId);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Curriculum unit not found" });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Reorder curriculum units (admin only)
  app.post("/api/courses/:courseId/curriculum/reorder", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: "Only admins can reorder curriculum units" });
      }

      const { unitOrders } = req.body;
      if (!Array.isArray(unitOrders)) {
        return res.status(400).json({ error: "unitOrders must be an array" });
      }

      await storage.reorderCurriculumUnits(req.params.courseId, unitOrders);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Sync curriculum from course JSON to curriculum_units table (admin/teacher)
  app.post("/api/courses/:courseId/curriculum/sync", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return res.status(403).json({ error: "Only admins and teachers can sync curriculum" });
      }

      const course = await storage.getCourse(req.params.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Check if curriculum units already exist
      const existingUnits = await storage.getCurriculumUnitsByCourse(req.params.courseId);
      if (existingUnits.length > 0) {
        return res.json({ message: "Curriculum units already exist", units: existingUnits });
      }

      // Parse the course.curriculum JSON field
      const curriculum = course.curriculum as Array<{ heading: string; description?: string }> | null;
      if (!curriculum || curriculum.length === 0) {
        return res.status(400).json({ error: "No curriculum defined in course" });
      }

      // Create curriculum units from the JSON
      const createdUnits = [];
      for (let i = 0; i < curriculum.length; i++) {
        const item = curriculum[i];
        const unit = await storage.createCurriculumUnit({
          courseId: req.params.courseId,
          title: item.heading,
          description: item.description || null,
          orderIndex: i,
        });
        createdUnits.push(unit);
      }

      res.json({ message: "Curriculum synced successfully", units: createdUnits });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // =====================================================
  // Curriculum Subsection Routes (Teachers can add)
  // =====================================================

  // Create a subsection under a unit (teachers and admins)
  app.post("/api/curriculum/:unitId/subsections", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return res.status(403).json({ error: "Only teachers and admins can add subsections" });
      }

      const unit = await storage.getCurriculumUnit(req.params.unitId);
      if (!unit) {
        return res.status(404).json({ error: "Curriculum unit not found" });
      }

      const { title, description, orderIndex } = req.body;
      if (!title) {
        return res.status(400).json({ error: "Title is required" });
      }

      const subsection = await storage.createCurriculumSubsection({
        unitId: req.params.unitId,
        teacherId: user.id,
        title,
        description: description || null,
        orderIndex: orderIndex ?? 0,
      });

      // Notify all enrolled students and their parents about curriculum update
      const enrollments = await storage.getEnrollmentsByCourse(unit.courseId);
      const studentIds = enrollments.map(e => e.studentId);

      // Get parent IDs for all enrolled students
      const parentIds = new Set<string>();
      for (const enrollment of enrollments) {
        const parents = await storage.getParentsByStudentId(enrollment.studentId);
        parents.forEach(p => parentIds.add(p.id));
      }

      // Notify all students and parents viewing this course
      const allNotifiedIds = [...studentIds, ...Array.from(parentIds)];
      websocketService.notifyCurriculumUpdate(unit.courseId, allNotifiedIds);

      res.status(201).json(subsection);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update a subsection (owner teacher or admin)
  app.patch("/api/subsections/:subsectionId", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const subsection = await storage.getCurriculumSubsection(req.params.subsectionId);
      if (!subsection) {
        return res.status(404).json({ error: "Subsection not found" });
      }

      // Only admin or the teacher who created it can update
      if (user.role !== 'admin' && subsection.teacherId !== user.id) {
        return res.status(403).json({ error: "You can only edit your own subsections" });
      }

      const { title, description, orderIndex } = req.body;
      const updated = await storage.updateCurriculumSubsection(req.params.subsectionId, {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(orderIndex !== undefined && { orderIndex }),
      });

      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete a subsection (owner teacher or admin)
  app.delete("/api/subsections/:subsectionId", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const subsection = await storage.getCurriculumSubsection(req.params.subsectionId);
      if (!subsection) {
        return res.status(404).json({ error: "Subsection not found" });
      }

      // Only admin or the teacher who created it can delete
      if (user.role !== 'admin' && subsection.teacherId !== user.id) {
        return res.status(403).json({ error: "You can only delete your own subsections" });
      }

      const deleted = await storage.deleteCurriculumSubsection(req.params.subsectionId);
      if (deleted) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Subsection not found" });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // =====================================================
  // Course Progress Routes
  // =====================================================

  // Get aggregate progress for a course (average across all students)
  app.get("/api/courses/:courseId/aggregate-progress", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { courseId } = req.params;

      // Check access: admin or teacher with course access
      const isAdmin = user.role === 'admin';
      const isTeacher = user.role === 'teacher' && await storage.teacherHasCourseAccess(user.id, courseId);

      if (!isAdmin && !isTeacher) {
        return res.status(403).json({ error: "Access denied" });
      }

      const progress = await storage.getCourseAggregateProgress(courseId);
      res.json(progress);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get student's progress summary for a course
  app.get("/api/courses/:courseId/progress/:studentId", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { courseId, studentId } = req.params;

      // Check access: admin, teacher with course access, the student themselves, or the student's parent
      const isAdmin = user.role === 'admin';
      const isTeacher = user.role === 'teacher' && await storage.teacherHasCourseAccess(user.id, courseId);
      const isStudent = user.id === studentId;
      const isParent = user.role === 'parent' && await storage.isParentOfStudent(user.id, studentId);

      if (!isAdmin && !isTeacher && !isStudent && !isParent) {
        return res.status(403).json({ error: "Access denied" });
      }

      const summary = await storage.getCourseProgressSummary(courseId, studentId);
      res.json(summary);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Mark a unit as complete for a student (teacher only)
  app.post("/api/courses/:courseId/progress/:studentId/units/:unitId/complete", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { courseId, studentId, unitId } = req.params;
      const { notes } = req.body;

      // Only admin or teachers with course access can mark progress
      const isAdmin = user.role === 'admin';
      const isTeacher = user.role === 'teacher' && await storage.teacherHasCourseAccess(user.id, courseId);

      if (!isAdmin && !isTeacher) {
        return res.status(403).json({ error: "Only teachers can mark unit progress" });
      }

      // Verify student is enrolled
      const enrollment = await storage.getEnrollmentByStudentAndCourse(studentId, courseId);
      if (!enrollment) {
        return res.status(404).json({ error: "Student is not enrolled in this course" });
      }

      // Verify unit exists
      const unit = await storage.getCurriculumUnit(unitId);
      if (!unit || unit.courseId !== courseId) {
        return res.status(404).json({ error: "Curriculum unit not found" });
      }

      // Mark unit as complete
      const progress = await storage.markUnitComplete(courseId, studentId, unitId, user.id, notes);

      // Get updated progress summary to check for milestones
      const summary = await storage.getCourseProgressSummary(courseId, studentId);
      const course = await storage.getCourse(courseId);
      const student = await storage.getUser(studentId);

      // Notify student about unit completion
      if (student) {
        await storage.createNotification({
          userId: studentId,
          type: 'curriculum_unit_completed',
          title: 'Unit Completed!',
          message: `"${unit.title}" in ${course?.title || 'your course'} has been marked as completed.`,
          data: { courseId, unitId, unitTitle: unit.title },
        });
      }

      // Notify parent about unit completion
      const parentRelations = await storage.getParentsByStudentId(studentId);
      for (const relation of parentRelations) {
        await storage.createNotification({
          userId: relation.parentId,
          type: 'curriculum_unit_completed',
          title: 'Unit Completed!',
          message: `${student?.firstName || 'Your child'} completed "${unit.title}" in ${course?.title || 'their course'}.`,
          data: { courseId, unitId, studentId, unitTitle: unit.title },
        });
      }

      // Check for milestone notifications (25%, 50%, 75%, 100%)
      const milestones = [25, 50, 75, 100];
      for (const milestone of milestones) {
        if (summary.progressPercentage >= milestone) {
          const alreadyReached = await storage.hasReachedMilestone(courseId, studentId, milestone);
          if (!alreadyReached) {
            // Record milestone
            await storage.recordMilestone(courseId, studentId, milestone);

            // Notify student
            await storage.createNotification({
              userId: studentId,
              type: 'progress_milestone',
              title: `${milestone}% Progress Milestone!`,
              message: `Congratulations! You've reached ${milestone}% progress in ${course?.title || 'your course'}.`,
              data: { courseId, milestone, progressPercentage: summary.progressPercentage },
            });

            // Notify parents
            for (const relation of parentRelations) {
              await storage.createNotification({
                userId: relation.parentId,
                type: 'progress_milestone',
                title: `${milestone}% Progress Milestone!`,
                message: `${student?.firstName || 'Your child'} has reached ${milestone}% progress in ${course?.title || 'their course'}!`,
                data: { courseId, studentId, milestone, progressPercentage: summary.progressPercentage },
              });
            }
          }
        }
      }

      res.json({ progress, summary });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Mark a unit as incomplete for a student (teacher only)
  app.post("/api/courses/:courseId/progress/:studentId/units/:unitId/incomplete", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { courseId, studentId, unitId } = req.params;

      // Only admin or teachers with course access can mark progress
      const isAdmin = user.role === 'admin';
      const isTeacher = user.role === 'teacher' && await storage.teacherHasCourseAccess(user.id, courseId);

      if (!isAdmin && !isTeacher) {
        return res.status(403).json({ error: "Only teachers can update unit progress" });
      }

      const progress = await storage.markUnitIncomplete(courseId, studentId, unitId);
      const summary = await storage.getCourseProgressSummary(courseId, studentId);

      res.json({ progress, summary });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Enrollment routes
  app.get("/api/enrollments", async (req, res) => {
    try {
      const enrollments = await storage.getAllEnrollments();
      res.json(enrollments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/enrollments/:id", async (req, res) => {
    try {
      const enrollment = await storage.getEnrollment(req.params.id);
      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }
      res.json(enrollment);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/enrollments", async (req, res) => {
    try {
      const enrollments = await storage.getEnrollmentsByStudent(req.params.studentId);
      res.json(enrollments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/courses/:courseId/enrollments", async (req, res) => {
    try {
      const enrollments = await storage.getEnrollmentsByCourse(req.params.courseId);

      // Fetch student details for each enrollment
      const enrollmentsWithStudents = await Promise.all(
        enrollments.map(async (enrollment) => {
          const student = await storage.getUser(enrollment.studentId);
          return {
            ...enrollment,
            student
          };
        })
      );

      res.json(enrollmentsWithStudents);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/enrollments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const validatedData = insertEnrollmentSchema.parse(req.body);
      const currentUserId = req.userId;

      // Get current user to check their role
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Security: Only students can enroll themselves, only admins can enroll others
      if (currentUser.role === 'student') {
        // Students can only enroll themselves
        if (validatedData.studentId !== currentUserId) {
          return res.status(403).json({ error: "You can only enroll yourself" });
        }
      } else if (currentUser.role !== 'admin') {
        // Teachers, parents, and other roles cannot enroll anyone
        return res.status(403).json({ error: "Only students can enroll themselves and admins can enroll students" });
      }

      // Check if student already enrolled in this course
      const existingEnrollments = await storage.getEnrollmentsByStudent(validatedData.studentId);
      const alreadyEnrolled = existingEnrollments.some(e => e.courseId === validatedData.courseId);
      if (alreadyEnrolled) {
        return res.status(400).json({ error: "Student is already enrolled in this course" });
      }

      const enrollment = await storage.createEnrollment(validatedData);

      // Get student and course details for notifications
      const student = await storage.getUser(enrollment.studentId);
      const course = await storage.getCourse(enrollment.courseId);

      if (student && course) {
        // Create notifications for all admins
        const admins = await storage.getUsersByRole('admin');
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            type: 'student_enrolled',
            title: 'New Student Enrollment',
            message: `${student.name || `${student.firstName} ${student.lastName}`} has enrolled in ${course.title}`,
            relatedId: course.id,
            relatedType: 'course',
            isRead: false
          });
        }
      }

      res.status(201).json(enrollment);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/enrollments/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const updates = insertEnrollmentSchema.partial().parse(req.body);
      const currentUserId = req.userId;

      // Get current user and enrollment
      const currentUser = await storage.getUser(currentUserId);
      const enrollment = await storage.getEnrollment(req.params.id);

      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      // Security: Only admins can update enrollments
      // (Enrollments table only has id, studentId, courseId, enrolledAt - no other fields to update)
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can update enrollments" });
      }

      // Prevent changing the core relationship fields
      if (updates.studentId || updates.courseId) {
        return res.status(400).json({ error: "Cannot change studentId or courseId. Delete and recreate the enrollment instead." });
      }

      const updatedEnrollment = await storage.updateEnrollment(req.params.id, updates);
      res.json(updatedEnrollment);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/enrollments/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUserId = req.userId;

      // Get current user and enrollment
      const currentUser = await storage.getUser(currentUserId);
      const enrollment = await storage.getEnrollment(req.params.id);

      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }
      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      // Security: Only admins and the enrolled student can delete enrollments
      if (currentUser.role !== 'admin' && enrollment.studentId !== currentUserId) {
        return res.status(403).json({ error: "Unauthorized to delete this enrollment" });
      }

      const success = await storage.deleteEnrollment(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Approve enrollment (admin only)
  app.put("/api/enrollments/:id/approve", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUserId = req.userId;

      // Get current user
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Security: Only admins can approve enrollments
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can approve enrollments" });
      }

      // Get enrollment
      const enrollment = await storage.getEnrollment(req.params.id);
      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      // Check if already approved
      if (enrollment.approvalStatus === 'approved') {
        return res.status(400).json({ error: "Enrollment is already approved" });
      }

      // Approve the enrollment
      const updatedEnrollment = await storage.updateEnrollment(req.params.id, {
        approvalStatus: 'approved',
        approvedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null
      });

      // Get student and course details for notifications
      const student = await storage.getUser(enrollment.studentId);
      const course = await storage.getCourse(enrollment.courseId);

      if (student && course) {
        // Notify the student
        await storage.createNotification({
          userId: student.id,
          type: 'enrollment_approved',
          title: 'Enrollment Approved',
          message: `Your enrollment in ${course.title} has been approved.`,
          relatedId: course.id,
          relatedType: 'course',
          isRead: false
        });
      }

      res.json(updatedEnrollment);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Reject enrollment (admin only)
  app.put("/api/enrollments/:id/reject", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUserId = req.userId;
      const { rejectionReason } = req.body;

      // Get current user
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Security: Only admins can reject enrollments
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can reject enrollments" });
      }

      // Get enrollment
      const enrollment = await storage.getEnrollment(req.params.id);
      if (!enrollment) {
        return res.status(404).json({ error: "Enrollment not found" });
      }

      // Check if already rejected
      if (enrollment.approvalStatus === 'rejected') {
        return res.status(400).json({ error: "Enrollment is already rejected" });
      }

      // Reject the enrollment
      const updatedEnrollment = await storage.updateEnrollment(req.params.id, {
        approvalStatus: 'rejected',
        rejectedAt: new Date(),
        approvedAt: null,
        rejectionReason: rejectionReason || 'No reason provided'
      });

      // Get student and course details for notifications
      const student = await storage.getUser(enrollment.studentId);
      const course = await storage.getCourse(enrollment.courseId);

      if (student && course) {
        // Notify the student
        await storage.createNotification({
          userId: student.id,
          type: 'enrollment_rejected',
          title: 'Enrollment Rejected',
          message: `Your enrollment in ${course.title} has been rejected. Reason: ${rejectionReason || 'No reason provided'}`,
          relatedId: course.id,
          relatedType: 'course',
          isRead: false
        });
      }

      res.json(updatedEnrollment);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin-only route to enroll non-enrolled students to a course
  app.post("/api/admin/courses/:courseId/enroll-student", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUserId = req.userId;
      const { studentId } = req.body;
      const { courseId } = req.params;

      // Get current user to check their role
      const currentUser = await storage.getUser(currentUserId);
      if (!currentUser) {
        return res.status(401).json({ error: "User not found" });
      }

      // Security: Only admins can use this endpoint
      if (currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can enroll students" });
      }

      // Validate studentId is provided
      if (!studentId) {
        return res.status(400).json({ error: "Student ID is required" });
      }

      // Check if student exists and is a student
      const student = await storage.getUser(studentId);
      if (!student) {
        return res.status(404).json({ error: "Student not found" });
      }
      if (student.role !== 'student') {
        return res.status(400).json({ error: "User is not a student" });
      }

      // Check if course exists
      const course = await storage.getCourse(courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Check if student already enrolled in this course
      const existingEnrollments = await storage.getEnrollmentsByStudent(studentId);
      const alreadyEnrolled = existingEnrollments.some(e => e.courseId === courseId);
      if (alreadyEnrolled) {
        return res.status(400).json({ error: "Student is already enrolled in this course" });
      }

      // Create enrollment with approved status
      const enrollment = await storage.createEnrollment({
        studentId,
        courseId,
        approvalStatus: 'approved',
        approvedAt: new Date()
      });

      // Create notification for the student
      await storage.createNotification({
        userId: studentId,
        type: 'enrollment_approved',
        title: 'Enrolled in Course',
        message: `You have been enrolled in ${course.title} by an administrator`,
        relatedId: courseId,
        relatedType: 'course',
        isRead: false
      });

      res.status(201).json(enrollment);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Enrollment Request routes
  app.get("/api/enrollment-requests/:id", async (req, res) => {
    try {
      const request = await storage.getEnrollmentRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Enrollment request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/enrollment-requests", async (req, res) => {
    try {
      const status = req.query.status as "requested" | "parent_approved" | "admin_approved" | "enrolled" | "rejected" | undefined;
      const studentId = req.query.studentId as string | undefined;
      const parentId = req.query.parentId as string | undefined;

      if (status) {
        const requests = await storage.getEnrollmentRequestsByStatus(status);
        res.json(requests);
      } else if (studentId) {
        const requests = await storage.getEnrollmentRequestsByStudent(studentId);
        res.json(requests);
      } else if (parentId) {
        const requests = await storage.getEnrollmentRequestsByParent(parentId);
        res.json(requests);
      } else {
        const requests = await storage.getAllEnrollmentRequests();
        res.json(requests);
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/enrollment-requests", async (req, res) => {
    try {
      const validatedData = insertEnrollmentRequestSchema.parse(req.body);
      const request = await storage.createEnrollmentRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.patch("/api/enrollment-requests/:id", async (req, res) => {
    try {
      const updates = insertEnrollmentRequestSchema.partial().parse(req.body);
      const request = await storage.updateEnrollmentRequest(req.params.id, updates);
      if (!request) {
        return res.status(404).json({ error: "Enrollment request not found" });
      }
      res.json(request);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/enrollment-requests/:id", async (req, res) => {
    try {
      const success = await storage.deleteEnrollmentRequest(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Enrollment request not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Special enrollment request route: student requests enrollment
  app.post("/api/courses/:courseId/enrollment-request", async (req, res) => {
    try {
      const { studentId, parentId, notes } = req.body;
      const courseId = req.params.courseId;

      if (!studentId || !parentId) {
        return res.status(400).json({ error: "Student ID and Parent ID are required" });
      }

      const requestData = {
        studentId,
        parentId,
        courseId,
        notes: notes || null,
        status: 'requested' as const
      };

      const validatedData = insertEnrollmentRequestSchema.parse(requestData);
      const request = await storage.createEnrollmentRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Parent approval route - creates the actual enrollment
  app.patch("/api/enrollment-requests/:id/parent-approve", async (req, res) => {
    try {
      const request = await storage.getEnrollmentRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Enrollment request not found" });
      }

      if (request.status !== 'requested') {
        return res.status(400).json({ error: "Request is not in a state that can be parent-approved" });
      }

      // Create the actual enrollment
      const enrollment = await storage.createEnrollment({
        studentId: request.studentId,
        courseId: request.courseId
      });

      // Mark request as enrolled (skip admin approval step)
      const updatedRequest = await storage.updateEnrollmentRequest(req.params.id, {
        status: 'enrolled'
      });

      // Get course details for notification
      const course = await storage.getCourse(request.courseId);

      // Create notification for student
      await storage.createNotification({
        userId: request.studentId,
        type: 'enrollment_approved',
        title: 'Enrollment Approved',
        message: `Your enrollment in ${course?.title || 'the course'} has been approved!`,
        relatedId: request.courseId,
        relatedType: 'course',
        isRead: false
      });

      res.json({ enrollment, request: updatedRequest });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin approval route - this creates the actual enrollment
  app.patch("/api/enrollment-requests/:id/admin-approve", async (req, res) => {
    try {
      const request = await storage.getEnrollmentRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Enrollment request not found" });
      }

      if (request.status !== 'parent_approved') {
        return res.status(400).json({ error: "Request must be parent-approved before admin approval" });
      }

      // Create the actual enrollment
      const enrollment = await storage.createEnrollment({
        studentId: request.studentId,
        courseId: request.courseId
      });

      // Mark request as enrolled
      const updatedRequest = await storage.updateEnrollmentRequest(req.params.id, {
        status: 'enrolled'
      });

      res.json({ enrollment, request: updatedRequest });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Reject enrollment request route
  app.patch("/api/enrollment-requests/:id/reject", async (req, res) => {
    try {
      const { rejectionReason } = req.body;

      const request = await storage.getEnrollmentRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Enrollment request not found" });
      }

      const updatedRequest = await storage.updateEnrollmentRequest(req.params.id, {
        status: 'rejected',
        rejectionReason: rejectionReason || null
      });

      // Get course details for notification
      const course = await storage.getCourse(request.courseId);

      // Create notification for student
      await storage.createNotification({
        userId: request.studentId,
        type: 'enrollment_rejected',
        title: 'Enrollment Request Declined',
        message: `Your enrollment request for ${course?.title || 'the course'} was declined. ${rejectionReason ? `Reason: ${rejectionReason}` : ''}`,
        relatedId: request.courseId,
        relatedType: 'course',
        isRead: false
      });

      res.json(updatedRequest);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ===========================================
  // Course Activation Request Routes
  // ===========================================

  // Get all course activation requests
  app.get("/api/course-activation-requests", async (req, res) => {
    try {
      const { status, teacherId, parentId } = req.query;

      let requests;
      if (status) {
        requests = await storage.getCourseActivationRequestsByStatus(status as any);
      } else if (teacherId) {
        requests = await storage.getCourseActivationRequestsByTeacher(teacherId as string);
      } else if (parentId) {
        requests = await storage.getCourseActivationRequestsByParent(parentId as string);
      } else {
        requests = await storage.getAllCourseActivationRequests();
      }

      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get specific course activation request
  app.get("/api/course-activation-requests/:id", async (req, res) => {
    try {
      const request = await storage.getCourseActivationRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Course activation request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get course activation request by course ID
  app.get("/api/courses/:courseId/activation-request", async (req, res) => {
    try {
      const request = await storage.getCourseActivationRequestByCourse(req.params.courseId);
      if (!request) {
        return res.status(404).json({ error: "Course activation request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Create course activation request
  app.post("/api/course-activation-requests", async (req, res) => {
    try {
      const validatedData = insertCourseActivationRequestSchema.parse(req.body);
      const request = await storage.createCourseActivationRequest(validatedData);
      res.status(201).json(request);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Submit course for activation (teacher workflow)
  app.post("/api/courses/:courseId/submit-for-activation", async (req, res) => {
    try {
      const { childId } = req.body;

      if (!childId) {
        return res.status(400).json({ error: "childId is required" });
      }

      const request = await storage.submitCourseForActivation(req.params.courseId, childId);
      res.status(201).json(request);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Parent authorize course activation
  app.patch("/api/course-activation-requests/:id/parent-authorize", async (req, res) => {
    try {
      const { parentId, notes } = req.body;

      if (!parentId) {
        return res.status(400).json({ error: "parentId is required" });
      }

      const request = await storage.authorizeCourseActivation(req.params.id, parentId, notes);
      res.json(request);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin verify course activation
  app.patch("/api/course-activation-requests/:id/admin-verify", async (req, res) => {
    try {
      const { adminId, notes } = req.body;

      if (!adminId) {
        return res.status(400).json({ error: "adminId is required" });
      }

      const request = await storage.verifyCourseActivation(req.params.id, adminId, notes);
      res.json(request);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Reject course activation
  app.patch("/api/course-activation-requests/:id/reject", async (req, res) => {
    try {
      const { rejectionReason, rejectedBy } = req.body;

      if (!rejectionReason || !rejectedBy) {
        return res.status(400).json({ error: "rejectionReason and rejectedBy are required" });
      }

      const request = await storage.rejectCourseActivation(req.params.id, rejectionReason, rejectedBy);
      res.json(request);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update course activation request
  app.patch("/api/course-activation-requests/:id", async (req, res) => {
    try {
      const validatedData = insertCourseActivationRequestSchema.partial().parse(req.body);
      const request = await storage.updateCourseActivationRequest(req.params.id, validatedData);
      if (!request) {
        return res.status(404).json({ error: "Course activation request not found" });
      }
      res.json(request);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete course activation request
  app.delete("/api/course-activation-requests/:id", async (req, res) => {
    try {
      const success = await storage.deleteCourseActivationRequest(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Course activation request not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ===========================================
  // Student-Teacher Assignment Routes
  // ===========================================

  // Get all student-teacher assignments
  app.get("/api/student-teacher-assignments", jwtAuthMiddleware, async (req, res) => {
    try {
      const assignments = await storage.getAllStudentTeacherAssignments();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get all teacher assignments for a course
  app.get("/api/student-teacher-assignments/course/:courseId", jwtAuthMiddleware, async (req, res) => {
    try {
      const assignments = await storage.getStudentTeacherAssignmentsByCourse(req.params.courseId);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get all teacher assignments for a student
  app.get("/api/student-teacher-assignments/student/:studentId", jwtAuthMiddleware, async (req, res) => {
    try {
      const assignments = await storage.getAssignmentsByStudent(req.params.studentId);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Create a new teacher assignment for a student
  app.post("/api/student-teacher-assignments", jwtAuthMiddleware, async (req, res) => {
    try {
      const validatedData = insertStudentTeacherAssignmentSchema.parse(req.body);
      const assignment = await storage.createStudentTeacherAssignment(validatedData);

      // Get student, teacher, and course details for notifications
      const student = await storage.getUser(assignment.studentId);
      const teacher = await storage.getUser(assignment.teacherId);
      const course = await storage.getCourse(assignment.courseId);

      if (student && teacher && course) {
        // Create notification for student
        await storage.createNotification({
          userId: student.id,
          type: 'teacher_assigned',
          title: 'Teacher Assigned',
          message: `${teacher.name || `${teacher.firstName} ${teacher.lastName}`} has been assigned as your teacher for ${course.title}`,
          relatedId: course.id,
          relatedType: 'course',
          isRead: false
        });

        // Create notification for parent if student has one
        const parentRelationships = await storage.getParentsByChild(student.id);
        if (parentRelationships.length > 0) {
          const parentId = parentRelationships[0].parentId;
          await storage.createNotification({
            userId: parentId,
            type: 'teacher_assigned',
            title: 'Teacher Assigned to Your Child',
            message: `${teacher.name || `${teacher.firstName} ${teacher.lastName}`} has been assigned as the teacher for ${student.name || `${student.firstName} ${student.lastName}`} in ${course.title}`,
            relatedId: course.id,
            relatedType: 'course',
            isRead: false
          });
        }
      }

      res.status(201).json(assignment);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update a teacher assignment
  app.put("/api/student-teacher-assignments/:id", jwtAuthMiddleware, async (req, res) => {
    try {
      const updates = insertStudentTeacherAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateStudentTeacherAssignment(req.params.id, updates);
      if (!assignment) {
        return res.status(404).json({ error: "Teacher assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete a teacher assignment
  app.delete("/api/student-teacher-assignments/:id", jwtAuthMiddleware, async (req, res) => {
    try {
      const success = await storage.deleteStudentTeacherAssignment(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Teacher assignment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Student-specific routes
  app.get("/api/enrollments/user/:userId", async (req, res) => {
    try {
      const enrollments = await storage.getEnrollmentsByStudent(req.params.userId);
      res.json(enrollments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/courses", async (req, res) => {
    try {
      // Get enrolled courses
      const enrollments = await storage.getEnrollmentsByStudent(req.params.studentId);
      const enrolledCourseIds = enrollments.map(e => e.courseId);

      // Get parent-approved enrollment requests
      const studentEnrollmentRequests = await storage.getEnrollmentRequestsByStudent(req.params.studentId);
      const approvedRequests = studentEnrollmentRequests.filter(
        request => request.status === 'parent_approved'
      );
      const approvedCourseIds = approvedRequests.map(request => request.courseId);

      // Combine unique course IDs
      const allCourseIdsArray = [...enrolledCourseIds, ...approvedCourseIds];
      const allCourseIds = Array.from(new Set(allCourseIdsArray));

      const courses = [];
      for (const courseId of allCourseIds) {
        const course = await storage.getCourse(courseId);
        // Only include active courses
        if (course && course.isActive) {
          // Add enrollment status metadata
          const isEnrolled = enrolledCourseIds.includes(courseId);
          const isApproved = approvedCourseIds.includes(courseId);
          courses.push({
            ...course,
            enrollmentStatus: isEnrolled ? 'enrolled' : (isApproved ? 'approved' : 'none')
          });
        }
      }
      res.json(courses);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/assignments", async (req, res) => {
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
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/submissions/student/:studentId", async (req, res) => {
    try {
      const submissions = await storage.getSubmissionsByStudent(req.params.studentId);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/grades/student/:studentId", async (req, res) => {
    try {
      const grades = await storage.getGradesByStudent(req.params.studentId);
      res.json(grades);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Comprehensive student history endpoint with all related data
  app.get("/api/students/:studentId/history", async (req, res) => {
    try {
      const studentId = req.params.studentId;

      // Get actual enrollments
      const actualEnrollments = await storage.getEnrollmentsByStudent(studentId);
      const actualEnrollmentsWithCourses = await Promise.all(
        actualEnrollments.map(async (enrollment) => {
          const course = await storage.getCourse(enrollment.courseId);
          return { ...enrollment, course };
        })
      );

      // Get parent-approved enrollment requests (treated as enrollments for history)
      const studentEnrollmentRequests = await storage.getEnrollmentRequestsByStudent(studentId);
      const approvedRequests = studentEnrollmentRequests.filter(
        request => request.status === 'parent_approved'
      );

      // Convert approved requests to enrollment-like objects with course details
      const approvedRequestsWithCourses = await Promise.all(
        approvedRequests.map(async (request) => {
          const course = await storage.getCourse(request.courseId);
          // Create an enrollment-like object from the request
          return {
            id: request.id,
            studentId: request.studentId,
            courseId: request.courseId,
            enrolledAt: request.requestedAt || new Date().toISOString(),
            course
          };
        })
      );

      // Combine actual enrollments and approved requests
      const allEnrollments = [...actualEnrollmentsWithCourses, ...approvedRequestsWithCourses];

      // Get submissions with assignment and grade details
      const submissions = await storage.getSubmissionsByStudent(studentId);
      const submissionsWithDetails = await Promise.all(
        submissions.map(async (submission) => {
          const assignment = await storage.getAssignment(submission.assignmentId);
          const grade = await storage.getGradeBySubmission(submission.id);
          return { ...submission, assignment, grade };
        })
      );

      // Get grades with submission and assignment details
      const grades = await storage.getGradesByStudent(studentId);
      const gradesWithDetails = await Promise.all(
        grades.map(async (grade) => {
          const submission = await storage.getSubmission(grade.submissionId);
          if (submission) {
            const assignment = await storage.getAssignment(submission.assignmentId);
            return { ...grade, submission: { ...submission, assignment } };
          }
          return grade;
        })
      );

      res.json({
        enrollments: allEnrollments,
        submissions: submissionsWithDetails,
        grades: gradesWithDetails,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/teachers", async (req, res) => {
    try {
      // Get student's enrolled courses
      const enrollments = await storage.getEnrollmentsByStudent(req.params.studentId);
      const courseIds = enrollments.map(e => e.courseId);

      // Get teacher IDs from both course defaults and student-teacher assignments
      const teacherIds = new Set<string>();

      // Add default course teachers
      for (const courseId of courseIds) {
        const course = await storage.getCourse(courseId);
        if (course && course.teacherId) {
          teacherIds.add(course.teacherId);
        }
      }

      // Add assigned teachers from student-teacher assignments
      const studentAssignments = await storage.getAssignmentsByStudent(req.params.studentId);
      for (const assignment of studentAssignments) {
        if (assignment.teacherId) {
          teacherIds.add(assignment.teacherId);
        }
      }

      // Get only the teachers for this student's courses
      const teachers = [];
      for (const teacherId of Array.from(teacherIds)) {
        const teacher = await storage.getUser(teacherId);
        if (teacher && teacher.role === 'teacher') {
          teachers.push(teacher);
        }
      }

      res.json(teachers);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Teacher-specific routes
  app.get("/api/teachers/:teacherId/courses", async (req, res) => {
    try {
      const teacherId = req.params.teacherId;

      // Get ONLY courses where teacher has explicit student assignments with non-null teacherId
      // Teachers must NOT see courses unless they are explicitly assigned by admin
      const teacherAssignments = await storage.getAssignmentsByTeacher(teacherId);

      // Filter to only assignments where teacherId is explicitly set (not null)
      const validAssignments = teacherAssignments.filter(a => a.teacherId !== null && a.teacherId !== undefined);
      const assignedCourseIds = new Set(validAssignments.map(a => a.courseId));

      // Get the assigned courses
      const courses = [];
      for (const courseId of Array.from(assignedCourseIds)) {
        const course = await storage.getCourse(courseId);
        if (course) {
          courses.push(course);
        }
      }

      res.json(courses);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/teacher/assignments/:teacherId", jwtAuthMiddleware, async (req, res) => {
    try {
      const assignments = await storage.getPublishedTeacherAssignments(req.params.teacherId);
      const statsMap = await storage.getTeacherAssignmentStats(req.params.teacherId);

      // Get unique course IDs and fetch course data
      const courseIds = [...new Set(assignments.map(a => a.courseId))];
      const courseMap: Record<string, { id: string; title: string }> = {};
      for (const courseId of courseIds) {
        const course = await storage.getCourse(courseId);
        if (course) {
          courseMap[courseId] = { id: course.id, title: course.title };
        }
      }

      // Get all submissions for this teacher's assignments to track who submitted
      const allSubmissions = await storage.getAllSubmissions();
      const assignmentSubmissionsMap: Record<string, string[]> = {};
      for (const submission of allSubmissions) {
        const assignment = assignments.find(a => a.id === submission.assignmentId);
        if (assignment) {
          if (!assignmentSubmissionsMap[submission.assignmentId]) {
            assignmentSubmissionsMap[submission.assignmentId] = [];
          }
          assignmentSubmissionsMap[submission.assignmentId].push(submission.studentId);
        }
      }

      // Enrich each assignment with its stats, course info, assigned student IDs, and submitted student IDs
      const enrichedAssignments = await Promise.all(assignments.map(async (assignment) => {
        let assignedStudentIds: string[] = [];

        if (!assignment.isShared) {
          const mappings = await storage.getIndividualAssignmentMappingsByAssignment(assignment.id);
          assignedStudentIds = mappings.map(m => m.studentId);
        }

        return {
          ...assignment,
          stats: {
            totalSubmissions: statsMap[assignment.id]?.totalSubmissions ?? 0,
            gradedCount: statsMap[assignment.id]?.gradedCount ?? 0,
            ungradedCount: statsMap[assignment.id]?.ungradedCount ?? 0
          },
          course: courseMap[assignment.courseId] || null,
          assignedStudentIds,
          submittedStudentIds: assignmentSubmissionsMap[assignment.id] || []
        };
      }));

      res.json(enrichedAssignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/teachers/:teacherId/students", async (req, res) => {
    try {
      const teacherId = req.params.teacherId;
      // 1. Get students from teacher's courses (primary teacher role)
      const courses = await storage.getCoursesByTeacher(teacherId);
      const courseIds = courses.map(c => c.id);

      const studentIds = new Set<string>();

      for (const courseId of courseIds) {
        const enrollments = await storage.getEnrollmentsByCourse(courseId);
        enrollments.filter(e => e.approvalStatus === 'approved').forEach(enrollment => {
          studentIds.add(enrollment.studentId);
        });
      }

      // 2. Get students explicitly assigned to this teacher via student_teacher_assignments
      const explicitAssignments = await storage.getAssignmentsByTeacher(teacherId);
      explicitAssignments.forEach(assignment => {
        studentIds.add(assignment.studentId);
      });

      // Get student details
      const students = [];
      const studentIdArray = Array.from(studentIds);

      for (const studentId of studentIdArray) {
        const student = await storage.getUser(studentId);
        if (student && student.role === 'student') {
          students.push({
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            name: student.name,
            email: student.email,
            avatarUrl: student.avatarUrl,
            profileImageUrl: student.profileImageUrl,
          });
        }
      }

      res.json(students);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get students explicitly assigned to a teacher in a specific course
  app.get("/api/courses/:courseId/assigned-students/:teacherId", async (req, res) => {
    try {
      const { courseId, teacherId } = req.params;

      // Get all student-teacher assignments for this course
      const assignments = await storage.getStudentTeacherAssignmentsByCourse(courseId);

      // Filter for only assignments to this teacher
      const assignedStudentIds = assignments
        .filter(a => a.teacherId === teacherId)
        .map(a => a.studentId);

      // Get student details
      const students = [];
      for (const studentId of assignedStudentIds) {
        const student = await storage.getUser(studentId);
        if (student && student.role === 'student') {
          students.push({
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            name: student.name,
            email: student.email,
            avatarUrl: student.avatarUrl,
            profileImageUrl: student.profileImageUrl,
          });
        }
      }

      res.json(students);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get recent enrollments for teacher's courses (with student and course details)
  app.get("/api/teachers/:teacherId/recent-enrollments", async (req, res) => {
    try {
      // Get teacher's courses
      const courses = await storage.getCoursesByTeacher(req.params.teacherId);
      const courseMap = new Map(courses.map(c => [c.id, c]));

      // Get all enrollments for teacher's courses with enrollment dates
      const allEnrollments: Array<{
        id: string;
        studentId: string;
        courseId: string;
        enrolledAt: Date | null;
        approvalStatus: string;
        student: any;
        course: any;
      }> = [];

      for (const course of courses) {
        const enrollments = await storage.getEnrollmentsByCourse(course.id);
        for (const enrollment of enrollments) {
          // Only include approved enrollments
          if (enrollment.approvalStatus === 'approved') {
            const student = await storage.getUser(enrollment.studentId);
            if (student && student.role === 'student') {
              allEnrollments.push({
                id: enrollment.id,
                studentId: enrollment.studentId,
                courseId: enrollment.courseId,
                enrolledAt: enrollment.enrolledAt,
                approvalStatus: enrollment.approvalStatus,
                student: {
                  id: student.id,
                  firstName: student.firstName,
                  lastName: student.lastName,
                  email: student.email,
                  avatarUrl: student.avatarUrl,
                },
                course: {
                  id: course.id,
                  title: course.title,
                  subject: course.subject,
                },
              });
            }
          }
        }
      }

      // Sort by enrollment date (most recent first) and limit to 10
      allEnrollments.sort((a, b) => {
        const dateA = a.enrolledAt ? new Date(a.enrolledAt).getTime() : 0;
        const dateB = b.enrolledAt ? new Date(b.enrolledAt).getTime() : 0;
        return dateB - dateA;
      });

      res.json(allEnrollments.slice(0, 10));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/teachers/:teacherId/submissions", async (req, res) => {
    try {
      // Get teacher's courses
      const courses = await storage.getCoursesByTeacher(req.params.teacherId);
      const courseIds = courses.map(c => c.id);

      // Get assignments for teacher's courses
      const assignments = [];
      for (const courseId of courseIds) {
        const courseAssignments = await storage.getAssignmentsByCourse(courseId);
        assignments.push(...courseAssignments);
      }

      // Get submissions for these assignments
      const submissions = [];
      for (const assignment of assignments) {
        const assignmentSubmissions = await storage.getSubmissionsByAssignment(assignment.id);
        submissions.push(...assignmentSubmissions);
      }

      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/teachers/:teacherId/messages", async (req, res) => {
    try {
      const messages = await storage.getMessagesByRecipient(req.params.teacherId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Teacher Analytics endpoint - returns comprehensive analytics data
  app.get("/api/teacher/analytics/:teacherId", jwtAuthMiddleware, async (req, res) => {
    try {
      const { teacherId } = req.params;

      // Get teacher's courses (where they are the main teacher)
      const mainCourses = await storage.getCoursesByTeacher(teacherId);

      // Also get courses where teacher is assigned via student-teacher-assignments
      const teacherAssignments = await storage.getAssignmentsByTeacher(teacherId);
      const assignedCourseIds = [...new Set(teacherAssignments.map(a => a.courseId))];

      // Get full course data for assigned courses
      const assignedCourses = [];
      for (const courseId of assignedCourseIds) {
        const course = await storage.getCourse(courseId);
        if (course && !mainCourses.find(c => c.id === course.id)) {
          assignedCourses.push(course);
        }
      }

      // Combine all courses (main + assigned)
      const courses = [...mainCourses, ...assignedCourses];
      const courseIds = courses.map(c => c.id);

      // Initialize analytics data
      const coursePerformance: Array<{
        courseId: string;
        courseName: string;
        averageGrade: number;
        studentCount: number;
        assignmentCount: number;
        completionRate: number;
      }> = [];

      let totalStudents = 0;
      let passingStudents = 0;
      let strugglingStudents = 0;
      let honorStudents = 0;
      let totalAssignments = 0;
      let gradedAssignments = 0;
      let totalScore = 0;
      let totalGrades = 0;
      let totalSubmissions = 0;
      let expectedSubmissions = 0;

      // Track unique students to avoid double counting
      const uniqueStudentIds = new Set<string>();
      const studentGrades: Map<string, number[]> = new Map();

      for (const course of courses) {
        // Get enrollments for this course
        const enrollments = await storage.getEnrollmentsByCourse(course.id);
        const approvedEnrollments = enrollments.filter(e => e.approvalStatus === 'approved');
        const courseStudentCount = approvedEnrollments.length;

        // Track unique students
        approvedEnrollments.forEach(e => uniqueStudentIds.add(e.studentId));

        // Get assignments for this course
        const assignments = await storage.getAssignmentsByCourse(course.id);
        const courseAssignmentCount = assignments.length;
        totalAssignments += courseAssignmentCount;

        // Calculate expected submissions (students × assignments)
        expectedSubmissions += courseStudentCount * courseAssignmentCount;

        let courseGradeSum = 0;
        let courseGradeCount = 0;
        let courseSubmissionCount = 0;

        for (const assignment of assignments) {
          // Get submissions for this assignment
          const submissions = await storage.getSubmissionsByAssignment(assignment.id);
          courseSubmissionCount += submissions.length;
          totalSubmissions += submissions.length;

          for (const submission of submissions) {
            // Get grade for this submission
            const grade = await storage.getGradeBySubmission(submission.id);
            if (grade) {
              gradedAssignments++;
              courseGradeSum += grade.score;
              courseGradeCount++;
              totalScore += grade.score;
              totalGrades++;

              // Track individual student grades
              if (!studentGrades.has(submission.studentId)) {
                studentGrades.set(submission.studentId, []);
              }
              studentGrades.get(submission.studentId)!.push(grade.score);
            }
          }
        }

        const courseAvgGrade = courseGradeCount > 0 ? courseGradeSum / courseGradeCount : 0;
        const courseCompletionRate = expectedSubmissions > 0
          ? (courseSubmissionCount / (courseStudentCount * courseAssignmentCount)) * 100
          : 0;

        coursePerformance.push({
          courseId: course.id,
          courseName: course.title,
          averageGrade: courseAvgGrade,
          studentCount: courseStudentCount,
          assignmentCount: courseAssignmentCount,
          completionRate: isNaN(courseCompletionRate) ? 0 : courseCompletionRate,
        });
      }

      // Calculate student performance distribution
      totalStudents = uniqueStudentIds.size;

      studentGrades.forEach((grades, studentId) => {
        if (grades.length > 0) {
          const avgGrade = grades.reduce((a, b) => a + b, 0) / grades.length;
          if (avgGrade >= 90) {
            honorStudents++;
          } else if (avgGrade >= 70) {
            passingStudents++;
          } else {
            strugglingStudents++;
          }
        }
      });

      // Calculate overall stats
      const averageScore = totalGrades > 0 ? totalScore / totalGrades : 0;
      const submissionRate = expectedSubmissions > 0 ? (totalSubmissions / expectedSubmissions) * 100 : 0;

      res.json({
        coursePerformance,
        studentProgress: {
          totalStudents,
          passingStudents,
          strugglingStudents,
          honorStudents,
        },
        assignmentStats: {
          totalAssignments,
          gradedAssignments,
          averageScore,
          submissionRate: isNaN(submissionRate) ? 0 : submissionRate,
        },
        attendanceData: {
          averageAttendance: 0, // Attendance tracking not fully implemented
          presentStudents: 0,
          absentStudents: 0,
          lateStudents: 0,
        },
      });
    } catch (error) {
      console.error("Teacher analytics error:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Teacher-scoped student detail endpoint - returns only data relevant to teacher's courses
  app.get("/api/teachers/:teacherId/students/:studentId", jwtAuthMiddleware, async (req, res) => {
    try {
      const { teacherId, studentId } = req.params;

      // Get teacher's courses
      const teacherCourses = await storage.getCoursesByTeacher(teacherId);
      const teacherCourseIds = teacherCourses.map(c => c.id);

      if (teacherCourseIds.length === 0) {
        return res.status(403).json({ error: "Teacher has no courses" });
      }

      // Check if student is enrolled in any of teacher's courses
      let isEnrolledInTeacherCourse = false;
      const studentEnrollmentsInTeacherCourses: Array<{ courseId: string; enrolledAt: Date | null; approvalStatus: string }> = [];

      for (const courseId of teacherCourseIds) {
        const enrollments = await storage.getEnrollmentsByCourse(courseId);
        const studentEnrollment = enrollments.find(e => e.studentId === studentId && e.approvalStatus === 'approved');
        if (studentEnrollment) {
          isEnrolledInTeacherCourse = true;
          studentEnrollmentsInTeacherCourses.push({
            courseId: studentEnrollment.courseId,
            enrolledAt: studentEnrollment.enrolledAt,
            approvalStatus: studentEnrollment.approvalStatus,
          });
        }
      }

      if (!isEnrolledInTeacherCourse) {
        return res.status(403).json({ error: "Student is not enrolled in any of your courses" });
      }

      // Get student basic info (limited fields)
      const student = await storage.getUser(studentId);
      if (!student || student.role !== 'student') {
        return res.status(404).json({ error: "Student not found" });
      }

      // Build limited student data
      const limitedStudentData = {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        name: student.name,
        email: student.email,
        avatarUrl: student.avatarUrl,
        profileImageUrl: student.profileImageUrl,
      };

      // Get courses that THIS teacher teaches AND student is enrolled in
      const enrolledTeacherCourses = teacherCourses
        .filter(course => studentEnrollmentsInTeacherCourses.some(e => e.courseId === course.id))
        .map(course => ({
          id: course.id,
          title: course.title,
          subject: course.subject,
          grade: course.grade,
          isActive: course.isActive,
          enrolledAt: studentEnrollmentsInTeacherCourses.find(e => e.courseId === course.id)?.enrolledAt,
        }));

      // Get assignments only from teacher's courses
      const teacherAssignments = [];
      for (const courseId of teacherCourseIds) {
        const courseAssignments = await storage.getAssignmentsByCourse(courseId);
        teacherAssignments.push(...courseAssignments);
      }

      // Get student's submissions only for teacher's assignments
      const studentSubmissions = [];
      for (const assignment of teacherAssignments) {
        const submissions = await storage.getSubmissionsByAssignment(assignment.id);
        const studentSubmission = submissions.find(s => s.studentId === studentId);
        if (studentSubmission) {
          studentSubmissions.push({
            ...studentSubmission,
            assignmentTitle: assignment.title,
            courseId: assignment.courseId,
          });
        }
      }

      // Get grades for student's submissions in teacher's courses
      const studentGrades = [];
      for (const submission of studentSubmissions) {
        const grade = await storage.getGradeBySubmission(submission.id);
        if (grade) {
          studentGrades.push(grade);
        }
      }

      // Get attendance only for teacher's courses
      const studentAttendance = await storage.getAttendanceByStudent(studentId);
      const teacherCourseAttendance = studentAttendance.filter(a => teacherCourseIds.includes(a.courseId));

      // Get course titles for each submission
      const courseMap: Record<string, string> = {};
      for (const course of enrolledTeacherCourses) {
        courseMap[course.id] = course.title;
      }

      // Enhance submissions with course title
      const enhancedSubmissions = studentSubmissions.map(sub => ({
        ...sub,
        courseTitle: courseMap[sub.courseId] || 'Unknown Course',
      }));

      // Also return assignments that the student could have submitted to
      const teacherAssignmentsForResponse = teacherAssignments
        .filter(a => a.isPublished)
        .map(a => ({
          id: a.id,
          title: a.title,
          courseId: a.courseId,
          courseTitle: courseMap[a.courseId] || 'Unknown Course',
          dueDate: a.dueDate,
          maxScore: a.maxScore,
        }));

      res.json({
        student: limitedStudentData,
        courses: enrolledTeacherCourses,
        submissions: enhancedSubmissions,
        grades: studentGrades,
        attendance: teacherCourseAttendance,
        assignments: teacherAssignmentsForResponse,
        // Explicitly NOT including: all enrollments, other courses, parent info, etc.
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Parent-specific routes
  app.get("/api/parents/:parentId/children", async (req, res) => {
    try {
      // Get parent-child relationships from the junction table
      const parentChildRelations = await storage.getChildrenByParent(req.params.parentId);

      // Get full user details for each child
      const children = await Promise.all(
        parentChildRelations.map(async (relation) => {
          const child = await storage.getUser(relation.childId);
          return child;
        })
      );

      // Filter out any null values (in case a user was deleted)
      const validChildren = children.filter(child => child !== null);

      res.json(validChildren);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/parents/:parentId/grades", async (req, res) => {
    try {
      // Get all children for this parent from parent_children table
      const parentChildRelations = await storage.getChildrenByParent(req.params.parentId);
      const children = await Promise.all(
        parentChildRelations.map(async (relation) => {
          const child = await storage.getUser(relation.childId);
          return child;
        })
      );
      const validChildren = children.filter(child => child !== null);

      // Get grades for all children and include studentId from submissions
      const allGrades = [];
      for (const child of validChildren) {
        const childGrades = await storage.getGradesByStudent(child.id);

        // Enhance grades with studentId from submissions for easy filtering on frontend
        const enhancedGrades = await Promise.all(
          childGrades.map(async (grade) => {
            const submission = await storage.getSubmission(grade.submissionId);
            return {
              ...grade,
              studentId: submission?.studentId || child.id, // Include studentId for filtering
            };
          })
        );

        allGrades.push(...enhancedGrades);
      }

      res.json(allGrades);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/parents/:parentId/attendance", async (req, res) => {
    try {
      // Get all children for this parent from parent_children table
      const parentChildRelations = await storage.getChildrenByParent(req.params.parentId);
      const children = await Promise.all(
        parentChildRelations.map(async (relation) => {
          const child = await storage.getUser(relation.childId);
          return child;
        })
      );
      const validChildren = children.filter(child => child !== null);

      // Get attendance for all children
      const allAttendance = [];
      for (const child of validChildren) {
        const childAttendance = await storage.getAttendanceByStudent(child.id);
        allAttendance.push(...childAttendance);
      }

      res.json(allAttendance);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/parents/:parentId/messages", async (req, res) => {
    try {
      const messages = await storage.getMessagesByRecipient(req.params.parentId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Parent child progress with enriched data
  app.get("/api/parent/children/:parentId", async (req, res) => {
    try {
      const parentChildRelations = await storage.getChildrenByParent(req.params.parentId);

      const childrenWithProgress = await Promise.all(
        parentChildRelations.map(async (relation) => {
          const child = await storage.getUser(relation.childId);
          if (!child) return null;

          // Get enrollments and courses
          const enrollments = await storage.getEnrollmentsByStudent(child.id);
          const enrolledCourses = await Promise.all(
            enrollments.map(async (enrollment) => {
              return await storage.getCourse(enrollment.courseId);
            })
          );
          const validCourses = enrolledCourses.filter(course => course !== null);

          // Get submissions and grades
          const submissions = await storage.getSubmissionsByStudent(child.id);
          const grades = await storage.getGradesByStudent(child.id);

          // Calculate stats
          const completedAssignments = submissions.filter(s => s.status === 'graded').length;
          const totalAssignments = submissions.length;

          // Calculate GPA from grades
          const currentGPA = grades.length > 0
            ? grades.reduce((sum, grade) => sum + grade.score, 0) / grades.length / 25
            : 0;

          // Get attendance
          const attendance = await storage.getAttendanceByStudent(child.id);
          const totalAttendance = attendance.length;
          const presentCount = attendance.filter(a => a.status === 'present').length;
          const attendanceRate = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 0;

          // Get recent grades (last 5)
          const recentGrades = grades.slice(-5).reverse();

          return {
            ...child,
            currentGPA,
            attendanceRate,
            completedAssignments,
            totalAssignments,
            enrolledCourses: validCourses,
            recentGrades,
          };
        })
      );

      const validChildren = childrenWithProgress.filter(child => child !== null);
      res.json(validChildren);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin-specific routes (platform-wide access)
  app.get("/api/admin/stats", async (req, res) => {
    try {
      const [users, courses] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllCourses()
      ]);

      // For now, we'll use simplified statistics
      const enrollments: any[] = []; // TODO: Fix getAllEnrollments method
      const grades: any[] = []; // TODO: Fix getAllGrades method

      const totalUsers = users.length;
      const activeCourses = courses.filter((course: any) => course.isActive).length;
      const totalEnrollments = enrollments.length;
      const averageGrade = grades.length > 0
        ? grades.reduce((acc: number, grade: any) => acc + grade.score, 0) / grades.length
        : 0;

      // Count users by role
      const usersByRole = users.reduce((acc: any, user: any) => {
        acc[user.role] = (acc[user.role] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        totalUsers,
        activeCourses,
        totalEnrollments,
        averageGrade: Math.round(averageGrade),
        usersByRole,
        totalCourses: courses.length,
        activeUsers: users.length, // All users are considered active for now
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Finance Admin stats endpoint (requires authentication)
  app.get("/api/finance-admin/stats", jwtAuthMiddleware, async (req: any, res) => {
    try {
      // Verify user has finance_admin or admin role
      const user = await storage.getUser(req.userId);
      if (!user || (user.role !== 'finance_admin' && user.role !== 'admin')) {
        return res.status(403).json({ error: "Access denied. Finance admin or admin role required." });
      }

      const [invoices, payments] = await Promise.all([
        storage.getAllInvoices(),
        storage.getAllPayments()
      ]);

      const completedPayments = payments.filter((p: any) => p.status === 'completed');
      const totalRevenue = completedPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

      // Calculate monthly revenue (current month)
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const monthlyPayments = completedPayments.filter((p: any) => {
        const paymentDate = new Date(p.paymentDate || p.paidAt || p.createdAt);
        return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
      });
      const monthlyRevenue = monthlyPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount || '0'), 0);

      // Calculate pending and overdue payments from invoices
      const activeInvoices = invoices.filter((inv: any) => inv.status !== 'cancelled');
      const pendingInvoices = activeInvoices.filter((inv: any) => inv.status === 'pending' || inv.status === 'overdue');
      const pendingPayments = pendingInvoices.reduce((sum: number, inv: any) => sum + parseFloat(inv.total || '0'), 0);

      const totalInvoices = activeInvoices.length;
      const paidInvoices = activeInvoices.filter((inv: any) => inv.status === 'paid').length;
      const overdueInvoices = activeInvoices.filter((inv: any) => inv.status === 'overdue').length;

      res.json({
        totalRevenue,
        monthlyRevenue,
        pendingPayments,
        totalInvoices,
        paidInvoices,
        overdueInvoices
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/analytics", async (req, res) => {
    try {
      const [users, courses, enrollments, allAssignments, allSubmissions] = await Promise.all([
        storage.getAllUsers(),
        storage.getAllCourses(),
        storage.getAllEnrollments(),
        storage.getAllAssignments(),
        storage.getAllSubmissions()
      ]);

      const now = new Date();
      const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

      const totalUsers = users.length;
      const activeUsers = users.length;
      const newUsersThisMonth = users.filter((u: any) =>
        u.createdAt && new Date(u.createdAt) >= oneMonthAgo
      ).length;
      const userGrowthRate = totalUsers > 0 ? (newUsersThisMonth / totalUsers) * 100 : 0;

      const totalCourses = courses.length;
      const activeCourses = courses.filter((c: any) => c.isActive).length;
      const totalEnrollments = enrollments.length;
      const enrollmentRate = totalCourses > 0 ? (totalEnrollments / (totalCourses * totalUsers)) * 100 : 0;
      const courseCompletionRate = 75;

      const submissionsWithGrades = allSubmissions.filter((s: any) => s.grade !== null && s.grade !== undefined);
      const averageGPA = submissionsWithGrades.length > 0
        ? submissionsWithGrades.reduce((acc: number, s: any) => acc + (s.grade || 0), 0) / submissionsWithGrades.length
        : 0;

      const attendanceRate = 85;

      const totalAssignmentsCount = allAssignments.length;
      const completedSubmissions = allSubmissions.filter((s: any) => s.submittedAt).length;
      const assignmentCompletionRate = totalAssignmentsCount > 0
        ? (completedSubmissions / totalAssignmentsCount) * 100
        : 0;

      const passRate = submissionsWithGrades.length > 0
        ? (submissionsWithGrades.filter((s: any) => (s.grade || 0) >= 60).length / submissionsWithGrades.length) * 100
        : 0;

      const uptimeSeconds = process.uptime();
      const responseTime = 45;
      const errorRate = 0.5;
      const diskUsage = 45;

      res.json({
        userMetrics: {
          totalUsers,
          activeUsers,
          newUsersThisMonth,
          userGrowthRate: Math.round(userGrowthRate * 10) / 10,
        },
        courseMetrics: {
          totalCourses,
          activeCourses,
          enrollmentRate: Math.round(enrollmentRate * 10) / 10,
          courseCompletionRate: Math.round(courseCompletionRate * 10) / 10,
        },
        performanceMetrics: {
          averageGPA: Math.round(averageGPA * 10) / 10,
          attendanceRate: Math.round(attendanceRate * 10) / 10,
          assignmentCompletionRate: Math.round(assignmentCompletionRate * 10) / 10,
          passRate: Math.round(passRate * 10) / 10,
        },
        systemHealth: {
          uptime: Math.round(uptimeSeconds),
          responseTime,
          errorRate,
          diskUsage,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/users", async (req, res) => {
    try {
      const users = await storage.getAllUsers();

      // Add join date from createdAt and basic stats
      const usersWithStats = users.map(user => ({
        ...user,
        joinDate: user.createdAt ? user.createdAt.toISOString().split('T')[0] : '2024-01-01',
        status: 'active', // For now, all users are active
      }));

      res.json(usersWithStats);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/courses", async (req, res) => {
    try {
      const [courses, users, allEnrollments] = await Promise.all([
        storage.getAllCourses(),
        storage.getAllUsers(),
        storage.getAllEnrollments()
      ]);

      // Create enrollment count map for efficient lookup
      const enrollmentCountsByCourse: Record<string, number> = {};
      allEnrollments.forEach((enrollment: any) => {
        enrollmentCountsByCourse[enrollment.courseId] = (enrollmentCountsByCourse[enrollment.courseId] || 0) + 1;
      });

      // Enhance courses with enrollment count and instructor name
      const coursesWithStats = courses.map((course: any) => {
        const instructor = users.find((u: any) => u.id === course.teacherId);

        return {
          ...course,
          studentCount: enrollmentCountsByCourse[course.id] || 0,
          instructorName: instructor?.name || 'Unknown Instructor',
          status: course.isActive ? 'active' : 'inactive',
        };
      });

      res.json(coursesWithStats);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/recent-activity", async (req, res) => {
    try {
      // TODO: Fix getAllSubmissions, getAllGrades, getAllEnrollments methods
      const submissions: any[] = [];
      const grades: any[] = [];
      const enrollments: any[] = [];

      // Recent submissions (last 7 days)
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentSubmissions = submissions.filter((sub: any) =>
        sub.submittedAt && new Date(sub.submittedAt) > weekAgo
      ).length;

      const recentGrades = grades.filter((grade: any) =>
        grade.gradedAt && new Date(grade.gradedAt) > weekAgo
      ).length;

      const recentEnrollments = enrollments.filter((enrollment: any) =>
        enrollment.enrolledAt && new Date(enrollment.enrolledAt) > weekAgo
      ).length;

      res.json({
        recentSubmissions,
        recentGrades,
        recentEnrollments,
        pendingReviews: submissions.filter((sub: any) =>
          !grades.some((grade: any) => grade.submissionId === sub.id)
        ).length,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin Password Reset Request routes
  app.get("/api/admin/password-reset-requests", jwtAuthMiddleware, async (req: any, res) => {
    try {
      // Ensure user is admin
      const adminId = (req.session as any).userId;
      const admin = await storage.getUser(adminId);
      if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can view password reset requests" });
      }

      const requests = await storage.getAllPasswordResetRequests();

      // Enrich requests with user information
      const requestsWithUsers = await Promise.all(
        requests.map(async (request) => {
          const user = await storage.getUser(request.userId);
          return {
            ...request,
            user: user ? {
              id: user.id,
              email: user.email,
              name: user.name,
              firstName: user.firstName,
              lastName: user.lastName,
              role: user.role,
            } : null,
          };
        })
      );

      res.json(requestsWithUsers);
    } catch (error) {
      console.error("Error fetching password reset requests:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/password-reset-requests/:id/approve", jwtAuthMiddleware, async (req: any, res) => {
    try {
      // Ensure user is admin
      const adminId = (req.session as any).userId;
      const admin = await storage.getUser(adminId);
      if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can approve password reset requests" });
      }

      const { id } = req.params;
      const { newPassword } = req.body;

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
      }

      // Get the password reset request
      const request = await storage.getPasswordResetRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Password reset request not found" });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({ error: "This request has already been processed" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user's password
      await storage.updateUser(request.userId, {
        password: hashedPassword,
        requiresPasswordReset: false,
      });

      // Update request status
      await storage.updatePasswordResetRequest(id, {
        status: 'approved',
        handledAt: new Date(),
        handledBy: adminId,
      });

      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Error approving password reset request:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/password-reset-requests/:id/reject", jwtAuthMiddleware, async (req: any, res) => {
    try {
      // Ensure user is admin
      const adminId = (req.session as any).userId;
      const admin = await storage.getUser(adminId);
      if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: "Only administrators can reject password reset requests" });
      }

      const { id } = req.params;
      const { rejectionReason } = req.body;

      // Get the password reset request
      const request = await storage.getPasswordResetRequest(id);
      if (!request) {
        return res.status(404).json({ error: "Password reset request not found" });
      }

      if (request.status !== 'pending') {
        return res.status(400).json({ error: "This request has already been processed" });
      }

      // Update request status
      await storage.updatePasswordResetRequest(id, {
        status: 'rejected',
        handledAt: new Date(),
        handledBy: adminId,
        rejectionReason: rejectionReason || null,
      });

      res.json({ success: true, message: "Password reset request has been rejected" });
    } catch (error) {
      console.error("Error rejecting password reset request:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Prospect Student routes (public endpoint for contact form submission)
  app.post("/api/prospect-students", async (req, res) => {
    try {
      const validatedData = insertProspectStudentSchema.parse({
        ...req.body,
        status: 'new',
        emailSent: false,
      });

      const prospect = await storage.createProspectStudent(validatedData);

      // Send confirmation email to parent/prospect
      const emailTo = validatedData.parentEmail || validatedData.zoomEmail;
      if (emailTo) {
        try {
          await sendProspectConfirmationEmail(
            emailTo,
            validatedData.parentName || '',
            validatedData.studentName,
            validatedData.formType as 'academics' | 'computer' | 'dance' | 'arts',
            validatedData.demoTime || undefined
          );
          // Update prospect to mark email as sent
          await storage.updateProspectStudent(prospect.id, { emailSent: true });
        } catch (emailError) {
          console.error("Failed to send prospect confirmation email:", emailError);
          // Don't fail the request, just log the error
        }
      }

      // Send admin notification email to elearningscenteredu@gmail.com
      try {
        await sendProspectAdminNotificationEmail(
          'elearningscenteredu@gmail.com',
          req.body,
          validatedData.formType as 'academics' | 'computer' | 'dance' | 'arts'
        );
      } catch (emailError) {
        console.error("Failed to send admin notification email:", emailError);
        // Don't fail the request, just log the error
      }

      // Create notification for all admins
      const admins = await storage.getUsersByRole('admin');
      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          type: 'prospect_student_submitted',
          title: 'New Demo Class Request',
          message: `New ${validatedData.formType} demo class registration from ${validatedData.studentName}`,
          relatedId: prospect.id,
          relatedType: 'prospect',
          isRead: false,
        });
      }

      res.status(201).json({ success: true, prospect });
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      console.error("Error creating prospect student:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Admin prospect student routes (with partner scoping for partner_admin)
  app.get("/api/admin/prospect-students/count/new", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const admin = await storage.getUser(req.userId);
      if (!admin || !['admin', 'finance_admin', 'partner_admin'].includes(admin.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      let prospects;
      if (admin.role === 'partner_admin') {
        if (!admin.partnerId) {
          return res.status(403).json({ error: 'Partner admin not assigned to any partner' });
        }
        prospects = await storage.getProspectStudentsByPartner(admin.partnerId);
      } else {
        prospects = await storage.getAllProspectStudents();
      }
      const newCount = prospects.filter(p => p.status === 'new').length;
      res.json({ count: newCount });
    } catch (error) {
      console.error("Error counting new prospect students:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/prospect-students", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const admin = await storage.getUser(req.userId);
      if (!admin || !['admin', 'finance_admin', 'partner_admin'].includes(admin.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      let prospects;
      if (admin.role === 'partner_admin') {
        if (!admin.partnerId) {
          return res.status(403).json({ error: 'Partner admin not assigned to any partner' });
        }
        prospects = await storage.getProspectStudentsByPartner(admin.partnerId);
      } else {
        prospects = await storage.getAllProspectStudents();
      }

      // Include partner info for each prospect
      const prospectsWithPartners = await Promise.all(
        prospects.map(async (prospect) => {
          if (prospect.partnerId) {
            const partner = await storage.getPartner(prospect.partnerId);
            return { ...prospect, partner: partner ? { id: partner.id, name: partner.name, status: partner.status } : null };
          }
          return { ...prospect, partner: null };
        })
      );

      res.json(prospectsWithPartners);
    } catch (error) {
      console.error("Error fetching prospect students:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/prospect-students/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const admin = await storage.getUser(req.userId);
      if (!admin || !['admin', 'finance_admin', 'partner_admin'].includes(admin.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const prospect = await storage.getProspectStudent(req.params.id);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect student not found" });
      }

      // Partner admin can only view prospects in their partner
      if (admin.role === 'partner_admin' && prospect.partnerId !== admin.partnerId) {
        return res.status(403).json({ error: "Access denied to other partner's data" });
      }

      res.json(prospect);
    } catch (error) {
      console.error("Error fetching prospect student:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/admin/prospect-students/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const admin = await storage.getUser(req.userId);
      if (!admin || !['admin', 'finance_admin', 'partner_admin'].includes(admin.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const existingProspect = await storage.getProspectStudent(req.params.id);
      if (!existingProspect) {
        return res.status(404).json({ error: "Prospect student not found" });
      }

      // Partner admin can only update prospects in their partner
      if (admin.role === 'partner_admin' && existingProspect.partnerId !== admin.partnerId) {
        return res.status(403).json({ error: "Access denied to other partner's data" });
      }

      const updates = insertProspectStudentSchema.partial().parse(req.body);
      const prospect = await storage.updateProspectStudent(req.params.id, updates);
      res.json(prospect);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      console.error("Error updating prospect student:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/admin/prospect-students/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const admin = await storage.getUser(req.userId);
      if (!admin || !['admin', 'finance_admin', 'partner_admin'].includes(admin.role)) {
        return res.status(403).json({ error: "Access denied" });
      }

      const existingProspect = await storage.getProspectStudent(req.params.id);
      if (!existingProspect) {
        return res.status(404).json({ error: "Prospect student not found" });
      }

      // Partner admin can only delete prospects in their partner
      if (admin.role === 'partner_admin' && existingProspect.partnerId !== admin.partnerId) {
        return res.status(403).json({ error: "Access denied to other partner's data" });
      }

      const success = await storage.deleteProspectStudent(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting prospect student:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Resend confirmation email for a prospect
  app.post("/api/admin/prospect-students/:id/resend-email", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const adminId = (req.session as any).userId;
      const admin = await storage.getUser(adminId);
      if (!admin || (admin.role !== 'admin' && admin.role !== 'finance_admin')) {
        return res.status(403).json({ error: "Only administrators and finance admins can resend emails" });
      }

      const prospect = await storage.getProspectStudent(req.params.id);
      if (!prospect) {
        return res.status(404).json({ error: "Prospect student not found" });
      }

      const emailTo = prospect.parentEmail || prospect.zoomEmail;
      if (!emailTo) {
        return res.status(400).json({ error: "No email address available for this prospect" });
      }

      await sendProspectConfirmationEmail(
        emailTo,
        prospect.parentName || '',
        prospect.studentName,
        prospect.formType as 'academics' | 'computer' | 'dance' | 'arts',
        prospect.demoTime || undefined
      );

      await storage.updateProspectStudent(prospect.id, { emailSent: true });

      res.json({ success: true, message: "Email sent successfully" });
    } catch (error) {
      console.error("Error resending prospect email:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Bulk email sending endpoint for admin communication
  app.post("/api/admin/send-bulk-email", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = (req.session as any).userId;
      const user = await storage.getUser(userId);
      if (!user || (user.role !== 'admin' && user.role !== 'finance_admin')) {
        return res.status(403).json({ error: "Only administrators and finance admins can send bulk emails" });
      }

      const { recipientIds, subject, body } = req.body;

      if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
        return res.status(400).json({ error: "At least one recipient is required" });
      }
      if (!subject || typeof subject !== 'string' || !subject.trim()) {
        return res.status(400).json({ error: "Subject is required" });
      }
      if (!body || typeof body !== 'string' || !body.trim()) {
        return res.status(400).json({ error: "Message body is required" });
      }

      const { getUncachableResendClient } = await import('./services/resend');
      const { client, fromEmail } = await getUncachableResendClient();

      let successCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      for (const recipientId of recipientIds) {
        const recipient = await storage.getUser(recipientId);
        if (!recipient || !recipient.email) {
          failedCount++;
          errors.push(`User ${recipientId} not found or has no email`);
          continue;
        }

        try {
          const recipientName = recipient.firstName && recipient.lastName
            ? `${recipient.firstName} ${recipient.lastName}`
            : recipient.name || 'User';

          const htmlContent = `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #1F3A5F 0%, #2a4a75 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                  <h1 style="color: white; margin: 0;">Alloria Learning Center</h1>
                </div>
                
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
                  <p>Dear ${recipientName},</p>
                  
                  <div style="white-space: pre-wrap;">${body}</div>
                  
                  <p style="color: #666; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
                    Best regards,<br/>
                    Alloria Learning Center Team
                  </p>
                </div>
                
                <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
                  <p>&copy; ${new Date().getFullYear()} Alloria Learning Center. All rights reserved.</p>
                </div>
              </body>
            </html>
          `;

          await client.emails.send({
            from: fromEmail,
            to: recipient.email,
            subject: subject,
            html: htmlContent,
            text: `Dear ${recipientName},\n\n${body}\n\nBest regards,\nAlloria Learning Center Team`,
          });

          successCount++;
        } catch (emailError) {
          console.error(`Failed to send email to ${recipient.email}:`, emailError);
          failedCount++;
          errors.push(`Failed to send to ${recipient.email}`);
        }
      }

      console.log(`[Bulk Email] Sent: ${successCount}, Failed: ${failedCount}`);
      res.json({
        success: true,
        successCount,
        failedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Error sending bulk email:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Assignment routes
  app.get("/api/assignments", async (req, res) => {
    try {
      const assignments = await storage.getAllAssignments();
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/assignments/:id", async (req, res) => {
    try {
      const assignment = await storage.getAssignment(req.params.id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Fetch assignment attachments
      const attachments = await storage.getAssignmentAttachmentsByAssignment(req.params.id);

      // Return assignment with attachments
      res.json({
        ...assignment,
        attachments
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/courses/:courseId/assignments", async (req, res) => {
    try {
      const assignments = await storage.getAssignmentsByCourse(req.params.courseId);
      const statsMap = await storage.getCourseAssignmentStats(req.params.courseId);

      // Enrich each assignment with its stats in a nested stats object
      const enrichedAssignments = assignments.map(assignment => ({
        ...assignment,
        stats: {
          totalSubmissions: statsMap[assignment.id]?.totalSubmissions ?? 0,
          gradedCount: statsMap[assignment.id]?.gradedCount ?? 0,
          ungradedCount: statsMap[assignment.id]?.ungradedCount ?? 0
        }
      }));

      res.json(enrichedAssignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/assignments", async (req, res) => {
    try {
      const validatedData = insertAssignmentSchema.parse(req.body);
      const assignment = await storage.createAssignment(validatedData);

      // Get enrolled students for notifications
      const enrollments = await storage.getEnrollmentsByCourse(assignment.courseId);
      const course = await storage.getCourse(assignment.courseId);

      // Create notifications for all enrolled students
      for (const enrollment of enrollments) {
        await storage.createNotification({
          userId: enrollment.studentId,
          type: 'assignment_posted',
          title: 'New Assignment Posted',
          message: `A new assignment "${assignment.title}" has been posted in ${course?.title || 'your course'}`,
          relatedId: assignment.id,
          relatedType: 'assignment',
          isRead: false
        });
      }

      res.status(201).json(assignment);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/assignments/:id", async (req, res) => {
    try {
      const updates = insertAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateAssignment(req.params.id, updates);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/assignments/:id", async (req, res) => {
    try {
      // Check if assignment exists
      const assignment = await storage.getAssignment(req.params.id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Check if any students have submitted this assignment
      const submissions = await storage.getSubmissionsByAssignment(req.params.id);
      if (submissions.length > 0) {
        return res.status(400).json({
          error: "Cannot delete assignment with student submissions",
          details: `${submissions.length} student(s) have submitted this assignment. Delete all submissions first.`
        });
      }

      const success = await storage.deleteAssignment(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Helper function to verify teacher has access to an assignment
  async function verifyTeacherAccessToAssignment(user: Express.User | undefined, assignmentId: string): Promise<{ assignment: any; course: any; error?: { status: number; message: string } }> {
    if (!user) {
      return { assignment: null, course: null, error: { status: 401, message: "Unauthorized" } };
    }

    const assignment = await storage.getAssignment(assignmentId);
    if (!assignment) {
      return { assignment: null, course: null, error: { status: 404, message: "Assignment not found" } };
    }

    const course = await storage.getCourse(assignment.courseId);
    if (!course) {
      return { assignment: null, course: null, error: { status: 404, message: "Course not found" } };
    }

    // Allow admin or the teacher of the course or the assignment creator
    const isAdmin = user.role === 'admin';
    const isCourseTeacher = user.role === 'teacher' && course.teacherId === user.id;
    const isAssignmentTeacher = user.role === 'teacher' && assignment.teacherId === user.id;

    if (!isAdmin && !isCourseTeacher && !isAssignmentTeacher) {
      return { assignment: null, course: null, error: { status: 403, message: "You don't have permission to manage this assignment" } };
    }

    return { assignment, course };
  }

  // Helper to get user from either req.user (Replit Auth) or session (email/password)
  async function getUserFromRequest(req: any): Promise<Express.User | undefined> {
    if (req.user) {
      return req.user;
    }
    const sessionUserId = (req.session as any)?.userId;
    if (sessionUserId) {
      const user = await storage.getUser(sessionUserId);
      return user as Express.User | undefined;
    }
    return undefined;
  }

  // Individual Assignment Mapping routes
  app.get("/api/assignments/:assignmentId/individual-mappings", jwtAuthMiddleware, async (req, res) => {
    try {
      // Get user from either Replit Auth or session
      const user = await getUserFromRequest(req);
      console.log("[individual-mappings GET] Request for assignment:", req.params.assignmentId, "by user:", user?.id, "role:", user?.role);

      // Verify user has access to this assignment
      const { assignment, error } = await verifyTeacherAccessToAssignment(user, req.params.assignmentId);
      if (error) {
        console.log("[individual-mappings GET] Access denied:", error.message, "status:", error.status);
        return res.status(error.status).json({ error: error.message });
      }

      const mappings = await storage.getIndividualAssignmentMappingsByAssignment(req.params.assignmentId);
      console.log("[individual-mappings GET] Found", mappings.length, "mappings for assignment:", req.params.assignmentId);

      // Enrich mappings with student details
      const enrichedMappings = await Promise.all(
        mappings.map(async (mapping) => {
          const student = await storage.getUser(mapping.studentId);
          return {
            ...mapping,
            student: student ? {
              id: student.id,
              firstName: student.firstName,
              lastName: student.lastName,
              email: student.email,
              avatarUrl: student.avatarUrl,
            } : null,
          };
        })
      );

      res.json(enrichedMappings);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/assignments/:assignmentId/individual-mappings", jwtAuthMiddleware, async (req, res) => {
    try {
      // Get user from either Replit Auth or session
      const user = await getUserFromRequest(req);

      // Verify user has access to this assignment
      const { assignment, course, error } = await verifyTeacherAccessToAssignment(user, req.params.assignmentId);
      if (error) {
        return res.status(error.status).json({ error: error.message });
      }

      const { studentIds } = req.body;

      // Validate studentIds array
      if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: "studentIds array is required" });
      }

      // Validate all studentIds are non-empty strings
      if (!studentIds.every(id => typeof id === 'string' && id.length > 0)) {
        return res.status(400).json({ error: "All studentIds must be non-empty strings" });
      }

      // Verify all students are enrolled in the course
      const enrollments = await storage.getEnrollmentsByCourse(assignment!.courseId);
      const enrolledStudentIds = new Set(
        enrollments
          .filter(e => e.approvalStatus === 'approved')
          .map(e => e.studentId)
      );

      const invalidStudents = studentIds.filter(id => !enrolledStudentIds.has(id));
      if (invalidStudents.length > 0) {
        return res.status(400).json({
          error: "Some students are not enrolled in this course",
          invalidStudentIds: invalidStudents
        });
      }

      // Update assignment to not be shared
      await storage.updateAssignment(req.params.assignmentId, { isShared: false });

      // Create mappings for each student
      const createdMappings = [];
      for (const studentId of studentIds) {
        try {
          const mapping = await storage.createIndividualAssignmentMapping({
            assignmentId: req.params.assignmentId,
            studentId: studentId,
          });
          createdMappings.push(mapping);
        } catch (e) {
          // Ignore duplicate key errors
          console.log(`Student ${studentId} already assigned to this assignment`);
        }
      }

      res.status(201).json(createdMappings);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/assignments/:assignmentId/individual-mappings/:mappingId", jwtAuthMiddleware, async (req, res) => {
    try {
      // Get user from either Replit Auth or session
      const user = await getUserFromRequest(req);

      // Verify user has access to this assignment
      const { error } = await verifyTeacherAccessToAssignment(user, req.params.assignmentId);
      if (error) {
        return res.status(error.status).json({ error: error.message });
      }

      const success = await storage.deleteIndividualAssignmentMapping(req.params.mappingId);
      if (!success) {
        return res.status(404).json({ error: "Mapping not found" });
      }

      // Check if any mappings remain
      const remainingMappings = await storage.getIndividualAssignmentMappingsByAssignment(req.params.assignmentId);
      if (remainingMappings.length === 0) {
        // If no mappings remain, set assignment back to shared
        await storage.updateAssignment(req.params.assignmentId, { isShared: true });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Bulk update individual mappings (replace all existing)
  app.put("/api/assignments/:assignmentId/individual-mappings", jwtAuthMiddleware, async (req, res) => {
    try {
      // Get user from either Replit Auth or session
      const user = await getUserFromRequest(req);

      // Verify user has access to this assignment
      const { assignment, course, error } = await verifyTeacherAccessToAssignment(user, req.params.assignmentId);
      if (error) {
        return res.status(error.status).json({ error: error.message });
      }

      const { studentIds } = req.body;

      // Delete all existing mappings for this assignment
      await storage.deleteIndividualAssignmentMappingsByAssignment(req.params.assignmentId);

      if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
        // If no students provided, make assignment shared
        await storage.updateAssignment(req.params.assignmentId, { isShared: true });
        return res.json([]);
      }

      // Validate all studentIds are non-empty strings
      if (!studentIds.every((id: any) => typeof id === 'string' && id.length > 0)) {
        return res.status(400).json({ error: "All studentIds must be non-empty strings" });
      }

      // Verify all students are enrolled in the course
      const enrollments = await storage.getEnrollmentsByCourse(assignment!.courseId);
      const enrolledStudentIds = new Set(
        enrollments
          .filter(e => e.approvalStatus === 'approved')
          .map(e => e.studentId)
      );

      const invalidStudents = studentIds.filter((id: string) => !enrolledStudentIds.has(id));
      if (invalidStudents.length > 0) {
        return res.status(400).json({
          error: "Some students are not enrolled in this course",
          invalidStudentIds: invalidStudents
        });
      }

      // Update assignment to not be shared
      await storage.updateAssignment(req.params.assignmentId, { isShared: false });

      // Create new mappings
      const createdMappings = [];
      for (const studentId of studentIds) {
        const mapping = await storage.createIndividualAssignmentMapping({
          assignmentId: req.params.assignmentId,
          studentId: studentId,
        });
        createdMappings.push(mapping);
      }

      res.json(createdMappings);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get assignments visible to a specific student for a course
  app.get("/api/students/:studentId/courses/:courseId/visible-assignments", jwtAuthMiddleware, async (req, res) => {
    try {
      const assignments = await storage.getAssignmentsForStudent(req.params.studentId, req.params.courseId);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Assignment attachment routes
  app.post("/api/assignments/attachments/upload-url", async (req, res) => {
    try {
      const { assignmentId, fileExtension, mimeType } = req.body;

      if (!assignmentId || !fileExtension) {
        return res.status(400).json({ error: "Assignment ID and file extension are required" });
      }

      // Validate file extension and mime type
      const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'txt', 'rtf', 'odt', 'zip', 'rar'];
      const allowedMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/bmp',
        'image/webp',
        'text/plain',
        'application/rtf',
        'application/vnd.oasis.opendocument.text',
        'application/zip',
        'application/x-rar-compressed'
      ];

      if (!allowedExtensions.includes(fileExtension.toLowerCase())) {
        return res.status(400).json({ error: "File type not allowed" });
      }

      if (mimeType && !allowedMimeTypes.includes(mimeType)) {
        return res.status(400).json({ error: "MIME type not allowed" });
      }

      // Verify user is authenticated
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify assignment exists
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const course = await storage.getCourse(assignment.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only the course teacher, assigned teacher, or admin can upload assignment attachments
      const hasAccess = user.role === 'admin' || await storage.teacherHasCourseAccess(user.id, assignment.courseId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Only the course teacher or admin can upload assignment attachments" });
      }

      const { ObjectStorageService } = await import('./objectStorage.js');
      const objectStorageService = new ObjectStorageService();

      const fileName = `assignment-${assignmentId}-${uuidv4()}.${fileExtension}`;
      const uploadUrl = await objectStorageService.getPublicObjectUploadURL(fileName);

      res.json({
        uploadUrl,
        fileName,
        publicUrl: `/public-objects/${fileName}`
      });
    } catch (error) {
      console.error('Error getting upload URL:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to get upload URL' });
    }
  });

  app.post("/api/assignments/:assignmentId/attachments", async (req, res) => {
    try {
      const { type, url, fileName, fileSize, mimeType } = req.body;
      const { assignmentId } = req.params;

      if (!type || !url) {
        return res.status(400).json({ error: "Type and URL are required" });
      }

      if (!['file', 'link'].includes(type)) {
        return res.status(400).json({ error: "Type must be 'file' or 'link'" });
      }

      // Verify user is authenticated
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify assignment exists
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const course = await storage.getCourse(assignment.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only the course teacher, assigned teacher, or admin can create assignment attachments
      const hasAccess = user.role === 'admin' || await storage.teacherHasCourseAccess(user.id, assignment.courseId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Only the course teacher or admin can create assignment attachments" });
      }

      const attachment = await storage.createAssignmentAttachment({
        assignmentId,
        type,
        url,
        fileName: fileName || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
      });

      res.status(201).json(attachment);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/assignments/:assignmentId/attachments", async (req, res) => {
    try {
      // Verify user is authenticated
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const assignment = await storage.getAssignment(req.params.assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const course = await storage.getCourse(assignment.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only enrolled students, course teacher (including assigned teachers), or admin can view attachments
      let authorized = false;
      if (user.role === 'admin') {
        authorized = true;
      } else if (user.role === 'teacher') {
        authorized = await storage.teacherHasCourseAccess(user.id, course.id);
      } else if (user.role === 'student') {
        const enrollments = await storage.getEnrollmentsByStudent(user.id);
        authorized = enrollments.some(e => e.courseId === assignment.courseId);
      }

      if (!authorized) {
        return res.status(403).json({ error: "You must be enrolled in this course to view attachments" });
      }

      const attachments = await storage.getAssignmentAttachmentsByAssignment(req.params.assignmentId);
      res.json(attachments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/assignments/:assignmentId/grading", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const assignment = await storage.getAssignment(req.params.assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const course = await storage.getCourse(assignment.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Check if user is admin or has access to the course (default teacher or has student assignments)
      const hasAccess = user.role === 'admin' || await storage.teacherHasCourseAccess(user.id, course.id);
      if (!hasAccess) {
        return res.status(403).json({ error: "Only the course teacher or admin can view grading data" });
      }

      const submissions = await storage.getSubmissionsForGrading(req.params.assignmentId);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Submission routes
  app.get("/api/submissions", async (req, res) => {
    try {
      const submissions = await storage.getAllSubmissions();
      const allGrades = await storage.getAllGrades();

      const gradesBySubmissionId = new Map(
        allGrades.map(grade => [grade.submissionId, grade])
      );

      const submissionsWithGrades = submissions.map(submission => {
        const grade = gradesBySubmissionId.get(submission.id);
        return {
          ...submission,
          grade: grade?.score ?? null,
          feedback: grade?.feedback ?? null,
          gradedAt: grade?.gradedAt ?? null,
          gradedBy: grade?.gradedBy ?? null
        };
      });

      res.json(submissionsWithGrades);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/submissions/:id", async (req, res) => {
    try {
      const submission = await storage.getSubmission(req.params.id);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      res.json(submission);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/assignments/:assignmentId/submissions", async (req, res) => {
    try {
      const submissions = await storage.getSubmissionsByAssignment(req.params.assignmentId);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/submissions", async (req, res) => {
    try {
      const submissions = await storage.getSubmissionsByStudent(req.params.studentId);
      res.json(submissions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/assignments/:assignmentId/submissions/student/:studentId", async (req, res) => {
    try {
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const assignment = await storage.getAssignment(req.params.assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const course = await storage.getCourse(assignment.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Authorization: Students can only view their own submissions, teachers can view their course submissions, admins can view any
      if (user.role === 'student' && user.id !== req.params.studentId) {
        return res.status(403).json({ error: "You can only view your own submissions" });
      } else if (user.role === 'teacher' && course.teacherId !== user.id) {
        return res.status(403).json({ error: "You can only view submissions for your courses" });
      } else if (user.role !== 'admin' && user.role !== 'teacher' && user.role !== 'student') {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const submission = await storage.getSubmissionWithDetails(
        req.params.assignmentId,
        req.params.studentId
      );
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      res.json(submission);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/submissions", async (req, res) => {
    try {
      const validatedData = insertSubmissionSchema.parse(req.body);
      const submission = await storage.createSubmission(validatedData);

      // Get assignment and course details for notification
      const assignment = await storage.getAssignment(submission.assignmentId);
      if (assignment) {
        const course = await storage.getCourse(assignment.courseId);
        const student = await storage.getUser(submission.studentId);

        if (course && student) {
          // Create notification for the teacher
          await storage.createNotification({
            userId: assignment.teacherId,
            type: 'assignment_submitted',
            title: 'New Assignment Submission',
            message: `${student.firstName} ${student.lastName} submitted "${assignment.title}" in ${course.title}`,
            relatedId: submission.id,
            relatedType: 'submission',
            isRead: false,
          });
        }
      }

      res.status(201).json(submission);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/submissions/:id", async (req, res) => {
    try {
      const updates = insertSubmissionSchema.partial().parse(req.body);
      const submission = await storage.updateSubmission(req.params.id, updates);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }
      res.json(submission);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/submissions/:id", async (req, res) => {
    try {
      const success = await storage.deleteSubmission(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Submission not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Submission attachment routes - Direct upload using Replit Object Storage SDK
  app.post("/api/submissions/attachments/upload", upload.single('file'), async (req, res) => {
    try {
      const { assignmentId, studentId } = req.body;
      const file = req.file;

      if (!assignmentId || !studentId) {
        return res.status(400).json({ error: "Assignment ID and student ID are required" });
      }

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      // Validate file extension and mime type
      const allowedExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'txt', 'rtf', 'odt', 'zip', 'rar'];
      const allowedMimeTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/bmp',
        'image/webp',
        'text/plain',
        'application/rtf',
        'application/vnd.oasis.opendocument.text',
        'application/zip',
        'application/x-rar-compressed'
      ];

      const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || '';

      if (!allowedExtensions.includes(fileExtension)) {
        return res.status(400).json({ error: "File type not allowed" });
      }

      if (file.mimetype && !allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: "MIME type not allowed" });
      }

      // Verify user is authenticated
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Only the student or admin can upload submission attachments
      if (user.id !== studentId && user.role !== 'admin') {
        return res.status(403).json({ error: "You can only upload attachments for your own submissions" });
      }

      // Verify assignment exists
      const assignment = await storage.getAssignment(assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Verify student is enrolled in the course
      if (user.role !== 'admin') {
        const enrollments = await storage.getEnrollmentsByStudent(studentId);
        const isEnrolled = enrollments.some(e => e.courseId === assignment.courseId);
        if (!isEnrolled) {
          return res.status(403).json({ error: "You must be enrolled in this course to submit" });
        }
      }

      // Upload file to Google Cloud Storage private directory
      const fileName = `submission-${assignmentId}-${studentId}-${uuidv4()}.${fileExtension}`;

      console.log(`Uploading file to private object storage: ${fileName}, size: ${file.size} bytes`);

      try {
        const objectPath = await objectStorageService.uploadToPrivateDir(
          fileName,
          file.buffer,
          file.mimetype
        );

        console.log(`File uploaded successfully to: ${objectPath}`);

        res.json({
          success: true,
          fileName,
          fileSize: file.size,
          mimeType: file.mimetype,
          objectPath
        });
      } catch (uploadError) {
        console.error('Object storage upload failed:', uploadError);
        return res.status(500).json({ error: "Failed to upload file to storage" });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to upload file' });
    }
  });

  app.post("/api/submissions/:submissionId/attachments", async (req, res) => {
    try {
      const { type, url, fileName, fileSize, mimeType } = req.body;
      const { submissionId } = req.params;

      if (!type || !url) {
        return res.status(400).json({ error: "Type and URL are required" });
      }

      if (!['file', 'link'].includes(type)) {
        return res.status(400).json({ error: "Type must be 'file' or 'link'" });
      }

      // Verify user is authenticated
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify submission exists
      const submission = await storage.getSubmission(submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      // Only the student who created the submission or admin can add attachments
      if (user.id !== submission.studentId && user.role !== 'admin') {
        return res.status(403).json({ error: "You can only add attachments to your own submissions" });
      }

      const attachment = await storage.createSubmissionAttachment({
        submissionId,
        type,
        url,
        fileName: fileName || null,
        fileSize: fileSize || null,
        mimeType: mimeType || null,
      });

      res.status(201).json(attachment);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/submissions/:submissionId/attachments", async (req, res) => {
    try {
      // Verify user is authenticated
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const submission = await storage.getSubmission(req.params.submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const assignment = await storage.getAssignment(submission.assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const course = await storage.getCourse(assignment.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only the submitting student, course teacher, or admin can view submission attachments
      let authorized = false;
      if (user.role === 'admin' || course.teacherId === user.id || submission.studentId === user.id) {
        authorized = true;
      }

      if (!authorized) {
        return res.status(403).json({ error: "You don't have permission to view these attachments" });
      }

      const attachments = await storage.getSubmissionAttachmentsBySubmission(req.params.submissionId);
      res.json(attachments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/submissions/attachments/:attachmentId/download", async (req, res) => {
    try {
      // Verify user is authenticated
      if (!(req.session as any).userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await storage.getUser((req.session as any).userId);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Get the attachment
      const attachment = await storage.getSubmissionAttachment(req.params.attachmentId);
      if (!attachment) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      // Get submission to check authorization
      const submission = await storage.getSubmission(attachment.submissionId);
      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const assignment = await storage.getAssignment(submission.assignmentId);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      const course = await storage.getCourse(assignment.courseId);
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Check authorization - student, teacher, or admin
      let authorized = false;
      if (user.role === 'admin') {
        authorized = true;
      } else if (user.role === 'teacher') {
        authorized = await storage.teacherHasCourseAccess(user.id, course.id);
      } else if (user.id === submission.studentId) {
        authorized = true;
      }

      if (!authorized) {
        return res.status(403).json({ error: "You don't have permission to download this attachment" });
      }

      // If the URL is a link (external URL), just redirect to it
      if (attachment.type === 'link') {
        return res.redirect(302, attachment.url);
      }

      // For file attachments, determine storage type and download accordingly
      const urlPath = attachment.url;
      console.log(`Attempting to download attachment from: ${urlPath}`);

      // Download file using ObjectStorageService (supports both GCS and local fallback)
      try {
        const file = await objectStorageService.getPrivateObject(urlPath);

        if (!file) {
          console.error(`File not found in storage: ${urlPath}`);
          return res.status(404).json({ error: "File not found in storage" });
        }

        // Set download headers with the original filename
        const downloadFileName = attachment.fileName || 'download';
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFileName}"`);

        console.log(`Streaming file to client: ${downloadFileName}`);

        // Use ObjectStorageService's downloadObject to stream the file
        await objectStorageService.downloadObject(file, res, 0, true);
      } catch (storageError) {
        console.error('Error downloading file:', storageError);
        if (!res.headersSent) {
          return res.status(404).json({ error: "File not found or could not download" });
        }
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Grade routes
  app.get("/api/grades/:id", async (req, res) => {
    try {
      const grade = await storage.getGrade(req.params.id);
      if (!grade) {
        return res.status(404).json({ error: "Grade not found" });
      }
      res.json(grade);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/submissions/:submissionId/grade", async (req, res) => {
    try {
      const grade = await storage.getGradeBySubmission(req.params.submissionId);
      if (!grade) {
        return res.status(404).json({ error: "Grade not found" });
      }
      res.json(grade);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/grades", async (req, res) => {
    try {
      const grades = await storage.getGradesByStudent(req.params.studentId);
      res.json(grades);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/courses/:courseId/grades", async (req, res) => {
    try {
      const grades = await storage.getGradesByCourse(req.params.courseId);
      res.json(grades);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/grades", async (req, res) => {
    try {
      const validatedData = insertGradeSchema.parse(req.body);
      const grade = await storage.createGrade(validatedData);

      // Get submission and assignment details for notification
      const submission = await storage.getSubmission(grade.submissionId);
      if (submission) {
        const assignment = await storage.getAssignment(submission.assignmentId);

        // Create notification for student
        await storage.createNotification({
          userId: submission.studentId,
          type: 'assignment_graded',
          title: 'Assignment Graded',
          message: `Your assignment "${assignment?.title || 'Assignment'}" has been graded. Score: ${grade.score}/${grade.maxScore}`,
          relatedId: grade.id,
          relatedType: 'grade',
          isRead: false
        });
      }

      res.status(201).json(grade);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/grades/:id", async (req, res) => {
    try {
      const updates = insertGradeSchema.partial().parse(req.body);
      const grade = await storage.updateGrade(req.params.id, updates);
      if (!grade) {
        return res.status(404).json({ error: "Grade not found" });
      }
      res.json(grade);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/grades/:id", async (req, res) => {
    try {
      const success = await storage.deleteGrade(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Grade not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Attendance routes
  app.get("/api/attendance/:id", async (req, res) => {
    try {
      const attendance = await storage.getAttendance(req.params.id);
      if (!attendance) {
        return res.status(404).json({ error: "Attendance record not found" });
      }
      res.json(attendance);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/attendance", async (req, res) => {
    try {
      const attendance = await storage.getAttendanceByStudent(req.params.studentId);
      res.json(attendance);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/courses/:courseId/attendance", async (req, res) => {
    try {
      const attendance = await storage.getAttendanceByCourse(req.params.courseId);
      res.json(attendance);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/attendance", async (req, res) => {
    try {
      const validatedData = insertAttendanceSchema.parse(req.body);
      const attendance = await storage.createAttendance(validatedData);
      res.status(201).json(attendance);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/attendance/:id", async (req, res) => {
    try {
      const updates = insertAttendanceSchema.partial().parse(req.body);
      const attendance = await storage.updateAttendance(req.params.id, updates);
      if (!attendance) {
        return res.status(404).json({ error: "Attendance record not found" });
      }
      res.json(attendance);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/attendance/:id", async (req, res) => {
    try {
      const success = await storage.deleteAttendance(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Attendance record not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Message routes
  app.get("/api/messages/:id", async (req, res) => {
    try {
      const message = await storage.getMessage(req.params.id);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      res.json(message);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/users/:userId/messages/sent", async (req, res) => {
    try {
      const messages = await storage.getMessagesBySender(req.params.userId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/users/:userId/messages/received", async (req, res) => {
    try {
      const messages = await storage.getMessagesByRecipient(req.params.userId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/users/:userId/messages", async (req, res) => {
    try {
      const sent = await storage.getMessagesBySender(req.params.userId);
      const received = await storage.getMessagesByRecipient(req.params.userId);
      res.json({ sent, received });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/messages", async (req, res) => {
    try {
      const validatedData = insertMessageSchema.parse(req.body);

      // Validate sender can message recipient based on role relationships
      if (validatedData.senderId && validatedData.recipientId) {
        const allowedRecipients = await getAllowedMessageRecipients(validatedData.senderId);
        if (!allowedRecipients.has(validatedData.recipientId)) {
          return res.status(403).json({
            error: "You are not authorized to send messages to this user. Students and parents can only message assigned teachers and admins."
          });
        }
      }

      const message = await storage.createMessage(validatedData);

      // Get sender details for notification
      const sender = await storage.getUser(message.senderId);
      const senderName = sender?.name || `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim() || 'Someone';

      // Create notification for recipient
      await storage.createNotification({
        userId: message.recipientId,
        type: 'new_message',
        title: 'New Message',
        message: `You have a new message from ${senderName}`,
        relatedId: message.id,
        relatedType: 'message',
        isRead: false
      });

      res.status(201).json(message);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/messages/:id", async (req, res) => {
    try {
      const updates = insertMessageSchema.partial().parse(req.body);
      const message = await storage.updateMessage(req.params.id, updates);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }
      res.json(message);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    try {
      const success = await storage.deleteMessage(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Message not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Pre-upload URL for message attachments (before message is created)
  app.post("/api/message-attachments/pre-upload-url", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { fileName, fileType, fileSize } = req.body;

      if (!fileName || !fileType || !fileSize) {
        return res.status(400).json({ error: "fileName, fileType, and fileSize are required" });
      }

      // Validate file type
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
      ];

      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({ error: "File type not allowed. Supported types: PDF, DOCX, JPEG, PNG, GIF, WEBP" });
      }

      // Max file size: 10MB
      const maxSize = 10 * 1024 * 1024;
      if (fileSize > maxSize) {
        return res.status(400).json({ error: "File size exceeds 10MB limit" });
      }

      // Generate unique file name with temp prefix (will be moved when message is created)
      const ext = fileName.split('.').pop() || 'bin';
      const uniqueFileName = `message-attachments/pending/${userId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      // Get presigned upload URL for private storage
      const uploadUrl = await objectStorageService.getPrivateObjectUploadURL(uniqueFileName);

      res.json({
        uploadUrl,
        fileUrl: uniqueFileName,
        fileName,
        fileType,
        fileSize
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Send message with attachments in a single request
  app.post("/api/messages/with-attachments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId || req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { recipientId, subject, content, type, attachments } = req.body;

      // Create the message first
      const message = await storage.createMessage({
        senderId: userId,
        recipientId,
        subject: subject || "Message",
        content: content || (attachments?.length > 0 ? "[Attachment]" : ""),
        type: type || "general",
        isRead: false,
      });

      // Create attachment records if any
      if (attachments && attachments.length > 0) {
        for (const attachment of attachments) {
          await storage.createMessageAttachment({
            messageId: message.id,
            fileName: attachment.fileName,
            fileType: attachment.fileType,
            fileSize: attachment.fileSize,
            fileUrl: attachment.fileUrl,
          });
        }
      }

      // Create notification for recipient
      await storage.createNotification({
        userId: recipientId,
        type: "new_message",
        title: "New Message",
        message: `You have a new message${attachments?.length > 0 ? ' with attachments' : ''}`,
        relatedId: message.id,
        isRead: false,
      });

      // Get the created attachments to return with the message
      const createdAttachments = await storage.getMessageAttachments(message.id);

      res.status(201).json({ ...message, attachments: createdAttachments });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Message Attachment routes
  app.get("/api/messages/:messageId/attachments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId || req.user?.id;
      const message = await storage.getMessage(req.params.messageId);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Verify user is sender or recipient
      if (message.senderId !== userId && message.recipientId !== userId) {
        return res.status(403).json({ error: "Not authorized to view attachments for this message" });
      }

      const attachments = await storage.getMessageAttachments(req.params.messageId);
      res.json(attachments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/messages/:messageId/attachments/upload-url", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId || req.user?.id;
      const message = await storage.getMessage(req.params.messageId);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Verify user is the sender of this message
      if (message.senderId !== userId) {
        return res.status(403).json({ error: "Not authorized to upload attachments for this message" });
      }

      const { fileName, fileType, fileSize } = req.body;

      if (!fileName || !fileType || !fileSize) {
        return res.status(400).json({ error: "fileName, fileType, and fileSize are required" });
      }

      // Validate file type (PDF, DOCX, images)
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
      ];

      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({ error: "File type not allowed. Supported types: PDF, DOCX, JPEG, PNG, GIF, WEBP" });
      }

      // Max file size: 10MB
      const maxSize = 10 * 1024 * 1024;
      if (fileSize > maxSize) {
        return res.status(400).json({ error: "File size exceeds 10MB limit" });
      }

      // Generate unique file name
      const ext = fileName.split('.').pop() || 'bin';
      const uniqueFileName = `message-attachments/${req.params.messageId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

      // Get presigned upload URL for private storage
      const uploadUrl = await objectStorageService.getPrivateObjectUploadURL(uniqueFileName);

      res.json({
        uploadUrl,
        fileUrl: uniqueFileName,
        fileName,
        fileType,
        fileSize
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/messages/:messageId/attachments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId || req.user?.id;
      const message = await storage.getMessage(req.params.messageId);

      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Verify user is the sender of this message
      if (message.senderId !== userId) {
        return res.status(403).json({ error: "Not authorized to add attachments to this message" });
      }

      const { fileName, fileType, fileSize, fileUrl } = req.body;

      if (!fileName || !fileType || !fileSize || !fileUrl) {
        return res.status(400).json({ error: "fileName, fileType, fileSize, and fileUrl are required" });
      }

      const attachment = await storage.createMessageAttachment({
        messageId: req.params.messageId,
        fileName,
        fileType,
        fileSize,
        fileUrl
      });

      res.status(201).json(attachment);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/message-attachments/:id/download", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId || req.user?.id;
      const attachment = await storage.getMessageAttachment(req.params.id);
      if (!attachment) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      // Get the message to verify authorization
      const message = await storage.getMessage(attachment.messageId);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Verify user is sender or recipient
      if (message.senderId !== userId && message.recipientId !== userId) {
        return res.status(403).json({ error: "Not authorized to download this attachment" });
      }

      // Get file from private storage (fileUrl is relative path)
      const file = await objectStorageService.getPrivateObjectByRelativePath(attachment.fileUrl);
      if (!file) {
        return res.status(404).json({ error: "File not found in storage" });
      }

      // Set appropriate headers
      res.setHeader('Content-Disposition', `attachment; filename="${attachment.fileName}"`);
      await objectStorageService.downloadObject(file, res, 0, true);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/message-attachments/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = (req.session as any)?.userId || req.user?.id;
      const attachment = await storage.getMessageAttachment(req.params.id);
      if (!attachment) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      // Get the message to verify authorization
      const message = await storage.getMessage(attachment.messageId);
      if (!message) {
        return res.status(404).json({ error: "Message not found" });
      }

      // Verify user is the sender (only sender can delete attachments)
      if (message.senderId !== userId) {
        return res.status(403).json({ error: "Not authorized to delete this attachment" });
      }

      // Delete from storage (fileUrl is relative path)
      try {
        await objectStorageService.deletePrivateObjectByRelativePath(attachment.fileUrl);
      } catch (e) {
        // Log but don't fail if storage deletion fails
        console.error('Failed to delete attachment from storage:', e);
      }

      const success = await storage.deleteMessageAttachment(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Attachment not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Parent-Child relationship routes
  app.get("/api/parent-children", async (req, res) => {
    try {
      const { childId, parentId } = req.query;

      if (childId) {
        // Get all parent relationships for a child
        const relationships = await storage.getParentsByChild(childId as string);
        return res.json(relationships);
      } else if (parentId) {
        // Get all child relationships for a parent
        const relationships = await storage.getChildrenByParent(parentId as string);
        return res.json(relationships);
      } else {
        // Get all parent-child relationships
        const relationships = await storage.getAllParentChildren();
        return res.json(relationships);
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/parent-children/:id", async (req, res) => {
    try {
      const relationship = await storage.getParentChild(req.params.id);
      if (!relationship) {
        return res.status(404).json({ error: "Parent-child relationship not found" });
      }
      res.json(relationship);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/parent-children", async (req, res) => {
    try {
      const validatedData = insertParentChildSchema.parse(req.body);
      const relationship = await storage.createParentChild(validatedData);
      res.status(201).json(relationship);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/parent-children/:id", async (req, res) => {
    try {
      const updates = insertParentChildSchema.partial().parse(req.body);
      const relationship = await storage.updateParentChild(req.params.id, updates);
      if (!relationship) {
        return res.status(404).json({ error: "Parent-child relationship not found" });
      }
      res.json(relationship);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/parent-children/:id", async (req, res) => {
    try {
      const success = await storage.deleteParentChild(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Parent-child relationship not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Announcement routes
  app.get("/api/announcements/:id", async (req, res) => {
    try {
      const announcement = await storage.getAnnouncement(req.params.id);
      if (!announcement) {
        return res.status(404).json({ error: "Announcement not found" });
      }
      res.json(announcement);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/announcements", async (req, res) => {
    try {
      const announcements = await storage.getAllAnnouncements();
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/courses/:courseId/announcements", async (req, res) => {
    try {
      const announcements = await storage.getAnnouncementsByCourse(req.params.courseId);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/users/:authorId/announcements", async (req, res) => {
    try {
      const announcements = await storage.getAnnouncementsByAuthor(req.params.authorId);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/announcements", async (req, res) => {
    try {
      const validatedData = insertAnnouncementSchema.parse(req.body);
      const announcement = await storage.createAnnouncement(validatedData);
      res.status(201).json(announcement);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/announcements/:id", async (req, res) => {
    try {
      const updates = insertAnnouncementSchema.partial().parse(req.body);
      const announcement = await storage.updateAnnouncement(req.params.id, updates);
      if (!announcement) {
        return res.status(404).json({ error: "Announcement not found" });
      }
      res.json(announcement);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        return res.status(400).json({ error: "Validation error", details: (error as any).errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/announcements/:id", async (req, res) => {
    try {
      const success = await storage.deleteAnnouncement(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Announcement not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Targeted announcement routes
  app.get("/api/announcements/:id/details", async (req, res) => {
    try {
      const announcement = await storage.getAnnouncementWithDetails(req.params.id);
      if (!announcement) {
        return res.status(404).json({ error: "Announcement not found" });
      }
      res.json(announcement);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/resources", async (req, res) => {
    try {
      const resources = await storage.getResourcesForStudent(req.params.studentId);
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/announcements", async (req, res) => {
    try {
      const announcements = await storage.getAnnouncementsForStudent(req.params.studentId);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/announcements/unread", async (req, res) => {
    try {
      const announcements = await storage.getUnreadAnnouncementsForStudent(req.params.studentId);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/parents/:parentId/announcements", async (req, res) => {
    try {
      const announcements = await storage.getAnnouncementsForParent(req.params.parentId);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/parents/:parentId/announcements/unread", async (req, res) => {
    try {
      const announcements = await storage.getUnreadAnnouncementsForParent(req.params.parentId);
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/announcements/:id/recipients", async (req, res) => {
    try {
      const { studentIds, notifyParents = true } = req.body;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: "studentIds array is required" });
      }

      const recipients: any[] = [];
      const recipientUserIds: string[] = [];

      for (const studentId of studentIds) {
        const recipientData: any = {
          announcementId: req.params.id,
          studentId
        };
        recipientUserIds.push(studentId);

        if (notifyParents) {
          const parentRelations = await storage.getParentsByChild(studentId);
          if (parentRelations.length > 0) {
            recipientData.parentId = parentRelations[0].parentId;
            recipientUserIds.push(parentRelations[0].parentId);
          }
        }

        recipients.push(recipientData);
      }

      const createdRecipients = await storage.createAnnouncementRecipients(recipients);

      const announcementWithDetails = await storage.getAnnouncementWithDetails(req.params.id);
      if (announcementWithDetails && announcementWithDetails.isPublished) {
        // Create notifications for each recipient
        for (const studentId of studentIds) {
          await storage.createNotification({
            userId: studentId,
            type: 'announcement',
            title: `New Announcement: ${announcementWithDetails.title}`,
            message: announcementWithDetails.content.substring(0, 100),
            relatedId: announcementWithDetails.id,
          });

          // Create parent notifications if applicable
          const parentRelations = await storage.getParentsByChild(studentId);
          if (notifyParents && parentRelations.length > 0) {
            await storage.createNotification({
              userId: parentRelations[0].parentId,
              type: 'announcement',
              title: `New Class Announcement: ${announcementWithDetails.title}`,
              message: announcementWithDetails.content.substring(0, 100),
              relatedId: announcementWithDetails.id,
            });
          }
        }

        websocketService.notifyNewAnnouncement(announcementWithDetails, recipientUserIds);
      }

      res.status(201).json(createdRecipients);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/announcements/:id/recipients", async (req, res) => {
    try {
      const recipients = await storage.getAnnouncementRecipientsByAnnouncement(req.params.id);
      res.json(recipients);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/announcements/:announcementId/read/student/:studentId", async (req, res) => {
    try {
      const success = await storage.markAnnouncementReadByStudent(req.params.announcementId, req.params.studentId);
      if (!success) {
        return res.status(404).json({ error: "Announcement recipient not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/announcements/:announcementId/read/parent/:parentId", async (req, res) => {
    try {
      const success = await storage.markAnnouncementReadByParent(req.params.announcementId, req.params.parentId);
      if (!success) {
        return res.status(404).json({ error: "Announcement recipient not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/announcements/:announcementId/acknowledge/student/:studentId", async (req, res) => {
    try {
      const success = await storage.markAnnouncementAcknowledgedByStudent(req.params.announcementId, req.params.studentId);
      if (!success) {
        return res.status(404).json({ error: "Announcement recipient not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/announcements/:announcementId/acknowledge/parent/:parentId", async (req, res) => {
    try {
      const success = await storage.markAnnouncementAcknowledgedByParent(req.params.announcementId, req.params.parentId);
      if (!success) {
        return res.status(404).json({ error: "Announcement recipient not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Schedule routes
  app.get("/api/schedules/:id", async (req, res) => {
    try {
      const schedule = await storage.getSchedule(req.params.id);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/schedules", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let schedules;

      if (startDate && endDate) {
        schedules = await storage.getSchedulesByDateRange(
          new Date(startDate as string),
          new Date(endDate as string)
        );
      } else {
        schedules = await storage.getAllSchedules();
      }

      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/courses/:courseId/schedules", async (req, res) => {
    try {
      const schedules = await storage.getSchedulesByCourse(req.params.courseId);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/teachers/:teacherId/schedules", async (req, res) => {
    try {
      const schedules = await storage.getSchedulesByTeacher(req.params.teacherId);

      // Include substitution data for each schedule
      const schedulesWithSubstitutions = await Promise.all(
        schedules.map(async (schedule) => {
          const substitution = await storage.getSubstitutionBySchedule(schedule.id);
          return {
            ...schedule,
            substitution: substitution || null,
          };
        })
      );

      res.json(schedulesWithSubstitutions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/students/:studentId/schedules", async (req, res) => {
    try {
      const studentId = req.params.studentId;

      // Get all courses the student is enrolled in
      const enrollments = await storage.getEnrollmentsByStudent(studentId);
      const courseIds = enrollments.map(e => e.courseId);

      // Get all schedules for those courses
      const allSchedules = await Promise.all(
        courseIds.map(courseId => storage.getSchedulesByCourse(courseId))
      );

      // Flatten schedules and filter to only show:
      // 1. Schedules assigned to this specific student (studentId matches), OR
      // 2. General course schedules not assigned to any specific student (studentId is null)
      const schedules = allSchedules.flat().filter(schedule =>
        !schedule.studentId || schedule.studentId === studentId
      );

      // Add substitution data to each schedule
      const schedulesWithSubstitutions = await Promise.all(
        schedules.map(async (schedule) => {
          const substitution = await storage.getSubstitutionBySchedule(schedule.id);
          return { ...schedule, substitution: substitution || null };
        })
      );

      res.json(schedulesWithSubstitutions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/parents/:parentId/schedules", async (req, res) => {
    try {
      // Get all children of the parent
      const children = await storage.getChildrenByParent(req.params.parentId);
      const childIds = children.map(c => c.childId);

      // Get child user data for name lookup
      const childUsers = await Promise.all(
        childIds.map(childId => storage.getUser(childId))
      );
      const childUserMap = new Map(
        childUsers.filter(Boolean).map(u => [u!.id, u])
      );

      // Get enrollments for all children
      const allEnrollments = await Promise.all(
        childIds.map(childId => storage.getEnrollmentsByStudent(childId))
      );
      const enrollments = allEnrollments.flat();
      const courseIds = [...new Set(enrollments.map(e => e.courseId))]; // Deduplicate

      // Get all schedules for those courses
      const allSchedules = await Promise.all(
        courseIds.map(courseId => storage.getSchedulesByCourse(courseId))
      );

      // Flatten schedules and filter to only show:
      // 1. Schedules assigned to one of the parent's children (studentId in childIds), OR
      // 2. General course schedules not assigned to any specific student (studentId is null)
      const schedules = allSchedules.flat().filter(schedule =>
        !schedule.studentId || childIds.includes(schedule.studentId)
      );

      // Add substitution data and student name to each schedule
      const schedulesWithSubstitutions = await Promise.all(
        schedules.map(async (schedule) => {
          const substitution = await storage.getSubstitutionBySchedule(schedule.id);

          let studentName = 'Not specified';
          if (schedule.studentId) {
            const student = childUserMap.get(schedule.studentId);
            studentName = student ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.name || 'Not specified' : 'Not specified';
          } else {
            // If it's a general course schedule (studentId is null), 
            // find which of the parent's children are enrolled in this course
            const childEnrollments = enrollments.filter(e => e.courseId === schedule.courseId);
            if (childEnrollments.length > 0) {
              const names = childEnrollments
                .map(e => childUserMap.get(e.studentId))
                .filter(Boolean)
                .map(u => `${u!.firstName || ''} ${u!.lastName || ''}`.trim() || u!.name);

              if (names.length > 0) {
                studentName = names.join(', ');
              }
            }
          }

          // Get teacher user data for name lookup
          const teacher = await storage.getUser(schedule.teacherId);
          const teacherName = teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.name || 'Unknown' : 'Unknown';
          const teacherAvatar = teacher?.avatarUrl || teacher?.profileImageUrl || null;

          // Get substitute teacher info if available
          let substituteTeacherName = null;
          if (substitution?.substituteTeacherId) {
            const subTeacher = await storage.getUser(substitution.substituteTeacherId);
            substituteTeacherName = subTeacher ? `${subTeacher.firstName || ''} ${subTeacher.lastName || ''}`.trim() || subTeacher.name || 'Unknown' : 'Unknown';
          }

          return {
            ...schedule,
            substitution: substitution || null,
            studentName,
            teacherName,
            teacherAvatar,
            substituteTeacherName
          };
        })
      );

      res.json(schedulesWithSubstitutions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/schedules", async (req, res) => {
    try {
      console.log('Schedule creation request body:', JSON.stringify(req.body, null, 2));

      // Convert date strings to Date objects
      const bodyWithDates = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
      };

      const validated = insertScheduleSchema.parse(bodyWithDates);
      const schedule = await storage.createSchedule(validated);

      // Notify all enrolled students about the new schedule
      const enrollments = await storage.getEnrollmentsByCourse(schedule.courseId);
      const course = await storage.getCourse(schedule.courseId);

      for (const enrollment of enrollments) {
        await storage.createNotification({
          userId: enrollment.studentId,
          type: 'schedule_created',
          title: 'New Event Scheduled',
          message: `A new event "${schedule.title}" has been scheduled for ${course?.title || 'your course'} on ${new Date(schedule.startTime).toLocaleString()}`,
          relatedId: schedule.id,
          relatedType: 'schedule',
          isRead: false
        });
      }

      // Sync to Google Calendar (async, non-blocking)
      syncScheduleToCalendar(storage, schedule, 'create').catch(err =>
        console.error('Google Calendar sync error:', err)
      );

      res.status(201).json(schedule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Schedule validation error:', JSON.stringify(error.errors, null, 2));
        return res.status(400).json({ error: "Invalid schedule data", details: error.errors });
      }
      console.error('Schedule creation error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.patch("/api/schedules/:id", async (req, res) => {
    try {
      // Get the original schedule before updating
      const originalSchedule = await storage.getSchedule(req.params.id);
      if (!originalSchedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Convert date strings to Date objects if present
      const bodyWithDates = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
      };

      const validated = insertScheduleSchema.partial().parse(bodyWithDates);
      const schedule = await storage.updateSchedule(req.params.id, validated);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Check if time changed (rescheduled)
      const isRescheduled =
        (validated.startTime && new Date(validated.startTime).getTime() !== new Date(originalSchedule.startTime).getTime()) ||
        (validated.endTime && new Date(validated.endTime).getTime() !== new Date(originalSchedule.endTime).getTime());

      if (isRescheduled) {
        // Notify all enrolled students and their parents about the reschedule
        const enrollments = await storage.getEnrollmentsByCourse(schedule.courseId);
        const course = await storage.getCourse(schedule.courseId);

        for (const enrollment of enrollments) {
          // Notify student
          await storage.createNotification({
            userId: enrollment.studentId,
            type: 'schedule_rescheduled',
            title: 'Event Rescheduled',
            message: `The event "${schedule.title}" for ${course?.title || 'your course'} has been rescheduled to ${new Date(schedule.startTime).toLocaleString()}`,
            relatedId: schedule.id,
            relatedType: 'schedule',
            isRead: false
          });

          // Notify parent if student has parent relationships
          const parentRelationships = await storage.getParentsByChild(enrollment.studentId);
          for (const relationship of parentRelationships) {
            await storage.createNotification({
              userId: relationship.parentId,
              type: 'schedule_rescheduled',
              title: 'Event Rescheduled',
              message: `The event "${schedule.title}" for ${course?.title || 'course'} has been rescheduled to ${new Date(schedule.startTime).toLocaleString()}`,
              relatedId: schedule.id,
              relatedType: 'schedule',
              isRead: false
            });
          }
        }
      }

      // Auto-credit teacher when schedule is marked as completed
      const wasNotCompleted = originalSchedule.status !== 'completed';
      const isNowCompleted = validated.status === 'completed' && schedule.status === 'completed';

      let classCountCreated = false;
      if (wasNotCompleted && isNowCompleted && validated.status !== undefined) {
        // Check if a class count already exists for this schedule (prevent duplicates)
        const existingClassCounts = await storage.getClassCountsBySchedule(schedule.id);

        if (existingClassCounts.length === 0) {
          // Check for active substitution
          const substitution = await storage.getSubstitutionBySchedule(schedule.id);

          if (substitution) {
            // Credit substitute teacher
            await storage.createTeacherClassCount({
              scheduleId: schedule.id,
              teacherId: substitution.substituteTeacherId,
              courseId: schedule.courseId,
              sessionDate: new Date(schedule.startTime),
              roleType: 'substitute',
              isCounted: true,
              notes: `Substitute for schedule: ${schedule.title}`,
            });
            classCountCreated = true;
          } else if (schedule.teacherId) {
            // Credit regular teacher
            await storage.createTeacherClassCount({
              scheduleId: schedule.id,
              teacherId: schedule.teacherId,
              courseId: schedule.courseId,
              sessionDate: new Date(schedule.startTime),
              roleType: 'regular',
              isCounted: true,
              notes: `Regular session: ${schedule.title}`,
            });
            classCountCreated = true;
          }
        }
      }

      // Notify relevant parties when schedule is marked complete with class count created
      if (classCountCreated) {
        const course = await storage.getCourse(schedule.courseId);
        const teacher = await storage.getUser(schedule.teacherId);

        // Notify teacher about class count
        if (teacher) {
          await storage.createNotification({
            userId: schedule.teacherId,
            type: 'schedule_completed',
            title: 'Class Session Counted',
            message: `Your class "${schedule.title}" for ${course?.title || 'your course'} has been marked as completed and counted in your statistics.`,
            relatedId: schedule.id,
            relatedType: 'schedule',
            isRead: false
          });
        }

        // Notify substitute teacher if one was assigned
        const substitution = await storage.getSubstitutionBySchedule(schedule.id);
        if (substitution) {
          const substituteTeacher = await storage.getUser(substitution.substituteTeacherId);
          if (substituteTeacher) {
            await storage.createNotification({
              userId: substitution.substituteTeacherId,
              type: 'schedule_completed',
              title: 'Substitute Class Session Counted',
              message: `Your substitute class for "${schedule.title}" has been marked as completed and counted in your statistics.`,
              relatedId: schedule.id,
              relatedType: 'schedule',
              isRead: false
            });
          }
        }
      }

      // Sync to Google Calendar (async, non-blocking)
      const isCancelled = validated.status === 'cancelled';
      syncScheduleToCalendar(storage, schedule, isCancelled ? 'cancel' : 'update').catch(err =>
        console.error('Google Calendar sync error:', err)
      );

      res.json({ ...schedule, classCountCreated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid schedule data", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/schedules/:id", async (req, res) => {
    try {
      // Get schedule before deletion for calendar sync
      const schedule = await storage.getSchedule(req.params.id);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Sync deletion to Google Calendar - must await before DB delete to prevent orphaned events
      try {
        await syncScheduleToCalendar(storage, schedule, 'delete');
      } catch (err) {
        console.error('Google Calendar sync error:', err);
      }

      const success = await storage.deleteSchedule(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Schedule not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete all schedules for a recurrence (bulk delete)
  app.delete("/api/schedule-recurrences/:id/schedules", async (req, res) => {
    try {
      const recurrence = await storage.getScheduleRecurrence(req.params.id);
      if (!recurrence) {
        return res.status(404).json({ error: "Recurrence not found" });
      }
      const deletedCount = await storage.deleteSchedulesByRecurrence(req.params.id);
      res.json({ deletedCount, message: `Deleted ${deletedCount} recurring schedules` });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update all schedules for a recurrence (bulk update)
  app.patch("/api/schedule-recurrences/:id/schedules", async (req, res) => {
    try {
      const recurrence = await storage.getScheduleRecurrence(req.params.id);
      if (!recurrence) {
        return res.status(404).json({ error: "Recurrence not found" });
      }

      // Only allow updating certain fields for all schedules
      const allowedFields = ['title', 'description', 'location', 'notes', 'externalLink', 'status'];
      const updates: Record<string, any> = {};

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const updatedCount = await storage.updateSchedulesByRecurrence(req.params.id, updates);
      res.json({ updatedCount, message: `Updated ${updatedCount} recurring schedules` });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Schedule Recurrence routes
  app.post("/api/schedule-recurrences", async (req, res) => {
    try {
      const bodyWithDates = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };

      const validated = insertScheduleRecurrenceSchema.parse(bodyWithDates);
      const recurrence = await storage.createScheduleRecurrence(validated);
      res.status(201).json(recurrence);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid recurrence data", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/schedule-recurrences", async (req, res) => {
    try {
      const recurrences = await storage.getAllScheduleRecurrences();
      res.json(recurrences);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/schedule-recurrences/:id", async (req, res) => {
    try {
      const recurrence = await storage.getScheduleRecurrence(req.params.id);
      if (!recurrence) {
        return res.status(404).json({ error: "Recurrence not found" });
      }
      res.json(recurrence);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.patch("/api/schedule-recurrences/:id", async (req, res) => {
    try {
      const bodyWithDates = {
        ...req.body,
        startTime: req.body.startTime ? new Date(req.body.startTime) : undefined,
        endTime: req.body.endTime ? new Date(req.body.endTime) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };

      // Filter out undefined values to allow true partial updates
      const updates = Object.fromEntries(
        Object.entries(bodyWithDates).filter(([_, v]) => v !== undefined)
      );

      // Validate only the provided fields
      const validated = insertScheduleRecurrenceSchema.partial().parse(updates);
      const recurrence = await storage.updateScheduleRecurrence(req.params.id, validated);
      if (!recurrence) {
        return res.status(404).json({ error: "Recurrence not found" });
      }
      res.json(recurrence);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid recurrence data", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/schedule-recurrences/:id", async (req, res) => {
    try {
      const success = await storage.deleteScheduleRecurrence(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Recurrence not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/schedule-recurrences/:id/generate", async (req, res) => {
    try {
      const recurrence = await storage.getScheduleRecurrence(req.params.id);
      if (!recurrence) {
        return res.status(404).json({ error: "Recurrence not found" });
      }

      const { fromDate, maxOccurrences = 100 } = req.body;
      const from = fromDate ? new Date(fromDate) : undefined;

      const exceptions = await storage.getExceptionsByRecurrence(req.params.id);
      const exceptionDates = exceptions.map(e => new Date(e.occurrenceDate));

      const occurrences = generateRecurrenceOccurrences(
        recurrence,
        maxOccurrences,
        from,
        exceptionDates
      );

      const schedules = await storage.createSchedulesFromRecurrence(req.params.id, occurrences);
      res.status(201).json(schedules);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/schedule-recurrences/:id/exceptions", async (req, res) => {
    try {
      const bodyWithDate = {
        ...req.body,
        occurrenceDate: req.body.occurrenceDate ? new Date(req.body.occurrenceDate) : undefined,
      };

      const validated = insertScheduleRecurrenceExceptionSchema.parse(bodyWithDate);
      const exception = await storage.createScheduleRecurrenceException(validated);
      res.status(201).json(exception);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid exception data", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/schedule-recurrences/:id/exceptions", async (req, res) => {
    try {
      const exceptions = await storage.getExceptionsByRecurrence(req.params.id);
      res.json(exceptions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/schedule-recurrence-exceptions/:id", async (req, res) => {
    try {
      const success = await storage.deleteScheduleRecurrenceException(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Exception not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Reschedule Proposal routes
  // Create a reschedule proposal for a schedule
  app.post("/api/schedules/:id/reschedule-proposal", jwtAuthMiddleware, async (req, res) => {
    try {
      const scheduleId = req.params.id;
      const userId = (req.session as any)?.userId || (req.user as any)?.id;

      // Verify schedule exists
      const schedule = await storage.getSchedule(scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Validate request body
      const bodyWithDates = {
        ...req.body,
        scheduleId,
        proposedBy: userId,
        proposedStartTime: req.body.proposedStartTime ? new Date(req.body.proposedStartTime) : undefined,
        proposedEndTime: req.body.proposedEndTime ? new Date(req.body.proposedEndTime) : undefined,
      };

      const validated = insertRescheduleProposalSchema.parse(bodyWithDates);

      // Create the proposal
      const proposal = await storage.createRescheduleProposal(validated);

      // Get proposer info for notification
      const proposer = await storage.getUser(userId);
      const recipient = await storage.getUser(validated.proposedTo);

      if (recipient) {
        // Create notification for the recipient
        await storage.createNotification({
          userId: validated.proposedTo,
          type: 'schedule_rescheduled',
          title: 'Reschedule Proposal',
          message: `${proposer?.firstName || 'Someone'} ${proposer?.lastName || ''} has proposed to reschedule "${schedule.title}" to ${new Date(validated.proposedStartTime).toLocaleString()}`,
          relatedId: proposal.id,
          relatedType: 'reschedule_proposal',
          isRead: false,
        });
      }

      res.status(201).json(proposal);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid proposal data", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get all pending reschedule proposals for current user
  app.get("/api/reschedule-proposals/pending", jwtAuthMiddleware, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId || (req.user as any)?.id;
      const proposals = await storage.getPendingRescheduleProposalsForUser(userId);

      // Enrich with relations
      const proposalsWithRelations = await Promise.all(
        proposals.map(async (proposal) => {
          return await storage.getRescheduleProposalWithRelations(proposal.id);
        })
      );

      res.json(proposalsWithRelations.filter(Boolean));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get all reschedule proposals for current user (both sent and received)
  app.get("/api/reschedule-proposals", jwtAuthMiddleware, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId || (req.user as any)?.id;
      const proposals = await storage.getRescheduleProposalsByUser(userId);

      // Enrich with relations
      const proposalsWithRelations = await Promise.all(
        proposals.map(async (proposal) => {
          return await storage.getRescheduleProposalWithRelations(proposal.id);
        })
      );

      res.json(proposalsWithRelations.filter(Boolean));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get reschedule proposals for a specific schedule
  app.get("/api/schedules/:id/reschedule-proposals", jwtAuthMiddleware, async (req, res) => {
    try {
      const proposals = await storage.getRescheduleProposalsBySchedule(req.params.id);

      // Enrich with relations
      const proposalsWithRelations = await Promise.all(
        proposals.map(async (proposal) => {
          return await storage.getRescheduleProposalWithRelations(proposal.id);
        })
      );

      res.json(proposalsWithRelations.filter(Boolean));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get a single reschedule proposal with relations
  app.get("/api/reschedule-proposals/:id", jwtAuthMiddleware, async (req, res) => {
    try {
      const proposal = await storage.getRescheduleProposalWithRelations(req.params.id);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }
      res.json(proposal);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Respond to a reschedule proposal (accept, reject, or counter-propose)
  app.post("/api/reschedule-proposals/:id/respond", jwtAuthMiddleware, async (req, res) => {
    try {
      const proposalId = req.params.id;
      const userId = (req.session as any)?.userId || (req.user as any)?.id;
      const { action, message, proposedStartTime, proposedEndTime } = req.body;

      // Validate action
      if (!['accept', 'reject', 'counter_propose'].includes(action)) {
        return res.status(400).json({ error: "Invalid action. Must be 'accept', 'reject', or 'counter_propose'" });
      }

      // Get the proposal
      const proposal = await storage.getRescheduleProposalWithRelations(proposalId);
      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      // Verify user is the recipient
      if (proposal.proposedTo !== userId) {
        return res.status(403).json({ error: "You are not authorized to respond to this proposal" });
      }

      // Check if proposal is still pending
      if (proposal.status !== 'pending') {
        return res.status(400).json({ error: "This proposal has already been responded to" });
      }

      const schedule = await storage.getSchedule(proposal.scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Associated schedule not found" });
      }

      const responder = await storage.getUser(userId);
      const originalProposer = await storage.getUser(proposal.proposedBy);

      if (action === 'accept') {
        // Update the proposal status
        await storage.updateRescheduleProposal(proposalId, {
          status: 'accepted',
          respondedAt: new Date(),
        });

        // Update the schedule with the proposed times
        await storage.updateSchedule(proposal.scheduleId, {
          startTime: proposal.proposedStartTime,
          endTime: proposal.proposedEndTime,
          status: 'rescheduled',
        });

        // Notify the original proposer
        if (originalProposer) {
          await storage.createNotification({
            userId: proposal.proposedBy,
            type: 'schedule_rescheduled',
            title: 'Reschedule Accepted',
            message: `${responder?.firstName || 'Someone'} ${responder?.lastName || ''} has accepted your reschedule proposal for "${schedule.title}"`,
            relatedId: proposal.scheduleId,
            relatedType: 'schedule',
            isRead: false,
          });
        }

        // Notify admins about the schedule change
        const admins = await storage.getUsersByRole('admin');
        for (const admin of admins) {
          await storage.createNotification({
            userId: admin.id,
            type: 'schedule_rescheduled',
            title: 'Schedule Rescheduled',
            message: `A class for "${schedule.title}" has been rescheduled to ${new Date(proposal.proposedStartTime).toLocaleString()}`,
            relatedId: proposal.scheduleId,
            relatedType: 'schedule',
            isRead: false,
          });
        }

        res.json({ message: "Proposal accepted and schedule updated", proposal: await storage.getRescheduleProposalWithRelations(proposalId) });

      } else if (action === 'reject') {
        // Update the proposal status
        await storage.updateRescheduleProposal(proposalId, {
          status: 'rejected',
          respondedAt: new Date(),
          message: message || null,
        });

        // Notify the original proposer
        if (originalProposer) {
          await storage.createNotification({
            userId: proposal.proposedBy,
            type: 'schedule_rescheduled',
            title: 'Reschedule Rejected',
            message: `${responder?.firstName || 'Someone'} ${responder?.lastName || ''} has rejected your reschedule proposal for "${schedule.title}"${message ? `: ${message}` : ''}`,
            relatedId: proposal.scheduleId,
            relatedType: 'schedule',
            isRead: false,
          });
        }

        res.json({ message: "Proposal rejected", proposal: await storage.getRescheduleProposalWithRelations(proposalId) });

      } else if (action === 'counter_propose') {
        // Validate counter proposal times
        if (!proposedStartTime || !proposedEndTime) {
          return res.status(400).json({ error: "Counter proposal requires proposedStartTime and proposedEndTime" });
        }

        // Update the original proposal status
        await storage.updateRescheduleProposal(proposalId, {
          status: 'counter_proposed',
          respondedAt: new Date(),
          message: message || null,
        });

        // Create a new counter proposal (swap proposer and recipient)
        const counterProposal = await storage.createRescheduleProposal({
          scheduleId: proposal.scheduleId,
          proposedBy: userId,
          proposedTo: proposal.proposedBy,
          proposedStartTime: new Date(proposedStartTime),
          proposedEndTime: new Date(proposedEndTime),
          counterProposalId: proposalId,
          message: message || null,
          status: 'pending',
        });

        // Notify the original proposer about the counter proposal
        if (originalProposer) {
          await storage.createNotification({
            userId: proposal.proposedBy,
            type: 'schedule_rescheduled',
            title: 'Counter Proposal Received',
            message: `${responder?.firstName || 'Someone'} ${responder?.lastName || ''} has proposed a different time for "${schedule.title}": ${new Date(proposedStartTime).toLocaleString()}`,
            relatedId: counterProposal.id,
            relatedType: 'reschedule_proposal',
            isRead: false,
          });
        }

        res.json({ message: "Counter proposal created", counterProposal: await storage.getRescheduleProposalWithRelations(counterProposal.id) });
      }
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete a reschedule proposal (only by the proposer, and only if pending)
  app.delete("/api/reschedule-proposals/:id", jwtAuthMiddleware, async (req, res) => {
    try {
      const userId = (req.session as any)?.userId || (req.user as any)?.id;
      const proposal = await storage.getRescheduleProposal(req.params.id);

      if (!proposal) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      // Only the proposer can delete, and only if still pending
      if (proposal.proposedBy !== userId) {
        return res.status(403).json({ error: "You can only delete proposals you created" });
      }

      if (proposal.status !== 'pending') {
        return res.status(400).json({ error: "Cannot delete a proposal that has already been responded to" });
      }

      const success = await storage.deleteRescheduleProposal(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Proposal not found" });
      }

      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Schedule Substitution routes
  app.get("/api/schedule-substitutions/:id", async (req, res) => {
    try {
      const substitution = await storage.getScheduleSubstitution(req.params.id);
      if (!substitution) {
        return res.status(404).json({ error: "Substitution not found" });
      }
      res.json(substitution);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/schedules/:scheduleId/substitution", async (req, res) => {
    try {
      const substitution = await storage.getSubstitutionBySchedule(req.params.scheduleId);
      res.json(substitution || null);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/teachers/:teacherId/substitutions", async (req, res) => {
    try {
      const substitutions = await storage.getSubstitutionsByTeacher(req.params.teacherId);
      res.json(substitutions);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/schedule-substitutions", async (req, res) => {
    try {
      const validated = insertScheduleSubstitutionSchema.parse(req.body);
      const substitution = await storage.createScheduleSubstitution(validated);
      res.status(201).json(substitution);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid substitution data", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.patch("/api/schedule-substitutions/:id", async (req, res) => {
    try {
      const substitution = await storage.updateScheduleSubstitution(req.params.id, req.body);
      if (!substitution) {
        return res.status(404).json({ error: "Substitution not found" });
      }
      res.json(substitution);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/schedule-substitutions/:id", async (req, res) => {
    try {
      const success = await storage.deleteScheduleSubstitution(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Substitution not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Teacher Class Count routes
  app.get("/api/teacher-class-counts/:id", async (req, res) => {
    try {
      const classCount = await storage.getTeacherClassCount(req.params.id);
      if (!classCount) {
        return res.status(404).json({ error: "Class count record not found" });
      }
      res.json(classCount);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/teachers/:teacherId/class-counts", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const classCounts = await storage.getClassCountsByTeacher(
        req.params.teacherId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json(classCounts);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/schedules/:scheduleId/class-counts", async (req, res) => {
    try {
      const classCounts = await storage.getClassCountsBySchedule(req.params.scheduleId);
      res.json(classCounts);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/teacher-class-counts", async (req, res) => {
    try {
      const bodyWithDate = {
        ...req.body,
        sessionDate: req.body.sessionDate ? new Date(req.body.sessionDate) : undefined,
      };
      const validated = insertTeacherClassCountSchema.parse(bodyWithDate);
      const classCount = await storage.createTeacherClassCount(validated);
      res.status(201).json(classCount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid class count data", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get relevant users for a schedule (for communication feature)
  app.get("/api/schedules/:scheduleId/communication-recipients", jwtAuthMiddleware, async (req: any, res) => {
    try {
      // Verify user is admin
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Unauthorized: Admin access required" });
      }

      const schedule = await storage.getSchedule(req.params.scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      const recipients: Array<{
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        role: string;
        type: 'teacher' | 'student' | 'parent';
      }> = [];

      // Get teacher
      const teacher = await storage.getUser(schedule.teacherId);
      if (teacher) {
        recipients.push({
          id: teacher.id,
          name: teacher.name,
          email: teacher.email || null,
          phone: teacher.phone || null,
          role: teacher.role,
          type: 'teacher'
        });
      }

      // Check for substitute teacher
      const substitution = await storage.getSubstitutionBySchedule(schedule.id);
      if (substitution) {
        const substituteTeacher = await storage.getUser(substitution.substituteTeacherId);
        if (substituteTeacher && substituteTeacher.id !== teacher?.id) {
          recipients.push({
            id: substituteTeacher.id,
            name: substituteTeacher.name + ' (Substitute)',
            email: substituteTeacher.email || null,
            phone: substituteTeacher.phone || null,
            role: substituteTeacher.role,
            type: 'teacher'
          });
        }
      }

      // Get student if assigned to this schedule
      if (schedule.studentId) {
        const student = await storage.getUser(schedule.studentId);
        if (student) {
          recipients.push({
            id: student.id,
            name: student.name,
            email: student.email || null,
            phone: student.phone || null,
            role: student.role,
            type: 'student'
          });

          // Get parents of this student
          const parentRelationships = await storage.getParentsByChild(student.id);
          for (const relationship of parentRelationships) {
            const parent = await storage.getUser(relationship.parentId);
            if (parent) {
              recipients.push({
                id: parent.id,
                name: parent.name,
                email: parent.email || null,
                phone: parent.phone || null,
                role: parent.role,
                type: 'parent'
              });
            }
          }
        }
      }

      res.json(recipients);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Send communication to schedule participants
  app.post("/api/schedules/:scheduleId/send-communication", jwtAuthMiddleware, async (req: any, res) => {
    try {
      // Verify user is admin
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || currentUser.role !== 'admin') {
        return res.status(403).json({ error: "Unauthorized: Admin access required" });
      }

      const schedule = await storage.getSchedule(req.params.scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: "Schedule not found" });
      }

      // Check if schedule is upcoming (not finished)
      if (new Date(schedule.endTime) <= new Date()) {
        return res.status(400).json({ error: "Cannot send communication for finished schedules" });
      }

      const { recipientIds, communicationType, subject, message } = req.body;

      if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
        return res.status(400).json({ error: "At least one recipient is required" });
      }

      if (!communicationType || !['message', 'email', 'sms'].includes(communicationType)) {
        return res.status(400).json({ error: "Invalid communication type. Must be 'message', 'email', or 'sms'" });
      }

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      const results: Array<{ recipientId: string; success: boolean; error?: string }> = [];

      for (const recipientId of recipientIds) {
        try {
          const recipient = await storage.getUser(recipientId);
          if (!recipient) {
            results.push({ recipientId, success: false, error: 'User not found' });
            continue;
          }

          if (communicationType === 'message') {
            // Send internal platform message
            await storage.createMessage({
              senderId: currentUser.id,
              recipientId: recipient.id,
              subject: subject || `Regarding: ${schedule.title}`,
              content: message,
              isRead: false,
            });
            results.push({ recipientId, success: true });
          } else if (communicationType === 'email') {
            // Send email via Resend
            if (!recipient.email) {
              results.push({ recipientId, success: false, error: 'Recipient has no email address' });
              continue;
            }

            const { getUncachableResendClient } = await import('./services/resend.js');
            const { client, fromEmail } = await getUncachableResendClient();

            await client.emails.send({
              from: fromEmail,
              to: recipient.email,
              subject: subject || `Regarding: ${schedule.title}`,
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background: linear-gradient(135deg, #67c090 0%, #26667f 100%); padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h2 style="color: white; margin: 0;">Learning Center</h2>
                  </div>
                  <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
                    <p>Dear ${recipient.name},</p>
                    <p>${message.replace(/\n/g, '<br>')}</p>
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                    <p style="font-size: 12px; color: #666;">
                      <strong>Schedule:</strong> ${schedule.title}<br>
                      <strong>Date:</strong> ${new Date(schedule.startTime).toLocaleDateString()}<br>
                      <strong>Time:</strong> ${new Date(schedule.startTime).toLocaleTimeString()} - ${new Date(schedule.endTime).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              `,
            });
            results.push({ recipientId, success: true });
          } else if (communicationType === 'sms') {
            // SMS via Twilio - check if configured
            if (!recipient.phone) {
              results.push({ recipientId, success: false, error: 'Recipient has no phone number' });
              continue;
            }

            // Try to send SMS via Twilio if configured
            try {
              const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
              const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
              const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

              if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
                results.push({ recipientId, success: false, error: 'SMS service not configured' });
                continue;
              }

              const twilio = await import('twilio');
              const twilioClient = twilio.default(twilioAccountSid, twilioAuthToken);

              await twilioClient.messages.create({
                body: `${subject ? subject + ': ' : ''}${message}\n\nSchedule: ${schedule.title} on ${new Date(schedule.startTime).toLocaleDateString()}`,
                from: twilioPhoneNumber,
                to: recipient.phone,
              });
              results.push({ recipientId, success: true });
            } catch (smsError) {
              results.push({ recipientId, success: false, error: smsError instanceof Error ? smsError.message : 'SMS send failed' });
            }
          }
        } catch (individualError) {
          results.push({ recipientId, success: false, error: individualError instanceof Error ? individualError.message : 'Unknown error' });
        }
      }

      // Create notification for successful message sends
      const successfulMessages = results.filter(r => r.success && communicationType === 'message');
      for (const result of successfulMessages) {
        try {
          await storage.createNotification({
            userId: result.recipientId,
            type: 'message',
            title: 'New Message from Admin',
            message: subject || `Regarding: ${schedule.title}`,
            resourceId: null,
            isRead: false,
          });
        } catch (e) {
          // Notification creation failure should not fail the overall operation
          console.error('Failed to create notification:', e);
        }
      }

      const allSuccessful = results.every(r => r.success);
      const someSuccessful = results.some(r => r.success);

      res.json({
        success: allSuccessful,
        partialSuccess: !allSuccessful && someSuccessful,
        results,
      });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Teacher Session Stats routes
  app.get("/api/teachers/:teacherId/session-stats", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate query parameters are required" });
      }
      const stats = await storage.getTeacherSessionStats(
        req.params.teacherId,
        new Date(startDate as string),
        new Date(endDate as string)
      );
      res.json(stats);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/teacher-session-stats", jwtAuthMiddleware, async (req: any, res) => {
    try {
      // Verify user has admin or finance_admin role
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'finance_admin')) {
        return res.status(403).json({ error: "Unauthorized: Admin or Finance Admin access required" });
      }

      const { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate query parameters are required" });
      }
      const allStats = await storage.getAllTeacherSessionStats(
        new Date(startDate as string),
        new Date(endDate as string)
      );
      res.json(allStats);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/detailed-class-records", jwtAuthMiddleware, async (req: any, res) => {
    try {
      // Verify user has admin or finance_admin role
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'finance_admin')) {
        return res.status(403).json({ error: "Unauthorized: Admin or Finance Admin access required" });
      }

      const { startDate, endDate, teacherId } = req.query;
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate query parameters are required" });
      }
      const records = await storage.getDetailedClassRecords(
        new Date(startDate as string),
        new Date(endDate as string),
        teacherId as string | undefined
      );
      res.json(records);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/sync-teacher-sessions", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'finance_admin')) {
        return res.status(403).json({ error: "Unauthorized: Admin or Finance Admin access required" });
      }

      const { startDate, endDate } = req.body;
      console.log("Sync request received:", { startDate, endDate });
      const result = await storage.syncTeacherSessionsFromSchedules(
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      );
      console.log("Sync result:", result);
      res.json(result);
    } catch (error) {
      console.error("Sync error:", error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Notification routes
  app.get("/api/notifications/:userId", async (req, res) => {
    try {
      const notifications = await storage.getUserNotifications(req.params.userId);
      res.json(notifications);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/notifications/:userId/unread-count", async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.params.userId);
      res.json({ count });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.patch("/api/notifications/:userId/read-all", async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.params.userId);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Subject routes
  app.get("/api/subjects", async (req, res) => {
    try {
      const subjects = await storage.getAllSubjects();
      res.json(subjects);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/subjects/:id", async (req, res) => {
    try {
      const subject = await storage.getSubject(req.params.id);
      if (!subject) {
        return res.status(404).json({ error: "Subject not found" });
      }
      res.json(subject);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/subjects", async (req, res) => {
    try {
      const validatedData = insertSubjectSchema.parse(req.body);
      const subject = await storage.createSubject(validatedData);
      res.status(201).json(subject);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/subjects/:id", async (req, res) => {
    try {
      const validatedData = insertSubjectSchema.partial().parse(req.body);
      const subject = await storage.updateSubject(req.params.id, validatedData);
      if (!subject) {
        return res.status(404).json({ error: "Subject not found" });
      }
      res.json(subject);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/subjects/:id", async (req, res) => {
    try {
      const success = await storage.deleteSubject(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Subject not found" });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ===========================
  // Fee Management Routes
  // ===========================

  // Fee Plans - Admin only
  app.get("/api/admin/fee-plans", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const feePlans = await storage.getAllFeePlans();
      res.json(feePlans);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/fee-plans/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const feePlan = await storage.getFeePlan(req.params.id);
      if (!feePlan) {
        return res.status(404).json({ error: 'Fee plan not found' });
      }
      res.json(feePlan);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/fee-plans", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const { stateAdjustments, ...feePlanData } = req.body;
      const validatedData = insertFeePlanSchema.parse(feePlanData);
      const feePlan = await storage.createFeePlan(validatedData);

      // Create state fee structures if provided
      if (stateAdjustments && Array.isArray(stateAdjustments) && stateAdjustments.length > 0) {
        for (const adjustment of stateAdjustments) {
          if (adjustment.stateCode && adjustment.stateName && adjustment.adjustmentValue) {
            await storage.createStateFeeStructure({
              feePlanId: feePlan.id,
              stateCode: adjustment.stateCode,
              stateName: adjustment.stateName,
              adjustmentType: adjustment.adjustmentType || 'percentage',
              adjustmentValue: adjustment.adjustmentValue,
              description: adjustment.description || null,
            });
          }
        }
      }

      res.status(201).json(feePlan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/admin/fee-plans/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const { stateAdjustments, ...feePlanData } = req.body;
      const validatedData = insertFeePlanSchema.partial().parse(feePlanData);
      const feePlan = await storage.updateFeePlan(req.params.id, validatedData);
      if (!feePlan) {
        return res.status(404).json({ error: 'Fee plan not found' });
      }

      // Handle state adjustments if provided
      if (stateAdjustments !== undefined && Array.isArray(stateAdjustments)) {
        // Get existing state fees for this plan
        const existingStateFees = await storage.getStateFeeStructuresByFeePlan(req.params.id);
        const existingIds = new Set(existingStateFees.map(sf => sf.id));
        const submittedIds = new Set(stateAdjustments.filter(a => a.id).map(a => a.id));

        // Delete state fees that are no longer in the list
        for (const existingFee of existingStateFees) {
          if (!submittedIds.has(existingFee.id)) {
            await storage.deleteStateFeeStructure(existingFee.id);
          }
        }

        // Update or create state fees
        for (const adjustment of stateAdjustments) {
          if (adjustment.stateCode && adjustment.stateName && adjustment.adjustmentValue) {
            if (adjustment.id && existingIds.has(adjustment.id)) {
              // Update existing
              await storage.updateStateFeeStructure(adjustment.id, {
                stateCode: adjustment.stateCode,
                stateName: adjustment.stateName,
                adjustmentType: adjustment.adjustmentType || 'percentage',
                adjustmentValue: adjustment.adjustmentValue,
                description: adjustment.description || null,
              });
            } else {
              // Create new
              await storage.createStateFeeStructure({
                feePlanId: feePlan.id,
                stateCode: adjustment.stateCode,
                stateName: adjustment.stateName,
                adjustmentType: adjustment.adjustmentType || 'percentage',
                adjustmentValue: adjustment.adjustmentValue,
                description: adjustment.description || null,
              });
            }
          }
        }
      }

      res.json(feePlan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/admin/fee-plans/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'finance_admin')) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const success = await storage.deleteFeePlan(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Fee plan not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Student Fee Assignments - Admin only
  app.get("/api/admin/student-fee-assignments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const assignments = await storage.getAllStudentFeeAssignments();

      // Populate student, feePlan, and state adjustment for each assignment
      const enrichedAssignments = await Promise.all(
        assignments.map(async (assignment) => {
          const student = await storage.getUser(assignment.studentId);
          const feePlan = await storage.getFeePlan(assignment.feePlanId);

          // Get state-specific adjustment if student has a state
          let stateAdjustment = null;
          let adjustedRatePerClass = feePlan?.ratePerClass;
          if (student?.state && feePlan) {
            const stateFees = await storage.getStateFeeStructuresByFeePlan(feePlan.id);
            const stateMatch = stateFees.find(sf => sf.stateCode === student.state && sf.isActive);
            if (stateMatch) {
              stateAdjustment = stateMatch;
              // Calculate adjusted rate per class
              const baseRate = parseFloat(feePlan.ratePerClass || '0');
              const adjustmentValue = parseFloat(stateMatch.adjustmentValue);
              if (stateMatch.adjustmentType === 'percentage') {
                adjustedRatePerClass = (baseRate + (baseRate * adjustmentValue / 100)).toFixed(2);
              } else {
                adjustedRatePerClass = (baseRate + adjustmentValue).toFixed(2);
              }
            }
          }

          return {
            ...assignment,
            student,
            feePlan: feePlan ? { ...feePlan, adjustedRatePerClass } : feePlan,
            stateAdjustment
          };
        })
      );

      res.json(enrichedAssignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/students/:studentId/fee-assignments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const allAssignments = await storage.getAllStudentFeeAssignments();
      const assignments = allAssignments.filter(a => a.studentId === req.params.studentId);
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/student-fee-assignments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const validatedData = insertStudentFeeAssignmentSchema.parse(req.body);
      const assignment = await storage.createStudentFeeAssignment(validatedData);

      // Trigger immediate invoice generation for this assignment
      try {
        const { cronService } = await import('./cron-service');
        cronService.triggerInvoiceGeneration();
        console.log('[Routes] Triggered invoice generation after fee assignment creation');
      } catch (invoiceError) {
        console.error('[Routes] Error triggering invoice generation:', invoiceError);
      }

      res.status(201).json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/admin/student-fee-assignments/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validatedData = insertStudentFeeAssignmentSchema.partial().parse(req.body);
      const assignment = await storage.updateStudentFeeAssignment(req.params.id, validatedData);
      if (!assignment) {
        return res.status(404).json({ error: 'Student fee assignment not found' });
      }
      res.json(assignment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/student-fee-assignments/:id/deactivate", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const assignment = await storage.updateStudentFeeAssignment(req.params.id, { isActive: false });
      if (!assignment) {
        return res.status(404).json({ error: 'Student fee assignment not found' });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Toggle assignment status (activate/deactivate)
  app.post("/api/admin/student-fee-assignments/:id/toggle-status", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const { isActive } = req.body;
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean' });
      }
      const assignment = await storage.updateStudentFeeAssignment(req.params.id, { isActive });
      if (!assignment) {
        return res.status(404).json({ error: 'Student fee assignment not found' });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/admin/student-fee-assignments/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const success = await storage.deleteStudentFeeAssignment(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Student fee assignment not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Discounts - Finance Admin only
  app.get("/api/admin/discounts", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const discounts = await storage.getAllDiscounts();
      res.json(discounts);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/discounts/active", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const discounts = await storage.getActiveDiscounts();
      res.json(discounts);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/discounts/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const discount = await storage.getDiscount(req.params.id);
      if (!discount) {
        return res.status(404).json({ error: 'Discount not found' });
      }
      res.json(discount);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/discounts", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validatedData = insertDiscountSchema.parse(req.body);
      const discount = await storage.createDiscount(validatedData);
      res.status(201).json(discount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/admin/discounts/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validatedData = insertDiscountSchema.partial().parse(req.body);
      const discount = await storage.updateDiscount(req.params.id, validatedData);
      if (!discount) {
        return res.status(404).json({ error: 'Discount not found' });
      }
      res.json(discount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/admin/discounts/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const success = await storage.deleteDiscount(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Discount not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Student Discounts - Finance Admin only
  app.get("/api/admin/student-discounts", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const studentDiscounts = await storage.getAllStudentDiscounts();

      const enrichedData = await Promise.all(
        studentDiscounts.map(async (sd) => {
          const [student, discount] = await Promise.all([
            storage.getUser(sd.studentId),
            storage.getDiscount(sd.discountId)
          ]);
          return {
            ...sd,
            student: student ? { id: student.id, firstName: student.firstName, lastName: student.lastName, email: student.email } : null,
            discount
          };
        })
      );

      res.json(enrichedData);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/students/:studentId/discounts", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const studentDiscounts = await storage.getActiveStudentDiscountsByStudent(req.params.studentId);

      const enrichedData = await Promise.all(
        studentDiscounts.map(async (sd) => {
          const discount = await storage.getDiscount(sd.discountId);
          return { ...sd, discount };
        })
      );

      res.json(enrichedData);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/student-discounts", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validatedData = insertStudentDiscountSchema.parse(req.body);
      const studentDiscount = await storage.createStudentDiscount(validatedData);
      res.status(201).json(studentDiscount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/admin/student-discounts/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validatedData = insertStudentDiscountSchema.partial().parse(req.body);
      const studentDiscount = await storage.updateStudentDiscount(req.params.id, validatedData);
      if (!studentDiscount) {
        return res.status(404).json({ error: 'Student discount not found' });
      }
      res.json(studentDiscount);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/admin/student-discounts/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const success = await storage.deleteStudentDiscount(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Student discount not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // State Fee Structures - Finance Admin only
  app.get("/api/admin/state-fee-structures", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const stateFees = await storage.getAllStateFeeStructures();

      const enrichedData = await Promise.all(
        stateFees.map(async (sf) => {
          const feePlan = await storage.getFeePlan(sf.feePlanId);
          return { ...sf, feePlan };
        })
      );

      res.json(enrichedData);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/fee-plans/:feePlanId/state-fees", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const stateFees = await storage.getStateFeeStructuresByFeePlan(req.params.feePlanId);
      res.json(stateFees);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/state-fee-structures/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const stateFee = await storage.getStateFeeStructure(req.params.id);
      if (!stateFee) {
        return res.status(404).json({ error: 'State fee structure not found' });
      }
      res.json(stateFee);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/admin/state-fee-structures", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validatedData = insertStateFeeStructureSchema.parse(req.body);
      const stateFee = await storage.createStateFeeStructure(validatedData);
      res.status(201).json(stateFee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/admin/state-fee-structures/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validatedData = insertStateFeeStructureSchema.partial().parse(req.body);
      const stateFee = await storage.updateStateFeeStructure(req.params.id, validatedData);
      if (!stateFee) {
        return res.status(404).json({ error: 'State fee structure not found' });
      }
      res.json(stateFee);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/admin/state-fee-structures/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const success = await storage.deleteStateFeeStructure(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'State fee structure not found' });
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/state-fee-structures/by-state/:stateCode", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser || !['admin', 'finance_admin'].includes(currentUser.role)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const stateFee = await storage.getStateFeeStructureByStateCode(req.params.stateCode);
      if (!stateFee) {
        return res.status(404).json({ error: 'No active fee structure found for this state' });
      }
      const feePlan = await storage.getFeePlan(stateFee.feePlanId);
      res.json({ ...stateFee, feePlan });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Invoices - Admin and Finance Admin access
  app.get("/api/admin/invoices", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const invoices = await storage.getAllInvoices();

      // Enrich invoices with student, parent, and feePlan data
      const enrichedInvoices = await Promise.all(invoices.map(async (invoice) => {
        const [student, parent, feePlan] = await Promise.all([
          storage.getUser(invoice.studentId),
          storage.getUser(invoice.parentId),
          storage.getFeePlan(invoice.feePlanId)
        ]);
        return {
          ...invoice,
          student: student ? { id: student.id, firstName: student.firstName, lastName: student.lastName, email: student.email } : null,
          parent: parent ? { id: parent.id, firstName: parent.firstName, lastName: parent.lastName, email: parent.email } : null,
          feePlan: feePlan ? { id: feePlan.id, name: feePlan.name, billingCycle: feePlan.billingCycle, amount: feePlan.amount } : null
        };
      }));

      res.json(enrichedInvoices);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/parent/invoices", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'parent' && currentUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      // For parents, derive parentId exclusively from session (no parameter tampering possible)
      if (currentUser.role === 'parent') {
        // Verify parent-child relationship exists
        const parentChildren = await storage.getChildrenByParent(currentUser.id);
        if (parentChildren.length === 0) {
          return res.status(403).json({ error: 'No children found for this parent' });
        }
        const invoices = await storage.getInvoicesByParent(currentUser.id);

        // Enrich invoices with student and feePlan data
        const enrichedInvoices = await Promise.all(invoices.map(async (invoice) => {
          const [student, feePlan] = await Promise.all([
            storage.getUser(invoice.studentId),
            storage.getFeePlan(invoice.feePlanId)
          ]);
          return {
            ...invoice,
            student: student ? { id: student.id, firstName: student.firstName, lastName: student.lastName, email: student.email } : null,
            feePlan: feePlan ? { id: feePlan.id, name: feePlan.name, billingCycle: feePlan.billingCycle, amount: feePlan.amount } : null
          };
        }));

        res.json(enrichedInvoices);
      } else {
        // Admins can view all invoices
        const invoices = await storage.getAllInvoices();
        res.json(invoices);
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/student/invoices", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'student' && currentUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      // For students, get their own invoices
      if (currentUser.role === 'student') {
        const invoices = await storage.getInvoicesByStudent(currentUser.id);
        res.json(invoices);
      } else {
        // Admins can view all invoices
        const invoices = await storage.getAllInvoices();
        res.json(invoices);
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/invoices/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      // Check authorization
      if (currentUser?.role === 'parent' && invoice.parentId !== currentUser.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'parent') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/invoices/:id/items", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const items = await storage.getInvoiceItemsByInvoice(req.params.id);
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.put("/api/admin/invoices/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const validatedData = insertInvoiceSchema.partial().parse(req.body);
      const invoice = await storage.updateInvoice(req.params.id, validatedData);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      res.json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.delete("/api/admin/invoices/:id", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Get invoice to check status before deletion
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Prevent deletion of paid invoices
      if (invoice.status === 'paid') {
        return res.status(400).json({ error: 'Cannot delete paid invoices' });
      }

      const { reason } = req.body || {};

      // Soft delete the invoice (maintains record for audit)
      const deleted = await storage.softDeleteInvoice(req.params.id, currentUser!.id, reason);
      if (!deleted) {
        return res.status(500).json({ error: 'Failed to delete invoice' });
      }

      res.json({ success: true, message: 'Invoice deleted. Record maintained for audit purposes.' });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Create a copy of an invoice (for deleted or existing invoices)
  app.post("/api/admin/invoices/:id/copy", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const copy = await storage.createInvoiceCopy(req.params.id);
      if (!copy) {
        return res.status(404).json({ error: 'Original invoice not found' });
      }

      res.json(copy);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get all invoices including deleted (for audit purposes)
  app.get("/api/admin/invoices/all/including-deleted", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const allInvoices = await storage.getAllInvoicesIncludingDeleted();
      res.json(allInvoices);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get invoice sessions (tracks which scheduled sessions are included in each invoice)
  app.get("/api/admin/invoices/:id/sessions", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const sessions = await storage.getInvoiceSessionsByInvoice(req.params.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Payments - Parent and Admin
  app.get("/api/parent/payments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'parent' && currentUser?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      // For parents, derive parentId exclusively from session (no parameter tampering possible)
      if (currentUser.role === 'parent') {
        // Verify parent-child relationship exists
        const parentChildren = await storage.getChildrenByParent(currentUser.id);
        if (parentChildren.length === 0) {
          return res.status(403).json({ error: 'No children found for this parent' });
        }
        const payments = await storage.getPaymentsByParent(currentUser.id);

        // Enrich payments with invoice, student, and feePlan data
        const enrichedPayments = await Promise.all(payments.map(async (payment) => {
          const invoice = await storage.getInvoice(payment.invoiceId);
          if (!invoice) {
            return { ...payment, invoice: null };
          }

          const [student, feePlan] = await Promise.all([
            storage.getUser(invoice.studentId),
            storage.getFeePlan(invoice.feePlanId)
          ]);

          return {
            ...payment,
            invoice: {
              ...invoice,
              invoiceNumber: invoice.invoiceNumber,
              student: student ? { id: student.id, firstName: student.firstName, lastName: student.lastName, email: student.email } : null,
              feePlan: feePlan ? { id: feePlan.id, name: feePlan.name, billingCycle: feePlan.billingCycle, amount: feePlan.amount } : null
            }
          };
        }));

        res.json(enrichedPayments);
      } else {
        // Admins can view all payments
        const payments = await storage.getAllPayments();
        res.json(payments);
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.get("/api/admin/payments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      const payments = await storage.getAllPayments();

      // Enrich payments with invoice, student, parent, and feePlan data
      const enrichedPayments = await Promise.all(payments.map(async (payment) => {
        const invoice = await storage.getInvoice(payment.invoiceId);
        if (!invoice) {
          return { ...payment, invoice: null };
        }

        const [student, parent, feePlan] = await Promise.all([
          storage.getUser(invoice.studentId),
          storage.getUser(invoice.parentId),
          storage.getFeePlan(invoice.feePlanId)
        ]);

        return {
          ...payment,
          invoice: {
            ...invoice,
            invoiceNumber: invoice.invoiceNumber,
            student: student ? { id: student.id, firstName: student.firstName, lastName: student.lastName, email: student.email } : null,
            parent: parent ? { id: parent.id, firstName: parent.firstName, lastName: parent.lastName, email: parent.email } : null,
            feePlan: feePlan ? { id: feePlan.id, name: feePlan.name, billingCycle: feePlan.billingCycle, amount: feePlan.amount } : null
          }
        };
      }));

      res.json(enrichedPayments);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/payments", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (!currentUser) {
        return res.status(403).json({ error: 'User not found' });
      }
      if (currentUser.role !== 'parent' && currentUser.role !== 'admin' && currentUser.role !== 'finance_admin') {
        return res.status(403).json({ error: `Role '${currentUser.role}' not authorized to record payments` });
      }
      const validatedData = insertPaymentSchema.parse(req.body);

      // Get invoice and verify authorization
      const invoice = await storage.getInvoice(validatedData.invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Ensure parent can only create payments for their own invoices
      if (currentUser.role === 'parent' && invoice.parentId !== currentUser.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Overpayment protection: Calculate outstanding balance
      const existingPayments = await storage.getPaymentsByInvoice(validatedData.invoiceId);
      const totalPaid = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
      const invoiceTotal = parseFloat(invoice.total);
      const outstandingBalance = invoiceTotal - totalPaid;
      const requestedAmount = parseFloat(validatedData.amount);

      // Reject overpayment attempts
      if (requestedAmount > outstandingBalance) {
        return res.status(400).json({
          error: 'Payment amount exceeds outstanding balance',
          details: {
            invoiceTotal: invoiceTotal.toFixed(2),
            totalPaid: totalPaid.toFixed(2),
            outstandingBalance: outstandingBalance.toFixed(2),
            requestedAmount: requestedAmount.toFixed(2)
          }
        });
      }

      // Determine payment status based on who is recording it
      // Admin/finance_admin-recorded payments are immediately "completed"
      // Parent-recorded payments are "pending" until admin verifies
      const isAdminRecording = currentUser.role === 'admin' || currentUser.role === 'finance_admin';
      const paymentStatus = isAdminRecording ? 'completed' : 'pending';

      // Create payment with provenance tracking
      const payment = await storage.createPayment({
        ...validatedData,
        parentId: invoice.parentId,
        status: paymentStatus,
        recordedByUserId: currentUser.id,
        // If admin is recording, mark as self-verified
        verifiedByUserId: isAdminRecording ? currentUser.id : undefined,
        verifiedAt: isAdminRecording ? new Date() : undefined,
        paidAt: isAdminRecording ? new Date() : undefined,
      });

      // Only update invoice status if admin is recording (verified payment)
      // Parent-recorded payments need admin verification first
      if (isAdminRecording) {
        const newTotalPaid = totalPaid + requestedAmount;
        if (newTotalPaid >= invoiceTotal - 0.01) {
          await storage.updateInvoice(validatedData.invoiceId, { status: 'paid' });

          // Send payment received notification
          await storage.createNotification({
            userId: invoice.parentId,
            type: 'invoice_generated',
            title: 'Payment Received - Invoice Paid in Full',
            message: `Payment of $${validatedData.amount} has been received for invoice #${invoice.invoiceNumber}. Thank you!`,
            relatedId: invoice.id,
            relatedType: 'invoice',
          });
        } else {
          // Send partial payment notification
          await storage.createNotification({
            userId: invoice.parentId,
            type: 'invoice_generated',
            title: 'Partial Payment Received',
            message: `Partial payment of $${validatedData.amount} received for invoice #${invoice.invoiceNumber}. Remaining balance: $${(invoiceTotal - newTotalPaid).toFixed(2)}`,
            relatedId: invoice.id,
            relatedType: 'invoice',
          });
        }
      } else {
        // Notify admins about pending payment that needs verification
        const admins = await storage.getUsersByRole('admin');
        await Promise.all(admins.map(admin =>
          storage.createNotification({
            userId: admin.id,
            type: 'invoice_generated',
            title: 'Payment Pending Verification',
            message: `Parent has recorded a payment of $${validatedData.amount} for invoice #${invoice.invoiceNumber}. Please verify.`,
            relatedId: payment.id,
            relatedType: 'payment',
          })
        ));
      }

      res.status(201).json(payment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Validation failed", details: error.errors });
      }
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Payment verification endpoint (Admin only)
  app.patch("/api/payments/:id/verify", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized - Admin access required' });
      }

      const paymentId = req.params.id;
      const payment = await storage.getPayment(paymentId);

      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      if (payment.status === 'completed') {
        return res.status(400).json({ error: 'Payment is already verified' });
      }

      // Get associated invoice for notifications and balance calculation
      const invoice = await storage.getInvoice(payment.invoiceId);
      if (!invoice) {
        return res.status(404).json({ error: 'Associated invoice not found' });
      }

      // Verify the payment
      const updatedPayment = await storage.updatePayment(paymentId, {
        status: 'completed',
        verifiedByUserId: currentUser.id,
        verifiedAt: new Date(),
        paidAt: new Date(),
      });

      // Check if invoice is now fully paid
      const allPayments = await storage.getPaymentsByInvoice(payment.invoiceId);
      const totalPaid = allPayments.reduce((sum, p) => {
        // Only count completed payments
        if (p.status === 'completed') {
          return sum + parseFloat(p.amount);
        }
        return sum;
      }, 0);
      const invoiceTotal = parseFloat(invoice.total);

      if (totalPaid >= invoiceTotal - 0.01) {
        await storage.updateInvoice(payment.invoiceId, { status: 'paid' });

        // Notify parent about verification and full payment
        await storage.createNotification({
          userId: invoice.parentId,
          type: 'invoice_generated',
          title: 'Payment Verified - Invoice Paid in Full',
          message: `Your payment of $${payment.amount} for invoice #${invoice.invoiceNumber} has been verified. Thank you!`,
          relatedId: invoice.id,
          relatedType: 'invoice',
        });
      } else {
        // Notify parent about verification (partial payment)
        await storage.createNotification({
          userId: invoice.parentId,
          type: 'invoice_generated',
          title: 'Payment Verified',
          message: `Your payment of $${payment.amount} for invoice #${invoice.invoiceNumber} has been verified. Remaining balance: $${(invoiceTotal - totalPaid).toFixed(2)}`,
          relatedId: invoice.id,
          relatedType: 'invoice',
        });
      }

      res.json(updatedPayment);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Manual invoice generation trigger (Admin and Finance Admin)
  app.post("/api/admin/generate-invoices", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const currentUser = await storage.getUser(req.userId);
      if (currentUser?.role !== 'finance_admin') {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Import cron service and trigger invoice generation
      const { cronService } = await import('./cron-service');
      await cronService.triggerInvoiceGeneration();

      res.json({ success: true, message: 'Invoice generation triggered successfully' });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // ========================================
  // Google Calendar Integration Routes (Per-User OAuth)
  // ========================================

  // Get OAuth authorization URL - initiates Google login
  app.get("/api/google-calendar/auth-url", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { getAuthUrl } = await import('./services/google-oauth');
      const authUrl = getAuthUrl(userId);
      res.json({ authUrl });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Google OAuth not configured' });
    }
  });

  // OAuth callback - handles Google's redirect with auth code
  app.get("/api/google-calendar/callback", async (req: any, res) => {
    try {
      const { code, state: userId } = req.query;

      if (!code || !userId) {
        return res.redirect('/profile?calendar_error=missing_params');
      }

      const { getTokensFromCode } = await import('./services/google-oauth');
      const tokens = await getTokensFromCode(code as string);

      const existingSettings = await storage.getGoogleCalendarSettings(userId as string);

      if (existingSettings) {
        await storage.updateGoogleCalendarSettings(userId as string, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
          googleEmail: tokens.email,
          isEnabled: true,
        });
      } else {
        await storage.createGoogleCalendarSettings({
          userId: userId as string,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: tokens.expiresAt,
          googleEmail: tokens.email,
          isEnabled: true,
          calendarId: 'primary',
          syncClasses: true,
          syncReschedules: true,
          syncCancellations: true,
        });
      }

      res.redirect('/profile?calendar_connected=true');
    } catch (error) {
      console.error('Google Calendar OAuth callback error:', error);
      res.redirect('/profile?calendar_error=auth_failed');
    }
  });

  // Disconnect Google Calendar - revokes tokens and removes settings
  app.post("/api/google-calendar/disconnect", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const settings = await storage.getGoogleCalendarSettings(userId);

      if (settings?.accessToken) {
        try {
          const { revokeToken } = await import('./services/google-oauth');
          await revokeToken(settings.accessToken);
        } catch (err) {
          console.error('Failed to revoke token:', err);
        }
      }

      await storage.updateGoogleCalendarSettings(userId, {
        accessToken: null as any,
        refreshToken: null as any,
        tokenExpiresAt: null as any,
        googleEmail: null as any,
        isEnabled: false,
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get current user's Google Calendar status
  app.get("/api/google-calendar/status", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const settings = await storage.getGoogleCalendarSettings(userId);

      const connected = !!(settings?.accessToken);

      res.json({
        connected,
        enabled: settings?.isEnabled ?? false,
        googleEmail: settings?.googleEmail || null,
        settings: settings ? {
          id: settings.id,
          userId: settings.userId,
          calendarId: settings.calendarId,
          syncEnabled: settings.isEnabled,
          syncClasses: settings.syncClasses,
          syncReschedules: settings.syncReschedules,
          syncCancellations: settings.syncCancellations,
        } : null,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Helper to create token refresh callback for persisting refreshed tokens
  const createTokenRefreshCallback = (userId: string) => {
    return async (newTokens: { accessToken: string; refreshToken?: string; tokenExpiresAt: Date }) => {
      const updateData: any = {
        accessToken: newTokens.accessToken,
        tokenExpiresAt: newTokens.tokenExpiresAt,
      };
      if (newTokens.refreshToken) {
        updateData.refreshToken = newTokens.refreshToken;
      }
      await storage.updateGoogleCalendarSettings(userId, updateData);
    };
  };

  // Get available calendars for the connected user
  app.get("/api/google-calendar/calendars", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const settings = await storage.getGoogleCalendarSettings(userId);

      if (!settings?.accessToken) {
        return res.status(400).json({ error: 'Google Calendar not connected' });
      }

      const { GoogleCalendarService } = await import('./services/google-calendar');
      const calendarService = new GoogleCalendarService({
        accessToken: settings.accessToken,
        refreshToken: settings.refreshToken || '',
        tokenExpiresAt: settings.tokenExpiresAt,
      }, createTokenRefreshCallback(userId));

      const calendars = await calendarService.getCalendarList();
      res.json(calendars);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Update Google Calendar sync settings
  app.post("/api/google-calendar/settings", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { calendarId, syncClasses, syncReschedules, syncCancellations, syncEnabled } = req.body;

      const existingSettings = await storage.getGoogleCalendarSettings(userId);

      if (existingSettings) {
        const updated = await storage.updateGoogleCalendarSettings(userId, {
          calendarId: calendarId ?? existingSettings.calendarId,
          syncClasses: syncClasses ?? existingSettings.syncClasses,
          syncReschedules: syncReschedules ?? existingSettings.syncReschedules,
          syncCancellations: syncCancellations ?? existingSettings.syncCancellations,
          isEnabled: syncEnabled ?? existingSettings.isEnabled,
        });
        res.json(updated);
      } else {
        return res.status(400).json({ error: 'Please connect Google Calendar first' });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Sync a specific schedule to Google Calendar
  app.post("/api/google-calendar/sync/schedule/:scheduleId", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { scheduleId } = req.params;

      const schedule = await storage.getSchedule(scheduleId);
      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      const settings = await storage.getGoogleCalendarSettings(userId);
      if (!settings?.isEnabled || !settings?.accessToken) {
        return res.status(400).json({ error: 'Google Calendar sync is not enabled or not connected' });
      }

      const { GoogleCalendarService } = await import('./services/google-calendar');
      const calendarService = new GoogleCalendarService({
        accessToken: settings.accessToken,
        refreshToken: settings.refreshToken || '',
        tokenExpiresAt: settings.tokenExpiresAt,
      }, createTokenRefreshCallback(userId));

      let courseName = '';
      let teacherName = '';
      if (schedule.courseId) {
        const course = await storage.getCourse(schedule.courseId);
        if (course) {
          courseName = course.title;
          if (schedule.teacherId) {
            const teacher = await storage.getUser(schedule.teacherId);
            if (teacher) {
              teacherName = `${teacher.firstName} ${teacher.lastName}`;
            }
          }
        }
      }

      const existingEvent = await storage.getGoogleCalendarEvent(scheduleId, userId);

      if (existingEvent) {
        const result = await calendarService.updateEvent(
          settings.calendarId || 'primary',
          existingEvent.googleEventId,
          {
            scheduleId,
            title: schedule.title,
            description: schedule.description || undefined,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            location: schedule.location || undefined,
            externalLink: schedule.externalLink || undefined,
            courseName,
            teacherName,
          }
        );

        if (result.success) {
          await storage.updateGoogleCalendarEvent(existingEvent.id, {
            syncStatus: 'synced',
          });
        }

        res.json(result);
      } else {
        const result = await calendarService.createEvent(
          settings.calendarId || 'primary',
          {
            scheduleId,
            title: schedule.title,
            description: schedule.description || undefined,
            startTime: schedule.startTime,
            endTime: schedule.endTime,
            location: schedule.location || undefined,
            externalLink: schedule.externalLink || undefined,
            courseName,
            teacherName,
          }
        );

        if (result.success && result.googleEventId) {
          await storage.createGoogleCalendarEvent({
            scheduleId,
            userId,
            googleEventId: result.googleEventId,
            calendarId: settings.calendarId || 'primary',
            syncStatus: 'synced',
          });
        }

        res.json(result);
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Sync all user's schedules to Google Calendar
  app.post("/api/google-calendar/sync/all", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const settings = await storage.getGoogleCalendarSettings(userId);
      if (!settings?.isEnabled || !settings?.accessToken) {
        return res.status(400).json({ error: 'Google Calendar sync is not enabled or not connected' });
      }

      let schedules: any[] = [];

      if (user.role === 'teacher') {
        schedules = await storage.getSchedulesByTeacher(userId);
      } else if (user.role === 'parent') {
        const children = await storage.getChildrenByParent(userId);
        for (const child of children) {
          const enrollments = await storage.getEnrollmentsByStudent(child.id);
          for (const enrollment of enrollments) {
            const courseSchedules = await storage.getSchedulesByCourse(enrollment.courseId);
            schedules.push(...courseSchedules);
          }
        }
      } else if (user.role === 'student') {
        const enrollments = await storage.getEnrollmentsByStudent(userId);
        for (const enrollment of enrollments) {
          const courseSchedules = await storage.getSchedulesByCourse(enrollment.courseId);
          schedules.push(...courseSchedules);
        }
      }

      const uniqueSchedules = schedules.filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);

      const { GoogleCalendarService } = await import('./services/google-calendar');
      const calendarService = new GoogleCalendarService({
        accessToken: settings.accessToken,
        refreshToken: settings.refreshToken || '',
        tokenExpiresAt: settings.tokenExpiresAt,
      }, createTokenRefreshCallback(userId));

      const results: { synced: number; failed: number; errors: string[] } = {
        synced: 0,
        failed: 0,
        errors: [],
      };

      for (const schedule of uniqueSchedules) {
        try {
          let courseName = '';
          let teacherName = '';
          if (schedule.courseId) {
            const course = await storage.getCourse(schedule.courseId);
            if (course) {
              courseName = course.title;
              if (schedule.teacherId) {
                const teacher = await storage.getUser(schedule.teacherId);
                if (teacher) {
                  teacherName = `${teacher.firstName} ${teacher.lastName}`;
                }
              }
            }
          }

          const existingEvent = await storage.getGoogleCalendarEvent(schedule.id, userId);

          if (existingEvent) {
            const result = await calendarService.updateEvent(
              settings.calendarId || 'primary',
              existingEvent.googleEventId,
              {
                scheduleId: schedule.id,
                title: schedule.title,
                description: schedule.description || undefined,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                location: schedule.location || undefined,
                externalLink: schedule.externalLink || undefined,
                courseName,
                teacherName,
              }
            );

            if (result.success) {
              await storage.updateGoogleCalendarEvent(existingEvent.id, {
                syncStatus: 'synced',
              });
              results.synced++;
            } else {
              results.failed++;
              if (result.error) results.errors.push(result.error);
            }
          } else {
            const result = await calendarService.createEvent(
              settings.calendarId || 'primary',
              {
                scheduleId: schedule.id,
                title: schedule.title,
                description: schedule.description || undefined,
                startTime: schedule.startTime,
                endTime: schedule.endTime,
                location: schedule.location || undefined,
                externalLink: schedule.externalLink || undefined,
                courseName,
                teacherName,
              }
            );

            if (result.success && result.googleEventId) {
              await storage.createGoogleCalendarEvent({
                scheduleId: schedule.id,
                userId,
                googleEventId: result.googleEventId,
                calendarId: settings.calendarId || 'primary',
                syncStatus: 'synced',
              });
              results.synced++;
            } else {
              results.failed++;
              if (result.error) results.errors.push(result.error);
            }
          }
        } catch (err) {
          results.failed++;
          results.errors.push(err instanceof Error ? err.message : 'Unknown error');
        }
      }

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Get sync status for user's events
  app.get("/api/google-calendar/events", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const events = await storage.getGoogleCalendarEventsByUser(userId);
      res.json(events);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Delete a synced event from Google Calendar
  app.delete("/api/google-calendar/events/:scheduleId", jwtAuthMiddleware, async (req: any, res) => {
    try {
      const userId = req.userId;
      const { scheduleId } = req.params;

      const event = await storage.getGoogleCalendarEvent(scheduleId, userId);
      if (!event) {
        return res.status(404).json({ error: 'Event not synced' });
      }

      const settings = await storage.getGoogleCalendarSettings(userId);
      if (!settings?.accessToken) {
        return res.status(400).json({ error: 'Google Calendar not connected' });
      }

      const { GoogleCalendarService } = await import('./services/google-calendar');
      const calendarService = new GoogleCalendarService({
        accessToken: settings.accessToken,
        refreshToken: settings.refreshToken || '',
        tokenExpiresAt: settings.tokenExpiresAt,
      }, createTokenRefreshCallback(userId));

      const result = await calendarService.deleteEvent(
        settings.calendarId || 'primary',
        event.googleEventId
      );

      if (result.success) {
        await storage.deleteGoogleCalendarEvent(event.id);
      }

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // =====================================================
  // Partner Management - Admin only (Multi-partner SaaS)
  // =====================================================

  // Get all partners (Admin only)
  app.get('/api/partners', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const partnersList = await storage.getAllPartners();
      res.json(partnersList);
    } catch (error) {
      console.error('Error fetching partners:', error);
      res.status(500).json({ error: 'Failed to fetch partners' });
    }
  });

  // Get a specific partner (Admin only)
  app.get('/api/partners/:id', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const partner = await storage.getPartner(req.params.id);
      if (!partner) {
        return res.status(404).json({ error: 'Partner not found' });
      }
      res.json(partner);
    } catch (error) {
      console.error('Error fetching partner:', error);
      res.status(500).json({ error: 'Failed to fetch partner' });
    }
  });

  // Create a new partner (Admin only)
  app.post('/api/partners', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { name, status, state, contactEmail, contactPhone, address, city, country, description, adminEmail, adminPassword } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Partner name is required' });
      }

      if (!adminEmail || !adminPassword) {
        return res.status(400).json({ error: 'Admin email and password are required' });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(adminEmail)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Validate password minimum length
      if (adminPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      // Check if admin email already exists
      const existingUser = await storage.getUserByEmail(adminEmail);
      if (existingUser) {
        return res.status(400).json({ error: 'A user with this email already exists' });
      }

      // Create the partner first
      const newPartner = await storage.createPartner({
        name,
        status: status || 'active',
        state,
        contactEmail,
        contactPhone,
        address,
        city,
        country,
        description,
      });

      // Create the partner admin user with rollback on failure
      try {
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const partnerAdmin = await storage.createUser({
          email: adminEmail,
          password: hashedPassword,
          role: 'partner_admin',
          partnerId: newPartner.id,
          firstName: name,
          lastName: 'Admin',
          isActive: true,
        });

        console.log(`Partner admin created for partner ${newPartner.name}: ${partnerAdmin.email}`);
      } catch (userError) {
        // Rollback: delete the partner if admin creation fails
        console.error('Failed to create partner admin, rolling back partner:', userError);
        await storage.deletePartner(newPartner.id);
        return res.status(500).json({ error: 'Failed to create partner admin account' });
      }

      res.status(201).json(newPartner);
    } catch (error) {
      console.error('Error creating partner:', error);
      res.status(500).json({ error: 'Failed to create partner' });
    }
  });

  // Update a partner (Admin only)
  app.patch('/api/partners/:id', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const partner = await storage.getPartner(req.params.id);
      if (!partner) {
        return res.status(404).json({ error: 'Partner not found' });
      }

      // Strip admin fields from update payload - admin credentials are only set during creation
      const { adminEmail, adminPassword, ...updateData } = req.body;

      const updatedPartner = await storage.updatePartner(req.params.id, updateData);
      res.json(updatedPartner);
    } catch (error) {
      console.error('Error updating partner:', error);
      res.status(500).json({ error: 'Failed to update partner' });
    }
  });

  // Delete a partner (Admin only)
  app.delete('/api/partners/:id', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const deleted = await storage.deletePartner(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Partner not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting partner:', error);
      res.status(500).json({ error: 'Failed to delete partner' });
    }
  });

  // =====================================================
  // Partner Assignment - Admin only
  // =====================================================

  // Assign a user to a partner (Admin only)
  app.post('/api/users/:userId/assign-partner', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { partnerId } = req.body;
      const targetUser = await storage.getUser(req.params.userId);

      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Validate partner exists if partnerId is provided
      if (partnerId) {
        const partner = await storage.getPartner(partnerId);
        if (!partner) {
          return res.status(404).json({ error: 'Partner not found' });
        }
      }

      // Only allow assigning students, parents, and partner_admins to partners
      const allowedRoles = ['student', 'parent', 'partner_admin'];
      if (!allowedRoles.includes(targetUser.role)) {
        return res.status(400).json({ error: `Cannot assign ${targetUser.role} to a partner. Only students, parents, and partner admins can be assigned.` });
      }

      const updatedUser = await storage.assignUserToPartner(req.params.userId, partnerId || null);
      res.json({ ...updatedUser, password: undefined });
    } catch (error) {
      console.error('Error assigning user to partner:', error);
      res.status(500).json({ error: 'Failed to assign user to partner' });
    }
  });

  // Assign a prospect student to a partner (Admin only)
  app.post('/api/prospect-students/:prospectId/assign-partner', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { partnerId } = req.body;
      const prospect = await storage.getProspectStudent(req.params.prospectId);

      if (!prospect) {
        return res.status(404).json({ error: 'Prospect student not found' });
      }

      // Validate partner exists if partnerId is provided
      if (partnerId) {
        const partner = await storage.getPartner(partnerId);
        if (!partner) {
          return res.status(404).json({ error: 'Partner not found' });
        }
      }

      const updatedProspect = await storage.assignProspectToPartner(req.params.prospectId, partnerId || null);
      res.json(updatedProspect);
    } catch (error) {
      console.error('Error assigning prospect to partner:', error);
      res.status(500).json({ error: 'Failed to assign prospect to partner' });
    }
  });

  // Get users by partner (Admin and Partner Admin)
  app.get('/api/partners/:partnerId/users', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Admin can see any partner's users
      // Partner admin can only see their own partner's users
      if (user.role === 'partner_admin') {
        if (user.partnerId !== req.params.partnerId) {
          return res.status(403).json({ error: 'Access denied to other partner data' });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin or Partner Admin access required' });
      }

      const users = await storage.getUsersByPartner(req.params.partnerId);
      res.json(users.map(u => ({ ...u, password: undefined })));
    } catch (error) {
      console.error('Error fetching partner users:', error);
      res.status(500).json({ error: 'Failed to fetch partner users' });
    }
  });

  // Get prospect students by partner (Admin and Partner Admin)
  app.get('/api/partners/:partnerId/prospects', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Admin can see any partner's prospects
      // Partner admin can only see their own partner's prospects
      if (user.role === 'partner_admin') {
        if (user.partnerId !== req.params.partnerId) {
          return res.status(403).json({ error: 'Access denied to other partner data' });
        }
      } else if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin or Partner Admin access required' });
      }

      const prospects = await storage.getProspectStudentsByPartner(req.params.partnerId);
      res.json(prospects);
    } catch (error) {
      console.error('Error fetching partner prospects:', error);
      res.status(500).json({ error: 'Failed to fetch partner prospects' });
    }
  });

  // =====================================================
  // DMS (Document Management System) Routes
  // =====================================================

  // Get folders (with optional parentId and category filter)
  app.get('/api/dms/folders', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || (user.role !== 'admin' && user.role !== 'finance_admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const rawParentId = req.query.parentId as string | undefined;
      const category = req.query.category as string | undefined;
      const parentId = rawParentId === 'all' ? 'all' : rawParentId === 'root' ? null : rawParentId || null;
      const folders = await storage.getDmsFolders(parentId as any, category);
      res.json(folders);
    } catch (error) {
      console.error('Error fetching DMS folders:', error);
      res.status(500).json({ error: 'Failed to fetch folders' });
    }
  });

  // Create folder
  app.post('/api/dms/folders', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { name, parentId, category, description } = req.body;
      if (!name || !category) {
        return res.status(400).json({ error: 'Name and category are required' });
      }
      const folder = await storage.createDmsFolder({
        name,
        parentId: (!parentId || parentId === 'root') ? null : parentId,
        category,
        description: description || null,
        createdBy: req.userId,
      });
      res.status(201).json(folder);
    } catch (error) {
      console.error('Error creating DMS folder:', error);
      res.status(500).json({ error: 'Failed to create folder' });
    }
  });

  // Update folder
  app.patch('/api/dms/folders/:id', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { name, description, parentId } = req.body;
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (parentId !== undefined) updates.parentId = parentId;
      const folder = await storage.updateDmsFolder(req.params.id, updates);
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      res.json(folder);
    } catch (error) {
      console.error('Error updating DMS folder:', error);
      res.status(500).json({ error: 'Failed to update folder' });
    }
  });

  // Delete folder
  app.delete('/api/dms/folders/:id', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const deleted = await storage.deleteDmsFolder(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Folder not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting DMS folder:', error);
      res.status(500).json({ error: 'Failed to delete folder' });
    }
  });

  // Get documents (with filters)
  app.get('/api/dms/documents', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || (user.role !== 'admin' && user.role !== 'finance_admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const folderId = req.query.folderId === 'root' ? null : req.query.folderId;
      const category = req.query.category as string | undefined;
      const search = req.query.search as string | undefined;
      const documents = await storage.getDmsDocuments({ folderId, category, search });
      res.json(documents);
    } catch (error) {
      console.error('Error fetching DMS documents:', error);
      res.status(500).json({ error: 'Failed to fetch documents' });
    }
  });

  // Upload document (uses multer)
  app.post('/api/dms/documents/upload', jwtAuthMiddleware, upload.single('file'), async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      const { title, description, folderId, category } = req.body;
      if (!title || !category) {
        return res.status(400).json({ error: 'Title and category are required' });
      }
      const fileName = `dms/${uuidv4()}-${file.originalname}`;
      const storagePath = await objectStorageService.uploadToPrivateDir(fileName, file.buffer, file.mimetype);
      const document = await storage.createDmsDocument({
        folderId: (!folderId || folderId === 'root') ? null : folderId,
        category,
        title,
        description: description || null,
        storagePath,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        uploadedBy: req.userId,
      });
      res.status(201).json(document);
    } catch (error) {
      console.error('Error uploading DMS document:', error);
      res.status(500).json({ error: 'Failed to upload document' });
    }
  });

  // Update document (rename, move, change description)
  app.patch('/api/dms/documents/:id', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { title, description, folderId, category } = req.body;
      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (folderId !== undefined) updates.folderId = (!folderId || folderId === 'root') ? null : folderId;
      if (category !== undefined) updates.category = category;
      const document = await storage.updateDmsDocument(req.params.id, updates);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json(document);
    } catch (error) {
      console.error('Error updating DMS document:', error);
      res.status(500).json({ error: 'Failed to update document' });
    }
  });

  // Download document (authenticated)
  app.get('/api/dms/documents/:id/download', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || (user.role !== 'admin' && user.role !== 'finance_admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const document = await storage.getDmsDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      const file = await objectStorageService.getPrivateObject(document.storagePath);
      if (!file) {
        return res.status(404).json({ error: 'File not found in storage' });
      }
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.originalName)}"`);
      await objectStorageService.downloadObject(file, res, 0, true);
    } catch (error) {
      console.error('Error downloading DMS document:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download document' });
      }
    }
  });

  // Delete document
  app.delete('/api/dms/documents/:id', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const document = await storage.getDmsDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      try {
        await objectStorageService.deleteObject(document.storagePath);
      } catch (storageError) {
        console.warn('Failed to delete file from storage:', storageError);
      }
      await storage.deleteDmsDocument(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting DMS document:', error);
      res.status(500).json({ error: 'Failed to delete document' });
    }
  });

  // Create share link
  app.post('/api/dms/documents/:id/share', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const document = await storage.getDmsDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      const { expiresInHours, maxDownloads } = req.body;
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = expiresInHours ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000) : null;
      const shareLink = await storage.createDmsShareLink({
        documentId: req.params.id,
        token,
        expiresAt,
        maxDownloads: maxDownloads || null,
        createdBy: req.userId,
      });
      res.status(201).json({
        ...shareLink,
        shareUrl: `${req.protocol}://${req.get('host')}/api/dms/share/${token}`,
      });
    } catch (error) {
      console.error('Error creating share link:', error);
      res.status(500).json({ error: 'Failed to create share link' });
    }
  });

  // Get share links for a document
  app.get('/api/dms/documents/:id/shares', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const links = await storage.getDmsShareLinksByDocument(req.params.id);
      res.json(links.map(link => ({
        ...link,
        shareUrl: `${req.protocol}://${req.get('host')}/api/dms/share/${link.token}`,
      })));
    } catch (error) {
      console.error('Error fetching share links:', error);
      res.status(500).json({ error: 'Failed to fetch share links' });
    }
  });

  // Delete share link
  app.delete('/api/dms/shares/:id', jwtAuthMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.userId);
      if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const deleted = await storage.deleteDmsShareLink(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Share link not found' });
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting share link:', error);
      res.status(500).json({ error: 'Failed to delete share link' });
    }
  });

  // Download via share link (no auth required)
  app.get('/api/dms/share/:token', async (req, res) => {
    try {
      const shareLink = await storage.getDmsShareLinkByToken(req.params.token);
      if (!shareLink) {
        return res.status(404).json({ error: 'Share link not found or invalid' });
      }
      if (shareLink.expiresAt && new Date() > new Date(shareLink.expiresAt)) {
        return res.status(410).json({ error: 'Share link has expired' });
      }
      if (shareLink.maxDownloads && shareLink.downloadCount >= shareLink.maxDownloads) {
        return res.status(410).json({ error: 'Download limit reached' });
      }
      const document = await storage.getDmsDocument(shareLink.documentId);
      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }
      const file = await objectStorageService.getPrivateObject(document.storagePath);
      if (!file) {
        return res.status(404).json({ error: 'File not found in storage' });
      }
      await storage.incrementDmsShareLinkDownloadCount(shareLink.id);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.originalName)}"`);
      await objectStorageService.downloadObject(file, res, 0, true);
    } catch (error) {
      console.error('Error downloading via share link:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download document' });
      }
    }
  });

  // Serve public files (PDFs, etc.) without authentication
  const publicPath = path.resolve(import.meta.dirname, "..", "public");
  if (fsSync.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  const httpServer = createServer(app);

  return httpServer;
}