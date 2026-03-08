import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured');
  }
  
  // Priority: 1. PRODUCTION_DOMAIN (for published app), 2. REPLIT_DOMAINS, 3. REPLIT_DEV_DOMAIN, 4. localhost
  let baseUrl = 'http://localhost:5000';
  
  // Check if we're in production (NODE_ENV=production) and have a production domain configured
  if (process.env.NODE_ENV === 'production' && process.env.PRODUCTION_DOMAIN) {
    // Use the configured production domain (e.g., alloria-learning-center.replit.app)
    const domain = process.env.PRODUCTION_DOMAIN.replace(/^https?:\/\//, '');
    baseUrl = 'https://' + domain;
  } else if (process.env.REPLIT_DOMAINS) {
    // REPLIT_DOMAINS contains comma-separated list of domains, use the first one
    const domains = process.env.REPLIT_DOMAINS.split(',');
    baseUrl = 'https://' + domains[0];
  } else if (process.env.REPLIT_DEV_DOMAIN) {
    baseUrl = 'https://' + process.env.REPLIT_DEV_DOMAIN;
  }
  
  const redirectUri = `${baseUrl}/api/google-calendar/callback`;
  console.log('[GoogleOAuth] Using redirect URI:', redirectUri);
  console.log('[GoogleOAuth] NODE_ENV:', process.env.NODE_ENV);
  
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(state: string): string {
  const oauth2Client = getOAuth2Client();
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent',
  });
}

export async function getTokensFromCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  email: string;
}> {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  
  if (!tokens.access_token) {
    throw new Error('Failed to get access token');
  }
  
  oauth2Client.setCredentials(tokens);
  
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  
  const expiresAt = new Date(Date.now() + ((tokens as any).expires_in || 3600) * 1000);
  
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || '',
    expiresAt,
    email: userInfo.data.email || '',
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}> {
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  
  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }
  
  const expiresAt = new Date(Date.now() + ((credentials as any).expires_in || 3600) * 1000);
  
  return {
    accessToken: credentials.access_token,
    refreshToken: credentials.refresh_token || undefined,
    expiresAt,
  };
}

export async function revokeToken(accessToken: string): Promise<void> {
  const oauth2Client = getOAuth2Client();
  await oauth2Client.revokeToken(accessToken);
}
