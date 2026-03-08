import { randomUUID } from "crypto";
import { DbStorage } from "./db-storage";
import {
  type User, type InsertUser, type UpsertUser,
  type Course, type InsertCourse,
  type Enrollment, type InsertEnrollment,
  type EnrollmentRequest, type InsertEnrollmentRequest,
  type CourseActivationRequest, type InsertCourseActivationRequest,
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
  type CourseActivity, type InsertCourseActivity,
  type PendingParentActivation, type InsertPendingParentActivation,
  type Schedule, type InsertSchedule,
  type ScheduleRecurrence, type InsertScheduleRecurrence,
  type ScheduleRecurrenceException, type InsertScheduleRecurrenceException,
  type CourseResource, type InsertCourseResource,
  type ResourceStudentMapping, type InsertResourceStudentMapping,
  type Notification, type InsertNotification,
  type Subject, type InsertSubject,
  type StudentTeacherAssignment, type InsertStudentTeacherAssignment,
  type FeePlan, type InsertFeePlan,
  type StudentFeeAssignment, type InsertStudentFeeAssignment,
  type InvoiceGenerationLog, type InsertInvoiceGenerationLog,
  type Invoice, type InsertInvoice,
  type InvoiceItem, type InsertInvoiceItem,
  type InvoiceSession, type InsertInvoiceSession,
  type Payment, type InsertPayment,
  type PasswordResetRequest, type InsertPasswordResetRequest,
  type ProspectStudent, type InsertProspectStudent,
  type ActivityLog, type InsertActivityLog,
  type IndividualAssignmentMapping, type InsertIndividualAssignmentMapping,
  type ScheduleSubstitution, type InsertScheduleSubstitution,
  type TeacherClassCount, type InsertTeacherClassCount,
  type TeacherSessionStats,
  type DetailedClassRecord,
  type RescheduleProposal, type InsertRescheduleProposal,
  type RescheduleProposalWithRelations,
  type GoogleCalendarSettings, type InsertGoogleCalendarSettings,
  type GoogleCalendarEvent, type InsertGoogleCalendarEvent,
  type UserDocument, type InsertUserDocument,
  type Discount, type InsertDiscount,
  type StudentDiscount, type InsertStudentDiscount,
  type StateFeeStructure, type InsertStateFeeStructure,
  type RefreshToken, type InsertRefreshToken,
  type Partner, type InsertPartner,
  type DmsFolder, type InsertDmsFolder,
  type DmsDocument, type InsertDmsDocument,
  type DmsShareLink, type InsertDmsShareLink,
  type DmsDocumentWithUploader,
  type DmsFolderWithCount,
} from "@shared/schema";

export interface IStorage {
  // User operations (including Replit Auth required methods)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByResetToken(resetToken: string): Promise<User | undefined>;
  getUsersByRole(role: "student" | "parent" | "teacher" | "admin"): Promise<User[]>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>; // Required for Replit Auth
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Password Reset Request operations
  getPasswordResetRequest(id: string): Promise<PasswordResetRequest | undefined>;
  getPasswordResetRequestsByUser(userId: string): Promise<PasswordResetRequest[]>;
  getPasswordResetRequestsByStatus(status: "pending" | "approved" | "rejected"): Promise<PasswordResetRequest[]>;
  getAllPasswordResetRequests(): Promise<PasswordResetRequest[]>;
  createPasswordResetRequest(request: InsertPasswordResetRequest): Promise<PasswordResetRequest>;
  updatePasswordResetRequest(id: string, updates: Partial<InsertPasswordResetRequest>): Promise<PasswordResetRequest | undefined>;
  deletePasswordResetRequest(id: string): Promise<boolean>;

  // Course operations
  getCourse(id: string): Promise<Course | undefined>;
  getCoursesByTeacher(teacherId: string): Promise<Course[]>;
  getAllCourses(): Promise<Course[]>;
  createCourse(course: InsertCourse): Promise<Course>;
  updateCourse(id: string, updates: Partial<InsertCourse>): Promise<Course | undefined>;
  deleteCourse(id: string): Promise<boolean>;

