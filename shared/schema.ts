import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, date, integer, decimal, boolean, pgEnum, unique, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Enums
export const userRoleEnum = pgEnum("user_role", ["student", "parent", "teacher", "admin", "finance_admin", "partner_admin"]);
export const partnerStatusEnum = pgEnum("partner_status", ["active", "inactive"]);
export const assignmentTypeEnum = pgEnum("assignment_type", ["homework", "quiz", "exam", "project"]);
export const messageTypeEnum = pgEnum("message_type", ["assignment", "grade", "announcement", "general"]);
export const attendanceStatusEnum = pgEnum("attendance_status", ["present", "absent", "late", "excused"]);
export const enrollmentStatusEnum = pgEnum("enrollment_status", ["requested", "parent_approved", "admin_approved", "enrolled", "rejected"]);
export const enrollmentApprovalStatusEnum = pgEnum("enrollment_approval_status", ["pending", "approved", "rejected"]);
export const courseActivationStatusEnum = pgEnum("course_activation_status", ["draft", "pending_parent", "parent_authorized", "pending_admin", "active", "rejected"]);
export const scheduleStatusEnum = pgEnum("schedule_status", ["scheduled", "cancelled", "rescheduled", "completed"]);
export const recurrenceFrequencyEnum = pgEnum("recurrence_frequency", ["daily", "weekly", "biweekly", "monthly", "custom"]);
export const recurrenceEndTypeEnum = pgEnum("recurrence_end_type", ["never", "until_date", "after_occurrences"]);
export const notificationTypeEnum = pgEnum("notification_type", ["enrollment_request", "enrollment_approved", "enrollment_rejected", "assignment_posted", "assignment_graded", "assignment_submitted", "assignment_reminder", "new_message", "announcement", "general", "schedule_created", "schedule_rescheduled", "schedule_completed", "teacher_assigned", "student_enrolled", "invoice_generated", "payment_received", "payment_failed", "prospect_student_submitted", "curriculum_unit_completed", "progress_milestone", "resource"]);
export const feeBillingCycleEnum = pgEnum("fee_billing_cycle", ["weekly", "monthly"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "pending", "paid", "overdue", "cancelled"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "processing", "completed", "failed", "refunded"]);
export const resetRequestStatusEnum = pgEnum("reset_request_status", ["pending", "approved", "rejected"]);
export const prospectStatusEnum = pgEnum("prospect_status", ["new", "contacted", "demo_scheduled", "enrolled", "archived"]);
export const prospectFormTypeEnum = pgEnum("prospect_form_type", ["academics", "computer", "dance", "arts"]);
export const teacherRoleTypeEnum = pgEnum("teacher_role_type", ["regular", "substitute"]);
export const rescheduleProposalStatusEnum = pgEnum("reschedule_proposal_status", ["pending", "accepted", "counter_proposed", "rejected"]);

// Partners table (Learning Centers / Franchises)
export const partners = pgTable("partners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  status: partnerStatusEnum("status").default("active").notNull(),
  state: text("state"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  city: text("city"),
  country: text("country"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("partners_status_idx").on(table.status),
  index("partners_state_idx").on(table.state),
]);

// Users table
// @ts-expect-error - Self-referencing table causes type inference issues but works correctly at runtime
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(), // Make nullable for Replit Auth compatibility
  password: text("password"), // Added for email/password authentication
  name: text("name"), // Keep for backwards compatibility, computed from firstName + lastName
  firstName: text("first_name"), // Required for Replit Auth
  lastName: text("last_name"), // Required for Replit Auth
  role: userRoleEnum("role").notNull(),
  phone: text("phone"), // Phone number for all users
  address: text("address"), // Address for all users
  city: text("city"), // City
  state: text("state"), // State/Province
  zipCode: text("zip_code"), // Zip/Postal code
  country: text("country"), // Country
  bio: text("bio"), // Biography/About me
  dateOfBirth: date("date_of_birth"), // Date of birth
  gender: text("gender"), // Gender
  subject: text("subject"), // Subject taught (for teachers)
  education: text("education"), // Education details (for teachers)
  certifications: text("certifications"), // Certifications (for teachers)
  // @ts-expect-error - Self-referencing causes type inference issues
  parentId: varchar("parent_id").references(() => users.id, { onDelete: "set null" }), // Parent for students
  avatarUrl: text("avatar_url"), // Keep existing field name
  profileImageUrl: text("profile_image_url"), // Replit Auth field
  coverPhotoUrl: text("cover_photo_url"), // Cover photo
  calendarColor: text("calendar_color"), // Color for calendar/schedule display (e.g., "#4285F4")
  timezone: text("timezone").default("UTC"), // IANA timezone name (e.g., "America/New_York", "Asia/Kathmandu")
  isActive: boolean("is_active").default(true), // Account activation status
  oneTimePassword: text("one_time_password"), // OTP for first-time parent login
  requiresPasswordReset: boolean("requires_password_reset").default(false), // Flag for password reset requirement
  resetToken: text("reset_token"), // Password reset token
  resetTokenExpiry: timestamp("reset_token_expiry"), // Token expiration timestamp
  partnerId: varchar("partner_id").references(() => partners.id, { onDelete: "set null" }), // Partner for students, parents, partner_admins (NULL for teachers, admin, finance_admin)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("users_partner_id_idx").on(table.partnerId),
]);

