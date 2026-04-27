// lib/mailer.js
// Sends emails via Gmail API using OAuth2.
// In PILOT mode, all emails are redirected to PILOT_EMAIL regardless of recipient.

const { google } = require('googleapis');

function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

function buildRawEmail({ to, subject, html }) {
  const pilotEmail = process.env.PILOT_EMAIL;
  const isPilot = !!pilotEmail;
  const actualTo = isPilot ? pilotEmail : to;
  const pilotBanner = isPilot
    ? `<div style="background:#faeeda;border:1px solid #ef9f27;padding:8px 12px;border-radius:6px;font-size:12px;color:#633806;margin-bottom:16px;">
        <strong>Pilot mode</strong> — this email was originally addressed to <strong>${to}</strong>
       </div>`
    : '';

  const message = [
    `To: ${actualTo}`,
    `Subject: ${isPilot ? '[PILOT] ' : ''}${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    pilotBanner + html,
  ].join('\n');

  return Buffer.from(message).toString('base64url');
}

async function sendEmail({ to, subject, html }) {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const raw = buildRawEmail({ to, subject, html });

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  const destination = process.env.PILOT_EMAIL || to;
  console.log(`Email sent to ${destination} (pilot: ${!!process.env.PILOT_EMAIL})`);
}

// Sends the booking link email to the client
async function sendBookingEmail({ clientEmail, projectName, taskName, bookingUrl, internalNames }) {
  const subject = `Your next ${projectName} session is ready to schedule`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <div style="padding: 32px 0 24px;">
        <img src="https://www.narvar.com/wp-content/uploads/2023/03/narvar-logo.svg" alt="Narvar" height="28" style="margin-bottom: 24px;" onerror="this.style.display='none'">
        <h2 style="font-size: 20px; font-weight: 600; margin: 0 0 8px;">You're ready for the next step</h2>
        <p style="font-size: 15px; color: #555; margin: 0 0 24px;">
          The <strong>${taskName}</strong> milestone has been completed for your <strong>${projectName}</strong> project.
          Your Narvar team is ready to schedule your next session — please select a time that works for you.
        </p>
        <a href="${bookingUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;">
          Choose a meeting time →
        </a>
        <p style="font-size: 13px; color: #888; margin: 24px 0 0;">
          All times shown are in Eastern Time. The meeting will be 30 minutes.<br>
          Attendees: ${internalNames.join(', ')}
        </p>
      </div>
    </div>
  `;

  await sendEmail({ to: clientEmail, subject, html });
}

// Sends the pilot confirmation email after a slot is selected
async function sendConfirmationEmail({ session, selectedSlot }) {
  const slotDate = new Date(selectedSlot.start);
  const formatted = slotDate.toLocaleString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
    timeZoneName: 'short',
  });

  const subject = `Meeting scheduled — ${session.projectName}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 16px;">Meeting scheduled ✓</h2>
      <table style="width:100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #888; width: 140px;">Project</td><td style="padding: 8px 0; font-weight: 500;">${session.projectName}</td></tr>
        <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #888;">Task completed</td><td style="padding: 8px 0;">${session.taskName}</td></tr>
        <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #888;">Time selected</td><td style="padding: 8px 0; font-weight: 500;">${formatted}</td></tr>
        <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #888;">Duration</td><td style="padding: 8px 0;">30 minutes</td></tr>
        <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #888;">Internal attendees</td><td style="padding: 8px 0;">${session.internalEmails.join('<br>')}</td></tr>
        <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #888;">Client</td><td style="padding: 8px 0;">${session.clientEmail}</td></tr>
        <tr style="border-top: 1px solid #f0f0f0;"><td style="padding: 8px 0; color: #888;">Client calendar</td><td style="padding: 8px 0;">${session.clientCalendarChecked ? '✓ Checked' : '⚠ Not accessible — fallback slots used'}</td></tr>
      </table>
      <div style="background: #f5f5f5; border-radius: 8px; padding: 12px 16px; margin-top: 20px; font-size: 13px; color: #666;">
        <strong>Pilot mode:</strong> No calendar invites have been sent. In production, Google Calendar invites would go to all attendees automatically.
      </div>
    </div>
  `;

  await sendEmail({ to: process.env.PILOT_EMAIL, subject, html });
}

module.exports = { sendBookingEmail, sendConfirmationEmail };
