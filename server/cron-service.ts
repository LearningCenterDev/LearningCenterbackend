import cron, { ScheduledTask } from 'node-cron';
import { storage } from './storage';
import { addDays, addWeeks, addMonths, addHours, format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, differenceInDays } from 'date-fns';
import { sendAssignmentDeadlineReminderEmail } from './email';

export class CronService {
  private static instance: CronService;
  private tasks: ScheduledTask[] = [];

  private constructor() {}

  static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  // Start all cron jobs
  start() {
    console.log('[CronService] Starting cron jobs...');
    
    // Monthly invoice generation - runs at 2 AM on the 1st day of each month
    // Generates invoices for the previous month's billing period
    const monthlyInvoiceTask = cron.schedule('0 2 1 * *', async () => {
      console.log('[CronService] Running monthly invoice generation (1st of month)...');
      await this.generateInvoicesByBillingCycle('monthly');
    });
    this.tasks.push(monthlyInvoiceTask);
    
    // Weekly invoice generation - runs at 2 AM every Monday
    // Generates invoices for the previous week's billing period
    const weeklyInvoiceTask = cron.schedule('0 2 * * 1', async () => {
      console.log('[CronService] Running weekly invoice generation (Monday)...');
      await this.generateInvoicesByBillingCycle('weekly');
    });
    this.tasks.push(weeklyInvoiceTask);
    
    // Check for overdue invoices daily at 3 AM
    const overdueCheckTask = cron.schedule('0 3 * * *', async () => {
      console.log('[CronService] Checking for overdue invoices...');
      await this.checkOverdueInvoices();
    });
    
    this.tasks.push(overdueCheckTask);
    
    // Update past schedule statuses every 15 minutes
    const scheduleStatusUpdateTask = cron.schedule('*/15 * * * *', async () => {
      console.log('[CronService] Updating past schedule statuses...');
      await this.updatePastScheduleStatuses();
    });
    
    this.tasks.push(scheduleStatusUpdateTask);
    
    const assignmentDeadlineReminderTask = cron.schedule('0 * * * *', async () => {
      console.log('[CronService] Checking for assignment deadlines approaching in 24 hours...');
      await this.checkAssignmentDeadlineReminders();
    });
    this.tasks.push(assignmentDeadlineReminderTask);
    
    console.log('[CronService] Cron jobs started successfully');
    console.log('[CronService] - Monthly invoices: 2 AM on 1st of each month');
    console.log('[CronService] - Weekly invoices: 2 AM every Monday');
    console.log('[CronService] - Overdue check: 3 AM daily');
    console.log('[CronService] - Schedule status update: Every 15 minutes');
    console.log('[CronService] - Assignment deadline reminders: Every hour');
    
    // Run schedule status update immediately on startup
    this.updatePastScheduleStatuses().catch(err => 
      console.error('[CronService] Error running initial schedule status update:', err)
    );
  }

  // Stop all cron jobs
  stop() {
    console.log('[CronService] Stopping cron jobs...');
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    console.log('[CronService] Cron jobs stopped');
  }

  // Generate invoices for a specific billing cycle (monthly or weekly)
  async generateInvoicesByBillingCycle(billingCycle: 'monthly' | 'weekly') {
    try {
      const activeAssignments = await storage.getActiveStudentFeeAssignments();
      
      // Filter assignments by billing cycle
      const filteredAssignments = [];
      for (const assignment of activeAssignments) {
        const feePlan = await storage.getFeePlan(assignment.feePlanId);
        if (feePlan && feePlan.billingCycle === billingCycle) {
          filteredAssignments.push({ ...assignment, feePlan });
        }
      }
      
      console.log(`[CronService] Found ${filteredAssignments.length} active ${billingCycle} fee assignments`);
      
      // Process new invoices for the previous billing period
      for (const assignment of filteredAssignments) {
        try {
          await this.generateInvoiceForPreviousPeriod(assignment, billingCycle);
        } catch (error) {
          console.error(`[CronService] Error generating ${billingCycle} invoice for student ${assignment.studentId}:`, error);
        }
      }
      
      // Retry failed invoices for this billing cycle
      const failedLogs = await storage.getInvoiceGenerationLogsByStatus('failed');
      const relevantFailedLogs = [];
      for (const log of failedLogs) {
        const feePlan = await storage.getFeePlan(log.feePlanId);
        if (feePlan && feePlan.billingCycle === billingCycle && log.retryCount < 3) {
          relevantFailedLogs.push(log);
        }
      }
      
      console.log(`[CronService] Found ${relevantFailedLogs.length} failed ${billingCycle} invoice generation attempts to retry`);
      
      for (const failedLog of relevantFailedLogs) {
        try {
          console.log(`[CronService] Retrying failed invoice generation for idempotency key: ${failedLog.idempotencyKey}`);
          await this.retryFailedInvoice(failedLog);
        } catch (error) {
          console.error(`[CronService] Error retrying invoice for log ${failedLog.id}:`, error);
        }
      }
    } catch (error) {
      console.error(`[CronService] Error in generateInvoicesByBillingCycle (${billingCycle}):`, error);
    }
  }

  // Generate invoices for active student fee assignments (all billing cycles - for manual trigger)
  async generateInvoices() {
    try {
      const activeAssignments = await storage.getActiveStudentFeeAssignments();
      console.log(`[CronService] Found ${activeAssignments.length} active student fee assignments`);
      
      // Also retry failed invoice generations
      const failedLogs = await storage.getInvoiceGenerationLogsByStatus('failed');
      console.log(`[CronService] Found ${failedLogs.length} failed invoice generation attempts to retry`);
      
      // Process new invoices
      for (const assignment of activeAssignments) {
        try {
          await this.generateInvoiceForStudent(assignment);
        } catch (error) {
          console.error(`[CronService] Error generating invoice for student ${assignment.studentId}:`, error);
        }
      }
      
      // Retry failed invoices (up to 3 attempts)
      for (const failedLog of failedLogs) {
        if (failedLog.retryCount < 3) {
          try {
            console.log(`[CronService] Retrying failed invoice generation for idempotency key: ${failedLog.idempotencyKey}`);
            await this.retryFailedInvoice(failedLog);
          } catch (error) {
            console.error(`[CronService] Error retrying invoice for log ${failedLog.id}:`, error);
          }
        } else {
          console.log(`[CronService] Max retries (3) exceeded for invoice log ${failedLog.id}, skipping`);
        }
      }
    } catch (error) {
      console.error('[CronService] Error in generateInvoices:', error);
    }
  }
  