// Subjects table
export const subjects = pgTable("subjects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  grade: text("grade"), // Grade/class level for the subject
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Courses table
export const courses = pgTable("courses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  teacherId: varchar("teacher_id").references(() => users.id, { onDelete: "restrict" }), // Made optional
  subject: text("subject").notNull(),
  grade: text("grade").notNull(),
  startDate: date("start_date"),
  duration: text("duration"), // e.g., "12 weeks", "3 months"
  philosophy: text("philosophy"), // Course philosophy
  prerequisites: text("prerequisites"), // Prerequisites for the course
  learningObjectives: text("learning_objectives"), // Learning objectives
  curriculum: jsonb("curriculum").$type<Array<{ heading: string; description: string }>>().default([]), // Curriculum sections with heading and description
  practicalSessions: text("practical_sessions"), // Practical sessions information
  coverImageUrl: text("cover_image_url"), // Cover image for the course
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Enrollments (many-to-many between students and courses)
export const enrollments = pgTable("enrollments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  approvalStatus: enrollmentApprovalStatusEnum("approval_status").default("pending").notNull(),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  enrolledAt: timestamp("enrolled_at").defaultNow(),
}, (table) => ({
  uniqueStudentCourse: unique().on(table.studentId, table.courseId),
}));

// Enrollment Requests (approval workflow)
export const enrollmentRequests = pgTable("enrollment_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  parentId: varchar("parent_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  status: enrollmentStatusEnum("status").default("requested").notNull(),
  requestedAt: timestamp("requested_at").defaultNow(),
  parentApprovedAt: timestamp("parent_approved_at"),
  adminApprovedAt: timestamp("admin_approved_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  uniqueStudentCourseRequest: unique().on(table.studentId, table.courseId),
}));

// Course Activation Requests (approval workflow for courses)
export const courseActivationRequests = pgTable("course_activation_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull().unique(),
  teacherId: varchar("teacher_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  childId: varchar("child_id").references(() => users.id, { onDelete: "restrict" }).notNull(), // Student for parent approval
  parentId: varchar("parent_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  adminId: varchar("admin_id").references(() => users.id, { onDelete: "restrict" }),
  status: courseActivationStatusEnum("status").default("draft").notNull(),
  submittedAt: timestamp("submitted_at"),
  parentAuthorizedAt: timestamp("parent_authorized_at"),
  adminVerifiedAt: timestamp("admin_verified_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  parentNotes: text("parent_notes"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Assignments table
export const assignments = pgTable("assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  type: assignmentTypeEnum("type").notNull(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  teacherId: varchar("teacher_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  dueDate: timestamp("due_date"),
  maxScore: integer("max_score").default(100),
  instructions: text("instructions"),
  isPublished: boolean("is_published").default(false),
  isShared: boolean("is_shared").default(true), // true = visible to all enrolled students, false = individually assigned
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Individual assignment mappings (tracks which students an assignment is assigned to)
export const individualAssignmentMappings = pgTable("individual_assignment_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").references(() => assignments.id, { onDelete: "cascade" }).notNull(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueAssignmentStudent: unique().on(table.assignmentId, table.studentId),
}));

// Assignment attachments (PDFs, images, links)
export const assignmentAttachments = pgTable("assignment_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").references(() => assignments.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(), // 'file' or 'link'
  url: text("url").notNull(),
  fileName: text("file_name"), // Original file name for files
  fileSize: integer("file_size"), // File size in bytes for files
  mimeType: text("mime_type"), // MIME type for files
  createdAt: timestamp("created_at").defaultNow(),
});

// Assignment submissions
export const submissions = pgTable("submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").references(() => assignments.id, { onDelete: "cascade" }).notNull(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  content: text("content"),
  submittedAt: timestamp("submitted_at").defaultNow(),
}, (table) => ({
  uniqueAssignmentStudent: unique().on(table.assignmentId, table.studentId),
}));

// Submission attachments
export const submissionAttachments = pgTable("submission_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").references(() => submissions.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(), // 'file' or 'link'
  url: text("url").notNull(),
  fileName: text("file_name"), // Original file name for files
  fileSize: integer("file_size"), // File size in bytes for files
  mimeType: text("mime_type"), // MIME type for files
  createdAt: timestamp("created_at").defaultNow(),
});

// Grades table
export const grades = pgTable("grades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  submissionId: varchar("submission_id").references(() => submissions.id, { onDelete: "cascade" }).notNull().unique(),
  score: integer("score").notNull(),
  feedback: text("feedback"),
  gradedAt: timestamp("graded_at").defaultNow(),
  gradedBy: varchar("graded_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
});

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  recipientId: varchar("recipient_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  subject: text("subject").notNull(),
  content: text("content").notNull(),
  type: messageTypeEnum("type").default("general"),
  isRead: boolean("is_read").default(false),
  sentAt: timestamp("sent_at").defaultNow(),
});

// Message Attachments table
export const messageAttachments = pgTable("message_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  fileUrl: text("file_url").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Attendance table
export const attendance = pgTable("attendance", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  date: date("date").notNull(),
  status: attendanceStatusEnum("status").notNull(),
  notes: text("notes"),
  recordedBy: varchar("recorded_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
}, (table) => ({
  uniqueStudentCourseDate: unique().on(table.studentId, table.courseId, table.date),
}));

// Parent-Child relationships
export const parentChildren = pgTable("parent_children", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  parentId: varchar("parent_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  childId: varchar("child_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  relationship: text("relationship").default("parent"), // parent, guardian, etc.
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueParentChild: unique().on(table.parentId, table.childId),
}));

// Student-Teacher Assignments (one-to-one per course, initially unassigned)
export const studentTeacherAssignments = pgTable("student_teacher_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  teacherId: varchar("teacher_id").references(() => users.id, { onDelete: "set null" }), // Nullable - initially unassigned
  assignedAt: timestamp("assigned_at"), // Nullable - set when teacher is assigned
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "set null" }), // Nullable - only set when manually assigned
  notes: text("notes"),
}, (table) => ({
  uniqueStudentCourse: unique().on(table.studentId, table.courseId),
}));

// Announcements table
export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: varchar("author_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }), // null means global announcement
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"), // When announcement expires and moves to history
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Student Announcement Hidden Status - tracks which announcements students have hidden
export const studentAnnouncementHidden = pgTable("student_announcement_hidden", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  announcementId: varchar("announcement_id").references(() => announcements.id, { onDelete: "cascade" }).notNull(),
  hiddenAt: timestamp("hidden_at").defaultNow(),
}, (table) => ({
  uniqueStudentAnnouncement: unique().on(table.studentId, table.announcementId),
}));

