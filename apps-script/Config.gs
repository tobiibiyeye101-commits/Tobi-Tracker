/**
 * Config.gs
 * ---------
 * Every date, message, and target in this project lives here. If a message
 * title changes, the rotation needs adjusting, or the prayer ramp needs
 * reshaping, this is the only file that should need editing.
 */

// ---- Tracking window ------------------------------------------------------
var START_DATE_STR = '2026-09-03'; // first day of tracking
var END_DATE_STR   = '2026-10-31'; // last day of tracking

// ---- Where you receive reminders / the sheet this project owns -----------
// Leave EMAIL_TO blank to default to the account running the script
// (Session.getActiveUser()), which is normally what you want.
var EMAIL_TO = '';

// ---- Set 1: the 4-message rotation (one per day, repeating) --------------
// This mirrors the "Message Rotation" schedule already in your
// Progress Log > Message Rotation Table - Sep 3 to Oct 31.
var SET1_ROTATION = [
  'Every Tree A Forest',
  'A Man Sent From God',
  'Prevailing Prayer 2',
  'Soul Winners Congress 2024'
];

// ---- Set 2: the long-form messages, listened to at your own pace ---------
// Order matters - this is the sequence you move through. Nothing here is
// date-driven; you advance the pointer yourself as you finish each one.
var SET2_MESSAGES = [
  'This Is It 2024 — Day 1',
  'This Is It 2024 — Day 2 Morning',
  'This Is It 2024 — Day 2 Evening',
  'This Is It 2024 — Day 3 Evening',
  'Stair Summit — Day 1',
  'Stair Summit — Day 2',
  'Stair Summit — Day 3',
  'This Is It 2026 — Day 1',
  'This Is It 2026 — Day 2 Morning',
  'This Is It 2026 — Day 2 Evening',
  'This Is It 2026 — Day 3 Morning',
  'This Is It 2026 — Day 3 Evening',
  'Coordinators Training',
  'Excellence That Attracts Opportunities',
  'Excellent Follow-Up',
  'Fill the House 1',
  'Fill the House 2',
  'Playing the Money Game 1',
  'Playing the Money Game 2',
  'Playing the Money Game 3',
  'Playing the Money Game 4',
  'Playing the Money Game 5',
  'Revenue Allocation'
];

// ---- Prayer targets ---------------------------------------------------------
// Flat from day one — no ramp. Minutes are for a normal (non-Fri/Sat) day:
// Morning + Evening + Campus. Friday night (established, fixed) and Saturday
// night (fixed) are handled separately below.
// (This used to be a 5-phase ramp building up to these numbers over ~6 weeks;
// collapsed to a single phase covering the whole window if you want it back.)
var PRAYER_PHASES = [
  { fromDay: 0, toDay: 9999, label: 'Full Structure', morning: 60, evening: 60, campus: 10, saturdayNight: 120 }
];
var FRIDAY_NIGHT_MINUTES = 180; // 3 hours — already established, not part of the ramp

// On Friday and Saturday the long evening session already carries the day,
// so Morning trims down to 30 minutes instead of the usual 60.
var SHORT_MORNING_MINUTES = 30;

// ---- Reminder copy ----------------------------------------------------------
var WEBAPP_URL_PROPERTY_KEY = 'WEBAPP_URL'; // set once via setWebAppUrl(), see README

// ---- Small date helpers used across the project ---------------------------
function todayDate_() {
  return new Date();
}

function parseDate_(str) {
  var parts = str.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function dateKey_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function daysSinceStart_(date) {
  var start = parseDate_(START_DATE_STR);
  var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  var s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  return Math.round((d - s) / 86400000);
}

function isWithinTrackingWindow_(date) {
  var idx = daysSinceStart_(date);
  var end = parseDate_(END_DATE_STR);
  var endIdx = daysSinceStart_(end);
  return idx >= 0 && idx <= endIdx;
}
