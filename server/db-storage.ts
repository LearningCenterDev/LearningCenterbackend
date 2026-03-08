import { eq, and, isNull, gte, lte, desc, count, sql, inArray, ne } from "drizzle-orm";
import { startOfDay } from 'date-fns';
import { db } from "./db";
import {
  users,
  passwordResetRequests,
  courses,
  enrollments,
  enrollmentRequests,
  assignments,
  assignmentAttachments,
  submissions,
  submissionAttachments,
  grades,
  messages,
  messageAttachments,
  attendance,
  parentChildren,
  announcements,
  announcementRecipients,
  pendingParentActivations,
  scheduleRecurrences,
  schedules,
  scheduleRecurrenceExceptions,
  scheduleSubstitutions,
  teacherClassCounts,
  rescheduleProposals,
  courseResources,
  resourceStudentMappings,
  notifications,
  subjects,
  studentTeacherAssignments,
  courseActivationRequests,
  courseActivities,
  feePlans,
  studentFeeAssignments,
  discounts,
  studentDiscounts,
  stateFeeStructures,
  invoiceGenerationLog,
  invoices,
  invoiceItems,
  invoiceSessions,
  payments,
  prospectStudents,
  activityLogs,
  individualAssignmentMappings,
  curriculumUnits,
  curriculumSubsections,
  courseProgress,
  progressMilestones,
  googleCalendarSettings,
  googleCalendarEvents,
  userDocuments,
  partners,
  assignmentDeadlineReminders,
  type User, type InsertUser, type UpsertUser,
  type PasswordResetRequest, type InsertPasswordResetRequest,
  type Course, type InsertCourse,
  type Enrollment, type InsertEnrollment,
  type EnrollmentRequest, type InsertEnrollmentRequest,
  type Assignment, type InsertAssignment,
  type AssignmentAttachment, type InsertAssignmentAttachment,
  type Submission, type InsertSubmission,
  type SubmissionAttachment, type InsertSubmissionAttachment,
  type SubmissionWithRelations,
  type SubmissionForGrading,
  type Grade, type InsertGrade,
  type Message, type InsertMessage,
  type MessageAttachment, type InsertMessageAttachment,
  type Attendance, type InsertAttendance,
  type ParentChild, type InsertParentChild,
  type Announcement, type InsertAnnouncement,
  type AnnouncementRecipient, type InsertAnnouncementRecipient,
  type AnnouncementWithDetails,
  type PendingParentActivation, type InsertPendingParentActivation,
  type ScheduleRecurrence, type InsertScheduleRecurrence,
  type Schedule, type InsertSchedule,
  type ScheduleRecurrenceException, type InsertScheduleRecurrenceException,
  type ScheduleSubstitution, type InsertScheduleSubstitution,
  type TeacherClassCount, type InsertTeacherClassCount,
  type TeacherSessionStats,
  type DetailedClassRecord,
  type CourseResource, type InsertCourseResource,
  type ResourceStudentMapping, type InsertResourceStudentMapping,
  type Notification, type InsertNotification,
  type Subject, type InsertSubject,
  type StudentTeacherAssignment, type InsertStudentTeacherAssignment,
  type CourseActivationRequest, type InsertCourseActivationRequest,
  type CourseActivity, type InsertCourseActivity,
  type ProspectStudent, type InsertProspectStudent,
  type ActivityLog, type InsertActivityLog,
  type IndividualAssignmentMapping, type InsertIndividualAssignmentMapping,
  type CurriculumUnit, type InsertCurriculumUnit,
  type CurriculumSubsection, type InsertCurriculumSubsection,
  type CourseProgress, type InsertCourseProgress,
  type ProgressMilestone, type InsertProgressMilestone,
  type CurriculumUnitWithSubsections,
  type CourseProgressSummary,
  type RescheduleProposal, type InsertRescheduleProposal,
  type RescheduleProposalWithRelations,
  type GoogleCalendarSettings, type InsertGoogleCalendarSettings,
  type GoogleCalendarEvent, type InsertGoogleCalendarEvent,
  type UserDocument, type InsertUserDocument,
  type RefreshToken, type InsertRefreshToken,
  type Partner, type InsertPartner,
  refreshTokens,
  dmsFolders,
  dmsDocuments,
  dmsShareLinks,
  type DmsFolder, type InsertDmsFolder,
  type DmsDocument, type InsertDmsDocument,
  type DmsShareLink, type InsertDmsShareLink,
  type DmsDocumentWithUploader,
  type DmsFolderWithCount,
} from "@shared/schema";
import type { IStorage } from "./storage";