// Announcement Recipients - tracks individual student/parent targeting
export const announcementRecipients = pgTable("announcement_recipients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  announcementId: varchar("announcement_id").references(() => announcements.id, { onDelete: "cascade" }).notNull(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  parentId: varchar("parent_id").references(() => users.id, { onDelete: "cascade" }),
  studentReadAt: timestamp("student_read_at"),
  parentReadAt: timestamp("parent_read_at"),
  studentAcknowledgedAt: timestamp("student_acknowledged_at"),
  parentAcknowledgedAt: timestamp("parent_acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueAnnouncementStudent: unique().on(table.announcementId, table.studentId),
}));

// Pending parent activations
export const pendingParentActivations = pgTable("pending_parent_activations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  parentName: text("parent_name").notNull(),
  parentEmail: text("parent_email").notNull(),
  parentPhone: text("parent_phone").notNull(),
  activationToken: varchar("activation_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schedule Recurrences table (parent recurrence rules)
export const scheduleRecurrences = pgTable("schedule_recurrences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  teacherId: varchar("teacher_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  // Anchor times (template for occurrences)
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  // Recurrence pattern
  frequency: recurrenceFrequencyEnum("frequency").notNull(),
  interval: integer("interval").default(1).notNull(), // e.g., every 2 weeks
  weekdays: text("weekdays"), // JSON array of weekday numbers [0-6] for weekly patterns
  monthDay: integer("month_day"), // Day of month (1-31) for monthly patterns
  // End condition
  endType: recurrenceEndTypeEnum("end_type").default("never").notNull(),
  endDate: timestamp("end_date"), // For until_date type
  occurrenceCount: integer("occurrence_count"), // For after_occurrences type
  // Metadata
  timezone: text("timezone").default("UTC"),
  notes: text("notes"),
  externalLink: text("external_link"), // External link (Zoom, Teams, etc.) to apply to all instances
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Schedules table (individual schedule instances)
export const schedules = pgTable("schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  teacherId: varchar("teacher_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  regularTeacherId: varchar("regular_teacher_id").references(() => users.id, { onDelete: "restrict" }), // Permanent regular teacher for this class
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  location: text("location"),
  externalLink: text("external_link"), // External link (Zoom, Teams, etc.)
  status: scheduleStatusEnum("status").default("scheduled").notNull(),
  notes: text("notes"),
  // Recurrence tracking
  recurrenceId: varchar("recurrence_id").references(() => scheduleRecurrences.id, { onDelete: "cascade" }),
  occurrenceIndex: integer("occurrence_index"), // Nth occurrence in the series
  originalStartTime: timestamp("original_start_time"), // Original scheduled time before modifications
  isException: boolean("is_exception").default(false), // True if this occurrence was modified
  // Metadata
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  cancelledBy: varchar("cancelled_by").references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Schedule Recurrence Exceptions (skipped or modified occurrences)
export const scheduleRecurrenceExceptions = pgTable("schedule_recurrence_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recurrenceId: varchar("recurrence_id").references(() => scheduleRecurrences.id, { onDelete: "cascade" }).notNull(),
  occurrenceDate: timestamp("occurrence_date").notNull(), // The date that was skipped/modified
  replacementScheduleId: varchar("replacement_schedule_id").references(() => schedules.id, { onDelete: "set null" }), // If rescheduled to different time
  reason: text("reason"), // Why this occurrence was skipped/modified
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schedule Substitutions table (track substitute teacher assignments for sessions)
export const scheduleSubstitutions = pgTable("schedule_substitutions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id").references(() => schedules.id, { onDelete: "cascade" }).notNull(),
  substituteTeacherId: varchar("substitute_teacher_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  reason: text("reason").notNull(), // Why substitution is needed
  assignedBy: varchar("assigned_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("schedule_substitutions_schedule_idx").on(table.scheduleId),
  index("schedule_substitutions_substitute_idx").on(table.substituteTeacherId),
]);

// Teacher Class Counts table (track class sessions conducted by teachers)
export const teacherClassCounts = pgTable("teacher_class_counts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id").references(() => schedules.id, { onDelete: "cascade" }).notNull(),
  teacherId: varchar("teacher_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  sessionDate: timestamp("session_date").notNull(),
  roleType: teacherRoleTypeEnum("role_type").notNull(), // 'regular' or 'substitute'
  isCounted: boolean("is_counted").default(true).notNull(), // Whether to include in aggregations
  notes: text("notes"),
  countedAt: timestamp("counted_at").defaultNow(),
}, (table) => [
  index("teacher_class_counts_teacher_idx").on(table.teacherId),
  index("teacher_class_counts_session_date_idx").on(table.sessionDate),
  unique("teacher_class_counts_unique").on(table.scheduleId, table.teacherId),
]);

// Reschedule Proposals table (for reschedule acknowledgement workflow)
export const rescheduleProposals = pgTable("reschedule_proposals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id").references(() => schedules.id, { onDelete: "cascade" }).notNull(),
  proposedBy: varchar("proposed_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  proposedTo: varchar("proposed_to").references(() => users.id, { onDelete: "restrict" }).notNull(),
  proposedStartTime: timestamp("proposed_start_time").notNull(),
  proposedEndTime: timestamp("proposed_end_time").notNull(),
  status: rescheduleProposalStatusEnum("status").default("pending").notNull(),
  counterProposalId: varchar("counter_proposal_id"), // Self-reference for counter proposals
  message: text("message"), // Optional note explaining the reschedule reason
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("reschedule_proposals_schedule_idx").on(table.scheduleId),
  index("reschedule_proposals_proposed_by_idx").on(table.proposedBy),
  index("reschedule_proposals_proposed_to_idx").on(table.proposedTo),
  index("reschedule_proposals_status_idx").on(table.status),
]);

// Course Resources table
export const courseResources = pgTable("course_resources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type").notNull(), // 'file' or 'link'
  resourceUrl: text("resource_url").notNull(),
  fileName: text("file_name"), // Original file name for downloads
  fileSize: integer("file_size"), // File size in bytes
  mimeType: text("mime_type"), // MIME type for files
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  isShared: boolean("is_shared").default(true), // true = visible to all enrolled students, false = individually assigned
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Individual resource mappings (tracks which students a resource is assigned to)
export const resourceStudentMappings = pgTable("resource_student_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resourceId: varchar("resource_id").references(() => courseResources.id, { onDelete: "cascade" }).notNull(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueResourceStudent: unique().on(table.resourceId, table.studentId),
}));

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  relatedId: varchar("related_id"), // ID of related entity (course, assignment, etc.)
  relatedType: text("related_type"), // Type of related entity
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  index("notifications_is_read_idx").on(table.isRead),
]);

