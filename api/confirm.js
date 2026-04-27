// api/confirm.js
// Called when the client selects a time slot on the booking page.
// Sends confirmation email to pilot address and marks session as booked.

const { getSession, deleteSession } = require('../lib/store');
const { sendConfirmationEmail } = require('../lib/mailer');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, slotIndex } = req.body;

  if (!sessionId || slotIndex === undefined) {
    return res.status(400).json({ error: 'Missing sessionId or slotIndex' });
  }

  const session = getSession(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  const selectedSlot = session.slots[slotIndex];

  if (!selectedSlot) {
    return res.status(400).json({ error: 'Invalid slot index' });
  }

  try {
    // Send confirmation email to pilot address
    await sendConfirmationEmail({ session, selectedSlot });

    // Clean up the session so the link can't be used again
    deleteSession(sessionId);

    console.log(`Booking confirmed: ${session.projectName} — slot ${slotIndex} (${selectedSlot.start})`);

    return res.status(200).json({
      success: true,
      slot: selectedSlot,
      projectName: session.projectName,
    });

  } catch (err) {
    console.error('Confirmation error:', err);
    return res.status(500).json({ error: 'Failed to confirm booking', message: err.message });
  }
};
