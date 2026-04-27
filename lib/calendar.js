// lib/calendar.js
// Generates available 30-min time slots within the scheduling window
// based purely on business hours (no calendar API required).
// Slots are spread across the window to give the client good options.

const SLOT_DURATION_MINS = 30;
const MIN_DAYS_OUT = 3;
const MAX_DAYS_OUT = 10;

// Business hours in EST (UTC-5)
const BIZ_START_HOUR_EST = 11; // 11am EST
const BIZ_END_HOUR_EST = 18;   // 6pm EST

// Preferred slot times (hour in EST) to spread options across the day
const PREFERRED_HOURS = [11, 13, 14.5, 16, 17]; // 11am, 1pm, 2:30pm, 4pm, 5pm

// Returns true if date is a weekday (Mon-Fri) in UTC
function isWeekday(date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}

// Add N business days to a date
function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (isWeekday(result)) added++;
  }
  return result;
}

// Build a UTC Date for a given EST hour on a given date
function buildSlotDate(baseDate, estHour) {
  const d = new Date(baseDate);
  const hours = Math.floor(estHour);
  const minutes = Math.round((estHour - hours) * 60);
  // EST = UTC-5
  d.setUTCHours(hours + 5, minutes, 0, 0);
  return d;
}

// Main function: returns up to 5 slots spread across the scheduling window
async function findAvailableSlots() {
  const now = new Date();
  const slots = [];

  // Walk business days from MIN_DAYS_OUT to MAX_DAYS_OUT
  // Pick one preferred time per day until we have 5 slots
  let dayOffset = MIN_DAYS_OUT;
  let preferredIndex = 0;

  while (slots.length < 5 && dayOffset <= MAX_DAYS_OUT) {
    const candidate = addBusinessDays(now, dayOffset);

    if (isWeekday(candidate)) {
      const estHour = PREFERRED_HOURS[preferredIndex % PREFERRED_HOURS.length];
      const slotStart = buildSlotDate(candidate, estHour);
      const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MINS * 60 * 1000);

      // Only include if slot is in the future
      if (slotStart > now) {
        slots.push({ start: slotStart, end: slotEnd });
      }

      preferredIndex++;
    }

    dayOffset++;
  }

  return {
    slots,
    clientCalendarChecked: false,
  };
}

module.exports = { findAvailableSlots };