export class DbStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async getUserByResetToken(resetToken: string): Promise<User | undefined> {
    if (!resetToken) return undefined;
    const result = await db.select().from(users).where(eq(users.resetToken, resetToken)).limit(1);
    return result[0];
  }

  async getUsersByRole(role: "student" | "parent" | "teacher" | "admin"): Promise<User[]> {
    return await db.select().from(users).where(eq(users.role, role));
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Validate unique email if provided
    if (insertUser.email) {
      const existingUser = await this.getUserByEmail(insertUser.email);
      if (existingUser) {
        throw new Error(`User with email '${insertUser.email}' already exists`);
      }
    }

    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const result = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    // Validate unique email if changing
    if (updates.email) {
      const existingUser = await this.getUserByEmail(updates.email);
      if (existingUser && existingUser.id !== id) {
        throw new Error(`User with email '${updates.email}' already exists`);
      }
    }

    // Check role-breaking restrictions if changing role
    if (updates.role) {
      const user = await this.getUser(id);
      if (user && updates.role !== user.role) {
        await this.validateRoleChange(id, user.role, updates.role);
      }
    }

    const result = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    // Check restrictions first
    const restrictions = await this.checkUserRestrictions(id);
    if (restrictions.length > 0) {
      throw new Error(`Cannot delete user: ${restrictions.join(', ')}`);
    }

    // Cascade delete messages (sent and received)
    await db.delete(messages).where(eq(messages.senderId, id));
    await db.delete(messages).where(eq(messages.recipientId, id));
    
    // Cascade delete authored announcements
    await db.delete(announcements).where(eq(announcements.authorId, id));

    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Password Reset Request operations
  async getPasswordResetRequest(id: string): Promise<PasswordResetRequest | undefined> {
    const result = await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.id, id)).limit(1);
    return result[0];
  }

  async getPasswordResetRequestsByUser(userId: string): Promise<PasswordResetRequest[]> {
    return await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.userId, userId));
  }

  async getPasswordResetRequestsByStatus(status: "pending" | "approved" | "rejected"): Promise<PasswordResetRequest[]> {
    return await db.select().from(passwordResetRequests).where(eq(passwordResetRequests.status, status));
  }

  async getAllPasswordResetRequests(): Promise<PasswordResetRequest[]> {
    return await db.select().from(passwordResetRequests);
  }

  async createPasswordResetRequest(insertRequest: InsertPasswordResetRequest): Promise<PasswordResetRequest> {
    const result = await db.insert(passwordResetRequests).values(insertRequest).returning();
    return result[0];
  }

  async updatePasswordResetRequest(id: string, updates: Partial<InsertPasswordResetRequest>): Promise<PasswordResetRequest | undefined> {
    const result = await db
      .update(passwordResetRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(passwordResetRequests.id, id))
      .returning();
    return result[0];
  }

  async deletePasswordResetRequest(id: string): Promise<boolean> {
    const result = await db.delete(passwordResetRequests).where(eq(passwordResetRequests.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Course operations
  async getCourse(id: string): Promise<Course | undefined> {
    const result = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
    return result[0];
  }

  async getCoursesByTeacher(teacherId: string): Promise<Course[]> {
    return await db.select().from(courses).where(eq(courses.teacherId, teacherId));
  }

  async getAllCourses(): Promise<Course[]> {
    return await db.select().from(courses);
  }

  async createCourse(insertCourse: InsertCourse): Promise<Course> {
    // Validate teacher exists and has correct role (only if teacherId is provided)
    if (insertCourse.teacherId) {
      const teacher = await this.getUser(insertCourse.teacherId);
      if (!teacher) {
        throw new Error(`User with ID ${insertCourse.teacherId} does not exist`);
      }
      if (teacher.role !== 'teacher') {
        throw new Error(`User must have role 'teacher' but has '${teacher.role}'`);
      }
    }

    const result = await db.insert(courses).values(insertCourse).returning();
    return result[0];
  }

  async updateCourse(id: string, updates: Partial<InsertCourse>): Promise<Course | undefined> {
    // Validate teacher if changing
    if (updates.teacherId) {
      const teacher = await this.getUser(updates.teacherId);
      if (!teacher) {
        throw new Error(`User with ID ${updates.teacherId} does not exist`);
      }
      if (teacher.role !== 'teacher') {
        throw new Error(`User must have role 'teacher' but has '${teacher.role}'`);
      }
    }

    const result = await db
      .update(courses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(courses.id, id))
      .returning();
    return result[0];
  }

  async deleteCourse(id: string): Promise<boolean> {
    const result = await db.delete(courses).where(eq(courses.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Enrollment operations
  async getEnrollment(id: string): Promise<Enrollment | undefined> {
    const result = await db.select().from(enrollments).where(eq(enrollments.id, id)).limit(1);
    return result[0];
  }

  async getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]> {
    return await db.select().from(enrollments).where(eq(enrollments.studentId, studentId));
  }

  async getEnrollmentByStudentAndCourse(studentId: string, courseId: string): Promise<Enrollment | undefined> {
    const result = await db.select().from(enrollments)
      .where(and(
        eq(enrollments.studentId, studentId),
        eq(enrollments.courseId, courseId)
      ))
      .limit(1);
    return result[0];
  }

  async getEnrollmentsByCourse(courseId: string): Promise<Enrollment[]> {
    return await db.select().from(enrollments).where(eq(enrollments.courseId, courseId));
  }

  async getAllEnrollments(): Promise<Enrollment[]> {
    return await db.select().from(enrollments);
  }

  async createEnrollment(insertEnrollment: InsertEnrollment): Promise<Enrollment> {
    // Validate student and course exist
    const student = await this.getUser(insertEnrollment.studentId);
    if (!student) {
      throw new Error(`User with ID ${insertEnrollment.studentId} does not exist`);
    }
    if (student.role !== 'student') {
      throw new Error(`User must have role 'student' but has '${student.role}'`);
    }

    const course = await this.getCourse(insertEnrollment.courseId);
    if (!course) {
      throw new Error(`Course with ID ${insertEnrollment.courseId} does not exist`);
    }

    // Check uniqueness
    const existing = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.studentId, insertEnrollment.studentId),
        eq(enrollments.courseId, insertEnrollment.courseId)
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Student is already enrolled in this course');
    }

    const result = await db.insert(enrollments).values(insertEnrollment).returning();
    return result[0];
  }

  async updateEnrollment(id: string, updates: Partial<InsertEnrollment>): Promise<Enrollment | undefined> {
    const enrollment = await this.getEnrollment(id);
    if (!enrollment) return undefined;

    // Calculate final state
    const finalStudentId = updates.studentId ?? enrollment.studentId;
    const finalCourseId = updates.courseId ?? enrollment.courseId;

    // Validate references if changing
    if (updates.studentId && updates.studentId !== enrollment.studentId) {
      const student = await this.getUser(updates.studentId);
      if (!student) {
        throw new Error(`User with ID ${updates.studentId} does not exist`);
      }
      if (student.role !== 'student') {
        throw new Error(`User must have role 'student' but has '${student.role}'`);
      }
    }
    if (updates.courseId && updates.courseId !== enrollment.courseId) {
      const course = await this.getCourse(updates.courseId);
      if (!course) {
        throw new Error(`Course with ID ${updates.courseId} does not exist`);
      }
    }

    // Check uniqueness of final state (excluding current record)
    if ((updates.studentId && updates.studentId !== enrollment.studentId) ||
        (updates.courseId && updates.courseId !== enrollment.courseId)) {
      const existing = await db
        .select()
        .from(enrollments)
        .where(and(
          eq(enrollments.studentId, finalStudentId),
          eq(enrollments.courseId, finalCourseId)
        ))
        .limit(1);

      if (existing.length > 0 && existing[0].id !== id) {
        throw new Error('Student is already enrolled in this course');
      }
    }

    const result = await db
      .update(enrollments)
      .set(updates)
      .where(eq(enrollments.id, id))
      .returning();
    return result[0];
  }

  async deleteEnrollment(id: string): Promise<boolean> {
    const result = await db.delete(enrollments).where(eq(enrollments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Enrollment Request operations
  async getEnrollmentRequest(id: string): Promise<EnrollmentRequest | undefined> {
    const result = await db.select().from(enrollmentRequests).where(eq(enrollmentRequests.id, id)).limit(1);
    return result[0];
  }

  async getEnrollmentRequestsByStudent(studentId: string): Promise<EnrollmentRequest[]> {
    return await db.select().from(enrollmentRequests).where(eq(enrollmentRequests.studentId, studentId));
  }

  async getEnrollmentRequestsByParent(parentId: string): Promise<EnrollmentRequest[]> {
    return await db.select().from(enrollmentRequests).where(eq(enrollmentRequests.parentId, parentId));
  }

  async getEnrollmentRequestsByStatus(status: "requested" | "parent_approved" | "admin_approved" | "enrolled" | "rejected"): Promise<EnrollmentRequest[]> {
    return await db.select().from(enrollmentRequests).where(eq(enrollmentRequests.status, status));
  }

  async getAllEnrollmentRequests(): Promise<EnrollmentRequest[]> {
    return await db.select().from(enrollmentRequests);
  }

  async createEnrollmentRequest(insertRequest: InsertEnrollmentRequest): Promise<EnrollmentRequest> {
    // Validate student, parent, and course exist
    const student = await this.getUser(insertRequest.studentId);
    if (!student) {
      throw new Error(`User with ID ${insertRequest.studentId} does not exist`);
    }
    if (student.role !== 'student') {
      throw new Error(`User must have role 'student' but has '${student.role}'`);
    }

    const parent = await this.getUser(insertRequest.parentId);
    if (!parent) {
      throw new Error(`User with ID ${insertRequest.parentId} does not exist`);
    }
    if (parent.role !== 'parent') {
      throw new Error(`User must have role 'parent' but has '${parent.role}'`);
    }

    const course = await this.getCourse(insertRequest.courseId);
    if (!course) {
      throw new Error(`Course with ID ${insertRequest.courseId} does not exist`);
    }

    // Check if student already has a request for this course
    const existingRequest = await db
      .select()
      .from(enrollmentRequests)
      .where(and(
        eq(enrollmentRequests.studentId, insertRequest.studentId),
        eq(enrollmentRequests.courseId, insertRequest.courseId)
      ))
      .limit(1);

    if (existingRequest.length > 0) {
      throw new Error('Student already has an enrollment request for this course');
    }

    // Check if student is already enrolled
    const existingEnrollment = await db
      .select()
      .from(enrollments)
      .where(and(
        eq(enrollments.studentId, insertRequest.studentId),
        eq(enrollments.courseId, insertRequest.courseId)
      ))
      .limit(1);

    if (existingEnrollment.length > 0) {
      throw new Error('Student is already enrolled in this course');
    }

    const result = await db.insert(enrollmentRequests).values(insertRequest).returning();
    return result[0];
  }

  async updateEnrollmentRequest(id: string, updates: Partial<InsertEnrollmentRequest>): Promise<EnrollmentRequest | undefined> {
    const request = await this.getEnrollmentRequest(id);
    if (!request) return undefined;

    // Validate references if changing
    if (updates.studentId && updates.studentId !== request.studentId) {
      const student = await this.getUser(updates.studentId);
      if (!student) {
        throw new Error(`User with ID ${updates.studentId} does not exist`);
      }
      if (student.role !== 'student') {
        throw new Error(`User must have role 'student' but has '${student.role}'`);
      }
    }
    if (updates.parentId && updates.parentId !== request.parentId) {
      const parent = await this.getUser(updates.parentId);
      if (!parent) {
        throw new Error(`User with ID ${updates.parentId} does not exist`);
      }
      if (parent.role !== 'parent') {
        throw new Error(`User must have role 'parent' but has '${parent.role}'`);
      }
    }
    if (updates.courseId && updates.courseId !== request.courseId) {
      const course = await this.getCourse(updates.courseId);
      if (!course) {
        throw new Error(`Course with ID ${updates.courseId} does not exist`);
      }
    }

    // Update timestamp fields based on status changes
    const now = new Date();
    const updateData = { 
      ...updates, 
      updatedAt: now 
    };

    if (updates.status === 'parent_approved' && request.status !== 'parent_approved') {
      updateData.parentApprovedAt = now;
    }
    if (updates.status === 'admin_approved' && request.status !== 'admin_approved') {
      updateData.adminApprovedAt = now;
    }
    if (updates.status === 'rejected' && request.status !== 'rejected') {
      updateData.rejectedAt = now;
    }

    const result = await db
      .update(enrollmentRequests)
      .set(updateData)
      .where(eq(enrollmentRequests.id, id))
      .returning();
    return result[0];
  }

  async deleteEnrollmentRequest(id: string): Promise<boolean> {
    const result = await db.delete(enrollmentRequests).where(eq(enrollmentRequests.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Assignment operations
  async getAssignment(id: string): Promise<Assignment | undefined> {
    const result = await db.select().from(assignments).where(eq(assignments.id, id)).limit(1);
    return result[0];
  }

  async getAssignmentsByCourse(courseId: string): Promise<Assignment[]> {
    return await db.select().from(assignments).where(eq(assignments.courseId, courseId));
  }

  async getPublishedAssignmentsByCourse(courseId: string): Promise<Assignment[]> {
    return await db.select().from(assignments).where(
      and(
        eq(assignments.courseId, courseId),
        eq(assignments.isPublished, true)
      )
    );
  }

  async getAllAssignments(): Promise<Assignment[]> {
    return await db.select().from(assignments);
  }

  async getTeacherAssignments(teacherId: string): Promise<Assignment[]> {
    // Get all courses taught by this teacher (default teacher or individual assignments)
    const teacherCourses = await this.getCoursesByTeacher(teacherId);
    const teacherAssignments = await this.getAssignmentsByTeacher(teacherId);
    const courseIds = new Set([
      ...teacherCourses.map(c => c.id),
      ...teacherAssignments.map(a => a.courseId)
    ]);
    
    // If no courses, return empty array
    if (courseIds.size === 0) {
      return [];
    }
    
    // Get all assignments from these courses
    const allAssignments: Assignment[] = [];
    for (const courseId of courseIds) {
      const courseAssignments = await this.getAssignmentsByCourse(courseId);
      allAssignments.push(...courseAssignments);
    }
    
    // Sort by createdAt descending (newest first)
    return allAssignments.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async getPublishedTeacherAssignments(teacherId: string): Promise<Assignment[]> {
    // Get all courses taught by this teacher (default teacher or individual assignments)
    const teacherCourses = await this.getCoursesByTeacher(teacherId);
    const teacherAssignments = await this.getAssignmentsByTeacher(teacherId);
    const courseIds = new Set([
      ...teacherCourses.map(c => c.id),
      ...teacherAssignments.map(a => a.courseId)
    ]);
    
    // If no courses, return empty array
    if (courseIds.size === 0) {
      return [];
    }
    
    // Get all published assignments from these courses
    const allAssignments: Assignment[] = [];
    for (const courseId of courseIds) {
      const courseAssignments = await this.getPublishedAssignmentsByCourse(courseId);
      allAssignments.push(...courseAssignments);
    }
    
    // Sort by createdAt descending (newest first)
    return allAssignments.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async getTeacherAssignmentStats(teacherId: string): Promise<Record<string, { totalSubmissions: number; gradedCount: number; ungradedCount: number }>> {
    // Get all teacher's assignments
    const teacherAssignments = await this.getTeacherAssignments(teacherId);
    const assignmentIds = teacherAssignments.map(a => a.id);
    
    if (assignmentIds.length === 0) {
      return {};
    }
    
    // Get all submissions for these assignments
    const allSubmissions = await this.getAllSubmissions();
    const teacherSubmissions = allSubmissions.filter(s => assignmentIds.includes(s.assignmentId));
    
    // Get all grades
    const allGrades = await this.getAllGrades();
    const gradesBySubmissionId = new Map(allGrades.map(g => [g.submissionId, g]));
    
    // Calculate stats per assignment
    const stats: Record<string, { totalSubmissions: number; gradedCount: number; ungradedCount: number }> = {};
    
    for (const assignmentId of assignmentIds) {
      const assignmentSubs = teacherSubmissions.filter(s => s.assignmentId === assignmentId);
      const gradedCount = assignmentSubs.filter(s => gradesBySubmissionId.has(s.id)).length;
      
      stats[assignmentId] = {
        totalSubmissions: assignmentSubs.length,
        gradedCount,
        ungradedCount: assignmentSubs.length - gradedCount
      };
    }
    
    return stats;
  }

  async getCourseAssignmentStats(courseId: string): Promise<Record<string, { totalSubmissions: number; gradedCount: number; ungradedCount: number }>> {
    // Get all course assignments
    const courseAssignments = await this.getAssignmentsByCourse(courseId);
    const assignmentIds = courseAssignments.map(a => a.id);
    
    if (assignmentIds.length === 0) {
      return {};
    }
    
    // Get all submissions for these assignments
    const allSubmissions = await this.getAllSubmissions();
    const courseSubmissions = allSubmissions.filter(s => assignmentIds.includes(s.assignmentId));
    
    // Get all grades
    const allGrades = await this.getAllGrades();
    const gradesBySubmissionId = new Map(allGrades.map(g => [g.submissionId, g]));
    
    // Calculate stats per assignment
    const stats: Record<string, { totalSubmissions: number; gradedCount: number; ungradedCount: number }> = {};
    
    for (const assignmentId of assignmentIds) {
      const assignmentSubs = courseSubmissions.filter(s => s.assignmentId === assignmentId);
      const gradedCount = assignmentSubs.filter(s => gradesBySubmissionId.has(s.id)).length;
      
      stats[assignmentId] = {
        totalSubmissions: assignmentSubs.length,
        gradedCount,
        ungradedCount: assignmentSubs.length - gradedCount
      };
    }
    
    return stats;
  }

  async createAssignment(insertAssignment: InsertAssignment): Promise<Assignment> {
    // Validate course exists
    const course = await this.getCourse(insertAssignment.courseId);
    if (!course) {
      throw new Error(`Course with ID ${insertAssignment.courseId} does not exist`);
    }

    const result = await db.insert(assignments).values(insertAssignment).returning();
    return result[0];
  }

  async updateAssignment(id: string, updates: Partial<InsertAssignment>): Promise<Assignment | undefined> {
    // Validate course if changing
    if (updates.courseId) {
      const course = await this.getCourse(updates.courseId);
      if (!course) {
        throw new Error(`Course with ID ${updates.courseId} does not exist`);
      }
    }

    const result = await db
      .update(assignments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(assignments.id, id))
      .returning();
    return result[0];
  }

  async deleteAssignment(id: string): Promise<boolean> {
    const result = await db.delete(assignments).where(eq(assignments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Individual Assignment Mapping operations
  async getIndividualAssignmentMapping(id: string): Promise<IndividualAssignmentMapping | undefined> {
    const result = await db.select().from(individualAssignmentMappings).where(eq(individualAssignmentMappings.id, id)).limit(1);
    return result[0];
  }

  async getIndividualAssignmentMappingsByAssignment(assignmentId: string): Promise<IndividualAssignmentMapping[]> {
    return await db.select().from(individualAssignmentMappings).where(eq(individualAssignmentMappings.assignmentId, assignmentId));
  }

  async getIndividualAssignmentMappingsByStudent(studentId: string): Promise<IndividualAssignmentMapping[]> {
    return await db.select().from(individualAssignmentMappings).where(eq(individualAssignmentMappings.studentId, studentId));
  }

  async createIndividualAssignmentMapping(mapping: InsertIndividualAssignmentMapping): Promise<IndividualAssignmentMapping> {
    const result = await db.insert(individualAssignmentMappings).values(mapping).returning();
    return result[0];
  }

  async deleteIndividualAssignmentMapping(id: string): Promise<boolean> {
    const result = await db.delete(individualAssignmentMappings).where(eq(individualAssignmentMappings.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteIndividualAssignmentMappingsByAssignment(assignmentId: string): Promise<boolean> {
    const result = await db.delete(individualAssignmentMappings).where(eq(individualAssignmentMappings.assignmentId, assignmentId));
    return (result.rowCount ?? 0) >= 0;
  }

  async getAssignmentsForStudent(studentId: string, courseId: string): Promise<Assignment[]> {
    // Get all published assignments for the course
    const courseAssignments = await db.select().from(assignments)
      .where(and(
        eq(assignments.courseId, courseId),
        eq(assignments.isPublished, true)
      ));

    // Filter assignments based on isShared flag and individual mappings
    const visibleAssignments: Assignment[] = [];
    
    for (const assignment of courseAssignments) {
      if (assignment.isShared) {
        // Shared assignments are visible to all enrolled students
        visibleAssignments.push(assignment);
      } else {
        // Individual assignments - check if student is assigned
        const mapping = await db.select().from(individualAssignmentMappings)
          .where(and(
            eq(individualAssignmentMappings.assignmentId, assignment.id),
            eq(individualAssignmentMappings.studentId, studentId)
          ))
          .limit(1);
        
        if (mapping.length > 0) {
          visibleAssignments.push(assignment);
        }
      }
    }

    return visibleAssignments;
  }

  // Assignment attachment operations
  async getAssignmentAttachment(id: string): Promise<AssignmentAttachment | undefined> {
    const result = await db.select().from(assignmentAttachments).where(eq(assignmentAttachments.id, id)).limit(1);
    return result[0];
  }

  async getAssignmentAttachmentsByAssignment(assignmentId: string): Promise<AssignmentAttachment[]> {
    return await db.select().from(assignmentAttachments).where(eq(assignmentAttachments.assignmentId, assignmentId));
  }

  async createAssignmentAttachment(attachment: InsertAssignmentAttachment): Promise<AssignmentAttachment> {
    const result = await db.insert(assignmentAttachments).values(attachment).returning();
    return result[0];
  }

  async deleteAssignmentAttachment(id: string): Promise<boolean> {
    const result = await db.delete(assignmentAttachments).where(eq(assignmentAttachments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Submission operations
  async getSubmission(id: string): Promise<Submission | undefined> {
    const result = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    return result[0];
  }

  async getSubmissionsByAssignment(assignmentId: string): Promise<Submission[]> {
    return await db.select().from(submissions).where(eq(submissions.assignmentId, assignmentId));
  }

  async getSubmissionsByStudent(studentId: string): Promise<Submission[]> {
    return await db.select().from(submissions).where(eq(submissions.studentId, studentId));
  }

  async getSubmissionsForGrading(assignmentId: string): Promise<SubmissionForGrading[]> {
    const submissionsList = await db
      .select()
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId));

    // Fetch assignment once for all submissions
    const assignment = await this.getAssignment(assignmentId);
    if (!assignment) {
      return [];
    }

    const results: SubmissionForGrading[] = [];

    // Cache grades and collect unique grader IDs
    const gradesCache = new Map<string, typeof grades.$inferSelect | null>();
    const graderIds = new Set<string>();
    
    for (const submission of submissionsList) {
      const grade = await this.getGradeBySubmission(submission.id);
      gradesCache.set(submission.id, grade || null);
      if (grade?.gradedBy) {
        graderIds.add(grade.gradedBy);
      }
    }

    // Batch fetch graders
    const graders = new Map<string, { firstName: string | null; lastName: string | null; email: string | null }>();
    for (const graderId of Array.from(graderIds)) {
      const grader = await this.getUser(graderId);
      if (grader) {
        graders.set(graderId, {
          firstName: grader.firstName,
          lastName: grader.lastName,
          email: grader.email,
        });
      }
    }

    for (const submission of submissionsList) {
      const student = await this.getUser(submission.studentId);
      const attachments = await this.getSubmissionAttachmentsBySubmission(submission.id);
      const grade = gradesCache.get(submission.id) || null;

      if (student) {
        results.push({
          ...submission,
          student: {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            avatarUrl: student.avatarUrl,
          },
          attachments,
          grade: grade ? {
            ...grade,
            grader: grade.gradedBy ? (graders.get(grade.gradedBy) || null) : null,
          } : null,
          assignment: {
            dueDate: assignment.dueDate,
          },
        });
      }
    }

    return results;
  }

  async getSubmissionWithDetails(assignmentId: string, studentId: string): Promise<SubmissionWithRelations | undefined> {
    // Find submission for this assignment and student
    const submission = await db
      .select()
      .from(submissions)
      .where(and(
        eq(submissions.assignmentId, assignmentId),
        eq(submissions.studentId, studentId)
      ))
      .limit(1);

    if (!submission[0]) {
      return undefined;
    }

    // Fetch attachments
    const attachments = await this.getSubmissionAttachmentsBySubmission(submission[0].id);

    // Fetch grade if exists
    const grade = await this.getGradeBySubmission(submission[0].id);

    return {
      ...submission[0],
      attachments,
      grade: grade || null,
    };
  }

  async getAllSubmissions(): Promise<Submission[]> {
    return await db.select().from(submissions);
  }

  async createSubmission(insertSubmission: InsertSubmission): Promise<Submission> {
    // Validate assignment and student exist
    const assignment = await this.getAssignment(insertSubmission.assignmentId);
    if (!assignment) {
      throw new Error(`Assignment with ID ${insertSubmission.assignmentId} does not exist`);
    }

    const student = await this.getUser(insertSubmission.studentId);
    if (!student) {
      throw new Error(`User with ID ${insertSubmission.studentId} does not exist`);
    }
    if (student.role !== 'student') {
      throw new Error(`User must have role 'student' but has '${student.role}'`);
    }

    // Check uniqueness
    const existing = await db
      .select()
      .from(submissions)
      .where(and(
        eq(submissions.assignmentId, insertSubmission.assignmentId),
        eq(submissions.studentId, insertSubmission.studentId)
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Student has already submitted for this assignment');
    }

    const result = await db.insert(submissions).values(insertSubmission).returning();
    return result[0];
  }

  async updateSubmission(id: string, updates: Partial<InsertSubmission>): Promise<Submission | undefined> {
    const submission = await this.getSubmission(id);
    if (!submission) return undefined;

    // Calculate final state
    const finalAssignmentId = updates.assignmentId ?? submission.assignmentId;
    const finalStudentId = updates.studentId ?? submission.studentId;

    // Validate references if changing
    if (updates.assignmentId && updates.assignmentId !== submission.assignmentId) {
      const assignment = await this.getAssignment(updates.assignmentId);
      if (!assignment) {
        throw new Error(`Assignment with ID ${updates.assignmentId} does not exist`);
      }
    }
    if (updates.studentId && updates.studentId !== submission.studentId) {
      const student = await this.getUser(updates.studentId);
      if (!student) {
        throw new Error(`User with ID ${updates.studentId} does not exist`);
      }
      if (student.role !== 'student') {
        throw new Error(`User must have role 'student' but has '${student.role}'`);
      }
    }

    // Check uniqueness of final state (excluding current record)
    if ((updates.assignmentId && updates.assignmentId !== submission.assignmentId) ||
        (updates.studentId && updates.studentId !== submission.studentId)) {
      const existing = await db
        .select()
        .from(submissions)
        .where(and(
          eq(submissions.assignmentId, finalAssignmentId),
          eq(submissions.studentId, finalStudentId)
        ))
        .limit(1);

      if (existing.length > 0 && existing[0].id !== id) {
        throw new Error('Student has already submitted for this assignment');
      }
    }

    const result = await db
      .update(submissions)
      .set(updates)
      .where(eq(submissions.id, id))
      .returning();
    return result[0];
  }

  async deleteSubmission(id: string): Promise<boolean> {
    const result = await db.delete(submissions).where(eq(submissions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Submission attachment operations
  async getSubmissionAttachment(id: string): Promise<SubmissionAttachment | undefined> {
    const result = await db.select().from(submissionAttachments).where(eq(submissionAttachments.id, id)).limit(1);
    return result[0];
  }

  async getSubmissionAttachmentsBySubmission(submissionId: string): Promise<SubmissionAttachment[]> {
    return await db.select().from(submissionAttachments).where(eq(submissionAttachments.submissionId, submissionId));
  }

  async createSubmissionAttachment(attachment: InsertSubmissionAttachment): Promise<SubmissionAttachment> {
    const result = await db.insert(submissionAttachments).values(attachment).returning();
    return result[0];
  }

  async deleteSubmissionAttachment(id: string): Promise<boolean> {
    const result = await db.delete(submissionAttachments).where(eq(submissionAttachments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Grade operations
  async getGrade(id: string): Promise<Grade | undefined> {
    const result = await db.select().from(grades).where(eq(grades.id, id)).limit(1);
    return result[0];
  }

  async getGradeBySubmission(submissionId: string): Promise<Grade | undefined> {
    const result = await db.select().from(grades).where(eq(grades.submissionId, submissionId)).limit(1);
    return result[0];
  }

  async getGradesByStudent(studentId: string): Promise<Grade[]> {
    const result = await db
      .select({
        id: grades.id,
        submissionId: grades.submissionId,
        score: grades.score,
        feedback: grades.feedback,
        gradedAt: grades.gradedAt,
        gradedBy: grades.gradedBy,
      })
      .from(grades)
      .innerJoin(submissions, eq(grades.submissionId, submissions.id))
      .where(eq(submissions.studentId, studentId));
    return result;
  }

  async getGradesByCourse(courseId: string): Promise<Grade[]> {
    const result = await db
      .select({
        id: grades.id,
        submissionId: grades.submissionId,
        score: grades.score,
        feedback: grades.feedback,
        gradedAt: grades.gradedAt,
        gradedBy: grades.gradedBy,
      })
      .from(grades)
      .innerJoin(submissions, eq(grades.submissionId, submissions.id))
      .innerJoin(assignments, eq(submissions.assignmentId, assignments.id))
      .where(eq(assignments.courseId, courseId));
    return result;
  }

  async getAllGrades(): Promise<Grade[]> {
    return await db.select().from(grades);
  }

  async createGrade(insertGrade: InsertGrade): Promise<Grade> {
    // Validate submission exists
    const submission = await this.getSubmission(insertGrade.submissionId);
    if (!submission) {
      throw new Error(`Submission with ID ${insertGrade.submissionId} does not exist`);
    }

    // Validate grader role
    const grader = await this.getUser(insertGrade.gradedBy);
    if (!grader) {
      throw new Error(`User with ID ${insertGrade.gradedBy} does not exist`);
    }
    if (!['teacher', 'admin'].includes(grader.role)) {
      throw new Error('Only teachers and admins can grade submissions');
    }

    // Check uniqueness - one grade per submission
    const existingGrade = await this.getGradeBySubmission(insertGrade.submissionId);
    if (existingGrade) {
      throw new Error('Grade already exists for this submission');
    }

    const result = await db.insert(grades).values(insertGrade).returning();
    return result[0];
  }

  async updateGrade(id: string, updates: Partial<InsertGrade>): Promise<Grade | undefined> {
    // Validate submission if changing
    if (updates.submissionId) {
      const submission = await this.getSubmission(updates.submissionId);
      if (!submission) {
        throw new Error(`Submission with ID ${updates.submissionId} does not exist`);
      }

      // Check uniqueness for new submission
      const existingGrade = await this.getGradeBySubmission(updates.submissionId);
      if (existingGrade && existingGrade.id !== id) {
        throw new Error('Grade already exists for this submission');
      }
    }

    // Validate grader if changing
    if (updates.gradedBy) {
      const grader = await this.getUser(updates.gradedBy);
      if (!grader) {
        throw new Error(`User with ID ${updates.gradedBy} does not exist`);
      }
      if (!['teacher', 'admin'].includes(grader.role)) {
        throw new Error('Only teachers and admins can grade submissions');
      }
    }

    const result = await db
      .update(grades)
      .set(updates)
      .where(eq(grades.id, id))
      .returning();
    return result[0];
  }

  async deleteGrade(id: string): Promise<boolean> {
    const result = await db.delete(grades).where(eq(grades.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Message operations
  async getMessage(id: string): Promise<Message | undefined> {
    const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
    return result[0];
  }

  async getMessagesByRecipient(recipientId: string): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.recipientId, recipientId));
  }

  async getMessagesBySender(senderId: string): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.senderId, senderId));
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    // Validate sender and recipient exist
    const sender = await this.getUser(insertMessage.senderId);
    if (!sender) {
      throw new Error(`User with ID ${insertMessage.senderId} does not exist`);
    }

    const recipient = await this.getUser(insertMessage.recipientId);
    if (!recipient) {
      throw new Error(`User with ID ${insertMessage.recipientId} does not exist`);
    }

    const result = await db.insert(messages).values(insertMessage).returning();
    return result[0];
  }

  async updateMessage(id: string, updates: Partial<InsertMessage>): Promise<Message | undefined> {
    const result = await db
      .update(messages)
      .set(updates)
      .where(eq(messages.id, id))
      .returning();
    return result[0];
  }

  async markMessageAsRead(id: string): Promise<boolean> {
    const result = await db
      .update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteMessage(id: string): Promise<boolean> {
    const result = await db.delete(messages).where(eq(messages.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Message Attachment operations
  async getMessageAttachments(messageId: string): Promise<MessageAttachment[]> {
    return await db.select().from(messageAttachments).where(eq(messageAttachments.messageId, messageId));
  }

  async createMessageAttachment(insertAttachment: InsertMessageAttachment): Promise<MessageAttachment> {
    const result = await db.insert(messageAttachments).values(insertAttachment).returning();
    return result[0];
  }

  async deleteMessageAttachment(id: string): Promise<boolean> {
    const result = await db.delete(messageAttachments).where(eq(messageAttachments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getMessageAttachment(id: string): Promise<MessageAttachment | undefined> {
    const result = await db.select().from(messageAttachments).where(eq(messageAttachments.id, id)).limit(1);
    return result[0];
  }

  // Attendance operations
  async getAttendance(id: string): Promise<Attendance | undefined> {
    const result = await db.select().from(attendance).where(eq(attendance.id, id)).limit(1);
    return result[0];
  }

  async getAttendanceByStudent(studentId: string, courseId?: string): Promise<Attendance[]> {
    if (courseId) {
      return await db
        .select()
        .from(attendance)
        .where(and(eq(attendance.studentId, studentId), eq(attendance.courseId, courseId)));
    }
    return await db.select().from(attendance).where(eq(attendance.studentId, studentId));
  }

  async getAttendanceByCourse(courseId: string, date?: string): Promise<Attendance[]> {
    if (date) {
      return await db
        .select()
        .from(attendance)
        .where(and(eq(attendance.courseId, courseId), eq(attendance.date, date)));
    }
    return await db.select().from(attendance).where(eq(attendance.courseId, courseId));
  }

  async createAttendance(insertAttendance: InsertAttendance): Promise<Attendance> {
    // Validate student and course exist
    const student = await this.getUser(insertAttendance.studentId);
    if (!student) {
      throw new Error(`User with ID ${insertAttendance.studentId} does not exist`);
    }
    if (student.role !== 'student') {
      throw new Error(`User must have role 'student' but has '${student.role}'`);
    }

    const course = await this.getCourse(insertAttendance.courseId);
    if (!course) {
      throw new Error(`Course with ID ${insertAttendance.courseId} does not exist`);
    }

    // Validate recorder role
    const recorder = await this.getUser(insertAttendance.recordedBy);
    if (!recorder) {
      throw new Error(`User with ID ${insertAttendance.recordedBy} does not exist`);
    }
    if (!['teacher', 'admin'].includes(recorder.role)) {
      throw new Error('Only teachers and admins can record attendance');
    }

    // Check uniqueness
    const existing = await db
      .select()
      .from(attendance)
      .where(and(
        eq(attendance.studentId, insertAttendance.studentId),
        eq(attendance.courseId, insertAttendance.courseId),
        eq(attendance.date, insertAttendance.date)
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Attendance record already exists for this student, course, and date');
    }

    const result = await db.insert(attendance).values(insertAttendance).returning();
    return result[0];
  }

  async updateAttendance(id: string, updates: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    const attendanceRecord = await this.getAttendance(id);
    if (!attendanceRecord) return undefined;

    // Calculate final state
    const finalStudentId = updates.studentId ?? attendanceRecord.studentId;
    const finalCourseId = updates.courseId ?? attendanceRecord.courseId;
    const finalDate = updates.date ?? attendanceRecord.date;

    // Validate references if changing
    if (updates.studentId && updates.studentId !== attendanceRecord.studentId) {
      const student = await this.getUser(updates.studentId);
      if (!student) {
        throw new Error(`User with ID ${updates.studentId} does not exist`);
      }
      if (student.role !== 'student') {
        throw new Error(`User must have role 'student' but has '${student.role}'`);
      }
    }
    if (updates.courseId && updates.courseId !== attendanceRecord.courseId) {
      const course = await this.getCourse(updates.courseId);
      if (!course) {
        throw new Error(`Course with ID ${updates.courseId} does not exist`);
      }
    }
    if (updates.recordedBy && updates.recordedBy !== attendanceRecord.recordedBy) {
      const recorder = await this.getUser(updates.recordedBy);
      if (!recorder) {
        throw new Error(`User with ID ${updates.recordedBy} does not exist`);
      }
      if (!['teacher', 'admin'].includes(recorder.role)) {
        throw new Error('Only teachers and admins can record attendance');
      }
    }

    // Check uniqueness of final state (excluding current record)
    if ((updates.studentId && updates.studentId !== attendanceRecord.studentId) ||
        (updates.courseId && updates.courseId !== attendanceRecord.courseId) ||
        (updates.date && updates.date !== attendanceRecord.date)) {
      const existing = await db
        .select()
        .from(attendance)
        .where(and(
          eq(attendance.studentId, finalStudentId),
          eq(attendance.courseId, finalCourseId),
          eq(attendance.date, finalDate)
        ))
        .limit(1);

      if (existing.length > 0 && existing[0].id !== id) {
        throw new Error('Attendance record already exists for this student, course, and date');
      }
    }

    const result = await db
      .update(attendance)
      .set(updates)
      .where(eq(attendance.id, id))
      .returning();
    return result[0];
  }

  async deleteAttendance(id: string): Promise<boolean> {
    const result = await db.delete(attendance).where(eq(attendance.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Parent-Child relationship operations
  async getParentChild(id: string): Promise<ParentChild | undefined> {
    const result = await db.select().from(parentChildren).where(eq(parentChildren.id, id)).limit(1);
    return result[0];
  }

  async getChildrenByParent(parentId: string): Promise<ParentChild[]> {
    return await db.select().from(parentChildren).where(eq(parentChildren.parentId, parentId));
  }

  async getParentsByChild(childId: string): Promise<ParentChild[]> {
    return await db.select().from(parentChildren).where(eq(parentChildren.childId, childId));
  }

  async getAllParentChildren(): Promise<ParentChild[]> {
    return await db.select().from(parentChildren);
  }

  async isParentOfStudent(parentId: string, studentId: string): Promise<boolean> {
    const result = await db.select().from(parentChildren)
      .where(and(
        eq(parentChildren.parentId, parentId),
        eq(parentChildren.childId, studentId)
      ))
      .limit(1);
    return result.length > 0;
  }

  async getParentsByStudentId(studentId: string): Promise<User[]> {
    const relationships = await db.select().from(parentChildren)
      .where(eq(parentChildren.childId, studentId));
    
    const parents: User[] = [];
    for (const rel of relationships) {
      const parent = await this.getUser(rel.parentId);
      if (parent) {
        parents.push(parent);
      }
    }
    return parents;
  }

  async createParentChild(insertParentChild: InsertParentChild): Promise<ParentChild> {
    // Validate parent and child exist with correct roles
    const parent = await this.getUser(insertParentChild.parentId);
    if (!parent) {
      throw new Error(`User with ID ${insertParentChild.parentId} does not exist`);
    }
    if (parent.role !== 'parent') {
      throw new Error(`User must have role 'parent' but has '${parent.role}'`);
    }

    const child = await this.getUser(insertParentChild.childId);
    if (!child) {
      throw new Error(`User with ID ${insertParentChild.childId} does not exist`);
    }
    if (child.role !== 'student') {
      throw new Error(`User must have role 'student' but has '${child.role}'`);
    }

    // Check uniqueness
    const existing = await db
      .select()
      .from(parentChildren)
      .where(and(
        eq(parentChildren.parentId, insertParentChild.parentId),
        eq(parentChildren.childId, insertParentChild.childId)
      ))
      .limit(1);

    if (existing.length > 0) {
      throw new Error('Parent-child relationship already exists');
    }

    const result = await db.insert(parentChildren).values(insertParentChild).returning();
    return result[0];
  }

  async updateParentChild(id: string, updates: Partial<InsertParentChild>): Promise<ParentChild | undefined> {
    const parentChild = await this.getParentChild(id);
    if (!parentChild) return undefined;

    // Calculate final state
    const finalParentId = updates.parentId ?? parentChild.parentId;
    const finalChildId = updates.childId ?? parentChild.childId;

    // Validate roles if changing
    if (updates.parentId && updates.parentId !== parentChild.parentId) {
      const parent = await this.getUser(updates.parentId);
      if (!parent) {
        throw new Error(`User with ID ${updates.parentId} does not exist`);
      }
      if (parent.role !== 'parent') {
        throw new Error(`User must have role 'parent' but has '${parent.role}'`);
      }
    }
    if (updates.childId && updates.childId !== parentChild.childId) {
      const child = await this.getUser(updates.childId);
      if (!child) {
        throw new Error(`User with ID ${updates.childId} does not exist`);
      }
      if (child.role !== 'student') {
        throw new Error(`User must have role 'student' but has '${child.role}'`);
      }
    }

    // Check uniqueness of final state (excluding current record)
    if ((updates.parentId && updates.parentId !== parentChild.parentId) ||
        (updates.childId && updates.childId !== parentChild.childId)) {
      const existing = await db
        .select()
        .from(parentChildren)
        .where(and(
          eq(parentChildren.parentId, finalParentId),
          eq(parentChildren.childId, finalChildId)
        ))
        .limit(1);

      if (existing.length > 0 && existing[0].id !== id) {
        throw new Error('Parent-child relationship already exists');
      }
    }

    const result = await db
      .update(parentChildren)
      .set(updates)
      .where(eq(parentChildren.id, id))
      .returning();
    return result[0];
  }

  async deleteParentChild(id: string): Promise<boolean> {
    const result = await db.delete(parentChildren).where(eq(parentChildren.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Announcement operations
  async getAnnouncement(id: string): Promise<Announcement | undefined> {
    const result = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    return result[0];
  }

  async getAnnouncementsByCourse(courseId: string): Promise<Announcement[]> {
    return await db.select().from(announcements).where(eq(announcements.courseId, courseId));
  }

  async getGlobalAnnouncements(): Promise<Announcement[]> {
    return await db.select().from(announcements).where(isNull(announcements.courseId));
  }

  async getAllAnnouncements(): Promise<Announcement[]> {
    return await db.select().from(announcements);
  }

  async getAnnouncementsByAuthor(authorId: string): Promise<Announcement[]> {
    return await db.select().from(announcements).where(eq(announcements.authorId, authorId));
  }

  async createAnnouncement(insertAnnouncement: InsertAnnouncement): Promise<Announcement> {
    // Validate author role
    const author = await this.getUser(insertAnnouncement.authorId);
    if (!author) {
      throw new Error(`User with ID ${insertAnnouncement.authorId} does not exist`);
    }
    if (!['teacher', 'admin'].includes(author.role)) {
      throw new Error('Only teachers and admins can create announcements');
    }

    // Validate course if specified
    if (insertAnnouncement.courseId) {
      const course = await this.getCourse(insertAnnouncement.courseId);
      if (!course) {
        throw new Error(`Course with ID ${insertAnnouncement.courseId} does not exist`);
      }
    }

    const result = await db.insert(announcements).values(insertAnnouncement).returning();
    return result[0];
  }

  async updateAnnouncement(id: string, updates: Partial<InsertAnnouncement>): Promise<Announcement | undefined> {
    // Validate author if changing
    if (updates.authorId) {
      const author = await this.getUser(updates.authorId);
      if (!author) {
        throw new Error(`User with ID ${updates.authorId} does not exist`);
      }
      if (!['teacher', 'admin'].includes(author.role)) {
        throw new Error('Only teachers and admins can author announcements');
      }
    }

    // Validate course if changing
    if (updates.courseId !== undefined) {
      if (updates.courseId !== null) {
        const course = await this.getCourse(updates.courseId);
        if (!course) {
          throw new Error(`Course with ID ${updates.courseId} does not exist`);
        }
      }
    }

    const result = await db
      .update(announcements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(announcements.id, id))
      .returning();
    return result[0];
  }

  async deleteAnnouncement(id: string): Promise<boolean> {
    const result = await db.delete(announcements).where(eq(announcements.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAnnouncementWithDetails(id: string): Promise<AnnouncementWithDetails | undefined> {
    const result = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
    if (!result[0]) return undefined;
    
    const announcement = result[0];
    const author = await this.getUser(announcement.authorId);
    const course = announcement.courseId ? await this.getCourse(announcement.courseId) : null;
    const recipients = await this.getAnnouncementRecipientsByAnnouncement(id);
    
    return {
      ...announcement,
      author: {
        id: author?.id || '',
        firstName: author?.firstName || null,
        lastName: author?.lastName || null,
        avatarUrl: author?.avatarUrl || null,
      },
      course: course ? { id: course.id, title: course.title } : null,
      recipients,
    };
  }

  async getResourcesForStudent(studentId: string): Promise<(typeof courseResources.$inferSelect & { courseName: string })[]> {
    const studentEnrollments = await db
      .select({ courseId: enrollments.courseId })
      .from(enrollments)
      .where(and(
        eq(enrollments.studentId, studentId),
        eq(enrollments.approvalStatus, 'approved')
      ));
    
    if (studentEnrollments.length === 0) return [];
    
    const courseIds = studentEnrollments.map(e => e.courseId);
    
    // Get all resources in the student's enrolled courses
    const allResources = await db
      .select()
      .from(courseResources)
      .where(inArray(courseResources.courseId, courseIds))
      .orderBy(desc(courseResources.createdAt));
    
    // Get the student's individual resource assignments
    const studentMappings = await db
      .select({ resourceId: resourceStudentMappings.resourceId })
      .from(resourceStudentMappings)
      .where(eq(resourceStudentMappings.studentId, studentId));
    
    const assignedResourceIds = new Set(studentMappings.map(m => m.resourceId));
    
    // Filter resources: include if shared (isShared=true or null) OR if individually assigned
    const filteredResources = allResources.filter(r => {
      // If isShared is true or null/undefined (for backwards compatibility), include it
      if (r.isShared === true || r.isShared === null) return true;
      // If isShared is false, only include if student has an assignment mapping
      return assignedResourceIds.has(r.id);
    });
    
    const coursesData = await db
      .select({ id: courses.id, title: courses.title })
      .from(courses)
      .where(inArray(courses.id, courseIds));
    
    const courseMap = new Map(coursesData.map(c => [c.id, c.title]));
    
    return filteredResources.map(r => ({
      ...r,
      courseName: courseMap.get(r.courseId) || 'Unknown Course'
    }));
  }

  async getAnnouncementsForStudent(studentId: string): Promise<(AnnouncementWithDetails & { recipient?: typeof announcementRecipients.$inferSelect })[]> {
    const recipientRecords = await db
      .select()
      .from(announcementRecipients)
      .where(eq(announcementRecipients.studentId, studentId));
    
    const results: (AnnouncementWithDetails & { recipient?: typeof announcementRecipients.$inferSelect })[] = [];
    for (const recipient of recipientRecords) {
      const announcement = await this.getAnnouncementWithDetails(recipient.announcementId);
      if (announcement && announcement.isPublished) {
        results.push({ ...announcement, recipient });
      }
    }
    return results.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getAnnouncementsForParent(parentId: string): Promise<(AnnouncementWithDetails & { recipient?: typeof announcementRecipients.$inferSelect })[]> {
    const recipientRecords = await db
      .select()
      .from(announcementRecipients)
      .where(eq(announcementRecipients.parentId, parentId));
    
    const results: (AnnouncementWithDetails & { recipient?: typeof announcementRecipients.$inferSelect })[] = [];
    for (const recipient of recipientRecords) {
      const announcement = await this.getAnnouncementWithDetails(recipient.announcementId);
      if (announcement && announcement.isPublished) {
        results.push({ ...announcement, recipient });
      }
    }
    return results.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getUnreadAnnouncementsForStudent(studentId: string): Promise<AnnouncementWithDetails[]> {
    const recipientRecords = await db
      .select()
      .from(announcementRecipients)
      .where(and(
        eq(announcementRecipients.studentId, studentId),
        isNull(announcementRecipients.studentReadAt)
      ));
    
    const results: AnnouncementWithDetails[] = [];
    for (const recipient of recipientRecords) {
      const announcement = await this.getAnnouncementWithDetails(recipient.announcementId);
      if (announcement && announcement.isPublished) {
        results.push(announcement);
      }
    }
    return results.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  async getUnreadAnnouncementsForParent(parentId: string): Promise<AnnouncementWithDetails[]> {
    const recipientRecords = await db
      .select()
      .from(announcementRecipients)
      .where(and(
        eq(announcementRecipients.parentId, parentId),
        isNull(announcementRecipients.parentReadAt)
      ));
    
    const results: AnnouncementWithDetails[] = [];
    for (const recipient of recipientRecords) {
      const announcement = await this.getAnnouncementWithDetails(recipient.announcementId);
      if (announcement && announcement.isPublished) {
        results.push(announcement);
      }
    }
    return results.sort((a, b) => 
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  // Announcement Recipient operations
  async getAnnouncementRecipient(id: string): Promise<AnnouncementRecipient | undefined> {
    const result = await db.select().from(announcementRecipients).where(eq(announcementRecipients.id, id)).limit(1);
    return result[0];
  }

  async getAnnouncementRecipientsByAnnouncement(announcementId: string): Promise<AnnouncementRecipient[]> {
    return await db.select().from(announcementRecipients).where(eq(announcementRecipients.announcementId, announcementId));
  }

  async getAnnouncementRecipientByAnnouncementAndStudent(announcementId: string, studentId: string): Promise<AnnouncementRecipient | undefined> {
    const result = await db
      .select()
      .from(announcementRecipients)
      .where(and(
        eq(announcementRecipients.announcementId, announcementId),
        eq(announcementRecipients.studentId, studentId)
      ))
      .limit(1);
    return result[0];
  }

  async createAnnouncementRecipient(recipient: InsertAnnouncementRecipient): Promise<AnnouncementRecipient> {
    const result = await db.insert(announcementRecipients).values(recipient).returning();
    return result[0];
  }

  async createAnnouncementRecipients(recipients: InsertAnnouncementRecipient[]): Promise<AnnouncementRecipient[]> {
    if (recipients.length === 0) return [];
    const result = await db.insert(announcementRecipients).values(recipients).returning();
    return result;
  }

  async markAnnouncementReadByStudent(announcementId: string, studentId: string): Promise<boolean> {
    const result = await db
      .update(announcementRecipients)
      .set({ studentReadAt: new Date() })
      .where(and(
        eq(announcementRecipients.announcementId, announcementId),
        eq(announcementRecipients.studentId, studentId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async markAnnouncementReadByParent(announcementId: string, parentId: string): Promise<boolean> {
    const result = await db
      .update(announcementRecipients)
      .set({ parentReadAt: new Date() })
      .where(and(
        eq(announcementRecipients.announcementId, announcementId),
        eq(announcementRecipients.parentId, parentId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async markAnnouncementAcknowledgedByStudent(announcementId: string, studentId: string): Promise<boolean> {
    const result = await db
      .update(announcementRecipients)
      .set({ studentAcknowledgedAt: new Date() })
      .where(and(
        eq(announcementRecipients.announcementId, announcementId),
        eq(announcementRecipients.studentId, studentId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async markAnnouncementAcknowledgedByParent(announcementId: string, parentId: string): Promise<boolean> {
    const result = await db
      .update(announcementRecipients)
      .set({ parentAcknowledgedAt: new Date() })
      .where(and(
        eq(announcementRecipients.announcementId, announcementId),
        eq(announcementRecipients.parentId, parentId)
      ));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteAnnouncementRecipient(id: string): Promise<boolean> {
    const result = await db.delete(announcementRecipients).where(eq(announcementRecipients.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Helper methods for validation
  private async checkUserRestrictions(userId: string): Promise<string[]> {
    const restrictions = [];
    
    // Check if user is a teacher for any courses
    const teacherCourses = await this.getCoursesByTeacher(userId);
    if (teacherCourses.length > 0) {
      restrictions.push(`User is a teacher for ${teacherCourses.length} course(s)`);
    }
    
    // Check if user has graded submissions
    const gradedSubmissions = await db.select().from(grades).where(eq(grades.gradedBy, userId));
    if (gradedSubmissions.length > 0) {
      restrictions.push(`User has graded ${gradedSubmissions.length} submission(s)`);
    }
    
    // Note: Messages and announcements are now cascade deleted, so we don't restrict based on them
    
    return restrictions;
  }

  private async validateRoleChange(userId: string, oldRole: string, newRole: string): Promise<void> {
    // Apply same comprehensive restrictions as deleteUser - check ALL role-specific references
    const restrictions = await this.checkUserRestrictions(userId);
    if (restrictions.length > 0) {
      throw new Error(`Cannot change user role: ${restrictions.join(', ')}`);
    }
    
    // Additional checks for changing away from specific roles
    if (oldRole === 'student') {
      const enrollments = await this.getEnrollmentsByStudent(userId);
      if (enrollments.length > 0) {
        throw new Error(`Cannot change role from student: user has ${enrollments.length} enrollment(s)`);
      }
      const submissions = await this.getSubmissionsByStudent(userId);
      if (submissions.length > 0) {
        throw new Error(`Cannot change role from student: user has ${submissions.length} submission(s)`);
      }
      const attendance = await this.getAttendanceByStudent(userId);
      if (attendance.length > 0) {
        throw new Error(`Cannot change role from student: user has ${attendance.length} attendance record(s)`);
      }
      const asChild = await this.getParentsByChild(userId);
      if (asChild.length > 0) {
        throw new Error(`Cannot change role from student: user has ${asChild.length} parent-child relationship(s)`);
      }
    }
    
    if (oldRole === 'parent') {
      const asParent = await this.getChildrenByParent(userId);
      if (asParent.length > 0) {
        throw new Error(`Cannot change role from parent: user has ${asParent.length} child relationship(s)`);
      }
    }
  }

  // Course activation request operations
  async getCourseActivationRequest(id: string): Promise<CourseActivationRequest | undefined> {
    const result = await db.select().from(courseActivationRequests).where(eq(courseActivationRequests.id, id));
    return result[0];
  }

  async getCourseActivationRequestByCourse(courseId: string): Promise<CourseActivationRequest | undefined> {
    const result = await db.select().from(courseActivationRequests).where(eq(courseActivationRequests.courseId, courseId));
    return result[0];
  }

  async getCourseActivationRequestsByTeacher(teacherId: string): Promise<CourseActivationRequest[]> {
    return await db.select().from(courseActivationRequests).where(eq(courseActivationRequests.teacherId, teacherId));
  }

  async getCourseActivationRequestsByParent(parentId: string): Promise<CourseActivationRequest[]> {
    return await db.select().from(courseActivationRequests).where(eq(courseActivationRequests.parentId, parentId));
  }

  async getCourseActivationRequestsByStatus(status: "draft" | "pending_parent" | "parent_authorized" | "pending_admin" | "active" | "rejected"): Promise<CourseActivationRequest[]> {
    return await db.select().from(courseActivationRequests).where(eq(courseActivationRequests.status, status));
  }

  async getAllCourseActivationRequests(): Promise<CourseActivationRequest[]> {
    return await db.select().from(courseActivationRequests);
  }

  async createCourseActivationRequest(request: InsertCourseActivationRequest): Promise<CourseActivationRequest> {
    const result = await db.insert(courseActivationRequests).values(request).returning();
    return result[0];
  }

  async updateCourseActivationRequest(id: string, updates: Partial<InsertCourseActivationRequest>): Promise<CourseActivationRequest | undefined> {
    const result = await db
      .update(courseActivationRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(courseActivationRequests.id, id))
      .returning();
    return result[0];
  }

  async deleteCourseActivationRequest(id: string): Promise<boolean> {
    const result = await db.delete(courseActivationRequests).where(eq(courseActivationRequests.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Course activation workflow methods
  async submitCourseForActivation(courseId: string, childId: string): Promise<CourseActivationRequest> {
    // Validate the course exists
    const course = await this.getCourse(courseId);
    if (!course) {
      throw new Error(`Course with ID ${courseId} does not exist`);
    }

    // Validate the child exists and is a student
    const child = await this.getUser(childId);
    if (!child || child.role !== 'student') {
      throw new Error(`Student with ID ${childId} does not exist`);
    }

    // Find the parent for this child
    const parentRelationships = await this.getParentsByChild(childId);
    if (parentRelationships.length === 0) {
      throw new Error(`No parent found for student ${childId}. A parent must be assigned before submitting for activation.`);
    }
    
    // Use the first parent if multiple exist - get the actual parent user ID, not the relationship ID
    const parentId = parentRelationships[0].parentId;

    // Check if activation request already exists for this course
    const existingRequest = await this.getCourseActivationRequestByCourse(courseId);
    if (existingRequest) {
      throw new Error(`Course activation request already exists for course ${courseId}`);
    }

    const requestData: InsertCourseActivationRequest = {
      courseId,
      teacherId: course.teacherId,
      childId,
      parentId,
      status: 'pending_parent', // Start with pending parent status
    };

    const result = await db.insert(courseActivationRequests).values(requestData).returning();
    return result[0];
  }

  async authorizeCourseActivation(requestId: string, parentId: string, notes?: string): Promise<CourseActivationRequest> {
    const request = await this.getCourseActivationRequest(requestId);
    if (!request) {
      throw new Error(`Course activation request with ID ${requestId} not found`);
    }

    if (request.status !== 'pending_parent') {
      throw new Error(`Cannot authorize request with status: ${request.status}`);
    }

    // Validate parent exists and is a parent
    const parent = await this.getUser(parentId);
    if (!parent || parent.role !== 'parent') {
      throw new Error(`Parent with ID ${parentId} does not exist`);
    }

    // Validate that this parent can authorize this request
    if (request.parentId !== parentId) {
      throw new Error(`Only the assigned parent can authorize this request`);
    }

    const updates = {
      status: 'pending_admin' as const, // Move to next stage
      parentNotes: notes,
      parentAuthorizedAt: new Date(),
    };

    const result = await db
      .update(courseActivationRequests)
      .set(updates)
      .where(eq(courseActivationRequests.id, requestId))
      .returning();

    return result[0];
  }

  async verifyCourseActivation(requestId: string, adminId: string, notes?: string): Promise<CourseActivationRequest> {
    const request = await this.getCourseActivationRequest(requestId);
    if (!request) {
      throw new Error(`Course activation request with ID ${requestId} not found`);
    }

    if (request.status !== 'pending_admin') {
      throw new Error(`Cannot verify request with status: ${request.status}`);
    }

    // Validate admin exists and is an admin
    const admin = await this.getUser(adminId);
    if (!admin || admin.role !== 'admin') {
      throw new Error(`Admin with ID ${adminId} does not exist`);
    }

    // Update the course activation request
    const requestUpdates = {
      status: 'active' as const,
      adminId,
      adminNotes: notes,
      verifiedAt: new Date(),
    };

    // CRITICAL: Also update the actual course to be active
    await db
      .update(courses)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(courses.id, request.courseId));

    // Update the activation request
    const result = await db
      .update(courseActivationRequests)
      .set(requestUpdates)
      .where(eq(courseActivationRequests.id, requestId))
      .returning();

    return result[0];
  }

  async rejectCourseActivation(requestId: string, rejectionReason: string, rejectedBy: string): Promise<CourseActivationRequest> {
    const request = await this.getCourseActivationRequest(requestId);
    if (!request) {
      throw new Error(`Course activation request with ID ${requestId} not found`);
    }

    if (!['pending_parent', 'parent_authorized', 'pending_admin'].includes(request.status)) {
      throw new Error(`Cannot reject request with status: ${request.status}`);
    }

    // Validate user exists
    const user = await this.getUser(rejectedBy);
    if (!user) {
      throw new Error(`User with ID ${rejectedBy} does not exist`);
    }

    const updates = {
      status: 'rejected' as const,
      rejectionReason,
      rejectedBy,
      rejectedAt: new Date(),
    };

    const result = await db
      .update(courseActivationRequests)
      .set(updates)
      .where(eq(courseActivationRequests.id, requestId))
      .returning();

    return result[0];
  }

  // Pending parent activation operations
  async createPendingParentActivation(data: InsertPendingParentActivation): Promise<PendingParentActivation> {
    const result = await db.insert(pendingParentActivations).values(data).returning();
    return result[0];
  }

  async getPendingParentActivationByToken(token: string): Promise<PendingParentActivation | undefined> {
    const result = await db.select().from(pendingParentActivations).where(eq(pendingParentActivations.activationToken, token)).limit(1);
    return result[0];
  }

  async deletePendingParentActivation(id: string): Promise<boolean> {
    const result = await db.delete(pendingParentActivations).where(eq(pendingParentActivations.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Schedule Recurrence operations
  async getScheduleRecurrence(id: string): Promise<ScheduleRecurrence | undefined> {
    const result = await db.select().from(scheduleRecurrences).where(eq(scheduleRecurrences.id, id)).limit(1);
    return result[0];
  }

  async getScheduleRecurrencesByCourse(courseId: string): Promise<ScheduleRecurrence[]> {
    return await db.select().from(scheduleRecurrences).where(eq(scheduleRecurrences.courseId, courseId));
  }

  async getActiveScheduleRecurrences(): Promise<ScheduleRecurrence[]> {
    return await db.select().from(scheduleRecurrences).where(eq(scheduleRecurrences.isActive, true));
  }

  async createScheduleRecurrence(recurrence: InsertScheduleRecurrence): Promise<ScheduleRecurrence> {
    const result = await db.insert(scheduleRecurrences).values(recurrence).returning();
    return result[0];
  }

  async updateScheduleRecurrence(id: string, updates: Partial<InsertScheduleRecurrence>): Promise<ScheduleRecurrence | undefined> {
    const result = await db
      .update(scheduleRecurrences)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(scheduleRecurrences.id, id))
      .returning();
    return result[0];
  }

  async deleteScheduleRecurrence(id: string): Promise<boolean> {
    const result = await db.delete(scheduleRecurrences).where(eq(scheduleRecurrences.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Schedule operations
  async getSchedule(id: string): Promise<Schedule | undefined> {
    const result = await db.select().from(schedules).where(eq(schedules.id, id)).limit(1);
    return result[0];
  }

  async getSchedulesByCourse(courseId: string): Promise<Schedule[]> {
    return await db.select().from(schedules).where(eq(schedules.courseId, courseId));
  }

  async getSchedulesByTeacher(teacherId: string): Promise<Schedule[]> {
    return await db.select().from(schedules).where(eq(schedules.teacherId, teacherId));
  }

  async getSchedulesByDateRange(startDate: Date, endDate: Date): Promise<Schedule[]> {
    return await db.select().from(schedules).where(
      and(
        gte(schedules.startTime, startDate),
        lte(schedules.startTime, endDate)
      )
    );
  }

  async getSchedulesByStudentAndDateRange(studentId: string, startDate: Date, endDate: Date): Promise<Schedule[]> {
    return await db.select().from(schedules).where(
      and(
        eq(schedules.studentId, studentId),
        gte(schedules.startTime, startDate),
        lte(schedules.startTime, endDate),
        ne(schedules.status, 'cancelled')
      )
    );
  }

  async getAllSchedules(): Promise<Schedule[]> {
    return await db.select().from(schedules);
  }

  async createSchedule(schedule: InsertSchedule): Promise<Schedule> {
    const result = await db.insert(schedules).values(schedule).returning();
    return result[0];
  }

  async updateSchedule(id: string, updates: Partial<InsertSchedule>): Promise<Schedule | undefined> {
    const result = await db
      .update(schedules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schedules.id, id))
      .returning();
    return result[0];
  }

  async getSchedulesByRecurrence(recurrenceId: string): Promise<Schedule[]> {
    return await db.select().from(schedules).where(eq(schedules.recurrenceId, recurrenceId));
  }

  async createSchedulesFromRecurrence(recurrenceId: string, occurrences: Array<{startTime: Date; endTime: Date; occurrenceIndex: number}>): Promise<Schedule[]> {
    // Use transaction to ensure all operations are atomic
    const result = await db.transaction(async (tx) => {
      // Fetch recurrence within transaction
      const recurrenceResult = await tx
        .select()
        .from(scheduleRecurrences)
        .where(eq(scheduleRecurrences.id, recurrenceId))
        .limit(1);
      
      const recurrence = recurrenceResult[0];
      if (!recurrence) {
        throw new Error('Recurrence not found');
      }

      // Fetch exceptions within transaction
      const exceptions = await tx
        .select()
        .from(scheduleRecurrenceExceptions)
        .where(eq(scheduleRecurrenceExceptions.recurrenceId, recurrenceId));
      
      const exceptionDates = new Set(
        exceptions.map(ex => startOfDay(new Date(ex.occurrenceDate)).toISOString().split('T')[0])
      );

      // Filter out occurrences that have exceptions (using UTC ISO date strings)
      const validOccurrences = occurrences.filter(occ => {
        const occDateStr = startOfDay(new Date(occ.startTime)).toISOString().split('T')[0];
        return !exceptionDates.has(occDateStr);
      });

      if (validOccurrences.length === 0) {
        return [];
      }

      const scheduleData: InsertSchedule[] = validOccurrences.map(occ => ({
        courseId: recurrence.courseId,
        teacherId: recurrence.teacherId,
        title: recurrence.title,
        description: recurrence.description,
        startTime: occ.startTime,
        endTime: occ.endTime,
        location: recurrence.location,
        externalLink: recurrence.externalLink,
        status: 'scheduled' as const,
        notes: recurrence.notes,
        recurrenceId: recurrenceId,
        occurrenceIndex: occ.occurrenceIndex,
        originalStartTime: occ.startTime,
        isException: false,
        createdBy: recurrence.createdBy,
      }));

      // Insert all schedules atomically within transaction
      return await tx.insert(schedules).values(scheduleData).returning();
    });
    
    return result;
  }

  async deleteSchedule(id: string): Promise<boolean> {
    const result = await db.delete(schedules).where(eq(schedules.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteSchedulesByRecurrence(recurrenceId: string): Promise<number> {
    const result = await db.delete(schedules).where(eq(schedules.recurrenceId, recurrenceId));
    return result.rowCount ?? 0;
  }

  async updateSchedulesByRecurrence(recurrenceId: string, updates: Partial<InsertSchedule>): Promise<number> {
    const result = await db.update(schedules).set(updates).where(eq(schedules.recurrenceId, recurrenceId));
    return result.rowCount ?? 0;
  }

  // Schedule Recurrence Exception operations
  async getScheduleRecurrenceException(id: string): Promise<ScheduleRecurrenceException | undefined> {
    const result = await db.select().from(scheduleRecurrenceExceptions).where(eq(scheduleRecurrenceExceptions.id, id)).limit(1);
    return result[0];
  }

  async getExceptionsByRecurrence(recurrenceId: string): Promise<ScheduleRecurrenceException[]> {
    return await db.select().from(scheduleRecurrenceExceptions).where(eq(scheduleRecurrenceExceptions.recurrenceId, recurrenceId));
  }

  async createScheduleRecurrenceException(exception: InsertScheduleRecurrenceException): Promise<ScheduleRecurrenceException> {
    const result = await db.insert(scheduleRecurrenceExceptions).values(exception).returning();
    return result[0];
  }

  async deleteScheduleRecurrenceException(id: string): Promise<boolean> {
    const result = await db.delete(scheduleRecurrenceExceptions).where(eq(scheduleRecurrenceExceptions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Schedule Substitution operations
  async getScheduleSubstitution(id: string): Promise<ScheduleSubstitution | undefined> {
    const [substitution] = await db.select().from(scheduleSubstitutions).where(eq(scheduleSubstitutions.id, id)).limit(1);
    return substitution;
  }

  async getSubstitutionBySchedule(scheduleId: string): Promise<ScheduleSubstitution | undefined> {
    const [substitution] = await db.select().from(scheduleSubstitutions)
      .where(and(
        eq(scheduleSubstitutions.scheduleId, scheduleId),
        eq(scheduleSubstitutions.isActive, true)
      ))
      .limit(1);
    return substitution;
  }

  async getSubstitutionsByTeacher(teacherId: string): Promise<ScheduleSubstitution[]> {
    return await db.select().from(scheduleSubstitutions)
      .where(eq(scheduleSubstitutions.substituteTeacherId, teacherId))
      .orderBy(desc(scheduleSubstitutions.createdAt));
  }

  async createScheduleSubstitution(substitution: InsertScheduleSubstitution): Promise<ScheduleSubstitution> {
    const [newSubstitution] = await db.insert(scheduleSubstitutions).values(substitution).returning();
    return newSubstitution;
  }

  async updateScheduleSubstitution(id: string, updates: Partial<InsertScheduleSubstitution>): Promise<ScheduleSubstitution | undefined> {
    const [updated] = await db.update(scheduleSubstitutions).set(updates).where(eq(scheduleSubstitutions.id, id)).returning();
    return updated;
  }

  async deleteScheduleSubstitution(id: string): Promise<boolean> {
    const result = await db.delete(scheduleSubstitutions).where(eq(scheduleSubstitutions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Teacher Class Count operations
  async getTeacherClassCount(id: string): Promise<TeacherClassCount | undefined> {
    const [classCount] = await db.select().from(teacherClassCounts).where(eq(teacherClassCounts.id, id)).limit(1);
    return classCount;
  }

  async getClassCountsByTeacher(teacherId: string, startDate?: Date, endDate?: Date): Promise<TeacherClassCount[]> {
    const conditions = [eq(teacherClassCounts.teacherId, teacherId)];
    if (startDate) {
      conditions.push(gte(teacherClassCounts.sessionDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(teacherClassCounts.sessionDate, endDate));
    }
    return await db.select().from(teacherClassCounts)
      .where(and(...conditions))
      .orderBy(desc(teacherClassCounts.sessionDate));
  }

  async getClassCountsBySchedule(scheduleId: string): Promise<TeacherClassCount[]> {
    return await db.select().from(teacherClassCounts).where(eq(teacherClassCounts.scheduleId, scheduleId));
  }

  async createTeacherClassCount(countData: InsertTeacherClassCount): Promise<TeacherClassCount> {
    const [newCount] = await db.insert(teacherClassCounts).values(countData).returning();
    return newCount;
  }

  async getTeacherSessionStats(teacherId: string, startDate: Date, endDate: Date): Promise<TeacherSessionStats> {
    const classCounts = await db.select().from(teacherClassCounts)
      .where(and(
        eq(teacherClassCounts.teacherId, teacherId),
        gte(teacherClassCounts.sessionDate, startDate),
        lte(teacherClassCounts.sessionDate, endDate),
        eq(teacherClassCounts.isCounted, true)
      ));

    // Get schedule IDs and filter for completed schedules only
    const scheduleIds = Array.from(new Set(classCounts.map(c => c.scheduleId)));
    const allSchedules = scheduleIds.length > 0 
      ? await db.select().from(schedules).where(inArray(schedules.id, scheduleIds))
      : [];
    const completedScheduleIds = new Set(
      allSchedules.filter(s => s.status === 'completed').map(s => s.id)
    );
    
    const filteredCounts = classCounts.filter(c => completedScheduleIds.has(c.scheduleId));
    const regularCount = filteredCounts.filter(c => c.roleType === 'regular').length;
    const substituteCount = filteredCounts.filter(c => c.roleType === 'substitute').length;
    
    // Get teacher name
    const teacher = await db.select().from(users).where(eq(users.id, teacherId)).limit(1);
    const teacherName = teacher[0] ? `${teacher[0].firstName || ''} ${teacher[0].lastName || ''}`.trim() || teacher[0].email || 'Unknown Teacher' : 'Unknown Teacher';

    return {
      teacherId,
      teacherName,
      regularCount,
      substituteCount,
      totalCount: regularCount + substituteCount,
      periodStart: startDate,
      periodEnd: endDate
    };
  }

  async getAllTeacherSessionStats(startDate: Date, endDate: Date): Promise<TeacherSessionStats[]> {
    const classCounts = await db.select().from(teacherClassCounts)
      .where(and(
        gte(teacherClassCounts.sessionDate, startDate),
        lte(teacherClassCounts.sessionDate, endDate),
        eq(teacherClassCounts.isCounted, true)
      ));

    // Get schedule IDs and filter for completed schedules only
    const scheduleIds = Array.from(new Set(classCounts.map(c => c.scheduleId)));
    const allSchedules = scheduleIds.length > 0 
      ? await db.select().from(schedules).where(inArray(schedules.id, scheduleIds))
      : [];
    const completedScheduleIds = new Set(
      allSchedules.filter(s => s.status === 'completed').map(s => s.id)
    );
    
    const filteredCounts = classCounts.filter(c => completedScheduleIds.has(c.scheduleId));

    // Group by teacher
    const teacherIds = Array.from(new Set(filteredCounts.map(c => c.teacherId)));
    
    // Get all teachers
    const allTeachers = teacherIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, teacherIds))
      : [];

    return teacherIds.map(teacherId => {
      const teacherClasses = filteredCounts.filter(c => c.teacherId === teacherId);
      const regularCount = teacherClasses.filter(c => c.roleType === 'regular').length;
      const substituteCount = teacherClasses.filter(c => c.roleType === 'substitute').length;
      
      const teacher = allTeachers.find(t => t.id === teacherId);
      const teacherName = teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.email || 'Unknown Teacher' : 'Unknown Teacher';

      return {
        teacherId,
        teacherName,
        regularCount,
        substituteCount,
        totalCount: regularCount + substituteCount,
        periodStart: startDate,
        periodEnd: endDate
      };
    });
  }

  async getDetailedClassRecords(startDate: Date, endDate: Date, teacherId?: string): Promise<DetailedClassRecord[]> {
    const conditions = [
      gte(teacherClassCounts.sessionDate, startDate),
      lte(teacherClassCounts.sessionDate, endDate),
      eq(teacherClassCounts.isCounted, true)
    ];
    
    if (teacherId) {
      conditions.push(eq(teacherClassCounts.teacherId, teacherId));
    }
    
    const classCounts = await db.select().from(teacherClassCounts)
      .where(and(...conditions))
      .orderBy(desc(teacherClassCounts.sessionDate));

    if (classCounts.length === 0) {
      return [];
    }

    // Get unique IDs
    const teacherIds = Array.from(new Set(classCounts.map(c => c.teacherId)));
    const courseIds = Array.from(new Set(classCounts.map(c => c.courseId)));
    const scheduleIds = Array.from(new Set(classCounts.map(c => c.scheduleId)));

    // Fetch related data
    const [allTeachers, allCourses, allSchedules] = await Promise.all([
      db.select().from(users).where(inArray(users.id, teacherIds)),
      db.select().from(courses).where(inArray(courses.id, courseIds)),
      db.select().from(schedules).where(inArray(schedules.id, scheduleIds))
    ]);

    // Only include records where the schedule is completed
    const completedScheduleIds = new Set(
      allSchedules.filter(s => s.status === 'completed').map(s => s.id)
    );

    return classCounts
      .filter(cc => completedScheduleIds.has(cc.scheduleId))
      .map(cc => {
        const teacher = allTeachers.find(t => t.id === cc.teacherId);
        const course = allCourses.find(c => c.id === cc.courseId);
        const schedule = allSchedules.find(s => s.id === cc.scheduleId);
        
        const teacherName = teacher 
          ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.email || 'Unknown Teacher' 
          : 'Unknown Teacher';
        
        const sessionDate = new Date(cc.sessionDate);
        const sessionTime = sessionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        return {
          id: cc.id,
          teacherId: cc.teacherId,
          teacherName,
          courseId: cc.courseId,
          courseName: course?.title || 'Unknown Course',
          scheduleTitle: schedule?.title || 'Unknown Schedule',
          sessionDate: cc.sessionDate,
          sessionTime,
          roleType: cc.roleType as 'regular' | 'substitute'
        };
      });
  }

  async syncTeacherSessionsFromSchedules(startDate?: Date, endDate?: Date): Promise<{ synced: number; scheduleIds: string[] }> {
    const now = new Date();
    const searchStartDate = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const searchEndDate = endDate ? new Date(endDate) : now;
    
    searchEndDate.setHours(23, 59, 59, 999);

    const allSchedules = await db.select().from(schedules)
      .where(and(
        lte(schedules.endTime, searchEndDate),
        gte(schedules.endTime, searchStartDate)
      ));
    
    // Only sync completed schedules - future/scheduled classes could still change teacher assignments
    const completedSchedules = allSchedules.filter(s => s.status === 'completed');

    const allExistingCounts = await db.select({ scheduleId: teacherClassCounts.scheduleId })
      .from(teacherClassCounts);
    const existingScheduleIds = new Set(allExistingCounts.map(c => c.scheduleId));

    const schedulesToSync = completedSchedules.filter(s => !existingScheduleIds.has(s.id) && s.teacherId);
    const syncedIds: string[] = [];

    for (const schedule of schedulesToSync) {
      const substitution = await this.getSubstitutionBySchedule(schedule.id);
      
      if (substitution) {
        await db.insert(teacherClassCounts).values({
          scheduleId: schedule.id,
          teacherId: substitution.substituteTeacherId,
          courseId: schedule.courseId,
          sessionDate: new Date(schedule.startTime),
          roleType: 'substitute',
          isCounted: true,
          notes: `Substitute session (synced): ${schedule.title}`,
        });
      } else if (schedule.teacherId) {
        await db.insert(teacherClassCounts).values({
          scheduleId: schedule.id,
          teacherId: schedule.teacherId,
          courseId: schedule.courseId,
          sessionDate: new Date(schedule.startTime),
          roleType: 'regular',
          isCounted: true,
          notes: `Regular session (synced): ${schedule.title}`,
        });
      }
      syncedIds.push(schedule.id);
    }

    return { synced: syncedIds.length, scheduleIds: syncedIds };
  }

  // Course Resource operations
  async getCourseResource(id: string): Promise<CourseResource | undefined> {
    const [resource] = await db.select().from(courseResources).where(eq(courseResources.id, id)).limit(1);
    return resource;
  }

  async getCourseResourcesByCourse(courseId: string): Promise<CourseResource[]> {
    return await db.select().from(courseResources).where(eq(courseResources.courseId, courseId)).orderBy(courseResources.createdAt);
  }

  async createCourseResource(resource: InsertCourseResource): Promise<CourseResource> {
    const [newResource] = await db.insert(courseResources).values(resource).returning();
    return newResource;
  }

  async updateCourseResource(id: string, updates: Partial<InsertCourseResource>): Promise<CourseResource | undefined> {
    const [updated] = await db.update(courseResources).set(updates).where(eq(courseResources.id, id)).returning();
    return updated;
  }

  async deleteCourseResource(id: string): Promise<boolean> {
    const result = await db.delete(courseResources).where(eq(courseResources.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Resource Student Mapping operations
  async createResourceStudentMapping(mapping: InsertResourceStudentMapping): Promise<ResourceStudentMapping> {
    const [created] = await db.insert(resourceStudentMappings).values(mapping).returning();
    return created;
  }

  async getResourceStudentMappings(resourceId: string): Promise<ResourceStudentMapping[]> {
    return await db.select().from(resourceStudentMappings).where(eq(resourceStudentMappings.resourceId, resourceId));
  }

  async getStudentResourceMappings(studentId: string): Promise<ResourceStudentMapping[]> {
    return await db.select().from(resourceStudentMappings).where(eq(resourceStudentMappings.studentId, studentId));
  }

  // Notification operations
  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(notifications).where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      )
    );
    return result[0]?.count ?? 0;
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id)).returning();
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  // Subject operations
  async getSubject(id: string): Promise<Subject | undefined> {
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, id)).limit(1);
    return subject;
  }

  async getSubjectByName(name: string): Promise<Subject | undefined> {
    const [subject] = await db.select().from(subjects).where(eq(subjects.name, name)).limit(1);
    return subject;
  }

  async getAllSubjects(): Promise<Subject[]> {
    return await db.select().from(subjects).orderBy(subjects.name);
  }

  async createSubject(subject: InsertSubject): Promise<Subject> {
    // Check if subject with same name already exists
    const existingSubject = await this.getSubjectByName(subject.name);
    if (existingSubject) {
      throw new Error(`Subject with name '${subject.name}' already exists`);
    }
    
    const [newSubject] = await db.insert(subjects).values(subject).returning();
    return newSubject;
  }

  async updateSubject(id: string, updates: Partial<InsertSubject>): Promise<Subject | undefined> {
    // If updating name, check for uniqueness
    if (updates.name) {
      const existingSubject = await this.getSubjectByName(updates.name);
      if (existingSubject && existingSubject.id !== id) {
        throw new Error(`Subject with name '${updates.name}' already exists`);
      }
    }
    
    const [updated] = await db.update(subjects).set(updates).where(eq(subjects.id, id)).returning();
    return updated;
  }

  async deleteSubject(id: string): Promise<boolean> {
    const result = await db.delete(subjects).where(eq(subjects.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Student-Teacher Assignment operations
  async getStudentTeacherAssignment(id: string): Promise<StudentTeacherAssignment | undefined> {
    const [assignment] = await db.select().from(studentTeacherAssignments).where(eq(studentTeacherAssignments.id, id)).limit(1);
    return assignment;
  }

  async getAssignmentByStudentAndCourse(studentId: string, courseId: string): Promise<StudentTeacherAssignment | undefined> {
    const [assignment] = await db.select().from(studentTeacherAssignments)
      .where(
        and(
          eq(studentTeacherAssignments.studentId, studentId),
          eq(studentTeacherAssignments.courseId, courseId)
        )
      )
      .limit(1);
    return assignment;
  }

  async getAssignmentsByStudent(studentId: string): Promise<StudentTeacherAssignment[]> {
    return await db.select().from(studentTeacherAssignments).where(eq(studentTeacherAssignments.studentId, studentId));
  }

  async getAssignmentsByTeacher(teacherId: string): Promise<StudentTeacherAssignment[]> {
    return await db.select().from(studentTeacherAssignments).where(eq(studentTeacherAssignments.teacherId, teacherId));
  }

  async getStudentTeacherAssignmentsByCourse(courseId: string): Promise<StudentTeacherAssignment[]> {
    return await db.select().from(studentTeacherAssignments).where(eq(studentTeacherAssignments.courseId, courseId));
  }

  async getAllStudentTeacherAssignments(): Promise<StudentTeacherAssignment[]> {
    return await db.select().from(studentTeacherAssignments);
  }

  async createStudentTeacherAssignment(assignment: InsertStudentTeacherAssignment): Promise<StudentTeacherAssignment> {
    // Validate student, course, and teacher exist
    const student = await this.getUser(assignment.studentId);
    if (!student || student.role !== 'student') {
      throw new Error(`Student with ID ${assignment.studentId} does not exist`);
    }
    
    const course = await this.getCourse(assignment.courseId);
    if (!course) {
      throw new Error(`Course with ID ${assignment.courseId} does not exist`);
    }
    
    const teacher = await this.getUser(assignment.teacherId);
    if (!teacher || teacher.role !== 'teacher') {
      throw new Error(`Teacher with ID ${assignment.teacherId} does not exist`);
    }

    // Check if assignment already exists
    const existing = await this.getAssignmentByStudentAndCourse(assignment.studentId, assignment.courseId);
    if (existing) {
      throw new Error(`Teacher assignment already exists for this student and course`);
    }

    const [created] = await db.insert(studentTeacherAssignments).values(assignment).returning();
    return created;
  }

  async updateStudentTeacherAssignment(id: string, updates: Partial<InsertStudentTeacherAssignment>): Promise<StudentTeacherAssignment | undefined> {
    // Validate teacher if being updated
    if (updates.teacherId) {
      const teacher = await this.getUser(updates.teacherId);
      if (!teacher || teacher.role !== 'teacher') {
        throw new Error(`Teacher with ID ${updates.teacherId} does not exist`);
      }
    }

    const [updated] = await db.update(studentTeacherAssignments)
      .set(updates)
      .where(eq(studentTeacherAssignments.id, id))
      .returning();
    return updated;
  }

  async deleteStudentTeacherAssignment(id: string): Promise<boolean> {
    const result = await db.delete(studentTeacherAssignments).where(eq(studentTeacherAssignments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Teacher authorization helper
  // Check if a teacher has access to a course (either as default teacher or through student-teacher assignments)
  async teacherHasCourseAccess(teacherId: string, courseId: string): Promise<boolean> {
    // Check if teacher is the default teacher for the course
    const course = await this.getCourse(courseId);
    if (course && course.teacherId === teacherId) {
      return true;
    }
    
    // Check if teacher has any student-teacher assignments for this course
    const assignments = await db
      .select()
      .from(studentTeacherAssignments)
      .where(and(
        eq(studentTeacherAssignments.courseId, courseId),
        eq(studentTeacherAssignments.teacherId, teacherId)
      ))
      .limit(1);
    
    return assignments.length > 0;
  }

  // Fee Management operations
  
  // Fee Plan operations
  async getFeePlan(id: string): Promise<import("@shared/schema").FeePlan | undefined> {
    const result = await db.select().from(feePlans).where(eq(feePlans.id, id)).limit(1);
    return result[0];
  }

  async getAllFeePlans(): Promise<import("@shared/schema").FeePlan[]> {
    return await db.select().from(feePlans);
  }

  async getActiveFeePlans(): Promise<import("@shared/schema").FeePlan[]> {
    return await db.select().from(feePlans).where(eq(feePlans.isActive, true));
  }

  async createFeePlan(feePlan: import("@shared/schema").InsertFeePlan): Promise<import("@shared/schema").FeePlan> {
    const [created] = await db.insert(feePlans).values(feePlan).returning();
    return created;
  }

  async updateFeePlan(id: string, updates: Partial<import("@shared/schema").InsertFeePlan>): Promise<import("@shared/schema").FeePlan | undefined> {
    const [updated] = await db.update(feePlans)
      .set(updates)
      .where(eq(feePlans.id, id))
      .returning();
    return updated;
  }

  async deleteFeePlan(id: string): Promise<boolean> {
    // Check if there are any assignments referencing this fee plan
    const assignments = await db.select().from(studentFeeAssignments).where(eq(studentFeeAssignments.feePlanId, id)).limit(1);
    
    if (assignments.length > 0) {
      // Soft delete - set deletedAt timestamp and deactivate
      const result = await db.update(feePlans)
        .set({ deletedAt: new Date(), isActive: false })
        .where(eq(feePlans.id, id));
      return (result.rowCount ?? 0) > 0;
    } else {
      // Hard delete - no assignments, safe to remove completely
      // First delete related state fee structures
      await db.delete(stateFeeStructures).where(eq(stateFeeStructures.feePlanId, id));
      // Then delete the fee plan
      const result = await db.delete(feePlans).where(eq(feePlans.id, id));
      return (result.rowCount ?? 0) > 0;
    }
  }

  // Student Fee Assignment operations
  async getStudentFeeAssignment(id: string): Promise<import("@shared/schema").StudentFeeAssignment | undefined> {
    const result = await db.select().from(studentFeeAssignments).where(eq(studentFeeAssignments.id, id)).limit(1);
    return result[0];
  }

  async getStudentFeeAssignmentByStudent(studentId: string): Promise<import("@shared/schema").StudentFeeAssignment | undefined> {
    const result = await db.select().from(studentFeeAssignments)
      .where(and(
        eq(studentFeeAssignments.studentId, studentId),
        eq(studentFeeAssignments.isActive, true)
      ))
      .limit(1);
    return result[0];
  }

  async getActiveStudentFeeAssignments(): Promise<import("@shared/schema").StudentFeeAssignment[]> {
    return await db.select().from(studentFeeAssignments).where(eq(studentFeeAssignments.isActive, true));
  }

  async getAllStudentFeeAssignments(): Promise<import("@shared/schema").StudentFeeAssignment[]> {
    return await db.select().from(studentFeeAssignments);
  }

  async createStudentFeeAssignment(assignment: import("@shared/schema").InsertStudentFeeAssignment): Promise<import("@shared/schema").StudentFeeAssignment> {
    const [created] = await db.insert(studentFeeAssignments).values(assignment).returning();
    return created;
  }

  async updateStudentFeeAssignment(id: string, updates: Partial<import("@shared/schema").InsertStudentFeeAssignment>): Promise<import("@shared/schema").StudentFeeAssignment | undefined> {
    const [updated] = await db.update(studentFeeAssignments)
      .set(updates)
      .where(eq(studentFeeAssignments.id, id))
      .returning();
    return updated;
  }

  async deleteStudentFeeAssignment(id: string): Promise<boolean> {
    const result = await db.delete(studentFeeAssignments).where(eq(studentFeeAssignments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Discount operations
  async getDiscount(id: string): Promise<import("@shared/schema").Discount | undefined> {
    const result = await db.select().from(discounts).where(eq(discounts.id, id)).limit(1);
    return result[0];
  }

  async getAllDiscounts(): Promise<import("@shared/schema").Discount[]> {
    return await db.select().from(discounts).orderBy(desc(discounts.createdAt));
  }

  async getActiveDiscounts(): Promise<import("@shared/schema").Discount[]> {
    return await db.select().from(discounts).where(eq(discounts.isActive, true)).orderBy(desc(discounts.createdAt));
  }

  async createDiscount(discount: import("@shared/schema").InsertDiscount): Promise<import("@shared/schema").Discount> {
    const [created] = await db.insert(discounts).values(discount).returning();
    return created;
  }

  async updateDiscount(id: string, updates: Partial<import("@shared/schema").InsertDiscount>): Promise<import("@shared/schema").Discount | undefined> {
    const [updated] = await db.update(discounts)
      .set(updates)
      .where(eq(discounts.id, id))
      .returning();
    return updated;
  }

  async deleteDiscount(id: string): Promise<boolean> {
    const result = await db.delete(discounts).where(eq(discounts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Student Discount operations
  async getStudentDiscount(id: string): Promise<import("@shared/schema").StudentDiscount | undefined> {
    const result = await db.select().from(studentDiscounts).where(eq(studentDiscounts.id, id)).limit(1);
    return result[0];
  }

  async getStudentDiscountsByStudent(studentId: string): Promise<import("@shared/schema").StudentDiscount[]> {
    return await db.select().from(studentDiscounts).where(eq(studentDiscounts.studentId, studentId));
  }

  async getActiveStudentDiscountsByStudent(studentId: string): Promise<import("@shared/schema").StudentDiscount[]> {
    return await db.select().from(studentDiscounts)
      .where(and(
        eq(studentDiscounts.studentId, studentId),
        eq(studentDiscounts.isActive, true)
      ));
  }

  async getAllStudentDiscounts(): Promise<import("@shared/schema").StudentDiscount[]> {
    return await db.select().from(studentDiscounts).orderBy(desc(studentDiscounts.createdAt));
  }

  async createStudentDiscount(studentDiscount: import("@shared/schema").InsertStudentDiscount): Promise<import("@shared/schema").StudentDiscount> {
    const [created] = await db.insert(studentDiscounts).values(studentDiscount).returning();
    return created;
  }

  async updateStudentDiscount(id: string, updates: Partial<import("@shared/schema").InsertStudentDiscount>): Promise<import("@shared/schema").StudentDiscount | undefined> {
    const [updated] = await db.update(studentDiscounts)
      .set(updates)
      .where(eq(studentDiscounts.id, id))
      .returning();
    return updated;
  }

  async deleteStudentDiscount(id: string): Promise<boolean> {
    const result = await db.delete(studentDiscounts).where(eq(studentDiscounts.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // State Fee Structure operations
  async getStateFeeStructure(id: string): Promise<import("@shared/schema").StateFeeStructure | undefined> {
    const result = await db.select().from(stateFeeStructures).where(eq(stateFeeStructures.id, id)).limit(1);
    return result[0];
  }

  async getStateFeeStructuresByFeePlan(feePlanId: string): Promise<import("@shared/schema").StateFeeStructure[]> {
    return await db.select().from(stateFeeStructures).where(eq(stateFeeStructures.feePlanId, feePlanId));
  }

  async getStateFeeStructureByStateCode(stateCode: string): Promise<import("@shared/schema").StateFeeStructure | undefined> {
    const result = await db.select().from(stateFeeStructures)
      .where(and(eq(stateFeeStructures.stateCode, stateCode), eq(stateFeeStructures.isActive, true)))
      .limit(1);
    return result[0];
  }

  async getAllStateFeeStructures(): Promise<import("@shared/schema").StateFeeStructure[]> {
    return await db.select().from(stateFeeStructures).orderBy(desc(stateFeeStructures.createdAt));
  }

  async createStateFeeStructure(stateFee: import("@shared/schema").InsertStateFeeStructure): Promise<import("@shared/schema").StateFeeStructure> {
    const [created] = await db.insert(stateFeeStructures).values(stateFee).returning();
    return created;
  }

  async updateStateFeeStructure(id: string, updates: Partial<import("@shared/schema").InsertStateFeeStructure>): Promise<import("@shared/schema").StateFeeStructure | undefined> {
    const [updated] = await db.update(stateFeeStructures)
      .set(updates)
      .where(eq(stateFeeStructures.id, id))
      .returning();
    return updated;
  }

  async deleteStateFeeStructure(id: string): Promise<boolean> {
    const result = await db.delete(stateFeeStructures).where(eq(stateFeeStructures.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Invoice Generation Log operations
  async getInvoiceGenerationLog(id: string): Promise<import("@shared/schema").InvoiceGenerationLog | undefined> {
    const result = await db.select().from(invoiceGenerationLog).where(eq(invoiceGenerationLog.id, id)).limit(1);
    return result[0];
  }

  async getInvoiceGenerationLogByIdempotencyKey(key: string): Promise<import("@shared/schema").InvoiceGenerationLog | undefined> {
    const result = await db.select().from(invoiceGenerationLog)
      .where(eq(invoiceGenerationLog.idempotencyKey, key))
      .limit(1);
    return result[0];
  }

  async getInvoiceGenerationLogsByStatus(status: string): Promise<import("@shared/schema").InvoiceGenerationLog[]> {
    return await db.select().from(invoiceGenerationLog).where(eq(invoiceGenerationLog.status, status));
  }

  async createInvoiceGenerationLog(log: import("@shared/schema").InsertInvoiceGenerationLog): Promise<import("@shared/schema").InvoiceGenerationLog> {
    const [created] = await db.insert(invoiceGenerationLog).values(log).returning();
    return created;
  }

  async updateInvoiceGenerationLog(id: string, updates: Partial<import("@shared/schema").InsertInvoiceGenerationLog>): Promise<import("@shared/schema").InvoiceGenerationLog | undefined> {
    const [updated] = await db.update(invoiceGenerationLog)
      .set(updates)
      .where(eq(invoiceGenerationLog.id, id))
      .returning();
    return updated;
  }

  async deleteInvoiceGenerationLog(id: string): Promise<boolean> {
    const result = await db.delete(invoiceGenerationLog).where(eq(invoiceGenerationLog.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Invoice operations
  async getInvoice(id: string): Promise<import("@shared/schema").Invoice | undefined> {
    const result = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    return result[0];
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<import("@shared/schema").Invoice | undefined> {
    const result = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber)).limit(1);
    return result[0];
  }

  async getInvoicesByStudent(studentId: string): Promise<import("@shared/schema").Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.studentId, studentId));
  }

  async getInvoicesByParent(parentId: string): Promise<import("@shared/schema").Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.parentId, parentId));
  }

  async getInvoicesByStatus(status: "draft" | "pending" | "paid" | "overdue" | "cancelled"): Promise<import("@shared/schema").Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.status, status));
  }

  async getOverdueInvoices(): Promise<import("@shared/schema").Invoice[]> {
    const today = new Date().toISOString().split('T')[0];
    return await db.select().from(invoices)
      .where(and(
        eq(invoices.status, 'pending'),
        sql`${invoices.dueDate} < ${today}`
      ));
  }

  async getAllInvoices(): Promise<import("@shared/schema").Invoice[]> {
    return await db.select().from(invoices).where(eq(invoices.isDeleted, false));
  }

  async getAllInvoicesIncludingDeleted(): Promise<import("@shared/schema").Invoice[]> {
    return await db.select().from(invoices);
  }

  async getExistingInvoiceForBillingPeriod(
    studentId: string, 
    feePlanId: string, 
    billingPeriodStart: string, 
    billingPeriodEnd: string
  ): Promise<import("@shared/schema").Invoice | undefined> {
    const result = await db.select().from(invoices)
      .where(and(
        eq(invoices.studentId, studentId),
        eq(invoices.feePlanId, feePlanId),
        eq(invoices.billingPeriodStart, billingPeriodStart),
        eq(invoices.billingPeriodEnd, billingPeriodEnd),
        eq(invoices.isDeleted, false),
        eq(invoices.isCopy, false)
      ))
      .limit(1);
    return result[0];
  }

  async softDeleteInvoice(id: string, deletedBy: string, reason?: string): Promise<import("@shared/schema").Invoice | undefined> {
    const [updated] = await db.update(invoices)
      .set({
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy,
        deletionReason: reason || null,
      })
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  async createInvoiceCopy(originalInvoiceId: string): Promise<import("@shared/schema").Invoice | undefined> {
    const original = await this.getInvoice(originalInvoiceId);
    if (!original) return undefined;

    const timestamp = Date.now();
    const copyNumber = `${original.invoiceNumber}-COPY-${timestamp}`;

    const [copy] = await db.insert(invoices).values({
      invoiceNumber: copyNumber,
      studentId: original.studentId,
      parentId: original.parentId,
      feePlanId: original.feePlanId,
      billingPeriodStart: original.billingPeriodStart,
      billingPeriodEnd: original.billingPeriodEnd,
      subtotal: original.subtotal,
      tax: original.tax,
      total: original.total,
      status: 'pending',
      dueDate: original.dueDate,
      notes: `Copy of invoice ${original.invoiceNumber}. Original invoice was ${original.isDeleted ? 'deleted' : 'active'}.`,
      isCopy: true,
      originalInvoiceId,
      isDeleted: false,
    }).returning();

    if (copy) {
      const originalItems = await this.getInvoiceItemsByInvoice(originalInvoiceId);
      for (const item of originalItems) {
        await this.createInvoiceItem({
          invoiceId: copy.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
        });
      }

      const originalSessions = await this.getInvoiceSessionsByInvoice(originalInvoiceId);
      for (const session of originalSessions) {
        await db.insert(invoiceSessions).values({
          invoiceId: copy.id,
          scheduleId: null,
          studentId: session.studentId,
          sessionDate: session.sessionDate,
          sessionTitle: session.sessionTitle,
          courseName: session.courseName,
          teacherName: session.teacherName,
          rateApplied: session.rateApplied,
          status: 'copied',
        }).onConflictDoNothing();
      }
    }

    return copy;
  }

  async createInvoice(invoice: import("@shared/schema").InsertInvoice): Promise<import("@shared/schema").Invoice> {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async updateInvoice(id: string, updates: Partial<import("@shared/schema").InsertInvoice>): Promise<import("@shared/schema").Invoice | undefined> {
    const [updated] = await db.update(invoices)
      .set(updates)
      .where(eq(invoices.id, id))
      .returning();
    return updated;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    // Get the invoice to find the student and fee plan
    const invoice = await this.getInvoice(id);
    if (!invoice) return false;
    
    // Delete the invoice
    const result = await db.delete(invoices).where(eq(invoices.id, id));
    
    // Delete associated invoice generation logs to allow regeneration
    if (invoice.studentId && invoice.feePlanId) {
      await db.delete(invoiceGenerationLog).where(
        and(
          eq(invoiceGenerationLog.studentId, invoice.studentId),
          eq(invoiceGenerationLog.feePlanId, invoice.feePlanId)
        )
      );
    }
    
    return (result.rowCount ?? 0) > 0;
  }

  // Invoice Item operations
  async getInvoiceItem(id: string): Promise<import("@shared/schema").InvoiceItem | undefined> {
    const result = await db.select().from(invoiceItems).where(eq(invoiceItems.id, id)).limit(1);
    return result[0];
  }

  async getInvoiceItemsByInvoice(invoiceId: string): Promise<import("@shared/schema").InvoiceItem[]> {
    return await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async createInvoiceItem(item: import("@shared/schema").InsertInvoiceItem): Promise<import("@shared/schema").InvoiceItem> {
    const [created] = await db.insert(invoiceItems).values(item).returning();
    return created;
  }

  async deleteInvoiceItem(id: string): Promise<boolean> {
    const result = await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Invoice Session operations
  async createInvoiceSession(session: import("@shared/schema").InsertInvoiceSession): Promise<import("@shared/schema").InvoiceSession> {
    const [created] = await db.insert(invoiceSessions).values(session).returning();
    return created;
  }

  async createInvoiceSessions(sessions: import("@shared/schema").InsertInvoiceSession[]): Promise<import("@shared/schema").InvoiceSession[]> {
    if (sessions.length === 0) return [];
    return await db.insert(invoiceSessions).values(sessions).returning();
  }

  async getInvoiceSessionsByInvoice(invoiceId: string): Promise<import("@shared/schema").InvoiceSession[]> {
    return await db.select().from(invoiceSessions).where(eq(invoiceSessions.invoiceId, invoiceId));
  }

  async getInvoiceSessionsByStudent(studentId: string): Promise<import("@shared/schema").InvoiceSession[]> {
    return await db.select().from(invoiceSessions).where(eq(invoiceSessions.studentId, studentId));
  }

  async getInvoiceSessionBySchedule(scheduleId: string): Promise<import("@shared/schema").InvoiceSession | undefined> {
    const [session] = await db.select().from(invoiceSessions).where(eq(invoiceSessions.scheduleId, scheduleId));
    return session;
  }

  async deleteInvoiceSessionsByInvoice(invoiceId: string): Promise<boolean> {
    const result = await db.delete(invoiceSessions).where(eq(invoiceSessions.invoiceId, invoiceId));
    return (result.rowCount ?? 0) > 0;
  }

  // Payment operations
  async getPayment(id: string): Promise<import("@shared/schema").Payment | undefined> {
    const result = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return result[0];
  }

  async getPaymentsByInvoice(invoiceId: string): Promise<import("@shared/schema").Payment[]> {
    return await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  }

  async getPaymentsByParent(parentId: string): Promise<import("@shared/schema").Payment[]> {
    return await db.select().from(payments).where(eq(payments.parentId, parentId));
  }

  async getPaymentsByStatus(status: "pending" | "processing" | "completed" | "failed" | "refunded"): Promise<import("@shared/schema").Payment[]> {
    return await db.select().from(payments).where(eq(payments.status, status));
  }

  async getAllPayments(): Promise<import("@shared/schema").Payment[]> {
    return await db.select().from(payments);
  }

  async createPayment(payment: import("@shared/schema").InsertPayment): Promise<import("@shared/schema").Payment> {
    const [created] = await db.insert(payments).values(payment).returning();
    return created;
  }

  async updatePayment(id: string, updates: Partial<import("@shared/schema").InsertPayment>): Promise<import("@shared/schema").Payment | undefined> {
    const [updated] = await db.update(payments)
      .set(updates)
      .where(eq(payments.id, id))
      .returning();
    return updated;
  }

  async deletePayment(id: string): Promise<boolean> {
    const result = await db.delete(payments).where(eq(payments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Financial Analytics
  async getFinancialAnalytics(): Promise<{
    totalRevenue: number;
    pendingRevenue: number;
    overdueRevenue: number;
    monthlyRevenue: number;
    weeklyRevenue: number;
    totalInvoices: number;
    paidInvoices: number;
    pendingInvoices: number;
    overdueInvoices: number;
  }> {
    const allInvoices = await this.getAllInvoices();
    const paidInvoices = allInvoices.filter(inv => inv.status === 'paid');
    const pendingInvoices = allInvoices.filter(inv => inv.status === 'pending');
    const overdueInvoices = await this.getOverdueInvoices();
    
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const firstDayOfWeek = new Date(now);
    firstDayOfWeek.setDate(now.getDate() - now.getDay());
    const weekStart = firstDayOfWeek.toISOString().split('T')[0];
    
    const monthlyInvoices = paidInvoices.filter(inv => 
      inv.paidAt && new Date(inv.paidAt).toISOString().split('T')[0] >= firstDayOfMonth
    );
    
    const weeklyInvoices = paidInvoices.filter(inv => 
      inv.paidAt && new Date(inv.paidAt).toISOString().split('T')[0] >= weekStart
    );
    
    return {
      totalRevenue: paidInvoices.reduce((sum, inv) => sum + parseFloat(inv.total.toString()), 0),
      pendingRevenue: pendingInvoices.reduce((sum, inv) => sum + parseFloat(inv.total.toString()), 0),
      overdueRevenue: overdueInvoices.reduce((sum, inv) => sum + parseFloat(inv.total.toString()), 0),
      monthlyRevenue: monthlyInvoices.reduce((sum, inv) => sum + parseFloat(inv.total.toString()), 0),
      weeklyRevenue: weeklyInvoices.reduce((sum, inv) => sum + parseFloat(inv.total.toString()), 0),
      totalInvoices: allInvoices.length,
      paidInvoices: paidInvoices.length,
      pendingInvoices: pendingInvoices.length,
      overdueInvoices: overdueInvoices.length,
    };
  }

  // Prospect Student operations
  async getProspectStudent(id: string): Promise<ProspectStudent | undefined> {
    const result = await db.select().from(prospectStudents).where(eq(prospectStudents.id, id)).limit(1);
    return result[0];
  }

  async getAllProspectStudents(): Promise<ProspectStudent[]> {
    return await db.select().from(prospectStudents).orderBy(desc(prospectStudents.createdAt));
  }

  async getProspectStudentsByStatus(status: "new" | "contacted" | "scheduled" | "converted" | "closed"): Promise<ProspectStudent[]> {
    return await db.select().from(prospectStudents).where(eq(prospectStudents.status, status)).orderBy(desc(prospectStudents.createdAt));
  }

  async getProspectStudentsByFormType(formType: "academics" | "computer" | "dance" | "arts"): Promise<ProspectStudent[]> {
    return await db.select().from(prospectStudents).where(eq(prospectStudents.formType, formType)).orderBy(desc(prospectStudents.createdAt));
  }

  async createProspectStudent(prospect: InsertProspectStudent): Promise<ProspectStudent> {
    const result = await db.insert(prospectStudents).values(prospect).returning();
    return result[0];
  }

  async updateProspectStudent(id: string, updates: Partial<InsertProspectStudent>): Promise<ProspectStudent | undefined> {
    const result = await db.update(prospectStudents).set(updates).where(eq(prospectStudents.id, id)).returning();
    return result[0];
  }

  async deleteProspectStudent(id: string): Promise<boolean> {
    const result = await db.delete(prospectStudents).where(eq(prospectStudents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Activity Log operations
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [activityLog] = await db.insert(activityLogs).values(log).returning();
    return activityLog;
  }

  async getActivityLogsByUser(userId: string, limit: number = 50): Promise<ActivityLog[]> {
    return db.select().from(activityLogs)
      .where(eq(activityLogs.userId, userId))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  // Course Activity operations
  async getCourseActivity(id: string): Promise<CourseActivity | undefined> {
    const result = await db.select().from(courseActivities).where(eq(courseActivities.id, id)).limit(1);
    return result[0];
  }

  async getCourseActivitiesByStudent(courseId: string, studentId: string): Promise<CourseActivity[]> {
    return await db.select().from(courseActivities)
      .where(and(eq(courseActivities.courseId, courseId), eq(courseActivities.studentId, studentId)))
      .orderBy(desc(courseActivities.createdAt));
  }

  async createCourseActivity(activity: InsertCourseActivity): Promise<CourseActivity> {
    const result = await db.insert(courseActivities).values(activity).returning();
    return result[0];
  }

  async deleteCourseActivity(id: string): Promise<boolean> {
    const result = await db.delete(courseActivities).where(eq(courseActivities.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Get all submissions with their grades
  async getAllSubmissionsWithGrades(): Promise<Array<Submission & { grade: number | null; feedback: string | null; gradedAt: Date | null; gradedBy: string | null }>> {
    const allSubmissions = await db.select().from(submissions);
    const allGrades = await db.select().from(grades);
    
    return allSubmissions.map(submission => {
      const grade = allGrades.find(g => g.submissionId === submission.id);
      return {
        ...submission,
        grade: grade?.score ?? null,
        feedback: grade?.feedback ?? null,
        gradedAt: grade?.gradedAt ?? null,
        gradedBy: grade?.gradedBy ?? null,
      };
    });
  }

  // Get all schedule recurrences
  async getAllScheduleRecurrences(): Promise<ScheduleRecurrence[]> {
    return await db.select().from(scheduleRecurrences);
  }

  // =====================================================
  // Curriculum Unit Operations (Admin-only for creation)
  // =====================================================
  
  async getCurriculumUnit(id: string): Promise<CurriculumUnit | undefined> {
    const result = await db.select().from(curriculumUnits).where(eq(curriculumUnits.id, id)).limit(1);
    return result[0];
  }

  async getCurriculumUnitsByCourse(courseId: string): Promise<CurriculumUnit[]> {
    return await db.select().from(curriculumUnits)
      .where(eq(curriculumUnits.courseId, courseId))
      .orderBy(curriculumUnits.orderIndex);
  }

  async createCurriculumUnit(unit: InsertCurriculumUnit): Promise<CurriculumUnit> {
    const result = await db.insert(curriculumUnits).values(unit).returning();
    return result[0];
  }

  async updateCurriculumUnit(id: string, updates: Partial<InsertCurriculumUnit>): Promise<CurriculumUnit | undefined> {
    const result = await db.update(curriculumUnits).set(updates).where(eq(curriculumUnits.id, id)).returning();
    return result[0];
  }

  async deleteCurriculumUnit(id: string): Promise<boolean> {
    const result = await db.delete(curriculumUnits).where(eq(curriculumUnits.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async reorderCurriculumUnits(courseId: string, unitOrders: { id: string; orderIndex: number }[]): Promise<void> {
    for (const { id, orderIndex } of unitOrders) {
      await db.update(curriculumUnits)
        .set({ orderIndex })
        .where(and(eq(curriculumUnits.id, id), eq(curriculumUnits.courseId, courseId)));
    }
  }

  // =====================================================
  // Curriculum Subsection Operations (Teacher can add)
  // =====================================================
  
  async getCurriculumSubsection(id: string): Promise<CurriculumSubsection | undefined> {
    const result = await db.select().from(curriculumSubsections).where(eq(curriculumSubsections.id, id)).limit(1);
    return result[0];
  }

  async getCurriculumSubsectionsByUnit(unitId: string): Promise<CurriculumSubsection[]> {
    return await db.select().from(curriculumSubsections)
      .where(eq(curriculumSubsections.unitId, unitId))
      .orderBy(curriculumSubsections.orderIndex);
  }

  async createCurriculumSubsection(subsection: InsertCurriculumSubsection): Promise<CurriculumSubsection> {
    const result = await db.insert(curriculumSubsections).values(subsection).returning();
    return result[0];
  }

  async updateCurriculumSubsection(id: string, updates: Partial<InsertCurriculumSubsection>): Promise<CurriculumSubsection | undefined> {
    const result = await db.update(curriculumSubsections).set(updates).where(eq(curriculumSubsections.id, id)).returning();
    return result[0];
  }

  async deleteCurriculumSubsection(id: string): Promise<boolean> {
    const result = await db.delete(curriculumSubsections).where(eq(curriculumSubsections.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // Course Progress Operations
  // =====================================================
  
  async getCourseProgress(courseId: string, studentId: string, unitId: string): Promise<CourseProgress | undefined> {
    const result = await db.select().from(courseProgress)
      .where(and(
        eq(courseProgress.courseId, courseId),
        eq(courseProgress.studentId, studentId),
        eq(courseProgress.unitId, unitId)
      ))
      .limit(1);
    return result[0];
  }

  async getStudentCourseProgress(courseId: string, studentId: string): Promise<CourseProgress[]> {
    return await db.select().from(courseProgress)
      .where(and(
        eq(courseProgress.courseId, courseId),
        eq(courseProgress.studentId, studentId)
      ));
  }

  async markUnitComplete(
    courseId: string,
    studentId: string,
    unitId: string,
    completedBy: string,
    notes?: string
  ): Promise<CourseProgress> {
    // Check if progress record exists
    const existing = await this.getCourseProgress(courseId, studentId, unitId);
    
    if (existing) {
      // Update existing record
      const result = await db.update(courseProgress)
        .set({
          isCompleted: true,
          completedAt: new Date(),
          completedBy,
          notes,
        })
        .where(eq(courseProgress.id, existing.id))
        .returning();
      return result[0];
    } else {
      // Create new progress record
      const result = await db.insert(courseProgress)
        .values({
          courseId,
          studentId,
          unitId,
          isCompleted: true,
          completedAt: new Date(),
          completedBy,
          notes,
        })
        .returning();
      return result[0];
    }
  }

  async markUnitIncomplete(courseId: string, studentId: string, unitId: string): Promise<CourseProgress | undefined> {
    const existing = await this.getCourseProgress(courseId, studentId, unitId);
    if (!existing) return undefined;

    const result = await db.update(courseProgress)
      .set({
        isCompleted: false,
        completedAt: null,
        completedBy: null,
      })
      .where(eq(courseProgress.id, existing.id))
      .returning();
    return result[0];
  }

  async getCourseProgressSummary(courseId: string, studentId: string): Promise<CourseProgressSummary> {
    // Get all curriculum units for the course
    const units = await this.getCurriculumUnitsByCourse(courseId);
    
    // Get progress for this student
    const progress = await this.getStudentCourseProgress(courseId, studentId);
    const progressMap = new Map(progress.map(p => [p.unitId, p]));
    
    // Get all subsections for all units
    const unitIds = units.map(u => u.id);
    const allSubsections = unitIds.length > 0
      ? await db.select().from(curriculumSubsections)
          .where(inArray(curriculumSubsections.unitId, unitIds))
          .orderBy(curriculumSubsections.orderIndex)
      : [];
    
    // Group subsections by unit
    const subsectionsByUnit = new Map<string, CurriculumSubsection[]>();
    for (const sub of allSubsections) {
      if (!subsectionsByUnit.has(sub.unitId)) {
        subsectionsByUnit.set(sub.unitId, []);
      }
      subsectionsByUnit.get(sub.unitId)!.push(sub);
    }
    
    // Build units with progress
    const unitsWithProgress: CurriculumUnitWithSubsections[] = units.map(unit => {
      const prog = progressMap.get(unit.id);
      return {
        ...unit,
        subsections: subsectionsByUnit.get(unit.id) || [],
        isCompleted: prog?.isCompleted ?? false,
        completedAt: prog?.completedAt ?? null,
      };
    });
    
    const totalUnits = units.length;
    const completedUnits = progress.filter(p => p.isCompleted).length;
    const progressPercentage = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 100) : 0;
    
    return {
      courseId,
      studentId,
      totalUnits,
      completedUnits,
      progressPercentage,
      units: unitsWithProgress,
    };
  }

  // =====================================================
  // Progress Milestone Operations
  // =====================================================
  
  async hasReachedMilestone(courseId: string, studentId: string, milestone: number): Promise<boolean> {
    const result = await db.select().from(progressMilestones)
      .where(and(
        eq(progressMilestones.courseId, courseId),
        eq(progressMilestones.studentId, studentId),
        eq(progressMilestones.milestone, milestone)
      ))
      .limit(1);
    return result.length > 0;
  }

  async recordMilestone(courseId: string, studentId: string, milestone: number): Promise<ProgressMilestone> {
    const result = await db.insert(progressMilestones)
      .values({ courseId, studentId, milestone })
      .returning();
    return result[0];
  }

  async getStudentMilestones(courseId: string, studentId: string): Promise<ProgressMilestone[]> {
    return await db.select().from(progressMilestones)
      .where(and(
        eq(progressMilestones.courseId, courseId),
        eq(progressMilestones.studentId, studentId)
      ))
      .orderBy(progressMilestones.milestone);
  }

  async getCourseAggregateProgress(courseId: string): Promise<{
    totalUnits: number;
    averageProgress: number;
    studentsCount: number;
  }> {
    const units = await this.getCurriculumUnitsByCourse(courseId);
    const totalUnits = units.length;
    
    if (totalUnits === 0) {
      return { totalUnits: 0, averageProgress: 0, studentsCount: 0 };
    }
    
    const enrolledStudents = await db.select().from(enrollments)
      .where(eq(enrollments.courseId, courseId));
    
    const studentsCount = enrolledStudents.length;
    if (studentsCount === 0) {
      return { totalUnits, averageProgress: 0, studentsCount: 0 };
    }
    
    let totalProgress = 0;
    for (const enrollment of enrolledStudents) {
      const progress = await this.getStudentCourseProgress(courseId, enrollment.studentId);
      const completedUnits = progress.filter(p => p.isCompleted).length;
      const studentProgress = (completedUnits / totalUnits) * 100;
      totalProgress += studentProgress;
    }
    
    const averageProgress = Math.round(totalProgress / studentsCount);
    
    return { totalUnits, averageProgress, studentsCount };
  }

  // =====================================================
  // Reschedule Proposal Operations
  // =====================================================

  async getRescheduleProposal(id: string): Promise<RescheduleProposal | undefined> {
    const [proposal] = await db.select().from(rescheduleProposals).where(eq(rescheduleProposals.id, id)).limit(1);
    return proposal;
  }

  async getRescheduleProposalsBySchedule(scheduleId: string): Promise<RescheduleProposal[]> {
    return await db.select().from(rescheduleProposals)
      .where(eq(rescheduleProposals.scheduleId, scheduleId))
      .orderBy(desc(rescheduleProposals.createdAt));
  }

  async getRescheduleProposalsByUser(userId: string): Promise<RescheduleProposal[]> {
    return await db.select().from(rescheduleProposals)
      .where(
        sql`${rescheduleProposals.proposedBy} = ${userId} OR ${rescheduleProposals.proposedTo} = ${userId}`
      )
      .orderBy(desc(rescheduleProposals.createdAt));
  }

  async getPendingRescheduleProposalsForUser(userId: string): Promise<RescheduleProposal[]> {
    return await db.select().from(rescheduleProposals)
      .where(
        and(
          eq(rescheduleProposals.proposedTo, userId),
          eq(rescheduleProposals.status, 'pending')
        )
      )
      .orderBy(desc(rescheduleProposals.createdAt));
  }

  async getRescheduleProposalWithRelations(id: string): Promise<RescheduleProposalWithRelations | undefined> {
    const [proposal] = await db.select().from(rescheduleProposals).where(eq(rescheduleProposals.id, id)).limit(1);
    if (!proposal) return undefined;

    const proposer = await this.getUser(proposal.proposedBy);
    const recipient = await this.getUser(proposal.proposedTo);
    const schedule = await this.getSchedule(proposal.scheduleId);

    if (!proposer || !recipient || !schedule) return undefined;

    return {
      ...proposal,
      proposer: {
        id: proposer.id,
        firstName: proposer.firstName,
        lastName: proposer.lastName,
        email: proposer.email,
        role: proposer.role,
      },
      recipient: {
        id: recipient.id,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        email: recipient.email,
        role: recipient.role,
      },
      schedule: {
        id: schedule.id,
        title: schedule.title,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        courseId: schedule.courseId,
      },
    };
  }

  async createRescheduleProposal(proposal: InsertRescheduleProposal): Promise<RescheduleProposal> {
    const [newProposal] = await db.insert(rescheduleProposals).values(proposal).returning();
    return newProposal;
  }

  async updateRescheduleProposal(id: string, updates: Partial<InsertRescheduleProposal>): Promise<RescheduleProposal | undefined> {
    const [updated] = await db.update(rescheduleProposals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(rescheduleProposals.id, id))
      .returning();
    return updated;
  }

  async deleteRescheduleProposal(id: string): Promise<boolean> {
    const result = await db.delete(rescheduleProposals).where(eq(rescheduleProposals.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // Google Calendar Settings Operations
  // =====================================================

  async getGoogleCalendarSettings(userId: string): Promise<GoogleCalendarSettings | undefined> {
    const [settings] = await db.select().from(googleCalendarSettings)
      .where(eq(googleCalendarSettings.userId, userId))
      .limit(1);
    return settings;
  }

  async createGoogleCalendarSettings(settings: InsertGoogleCalendarSettings): Promise<GoogleCalendarSettings> {
    const [newSettings] = await db.insert(googleCalendarSettings).values(settings).returning();
    return newSettings;
  }

  async updateGoogleCalendarSettings(userId: string, updates: Partial<InsertGoogleCalendarSettings>): Promise<GoogleCalendarSettings | undefined> {
    const [updated] = await db.update(googleCalendarSettings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(googleCalendarSettings.userId, userId))
      .returning();
    return updated;
  }

  async deleteGoogleCalendarSettings(userId: string): Promise<boolean> {
    const result = await db.delete(googleCalendarSettings).where(eq(googleCalendarSettings.userId, userId));
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // Google Calendar Event Operations
  // =====================================================

  async getGoogleCalendarEvent(scheduleId: string, userId: string): Promise<GoogleCalendarEvent | undefined> {
    const [event] = await db.select().from(googleCalendarEvents)
      .where(and(
        eq(googleCalendarEvents.scheduleId, scheduleId),
        eq(googleCalendarEvents.userId, userId)
      ))
      .limit(1);
    return event;
  }

  async getGoogleCalendarEventsByUser(userId: string): Promise<GoogleCalendarEvent[]> {
    return await db.select().from(googleCalendarEvents)
      .where(eq(googleCalendarEvents.userId, userId));
  }

  async getGoogleCalendarEventsBySchedule(scheduleId: string): Promise<GoogleCalendarEvent[]> {
    return await db.select().from(googleCalendarEvents)
      .where(eq(googleCalendarEvents.scheduleId, scheduleId));
  }

  async createGoogleCalendarEvent(event: InsertGoogleCalendarEvent): Promise<GoogleCalendarEvent> {
    const [newEvent] = await db.insert(googleCalendarEvents).values(event).returning();
    return newEvent;
  }

  async updateGoogleCalendarEvent(id: string, updates: Partial<InsertGoogleCalendarEvent>): Promise<GoogleCalendarEvent | undefined> {
    const [updated] = await db.update(googleCalendarEvents)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(googleCalendarEvents.id, id))
      .returning();
    return updated;
  }

  async deleteGoogleCalendarEvent(id: string): Promise<boolean> {
    const result = await db.delete(googleCalendarEvents).where(eq(googleCalendarEvents.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteGoogleCalendarEventsBySchedule(scheduleId: string): Promise<number> {
    const result = await db.delete(googleCalendarEvents).where(eq(googleCalendarEvents.scheduleId, scheduleId));
    return result.rowCount ?? 0;
  }

  // =====================================================
  // User Document Operations
  // =====================================================

  async getUserDocuments(userId: string): Promise<UserDocument[]> {
    return await db.select().from(userDocuments)
      .where(eq(userDocuments.userId, userId))
      .orderBy(desc(userDocuments.createdAt));
  }

  async getUserDocument(id: string): Promise<UserDocument | undefined> {
    const [doc] = await db.select().from(userDocuments)
      .where(eq(userDocuments.id, id))
      .limit(1);
    return doc;
  }

  async createUserDocument(doc: InsertUserDocument): Promise<UserDocument> {
    const [newDoc] = await db.insert(userDocuments).values(doc).returning();
    return newDoc;
  }

  async updateUserDocumentVisibility(id: string, isVisible: boolean): Promise<UserDocument | undefined> {
    const [updated] = await db.update(userDocuments)
      .set({ isVisible })
      .where(eq(userDocuments.id, id))
      .returning();
    return updated;
  }

  async deleteUserDocument(id: string): Promise<boolean> {
    const result = await db.delete(userDocuments).where(eq(userDocuments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // Refresh Token Operations
  // =====================================================

  async getRefreshToken(id: string): Promise<RefreshToken | undefined> {
    const [token] = await db.select().from(refreshTokens)
      .where(eq(refreshTokens.id, id))
      .limit(1);
    return token;
  }

  async getRefreshTokenByToken(token: string): Promise<RefreshToken | undefined> {
    const [result] = await db.select().from(refreshTokens)
      .where(eq(refreshTokens.token, token))
      .limit(1);
    return result;
  }

  async getRefreshTokensByUser(userId: string): Promise<RefreshToken[]> {
    return await db.select().from(refreshTokens)
      .where(eq(refreshTokens.userId, userId))
      .orderBy(desc(refreshTokens.createdAt));
  }

  async createRefreshToken(refreshToken: InsertRefreshToken): Promise<RefreshToken> {
    const [newToken] = await db.insert(refreshTokens).values(refreshToken).returning();
    return newToken;
  }

  async revokeRefreshToken(id: string): Promise<boolean> {
    const [updated] = await db.update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.id, id))
      .returning();
    return !!updated;
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<boolean> {
    const result = await db.update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId));
    return (result.rowCount ?? 0) > 0;
  }

  async deleteExpiredRefreshTokens(): Promise<number> {
    const result = await db.delete(refreshTokens)
      .where(lte(refreshTokens.expiresAt, new Date()));
    return result.rowCount ?? 0;
  }

  // =====================================================
  // Partner Operations (Multi-partner SaaS)
  // =====================================================

  async getPartner(id: string): Promise<Partner | undefined> {
    const [partner] = await db.select().from(partners)
      .where(eq(partners.id, id))
      .limit(1);
    return partner;
  }

  async getAllPartners(): Promise<Partner[]> {
    return await db.select().from(partners)
      .orderBy(desc(partners.createdAt));
  }

  async getPartnersByStatus(status: "active" | "inactive"): Promise<Partner[]> {
    return await db.select().from(partners)
      .where(eq(partners.status, status))
      .orderBy(desc(partners.createdAt));
  }

  async createPartner(partner: InsertPartner): Promise<Partner> {
    const [newPartner] = await db.insert(partners).values(partner).returning();
    return newPartner;
  }

  async updatePartner(id: string, updates: Partial<InsertPartner>): Promise<Partner | undefined> {
    const [updated] = await db.update(partners)
      .set(updates)
      .where(eq(partners.id, id))
      .returning();
    return updated;
  }

  async deletePartner(id: string): Promise<boolean> {
    const result = await db.delete(partners).where(eq(partners.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // Partner-scoped User Operations
  // =====================================================

  async getUsersByPartner(partnerId: string): Promise<User[]> {
    return await db.select().from(users)
      .where(eq(users.partnerId, partnerId))
      .orderBy(desc(users.createdAt));
  }

  async assignUserToPartner(userId: string, partnerId: string | null): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ partnerId })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  // =====================================================
  // Partner-scoped Prospect Operations
  // =====================================================

  // =====================================================
  // Assignment Deadline Reminder Operations
  // =====================================================

  async hasDeadlineReminderBeenSent(assignmentId: string, studentId: string): Promise<boolean> {
    const result = await db.select().from(assignmentDeadlineReminders)
      .where(and(
        eq(assignmentDeadlineReminders.assignmentId, assignmentId),
        eq(assignmentDeadlineReminders.studentId, studentId)
      ))
      .limit(1);
    return result.length > 0;
  }

  async createDeadlineReminder(assignmentId: string, studentId: string, parentId: string): Promise<void> {
    await db.insert(assignmentDeadlineReminders).values({
      assignmentId,
      studentId,
      parentId,
    }).onConflictDoNothing();
  }

  async getProspectStudentsByPartner(partnerId: string): Promise<ProspectStudent[]> {
    return await db.select().from(prospectStudents)
      .where(eq(prospectStudents.partnerId, partnerId))
      .orderBy(desc(prospectStudents.createdAt));
  }

  async assignProspectToPartner(prospectId: string, partnerId: string | null): Promise<ProspectStudent | undefined> {
    const [updated] = await db.update(prospectStudents)
      .set({ partnerId })
      .where(eq(prospectStudents.id, prospectId))
      .returning();
    return updated;
  }

  // =====================================================
  // DMS Folder Operations
  // =====================================================

  async getDmsFolder(id: string): Promise<DmsFolder | undefined> {
    const [folder] = await db.select().from(dmsFolders).where(eq(dmsFolders.id, id));
    return folder;
  }

  async getDmsFolders(parentId?: string | null, category?: string): Promise<DmsFolderWithCount[]> {
    const conditions = [];
    if (parentId === 'all') {
      // no parent filter - return all folders
    } else if (parentId === null || parentId === undefined) {
      conditions.push(sql`${dmsFolders.parentId} IS NULL`);
    } else {
      conditions.push(eq(dmsFolders.parentId, parentId));
    }
    if (category) {
      conditions.push(eq(dmsFolders.category, category as any));
    }

    const folders = await db.select().from(dmsFolders)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(dmsFolders.name);

    const result: DmsFolderWithCount[] = [];
    for (const folder of folders) {
      const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
        .from(dmsDocuments)
        .where(eq(dmsDocuments.folderId, folder.id));
      result.push({ ...folder, documentCount: countResult?.count || 0 });
    }
    return result;
  }

  async createDmsFolder(folder: InsertDmsFolder): Promise<DmsFolder> {
    const [created] = await db.insert(dmsFolders).values(folder).returning();
    return created;
  }

  async updateDmsFolder(id: string, updates: Partial<InsertDmsFolder>): Promise<DmsFolder | undefined> {
    const [updated] = await db.update(dmsFolders).set(updates).where(eq(dmsFolders.id, id)).returning();
    return updated;
  }

  async deleteDmsFolder(id: string): Promise<boolean> {
    const result = await db.delete(dmsFolders).where(eq(dmsFolders.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // DMS Document Operations
  // =====================================================

  async getDmsDocument(id: string): Promise<DmsDocument | undefined> {
    const [doc] = await db.select().from(dmsDocuments).where(eq(dmsDocuments.id, id));
    return doc;
  }

  async getDmsDocuments(filters: { folderId?: string | null; category?: string; search?: string }): Promise<DmsDocumentWithUploader[]> {
    const conditions = [];
    
    if (filters.folderId === null) {
      conditions.push(sql`${dmsDocuments.folderId} IS NULL`);
    } else if (filters.folderId) {
      conditions.push(eq(dmsDocuments.folderId, filters.folderId));
    }
    
    if (filters.category) {
      conditions.push(eq(dmsDocuments.category, filters.category as any));
    }
    
    if (filters.search) {
      const searchTerm = `%${filters.search.toLowerCase()}%`;
      conditions.push(sql`(LOWER(${dmsDocuments.title}) LIKE ${searchTerm} OR LOWER(${dmsDocuments.originalName}) LIKE ${searchTerm} OR LOWER(COALESCE(${dmsDocuments.description}, '')) LIKE ${searchTerm})`);
    }

    const docs = await db.select({
      id: dmsDocuments.id,
      folderId: dmsDocuments.folderId,
      category: dmsDocuments.category,
      title: dmsDocuments.title,
      description: dmsDocuments.description,
      storagePath: dmsDocuments.storagePath,
      originalName: dmsDocuments.originalName,
      mimeType: dmsDocuments.mimeType,
      size: dmsDocuments.size,
      uploadedBy: dmsDocuments.uploadedBy,
      createdAt: dmsDocuments.createdAt,
      updatedAt: dmsDocuments.updatedAt,
      uploaderFirstName: users.firstName,
      uploaderLastName: users.lastName,
    })
    .from(dmsDocuments)
    .leftJoin(users, eq(dmsDocuments.uploadedBy, users.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(dmsDocuments.createdAt));

    return docs.map(doc => ({
      id: doc.id,
      folderId: doc.folderId,
      category: doc.category,
      title: doc.title,
      description: doc.description,
      storagePath: doc.storagePath,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      size: doc.size,
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      uploaderName: `${doc.uploaderFirstName || ''} ${doc.uploaderLastName || ''}`.trim() || 'Unknown',
    }));
  }

  async createDmsDocument(doc: InsertDmsDocument): Promise<DmsDocument> {
    const [created] = await db.insert(dmsDocuments).values(doc).returning();
    return created;
  }

  async updateDmsDocument(id: string, updates: Partial<InsertDmsDocument>): Promise<DmsDocument | undefined> {
    const [updated] = await db.update(dmsDocuments).set(updates).where(eq(dmsDocuments.id, id)).returning();
    return updated;
  }

  async deleteDmsDocument(id: string): Promise<boolean> {
    const result = await db.delete(dmsDocuments).where(eq(dmsDocuments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // =====================================================
  // DMS Share Link Operations
  // =====================================================

  async getDmsShareLink(id: string): Promise<DmsShareLink | undefined> {
    const [link] = await db.select().from(dmsShareLinks).where(eq(dmsShareLinks.id, id));
    return link;
  }

  async getDmsShareLinkByToken(token: string): Promise<DmsShareLink | undefined> {
    const [link] = await db.select().from(dmsShareLinks).where(eq(dmsShareLinks.token, token));
    return link;
  }

  async getDmsShareLinksByDocument(documentId: string): Promise<DmsShareLink[]> {
    return await db.select().from(dmsShareLinks)
      .where(eq(dmsShareLinks.documentId, documentId))
      .orderBy(desc(dmsShareLinks.createdAt));
  }

  async createDmsShareLink(link: InsertDmsShareLink): Promise<DmsShareLink> {
    const [created] = await db.insert(dmsShareLinks).values(link).returning();
    return created;
  }

  async incrementDmsShareLinkDownloadCount(id: string): Promise<void> {
    await db.update(dmsShareLinks)
      .set({ downloadCount: sql`${dmsShareLinks.downloadCount} + 1` })
      .where(eq(dmsShareLinks.id, id));
  }

  async deleteDmsShareLink(id: string): Promise<boolean> {
    const result = await db.delete(dmsShareLinks).where(eq(dmsShareLinks.id, id));
    return (result.rowCount ?? 0) > 0;
  }
}