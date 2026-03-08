import { google, calendar_v3 } from 'googleapis';
import { refreshAccessToken } from './google-oauth';

export interface UserTokens {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date | null;
}

export interface TokenRefreshCallback {
  (newTokens: { accessToken: string; refreshToken?: string; tokenExpiresAt: Date }): Promise<void>;
}

async function getCalendarClientForUser(
  tokens: UserTokens,
  onTokenRefresh?: TokenRefreshCallback
): Promise<calendar_v3.Calendar> {
  let accessToken = tokens.accessToken;
  
  if (tokens.tokenExpiresAt && new Date(tokens.tokenExpiresAt) < new Date()) {
    if (tokens.refreshToken) {
      try {
        const refreshed = await refreshAccessToken(tokens.refreshToken);
        accessToken = refreshed.accessToken;
        
        tokens.accessToken = refreshed.accessToken;
        if (refreshed.refreshToken) {
          tokens.refreshToken = refreshed.refreshToken;
        }
        tokens.tokenExpiresAt = refreshed.expiresAt;
        
        if (onTokenRefresh) {
          await onTokenRefresh({
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken,
            tokenExpiresAt: refreshed.expiresAt,
          });
        }
      } catch (error) {
        console.error('Failed to refresh token:', error);
        throw new Error('Token expired and refresh failed');
      }
    } else {
      throw new Error('Token expired and no refresh token available');
    }
  }

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

export interface CalendarEventData {
  scheduleId: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  externalLink?: string;
  courseName?: string;
  teacherName?: string;
  studentName?: string;
}

export interface GoogleCalendarSyncResult {
  success: boolean;
  googleEventId?: string;
  error?: string;
  needsReauth?: boolean;
}

function buildEventDescription(event: CalendarEventData): string {
  let description = event.description || '';
  if (event.courseName) {
    description = `Course: ${event.courseName}\n${description}`;
  }
  if (event.teacherName) {
    description = `${description}\nTeacher: ${event.teacherName}`;
  }
  if (event.studentName) {
    description = `${description}\nStudent: ${event.studentName}`;
  }
  if (event.externalLink) {
    description = `${description}\n\nJoin Link: ${event.externalLink}`;
  }
  return description.trim();
}

export class GoogleCalendarService {
  private tokens: UserTokens;
  private onTokenRefresh?: TokenRefreshCallback;

  constructor(tokens: UserTokens, onTokenRefresh?: TokenRefreshCallback) {
    this.tokens = tokens;
    this.onTokenRefresh = onTokenRefresh;
  }

  async createEvent(calendarId: string, event: CalendarEventData): Promise<GoogleCalendarSyncResult> {
    try {
      const calendar = await getCalendarClientForUser(this.tokens, this.onTokenRefresh);
      
      const response = await calendar.events.insert({
        calendarId: calendarId || 'primary',
        requestBody: {
          summary: event.title,
          description: buildEventDescription(event),
          location: event.location,
          start: {
            dateTime: event.startTime.toISOString(),
            timeZone: 'UTC',
          },
          end: {
            dateTime: event.endTime.toISOString(),
            timeZone: 'UTC',
          },
          extendedProperties: {
            private: {
              learningPlatformScheduleId: event.scheduleId,
            },
          },
        },
      });

      return {
        success: true,
        googleEventId: response.data.id || undefined,
      };
    } catch (error: any) {
      console.error('Error creating Google Calendar event:', error);
      const needsReauth = error.code === 401 || error.message?.includes('invalid_grant');
      return {
        success: false,
        error: error.message || 'Failed to create calendar event',
        needsReauth,
      };
    }
  }

  async updateEvent(calendarId: string, googleEventId: string, event: CalendarEventData): Promise<GoogleCalendarSyncResult> {
    try {
      const calendar = await getCalendarClientForUser(this.tokens, this.onTokenRefresh);
      
      await calendar.events.update({
        calendarId: calendarId || 'primary',
        eventId: googleEventId,
        requestBody: {
          summary: event.title,
          description: buildEventDescription(event),
          location: event.location,
          start: {
            dateTime: event.startTime.toISOString(),
            timeZone: 'UTC',
          },
          end: {
            dateTime: event.endTime.toISOString(),
            timeZone: 'UTC',
          },
          extendedProperties: {
            private: {
              learningPlatformScheduleId: event.scheduleId,
            },
          },
        },
      });

      return {
        success: true,
        googleEventId,
      };
    } catch (error: any) {
      console.error('Error updating Google Calendar event:', error);
      const needsReauth = error.code === 401 || error.message?.includes('invalid_grant');
      return {
        success: false,
        error: error.message || 'Failed to update calendar event',
        needsReauth,
      };
    }
  }

  async deleteEvent(calendarId: string, googleEventId: string): Promise<GoogleCalendarSyncResult> {
    try {
      const calendar = await getCalendarClientForUser(this.tokens, this.onTokenRefresh);
      
      await calendar.events.delete({
        calendarId: calendarId || 'primary',
        eventId: googleEventId,
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error deleting Google Calendar event:', error);
      const needsReauth = error.code === 401 || error.message?.includes('invalid_grant');
      return {
        success: false,
        error: error.message || 'Failed to delete calendar event',
        needsReauth,
      };
    }
  }

  async cancelEvent(calendarId: string, googleEventId: string): Promise<GoogleCalendarSyncResult> {
    try {
      const calendar = await getCalendarClientForUser(this.tokens, this.onTokenRefresh);
      
      await calendar.events.patch({
        calendarId: calendarId || 'primary',
        eventId: googleEventId,
        requestBody: {
          status: 'cancelled',
        },
      });

      return { success: true, googleEventId };
    } catch (error: any) {
      console.error('Error cancelling Google Calendar event:', error);
      const needsReauth = error.code === 401 || error.message?.includes('invalid_grant');
      return {
        success: false,
        error: error.message || 'Failed to cancel calendar event',
        needsReauth,
      };
    }
  }

  async getCalendarList(): Promise<{ id: string; summary: string; primary?: boolean }[]> {
    try {
      const calendar = await getCalendarClientForUser(this.tokens, this.onTokenRefresh);
      
      const response = await calendar.calendarList.list();
      
      return (response.data.items || []).map(cal => ({
        id: cal.id || 'primary',
        summary: cal.summary || 'Unnamed Calendar',
        primary: cal.primary || false,
      }));
    } catch (error: any) {
      console.error('Error fetching calendar list:', error);
      return [];
    }
  }
}
