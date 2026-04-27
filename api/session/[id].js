// api/session/[id].js
// Returns the booking session data for a given session ID.
// Called by the client-facing booking page to load available slots.

const { getSession } = require('../../lib/store');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing session ID' });
  }

  const session = getSession(id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  // Return only what the booking page needs — don't expose internal emails
  return res.status(200).json({
    projectName: session.projectName,
    taskName: session.taskName,
    internalNames: session.internalNames,
    clientCalendarChecked: session.clientCalendarChecked,
    slots: session.slots,
  });
};