// Fee Management System

// Fee Plans table (define billing plans with rate per class)
export const feePlans = pgTable("fee_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  ratePerClass: decimal("rate_per_class", { precision: 10, scale: 2 }).notNull(), // Rate charged per class
  billingCycle: feeBillingCycleEnum("billing_cycle").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  deletedAt: timestamp("deleted_at"), // Soft delete - null means not deleted
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Student Fee Assignments (assign fee plans to students)
export const studentFeeAssignments = pgTable("student_fee_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  feePlanId: varchar("fee_plan_id").references(() => feePlans.id, { onDelete: "restrict" }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"), // Null for ongoing
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique().on(table.studentId, table.feePlanId),
  index("student_fee_assignments_student_active_idx").on(table.studentId, table.isActive),
]);

// Invoice Generation Log (idempotency tracking to prevent duplicates)
export const invoiceGenerationLog = pgTable("invoice_generation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),
  status: text("status").notNull(), // 'pending', 'completed', 'failed'
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  feePlanId: varchar("fee_plan_id").references(() => feePlans.id, { onDelete: "restrict" }).notNull(),
  billingPeriodStart: date("billing_period_start").notNull(),
  billingPeriodEnd: date("billing_period_end").notNull(),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("invoice_gen_log_idempotency_key_idx").on(table.idempotencyKey),
  index("invoice_gen_log_created_at_idx").on(table.createdAt),
]);

// Invoices table
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  parentId: varchar("parent_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  feePlanId: varchar("fee_plan_id").references(() => feePlans.id, { onDelete: "restrict" }).notNull(),
  billingPeriodStart: date("billing_period_start").notNull(),
  billingPeriodEnd: date("billing_period_end").notNull(),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  tax: decimal("tax", { precision: 10, scale: 2 }).default("0.00").notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  status: invoiceStatusEnum("status").default("pending").notNull(),
  dueDate: date("due_date").notNull(),
  paidAt: timestamp("paid_at"),
  stripeInvoiceId: text("stripe_invoice_id"),
  notes: text("notes"),
  isCopy: boolean("is_copy").default(false).notNull(),
  originalInvoiceId: varchar("original_invoice_id"),
  isDeleted: boolean("is_deleted").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  deletedBy: varchar("deleted_by").references(() => users.id),
  deletionReason: text("deletion_reason"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("invoices_student_id_idx").on(table.studentId),
  index("invoices_parent_id_idx").on(table.parentId),
  index("invoices_status_idx").on(table.status),
  index("invoices_due_date_idx").on(table.dueDate),
  index("invoices_is_deleted_idx").on(table.isDeleted),
]);

// Invoice Items table
export const invoiceItems = pgTable("invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("invoice_items_invoice_id_idx").on(table.invoiceId),
]);

// Invoice Sessions - tracks which scheduled sessions are included in each invoice
export const invoiceSessions = pgTable("invoice_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
  scheduleId: varchar("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  sessionDate: timestamp("session_date").notNull(),
  sessionTitle: text("session_title").notNull(),
  courseName: text("course_name"),
  teacherName: text("teacher_name"),
  rateApplied: decimal("rate_applied", { precision: 10, scale: 2 }).notNull(),
  status: text("status").default("billed").notNull(), // billed, adjusted, credited
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("invoice_sessions_invoice_id_idx").on(table.invoiceId),
  index("invoice_sessions_student_id_idx").on(table.studentId),
  index("invoice_sessions_schedule_id_idx").on(table.scheduleId),
]);

// Payments table
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: "restrict" }).notNull(),
  parentId: varchar("parent_id").references(() => users.id, { onDelete: "restrict" }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  paymentMethod: text("payment_method"), // 'stripe', 'cash', 'check', etc.
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  transactionId: text("transaction_id"), // External transaction reference
  failureReason: text("failure_reason"),
  paidAt: timestamp("paid_at"),
  refundedAt: timestamp("refunded_at"),
  refundAmount: decimal("refund_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  recordedByUserId: varchar("recorded_by_user_id").references(() => users.id, { onDelete: "set null" }),
  verifiedByUserId: varchar("verified_by_user_id").references(() => users.id, { onDelete: "set null" }),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("payments_invoice_id_idx").on(table.invoiceId),
  index("payments_parent_id_idx").on(table.parentId),
  index("payments_status_idx").on(table.status),
]);

// Course Activities table (auto-generated events between student and course)
export const courseActivities = pgTable("course_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(), // 'assignment_posted', 'assignment_submitted', 'assignment_graded', 'milestone_reached'
  title: text("title").notNull(),
  description: text("description"),
  relatedId: varchar("related_id"), // ID of assignment, submission, grade, etc.
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("course_activities_course_student_idx").on(table.courseId, table.studentId),
  index("course_activities_created_at_idx").on(table.createdAt),
]);

