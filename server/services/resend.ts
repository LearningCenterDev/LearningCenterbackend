import { Resend } from 'resend';

let connectionSettings: any;
const SENDER_EMAIL = 'hello@press1.dev';

async function getCredentials() {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY 
      ? 'repl ' + process.env.REPL_IDENTITY 
      : process.env.WEB_REPL_RENEWAL 
      ? 'depl ' + process.env.WEB_REPL_RENEWAL 
      : null;

    if (!xReplitToken) {
      console.warn('[Resend] Warning: X_REPLIT_TOKEN not found, will use fallback');
      return { apiKey: process.env.RESEND_API_KEY, fromEmail: SENDER_EMAIL };
    }

    if (!hostname) {
      console.warn('[Resend] Warning: REPLIT_CONNECTORS_HOSTNAME not found, will use fallback');
      return { apiKey: process.env.RESEND_API_KEY, fromEmail: SENDER_EMAIL };
    }

    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    if (!response.ok) {
      console.warn(`[Resend] API response not ok (${response.status}), using fallback`);
      return { apiKey: process.env.RESEND_API_KEY, fromEmail: SENDER_EMAIL };
    }

    connectionSettings = await response.json();
    const connector = connectionSettings.items?.[0];

    if (!connector || !connector.settings?.api_key) {
      console.warn('[Resend] Connector not found or no API key, using fallback');
      return { apiKey: process.env.RESEND_API_KEY, fromEmail: SENDER_EMAIL };
    }

    console.log('[Resend] Successfully loaded credentials from Replit connectors');
    return {
      apiKey: connector.settings.api_key,
      fromEmail: connector.settings.from_email || SENDER_EMAIL
    };
  } catch (error) {
    console.error('[Resend] Error fetching credentials:', error);
    console.log('[Resend] Falling back to environment variables');
    return { apiKey: process.env.RESEND_API_KEY, fromEmail: SENDER_EMAIL };
  }
}

export async function getUncachableResendClient() {
  try {
    const { apiKey, fromEmail } = await getCredentials();
    
    if (!apiKey) {
      throw new Error('Resend API key not found in environment or connectors');
    }

    console.log(`[Resend] Initializing client with sender: ${fromEmail}`);
    return {
      client: new Resend(apiKey),
      fromEmail: fromEmail || SENDER_EMAIL
    };
  } catch (error) {
    console.error('[Resend] Failed to initialize client:', error);
    throw error;
  }
}

export async function sendParentWelcomeEmail(
  parentEmail: string,
  parentName: string,
  studentName: string,
  oneTimePassword: string
) {
  console.log(`[Email] Sending parent welcome email to ${parentEmail}`);
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #67c090 0%, #26667f 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Learning Center</h1>
          <p style="color: #ddf4e7; margin: 10px 0 0 0;">Parent Portal Access</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #26667f; margin-top: 0;">Welcome, ${parentName}!</h2>
          
          <p>Your child, <strong>${studentName}</strong>, has been enrolled in our Learning Center platform.</p>
          
          <p>As a parent, you can now:</p>
          <ul>
            <li>View and authorize course enrollment requests</li>
            <li>Track your child's progress</li>
            <li>Communicate with teachers</li>
            <li>Access reports and schedules</li>
          </ul>
          
          <div style="background: white; padding: 20px; border-left: 4px solid #67c090; margin: 20px 0;">
            <h3 style="color: #26667f; margin-top: 0;">Your Login Credentials</h3>
            <p><strong>Email:</strong> ${parentEmail}</p>
            <p><strong>One-Time Password:</strong></p>
            <p style="font-size: 24px; font-weight: bold; color: #67c090; letter-spacing: 2px; margin: 10px 0;">${oneTimePassword}</p>
          </div>
          
          <div style="background: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0;"><strong>⚠️ Important:</strong> This one-time password will be required for your first login. After entering it, you'll be prompted to set a new secure password.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://your-domain.com'}" 
               style="display: inline-block; background: #67c090; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold;">
              Login to Parent Portal
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions, please don't hesitate to contact us.</p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
          <p>© ${new Date().getFullYear()} Learning Center. All rights reserved.</p>
        </div>
      </body>
    </html>
  `;

  const textContent = `
