// api/webhook.js
// Receives TASK_UPDATED events from Rocketlane.
// Fires when a task status changes to "Completed".
// Fetches the project for client email, checks calendars, saves a booking session,
// and sends the client a booking link.

const { v4: uuidv4 } = require('uuid');
const { findAvailableSlots } = require('../lib/calendar');
const { saveSession } = require('../lib/store');
const { sendBookingEmail } = require('../lib/mailer');

const ROCKETLANE_API = 'https://api.rocketlane.com/api/1.0';

// Fetch project details to get client email
async function fetchProject(projectId) {
  const res = await fetch(`${ROCKETLANE_API}/projects/${projectId}`, {
    headers: {
      'api-key': process.env.ROCKETLANE_API_KEY,
      'accept': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Rocketlane project fetch failed: ${res.status}`);
  return res.json();
}

// Extract client email from project — prefer customerChampion, fallback to customers[0]
function extractClientEmail(project) {
  const champion = project?.teamMembers?.customerChampion?.emailId;
  if (champion) return champion;
  const customers = project?.teamMembers?.customers || [];
  return customers[0]?.emailId || null;
}

// Extract internal attendee emails from task assignees
function extractInternalEmails(task) {
  const members = task?.assignees?.members || [];
  return members.map(m => m.emailId).filter(Boolean);
}

// Extract display names for the email
function extractInternalNames(task) {
  const members = task?.assignees?.members || [];
  return members.map(m => `${m.firstName} ${m.lastName}`.trim()).filter(Boolean);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body;

    // Validate this is a task completion event
    if (payload.eventType !== 'TASK_UPDATED') {
      return res.status(200).json({ message: 'Not a task update — ignored' });
    }

    const task = payload?.data?.task;
    const statusLabel = payload?.changeLog?.to?.status?.label;

    if (!task || statusLabel !== 'Completed') {
      return res.status(200).json({ message: 'Task not completed — ignored' });
    }

    const projectId = task?.project?.projectId;
    const projectName = task?.project?.projectName || 'Your project';
    const taskName = task?.taskName || 'Task';
    const internalEmails = extractInternalEmails(task);
    const internalNames = extractInternalNames(task);

    if (!projectId) {
      return res.status(400).json({ error: 'No projectId in payload' });
    }

    if (internalEmails.length === 0) {
      return res.status(400).json({ error: 'No assignees found on task' });
    }

    console.log(`Task completed: "${taskName}" on project "${projectName}" (${projectId})`);
    console.log(`Internal attendees: ${internalEmails.join(', ')}`);

    // Step 1 — Fetch project to get client email
    let clientEmail = null;
    try {
      const project = await fetchProject(projectId);
      clientEmail = extractClientEmail(project);
      console.log(`Client email: ${clientEmail || 'not found'}`);
    } catch (err) {
      console.error('Could not fetch project:', err.message);
      // Non-fatal — we can still proceed without client email
    }

    // Step 2 — Find available slots
    const { slots, clientCalendarChecked } = await findAvailableSlots(
      internalEmails,
      clientEmail
    );

    if (slots.length === 0) {
      console.warn('No available slots found in window');
      return res.status(200).json({ message: 'No available slots found — no email sent' });
    }

    console.log(`Found ${slots.length} available slots`);

    // Step 3 — Save booking session
    const sessionId = uuidv4();
    saveSession(sessionId, {
      projectId,
      projectName,
      taskName,
      internalEmails,
      internalNames,
      clientEmail,
      clientCalendarChecked,
      slots: slots.map(s => ({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      })),
      createdAt: new Date().toISOString(),
    });

    // Step 4 — Send booking email to client
    const bookingUrl = `${process.env.APP_URL}/book/${sessionId}`;
    await sendBookingEmail({
      clientEmail: clientEmail || process.env.PILOT_EMAIL,
      projectName,
      taskName,
      bookingUrl,
      internalNames,
    });

    console.log(`Booking email sent. URL: ${bookingUrl}`);
    return res.status(200).json({ success: true, sessionId, slotsFound: slots.length });

  } catch (err) {
    console.error('Webhook handler error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