  // Retry a failed invoice generation
  private async retryFailedInvoice(log: any) {
    try {
      // Check if invoice was already created (partial success case)
      if (log.invoiceId) {
        const existingInvoice = await storage.getInvoice(log.invoiceId);
        if (existingInvoice) {
          console.log(`[CronService] Invoice ${log.invoiceId} already exists for failed log ${log.id}, marking as completed`);
          await storage.updateInvoiceGenerationLog(log.id, {
            status: 'completed',
            retryCount: log.retryCount + 1,
          });
          return;
        }
      }
      
      // Check for existing invoice using idempotency key
      const existingLogCheck = await storage.getInvoiceGenerationLogByIdempotencyKey(log.idempotencyKey);
      if (existingLogCheck && existingLogCheck.id !== log.id && existingLogCheck.invoiceId) {
        const existingInvoice = await storage.getInvoice(existingLogCheck.invoiceId);
        if (existingInvoice) {
          console.log(`[CronService] Duplicate invoice attempt detected for idempotency key ${log.idempotencyKey}, marking current log as failed`);
          await storage.updateInvoiceGenerationLog(log.id, {
            status: 'failed',
            errorMessage: 'Duplicate invoice already exists',
            retryCount: log.retryCount + 1,
          });
          return;
        }
      }
      
      const student = await storage.getUser(log.studentId);
      if (!student) {
        console.log(`[CronService] Student ${log.studentId} not found, marking as failed`);
        await storage.updateInvoiceGenerationLog(log.id, {
          status: 'failed',
          errorMessage: 'Student not found',
          retryCount: log.retryCount + 1,
        });
        return;
      }

      // Get parent from ParentChild relationship
      const parentRelationships = await storage.getParentsByChild(log.studentId);
      if (!parentRelationships || parentRelationships.length === 0) {
        console.log(`[CronService] Student ${log.studentId} has no parent relationship, marking as failed`);
        await storage.updateInvoiceGenerationLog(log.id, {
          status: 'failed',
          errorMessage: 'Student has no parent',
          retryCount: log.retryCount + 1,
        });
        return;
      }
      const parentId = parentRelationships[0].parentId;
      
      const feePlan = await storage.getFeePlan(log.feePlanId);
      if (!feePlan || !feePlan.isActive) {
        console.log(`[CronService] Fee plan ${log.feePlanId} is not active, marking as failed`);
        await storage.updateInvoiceGenerationLog(log.id, {
          status: 'failed',
          errorMessage: 'Fee plan is not active',
          retryCount: log.retryCount + 1,
        });
        return;
      }
      
      // Calculate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();
      const today = new Date();
      const dueDate = addDays(today, 7);
      const startDate = new Date(log.billingPeriodStart);
      const endDate = new Date(log.billingPeriodEnd);
      
      // Get scheduled classes for this student in the billing period
      const scheduledClasses = await storage.getSchedulesByStudentAndDateRange(
        log.studentId,
        startDate,
        endDate
      );
      const numberOfClasses = scheduledClasses.length;
      
      // Skip if no classes scheduled in this period
      if (numberOfClasses === 0) {
        console.log(`[CronService] No classes scheduled for retry period, marking as failed`);
        await storage.updateInvoiceGenerationLog(log.id, {
          status: 'failed',
          errorMessage: 'No classes scheduled in this billing period',
          retryCount: log.retryCount + 1,
        });
        return;
      }
      
      // Get base rate per class
      let ratePerClass = parseFloat(feePlan.ratePerClass || '0');
      
      // Apply state adjustment if applicable
      let stateAdjustmentDescription = '';
      if (student.state) {
        const stateFees = await storage.getStateFeeStructuresByFeePlan(feePlan.id);
        const stateMatch = stateFees.find(sf => sf.stateCode === student.state && sf.isActive);
        if (stateMatch) {
          const adjustmentValue = parseFloat(stateMatch.adjustmentValue);
          if (stateMatch.adjustmentType === 'percentage') {
            ratePerClass = ratePerClass + (ratePerClass * adjustmentValue / 100);
            stateAdjustmentDescription = ` (${stateMatch.stateCode}: +${adjustmentValue}%)`;
          } else {
            ratePerClass = ratePerClass + adjustmentValue;
            stateAdjustmentDescription = ` (${stateMatch.stateCode}: +$${adjustmentValue})`;
          }
        }
      }
      
      // Calculate subtotal (rate per class × number of classes)
      let subtotal = ratePerClass * numberOfClasses;
      
      // Apply discounts if applicable
      let discountAmount = 0;
      let discountDescription = '';
      const activeDiscounts = await storage.getActiveStudentDiscountsByStudent(log.studentId);
      for (const studentDiscount of activeDiscounts) {
        const discountStart = new Date(studentDiscount.startDate);
        const discountEnd = studentDiscount.endDate ? new Date(studentDiscount.endDate) : null;
        
        if (discountStart <= endDate && (!discountEnd || discountEnd >= startDate)) {
          const discount = await storage.getDiscount(studentDiscount.discountId);
          if (discount && discount.isActive) {
            const discountValue = parseFloat(discount.value);
            if (discount.type === 'percentage') {
              const thisDiscount = subtotal * discountValue / 100;
              discountAmount += thisDiscount;
              discountDescription += `${discount.name} (-${discountValue}%), `;
            } else {
              discountAmount += discountValue;
              discountDescription += `${discount.name} (-$${discountValue}), `;
            }
          }
        }
      }
      
      // Calculate final total
      const total = Math.max(0, subtotal - discountAmount);
      
      // Format period description
      const periodDescription = feePlan.billingCycle === 'weekly'
        ? `Week of ${format(startDate, 'MMM dd')} - ${format(endDate, 'MMM dd, yyyy')}`
        : format(startDate, 'MMMM yyyy');
      
      // Create invoice
      const invoice = await storage.createInvoice({
        invoiceNumber,
        studentId: log.studentId,
        parentId: parentId,
        feePlanId: log.feePlanId,
        billingPeriodStart: log.billingPeriodStart,
        billingPeriodEnd: log.billingPeriodEnd,
        subtotal: subtotal.toFixed(2),
        tax: '0.00',
        total: total.toFixed(2),
        status: 'pending',
        dueDate: dueDate.toISOString().split('T')[0],
        notes: `${feePlan.billingCycle === 'weekly' ? 'Weekly' : 'Monthly'} tuition fee for ${student.firstName} ${student.lastName} (Retry) - ${periodDescription}`,
      });
      
      // Create invoice line item for classes
      await storage.createInvoiceItem({
        invoiceId: invoice.id,
        description: `${feePlan.name} - ${numberOfClasses} class${numberOfClasses > 1 ? 'es' : ''} @ $${ratePerClass.toFixed(2)}/class${stateAdjustmentDescription} - ${periodDescription}`,
        quantity: numberOfClasses,
        unitPrice: ratePerClass.toFixed(2),
        amount: subtotal.toFixed(2),
      });
      
      // Create invoice line item for discount if applicable
      if (discountAmount > 0) {
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: `Discount: ${discountDescription.slice(0, -2)}`,
          quantity: 1,
          unitPrice: (-discountAmount).toFixed(2),
          amount: (-discountAmount).toFixed(2),
        });
      }
      
