import { GoogleCalendarService, CalendarEventData, TokenRefreshCallback } from './google-calendar';
import type { Schedule, Course, User } from '@shared/schema';
import type { IStorage } from '../storage';

function createTokenRefreshCallback(storage: IStorage, userId: string): TokenRefreshCallback {
  return async (newTokens) => {
    const updateData: any = {
      accessToken: newTokens.accessToken,
      tokenExpiresAt: newTokens.tokenExpiresAt,
    };
    if (newTokens.refreshToken) {
      updateData.refreshToken = newTokens.refreshToken;
    }
    await storage.updateGoogleCalendarSettings(userId, updateData);
  };
}

export async function syncScheduleToCalendar(
  storage: IStorage,
  schedule: Schedule,
  action: 'create' | 'update' | 'cancel' | 'delete'
): Promise<void> {
  try {
    const course = schedule.courseId ? await storage.getCourse(schedule.courseId) : null;
    const teacher = schedule.teacherId ? await storage.getUser(schedule.teacherId) : null;

    const usersToSync: string[] = [];
    
    if (teacher) {
      usersToSync.push(teacher.id);
    }
    
    if (course) {
      const enrollments = await storage.getEnrollmentsByCourse(course.id);
      for (const enrollment of enrollments) {
        const student = await storage.getUser(enrollment.studentId);
        if (student) {
          const parentRelationships = await storage.getParentsByChild(student.id);
          for (const rel of parentRelationships) {
            usersToSync.push(rel.parentId);
          }
        }
      }
    }

    const uniqueUsers = Array.from(new Set(usersToSync));
    
    for (const userId of uniqueUsers) {
      await syncScheduleForUser(storage, schedule, userId, action, course || null, teacher || null);
    }
  } catch (error) {
    console.error('Error in calendar sync:', error);
  }
}

async function syncScheduleForUser(
  storage: IStorage,
  schedule: Schedule,
  userId: string,
  action: 'create' | 'update' | 'cancel' | 'delete',
  course: Course | null,
  teacher: User | null
): Promise<void> {
  try {
    const settings = await storage.getGoogleCalendarSettings(userId);
    
    if (!settings?.isEnabled || !settings.calendarId) {
      return;
    }

    if (!settings.accessToken) {
      return;
    }

    const onTokenRefresh = createTokenRefreshCallback(storage, userId);
    const calendarService = new GoogleCalendarService({
      accessToken: settings.accessToken,
      refreshToken: settings.refreshToken || '',
      tokenExpiresAt: settings.tokenExpiresAt,
    }, onTokenRefresh);

    const existingEvent = await storage.getGoogleCalendarEvent(schedule.id, userId);

    const eventData: CalendarEventData = {
      scheduleId: schedule.id,
      title: schedule.title,
      description: schedule.description || undefined,
      startTime: new Date(schedule.startTime),
      endTime: new Date(schedule.endTime),
      location: schedule.location || undefined,
      externalLink: schedule.externalLink || undefined,
      courseName: course?.title,
      teacherName: teacher ? `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.name || undefined : undefined,
    };

    switch (action) {
      case 'create':
        if (!existingEvent && settings.syncClasses) {
          const result = await calendarService.createEvent(settings.calendarId, eventData);
          if (result.success && result.googleEventId) {
            await storage.createGoogleCalendarEvent({
              userId,
              scheduleId: schedule.id,
              googleEventId: result.googleEventId,
              calendarId: settings.calendarId,
              syncStatus: 'synced',
            });
          } else if (result.needsReauth) {
            await storage.updateGoogleCalendarSettings(userId, { isEnabled: false });
          }
        }
        break;

      case 'update':
        if (existingEvent && settings.syncReschedules) {
          const result = await calendarService.updateEvent(
            settings.calendarId,
            existingEvent.googleEventId,
            eventData
          );
          if (result.success) {
            await storage.updateGoogleCalendarEvent(existingEvent.id, {
              syncStatus: 'synced',
            });
          } else if (result.needsReauth) {
            await storage.updateGoogleCalendarSettings(userId, { isEnabled: false });
          }
        } else if (!existingEvent && settings.syncClasses) {
          const result = await calendarService.createEvent(settings.calendarId, eventData);
          if (result.success && result.googleEventId) {
            await storage.createGoogleCalendarEvent({
              userId,
              scheduleId: schedule.id,
              googleEventId: result.googleEventId,
              calendarId: settings.calendarId,
              syncStatus: 'synced',
            });
          } else if (result.needsReauth) {
            await storage.updateGoogleCalendarSettings(userId, { isEnabled: false });
          }
        }
        break;

      case 'cancel':
        if (existingEvent && settings.syncCancellations) {
          const result = await calendarService.cancelEvent(
            settings.calendarId,
            existingEvent.googleEventId
          );
          if (result.success) {
            await storage.updateGoogleCalendarEvent(existingEvent.id, {
              syncStatus: 'cancelled',
            });
          } else if (result.needsReauth) {
            await storage.updateGoogleCalendarSettings(userId, { isEnabled: false });
          }
        }
        break;

      case 'delete':
        if (existingEvent) {
          const result = await calendarService.deleteEvent(
            settings.calendarId,
            existingEvent.googleEventId
          );
          if (result.success) {
            await storage.deleteGoogleCalendarEvent(existingEvent.id);
          }
        }
        break;
    }
  } catch (error) {
    console.error(`Error syncing schedule for user ${userId}:`, error);
  }
}
