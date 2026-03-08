import { addDays, addWeeks, addMonths, addYears, isBefore, isAfter, startOfDay, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import type { ScheduleRecurrence } from '../shared/schema';

export interface RecurrenceOccurrence {
  startTime: Date;
  endTime: Date;
  occurrenceIndex: number;
}

/**
 * Generate occurrences for a recurring schedule
 * @param recurrence The recurrence rule
 * @param maxOccurrences Maximum number of occurrences to generate (default: 100)
 * @param fromDate Start generating from this date (default: recurrence startTime)
 * @param exceptions Array of exception dates to skip
 * @returns Array of occurrence dates with their indices
 */
export function generateRecurrenceOccurrences(
  recurrence: ScheduleRecurrence,
  maxOccurrences: number = 100,
  fromDate?: Date,
  exceptions?: Date[]
): RecurrenceOccurrence[] {
  const occurrences: RecurrenceOccurrence[] = [];
  const duration = new Date(recurrence.endTime).getTime() - new Date(recurrence.startTime).getTime();
  
  // Start from recurrence start to ensure accurate indexing
  const recurrenceStart = new Date(recurrence.startTime);
  let currentDate = new Date(recurrenceStart);
  let occurrenceIndex = 0;
  const skipBeforeDate = fromDate ? startOfDay(new Date(fromDate)) : null;
  
  // Calculate dynamic iteration limit based on time span
  // Default: 5 years of daily checks (1825 days)
  // If fromDate is far in future, extend limit to cover that span plus buffer
  let safetyIterationLimit = 365 * 5 + 100;
  if (fromDate) {
    const daysBetween = Math.floor((new Date(fromDate).getTime() - recurrenceStart.getTime()) / (1000 * 60 * 60 * 24));
    if (daysBetween > 0) {
      // Extend limit to cover the span to fromDate plus 5 years
      safetyIterationLimit = Math.max(safetyIterationLimit, daysBetween + (365 * 5));
    }
  }
  
  // Calendar horizon: limit how far we'll generate (prevents infinite loops)
  const horizonDate = fromDate 
    ? addYears(new Date(fromDate), 5)
    : addYears(recurrenceStart, 5);
  let iterationCount = 0;
  
  while (occurrences.length < maxOccurrences && iterationCount < safetyIterationLimit) {
    iterationCount++;
    
    // Stop if we've exceeded the calendar horizon
    if (isAfter(currentDate, horizonDate)) {
      break;
    }
    // Check end conditions
    if (recurrence.endType === 'until_date' && recurrence.endDate) {
      if (isAfter(currentDate, new Date(recurrence.endDate))) {
        break;
      }
    }
    
    if (recurrence.endType === 'after_occurrences' && recurrence.occurrenceCount) {
      if (occurrenceIndex >= recurrence.occurrenceCount) {
        break;
      }
    }
    
    // Check if this date matches the recurrence pattern
    if (matchesRecurrencePattern(currentDate, recurrence)) {
      // Check if this date is an exception (skip if it is)
      // Use UTC ISO date strings for reliable comparison
      const currentDateStr = startOfDay(currentDate).toISOString().split('T')[0];
      const isException = exceptions?.some(exDate => {
        const exDateStr = startOfDay(new Date(exDate)).toISOString().split('T')[0];
        return exDateStr === currentDateStr;
      });
      
      if (!isException) {
        // Only add if we're past the skipBeforeDate
        if (!skipBeforeDate || !isBefore(startOfDay(currentDate), skipBeforeDate)) {
          occurrences.push({
            startTime: new Date(currentDate),
            endTime: new Date(currentDate.getTime() + duration),
            occurrenceIndex
          });
        }
      }
      
      // Always increment index for matching dates (even if skipped)
      occurrenceIndex++;
    }
    
    // Move to next candidate date
    currentDate = getNextCandidateDate(currentDate, recurrence);
  }
  
  return occurrences;
}

/**
 * Check if a date matches the recurrence pattern
 */
function matchesRecurrencePattern(date: Date, recurrence: ScheduleRecurrence): boolean {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const dayOfMonth = date.getDate();
  const interval = recurrence.interval || 1;
  const recurrenceStart = new Date(recurrence.startTime);
  
  switch (recurrence.frequency) {
    case 'daily':
      // Check if this date falls on the interval (every N days from start)
      const daysSinceStart = Math.floor((date.getTime() - recurrenceStart.getTime()) / (1000 * 60 * 60 * 24));
      return daysSinceStart >= 0 && daysSinceStart % interval === 0;
      
    case 'weekly':
    case 'biweekly': {
      // First check if the day of week matches
      let matchesDayOfWeek = false;
      if (recurrence.weekdays) {
        try {
          const allowedWeekdays = JSON.parse(recurrence.weekdays) as number[];
          matchesDayOfWeek = allowedWeekdays.includes(dayOfWeek);
        } catch {
          // If weekdays is not valid JSON, default to same day of week as start
          const startDayOfWeek = recurrenceStart.getDay();
          matchesDayOfWeek = dayOfWeek === startDayOfWeek;
        }
      } else {
        // Default to same day of week as recurrence start
        const startDayOfWeek = recurrenceStart.getDay();
        matchesDayOfWeek = dayOfWeek === startDayOfWeek;
      }
      
      if (!matchesDayOfWeek) return false;
      
      // Then check if this week falls on the interval
      const weeksSinceStart = Math.floor((date.getTime() - recurrenceStart.getTime()) / (1000 * 60 * 60 * 24 * 7));
      const weekInterval = recurrence.frequency === 'biweekly' ? interval * 2 : interval;
      return weeksSinceStart >= 0 && weeksSinceStart % weekInterval === 0;
    }
      
    case 'monthly': {
      // Check if this day of month matches (with overflow clamping)
      const targetDay = recurrence.monthDay || recurrenceStart.getDate();
      
      // Clamp to last valid day of month (e.g., Jan 31 → Feb 28/29)
      const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const clampedDay = Math.min(targetDay, daysInMonth);
      
      if (dayOfMonth !== clampedDay) return false;
      
      // Check if this month falls on the interval
      const monthsSinceStart = 
        (date.getFullYear() - recurrenceStart.getFullYear()) * 12 + 
        (date.getMonth() - recurrenceStart.getMonth());
      return monthsSinceStart >= 0 && monthsSinceStart % interval === 0;
    }
      
    case 'custom': {
      // For custom, treat interval as days
      const daysSinceStart = Math.floor((date.getTime() - recurrenceStart.getTime()) / (1000 * 60 * 60 * 24));
      return daysSinceStart >= 0 && daysSinceStart % interval === 0;
    }
      
    default:
      return false;
  }
}

/**
 * Get the next candidate date to check
 * Always iterates day-by-day to ensure multi-weekday patterns work correctly
 */
function getNextCandidateDate(currentDate: Date, recurrence: ScheduleRecurrence): Date {
  // Always move forward one day to check all dates
  // The matchesRecurrencePattern function will determine if it's a valid occurrence
  return addDays(currentDate, 1);
}

/**
 * Generate occurrences for the next N months
 */
export function generateOccurrencesForHorizon(
  recurrence: ScheduleRecurrence,
  monthsAhead: number = 12
): RecurrenceOccurrence[] {
  const endDate = addMonths(new Date(), monthsAhead);
  const tempRecurrence: ScheduleRecurrence = {
    ...recurrence,
    endType: 'until_date' as const,
    endDate: endDate
  };
  
  return generateRecurrenceOccurrences(tempRecurrence, 365); // Max 365 per year
}

/**
 * Check if a specific date would be an occurrence
 */
export function isOccurrenceDate(date: Date, recurrence: ScheduleRecurrence): boolean {
  const normalizedDate = startOfDay(date);
  const recurrenceStart = startOfDay(new Date(recurrence.startTime));
  
  // Date must be on or after recurrence start
  if (isBefore(normalizedDate, recurrenceStart)) {
    return false;
  }
  
  // Check end conditions
  if (recurrence.endType === 'until_date' && recurrence.endDate) {
    if (isAfter(normalizedDate, startOfDay(new Date(recurrence.endDate)))) {
      return false;
    }
  }
  
  return matchesRecurrencePattern(date, recurrence);
}