  // Enrollment operations
  getEnrollment(id: string): Promise<Enrollment | undefined>;
  getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]>;
  getEnrollmentsByCourse(courseId: string): Promise<Enrollment[]>;
  getAllEnrollments(): Promise<Enrollment[]>;
  createEnrollment(enrollment: InsertEnrollment): Promise<Enrollment>;
  updateEnrollment(id: string, updates: Partial<InsertEnrollment>): Promise<Enrollment | undefined>;
  deleteEnrollment(id: string): Promise<boolean>;

  // Enrollment Request operations
  getEnrollmentRequest(id: string): Promise<EnrollmentRequest | undefined>;
  getEnrollmentRequestsByStudent(studentId: string): Promise<EnrollmentRequest[]>;
  getEnrollmentRequestsByParent(parentId: string): Promise<EnrollmentRequest[]>;
  getEnrollmentRequestsByStatus(status: "requested" | "parent_approved" | "admin_approved" | "enrolled" | "rejected"): Promise<EnrollmentRequest[]>;
  getAllEnrollmentRequests(): Promise<EnrollmentRequest[]>;
  createEnrollmentRequest(request: InsertEnrollmentRequest): Promise<EnrollmentRequest>;
  updateEnrollmentRequest(id: string, updates: Partial<InsertEnrollmentRequest>): Promise<EnrollmentRequest | undefined>;
  deleteEnrollmentRequest(id: string): Promise<boolean>;

  // Course Activation Request operations
  getCourseActivationRequest(id: string): Promise<CourseActivationRequest | undefined>;
  getCourseActivationRequestByCourse(courseId: string): Promise<CourseActivationRequest | undefined>;
  getCourseActivationRequestsByTeacher(teacherId: string): Promise<CourseActivationRequest[]>;
  getCourseActivationRequestsByParent(parentId: string): Promise<CourseActivationRequest[]>;
  getCourseActivationRequestsByStatus(status: "draft" | "pending_parent" | "parent_authorized" | "pending_admin" | "active" | "rejected"): Promise<CourseActivationRequest[]>;
  getAllCourseActivationRequests(): Promise<CourseActivationRequest[]>;
  createCourseActivationRequest(request: InsertCourseActivationRequest): Promise<CourseActivationRequest>;
  updateCourseActivationRequest(id: string, updates: Partial<InsertCourseActivationRequest>): Promise<CourseActivationRequest | undefined>;
  deleteCourseActivationRequest(id: string): Promise<boolean>;
  
  // Course activation workflow helper methods
  submitCourseForActivation(courseId: string, childId: string): Promise<CourseActivationRequest>;
  authorizeCourseActivation(requestId: string, parentId: string, notes?: string): Promise<CourseActivationRequest>;
  verifyCourseActivation(requestId: string, adminId: string, notes?: string): Promise<CourseActivationRequest>;
  rejectCourseActivation(requestId: string, rejectionReason: string, rejectedBy: string): Promise<CourseActivationRequest>;

  // Assignment operations
  getAssignment(id: string): Promise<Assignment | undefined>;
  getAssignmentsByCourse(courseId: string): Promise<Assignment[]>;
  getPublishedAssignmentsByCourse(courseId: string): Promise<Assignment[]>;
  getTeacherAssignments(teacherId: string): Promise<Assignment[]>;
  getPublishedTeacherAssignments(teacherId: string): Promise<Assignment[]>;
  getAllAssignments(): Promise<Assignment[]>;
  getTeacherAssignmentStats(teacherId: string): Promise<Record<string, { totalSubmissions: number; gradedCount: number; ungradedCount: number }>>;
  getCourseAssignmentStats(courseId: string): Promise<Record<string, { totalSubmissions: number; gradedCount: number; ungradedCount: number }>>;
  createAssignment(assignment: InsertAssignment): Promise<Assignment>;
  updateAssignment(id: string, updates: Partial<InsertAssignment>): Promise<Assignment | undefined>;
  deleteAssignment(id: string): Promise<boolean>;

  // Individual Assignment Mapping operations
  getIndividualAssignmentMapping(id: string): Promise<IndividualAssignmentMapping | undefined>;
  getIndividualAssignmentMappingsByAssignment(assignmentId: string): Promise<IndividualAssignmentMapping[]>;
  getIndividualAssignmentMappingsByStudent(studentId: string): Promise<IndividualAssignmentMapping[]>;
  createIndividualAssignmentMapping(mapping: InsertIndividualAssignmentMapping): Promise<IndividualAssignmentMapping>;
  deleteIndividualAssignmentMapping(id: string): Promise<boolean>;
  deleteIndividualAssignmentMappingsByAssignment(assignmentId: string): Promise<boolean>;
  getAssignmentsForStudent(studentId: string, courseId: string): Promise<Assignment[]>;

  // Assignment attachment operations
  getAssignmentAttachment(id: string): Promise<AssignmentAttachment | undefined>;
  getAssignmentAttachmentsByAssignment(assignmentId: string): Promise<AssignmentAttachment[]>;
  createAssignmentAttachment(attachment: InsertAssignmentAttachment): Promise<AssignmentAttachment>;
  deleteAssignmentAttachment(id: string): Promise<boolean>;

  // Submission operations
  getSubmission(id: string): Promise<Submission | undefined>;
  getSubmissionsByAssignment(assignmentId: string): Promise<Submission[]>;
  getSubmissionsByStudent(studentId: string): Promise<Submission[]>;
  getSubmissionsForGrading(assignmentId: string): Promise<SubmissionForGrading[]>;
  getSubmissionWithDetails(assignmentId: string, studentId: string): Promise<SubmissionWithRelations | undefined>;
  getAllSubmissions(): Promise<Submission[]>;
  getAllSubmissionsWithGrades(): Promise<Array<Submission & { grade: number | null; feedback: string | null; gradedAt: Date | null; gradedBy: string | null }>>;
  createSubmission(submission: InsertSubmission): Promise<Submission>;
  updateSubmission(id: string, updates: Partial<InsertSubmission>): Promise<Submission | undefined>;
  deleteSubmission(id: string): Promise<boolean>;

  // Submission attachment operations
  getSubmissionAttachment(id: string): Promise<SubmissionAttachment | undefined>;
  getSubmissionAttachmentsBySubmission(submissionId: string): Promise<SubmissionAttachment[]>;
  createSubmissionAttachment(attachment: InsertSubmissionAttachment): Promise<SubmissionAttachment>;
  deleteSubmissionAttachment(id: string): Promise<boolean>;

  // Grade operations
  getGrade(id: string): Promise<Grade | undefined>;
  getGradeBySubmission(submissionId: string): Promise<Grade | undefined>;
  getGradesByStudent(studentId: string): Promise<Grade[]>;
  getGradesByCourse(courseId: string): Promise<Grade[]>;
  getAllGrades(): Promise<Grade[]>;
  createGrade(grade: InsertGrade): Promise<Grade>;
  updateGrade(id: string, updates: Partial<InsertGrade>): Promise<Grade | undefined>;
  deleteGrade(id: string): Promise<boolean>;

  // Message operations
  getMessage(id: string): Promise<Message | undefined>;
  getMessagesByRecipient(recipientId: string): Promise<Message[]>;
  getMessagesBySender(senderId: string): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
  updateMessage(id: string, updates: Partial<InsertMessage>): Promise<Message | undefined>;
  markMessageAsRead(id: string): Promise<boolean>;
  deleteMessage(id: string): Promise<boolean>;

  // Message Attachment operations
  getMessageAttachments(messageId: string): Promise<MessageAttachment[]>;
  getMessageAttachment(id: string): Promise<MessageAttachment | undefined>;
  createMessageAttachment(attachment: InsertMessageAttachment): Promise<MessageAttachment>;
  deleteMessageAttachment(id: string): Promise<boolean>;

  // Attendance operations
  getAttendance(id: string): Promise<Attendance | undefined>;
  getAttendanceByStudent(studentId: string, courseId?: string): Promise<Attendance[]>;
  getAttendanceByCourse(courseId: string, date?: string): Promise<Attendance[]>;
  createAttendance(attendance: InsertAttendance): Promise<Attendance>;
  updateAttendance(id: string, updates: Partial<InsertAttendance>): Promise<Attendance | undefined>;
  deleteAttendance(id: string): Promise<boolean>;

  // Assignment deadline reminder operations
  hasDeadlineReminderBeenSent(assignmentId: string, studentId: string): Promise<boolean>;
  createDeadlineReminder(assignmentId: string, studentId: string, parentId: string): Promise<void>;

  // Parent-Child relationship operations
  getParentChild(id: string): Promise<ParentChild | undefined>;
  getChildrenByParent(parentId: string): Promise<ParentChild[]>;
  getParentsByChild(childId: string): Promise<ParentChild[]>;
  getAllParentChildren(): Promise<ParentChild[]>;
  createParentChild(relationship: InsertParentChild): Promise<ParentChild>;
  updateParentChild(id: string, updates: Partial<InsertParentChild>): Promise<ParentChild | undefined>;
  deleteParentChild(id: string): Promise<boolean>;

  // Announcement operations
  getAnnouncement(id: string): Promise<Announcement | undefined>;
  getAnnouncementsByCourse(courseId: string): Promise<Announcement[]>;
  getGlobalAnnouncements(): Promise<Announcement[]>;
  getAllAnnouncements(): Promise<Announcement[]>;
  getAnnouncementsByAuthor(authorId: string): Promise<Announcement[]>;
  createAnnouncement(announcement: InsertAnnouncement): Promise<Announcement>;
  updateAnnouncement(id: string, updates: Partial<InsertAnnouncement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: string): Promise<boolean>;
  getAnnouncementWithDetails(id: string): Promise<AnnouncementWithDetails | undefined>;
  getAnnouncementsForStudent(studentId: string): Promise<AnnouncementWithDetails[]>;
  getAnnouncementsForParent(parentId: string): Promise<AnnouncementWithDetails[]>;
  getUnreadAnnouncementsForStudent(studentId: string): Promise<AnnouncementWithDetails[]>;
  getUnreadAnnouncementsForParent(parentId: string): Promise<AnnouncementWithDetails[]>;

  // Announcement Recipient operations
  getAnnouncementRecipient(id: string): Promise<AnnouncementRecipient | undefined>;
  getAnnouncementRecipientsByAnnouncement(announcementId: string): Promise<AnnouncementRecipient[]>;
  getAnnouncementRecipientByAnnouncementAndStudent(announcementId: string, studentId: string): Promise<AnnouncementRecipient | undefined>;
  createAnnouncementRecipient(recipient: InsertAnnouncementRecipient): Promise<AnnouncementRecipient>;
  createAnnouncementRecipients(recipients: InsertAnnouncementRecipient[]): Promise<AnnouncementRecipient[]>;
  markAnnouncementReadByStudent(announcementId: string, studentId: string): Promise<boolean>;
  markAnnouncementReadByParent(announcementId: string, parentId: string): Promise<boolean>;
  markAnnouncementAcknowledgedByStudent(announcementId: string, studentId: string): Promise<boolean>;
  markAnnouncementAcknowledgedByParent(announcementId: string, parentId: string): Promise<boolean>;
  deleteAnnouncementRecipient(id: string): Promise<boolean>;

  // Course Activity operations
  getCourseActivity(id: string): Promise<CourseActivity | undefined>;
  getCourseActivitiesByStudent(courseId: string, studentId: string): Promise<CourseActivity[]>;
  createCourseActivity(activity: InsertCourseActivity): Promise<CourseActivity>;
  deleteCourseActivity(id: string): Promise<boolean>;

  // Pending parent activation operations
  createPendingParentActivation(data: InsertPendingParentActivation): Promise<PendingParentActivation>;
  getPendingParentActivationByToken(token: string): Promise<PendingParentActivation | undefined>;
  deletePendingParentActivation(id: string): Promise<boolean>;

  // Schedule Recurrence operations
  getScheduleRecurrence(id: string): Promise<ScheduleRecurrence | undefined>;
  getScheduleRecurrencesByCourse(courseId: string): Promise<ScheduleRecurrence[]>;
  getAllScheduleRecurrences(): Promise<ScheduleRecurrence[]>;
  getActiveScheduleRecurrences(): Promise<ScheduleRecurrence[]>;
  createScheduleRecurrence(recurrence: InsertScheduleRecurrence): Promise<ScheduleRecurrence>;
  updateScheduleRecurrence(id: string, updates: Partial<InsertScheduleRecurrence>): Promise<ScheduleRecurrence | undefined>;
  deleteScheduleRecurrence(id: string): Promise<boolean>;
  
  // Schedule operations
  getSchedule(id: string): Promise<Schedule | undefined>;
  getSchedulesByCourse(courseId: string): Promise<Schedule[]>;
  getSchedulesByTeacher(teacherId: string): Promise<Schedule[]>;
  getSchedulesByDateRange(startDate: Date, endDate: Date): Promise<Schedule[]>;
  getSchedulesByRecurrence(recurrenceId: string): Promise<Schedule[]>;
  getAllSchedules(): Promise<Schedule[]>;
  createSchedule(schedule: InsertSchedule): Promise<Schedule>;
  createSchedulesFromRecurrence(recurrenceId: string, occurrences: Array<{startTime: Date; endTime: Date; occurrenceIndex: number}>): Promise<Schedule[]>;
  updateSchedule(id: string, updates: Partial<InsertSchedule>): Promise<Schedule | undefined>;
  deleteSchedule(id: string): Promise<boolean>;
  deleteSchedulesByRecurrence(recurrenceId: string): Promise<number>;
  updateSchedulesByRecurrence(recurrenceId: string, updates: Partial<InsertSchedule>): Promise<number>;
  
  // Schedule Recurrence Exception operations
  getScheduleRecurrenceException(id: string): Promise<ScheduleRecurrenceException | undefined>;
  getExceptionsByRecurrence(recurrenceId: string): Promise<ScheduleRecurrenceException[]>;
  createScheduleRecurrenceException(exception: InsertScheduleRecurrenceException): Promise<ScheduleRecurrenceException>;
  deleteScheduleRecurrenceException(id: string): Promise<boolean>;

  // Schedule Substitution operations
  getScheduleSubstitution(id: string): Promise<ScheduleSubstitution | undefined>;
  getSubstitutionBySchedule(scheduleId: string): Promise<ScheduleSubstitution | undefined>;
  getSubstitutionsByTeacher(teacherId: string): Promise<ScheduleSubstitution[]>;
  createScheduleSubstitution(substitution: InsertScheduleSubstitution): Promise<ScheduleSubstitution>;
  updateScheduleSubstitution(id: string, updates: Partial<InsertScheduleSubstitution>): Promise<ScheduleSubstitution | undefined>;
  deleteScheduleSubstitution(id: string): Promise<boolean>;

  // Teacher Class Count operations
  getTeacherClassCount(id: string): Promise<TeacherClassCount | undefined>;
  getClassCountsByTeacher(teacherId: string, startDate?: Date, endDate?: Date): Promise<TeacherClassCount[]>;
  getClassCountsBySchedule(scheduleId: string): Promise<TeacherClassCount[]>;
  createTeacherClassCount(count: InsertTeacherClassCount): Promise<TeacherClassCount>;
  getTeacherSessionStats(teacherId: string, startDate: Date, endDate: Date): Promise<TeacherSessionStats>;
  getAllTeacherSessionStats(startDate: Date, endDate: Date): Promise<TeacherSessionStats[]>;
  getDetailedClassRecords(startDate: Date, endDate: Date, teacherId?: string): Promise<DetailedClassRecord[]>;
  syncTeacherSessionsFromSchedules(startDate?: Date, endDate?: Date): Promise<{ synced: number; scheduleIds: string[] }>;

  // Course Resource operations
  getCourseResource(id: string): Promise<CourseResource | undefined>;
  getCourseResourcesByCourse(courseId: string): Promise<CourseResource[]>;
  createCourseResource(resource: InsertCourseResource): Promise<CourseResource>;
  updateCourseResource(id: string, updates: Partial<InsertCourseResource>): Promise<CourseResource | undefined>;
  deleteCourseResource(id: string): Promise<boolean>;
  
  // Resource Student Mapping operations
  createResourceStudentMapping(mapping: InsertResourceStudentMapping): Promise<ResourceStudentMapping>;
  getResourceStudentMappings(resourceId: string): Promise<ResourceStudentMapping[]>;
  getStudentResourceMappings(studentId: string): Promise<ResourceStudentMapping[]>;

  // Notification operations
  getUserNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // Subject operations
  getSubject(id: string): Promise<Subject | undefined>;
  getSubjectByName(name: string): Promise<Subject | undefined>;
  getAllSubjects(): Promise<Subject[]>;
  createSubject(subject: InsertSubject): Promise<Subject>;
  updateSubject(id: string, updates: Partial<InsertSubject>): Promise<Subject | undefined>;
  deleteSubject(id: string): Promise<boolean>;

  // Student-Teacher Assignment operations
  getStudentTeacherAssignment(id: string): Promise<StudentTeacherAssignment | undefined>;
  getAssignmentByStudentAndCourse(studentId: string, courseId: string): Promise<StudentTeacherAssignment | undefined>;
  getAssignmentsByStudent(studentId: string): Promise<StudentTeacherAssignment[]>;
  getAssignmentsByTeacher(teacherId: string): Promise<StudentTeacherAssignment[]>;
  getStudentTeacherAssignmentsByCourse(courseId: string): Promise<StudentTeacherAssignment[]>;
  getAllStudentTeacherAssignments(): Promise<StudentTeacherAssignment[]>;
  createStudentTeacherAssignment(assignment: InsertStudentTeacherAssignment): Promise<StudentTeacherAssignment>;
  updateStudentTeacherAssignment(id: string, updates: Partial<InsertStudentTeacherAssignment>): Promise<StudentTeacherAssignment | undefined>;
  deleteStudentTeacherAssignment(id: string): Promise<boolean>;
  
  // Teacher authorization helper
  // Check if a teacher has access to a course (either as default teacher or through student-teacher assignments)
  // Note: This should only be called for teacher-role users; admins should be checked separately
  teacherHasCourseAccess(teacherId: string, courseId: string): Promise<boolean>;

  // Fee Management operations
  // Fee Plan operations
  getFeePlan(id: string): Promise<FeePlan | undefined>;
  getAllFeePlans(): Promise<FeePlan[]>;
  getActiveFeePlans(): Promise<FeePlan[]>;
  createFeePlan(feePlan: InsertFeePlan): Promise<FeePlan>;
  updateFeePlan(id: string, updates: Partial<InsertFeePlan>): Promise<FeePlan | undefined>;
  deleteFeePlan(id: string): Promise<boolean>;

  // Student Fee Assignment operations
  getStudentFeeAssignment(id: string): Promise<StudentFeeAssignment | undefined>;
  getStudentFeeAssignmentByStudent(studentId: string): Promise<StudentFeeAssignment | undefined>;
  getActiveStudentFeeAssignments(): Promise<StudentFeeAssignment[]>;
  getAllStudentFeeAssignments(): Promise<StudentFeeAssignment[]>;
  createStudentFeeAssignment(assignment: InsertStudentFeeAssignment): Promise<StudentFeeAssignment>;
  updateStudentFeeAssignment(id: string, updates: Partial<InsertStudentFeeAssignment>): Promise<StudentFeeAssignment | undefined>;
  deleteStudentFeeAssignment(id: string): Promise<boolean>;

  // Discount operations
  getDiscount(id: string): Promise<Discount | undefined>;
  getAllDiscounts(): Promise<Discount[]>;
  getActiveDiscounts(): Promise<Discount[]>;
  createDiscount(discount: InsertDiscount): Promise<Discount>;
  updateDiscount(id: string, updates: Partial<InsertDiscount>): Promise<Discount | undefined>;
  deleteDiscount(id: string): Promise<boolean>;

  // Student Discount operations
  getStudentDiscount(id: string): Promise<StudentDiscount | undefined>;
  getStudentDiscountsByStudent(studentId: string): Promise<StudentDiscount[]>;
  getActiveStudentDiscountsByStudent(studentId: string): Promise<StudentDiscount[]>;
  getAllStudentDiscounts(): Promise<StudentDiscount[]>;
  createStudentDiscount(studentDiscount: InsertStudentDiscount): Promise<StudentDiscount>;
  updateStudentDiscount(id: string, updates: Partial<InsertStudentDiscount>): Promise<StudentDiscount | undefined>;
  deleteStudentDiscount(id: string): Promise<boolean>;

  // State Fee Structure operations
  getStateFeeStructure(id: string): Promise<StateFeeStructure | undefined>;
  getStateFeeStructuresByFeePlan(feePlanId: string): Promise<StateFeeStructure[]>;
  getStateFeeStructureByStateCode(stateCode: string): Promise<StateFeeStructure | undefined>;
  getAllStateFeeStructures(): Promise<StateFeeStructure[]>;
  createStateFeeStructure(stateFee: InsertStateFeeStructure): Promise<StateFeeStructure>;
  updateStateFeeStructure(id: string, updates: Partial<InsertStateFeeStructure>): Promise<StateFeeStructure | undefined>;
  deleteStateFeeStructure(id: string): Promise<boolean>;

  // Invoice Generation Log operations (idempotency)
  getInvoiceGenerationLog(id: string): Promise<InvoiceGenerationLog | undefined>;
  getInvoiceGenerationLogByIdempotencyKey(key: string): Promise<InvoiceGenerationLog | undefined>;
  getInvoiceGenerationLogsByStatus(status: string): Promise<InvoiceGenerationLog[]>;
  createInvoiceGenerationLog(log: InsertInvoiceGenerationLog): Promise<InvoiceGenerationLog>;
  updateInvoiceGenerationLog(id: string, updates: Partial<InsertInvoiceGenerationLog>): Promise<InvoiceGenerationLog | undefined>;
  deleteInvoiceGenerationLog(id: string): Promise<boolean>;

  // Invoice operations
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined>;
  getInvoicesByStudent(studentId: string): Promise<Invoice[]>;
  getInvoicesByParent(parentId: string): Promise<Invoice[]>;
  getInvoicesByStatus(status: "draft" | "pending" | "paid" | "overdue" | "cancelled"): Promise<Invoice[]>;
  getOverdueInvoices(): Promise<Invoice[]>;
  getAllInvoices(): Promise<Invoice[]>;
  getAllInvoicesIncludingDeleted(): Promise<Invoice[]>;
  getExistingInvoiceForBillingPeriod(studentId: string, feePlanId: string, billingPeriodStart: string, billingPeriodEnd: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, updates: Partial<InsertInvoice>): Promise<Invoice | undefined>;
  softDeleteInvoice(id: string, deletedBy: string, reason?: string): Promise<Invoice | undefined>;
  createInvoiceCopy(originalInvoiceId: string): Promise<Invoice | undefined>;
  deleteInvoice(id: string): Promise<boolean>;

  // Invoice Item operations
  getInvoiceItem(id: string): Promise<InvoiceItem | undefined>;
  getInvoiceItemsByInvoice(invoiceId: string): Promise<InvoiceItem[]>;
  createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem>;
  deleteInvoiceItem(id: string): Promise<boolean>;

  // Invoice Session operations
  createInvoiceSession(session: InsertInvoiceSession): Promise<InvoiceSession>;
  createInvoiceSessions(sessions: InsertInvoiceSession[]): Promise<InvoiceSession[]>;
  getInvoiceSessionsByInvoice(invoiceId: string): Promise<InvoiceSession[]>;
  getInvoiceSessionsByStudent(studentId: string): Promise<InvoiceSession[]>;
  getInvoiceSessionBySchedule(scheduleId: string): Promise<InvoiceSession | undefined>;
  deleteInvoiceSessionsByInvoice(invoiceId: string): Promise<boolean>;

  // Payment operations
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentsByInvoice(invoiceId: string): Promise<Payment[]>;
  getPaymentsByParent(parentId: string): Promise<Payment[]>;
  getPaymentsByStatus(status: "pending" | "processing" | "completed" | "failed" | "refunded"): Promise<Payment[]>;
  getAllPayments(): Promise<Payment[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, updates: Partial<InsertPayment>): Promise<Payment | undefined>;
  deletePayment(id: string): Promise<boolean>;

  // Fee Management analytics
  getFinancialAnalytics(): Promise<{
    totalRevenue: number;
    pendingRevenue: number;
    overdueRevenue: number;
    monthlyRevenue: number;
    weeklyRevenue: number;
    totalInvoices: number;
    paidInvoices: number;
    pendingInvoices: number;
    overdueInvoices: number;
  }>;

  // Prospect Student operations
  getProspectStudent(id: string): Promise<ProspectStudent | undefined>;
  getAllProspectStudents(): Promise<ProspectStudent[]>;
  getProspectStudentsByStatus(status: "new" | "contacted" | "scheduled" | "converted" | "closed"): Promise<ProspectStudent[]>;
  getProspectStudentsByFormType(formType: "academics" | "computer" | "dance" | "arts"): Promise<ProspectStudent[]>;
  createProspectStudent(prospect: InsertProspectStudent): Promise<ProspectStudent>;
  updateProspectStudent(id: string, updates: Partial<InsertProspectStudent>): Promise<ProspectStudent | undefined>;
  deleteProspectStudent(id: string): Promise<boolean>;

  // Activity Log operations
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogsByUser(userId: string, limit?: number): Promise<ActivityLog[]>;

  // Reschedule Proposal operations
  getRescheduleProposal(id: string): Promise<RescheduleProposal | undefined>;
  getRescheduleProposalsBySchedule(scheduleId: string): Promise<RescheduleProposal[]>;
  getRescheduleProposalsByUser(userId: string): Promise<RescheduleProposal[]>;
  getPendingRescheduleProposalsForUser(userId: string): Promise<RescheduleProposal[]>;
  getRescheduleProposalWithRelations(id: string): Promise<RescheduleProposalWithRelations | undefined>;
  createRescheduleProposal(proposal: InsertRescheduleProposal): Promise<RescheduleProposal>;
  updateRescheduleProposal(id: string, updates: Partial<InsertRescheduleProposal>): Promise<RescheduleProposal | undefined>;
  deleteRescheduleProposal(id: string): Promise<boolean>;

  // Google Calendar Settings operations
  getGoogleCalendarSettings(userId: string): Promise<GoogleCalendarSettings | undefined>;
  createGoogleCalendarSettings(settings: InsertGoogleCalendarSettings): Promise<GoogleCalendarSettings>;
  updateGoogleCalendarSettings(userId: string, updates: Partial<InsertGoogleCalendarSettings>): Promise<GoogleCalendarSettings | undefined>;
  deleteGoogleCalendarSettings(userId: string): Promise<boolean>;

  // Google Calendar Event operations
  getGoogleCalendarEvent(scheduleId: string, userId: string): Promise<GoogleCalendarEvent | undefined>;
  getGoogleCalendarEventsByUser(userId: string): Promise<GoogleCalendarEvent[]>;
  getGoogleCalendarEventsBySchedule(scheduleId: string): Promise<GoogleCalendarEvent[]>;
  createGoogleCalendarEvent(event: InsertGoogleCalendarEvent): Promise<GoogleCalendarEvent>;
  updateGoogleCalendarEvent(id: string, updates: Partial<InsertGoogleCalendarEvent>): Promise<GoogleCalendarEvent | undefined>;
  deleteGoogleCalendarEvent(id: string): Promise<boolean>;
  deleteGoogleCalendarEventsBySchedule(scheduleId: string): Promise<number>;

  // User Document operations
  getUserDocuments(userId: string): Promise<UserDocument[]>;
  getUserDocument(id: string): Promise<UserDocument | undefined>;
  createUserDocument(doc: InsertUserDocument): Promise<UserDocument>;
  updateUserDocumentVisibility(id: string, isVisible: boolean): Promise<UserDocument | undefined>;
  deleteUserDocument(id: string): Promise<boolean>;

  // Refresh Token operations
  getRefreshToken(id: string): Promise<RefreshToken | undefined>;
  getRefreshTokenByToken(token: string): Promise<RefreshToken | undefined>;
  getRefreshTokensByUser(userId: string): Promise<RefreshToken[]>;
  createRefreshToken(refreshToken: InsertRefreshToken): Promise<RefreshToken>;
  revokeRefreshToken(id: string): Promise<boolean>;
  revokeAllUserRefreshTokens(userId: string): Promise<boolean>;
  deleteExpiredRefreshTokens(): Promise<number>;

  // Partner operations (Multi-partner SaaS)
  getPartner(id: string): Promise<Partner | undefined>;
  getAllPartners(): Promise<Partner[]>;
  getPartnersByStatus(status: "active" | "inactive"): Promise<Partner[]>;
  createPartner(partner: InsertPartner): Promise<Partner>;
  updatePartner(id: string, updates: Partial<InsertPartner>): Promise<Partner | undefined>;
  deletePartner(id: string): Promise<boolean>;
  
  // Partner-scoped user operations
  getUsersByPartner(partnerId: string): Promise<User[]>;
  assignUserToPartner(userId: string, partnerId: string | null): Promise<User | undefined>;
  
  // Partner-scoped prospect operations
  getProspectStudentsByPartner(partnerId: string): Promise<ProspectStudent[]>;
  assignProspectToPartner(prospectId: string, partnerId: string | null): Promise<ProspectStudent | undefined>;

  // DMS Folder operations
  getDmsFolder(id: string): Promise<DmsFolder | undefined>;
  getDmsFolders(parentId?: string | null, category?: string): Promise<DmsFolderWithCount[]>;
  createDmsFolder(folder: InsertDmsFolder): Promise<DmsFolder>;
  updateDmsFolder(id: string, updates: Partial<InsertDmsFolder>): Promise<DmsFolder | undefined>;
  deleteDmsFolder(id: string): Promise<boolean>;

  // DMS Document operations
  getDmsDocument(id: string): Promise<DmsDocument | undefined>;
  getDmsDocuments(filters: { folderId?: string | null; category?: string; search?: string }): Promise<DmsDocumentWithUploader[]>;
  createDmsDocument(doc: InsertDmsDocument): Promise<DmsDocument>;
  updateDmsDocument(id: string, updates: Partial<InsertDmsDocument>): Promise<DmsDocument | undefined>;
  deleteDmsDocument(id: string): Promise<boolean>;

  // DMS Share Link operations
  getDmsShareLink(id: string): Promise<DmsShareLink | undefined>;
  getDmsShareLinkByToken(token: string): Promise<DmsShareLink | undefined>;
  getDmsShareLinksByDocument(documentId: string): Promise<DmsShareLink[]>;
  createDmsShareLink(link: InsertDmsShareLink): Promise<DmsShareLink>;
  incrementDmsShareLinkDownloadCount(id: string): Promise<void>;
  deleteDmsShareLink(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private passwordResetRequests: Map<string, PasswordResetRequest>;
  private courses: Map<string, Course>;
  private enrollments: Map<string, Enrollment>;
  private enrollmentRequests: Map<string, EnrollmentRequest>;
  private courseActivationRequests: Map<string, CourseActivationRequest>;
  private assignments: Map<string, Assignment>;
  private submissions: Map<string, Submission>;
  private grades: Map<string, Grade>;
  private messages: Map<string, Message>;
  private attendance: Map<string, Attendance>;
  private parentChildren: Map<string, ParentChild>;
  private announcements: Map<string, Announcement>;
  private courseActivities: Map<string, CourseActivity>;
  private pendingParentActivations: Map<string, PendingParentActivation>;
  private schedules: Map<string, Schedule>;
  private dmsFolders: Map<string, DmsFolder> = new Map();
  private dmsDocuments: Map<string, DmsDocument> = new Map();
  private dmsShareLinks: Map<string, DmsShareLink> = new Map();

  constructor() {
    this.users = new Map();
    this.passwordResetRequests = new Map();
    this.courses = new Map();
    this.enrollments = new Map();
    this.enrollmentRequests = new Map();
    this.courseActivationRequests = new Map();
    this.assignments = new Map();
    this.submissions = new Map();
    this.grades = new Map();
    this.messages = new Map();
    this.attendance = new Map();
    this.parentChildren = new Map();
    this.announcements = new Map();
    this.courseActivities = new Map();
    this.pendingParentActivations = new Map();
    this.schedules = new Map();
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (!email) return undefined;
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserByResetToken(resetToken: string): Promise<User | undefined> {
    if (!resetToken) return undefined;
    return Array.from(this.users.values()).find(user => user.resetToken === resetToken);
  }

  async getUsersByRole(role: "student" | "parent" | "teacher" | "admin"): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.role === role);
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  // Validation helper methods
  private async validateUniqueEmail(email: string | null | undefined, excludeId?: string): Promise<void> {
    if (!email) return; // Skip validation for null/undefined emails
    const existing = await this.getUserByEmail(email);
    if (existing && existing.id !== excludeId) {
      throw new Error(`Email ${email} is already in use`);
    }
  }
  
  private async validateUniqueEnrollment(studentId: string, courseId: string): Promise<void> {
    const existing = Array.from(this.enrollments.values())
      .find(e => e.studentId === studentId && e.courseId === courseId);
    if (existing) {
      throw new Error(`Student is already enrolled in this course`);
    }
  }
  
  private async validateUniqueSubmission(assignmentId: string, studentId: string): Promise<void> {
    const existing = Array.from(this.submissions.values())
      .find(s => s.assignmentId === assignmentId && s.studentId === studentId);
    if (existing) {
      throw new Error(`Student has already submitted for this assignment`);
    }
  }
  
  private async validateUniqueGrade(submissionId: string): Promise<void> {
    const existing = await this.getGradeBySubmission(submissionId);
    if (existing) {
      throw new Error(`Submission already has a grade`);
    }
  }
  
  private async validateUniqueParentChild(parentId: string, childId: string): Promise<void> {
    const existing = Array.from(this.parentChildren.values())
      .find(pc => pc.parentId === parentId && pc.childId === childId);
    if (existing) {
      throw new Error(`Parent-child relationship already exists`);
    }
  }
  
  private async validateUniqueAttendance(studentId: string, courseId: string, date: string): Promise<void> {
    const existing = Array.from(this.attendance.values())
      .find(a => a.studentId === studentId && a.courseId === courseId && a.date === date);
    if (existing) {
      throw new Error(`Attendance record already exists for this student, course, and date`);
    }
  }
  
  private async validateUserExists(userId: string): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} does not exist`);
    }
    return user;
  }
  
  private async validateCourseExists(courseId: string): Promise<Course> {
    const course = await this.getCourse(courseId);
    if (!course) {
      throw new Error(`Course with ID ${courseId} does not exist`);
    }
    return course;
  }
  
  private async validateAssignmentExists(assignmentId: string): Promise<Assignment> {
    const assignment = await this.getAssignment(assignmentId);
    if (!assignment) {
      throw new Error(`Assignment with ID ${assignmentId} does not exist`);
    }
    return assignment;
  }
  
  private async validateSubmissionExists(submissionId: string): Promise<Submission> {
    const submission = await this.getSubmission(submissionId);
    if (!submission) {
      throw new Error(`Submission with ID ${submissionId} does not exist`);
    }
    return submission;
  }
  
  private async validateUserRole(userId: string, expectedRole: string): Promise<void> {
    const user = await this.validateUserExists(userId);
    if (user.role !== expectedRole) {
      throw new Error(`User must have role '${expectedRole}' but has '${user.role}'`);
    }
  }

  // Helper method to compute display name for backwards compatibility
  private computeDisplayName(firstName: string | null | undefined, lastName: string | null | undefined): string | null {
    const first = firstName?.trim();
    const last = lastName?.trim();
    
    if (first && last) return `${first} ${last}`;
    if (first) return first;
    if (last) return last;
    return null;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    await this.validateUniqueEmail(insertUser.email);
    
    const id = randomUUID();
    const now = new Date();
    const user: User = { 
      ...insertUser,
      name: insertUser.name ?? this.computeDisplayName(insertUser.firstName, insertUser.lastName),
      email: insertUser.email ?? null,
      password: insertUser.password ?? null,
      firstName: insertUser.firstName ?? null,
      lastName: insertUser.lastName ?? null,
      avatarUrl: insertUser.avatarUrl ?? null,
      profileImageUrl: insertUser.profileImageUrl ?? null,
      id, 
      createdAt: now,
      updatedAt: now 
    };
    this.users.set(id, user);
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if user exists by ID
    const existingUser = userData.id ? await this.getUser(userData.id) : undefined;
    
    if (existingUser) {
      // Update existing user
      const updates = {
        email: userData.email ?? existingUser.email,
        firstName: userData.firstName ?? existingUser.firstName,
        lastName: userData.lastName ?? existingUser.lastName,
        profileImageUrl: userData.profileImageUrl ?? existingUser.profileImageUrl,
        // Compute name from firstName/lastName if not provided
        name: userData.name ?? this.computeDisplayName(
          userData.firstName ?? existingUser.firstName,
          userData.lastName ?? existingUser.lastName
        ) ?? existingUser.name,
        role: userData.role ?? existingUser.role,
        avatarUrl: userData.avatarUrl ?? existingUser.avatarUrl,
      };
      
      const updatedUser = await this.updateUser(existingUser.id, updates);
      if (!updatedUser) throw new Error("Failed to update user");
      return updatedUser;
    } else {
      // Create new user
      if (!userData.id) throw new Error("User ID is required for upsert");
      if (!userData.role) throw new Error("User role is required for new user");
      
      const id = userData.id;
      const now = new Date();
      const user: User = {
        id,
        email: userData.email ?? null,
        password: userData.password ?? null,
        name: userData.name ?? this.computeDisplayName(userData.firstName, userData.lastName),
        firstName: userData.firstName ?? null,
        lastName: userData.lastName ?? null,
        role: userData.role,
        avatarUrl: userData.avatarUrl ?? null,
        profileImageUrl: userData.profileImageUrl ?? null,
        createdAt: now,
        updatedAt: now
      };
      
      await this.validateUniqueEmail(user.email);
      this.users.set(id, user);
      return user;
    }
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    // Validate unique email if changing
    if (updates.email && updates.email !== user.email) {
      await this.validateUniqueEmail(updates.email, id);
    }
    
    // Check role-breaking restrictions if changing role
    if (updates.role && updates.role !== user.role) {
      // Apply same comprehensive restrictions as deleteUser - check ALL role-specific references
      const restrictions = await this.checkUserRestrictions(id);
      if (restrictions.length > 0) {
        throw new Error(`Cannot change user role: ${restrictions.join(', ')}`);
      }
      
      // Additional checks for changing away from specific roles
      if (user.role === 'student') {
        const enrollments = await this.getEnrollmentsByStudent(id);
        if (enrollments.length > 0) {
          throw new Error(`Cannot change role from student: user has ${enrollments.length} enrollment(s)`);
        }
        const submissions = await this.getSubmissionsByStudent(id);
        if (submissions.length > 0) {
          throw new Error(`Cannot change role from student: user has ${submissions.length} submission(s)`);
        }
        const attendance = await this.getAttendanceByStudent(id);
        if (attendance.length > 0) {
          throw new Error(`Cannot change role from student: user has ${attendance.length} attendance record(s)`);
        }
        const asChild = await this.getParentsByChild(id);
        if (asChild.length > 0) {
          throw new Error(`Cannot change role from student: user has ${asChild.length} parent-child relationship(s)`);
        }
      }
      
      if (user.role === 'parent') {
        const asParent = await this.getChildrenByParent(id);
        if (asParent.length > 0) {
          throw new Error(`Cannot change role from parent: user has ${asParent.length} child relationship(s)`);
        }
      }
    }
    
    const updatedUser: User = { 
      ...user, 
      ...updates,
      avatarUrl: updates.avatarUrl !== undefined ? (updates.avatarUrl ?? null) : user.avatarUrl,
      updatedAt: new Date()
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Private helper methods for referential integrity
  private async checkUserRestrictions(userId: string): Promise<string[]> {
    const restrictions = [];
    
    // Check if user is a teacher for any courses
    const teacherCourses = await this.getCoursesByTeacher(userId);
    if (teacherCourses.length > 0) {
      restrictions.push(`User is a teacher for ${teacherCourses.length} course(s)`);
    }
    
    // Check if user has graded submissions
    const gradedSubmissions = Array.from(this.grades.values()).filter(grade => grade.gradedBy === userId);
    if (gradedSubmissions.length > 0) {
      restrictions.push(`User has graded ${gradedSubmissions.length} submission(s)`);
    }
    
    // Note: Messages and announcements are now cascade deleted, so we don't restrict based on them
    
    return restrictions;
  }
  
  private async cascadeDeleteUser(userId: string): Promise<void> {
    // Delete enrollments
    const enrollments = await this.getEnrollmentsByStudent(userId);
    for (const enrollment of enrollments) {
      this.enrollments.delete(enrollment.id);
    }
    
    // Delete submissions
    const submissions = await this.getSubmissionsByStudent(userId);
    for (const submission of submissions) {
      // Delete associated grades first
      const grade = await this.getGradeBySubmission(submission.id);
      if (grade) {
        this.grades.delete(grade.id);
      }
      this.submissions.delete(submission.id);
    }
    
    // Delete attendance records
    const attendance = await this.getAttendanceByStudent(userId);
    for (const record of attendance) {
      this.attendance.delete(record.id);
    }
    
    // Delete parent-child relationships
    const asParent = await this.getChildrenByParent(userId);
    const asChild = await this.getParentsByChild(userId);
    for (const rel of [...asParent, ...asChild]) {
      this.parentChildren.delete(rel.id);
    }
    
    // Delete messages (sent and received) - use Set to avoid duplicates
    const sentMessages = await this.getMessagesBySender(userId);
    const receivedMessages = await this.getMessagesByRecipient(userId);
    const allMessageIds = new Set([
      ...sentMessages.map(m => m.id),
      ...receivedMessages.map(m => m.id)
    ]);
    for (const messageId of allMessageIds) {
      this.messages.delete(messageId);
    }
    
    // Delete authored announcements
    const authoredAnnouncements = Array.from(this.announcements.values()).filter(a => a.authorId === userId);
    for (const announcement of authoredAnnouncements) {
      this.announcements.delete(announcement.id);
    }
  }

  async deleteUser(id: string): Promise<boolean> {
    const restrictions = await this.checkUserRestrictions(id);
    if (restrictions.length > 0) {
      throw new Error(`Cannot delete user: ${restrictions.join(', ')}`);
    }
    
    await this.cascadeDeleteUser(id);
    return this.users.delete(id);
  }

  // Password Reset Request operations
  async getPasswordResetRequest(id: string): Promise<PasswordResetRequest | undefined> {
    return this.passwordResetRequests.get(id);
  }

  async getPasswordResetRequestsByUser(userId: string): Promise<PasswordResetRequest[]> {
    return Array.from(this.passwordResetRequests.values()).filter(req => req.userId === userId);
  }

  async getPasswordResetRequestsByStatus(status: "pending" | "approved" | "rejected"): Promise<PasswordResetRequest[]> {
    return Array.from(this.passwordResetRequests.values()).filter(req => req.status === status);
  }

  async getAllPasswordResetRequests(): Promise<PasswordResetRequest[]> {
    return Array.from(this.passwordResetRequests.values());
  }

  async createPasswordResetRequest(insertRequest: InsertPasswordResetRequest): Promise<PasswordResetRequest> {
    const id = randomUUID();
    const now = new Date();
    const request: PasswordResetRequest = {
      ...insertRequest,
      id,
      status: insertRequest.status ?? "pending",
      rejectionReason: insertRequest.rejectionReason ?? null,
      notes: insertRequest.notes ?? null,
      handledAt: null,
      handledBy: insertRequest.handledBy ?? null,
      requestedAt: now,
      createdAt: now,
      updatedAt: now
    };
    this.passwordResetRequests.set(id, request);
    return request;
  }

  async updatePasswordResetRequest(id: string, updates: Partial<InsertPasswordResetRequest>): Promise<PasswordResetRequest | undefined> {
    const request = this.passwordResetRequests.get(id);
    if (!request) return undefined;
    
    const updatedRequest: PasswordResetRequest = {
      ...request,
      ...updates,
      updatedAt: new Date()
    };
    this.passwordResetRequests.set(id, updatedRequest);
    return updatedRequest;
  }

  async deletePasswordResetRequest(id: string): Promise<boolean> {
    return this.passwordResetRequests.delete(id);
  }

  // Course operations
  async getCourse(id: string): Promise<Course | undefined> {
    return this.courses.get(id);
  }

  async getCoursesByTeacher(teacherId: string): Promise<Course[]> {
    return Array.from(this.courses.values()).filter(course => course.teacherId === teacherId);
  }

  async getAllCourses(): Promise<Course[]> {
    return Array.from(this.courses.values());
  }

  async createCourse(insertCourse: InsertCourse): Promise<Course> {
    await this.validateUserRole(insertCourse.teacherId, 'teacher');
    
    const id = randomUUID();
    const now = new Date();
    const course: Course = { 
      ...insertCourse,
      description: insertCourse.description ?? null,
      isActive: insertCourse.isActive ?? null,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.courses.set(id, course);
    return course;
  }

  async updateCourse(id: string, updates: Partial<InsertCourse>): Promise<Course | undefined> {
    const course = this.courses.get(id);
    if (!course) return undefined;
    
    // Validate teacher if changing
    if (updates.teacherId && updates.teacherId !== course.teacherId) {
      await this.validateUserRole(updates.teacherId, 'teacher');
    }
    
    const updatedCourse: Course = { 
      ...course, 
      ...updates,
      description: updates.description !== undefined ? (updates.description ?? null) : course.description,
      isActive: updates.isActive !== undefined ? (updates.isActive ?? null) : course.isActive,
      updatedAt: new Date()
    };
    this.courses.set(id, updatedCourse);
    return updatedCourse;
  }

  private async cascadeDeleteCourse(courseId: string): Promise<void> {
    // Delete enrollments
    const enrollments = await this.getEnrollmentsByCourse(courseId);
    for (const enrollment of enrollments) {
      this.enrollments.delete(enrollment.id);
    }
    
    // Delete assignments and their submissions/grades
    const assignments = await this.getAssignmentsByCourse(courseId);
    for (const assignment of assignments) {
      const submissions = await this.getSubmissionsByAssignment(assignment.id);
      for (const submission of submissions) {
        const grade = await this.getGradeBySubmission(submission.id);
        if (grade) {
          this.grades.delete(grade.id);
        }
        this.submissions.delete(submission.id);
      }
      this.assignments.delete(assignment.id);
    }
    
    // Delete attendance records
    const attendance = await this.getAttendanceByCourse(courseId);
    for (const record of attendance) {
      this.attendance.delete(record.id);
    }
    
    // Delete course announcements
    const announcements = await this.getAnnouncementsByCourse(courseId);
    for (const announcement of announcements) {
      this.announcements.delete(announcement.id);
    }
  }

  async deleteCourse(id: string): Promise<boolean> {
    await this.cascadeDeleteCourse(id);
    return this.courses.delete(id);
  }

  // Enrollment operations
  async getEnrollment(id: string): Promise<Enrollment | undefined> {
    return this.enrollments.get(id);
  }

  async getEnrollmentsByStudent(studentId: string): Promise<Enrollment[]> {
    return Array.from(this.enrollments.values()).filter(enrollment => enrollment.studentId === studentId);
  }

  async getEnrollmentsByCourse(courseId: string): Promise<Enrollment[]> {
    return Array.from(this.enrollments.values()).filter(enrollment => enrollment.courseId === courseId);
  }

  async getAllEnrollments(): Promise<Enrollment[]> {
    return Array.from(this.enrollments.values());
  }

  async createEnrollment(insertEnrollment: InsertEnrollment): Promise<Enrollment> {
    await this.validateUserRole(insertEnrollment.studentId, 'student');
    await this.validateCourseExists(insertEnrollment.courseId);
    await this.validateUniqueEnrollment(insertEnrollment.studentId, insertEnrollment.courseId);
    
    const id = randomUUID();
    const enrollment: Enrollment = { 
      ...insertEnrollment, 
      id,
      approvalStatus: insertEnrollment.approvalStatus ?? 'pending',
      approvedAt: insertEnrollment.approvedAt ?? null,
      rejectedAt: insertEnrollment.rejectedAt ?? null,
      rejectionReason: insertEnrollment.rejectionReason ?? null,
      enrolledAt: new Date()
    };
    this.enrollments.set(id, enrollment);
    return enrollment;
  }

  async updateEnrollment(id: string, updates: Partial<InsertEnrollment>): Promise<Enrollment | undefined> {
    const enrollment = this.enrollments.get(id);
    if (!enrollment) return undefined;
    
    // Calculate final state
    const finalStudentId = updates.studentId ?? enrollment.studentId;
    const finalCourseId = updates.courseId ?? enrollment.courseId;
    
    // Validate references if changing
    if (updates.studentId && updates.studentId !== enrollment.studentId) {
      await this.validateUserRole(updates.studentId, 'student');
    }
    if (updates.courseId && updates.courseId !== enrollment.courseId) {
      await this.validateCourseExists(updates.courseId);
    }
    
    // Check uniqueness of final state (excluding current record)
    if ((updates.studentId && updates.studentId !== enrollment.studentId) ||
        (updates.courseId && updates.courseId !== enrollment.courseId)) {
      const existing = Array.from(this.enrollments.values())
        .find(e => e.id !== id && e.studentId === finalStudentId && e.courseId === finalCourseId);
      if (existing) {
        throw new Error('Student is already enrolled in this course');
      }
    }
    
    const updatedEnrollment: Enrollment = { 
      ...enrollment, 
      ...updates
    };
    this.enrollments.set(id, updatedEnrollment);
    return updatedEnrollment;
  }

  async deleteEnrollment(id: string): Promise<boolean> {
    return this.enrollments.delete(id);
  }

  // Enrollment Request operations
  async getEnrollmentRequest(id: string): Promise<EnrollmentRequest | undefined> {
    return this.enrollmentRequests.get(id);
  }

  async getEnrollmentRequestsByStudent(studentId: string): Promise<EnrollmentRequest[]> {
    return Array.from(this.enrollmentRequests.values()).filter(request => request.studentId === studentId);
  }

  async getEnrollmentRequestsByParent(parentId: string): Promise<EnrollmentRequest[]> {
    return Array.from(this.enrollmentRequests.values()).filter(request => request.parentId === parentId);
  }

  async getEnrollmentRequestsByStatus(status: "requested" | "parent_approved" | "admin_approved" | "enrolled" | "rejected"): Promise<EnrollmentRequest[]> {
    return Array.from(this.enrollmentRequests.values()).filter(request => request.status === status);
  }

  async getAllEnrollmentRequests(): Promise<EnrollmentRequest[]> {
    return Array.from(this.enrollmentRequests.values());
  }

  async createEnrollmentRequest(insertRequest: InsertEnrollmentRequest): Promise<EnrollmentRequest> {
    await this.validateUserRole(insertRequest.studentId, 'student');
    await this.validateUserRole(insertRequest.parentId, 'parent');
    await this.validateCourseExists(insertRequest.courseId);
    
    // Check if student already has a request for this course
    const existingRequest = Array.from(this.enrollmentRequests.values())
      .find(r => r.studentId === insertRequest.studentId && r.courseId === insertRequest.courseId);
    if (existingRequest) {
      throw new Error('Student already has an enrollment request for this course');
    }
    
    // Check if student is already enrolled
    await this.validateUniqueEnrollment(insertRequest.studentId, insertRequest.courseId);
    
    const id = randomUUID();
    const now = new Date();
    const request: EnrollmentRequest = {
      ...insertRequest,
      status: insertRequest.status ?? 'requested',
      rejectionReason: insertRequest.rejectionReason ?? null,
      notes: insertRequest.notes ?? null,
      parentApprovedAt: null,
      adminApprovedAt: null,
      rejectedAt: null,
      id,
      requestedAt: now,
      createdAt: now,
      updatedAt: now
    };
    this.enrollmentRequests.set(id, request);
    return request;
  }

  async updateEnrollmentRequest(id: string, updates: Partial<InsertEnrollmentRequest>): Promise<EnrollmentRequest | undefined> {
    const request = this.enrollmentRequests.get(id);
    if (!request) return undefined;
    
    // Validate references if changing
    if (updates.studentId && updates.studentId !== request.studentId) {
      await this.validateUserRole(updates.studentId, 'student');
    }
    if (updates.parentId && updates.parentId !== request.parentId) {
      await this.validateUserRole(updates.parentId, 'parent');
    }
    if (updates.courseId && updates.courseId !== request.courseId) {
      await this.validateCourseExists(updates.courseId);
    }
    
    const now = new Date();
    const updatedRequest: EnrollmentRequest = {
      ...request,
      ...updates,
      rejectionReason: updates.rejectionReason !== undefined ? (updates.rejectionReason ?? null) : request.rejectionReason,
      notes: updates.notes !== undefined ? (updates.notes ?? null) : request.notes,
      // Update timestamp fields based on status changes
      parentApprovedAt: updates.status === 'parent_approved' && request.status !== 'parent_approved' ? now : request.parentApprovedAt,
      adminApprovedAt: updates.status === 'admin_approved' && request.status !== 'admin_approved' ? now : request.adminApprovedAt,
      rejectedAt: updates.status === 'rejected' && request.status !== 'rejected' ? now : request.rejectedAt,
      updatedAt: now
    };
    this.enrollmentRequests.set(id, updatedRequest);
    return updatedRequest;
  }

  async deleteEnrollmentRequest(id: string): Promise<boolean> {
    return this.enrollmentRequests.delete(id);
  }

  // Course Activation Request operations
  async getCourseActivationRequest(id: string): Promise<CourseActivationRequest | undefined> {
    return this.courseActivationRequests.get(id);
  }

  async getCourseActivationRequestByCourse(courseId: string): Promise<CourseActivationRequest | undefined> {
    return Array.from(this.courseActivationRequests.values()).find(request => request.courseId === courseId);
  }

  async getCourseActivationRequestsByTeacher(teacherId: string): Promise<CourseActivationRequest[]> {
    return Array.from(this.courseActivationRequests.values()).filter(request => request.teacherId === teacherId);
  }

  async getCourseActivationRequestsByParent(parentId: string): Promise<CourseActivationRequest[]> {
    return Array.from(this.courseActivationRequests.values()).filter(request => request.parentId === parentId);
  }

  async getCourseActivationRequestsByStatus(status: "draft" | "pending_parent" | "parent_authorized" | "pending_admin" | "active" | "rejected"): Promise<CourseActivationRequest[]> {
    return Array.from(this.courseActivationRequests.values()).filter(request => request.status === status);
  }

  async getAllCourseActivationRequests(): Promise<CourseActivationRequest[]> {
    return Array.from(this.courseActivationRequests.values());
  }

  async createCourseActivationRequest(insertRequest: InsertCourseActivationRequest): Promise<CourseActivationRequest> {
    await this.validateCourseExists(insertRequest.courseId);
    await this.validateUserRole(insertRequest.teacherId, 'teacher');
    await this.validateUserRole(insertRequest.childId, 'student');
    await this.validateUserRole(insertRequest.parentId, 'parent');
    
    // Check if course already has an activation request
    const existingRequest = await this.getCourseActivationRequestByCourse(insertRequest.courseId);
    if (existingRequest) {
      throw new Error('Course already has an activation request');
    }
    
    // Validate parent-child relationship
    const parentChildRel = Array.from(this.parentChildren.values())
      .find(pc => pc.parentId === insertRequest.parentId && pc.childId === insertRequest.childId);
    if (!parentChildRel) {
      throw new Error('Parent-child relationship does not exist');
    }
    
    const id = randomUUID();
    const now = new Date();
    const request: CourseActivationRequest = {
      ...insertRequest,
      status: insertRequest.status ?? 'draft',
      adminId: insertRequest.adminId ?? null,
      submittedAt: null,
      parentAuthorizedAt: null,
      adminVerifiedAt: null,
      rejectedAt: null,
      rejectionReason: insertRequest.rejectionReason ?? null,
      parentNotes: insertRequest.parentNotes ?? null,
      adminNotes: insertRequest.adminNotes ?? null,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.courseActivationRequests.set(id, request);
    return request;
  }

  async updateCourseActivationRequest(id: string, updates: Partial<InsertCourseActivationRequest>): Promise<CourseActivationRequest | undefined> {
    const request = this.courseActivationRequests.get(id);
    if (!request) return undefined;
    
    // Validate references if changing
    if (updates.courseId && updates.courseId !== request.courseId) {
      await this.validateCourseExists(updates.courseId);
    }
    if (updates.teacherId && updates.teacherId !== request.teacherId) {
      await this.validateUserRole(updates.teacherId, 'teacher');
    }
    if (updates.childId && updates.childId !== request.childId) {
      await this.validateUserRole(updates.childId, 'student');
    }
    if (updates.parentId && updates.parentId !== request.parentId) {
      await this.validateUserRole(updates.parentId, 'parent');
    }
    if (updates.adminId && updates.adminId !== request.adminId) {
      await this.validateUserRole(updates.adminId, 'admin');
    }
    
    const now = new Date();
    const updatedRequest: CourseActivationRequest = {
      ...request,
      ...updates,
      adminId: updates.adminId !== undefined ? (updates.adminId ?? null) : request.adminId,
      rejectionReason: updates.rejectionReason !== undefined ? (updates.rejectionReason ?? null) : request.rejectionReason,
      parentNotes: updates.parentNotes !== undefined ? (updates.parentNotes ?? null) : request.parentNotes,
      adminNotes: updates.adminNotes !== undefined ? (updates.adminNotes ?? null) : request.adminNotes,
      // Update timestamp fields based on status changes
      submittedAt: updates.status === 'pending_parent' && request.status === 'draft' ? now : request.submittedAt,
      parentAuthorizedAt: updates.status === 'parent_authorized' && !['parent_authorized', 'pending_admin', 'active'].includes(request.status) ? now : request.parentAuthorizedAt,
      adminVerifiedAt: updates.status === 'active' && request.status !== 'active' ? now : request.adminVerifiedAt,
      rejectedAt: updates.status === 'rejected' && request.status !== 'rejected' ? now : request.rejectedAt,
      updatedAt: now
    };
    this.courseActivationRequests.set(id, updatedRequest);
    return updatedRequest;
  }

  async deleteCourseActivationRequest(id: string): Promise<boolean> {
    return this.courseActivationRequests.delete(id);
  }

  // Course activation workflow helper methods
  async submitCourseForActivation(courseId: string, childId: string): Promise<CourseActivationRequest> {
    const course = await this.validateCourseExists(courseId);
    await this.validateUserRole(course.teacherId, 'teacher');
    await this.validateUserRole(childId, 'student');
    
    // Find parent-child relationship
    const parentChildRel = Array.from(this.parentChildren.values())
      .find(pc => pc.childId === childId);
    if (!parentChildRel) {
      throw new Error('No parent found for this student');
    }
    
    // Check if request already exists
    const existingRequest = await this.getCourseActivationRequestByCourse(courseId);
    if (existingRequest) {
      // Update status to pending_parent if it's in draft
      if (existingRequest.status === 'draft') {
        return await this.updateCourseActivationRequest(existingRequest.id, { 
          status: 'pending_parent' 
        }) as CourseActivationRequest;
      }
      throw new Error('Course activation request already exists');
    }
    
    // Create new request
    const request = await this.createCourseActivationRequest({
      courseId,
      teacherId: course.teacherId,
      childId,
      parentId: parentChildRel.parentId,
      status: 'pending_parent'
    });
    
    return request;
  }

  async authorizeCourseActivation(requestId: string, parentId: string, notes?: string): Promise<CourseActivationRequest> {
    const request = await this.getCourseActivationRequest(requestId);
    if (!request) {
      throw new Error('Course activation request not found');
    }
    
    if (request.parentId !== parentId) {
      throw new Error('Only the assigned parent can authorize this request');
    }
    
    if (request.status !== 'pending_parent') {
      throw new Error('Request is not in pending parent status');
    }
    
    const updatedRequest = await this.updateCourseActivationRequest(requestId, {
      status: 'pending_admin',
      parentNotes: notes
    });
    
    if (!updatedRequest) {
      throw new Error('Failed to update activation request');
    }
    
    return updatedRequest;
  }

  async verifyCourseActivation(requestId: string, adminId: string, notes?: string): Promise<CourseActivationRequest> {
    const request = await this.getCourseActivationRequest(requestId);
    if (!request) {
      throw new Error('Course activation request not found');
    }
    
    await this.validateUserRole(adminId, 'admin');
    
    if (request.status !== 'pending_admin') {
      throw new Error('Request is not in pending admin status');
    }
    
    // Activate the course
    await this.updateCourse(request.courseId, { isActive: true });
    
    // Update request status
    const updatedRequest = await this.updateCourseActivationRequest(requestId, {
      status: 'active',
      adminId,
      adminNotes: notes
    });
    
    if (!updatedRequest) {
      throw new Error('Failed to update activation request');
    }
    
    return updatedRequest;
  }

  async rejectCourseActivation(requestId: string, rejectionReason: string, rejectedBy: string): Promise<CourseActivationRequest> {
    const request = await this.getCourseActivationRequest(requestId);
    if (!request) {
      throw new Error('Course activation request not found');
    }
    
    const user = await this.validateUserExists(rejectedBy);
    if (!['parent', 'admin'].includes(user.role)) {
      throw new Error('Only parents and admins can reject activation requests');
    }
    
    // Validate rejection permissions
    if (user.role === 'parent' && request.parentId !== rejectedBy) {
      throw new Error('Parent can only reject their own requests');
    }
    
    const updatedRequest = await this.updateCourseActivationRequest(requestId, {
      status: 'rejected',
      rejectionReason,
      adminId: user.role === 'admin' ? rejectedBy : request.adminId
    });
    
    if (!updatedRequest) {
      throw new Error('Failed to update activation request');
    }
    
    return updatedRequest;
  }

  // Assignment operations
  async getAssignment(id: string): Promise<Assignment | undefined> {
    return this.assignments.get(id);
  }

  async getAssignmentsByCourse(courseId: string): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(assignment => assignment.courseId === courseId);
  }

  async getAllAssignments(): Promise<Assignment[]> {
    return Array.from(this.assignments.values());
  }

  async getPublishedAssignmentsByCourse(courseId: string): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(
      assignment => assignment.courseId === courseId && assignment.isPublished === true
    );
  }

  async getTeacherAssignments(teacherId: string): Promise<Assignment[]> {
    const teacherCourses = await this.getCoursesByTeacher(teacherId);
    const teacherAssignments = await this.getAssignmentsByTeacher(teacherId);
    const courseIds = new Set([
      ...teacherCourses.map(c => c.id),
      ...teacherAssignments.map(a => a.courseId)
    ]);
    
    if (courseIds.size === 0) {
      return [];
    }
    
    const allAssignments: Assignment[] = [];
    for (const courseId of Array.from(courseIds)) {
      const courseAssignments = await this.getAssignmentsByCourse(courseId);
      allAssignments.push(...courseAssignments);
    }
    
    return allAssignments.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async getPublishedTeacherAssignments(teacherId: string): Promise<Assignment[]> {
    const teacherCourses = await this.getCoursesByTeacher(teacherId);
    const teacherAssignments = await this.getAssignmentsByTeacher(teacherId);
    const courseIds = new Set([
      ...teacherCourses.map(c => c.id),
      ...teacherAssignments.map(a => a.courseId)
    ]);
    
    if (courseIds.size === 0) {
      return [];
    }
    
    const allAssignments: Assignment[] = [];
    for (const courseId of Array.from(courseIds)) {
      const courseAssignments = await this.getPublishedAssignmentsByCourse(courseId);
      allAssignments.push(...courseAssignments);
    }
    
    return allAssignments.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });
  }

  async getTeacherAssignmentStats(teacherId: string): Promise<Record<string, { totalSubmissions: number; gradedCount: number; ungradedCount: number }>> {
    const teacherAssignments = await this.getTeacherAssignments(teacherId);
    const assignmentIds = teacherAssignments.map(a => a.id);
    
    if (assignmentIds.length === 0) {
      return {};
    }
    
    const allSubmissions = await this.getAllSubmissions();
    const teacherSubmissions = allSubmissions.filter(s => assignmentIds.includes(s.assignmentId));
    
    const allGrades = await this.getAllGrades();
    const gradesBySubmissionId = new Map(allGrades.map(g => [g.submissionId, g]));
    
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
    const courseAssignments = await this.getAssignmentsByCourse(courseId);
    const assignmentIds = courseAssignments.map(a => a.id);
    
    if (assignmentIds.length === 0) {
      return {};
    }
    
    const allSubmissions = await this.getAllSubmissions();
    const courseSubmissions = allSubmissions.filter(s => assignmentIds.includes(s.assignmentId));
    
    const allGrades = await this.getAllGrades();
    const gradesBySubmissionId = new Map(allGrades.map(g => [g.submissionId, g]));
    
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
    await this.validateCourseExists(insertAssignment.courseId);
    
    const id = randomUUID();
    const now = new Date();
    const assignment: Assignment = { 
      ...insertAssignment,
      description: insertAssignment.description ?? null,
      dueDate: insertAssignment.dueDate ?? null,
      maxScore: insertAssignment.maxScore ?? null,
      instructions: insertAssignment.instructions ?? null,
      isPublished: insertAssignment.isPublished ?? null,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.assignments.set(id, assignment);
    return assignment;
  }

  async updateAssignment(id: string, updates: Partial<InsertAssignment>): Promise<Assignment | undefined> {
    const assignment = this.assignments.get(id);
    if (!assignment) return undefined;
    
    // Validate course if changing
    if (updates.courseId && updates.courseId !== assignment.courseId) {
      await this.validateCourseExists(updates.courseId);
    }
    
    const updatedAssignment: Assignment = { 
      ...assignment, 
      ...updates,
      description: updates.description !== undefined ? (updates.description ?? null) : assignment.description,
      dueDate: updates.dueDate !== undefined ? (updates.dueDate ?? null) : assignment.dueDate,
      maxScore: updates.maxScore !== undefined ? (updates.maxScore ?? null) : assignment.maxScore,
      instructions: updates.instructions !== undefined ? (updates.instructions ?? null) : assignment.instructions,
      isPublished: updates.isPublished !== undefined ? (updates.isPublished ?? null) : assignment.isPublished,
      updatedAt: new Date()
    };
    this.assignments.set(id, updatedAssignment);
    return updatedAssignment;
  }

  private async cascadeDeleteAssignment(assignmentId: string): Promise<void> {
    // Delete submissions and their grades
    const submissions = await this.getSubmissionsByAssignment(assignmentId);
    for (const submission of submissions) {
      const grade = await this.getGradeBySubmission(submission.id);
      if (grade) {
        this.grades.delete(grade.id);
      }
      this.submissions.delete(submission.id);
    }
  }

  async deleteAssignment(id: string): Promise<boolean> {
    await this.cascadeDeleteAssignment(id);
    return this.assignments.delete(id);
  }

  // Submission operations
  async getSubmission(id: string): Promise<Submission | undefined> {
    return this.submissions.get(id);
  }

  async getSubmissionsByAssignment(assignmentId: string): Promise<Submission[]> {
    return Array.from(this.submissions.values()).filter(submission => submission.assignmentId === assignmentId);
  }

  async getSubmissionsByStudent(studentId: string): Promise<Submission[]> {
    return Array.from(this.submissions.values()).filter(submission => submission.studentId === studentId);
  }

  async getAllSubmissions(): Promise<Submission[]> {
    return Array.from(this.submissions.values());
  }

  async getAllSubmissionsWithGrades(): Promise<Array<Submission & { grade: number | null; feedback: string | null; gradedAt: Date | null; gradedBy: string | null }>> {
    const submissions = Array.from(this.submissions.values());
    const allGrades = Array.from(this.grades.values());
    
    const gradesBySubmissionId = new Map(
      allGrades.map(grade => [grade.submissionId, grade])
    );
    
    return submissions.map(submission => {
      const grade = gradesBySubmissionId.get(submission.id);
      return {
        ...submission,
        grade: grade?.score ?? null,
        feedback: grade?.feedback ?? null,
        gradedAt: grade?.gradedAt ?? null,
        gradedBy: grade?.gradedBy ?? null
      };
    });
  }

  async createSubmission(insertSubmission: InsertSubmission): Promise<Submission> {
    await this.validateUserRole(insertSubmission.studentId, 'student');
    await this.validateAssignmentExists(insertSubmission.assignmentId);
    await this.validateUniqueSubmission(insertSubmission.assignmentId, insertSubmission.studentId);
    
    const id = randomUUID();
    const submission: Submission = { 
      ...insertSubmission,
      content: insertSubmission.content ?? null,
      attachmentUrl: insertSubmission.attachmentUrl ?? null,
      id,
      submittedAt: new Date()
    };
    this.submissions.set(id, submission);
    return submission;
  }

  async updateSubmission(id: string, updates: Partial<InsertSubmission>): Promise<Submission | undefined> {
    const submission = this.submissions.get(id);
    if (!submission) return undefined;
    
    // Calculate final state
    const finalAssignmentId = updates.assignmentId ?? submission.assignmentId;
    const finalStudentId = updates.studentId ?? submission.studentId;
    
    // Validate assignment and student if changing
    if (updates.assignmentId && updates.assignmentId !== submission.assignmentId) {
      await this.validateAssignmentExists(updates.assignmentId);
    }
    if (updates.studentId && updates.studentId !== submission.studentId) {
      await this.validateUserRole(updates.studentId, 'student');
    }
    
    // Check uniqueness of final state (excluding current record)
    if ((updates.assignmentId && updates.assignmentId !== submission.assignmentId) ||
        (updates.studentId && updates.studentId !== submission.studentId)) {
      const existing = Array.from(this.submissions.values())
        .find(s => s.id !== id && s.assignmentId === finalAssignmentId && s.studentId === finalStudentId);
      if (existing) {
        throw new Error('Student has already submitted for this assignment');
      }
    }
    
    const updatedSubmission: Submission = { 
      ...submission, 
      ...updates,
      content: updates.content !== undefined ? (updates.content ?? null) : submission.content,
      attachmentUrl: updates.attachmentUrl !== undefined ? (updates.attachmentUrl ?? null) : submission.attachmentUrl
    };
    this.submissions.set(id, updatedSubmission);
    return updatedSubmission;
  }

  async deleteSubmission(id: string): Promise<boolean> {
    // Delete associated grade if exists
    const grade = await this.getGradeBySubmission(id);
    if (grade) {
      this.grades.delete(grade.id);
    }
    return this.submissions.delete(id);
  }

  // Grade operations
  async getGrade(id: string): Promise<Grade | undefined> {
    return this.grades.get(id);
  }

  async getGradeBySubmission(submissionId: string): Promise<Grade | undefined> {
    return Array.from(this.grades.values()).find(grade => grade.submissionId === submissionId);
  }

  async getGradesByStudent(studentId: string): Promise<Grade[]> {
    const submissions = await this.getSubmissionsByStudent(studentId);
    const submissionIds = submissions.map(s => s.id);
    return Array.from(this.grades.values()).filter(grade => submissionIds.includes(grade.submissionId));
  }

  async getGradesByCourse(courseId: string): Promise<Grade[]> {
    return Array.from(this.grades.values())
      .filter(grade => {
        const submission = this.submissions.get(grade.submissionId);
        if (!submission) return false;
        const assignment = this.assignments.get(submission.assignmentId);
        return assignment && assignment.courseId === courseId;
      });
  }

  async getAllGrades(): Promise<Grade[]> {
    return Array.from(this.grades.values());
  }

  async createGrade(insertGrade: InsertGrade): Promise<Grade> {
    await this.validateSubmissionExists(insertGrade.submissionId);
    
    // Validate grader role
    const grader = await this.validateUserExists(insertGrade.gradedBy);
    if (!['teacher', 'admin'].includes(grader.role)) {
      throw new Error('Only teachers and admins can grade submissions');
    }
    
    await this.validateUniqueGrade(insertGrade.submissionId);
    
    const id = randomUUID();
    const grade: Grade = { 
      ...insertGrade,
      feedback: insertGrade.feedback ?? null,
      id,
      gradedAt: new Date()
    };
    this.grades.set(id, grade);
    return grade;
  }

  async updateGrade(id: string, updates: Partial<InsertGrade>): Promise<Grade | undefined> {
    const grade = this.grades.get(id);
    if (!grade) return undefined;
    
    // Validate submission if changing
    if (updates.submissionId && updates.submissionId !== grade.submissionId) {
      await this.validateSubmissionExists(updates.submissionId);
      await this.validateUniqueGrade(updates.submissionId);
    }
    
    // Validate grader if changing
    if (updates.gradedBy && updates.gradedBy !== grade.gradedBy) {
      const grader = await this.validateUserExists(updates.gradedBy);
      if (!['teacher', 'admin'].includes(grader.role)) {
        throw new Error('Only teachers and admins can grade submissions');
      }
    }
    
    const updatedGrade: Grade = { 
      ...grade, 
      ...updates,
      feedback: updates.feedback !== undefined ? (updates.feedback ?? null) : grade.feedback
    };
    this.grades.set(id, updatedGrade);
    return updatedGrade;
  }

  async deleteGrade(id: string): Promise<boolean> {
    return this.grades.delete(id);
  }

  // Message operations
  async getMessage(id: string): Promise<Message | undefined> {
    return this.messages.get(id);
  }

  async getMessagesByRecipient(recipientId: string): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(message => message.recipientId === recipientId);
  }

  async getMessagesBySender(senderId: string): Promise<Message[]> {
    return Array.from(this.messages.values()).filter(message => message.senderId === senderId);
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    await this.validateUserExists(insertMessage.senderId);
    await this.validateUserExists(insertMessage.recipientId);
    
    const id = randomUUID();
    const message: Message = { 
      ...insertMessage,
      type: insertMessage.type ?? null,
      isRead: insertMessage.isRead ?? null,
      id,
      sentAt: new Date()
    };
    this.messages.set(id, message);
    return message;
  }

  async updateMessage(id: string, updates: Partial<InsertMessage>): Promise<Message | undefined> {
    const message = this.messages.get(id);
    if (!message) return undefined;
    
    const updatedMessage: Message = { 
      ...message, 
      ...updates
    };
    this.messages.set(id, updatedMessage);
    return updatedMessage;
  }

  async markMessageAsRead(id: string): Promise<boolean> {
    const message = this.messages.get(id);
    if (!message) return false;
    
    const updatedMessage: Message = { ...message, isRead: true };
    this.messages.set(id, updatedMessage);
    return true;
  }

  async deleteMessage(id: string): Promise<boolean> {
    return this.messages.delete(id);
  }

  // Message Attachment operations (MemStorage placeholder - uses database in production)
  private messageAttachments = new Map<string, MessageAttachment>();

  async getMessageAttachments(messageId: string): Promise<MessageAttachment[]> {
    return Array.from(this.messageAttachments.values()).filter(a => a.messageId === messageId);
  }

  async getMessageAttachment(id: string): Promise<MessageAttachment | undefined> {
    return this.messageAttachments.get(id);
  }

  async createMessageAttachment(insertAttachment: InsertMessageAttachment): Promise<MessageAttachment> {
    const id = randomUUID();
    const attachment: MessageAttachment = {
      id,
      ...insertAttachment,
      createdAt: new Date(),
    };
    this.messageAttachments.set(id, attachment);
    return attachment;
  }

  async deleteMessageAttachment(id: string): Promise<boolean> {
    return this.messageAttachments.delete(id);
  }

  // Attendance operations
  async getAttendance(id: string): Promise<Attendance | undefined> {
    return this.attendance.get(id);
  }

  async getAttendanceByStudent(studentId: string, courseId?: string): Promise<Attendance[]> {
    return Array.from(this.attendance.values()).filter(att => 
      att.studentId === studentId && (courseId ? att.courseId === courseId : true)
    );
  }

  async getAttendanceByCourse(courseId: string, date?: string): Promise<Attendance[]> {
    return Array.from(this.attendance.values()).filter(att => 
      att.courseId === courseId && (date ? att.date === date : true)
    );
  }

  async createAttendance(insertAttendance: InsertAttendance): Promise<Attendance> {
    await this.validateUserRole(insertAttendance.studentId, 'student');
    await this.validateCourseExists(insertAttendance.courseId);
    
    // Validate recorder role
    const recorder = await this.validateUserExists(insertAttendance.recordedBy);
    if (!['teacher', 'admin'].includes(recorder.role)) {
      throw new Error('Only teachers and admins can record attendance');
    }
    
    await this.validateUniqueAttendance(insertAttendance.studentId, insertAttendance.courseId, insertAttendance.date);
    
    const id = randomUUID();
    const attendance: Attendance = { 
      ...insertAttendance,
      notes: insertAttendance.notes ?? null,
      id
    };
    this.attendance.set(id, attendance);
    return attendance;
  }

  async updateAttendance(id: string, updates: Partial<InsertAttendance>): Promise<Attendance | undefined> {
    const attendance = this.attendance.get(id);
    if (!attendance) return undefined;
    
    // Calculate final state
    const finalStudentId = updates.studentId ?? attendance.studentId;
    const finalCourseId = updates.courseId ?? attendance.courseId;
    const finalDate = updates.date ?? attendance.date;
    
    // Validate references if changing
    if (updates.studentId && updates.studentId !== attendance.studentId) {
      await this.validateUserRole(updates.studentId, 'student');
    }
    if (updates.courseId && updates.courseId !== attendance.courseId) {
      await this.validateCourseExists(updates.courseId);
    }
    if (updates.recordedBy && updates.recordedBy !== attendance.recordedBy) {
      const recorder = await this.validateUserExists(updates.recordedBy);
      if (!['teacher', 'admin'].includes(recorder.role)) {
        throw new Error('Only teachers and admins can record attendance');
      }
    }
    
    // Check uniqueness of final state (excluding current record)
    if ((updates.studentId && updates.studentId !== attendance.studentId) || 
        (updates.courseId && updates.courseId !== attendance.courseId) ||
        (updates.date && updates.date !== attendance.date)) {
      const existing = Array.from(this.attendance.values())
        .find(a => a.id !== id && a.studentId === finalStudentId && a.courseId === finalCourseId && a.date === finalDate);
      if (existing) {
        throw new Error('Attendance record already exists for this student, course, and date');
      }
    }
    
    const updatedAttendance: Attendance = { 
      ...attendance, 
      ...updates,
      notes: updates.notes !== undefined ? (updates.notes ?? null) : attendance.notes
    };
    this.attendance.set(id, updatedAttendance);
    return updatedAttendance;
  }

  async deleteAttendance(id: string): Promise<boolean> {
    return this.attendance.delete(id);
  }

  // Parent-Child relationship operations
  async getParentChild(id: string): Promise<ParentChild | undefined> {
    return this.parentChildren.get(id);
  }

  async getChildrenByParent(parentId: string): Promise<ParentChild[]> {
    return Array.from(this.parentChildren.values()).filter(pc => pc.parentId === parentId);
  }

  private deadlineReminders: Set<string> = new Set();

  async hasDeadlineReminderBeenSent(assignmentId: string, studentId: string): Promise<boolean> {
    return this.deadlineReminders.has(`${assignmentId}:${studentId}`);
  }

  async createDeadlineReminder(assignmentId: string, studentId: string, parentId: string): Promise<void> {
    this.deadlineReminders.add(`${assignmentId}:${studentId}`);
  }

  async getParentsByChild(childId: string): Promise<ParentChild[]> {
    return Array.from(this.parentChildren.values()).filter(pc => pc.childId === childId);
  }

  async getAllParentChildren(): Promise<ParentChild[]> {
    return Array.from(this.parentChildren.values());
  }

  async createParentChild(insertParentChild: InsertParentChild): Promise<ParentChild> {
    await this.validateUserRole(insertParentChild.parentId, 'parent');
    await this.validateUserRole(insertParentChild.childId, 'student');
    await this.validateUniqueParentChild(insertParentChild.parentId, insertParentChild.childId);
    
    const id = randomUUID();
    const parentChild: ParentChild = { 
      ...insertParentChild,
      relationship: insertParentChild.relationship ?? null,
      id,
      createdAt: new Date()
    };
    this.parentChildren.set(id, parentChild);
    return parentChild;
  }

  async updateParentChild(id: string, updates: Partial<InsertParentChild>): Promise<ParentChild | undefined> {
    const parentChild = this.parentChildren.get(id);
    if (!parentChild) return undefined;
    
    // Calculate final state
    const finalParentId = updates.parentId ?? parentChild.parentId;
    const finalChildId = updates.childId ?? parentChild.childId;
    
    // Validate roles if changing
    if (updates.parentId && updates.parentId !== parentChild.parentId) {
      await this.validateUserRole(updates.parentId, 'parent');
    }
    if (updates.childId && updates.childId !== parentChild.childId) {
      await this.validateUserRole(updates.childId, 'student');
    }
    
    // Check uniqueness of final state (excluding current record)
    if ((updates.parentId && updates.parentId !== parentChild.parentId) ||
        (updates.childId && updates.childId !== parentChild.childId)) {
      const existing = Array.from(this.parentChildren.values())
        .find(pc => pc.id !== id && pc.parentId === finalParentId && pc.childId === finalChildId);
      if (existing) {
        throw new Error('Parent-child relationship already exists');
      }
    }
    
    const updatedParentChild: ParentChild = { 
      ...parentChild, 
      ...updates,
      relationship: updates.relationship !== undefined ? (updates.relationship ?? null) : parentChild.relationship
    };
    this.parentChildren.set(id, updatedParentChild);
    return updatedParentChild;
  }

  async deleteParentChild(id: string): Promise<boolean> {
    return this.parentChildren.delete(id);
  }

  // Announcement operations
  async getAnnouncement(id: string): Promise<Announcement | undefined> {
    return this.announcements.get(id);
  }

  async getAnnouncementsByCourse(courseId: string): Promise<Announcement[]> {
    return Array.from(this.announcements.values()).filter(announcement => announcement.courseId === courseId);
  }

  async getGlobalAnnouncements(): Promise<Announcement[]> {
    return Array.from(this.announcements.values()).filter(announcement => announcement.courseId === null);
  }

  async getAllAnnouncements(): Promise<Announcement[]> {
    return Array.from(this.announcements.values());
  }

  async getAnnouncementsByAuthor(authorId: string): Promise<Announcement[]> {
    return Array.from(this.announcements.values()).filter(announcement => announcement.authorId === authorId);
  }

  async createAnnouncement(insertAnnouncement: InsertAnnouncement): Promise<Announcement> {
    // Validate author role
    const author = await this.validateUserExists(insertAnnouncement.authorId);
    if (!['teacher', 'admin'].includes(author.role)) {
      throw new Error('Only teachers and admins can create announcements');
    }
    
    if (insertAnnouncement.courseId) {
      await this.validateCourseExists(insertAnnouncement.courseId);
    }
    
    const id = randomUUID();
    const now = new Date();
    const announcement: Announcement = { 
      ...insertAnnouncement,
      courseId: insertAnnouncement.courseId ?? null,
      isPublished: insertAnnouncement.isPublished ?? null,
      publishedAt: insertAnnouncement.publishedAt ?? null,
      id,
      createdAt: now,
      updatedAt: now
    };
    this.announcements.set(id, announcement);
    return announcement;
  }

  async updateAnnouncement(id: string, updates: Partial<InsertAnnouncement>): Promise<Announcement | undefined> {
    const announcement = this.announcements.get(id);
    if (!announcement) return undefined;
    
    // Validate author if changing
    if (updates.authorId && updates.authorId !== announcement.authorId) {
      const author = await this.validateUserExists(updates.authorId);
      if (!['teacher', 'admin'].includes(author.role)) {
        throw new Error('Only teachers and admins can author announcements');
      }
    }
    
    // Validate course if changing
    if (updates.courseId !== undefined && updates.courseId !== announcement.courseId) {
      if (updates.courseId !== null) {
        await this.validateCourseExists(updates.courseId);
      }
    }
    
    const updatedAnnouncement: Announcement = { 
      ...announcement, 
      ...updates,
      courseId: updates.courseId !== undefined ? (updates.courseId ?? null) : announcement.courseId,
      isPublished: updates.isPublished !== undefined ? (updates.isPublished ?? null) : announcement.isPublished,
      publishedAt: updates.publishedAt !== undefined ? (updates.publishedAt ?? null) : announcement.publishedAt,
      updatedAt: new Date()
    };
    this.announcements.set(id, updatedAnnouncement);
    return updatedAnnouncement;
  }

  async deleteAnnouncement(id: string): Promise<boolean> {
    return this.announcements.delete(id);
  }

  async getCourseActivity(id: string): Promise<CourseActivity | undefined> {
    return this.courseActivities.get(id);
  }

  async getCourseActivitiesByStudent(courseId: string, studentId: string): Promise<CourseActivity[]> {
    return Array.from(this.courseActivities.values()).filter(activity => 
      activity.courseId === courseId && activity.studentId === studentId
    );
  }

  async createCourseActivity(activity: InsertCourseActivity): Promise<CourseActivity> {
    const id = randomUUID();
    const now = new Date();
    const newActivity: CourseActivity = {
      ...activity,
      id,
      createdAt: now,
    };
    this.courseActivities.set(id, newActivity);
    return newActivity;
  }

  async deleteCourseActivity(id: string): Promise<boolean> {
    return this.courseActivities.delete(id);
  }

  // Pending parent activation operations
  async createPendingParentActivation(data: InsertPendingParentActivation): Promise<PendingParentActivation> {
    const id = randomUUID();
    const now = new Date();
    const activation: PendingParentActivation = {
      ...data,
      id,
      createdAt: now,
    };
    this.pendingParentActivations.set(id, activation);
    return activation;
  }

  async getPendingParentActivationByToken(token: string): Promise<PendingParentActivation | undefined> {
    for (const activation of this.pendingParentActivations.values()) {
      if (activation.activationToken === token) {
        return activation;
      }
    }
    return undefined;
  }

  async deletePendingParentActivation(id: string): Promise<boolean> {
    return this.pendingParentActivations.delete(id);
  }

  // Schedule operations
  async getSchedule(id: string): Promise<Schedule | undefined> {
    return this.schedules.get(id);
  }

  async getSchedulesByCourse(courseId: string): Promise<Schedule[]> {
    return Array.from(this.schedules.values()).filter(schedule => schedule.courseId === courseId);
  }

  async getSchedulesByTeacher(teacherId: string): Promise<Schedule[]> {
    return Array.from(this.schedules.values()).filter(schedule => schedule.teacherId === teacherId);
  }

  async getSchedulesByDateRange(startDate: Date, endDate: Date): Promise<Schedule[]> {
    return Array.from(this.schedules.values()).filter(schedule => {
      const scheduleStart = new Date(schedule.startTime);
      return scheduleStart >= startDate && scheduleStart <= endDate;
    });
  }

  async getAllSchedules(): Promise<Schedule[]> {
    return Array.from(this.schedules.values());
  }

  async createSchedule(schedule: InsertSchedule): Promise<Schedule> {
    const id = randomUUID();
    const now = new Date();
    const newSchedule: Schedule = {
      id,
      ...schedule,
      createdAt: now,
      updatedAt: now,
    };
    this.schedules.set(id, newSchedule);
    return newSchedule;
  }

  async updateSchedule(id: string, updates: Partial<InsertSchedule>): Promise<Schedule | undefined> {
    const schedule = this.schedules.get(id);
    if (!schedule) return undefined;

    const updatedSchedule: Schedule = {
      ...schedule,
      ...updates,
      updatedAt: new Date(),
    };
    this.schedules.set(id, updatedSchedule);
    return updatedSchedule;
  }

  async deleteSchedule(id: string): Promise<boolean> {
    return this.schedules.delete(id);
  }

  // DMS Folder operations
  async getDmsFolder(id: string): Promise<DmsFolder | undefined> {
    return this.dmsFolders.get(id);
  }

  async getDmsFolders(parentId?: string | null, category?: string): Promise<DmsFolderWithCount[]> {
    let folders = Array.from(this.dmsFolders.values());
    if (parentId === null || parentId === undefined) {
      if (arguments.length > 0 && parentId === null) {
        folders = folders.filter(f => !f.parentId);
      }
    } else {
      folders = folders.filter(f => f.parentId === parentId);
    }
    if (category) {
      folders = folders.filter(f => f.category === category);
    }
    return folders.map(folder => {
      const documentCount = Array.from(this.dmsDocuments.values()).filter(d => d.folderId === folder.id).length;
      return { ...folder, documentCount };
    });
  }

  async createDmsFolder(folder: InsertDmsFolder): Promise<DmsFolder> {
    const id = randomUUID();
    const now = new Date();
    const newFolder: DmsFolder = {
      id,
      ...folder,
      description: folder.description ?? null,
      parentId: folder.parentId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.dmsFolders.set(id, newFolder);
    return newFolder;
  }

  async updateDmsFolder(id: string, updates: Partial<InsertDmsFolder>): Promise<DmsFolder | undefined> {
    const folder = this.dmsFolders.get(id);
    if (!folder) return undefined;
    const updatedFolder: DmsFolder = {
      ...folder,
      ...updates,
      updatedAt: new Date(),
    };
    this.dmsFolders.set(id, updatedFolder);
    return updatedFolder;
  }

  async deleteDmsFolder(id: string): Promise<boolean> {
    return this.dmsFolders.delete(id);
  }

  // DMS Document operations
  async getDmsDocument(id: string): Promise<DmsDocument | undefined> {
    return this.dmsDocuments.get(id);
  }

  async getDmsDocuments(filters: { folderId?: string | null; category?: string; search?: string }): Promise<DmsDocumentWithUploader[]> {
    let docs = Array.from(this.dmsDocuments.values());
    if (filters.folderId === null) {
      docs = docs.filter(d => !d.folderId);
    } else if (filters.folderId) {
      docs = docs.filter(d => d.folderId === filters.folderId);
    }
    if (filters.category) {
      docs = docs.filter(d => d.category === filters.category);
    }
    if (filters.search) {
      const search = filters.search.toLowerCase();
      docs = docs.filter(d =>
        d.title.toLowerCase().includes(search) ||
        (d.description && d.description.toLowerCase().includes(search)) ||
        d.originalName.toLowerCase().includes(search)
      );
    }
    return docs.map(doc => {
      const user = this.users.get(doc.uploadedBy);
      const uploaderName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Unknown' : 'Unknown';
      return { ...doc, uploaderName };
    });
  }

  async createDmsDocument(doc: InsertDmsDocument): Promise<DmsDocument> {
    const id = randomUUID();
    const now = new Date();
    const newDoc: DmsDocument = {
      id,
      ...doc,
      folderId: doc.folderId ?? null,
      description: doc.description ?? null,
      mimeType: doc.mimeType ?? null,
      size: doc.size ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.dmsDocuments.set(id, newDoc);
    return newDoc;
  }

  async updateDmsDocument(id: string, updates: Partial<InsertDmsDocument>): Promise<DmsDocument | undefined> {
    const doc = this.dmsDocuments.get(id);
    if (!doc) return undefined;
    const updatedDoc: DmsDocument = {
      ...doc,
      ...updates,
      updatedAt: new Date(),
    };
    this.dmsDocuments.set(id, updatedDoc);
    return updatedDoc;
  }

  async deleteDmsDocument(id: string): Promise<boolean> {
    return this.dmsDocuments.delete(id);
  }

  // DMS Share Link operations
  async getDmsShareLink(id: string): Promise<DmsShareLink | undefined> {
    return this.dmsShareLinks.get(id);
  }

  async getDmsShareLinkByToken(token: string): Promise<DmsShareLink | undefined> {
    return Array.from(this.dmsShareLinks.values()).find(link => link.token === token);
  }

  async getDmsShareLinksByDocument(documentId: string): Promise<DmsShareLink[]> {
    return Array.from(this.dmsShareLinks.values()).filter(link => link.documentId === documentId);
  }

  async createDmsShareLink(link: InsertDmsShareLink): Promise<DmsShareLink> {
    const id = randomUUID();
    const now = new Date();
    const newLink: DmsShareLink = {
      id,
      ...link,
      expiresAt: link.expiresAt ?? null,
      maxDownloads: link.maxDownloads ?? null,
      downloadCount: 0,
      createdAt: now,
    };
    this.dmsShareLinks.set(id, newLink);
    return newLink;
  }

  async incrementDmsShareLinkDownloadCount(id: string): Promise<void> {
    const link = this.dmsShareLinks.get(id);
    if (link) {
      link.downloadCount = (link.downloadCount || 0) + 1;
      this.dmsShareLinks.set(id, link);
    }
  }

  async deleteDmsShareLink(id: string): Promise<boolean> {
    return this.dmsShareLinks.delete(id);
  }
}

export const storage = new DbStorage();
