// lib/calendar.js
// Queries Google Calendar free/busy for a list of emails
// and returns overlapping 30-min slots within the scheduling window

const { google } = require('googleapis');

const SLOT_DURATION_MINS = 30;
const MIN_DAYS_OUT = 3;
const MAX_DAYS_OUT = 10;

// Business hours in EST (UTC-5)
const BIZ_START_HOUR_EST = 11; // 11am EST
const BIZ_END_HOUR_EST = 18;   // 6pm EST

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

// Returns array of { start: Date, end: Date } busy blocks for given emails
async function getFreeBusy(emails, timeMin, timeMax) {
  const auth = getOAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const items = emails.map(email => ({ id: email }));

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        timeZone: 'America/New_York',
        items,
      },
    });

    const busyBlocks = [];
    const calendars = response.data.calendars || {};

    for (const email of emails) {
      const calData = calendars[email];
      if (!calData || calData.errors) {
        // Calendar inaccessible — skip gracefully, log it
        console.log(`Calendar not accessible for ${email} — skipping`);
        continue;
      }
      for (const block of (calData.busy || [])) {
        busyBlocks.push({
          start: new Date(block.start),
          end: new Date(block.end),
        });
      }
    }

    return busyBlocks;
  } catch (err) {
    console.error('freebusy query failed:', err.message);
    return [];
  }
}

// Returns true if a candidate slot overlaps any busy block
function overlapsAny(slotStart, slotEnd, busyBlocks) {
  for (const block of busyBlocks) {
    if (slotStart < block.end && slotEnd > block.start) return true;
  }
  return false;
}

// Checks if a Date falls within business hours (EST)
function isBusinessHours(date) {
  // Convert to EST offset
  const estOffset = -5 * 60; // EST is UTC-5
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const estMinutes = ((utcMinutes + estOffset) % (24 * 60) + 24 * 60) % (24 * 60);
  const estHour = estMinutes / 60;
  return estHour >= BIZ_START_HOUR_EST && estHour + (SLOT_DURATION_MINS / 60) <= BIZ_END_HOUR_EST;
}

// Returns true if date is a weekday (Mon-Fri)
function isWeekday(date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

// Add business days to a date
function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (isWeekday(result)) added++;
  }
  return result;
}

// Main function: returns up to 5 available slots
async function findAvailableSlots(internalEmails, clientEmail) {
  const now = new Date();
  const windowStart = addBusinessDays(now, MIN_DAYS_OUT);
  const windowEnd = addBusinessDays(now, MAX_DAYS_OUT);

  // Set window start to beginning of business day
  windowStart.setUTCHours(BIZ_START_HOUR_EST + 5, 0, 0, 0); // EST to UTC

  // Fetch internal busy blocks (required)
  const internalBusy = await getFreeBusy(internalEmails, windowStart, windowEnd);

  // Attempt client calendar — best effort
  let clientBusy = [];
  let clientCalendarChecked = false;
  if (clientEmail) {
    try {
      const result = await getFreeBusy([clientEmail], windowStart, windowEnd);
      // If we got here without error, mark as checked
      clientBusy = result;
      clientCalendarChecked = result.length >= 0; // even empty array means accessible
    } catch (e) {
      console.log('Client calendar inaccessible — using internal-only slots');
      clientCalendarChecked = false;
    }
  }

  const allBusy = [...internalBusy, ...clientBusy];
  const availableSlots = [];

  // Walk through the window in 30-min increments
  const cursor = new Date(windowStart);
  while (cursor < windowEnd && availableSlots.length < 5) {
    if (isWeekday(cursor) && isBusinessHours(cursor)) {
      const slotEnd = new Date(cursor.getTime() + SLOT_DURATION_MINS * 60 * 1000);
      if (!overlapsAny(cursor, slotEnd, allBusy)) {
        availableSlots.push({
          start: new Date(cursor),
          end: new Date(slotEnd),
        });
      }
    }
    // Advance 30 minutes
    cursor.setMinutes(cursor.getMinutes() + SLOT_DURATION_MINS);
  }

  return {
    slots: availableSlots,
    clientCalendarChecked,
    windowStart,
    windowEnd,
  };
}

module.exports = { findAvailableSlots };
