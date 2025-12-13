const postmark = require('postmark');
require('dotenv').config();

let client = null;

if (process.env.POSTMARK_TOKEN) {
  client = new postmark.ServerClient(process.env.POSTMARK_TOKEN);
}

const fromEmail = process.env.POSTMARK_FROM || 'noreply@kurrant.com';

async function sendToAdmins(db, subject, htmlBody, textBody) {
  if (!client) {
    console.log('📧 Postmark not configured - skipping email');
    return;
  }

  try {
    // Get only admin emails
    const [admins] = await db.execute("SELECT email, name FROM users WHERE role = 'admin'");
    
    for (const admin of admins) {
      try {
        await client.sendEmail({
          From: fromEmail,
          To: admin.email,
          Subject: subject,
          HtmlBody: htmlBody,
          TextBody: textBody
        });
        console.log(`📧 Email sent to admin ${admin.email}`);
      } catch (err) {
        console.error(`❌ Failed to send email to ${admin.email}:`, err.message);
      }
    }
  } catch (error) {
    console.error('❌ Email service error:', error.message);
  }
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

async function notifyVacationSubmitted(db, userName, startDate, endDate, days, reason) {
  const subject = `🏖️ New Vacation Request: ${userName}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #FE6B35; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Kurrant TimeOff</h1>
      </div>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
        <h2 style="color: #333;">New Vacation Request</h2>
        <p><strong>${userName}</strong> has submitted a vacation request:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>From:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${formatDate(startDate)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>To:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${formatDate(endDate)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Duration:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${days} business day${days > 1 ? 's' : ''}</td>
          </tr>
          <tr>
            <td style="padding: 10px;"><strong>Reason:</strong></td>
            <td style="padding: 10px;">${reason || 'Not specified'}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  const textBody = `New Vacation Request\n\n${userName} has submitted a vacation request:\n\nFrom: ${formatDate(startDate)}\nTo: ${formatDate(endDate)}\nDuration: ${days} business day(s)\nReason: ${reason || 'Not specified'}`;

  await sendToAdmins(db, subject, htmlBody, textBody);
}

async function notifyVacationCancelled(db, userName, cancelledBy, startDate, endDate, days, reason) {
  const subject = `❌ Vacation Cancelled: ${userName}`;
  const cancelledByText = userName === cancelledBy ? 'by themselves' : `by ${cancelledBy}`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #FE6B35; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Kurrant TimeOff</h1>
      </div>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
        <h2 style="color: #dc2626;">Vacation Cancelled</h2>
        <p><strong>${userName}</strong>'s vacation has been cancelled ${cancelledByText}:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>From:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${formatDate(startDate)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>To:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${formatDate(endDate)}</td>
          </tr>
          <tr>
            <td style="padding: 10px;"><strong>Duration:</strong></td>
            <td style="padding: 10px;">${days} business day${days > 1 ? 's' : ''}</td>
          </tr>
        </table>
      </div>
    </div>
  `;

  const textBody = `Vacation Cancelled\n\n${userName}'s vacation has been cancelled ${cancelledByText}:\n\nFrom: ${formatDate(startDate)}\nTo: ${formatDate(endDate)}\nDuration: ${days} business day(s)`;

  await sendToAdmins(db, subject, htmlBody, textBody);
}

async function sendWelcomeEmail(userEmail, userName, tempPassword, loginUrl) {
  if (!client) {
    console.log('📧 Postmark not configured - skipping welcome email');
    return;
  }

  const subject = `🎉 Welcome to Kurrant TimeOff!`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #FE6B35; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Kurrant TimeOff</h1>
      </div>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
        <h2 style="color: #333;">Welcome, ${userName}!</h2>
        <p>Your account has been created for the Kurrant TimeOff system. You can now request vacation days and view your team's calendar.</p>
        
        <div style="background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin: 0 0 15px; color: #FE6B35;">Your Login Credentials</h3>
          <table style="width: 100%;">
            <tr>
              <td style="padding: 8px 0;"><strong>Email:</strong></td>
              <td style="padding: 8px 0;">${userEmail}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0;"><strong>Temporary Password:</strong></td>
              <td style="padding: 8px 0; font-family: monospace; font-size: 16px; color: #FE6B35;">${tempPassword}</td>
            </tr>
          </table>
        </div>
        
        <div style="background: #fff8f5; border: 1px solid #fed7c7; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #c2410c;"><strong>⚠️ Important:</strong> You will be asked to change your password when you first log in.</p>
        </div>
        
        <p style="margin-top: 20px;">
          <a href="${loginUrl}" style="display: inline-block; background: #FE6B35; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Log In Now →</a>
        </p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">If you have any questions, please contact your administrator.</p>
      </div>
    </div>
  `;

  const textBody = `Welcome to Kurrant TimeOff!

Hi ${userName},

Your account has been created for the Kurrant TimeOff system.

Your Login Credentials:
- Email: ${userEmail}
- Temporary Password: ${tempPassword}

IMPORTANT: You will be asked to change your password when you first log in.

Log in here: ${loginUrl}

If you have any questions, please contact your administrator.`;

  try {
    await client.sendEmail({
      From: fromEmail,
      To: userEmail,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody
    });
    console.log(`📧 Welcome email sent to ${userEmail}`);
  } catch (err) {
    console.error(`❌ Failed to send welcome email to ${userEmail}:`, err.message);
  }
}

async function notifyVacationAdminCancelled(userEmail, userName, adminName, startDate, endDate, days, reason) {
  if (!client) {
    console.log('📧 Postmark not configured - skipping admin cancellation email');
    return;
  }

  const subject = `⚠️ Your Vacation Has Been Cancelled`;
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #FE6B35; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0;">Kurrant TimeOff</h1>
      </div>
      <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
        <h2 style="color: #dc2626;">Vacation Cancelled</h2>
        <p>Hi ${userName},</p>
        <p>Your vacation request has been cancelled by <strong>${adminName}</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>From:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${formatDate(startDate)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>To:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${formatDate(endDate)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;"><strong>Duration:</strong></td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${days} business day${days > 1 ? 's' : ''}</td>
          </tr>
        </table>
        
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #dc2626;"><strong>Reason for cancellation:</strong></p>
          <p style="margin: 10px 0 0; color: #333;">${reason}</p>
        </div>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">If you have questions about this cancellation, please contact your administrator.</p>
      </div>
    </div>
  `;

  const textBody = `Vacation Cancelled

Hi ${userName},

Your vacation request has been cancelled by ${adminName}.

From: ${formatDate(startDate)}
To: ${formatDate(endDate)}
Duration: ${days} business day(s)

Reason for cancellation:
${reason}

If you have questions about this cancellation, please contact your administrator.`;

  try {
    await client.sendEmail({
      From: fromEmail,
      To: userEmail,
      Subject: subject,
      HtmlBody: htmlBody,
      TextBody: textBody
    });
    console.log(`📧 Admin cancellation email sent to ${userEmail}`);
  } catch (err) {
    console.error(`❌ Failed to send admin cancellation email to ${userEmail}:`, err.message);
  }
}

module.exports = {
  notifyVacationSubmitted,
  notifyVacationCancelled,
  notifyVacationAdminCancelled,
  sendWelcomeEmail
};