// Prospect Students table (contact form submissions)
export const prospectStudents = pgTable("prospect_students", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  formType: prospectFormTypeEnum("form_type").notNull(),
  status: text("status").default("new").notNull(),

  // Common fields
  parentName: text("parent_name"),
  parentEmail: text("parent_email"),
  parentPhone: text("parent_phone"),
  studentName: text("student_name").notNull(),
  studentDOB: text("student_dob"),
  studentAge: text("student_age"),
  studentGrade: text("student_grade"),
  location: text("location"),
  country: text("country"),
  state: text("state"),
  zipCode: text("zip_code"),
  zoomEmail: text("zoom_email"),
  previousOnlineClass: text("previous_online_class"),
  demoTime: text("demo_time"),
  additionalInfo: text("additional_info"),

  // Academics specific
  strongPoints: text("strong_points"),
  weakPoints: text("weak_points"),
  expectations: text("expectations"),

  // Computer Science specific
  computerComfort: text("computer_comfort"),
  topicInterest: text("topic_interest"),
  toolToLearn: text("tool_to_learn"),
  heardProgramming: text("heard_programming"),
  learningPace: text("learning_pace"),
  deviceUsing: text("device_using"),
  enjoyDesigning: text("enjoy_designing"),
  wantApps: text("want_apps"),
  interestedAI: text("interested_ai"),
  softwareUsed: text("software_used"),

  // Dance specific
  danceStyle: text("dance_style"),

  // Arts specific
  artForm: text("art_form"),
  learningNeeds: text("learning_needs"),
  heardAbout: text("heard_about"),

  // Admin fields
  notes: text("notes"),
  followUpDate: date("follow_up_date"),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: "set null" }),
  emailSent: boolean("email_sent").default(false).notNull(),
  convertedToStudentId: varchar("converted_to_student_id").references(() => users.id, { onDelete: "set null" }),
  partnerId: varchar("partner_id").references(() => partners.id, { onDelete: "set null" }), // Partner who owns this prospect (tagged by Admin)

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("prospect_students_status_idx").on(table.status),
  index("prospect_students_form_type_idx").on(table.formType),
  index("prospect_students_created_at_idx").on(table.createdAt),
  index("prospect_students_partner_id_idx").on(table.partnerId),
]);

// Password Reset Requests table (admin approval workflow)
export const passwordResetRequests = pgTable("password_reset_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: resetRequestStatusEnum("status").default("pending").notNull(),
  requestedAt: timestamp("requested_at").defaultNow(),
  handledAt: timestamp("handled_at"),
  handledBy: varchar("handled_by").references(() => users.id, { onDelete: "set null" }), // Admin who handled the request
  rejectionReason: text("rejection_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("password_reset_requests_user_id_idx").on(table.userId),
  index("password_reset_requests_status_idx").on(table.status),
]);

// User Activity Log table
export const activityLogs = pgTable("activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  action: text("action").notNull(),
  description: text("description").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("activity_logs_user_id_idx").on(table.userId),
  index("activity_logs_created_at_idx").on(table.createdAt),
  index("activity_logs_action_idx").on(table.action),
]);

// Refresh Tokens table for JWT authentication
export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  isRevoked: boolean("is_revoked").default(false).notNull(),
  deviceInfo: text("device_info"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("refresh_tokens_user_id_idx").on(table.userId),
  index("refresh_tokens_token_idx").on(table.token),
  index("refresh_tokens_expires_at_idx").on(table.expiresAt),
]);

// Curriculum Units table - Official curriculum units (admin-defined, read-only for teachers)
export const curriculumUnits = pgTable("curriculum_units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("curriculum_units_course_id_idx").on(table.courseId),
]);

// Curriculum Subsections table - Teacher-added subsections under official units
export const curriculumSubsections = pgTable("curriculum_subsections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").references(() => curriculumUnits.id, { onDelete: "cascade" }).notNull(),
  teacherId: varchar("teacher_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("curriculum_subsections_unit_id_idx").on(table.unitId),
  index("curriculum_subsections_teacher_id_idx").on(table.teacherId),
]);

// Course Progress table - Tracks student progress per curriculum unit
export const courseProgress = pgTable("course_progress", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  unitId: varchar("unit_id").references(() => curriculumUnits.id, { onDelete: "cascade" }).notNull(),
  isCompleted: boolean("is_completed").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  completedBy: varchar("completed_by").references(() => users.id, { onDelete: "set null" }), // Teacher who marked it complete
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("course_progress_course_id_idx").on(table.courseId),
  index("course_progress_student_id_idx").on(table.studentId),
  index("course_progress_unit_id_idx").on(table.unitId),
  unique().on(table.courseId, table.studentId, table.unitId),
]);

// Progress Milestones table - Tracks milestone notifications sent to avoid duplicates
export const progressMilestones = pgTable("progress_milestones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  courseId: varchar("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  milestone: integer("milestone").notNull(), // 25, 50, 75, 100
  notifiedAt: timestamp("notified_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("progress_milestones_course_student_idx").on(table.courseId, table.studentId),
  unique().on(table.courseId, table.studentId, table.milestone),
]);

// Google Calendar Sync Settings - User preferences for calendar integration (per-user OAuth)
export const googleCalendarSettings = pgTable("google_calendar_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  isEnabled: boolean("is_enabled").default(false).notNull(),
  calendarId: text("calendar_id").default("primary").notNull(),
  syncClasses: boolean("sync_classes").default(true).notNull(),
  syncReschedules: boolean("sync_reschedules").default(true).notNull(),
  syncCancellations: boolean("sync_cancellations").default(true).notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  googleEmail: text("google_email"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("google_calendar_settings_user_id_idx").on(table.userId),
]);

// Google Calendar Event Mapping - Maps platform schedules to Google Calendar events
export const googleCalendarEvents = pgTable("google_calendar_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scheduleId: varchar("schedule_id").references(() => schedules.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  googleEventId: text("google_event_id").notNull(),
  calendarId: text("calendar_id").notNull(),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  syncStatus: text("sync_status").default("synced").notNull(),
  syncError: text("sync_error"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("google_calendar_events_schedule_id_idx").on(table.scheduleId),
  index("google_calendar_events_user_id_idx").on(table.userId),
  unique().on(table.scheduleId, table.userId),
]);