Welcome to Learning Center, ${parentName}!

Your child, ${studentName}, has been enrolled in our Learning Center platform.

Your Login Credentials:
Email: ${parentEmail}
One-Time Password: ${oneTimePassword}

This one-time password will be required for your first login. After entering it, you'll be prompted to set a new secure password.

Login to Parent Portal: ${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : 'https://your-domain.com'}

If you have any questions, please don't hesitate to contact us.

© ${new Date().getFullYear()} Learning Center. All rights reserved.
  `;

    const result = await client.emails.send({
      from: fromEmail,
      to: parentEmail,
      subject: `Welcome to Alloria Learning Center - Parent Portal Access for ${studentName}`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`[Email] Parent welcome email sent successfully:`, { to: parentEmail, id: result.data?.id });
    return result;
  } catch (error) {
    console.error(`[Email] Failed to send parent welcome email to ${parentEmail}:`, error);
    throw error;
  }
}

export async function sendProspectConfirmationEmail(
  recipientEmail: string,
  parentName: string,
  studentName: string,
  formType: 'academics' | 'computer' | 'dance' | 'arts',
  demoTime?: string
) {
  console.log(`[Email] Sending prospect confirmation email to ${recipientEmail} for ${formType} program`);
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const formTypeLabels = {
      academics: 'Academics (Nepali, Math, Science)',
      computer: 'Computer Science',
      dance: 'Dance',
      arts: 'Arts & Music'
    };
    
    const formLabel = formTypeLabels[formType];

    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Alloria Learning Center</h1>
          <p style="color: #e9d5ff; margin: 10px 0 0 0;">Demo Class Registration Received</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #6366f1; margin-top: 0;">Thank You for Your Interest!</h2>
          
          <p>Dear ${parentName || 'Parent/Guardian'},</p>
          
          <p>We have received your demo class registration for <strong>${studentName}</strong> in our <strong>${formLabel}</strong> program.</p>
          
          <div style="background: white; padding: 20px; border-left: 4px solid #8b5cf6; margin: 20px 0;">
            <h3 style="color: #6366f1; margin-top: 0;">Registration Details</h3>
            <p><strong>Student Name:</strong> ${studentName}</p>
            <p><strong>Program:</strong> ${formLabel}</p>
            ${demoTime ? `<p><strong>Preferred Demo Time:</strong> ${demoTime}</p>` : ''}
          </div>
          
          <p>Our team will review your registration and contact you within 24-48 hours to:</p>
          <ul>
            <li>Confirm the demo class schedule</li>
            <li>Share Zoom meeting details</li>
            <li>Answer any questions you may have</li>
          </ul>
          
          <div style="background: #e9d5ff; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #6366f1;"><strong>What to Expect:</strong> The demo class is a free 30-45 minute session where your child can experience our teaching methodology and interact with our instructors.</p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions in the meantime, please don't hesitate to contact us.</p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Alloria Learning Center. All rights reserved.</p>
        </div>
      </body>
    </html>
    `;

    const textContent = `
Thank You for Your Interest!

Dear ${parentName || 'Parent/Guardian'},

We have received your demo class registration for ${studentName} in our ${formLabel} program.

Registration Details:
- Student Name: ${studentName}
- Program: ${formLabel}
${demoTime ? `- Preferred Demo Time: ${demoTime}` : ''}

Our team will review your registration and contact you within 24-48 hours to:
- Confirm the demo class schedule
- Share Zoom meeting details
- Answer any questions you may have

What to Expect: The demo class is a free 30-45 minute session where your child can experience our teaching methodology and interact with our instructors.

If you have any questions in the meantime, please don't hesitate to contact us.

© ${new Date().getFullYear()} Alloria Learning Center. All rights reserved.
  `;

    const result = await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `Demo Class Registration Confirmed - ${formLabel} | Alloria Learning Center`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`[Email] Prospect confirmation email sent successfully:`, { to: recipientEmail, program: formType, id: result.data?.id });
    return result;
  } catch (error) {
    console.error(`[Email] Failed to send prospect confirmation email to ${recipientEmail}:`, error);
    throw error;
  }
}