      // Record each session that was included in this invoice with course and teacher info
      const sessionRecords = await Promise.all(scheduledClasses.map(async (schedule) => {
        const course = await storage.getCourse(schedule.courseId);
        const teacher = await storage.getUser(schedule.teacherId);
        return {
          invoiceId: invoice.id,
          scheduleId: schedule.id,
          studentId: log.studentId,
          sessionDate: schedule.startTime,
          sessionTitle: schedule.title,
          courseName: course?.title || null,
          teacherName: teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || null : null,
          rateApplied: ratePerClass.toFixed(2),
          status: 'billed',
        };
      }));
      
      if (sessionRecords.length > 0) {
        await storage.createInvoiceSessions(sessionRecords);
        console.log(`[CronService] Recorded ${sessionRecords.length} sessions for retried invoice ${invoiceNumber}`);
      }
      
      // Update generation log to completed with invoice ID
      await storage.updateInvoiceGenerationLog(log.id, {
        status: 'completed',
        invoiceId: invoice.id,
        retryCount: log.retryCount + 1,
      });
      
      // Send notification to parent
      await storage.createNotification({
        userId: parentId,
        type: 'invoice_generated',
        title: 'New Invoice Generated',
        message: `A new invoice #${invoiceNumber} for $${total.toFixed(2)} has been generated for ${student.firstName} ${student.lastName} (${periodDescription}). Due date: ${format(dueDate, 'MMM dd, yyyy')}`,
        relatedId: invoice.id,
        relatedType: 'invoice',
      });
      
