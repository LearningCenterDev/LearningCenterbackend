import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key, 
    fromEmail: connectionSettings.settings.from_email
  };
}

async function getUncachableResendClient() {
  const credentials = await getCredentials();
  return {
    client: new Resend(credentials.apiKey),
    fromEmail: connectionSettings.settings.from_email
  };
}

export async function sendPasswordResetEmail(email: string, resetToken: string, userName: string) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    // Construct the reset URL
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000';
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Alloria Learning Center <onboarding@resend.dev>',
      to: [email],
      subject: 'Reset Your Password - Alloria Learning Center',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Alloria Learning Center</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #667eea; margin-top: 0;">Password Reset Request</h2>
            
            <p>Hello ${userName},</p>
            
            <p>We received a request to reset your password for your Alloria Learning Center account. If you didn't make this request, you can safely ignore this email.</p>
            
            <p>To reset your password, click the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
            </div>
            
            <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <p style="color: #667eea; word-break: break-all; font-size: 14px;">${resetUrl}</p>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              This link will expire in 1 hour for security reasons.
            </p>
            
            <p style="color: #999; font-size: 12px;">
              If you have any questions, please contact our support team.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} Learning Center. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send password reset email:', error);
      throw new Error('Failed to send password reset email');
    }

    console.log('Password reset email sent successfully:', data);
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
}

export async function sendAssignmentDeadlineReminderEmail(
  parentEmail: string,
  parentName: string,
  studentName: string,
  assignmentTitle: string,
  courseName: string,
  dueDate: string
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();

    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : 'http://localhost:5000';

    const { data, error } = await client.emails.send({
      from: fromEmail || 'Alloria Learning Center <onboarding@resend.dev>',
      to: [parentEmail],
      subject: `Assignment Deadline Reminder - ${assignmentTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1F3A5F 0%, #2a4a75 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Alloria Learning Center</h1>
          </div>

          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #e67e22; margin-top: 0;">Assignment Deadline Approaching</h2>

            <p>Dear ${parentName},</p>

            <p>This is a reminder that your child, <strong>${studentName}</strong>, has an upcoming assignment deadline in less than <strong>24 hours</strong>.</p>

            <div style="background: white; border-left: 4px solid #e67e22; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 5px 0;"><strong>Assignment:</strong> ${assignmentTitle}</p>
              <p style="margin: 5px 0;"><strong>Course:</strong> ${courseName}</p>
              <p style="margin: 5px 0;"><strong>Due Date:</strong> ${dueDate}</p>
              <p style="margin: 5px 0; color: #e67e22;"><strong>Status:</strong> Not yet submitted</p>
            </div>

            <p>Please encourage ${studentName} to complete and submit the assignment before the deadline.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${baseUrl}/login" style="background: #1F3A5F; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">View Dashboard</a>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              This is an automated reminder from Alloria Learning Center.
            </p>
          </div>

          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} Alloria Learning Center. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send assignment deadline reminder email:', error);
      return { success: false, error };
    }

    console.log('Assignment deadline reminder email sent successfully:', data);
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('Error sending assignment deadline reminder email:', error);
    return { success: false, error };
  }
}

export async function sendWelcomeEmail(email: string, userName: string) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : 'http://localhost:5000';
    
    const { data, error } = await client.emails.send({
      from: fromEmail || 'Learning Center <onboarding@resend.dev>',
      to: [email],
      subject: 'Welcome to Learning Center!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Learning Center!</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
            <h2 style="color: #667eea; margin-top: 0;">Your Account is Ready</h2>
            
            <p>Hello ${userName},</p>
            
            <p>Thank you for creating an account with Learning Center. We're excited to have you join our learning community!</p>
            
            <p>You can now:</p>
            <ul style="color: #666;">
              <li>Browse and enroll in courses</li>
              <li>Track your learning progress</li>
              <li>Submit assignments and receive feedback</li>
              <li>Connect with teachers and fellow students</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${baseUrl}/login" style="background: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Get Started</a>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd;">
              If you have any questions, please don't hesitate to contact our support team.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} Learning Center. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    });

    if (error) {
      console.error('Failed to send welcome email:', error);
      return { success: false, error };
    }

    console.log('Welcome email sent successfully:', data);
    return { success: true, messageId: data?.id };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return { success: false, error };
  }
}