// Assignment deadline reminder tracking (prevents duplicate emails)
export const assignmentDeadlineReminders = pgTable("assignment_deadline_reminders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assignmentId: varchar("assignment_id").references(() => assignments.id, { onDelete: "cascade" }).notNull(),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  parentId: varchar("parent_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  sentAt: timestamp("sent_at").defaultNow(),
}, (table) => [
  unique().on(table.assignmentId, table.studentId),
]);

// Insert schemas
export const insertPartnerSchema = createInsertSchema(partners).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCourseSchema = createInsertSchema(courses).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEnrollmentSchema = createInsertSchema(enrollments).omit({ id: true, enrolledAt: true });
export const insertEnrollmentRequestSchema = createInsertSchema(enrollmentRequests).omit({
  id: true,
  requestedAt: true,
  parentApprovedAt: true,
  adminApprovedAt: true,
  rejectedAt: true,
  createdAt: true,
  updatedAt: true
});
export type IndividualAssignmentMapping = typeof individualAssignmentMappings.$inferSelect;
export type InsertIndividualAssignmentMapping = z.infer<typeof insertIndividualAssignmentMappingSchema>;

export const insertIndividualAssignmentMappingSchema = createInsertSchema(individualAssignmentMappings).omit({ id: true, createdAt: true });

export const insertAssignmentSchema = createInsertSchema(assignments).omit({ id: true, createdAt: true, updatedAt: true }).extend({
  dueDate: z.union([z.string(), z.date()]).transform(val => {
    if (val === null || val === undefined || val === '') return null;
    return typeof val === 'string' ? new Date(val) : val;
  }).nullable().optional(),
});
export const insertAssignmentAttachmentSchema = createInsertSchema(assignmentAttachments).omit({ id: true, createdAt: true });
export const insertSubmissionSchema = createInsertSchema(submissions).omit({ id: true, submittedAt: true });
export const insertSubmissionAttachmentSchema = createInsertSchema(submissionAttachments).omit({ id: true, createdAt: true });
export const insertGradeSchema = createInsertSchema(grades).omit({ id: true, gradedAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, sentAt: true });
export const insertMessageAttachmentSchema = createInsertSchema(messageAttachments).omit({ id: true, createdAt: true });
export const insertAttendanceSchema = createInsertSchema(attendance).omit({ id: true });
export const insertParentChildSchema = createInsertSchema(parentChildren).omit({ id: true, createdAt: true });
export const insertStudentTeacherAssignmentSchema = createInsertSchema(studentTeacherAssignments).omit({ id: true, assignedAt: true }).extend({
  teacherId: z.string().nullable().optional(),
  assignedBy: z.string().nullable().optional(),
});
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAnnouncementRecipientSchema = createInsertSchema(announcementRecipients).omit({ id: true, createdAt: true });
export const insertCourseActivitySchema = createInsertSchema(courseActivities).omit({ id: true, createdAt: true });
export const insertCourseActivationRequestSchema = createInsertSchema(courseActivationRequests).omit({
  id: true,
  submittedAt: true,
  parentAuthorizedAt: true,
  adminVerifiedAt: true,
  rejectedAt: true,
  createdAt: true,
  updatedAt: true
});
export const insertPendingParentActivationSchema = createInsertSchema(pendingParentActivations).omit({
  id: true,
  createdAt: true
});
export const insertScheduleRecurrenceSchema = createInsertSchema(scheduleRecurrences).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScheduleSchema = createInsertSchema(schedules).omit({ id: true, createdAt: true, updatedAt: true });
export const insertScheduleRecurrenceExceptionSchema = createInsertSchema(scheduleRecurrenceExceptions).omit({ id: true, createdAt: true });
export const insertCourseResourceSchema = createInsertSchema(courseResources).omit({ id: true, createdAt: true, updatedAt: true });
export const insertResourceStudentMappingSchema = createInsertSchema(resourceStudentMappings).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertSubjectSchema = createInsertSchema(subjects).omit({ id: true, createdAt: true, updatedAt: true });

// Discount type enum
export const discountTypeEnum = pgEnum("discount_type", ["percentage", "fixed_amount"]);

// Discounts table (define reusable discounts)
export const discounts = pgTable("discounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  type: discountTypeEnum("type").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Student Discounts (assign discounts to students)
export const studentDiscounts = pgTable("student_discounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  studentId: varchar("student_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  discountId: varchar("discount_id").references(() => discounts.id, { onDelete: "restrict" }).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("student_discounts_student_id_idx").on(table.studentId),
  index("student_discounts_discount_id_idx").on(table.discountId),
]);

// State Fee Structures (state-wise fee adjustments)
export const stateFeeStructures = pgTable("state_fee_structures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  feePlanId: varchar("fee_plan_id").references(() => feePlans.id, { onDelete: "cascade" }).notNull(),
  stateCode: varchar("state_code", { length: 10 }).notNull(),
  stateName: text("state_name").notNull(),
  adjustmentType: discountTypeEnum("adjustment_type").notNull(),
  adjustmentValue: decimal("adjustment_value", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique().on(table.feePlanId, table.stateCode),
  index("state_fee_structures_fee_plan_idx").on(table.feePlanId),
]);

// Fee Management insert schemas
export const insertDiscountSchema = createInsertSchema(discounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStudentDiscountSchema = createInsertSchema(studentDiscounts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStateFeeStructureSchema = createInsertSchema(stateFeeStructures).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFeePlanSchema = createInsertSchema(feePlans).omit({ id: true, createdAt: true, updatedAt: true });
export const insertStudentFeeAssignmentSchema = createInsertSchema(studentFeeAssignments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceGenerationLogSchema = createInsertSchema(invoiceGenerationLog).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true, updatedAt: true });
export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true, createdAt: true });
export const insertInvoiceSessionSchema = createInsertSchema(invoiceSessions).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true, parentId: true });
export const insertPasswordResetRequestSchema = createInsertSchema(passwordResetRequests).omit({ id: true, requestedAt: true, handledAt: true, createdAt: true, updatedAt: true });
export const insertProspectStudentSchema = createInsertSchema(prospectStudents).omit({ id: true, createdAt: true, updatedAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });

// Curriculum insert schemas
export const insertCurriculumUnitSchema = createInsertSchema(curriculumUnits).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCurriculumSubsectionSchema = createInsertSchema(curriculumSubsections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCourseProgressSchema = createInsertSchema(courseProgress).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProgressMilestoneSchema = createInsertSchema(progressMilestones).omit({ id: true, createdAt: true, notifiedAt: true });

// Google Calendar insert schemas
export const insertGoogleCalendarSettingsSchema = createInsertSchema(googleCalendarSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertGoogleCalendarEventSchema = createInsertSchema(googleCalendarEvents).omit({ id: true, createdAt: true, updatedAt: true, lastSyncedAt: true });

// Types
export type InsertPartner = z.infer<typeof insertPartnerSchema>;
export type Partner = typeof partners.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert; // Required for Replit Auth
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;
export type InsertEnrollment = z.infer<typeof insertEnrollmentSchema>;
export type Enrollment = typeof enrollments.$inferSelect;
export type InsertEnrollmentRequest = z.infer<typeof insertEnrollmentRequestSchema>;
export type EnrollmentRequest = typeof enrollmentRequests.$inferSelect;
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignments.$inferSelect;
export type AssignmentWithStats = Assignment & {
  stats: {
    totalSubmissions: number;
    gradedCount: number;
    ungradedCount: number;
  };
};
export type InsertAssignmentAttachment = z.infer<typeof insertAssignmentAttachmentSchema>;
export type AssignmentAttachment = typeof assignmentAttachments.$inferSelect;
export type InsertSubmission = z.infer<typeof insertSubmissionSchema>;
export type Submission = typeof submissions.$inferSelect;
export type InsertSubmissionAttachment = z.infer<typeof insertSubmissionAttachmentSchema>;
export type SubmissionAttachment = typeof submissionAttachments.$inferSelect;
export type InsertGrade = z.infer<typeof insertGradeSchema>;
export type Grade = typeof grades.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessageAttachment = z.infer<typeof insertMessageAttachmentSchema>;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendance.$inferSelect;
export type InsertParentChild = z.infer<typeof insertParentChildSchema>;
export type ParentChild = typeof parentChildren.$inferSelect;
export type InsertStudentTeacherAssignment = z.infer<typeof insertStudentTeacherAssignmentSchema>;
export type StudentTeacherAssignment = typeof studentTeacherAssignments.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncementRecipient = z.infer<typeof insertAnnouncementRecipientSchema>;
export type AnnouncementRecipient = typeof announcementRecipients.$inferSelect;

// Extended announcement type with author and recipients
export type AnnouncementWithDetails = Announcement & {
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  };
  course?: {
    id: string;
    title: string;
  } | null;
  recipients?: AnnouncementRecipient[];
};
export type InsertCourseActivity = z.infer<typeof insertCourseActivitySchema>;
export type CourseActivity = typeof courseActivities.$inferSelect;
export type InsertCourseActivationRequest = z.infer<typeof insertCourseActivationRequestSchema>;
export type CourseActivationRequest = typeof courseActivationRequests.$inferSelect;
export type InsertPendingParentActivation = z.infer<typeof insertPendingParentActivationSchema>;
export type PendingParentActivation = typeof pendingParentActivations.$inferSelect;
export type InsertScheduleRecurrence = z.infer<typeof insertScheduleRecurrenceSchema>;
export type ScheduleRecurrence = typeof scheduleRecurrences.$inferSelect;
export type InsertSchedule = z.infer<typeof insertScheduleSchema>;
export type Schedule = typeof schedules.$inferSelect;
export type InsertScheduleRecurrenceException = z.infer<typeof insertScheduleRecurrenceExceptionSchema>;
export type ScheduleRecurrenceException = typeof scheduleRecurrenceExceptions.$inferSelect;
export type InsertCourseResource = z.infer<typeof insertCourseResourceSchema>;
export type CourseResource = typeof courseResources.$inferSelect;
export type InsertResourceStudentMapping = z.infer<typeof insertResourceStudentMappingSchema>;
export type ResourceStudentMapping = typeof resourceStudentMappings.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertSubject = z.infer<typeof insertSubjectSchema>;
export type Subject = typeof subjects.$inferSelect;

// Fee Management types
export type InsertDiscount = z.infer<typeof insertDiscountSchema>;
export type Discount = typeof discounts.$inferSelect;
export type InsertStudentDiscount = z.infer<typeof insertStudentDiscountSchema>;
export type StudentDiscount = typeof studentDiscounts.$inferSelect;
export type InsertStateFeeStructure = z.infer<typeof insertStateFeeStructureSchema>;
export type StateFeeStructure = typeof stateFeeStructures.$inferSelect;
export type InsertFeePlan = z.infer<typeof insertFeePlanSchema>;
export type FeePlan = typeof feePlans.$inferSelect;
export type InsertStudentFeeAssignment = z.infer<typeof insertStudentFeeAssignmentSchema>;
export type StudentFeeAssignment = typeof studentFeeAssignments.$inferSelect;
export type InsertInvoiceGenerationLog = z.infer<typeof insertInvoiceGenerationLogSchema>;
export type InvoiceGenerationLog = typeof invoiceGenerationLog.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceSession = z.infer<typeof insertInvoiceSessionSchema>;
export type InvoiceSession = typeof invoiceSessions.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPasswordResetRequest = z.infer<typeof insertPasswordResetRequestSchema>;
export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;
export type InsertProspectStudent = z.infer<typeof insertProspectStudentSchema>;
export type ProspectStudent = typeof prospectStudents.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

// Curriculum types
export type InsertCurriculumUnit = z.infer<typeof insertCurriculumUnitSchema>;
export type CurriculumUnit = typeof curriculumUnits.$inferSelect;
export type InsertCurriculumSubsection = z.infer<typeof insertCurriculumSubsectionSchema>;
export type CurriculumSubsection = typeof curriculumSubsections.$inferSelect;
export type InsertCourseProgress = z.infer<typeof insertCourseProgressSchema>;
export type CourseProgress = typeof courseProgress.$inferSelect;
export type InsertProgressMilestone = z.infer<typeof insertProgressMilestoneSchema>;
export type ProgressMilestone = typeof progressMilestones.$inferSelect;

// User Documents table
export const userDocuments = pgTable("user_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  description: text("description"),
  url: text("url").notNull(),
  type: text("type"), // MIME type
  size: integer("size"), // in bytes
  isVisible: boolean("is_visible").default(true).notNull(), // Whether document is visible to the user
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

// Google Calendar types
export const insertUserDocumentSchema = createInsertSchema(userDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserDocument = z.infer<typeof insertUserDocumentSchema>;
export type UserDocument = typeof userDocuments.$inferSelect;

// Google Calendar types
export type InsertGoogleCalendarSettings = z.infer<typeof insertGoogleCalendarSettingsSchema>;
export type GoogleCalendarSettings = typeof googleCalendarSettings.$inferSelect;
export type InsertGoogleCalendarEvent = z.infer<typeof insertGoogleCalendarEventSchema>;
export type GoogleCalendarEvent = typeof googleCalendarEvents.$inferSelect;

// Extended curriculum types
export type CurriculumUnitWithSubsections = CurriculumUnit & {
  subsections: CurriculumSubsection[];
  isCompleted?: boolean;
  completedAt?: Date | null;
};

export type CourseProgressSummary = {
  courseId: string;
  studentId: string;
  totalUnits: number;
  completedUnits: number;
  progressPercentage: number;
  units: CurriculumUnitWithSubsections[];
};

// Refresh Tokens schemas and types
export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({
  id: true,
  createdAt: true,
});
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;

// Schedule Substitutions schemas and types
export const insertScheduleSubstitutionSchema = createInsertSchema(scheduleSubstitutions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertScheduleSubstitution = z.infer<typeof insertScheduleSubstitutionSchema>;
export type ScheduleSubstitution = typeof scheduleSubstitutions.$inferSelect;

// Teacher Class Counts schemas and types
export const insertTeacherClassCountSchema = createInsertSchema(teacherClassCounts).omit({
  id: true,
  countedAt: true,
});
export type InsertTeacherClassCount = z.infer<typeof insertTeacherClassCountSchema>;
export type TeacherClassCount = typeof teacherClassCounts.$inferSelect;

// Reschedule Proposals schemas and types
export const insertRescheduleProposalSchema = createInsertSchema(rescheduleProposals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRescheduleProposal = z.infer<typeof insertRescheduleProposalSchema>;
export type RescheduleProposal = typeof rescheduleProposals.$inferSelect;

// Extended reschedule proposal type with relationships
export type RescheduleProposalWithRelations = RescheduleProposal & {
  proposer: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string;
  };
  recipient: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    role: string;
  };
  schedule: {
    id: string;
    title: string;
    startTime: Date;
    endTime: Date;
    courseId: string;
  };
};

// Teacher session stats type for analytics
export type TeacherSessionStats = {
  teacherId: string;
  teacherName: string;
  regularCount: number;
  substituteCount: number;
  totalCount: number;
  periodStart: Date;
  periodEnd: Date;
};

// Detailed class record for display
export type DetailedClassRecord = {
  id: string;
  teacherId: string;
  teacherName: string;
  courseId: string;
  courseName: string;
  scheduleTitle: string;
  sessionDate: Date;
  sessionTime: string;
  roleType: 'regular' | 'substitute';
};

// DMS (Document Management System) enums
export const dmsCategoryEnum = pgEnum("dms_category", ["course_documents", "study_materials", "academic_resources", "administrative_files", "social_post"]);

// DMS Folders table
export const dmsFolders = pgTable("dms_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  parentId: varchar("parent_id"),
  category: dmsCategoryEnum("category").notNull(),
  description: text("description"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

export const insertDmsFolderSchema = createInsertSchema(dmsFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDmsFolder = z.infer<typeof insertDmsFolderSchema>;
export type DmsFolder = typeof dmsFolders.$inferSelect;

// DMS Documents table
export const dmsDocuments = pgTable("dms_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  folderId: varchar("folder_id").references(() => dmsFolders.id, { onDelete: "cascade" }),
  category: dmsCategoryEnum("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  storagePath: text("storage_path").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type"),
  size: integer("size"),
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

export const insertDmsDocumentSchema = createInsertSchema(dmsDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDmsDocument = z.infer<typeof insertDmsDocumentSchema>;
export type DmsDocument = typeof dmsDocuments.$inferSelect;

// DMS Share Links table
export const dmsShareLinks = pgTable("dms_share_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").references(() => dmsDocuments.id, { onDelete: "cascade" }).notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  maxDownloads: integer("max_downloads"),
  downloadCount: integer("download_count").default(0).notNull(),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "restrict" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDmsShareLinkSchema = createInsertSchema(dmsShareLinks).omit({
  id: true,
  downloadCount: true,
  createdAt: true,
});
export type InsertDmsShareLink = z.infer<typeof insertDmsShareLinkSchema>;
export type DmsShareLink = typeof dmsShareLinks.$inferSelect;

// DMS Document with uploader info
export type DmsDocumentWithUploader = DmsDocument & {
  uploaderName: string;
};

// DMS Folder with document count
export type DmsFolderWithCount = DmsFolder & {
  documentCount: number;
};

// Extended types with relationships
export type SubmissionWithRelations = Submission & {
  attachments?: SubmissionAttachment[];
  grade?: Grade | null;
};

export type AssignmentWithRelations = Assignment & {
  attachments?: AssignmentAttachment[];
};

export type SubmissionForGrading = Submission & {
  student: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    avatarUrl: string | null;
  };
  attachments: SubmissionAttachment[];
  grade: (Grade & {
    grader: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
    } | null;
  }) | null;
  assignment: {
    dueDate: Date | null;
  };
};