      console.log(`[CronService] Successfully retried invoice generation for log ${log.id} - ${numberOfClasses} classes, total: $${total.toFixed(2)}`);
    } catch (error: any) {
      // Update generation log with error
      await storage.updateInvoiceGenerationLog(log.id, {
        status: 'failed',
        errorMessage: error.message || 'Unknown error during retry',
        retryCount: log.retryCount + 1,
      });
      throw error;
    }
  }

  // Generate invoices for all completed periods since assignment start (called by scheduled cron jobs)
  private async generateInvoiceForPreviousPeriod(assignment: any, billingCycle: 'monthly' | 'weekly') {
    const feePlan = assignment.feePlan || await storage.getFeePlan(assignment.feePlanId);
    if (!feePlan || !feePlan.isActive) {
      console.log(`[CronService] Fee plan ${assignment.feePlanId} is not active, skipping`);
      return;
    }

    const student = await storage.getUser(assignment.studentId);
    if (!student) {
      console.log(`[CronService] Student ${assignment.studentId} not found, skipping`);
      return;
    }

    // Get parent from ParentChild relationship
    const parentRelationships = await storage.getParentsByChild(assignment.studentId);
    if (!parentRelationships || parentRelationships.length === 0) {
      console.log(`[CronService] Student ${assignment.studentId} has no parent relationship, skipping`);
      return;
    }
    const parentId = parentRelationships[0].parentId;

    const today = new Date();
    const assignmentStart = new Date(assignment.startDate);
    const assignmentEnd = assignment.endDate ? new Date(assignment.endDate) : null;

    // If assignment hasn't started yet, skip
    if (assignmentStart > today) {
      console.log(`[CronService] Assignment hasn't started yet (${format(assignmentStart, 'yyyy-MM-dd')}), skipping`);
      return;
    }

    // Get all completed billing periods from assignment start to today
    const completedPeriods = this.getCompletedBillingPeriods(assignmentStart, today, billingCycle);
    
    console.log(`[CronService] Found ${completedPeriods.length} completed periods for student ${assignment.studentId} (assignment: ${format(assignmentStart, 'yyyy-MM-dd')})`);

    // Process each completed period
    for (const period of completedPeriods) {
      // Skip if assignment ended before this period
      if (assignmentEnd && assignmentEnd < period.startDate) {
        console.log(`[CronService] Assignment ended before period ${format(period.startDate, 'yyyy-MM-dd')}, skipping`);
        continue;
      }

      // Generate idempotency key
      const idempotencyKey = this.generateIdempotencyKey(
        assignment.studentId,
        assignment.feePlanId,
        period.startDate,
        period.endDate
      );

      // Check if invoice already exists for this period
      const existingLog = await storage.getInvoiceGenerationLogByIdempotencyKey(idempotencyKey);
      if (existingLog) {
        if (existingLog.status === 'completed') {
          // Verify the invoice actually still exists in the database
          let invoiceExists = false;
          if (existingLog.invoiceId) {
            invoiceExists = !!(await storage.getInvoice(existingLog.invoiceId));
          }
          
          if (invoiceExists) {
            console.log(`[CronService] Invoice already exists for ${assignment.studentId} (${format(period.startDate, 'yyyy-MM-dd')} - ${format(period.endDate, 'yyyy-MM-dd')})`);
            continue;
          }
          
          // Invoice was deleted or log is orphaned (no invoiceId), allow regeneration by deleting the generation log
          await storage.deleteInvoiceGenerationLog(existingLog.id);
        } else if (existingLog.status === 'pending') {
          console.log(`[CronService] Invoice generation in progress for ${assignment.studentId} (${format(period.startDate, 'yyyy-MM-dd')} - ${format(period.endDate, 'yyyy-MM-dd')})`);
          continue;
        }
      }

      // Double-check for existing invoice in database (unique constraint protection)
      const existingInvoice = await storage.getExistingInvoiceForBillingPeriod(
        assignment.studentId,
        assignment.feePlanId,
        period.startDate.toISOString().split('T')[0],
        period.endDate.toISOString().split('T')[0]
      );
      
      if (existingInvoice) {
        console.log(`[CronService] Invoice ${existingInvoice.invoiceNumber} already exists for billing period. Skipping duplicate generation.`);
        continue;
      }

      // Create generation log entry
      const log = await storage.createInvoiceGenerationLog({
        idempotencyKey,
        status: 'pending',
        studentId: assignment.studentId,
        feePlanId: assignment.feePlanId,
        billingPeriodStart: period.startDate.toISOString().split('T')[0],
        billingPeriodEnd: period.endDate.toISOString().split('T')[0],
        retryCount: 0,
      });

      try {
        // Calculate invoice number
        const invoiceNumber = await this.generateInvoiceNumber();
        
        // Calculate due date (7 days from today, not from period end)
        const dueDate = addDays(today, 7);
        
        // Format period description
        const periodDescription = billingCycle === 'weekly' 
          ? `Week of ${format(period.startDate, 'MMM dd')} - ${format(period.endDate, 'MMM dd, yyyy')}`
          : format(period.startDate, 'MMMM yyyy');
        
        // Get scheduled classes for this student in the billing period
        const scheduledClasses = await storage.getSchedulesByStudentAndDateRange(
          assignment.studentId,
          period.startDate,
          period.endDate
        );
        const numberOfClasses = scheduledClasses.length;
        
        // Skip if no classes scheduled in this period
        if (numberOfClasses === 0) {
          console.log(`[CronService] No classes scheduled for student ${assignment.studentId} in period ${format(period.startDate, 'yyyy-MM-dd')} - ${format(period.endDate, 'yyyy-MM-dd')}, skipping`);
          await storage.deleteInvoiceGenerationLog(log.id);
          continue;
        }
        
        // Get base rate per class
        let ratePerClass = parseFloat(feePlan.ratePerClass || '0');
        
        // Apply state adjustment if applicable
        let stateAdjustmentDescription = '';
        if (student.state) {
          const stateFees = await storage.getStateFeeStructuresByFeePlan(feePlan.id);
          const stateMatch = stateFees.find(sf => sf.stateCode === student.state && sf.isActive);
          if (stateMatch) {
            const adjustmentValue = parseFloat(stateMatch.adjustmentValue);
            if (stateMatch.adjustmentType === 'percentage') {
              ratePerClass = ratePerClass + (ratePerClass * adjustmentValue / 100);
              stateAdjustmentDescription = ` (${stateMatch.stateCode}: +${adjustmentValue}%)`;
            } else {
              ratePerClass = ratePerClass + adjustmentValue;
              stateAdjustmentDescription = ` (${stateMatch.stateCode}: +$${adjustmentValue})`;
            }
          }
        }
        
        // Calculate subtotal (rate per class × number of classes)
        let subtotal = ratePerClass * numberOfClasses;
        
        // Apply discounts if applicable
        let discountAmount = 0;
        let discountDescription = '';
        const activeDiscounts = await storage.getActiveStudentDiscountsByStudent(assignment.studentId);
        for (const studentDiscount of activeDiscounts) {
          // Check if discount is valid for this period
          const discountStart = new Date(studentDiscount.startDate);
          const discountEnd = studentDiscount.endDate ? new Date(studentDiscount.endDate) : null;
          
          if (discountStart <= period.endDate && (!discountEnd || discountEnd >= period.startDate)) {
            const discount = await storage.getDiscount(studentDiscount.discountId);
            if (discount && discount.isActive) {
              const discountValue = parseFloat(discount.value);
              if (discount.type === 'percentage') {
                const thisDiscount = subtotal * discountValue / 100;
                discountAmount += thisDiscount;
                discountDescription += `${discount.name} (-${discountValue}%), `;
              } else {
                discountAmount += discountValue;
                discountDescription += `${discount.name} (-$${discountValue}), `;
              }
            }
          }
        }
        
        // Calculate final total
        const total = Math.max(0, subtotal - discountAmount);
        
        // Create invoice
        const invoice = await storage.createInvoice({
          invoiceNumber,
          studentId: assignment.studentId,
          parentId: parentId,
          feePlanId: assignment.feePlanId,
          billingPeriodStart: period.startDate.toISOString().split('T')[0],
          billingPeriodEnd: period.endDate.toISOString().split('T')[0],
          subtotal: subtotal.toFixed(2),
          tax: '0.00',
          total: total.toFixed(2),
          status: 'pending',
          dueDate: dueDate.toISOString().split('T')[0],
          notes: `${billingCycle === 'weekly' ? 'Weekly' : 'Monthly'} tuition fee for ${student.firstName} ${student.lastName} - ${periodDescription}`,
        });

        // Create invoice line item for classes
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: `${feePlan.name} - ${numberOfClasses} class${numberOfClasses > 1 ? 'es' : ''} @ $${ratePerClass.toFixed(2)}/class${stateAdjustmentDescription} - ${periodDescription}`,
          quantity: numberOfClasses,
          unitPrice: ratePerClass.toFixed(2),
          amount: subtotal.toFixed(2),
        });
        
        // Create invoice line item for discount if applicable
        if (discountAmount > 0) {
          await storage.createInvoiceItem({
            invoiceId: invoice.id,
            description: `Discount: ${discountDescription.slice(0, -2)}`,
            quantity: 1,
            unitPrice: (-discountAmount).toFixed(2),
            amount: (-discountAmount).toFixed(2),
          });
        }

        // Record each session that was included in this invoice with course and teacher info
        const sessionRecords = await Promise.all(scheduledClasses.map(async (schedule) => {
          const course = await storage.getCourse(schedule.courseId);
          const teacher = await storage.getUser(schedule.teacherId);
          return {
            invoiceId: invoice.id,
            scheduleId: schedule.id,
            studentId: assignment.studentId,
            sessionDate: schedule.startTime,
            sessionTitle: schedule.title,
            courseName: course?.title || null,
            teacherName: teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || null : null,
            rateApplied: ratePerClass.toFixed(2),
            status: 'billed',
          };
        }));
        
        if (sessionRecords.length > 0) {
          await storage.createInvoiceSessions(sessionRecords);
          console.log(`[CronService] Recorded ${sessionRecords.length} sessions for invoice ${invoiceNumber}`);
        }

        // Update generation log to completed
        await storage.updateInvoiceGenerationLog(log.id, {
          status: 'completed',
          invoiceId: invoice.id,
        });

        // Send notification to parent
        await storage.createNotification({
          userId: parentId,
          type: 'invoice_generated',
          title: 'New Invoice Generated',
          message: `A new invoice #${invoiceNumber} for $${total.toFixed(2)} has been generated for ${student.firstName} ${student.lastName} (${periodDescription}). Due date: ${format(dueDate, 'MMM dd, yyyy')}`,
          relatedId: invoice.id,
          relatedType: 'invoice',
        });

        console.log(`[CronService] Invoice ${invoiceNumber} generated successfully for student ${assignment.studentId} (${periodDescription}) - ${numberOfClasses} classes, total: $${total.toFixed(2)}`);
      } catch (error: any) {
        // Update generation log to failed
        await storage.updateInvoiceGenerationLog(log.id, {
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
          retryCount: (log.retryCount || 0) + 1,
        });
        console.error(`[CronService] Error generating invoice for period ${format(period.startDate, 'yyyy-MM-dd')} - ${format(period.endDate, 'yyyy-MM-dd')}:`, error);
      }
    }
  }

  // Generate invoices for all completed periods since assignment start (manual trigger)
  private async generateInvoiceForStudent(assignment: any) {
    const feePlan = await storage.getFeePlan(assignment.feePlanId);
    if (!feePlan || !feePlan.isActive) {
      console.log(`[CronService] Fee plan ${assignment.feePlanId} is not active, skipping`);
      return;
    }

    const student = await storage.getUser(assignment.studentId);
    if (!student) {
      console.log(`[CronService] Student ${assignment.studentId} not found, skipping`);
      return;
    }

    // Get parent from ParentChild relationship
    const parentRelationships = await storage.getParentsByChild(assignment.studentId);
    if (!parentRelationships || parentRelationships.length === 0) {
      console.log(`[CronService] Student ${assignment.studentId} has no parent relationship, skipping`);
      return;
    }
    const parentId = parentRelationships[0].parentId;

    const today = new Date();
    const assignmentStart = new Date(assignment.startDate);
    const assignmentEnd = assignment.endDate ? new Date(assignment.endDate) : null;

    // If assignment hasn't started yet, skip
    if (assignmentStart > today) {
      console.log(`[CronService] Assignment hasn't started yet (${format(assignmentStart, 'yyyy-MM-dd')}), skipping`);
      return;
    }

    // Get all completed billing periods from assignment start to today
    const completedPeriods = this.getCompletedBillingPeriods(assignmentStart, today, feePlan.billingCycle);
    
    console.log(`[CronService] Found ${completedPeriods.length} completed periods for student ${assignment.studentId} (assignment: ${format(assignmentStart, 'yyyy-MM-dd')})`);

    // Process each completed period
    for (const period of completedPeriods) {
      // Skip if assignment ended before this period
      if (assignmentEnd && assignmentEnd < period.startDate) {
        console.log(`[CronService] Assignment ended before period ${format(period.startDate, 'yyyy-MM-dd')}, skipping`);
        continue;
      }

      // Generate idempotency key
      const idempotencyKey = this.generateIdempotencyKey(
        assignment.studentId,
        assignment.feePlanId,
        period.startDate,
        period.endDate
      );

      // Check if invoice already exists for this period
      const existingLog = await storage.getInvoiceGenerationLogByIdempotencyKey(idempotencyKey);
      if (existingLog) {
        if (existingLog.status === 'completed') {
          // Verify the invoice actually still exists in the database
          let invoiceExists = false;
          if (existingLog.invoiceId) {
            invoiceExists = !!(await storage.getInvoice(existingLog.invoiceId));
          }
          
          if (invoiceExists) {
            console.log(`[CronService] Invoice already exists for ${assignment.studentId} (${format(period.startDate, 'yyyy-MM-dd')} - ${format(period.endDate, 'yyyy-MM-dd')})`);
            continue;
          }
          
          // Invoice was deleted or log is orphaned (no invoiceId), allow regeneration by deleting the generation log
          await storage.deleteInvoiceGenerationLog(existingLog.id);
        } else if (existingLog.status === 'pending') {
          console.log(`[CronService] Invoice generation in progress for ${assignment.studentId} (${format(period.startDate, 'yyyy-MM-dd')} - ${format(period.endDate, 'yyyy-MM-dd')})`);
          continue;
        }
      }

      // Double-check for existing invoice in database (unique constraint protection)
      const existingInvoice = await storage.getExistingInvoiceForBillingPeriod(
        assignment.studentId,
        assignment.feePlanId,
        period.startDate.toISOString().split('T')[0],
        period.endDate.toISOString().split('T')[0]
      );
      
      if (existingInvoice) {
        console.log(`[CronService] Invoice ${existingInvoice.invoiceNumber} already exists for billing period. Skipping duplicate generation.`);
        continue;
      }

      // Create generation log entry
      const log = await storage.createInvoiceGenerationLog({
        idempotencyKey,
        status: 'pending',
        studentId: assignment.studentId,
        feePlanId: assignment.feePlanId,
        billingPeriodStart: period.startDate.toISOString().split('T')[0],
        billingPeriodEnd: period.endDate.toISOString().split('T')[0],
        retryCount: 0,
      });

      try {
        // Calculate invoice number
        const invoiceNumber = await this.generateInvoiceNumber();
        
        // Calculate due date (7 days from today)
        const dueDate = addDays(today, 7);
        
        // Format period description
        const periodDescription = feePlan.billingCycle === 'weekly' 
          ? `Week of ${format(period.startDate, 'MMM dd')} - ${format(period.endDate, 'MMM dd, yyyy')}`
          : format(period.startDate, 'MMMM yyyy');
        
        // Get scheduled classes for this student in the billing period
        const scheduledClasses = await storage.getSchedulesByStudentAndDateRange(
          assignment.studentId,
          period.startDate,
          period.endDate
        );
        const numberOfClasses = scheduledClasses.length;
        
        // Skip if no classes scheduled in this period
        if (numberOfClasses === 0) {
          console.log(`[CronService] No classes scheduled for student ${assignment.studentId} in period ${format(period.startDate, 'yyyy-MM-dd')} - ${format(period.endDate, 'yyyy-MM-dd')}, skipping`);
          await storage.deleteInvoiceGenerationLog(log.id);
          continue;
        }
        
        // Get base rate per class
        let ratePerClass = parseFloat(feePlan.ratePerClass || '0');
        
        // Apply state adjustment if applicable
        let stateAdjustmentDescription = '';
        if (student.state) {
          const stateFees = await storage.getStateFeeStructuresByFeePlan(feePlan.id);
          const stateMatch = stateFees.find(sf => sf.stateCode === student.state && sf.isActive);
          if (stateMatch) {
            const adjustmentValue = parseFloat(stateMatch.adjustmentValue);
            if (stateMatch.adjustmentType === 'percentage') {
              ratePerClass = ratePerClass + (ratePerClass * adjustmentValue / 100);
              stateAdjustmentDescription = ` (${stateMatch.stateCode}: +${adjustmentValue}%)`;
            } else {
              ratePerClass = ratePerClass + adjustmentValue;
              stateAdjustmentDescription = ` (${stateMatch.stateCode}: +$${adjustmentValue})`;
            }
          }
        }
        
        // Calculate subtotal (rate per class × number of classes)
        let subtotal = ratePerClass * numberOfClasses;
        
        // Apply discounts if applicable
        let discountAmount = 0;
        let discountDescription = '';
        const activeDiscounts = await storage.getActiveStudentDiscountsByStudent(assignment.studentId);
        for (const studentDiscount of activeDiscounts) {
          // Check if discount is valid for this period
          const discountStart = new Date(studentDiscount.startDate);
          const discountEnd = studentDiscount.endDate ? new Date(studentDiscount.endDate) : null;
          
          if (discountStart <= period.endDate && (!discountEnd || discountEnd >= period.startDate)) {
            const discount = await storage.getDiscount(studentDiscount.discountId);
            if (discount && discount.isActive) {
              const discountValue = parseFloat(discount.value);
              if (discount.type === 'percentage') {
                const thisDiscount = subtotal * discountValue / 100;
                discountAmount += thisDiscount;
                discountDescription += `${discount.name} (-${discountValue}%), `;
              } else {
                discountAmount += discountValue;
                discountDescription += `${discount.name} (-$${discountValue}), `;
              }
            }
          }
        }
        
        // Calculate final total
        const total = Math.max(0, subtotal - discountAmount);
        
        // Create invoice
        const invoice = await storage.createInvoice({
          invoiceNumber,
          studentId: assignment.studentId,
          parentId: parentId,
          feePlanId: assignment.feePlanId,
          billingPeriodStart: period.startDate.toISOString().split('T')[0],
          billingPeriodEnd: period.endDate.toISOString().split('T')[0],
          subtotal: subtotal.toFixed(2),
          tax: '0.00',
          total: total.toFixed(2),
          status: 'pending',
          dueDate: dueDate.toISOString().split('T')[0],
          notes: `${feePlan.billingCycle === 'weekly' ? 'Weekly' : 'Monthly'} tuition fee for ${student.firstName} ${student.lastName} - ${periodDescription}`,
        });

        // Create invoice line item for classes
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: `${feePlan.name} - ${numberOfClasses} class${numberOfClasses > 1 ? 'es' : ''} @ $${ratePerClass.toFixed(2)}/class${stateAdjustmentDescription} - ${periodDescription}`,
          quantity: numberOfClasses,
          unitPrice: ratePerClass.toFixed(2),
          amount: subtotal.toFixed(2),
        });
        
        // Create invoice line item for discount if applicable
        if (discountAmount > 0) {
          await storage.createInvoiceItem({
            invoiceId: invoice.id,
            description: `Discount: ${discountDescription.slice(0, -2)}`,
            quantity: 1,
            unitPrice: (-discountAmount).toFixed(2),
            amount: (-discountAmount).toFixed(2),
          });
        }

        // Record each session that was included in this invoice with course and teacher info
        const sessionRecords = await Promise.all(scheduledClasses.map(async (schedule) => {
          const course = await storage.getCourse(schedule.courseId);
          const teacher = await storage.getUser(schedule.teacherId);
          return {
            invoiceId: invoice.id,
            scheduleId: schedule.id,
            studentId: assignment.studentId,
            sessionDate: schedule.startTime,
            sessionTitle: schedule.title,
            courseName: course?.title || null,
            teacherName: teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || null : null,
            rateApplied: ratePerClass.toFixed(2),
            status: 'billed',
          };
        }));
        
        if (sessionRecords.length > 0) {
          await storage.createInvoiceSessions(sessionRecords);
          console.log(`[CronService] Recorded ${sessionRecords.length} sessions for invoice ${invoiceNumber}`);
        }

        // Update generation log to completed
        await storage.updateInvoiceGenerationLog(log.id, {
          status: 'completed',
          invoiceId: invoice.id,
        });

        // Send notification to parent
        await storage.createNotification({
          userId: parentId,
          type: 'invoice_generated',
          title: 'New Invoice Generated',
          message: `A new invoice #${invoiceNumber} for $${total.toFixed(2)} has been generated for ${student.firstName} ${student.lastName} (${periodDescription}). Due date: ${format(dueDate, 'MMM dd, yyyy')}`,
          relatedId: invoice.id,
          relatedType: 'invoice',
        });

        console.log(`[CronService] Invoice ${invoiceNumber} generated successfully for student ${assignment.studentId} (${periodDescription}) - ${numberOfClasses} classes, total: $${total.toFixed(2)}`);
      } catch (error: any) {
        // Update generation log to failed
        await storage.updateInvoiceGenerationLog(log.id, {
          status: 'failed',
          errorMessage: error.message || 'Unknown error',
          retryCount: (log.retryCount || 0) + 1,
        });
        console.error(`[CronService] Error generating invoice for period ${format(period.startDate, 'yyyy-MM-dd')} - ${format(period.endDate, 'yyyy-MM-dd')}:`, error);
      }
    }
  }

  // Get all completed billing periods from start date to reference date
  private getCompletedBillingPeriods(startDate: Date, referenceDate: Date, billingCycle: 'weekly' | 'monthly'): Array<{ startDate: Date; endDate: Date }> {
    const periods: Array<{ startDate: Date; endDate: Date }> = [];
    
    if (billingCycle === 'weekly') {
      // Get the first Monday on or after start date
      let currentStart = startOfWeek(startDate, { weekStartsOn: 1 });
      
      // If start date is after the Monday of its week, move to current week
      if (startDate > currentStart) {
        currentStart = startOfWeek(startDate, { weekStartsOn: 1 });
      }
      
      // Generate all completed weeks
      let currentEnd = endOfWeek(currentStart, { weekStartsOn: 1 });
      
      while (currentEnd < referenceDate) {
        periods.push({ startDate: currentStart, endDate: currentEnd });
        currentStart = addWeeks(currentStart, 1);
        currentEnd = endOfWeek(currentStart, { weekStartsOn: 1 });
      }
    } else {
      // Monthly
      let currentStart = startOfMonth(startDate);
      
      // Generate all completed months
      let currentEnd = endOfMonth(currentStart);
      
      while (currentEnd < referenceDate) {
        periods.push({ startDate: currentStart, endDate: currentEnd });
        currentStart = addMonths(currentStart, 1);
        currentEnd = endOfMonth(currentStart);
      }
    }
    
    return periods;
  }

  // Calculate billing period based on billing cycle (current period)
  private calculateBillingPeriod(referenceDate: Date, billingCycle: 'weekly' | 'monthly'): { startDate: Date; endDate: Date } {
    if (billingCycle === 'weekly') {
      const startDate = startOfWeek(referenceDate, { weekStartsOn: 1 }); // Monday
      const endDate = endOfWeek(referenceDate, { weekStartsOn: 1 }); // Sunday
      return { startDate, endDate };
    } else {
      // Monthly
      const startDate = startOfMonth(referenceDate);
      const endDate = endOfMonth(referenceDate);
      return { startDate, endDate };
    }
  }

  // Calculate the PREVIOUS billing period (for scheduled invoice generation)
  // Monthly: called on 1st of month, generates for previous month
  // Weekly: called on Monday, generates for previous week
  private calculatePreviousBillingPeriod(referenceDate: Date, billingCycle: 'weekly' | 'monthly'): { startDate: Date; endDate: Date } {
    if (billingCycle === 'weekly') {
      // Get the previous week (last Monday to last Sunday)
      const previousWeekDate = addWeeks(referenceDate, -1);
      const startDate = startOfWeek(previousWeekDate, { weekStartsOn: 1 }); // Previous Monday
      const endDate = endOfWeek(previousWeekDate, { weekStartsOn: 1 }); // Previous Sunday
      return { startDate, endDate };
    } else {
      // Monthly - get the previous month
      const previousMonthDate = addMonths(referenceDate, -1);
      const startDate = startOfMonth(previousMonthDate);
      const endDate = endOfMonth(previousMonthDate);
      return { startDate, endDate };
    }
  }

  // Generate idempotency key
  private generateIdempotencyKey(studentId: string, feePlanId: string, startDate: Date, endDate: Date): string {
    const start = format(startDate, 'yyyy-MM-dd');
    const end = format(endDate, 'yyyy-MM-dd');
    return `invoice:${studentId}:${feePlanId}:${start}:${end}`;
  }

  // Generate unique invoice number
  private async generateInvoiceNumber(): Promise<string> {
    const today = new Date();
    const prefix = format(today, 'yyyyMMdd');
    const allInvoices = await storage.getAllInvoices();
    
    // Filter invoices with same date prefix
    const todayInvoices = allInvoices.filter(inv => 
      inv.invoiceNumber && inv.invoiceNumber.startsWith(`INV-${prefix}`)
    );
    
    const nextSequence = todayInvoices.length + 1;
    return `INV-${prefix}-${String(nextSequence).padStart(4, '0')}`;
  }

  // Check for overdue invoices and update status
  async checkOverdueInvoices() {
    try {
      const pendingInvoices = await storage.getInvoicesByStatus('pending');
      const today = new Date().toISOString().split('T')[0];
      
      let overdueCount = 0;
      for (const invoice of pendingInvoices) {
        if (invoice.dueDate < today) {
          await storage.updateInvoice(invoice.id, { status: 'overdue' });
          
          // Send overdue notification to parent
          await storage.createNotification({
            userId: invoice.parentId,
            type: 'invoice_generated',
            title: 'Invoice Overdue',
            message: `Invoice #${invoice.invoiceNumber} for $${invoice.total} is now overdue. Please make payment as soon as possible.`,
            relatedId: invoice.id,
            relatedType: 'invoice',
          });
          
          overdueCount++;
        }
      }
      
      console.log(`[CronService] Marked ${overdueCount} invoices as overdue`);
    } catch (error) {
      console.error('[CronService] Error checking overdue invoices:', error);
    }
  }

  // Manual trigger for testing - generates invoices for all billing cycles
  async triggerInvoiceGeneration() {
    console.log('[CronService] Manual invoice generation triggered (all billing cycles)');
    await this.generateInvoices();
  }

  // Manual trigger for specific billing cycle
  async triggerMonthlyInvoiceGeneration() {
    console.log('[CronService] Manual monthly invoice generation triggered');
    await this.generateInvoicesByBillingCycle('monthly');
  }

  async triggerWeeklyInvoiceGeneration() {
    console.log('[CronService] Manual weekly invoice generation triggered');
    await this.generateInvoicesByBillingCycle('weekly');
  }

  async triggerOverdueCheck() {
    console.log('[CronService] Manual overdue check triggered');
    await this.checkOverdueInvoices();
  }

  // Update schedule statuses for past schedules
  async updatePastScheduleStatuses() {
    try {
      const allSchedules = await storage.getAllSchedules();
      const now = new Date();
      
      let updatedCount = 0;
      for (const schedule of allSchedules) {
        const endTime = new Date(schedule.endTime);
        
        // If schedule has ended and status is "scheduled" or "rescheduled", mark as "completed"
        if (endTime <= now && (schedule.status === 'scheduled' || schedule.status === 'rescheduled')) {
          await storage.updateSchedule(schedule.id, { status: 'completed' });
          updatedCount++;
          console.log(`[CronService] Marked schedule ${schedule.id} (${schedule.title}) as completed`);
        }
      }
      
      if (updatedCount > 0) {
        console.log(`[CronService] Updated ${updatedCount} schedule(s) to completed status`);
      }
    } catch (error) {
      console.error('[CronService] Error updating past schedule statuses:', error);
    }
  }

  // Manual trigger for testing
  async triggerScheduleStatusUpdate() {
    console.log('[CronService] Manual schedule status update triggered');
    await this.updatePastScheduleStatuses();
  }

  async checkAssignmentDeadlineReminders() {
    try {
      const allCourses = await storage.getAllCourses();
      const now = new Date();
      const in24Hours = addHours(now, 24);
      let remindersSent = 0;

      for (const course of allCourses) {
        const assignments = await storage.getAssignmentsByCourse(course.id);

        for (const assignment of assignments) {
          if (!assignment.isPublished || !assignment.dueDate) continue;

          const dueDate = new Date(assignment.dueDate);

          if (dueDate <= now || dueDate > in24Hours) continue;

          const enrollments = await storage.getEnrollmentsByCourse(course.id);

          let studentsToCheck: string[] = [];
          if (assignment.isShared) {
            studentsToCheck = enrollments.map(e => e.studentId);
          } else {
            const mappings = await storage.getIndividualAssignmentMappingsByAssignment(assignment.id);
            studentsToCheck = mappings.map(m => m.studentId);
          }

          const existingSubmissions = await storage.getSubmissionsByAssignment(assignment.id);
          const submittedStudentIds = new Set(existingSubmissions.map(s => s.studentId));

          for (const studentId of studentsToCheck) {
            if (submittedStudentIds.has(studentId)) continue;

            const alreadySent = await storage.hasDeadlineReminderBeenSent(assignment.id, studentId);
            if (alreadySent) continue;

            const parentRelationships = await storage.getParentsByChild(studentId);
            if (!parentRelationships || parentRelationships.length === 0) continue;

            const student = await storage.getUser(studentId);
            if (!student) continue;

            const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';

            for (const parentRel of parentRelationships) {
              const parent = await storage.getUser(parentRel.parentId);
              if (!parent || !parent.email) continue;

              const parentName = `${parent.firstName || ''} ${parent.lastName || ''}`.trim() || 'Parent';
              const formattedDueDate = format(dueDate, 'MMM dd, yyyy h:mm a');

              try {
                await sendAssignmentDeadlineReminderEmail(
                  parent.email,
                  parentName,
                  studentName,
                  assignment.title,
                  course.title,
                  formattedDueDate
                );

                await storage.createDeadlineReminder(assignment.id, studentId, parentRel.parentId);

                await storage.createNotification({
                  userId: parentRel.parentId,
                  type: 'assignment_reminder',
                  title: 'Assignment Deadline Reminder',
                  message: `${studentName}'s assignment "${assignment.title}" in ${course.title} is due in less than 24 hours and has not been submitted yet.`,
                  relatedId: assignment.id,
                  relatedType: 'assignment',
                });

                remindersSent++;
                console.log(`[CronService] Sent deadline reminder for "${assignment.title}" to parent ${parent.email} (student: ${studentName})`);
              } catch (emailError) {
                console.error(`[CronService] Failed to send deadline reminder email to ${parent.email}:`, emailError);
              }
            }
          }
        }
      }

      if (remindersSent > 0) {
        console.log(`[CronService] Sent ${remindersSent} assignment deadline reminder(s)`);
      } else {
        console.log('[CronService] No assignment deadline reminders needed');
      }
    } catch (error) {
      console.error('[CronService] Error checking assignment deadline reminders:', error);
    }
  }

  async triggerAssignmentDeadlineCheck() {
    console.log('[CronService] Manual assignment deadline reminder check triggered');
    await this.checkAssignmentDeadlineReminders();
  }
}

export const cronService = CronService.getInstance();