export async function sendProspectAdminNotificationEmail(
  adminEmail: string,
  formData: Record<string, any>,
  formType: 'academics' | 'computer' | 'dance' | 'arts'
) {
  console.log(`[Email] Sending admin notification email to ${adminEmail} for ${formType} program`);
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const formTypeLabels = {
      academics: 'Academics (Nepali, Math, Science)',
      computer: 'Computer Science',
      dance: 'Dance',
      arts: 'Arts & Music'
    };
    
    const formLabel = formTypeLabels[formType];
    
    // Format form data for email display
    const formatValue = (value: any) => {
      if (!value) return 'N/A';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    };

    const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 700px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="color: white; margin: 0;">Alloria Learning Center</h1>
          <p style="color: #e9d5ff; margin: 10px 0 0 0;">New Demo Class Registration</p>
        </div>
        
        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px;">
          <h2 style="color: #6366f1; margin-top: 0;">New ${formLabel} Registration</h2>
          
          <div style="background: white; padding: 20px; border: 1px solid #e5e7eb; border-radius: 4px; margin: 20px 0;">
            <h3 style="color: #6366f1; margin-top: 0; border-bottom: 2px solid #8b5cf6; padding-bottom: 10px;">Registration Details</h3>
            ${Object.entries(formData)
              .filter(([key]) => key !== 'formData' && key !== 'formType')
              .map(([key, value]) => `
                <p style="margin: 8px 0;">
                  <strong>${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> ${formatValue(value)}
                </p>
              `)
              .join('')}
            ${formData.formData ? `
              <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                <h4 style="color: #6366f1; margin: 0 0 10px 0;">Additional Information</h4>
                ${Object.entries(formData.formData)
                  .map(([key, value]) => `
                    <p style="margin: 8px 0;">
                      <strong>${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> ${formatValue(value)}
                    </p>
                  `)
                  .join('')}
              </div>
            ` : ''}
          </div>
          
          <div style="background: #e9d5ff; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p style="margin: 0; color: #6366f1;"><strong>Action Required:</strong> Please review this registration and contact the parent within 24-48 hours to schedule the demo class.</p>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px; text-align: center;">Timestamp: ${new Date().toLocaleString()}</p>
        </div>
        
        <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
          <p>&copy; ${new Date().getFullYear()} Alloria Learning Center. All rights reserved.</p>
        </div>
      </body>
    </html>
    `;

    const textContent = `
New ${formLabel} Demo Class Registration

${Object.entries(formData)
  .filter(([key]) => key !== 'formData' && key !== 'formType')
  .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${formatValue(value)}`)
  .join('\n')}

${formData.formData ? `
Additional Information:
${Object.entries(formData.formData)
  .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${formatValue(value)}`)
  .join('\n')}
` : ''}

Action Required: Please review this registration and contact the parent within 24-48 hours to schedule the demo class.

Timestamp: ${new Date().toLocaleString()}

© ${new Date().getFullYear()} Alloria Learning Center. All rights reserved.
  `;

    const result = await client.emails.send({
      from: fromEmail,
      to: adminEmail,
      subject: `New Demo Class Registration - ${formLabel} | Alloria Learning Center`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`[Email] Admin notification email sent successfully:`, { to: adminEmail, program: formType, id: result.data?.id });
    return result;
  } catch (error) {
    console.error(`[Email] Failed to send admin notification email to ${adminEmail}:`, error);
    throw error;
  }
}

export async function testEmailSending(testEmail: string) {
  console.log(`[Email] Testing email send to ${testEmail}`);
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const result = await client.emails.send({
      from: fromEmail,
      to: testEmail,
      subject: 'Alloria Learning Center - Test Email',
      html: `<html><body><h1>Test Email</h1><p>This is a test email from Alloria Learning Center.</p><p>Sent from: ${fromEmail}</p></body></html>`,
      text: 'This is a test email from Alloria Learning Center.',
    });

    console.log(`[Email] Test email sent successfully:`, { to: testEmail, from: fromEmail, id: result.data?.id, response: result });
    return result;
  } catch (error) {
    console.error(`[Email] Test email failed:`, error);
    throw error;
  }
}
