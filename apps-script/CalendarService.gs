/**
 * CalendarService.gs
 * ------------------
 * Links the tracker to your default Google Calendar (CalendarApp — built
 * into Apps Script, no extra setup or API key). Three things:
 *   1. syncTodayToCalendar() — pushes today's real time-boxed commitments
 *      (prayer blocks + Gym, if you've logged one) onto your calendar.
 *   2. getCalendarSummaryForToday() — what's already on your calendar today,
 *      for display in the app.
 *   3. Conflict flags — if a pushed block overlaps something already on
 *      your calendar, that's surfaced rather than silently double-booked.
 *
 * Deliberately excludes Set1/Set2/Rhapsody/Bible/Campus prayer — none of
 * those have a real duration or fixed slot, so they're not calendar-shaped.
 */

function makeCalendarBlock_(date, key, title, startConfig, durationMinutes) {
  var start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startConfig.hour, startConfig.minute, 0);
  var end = new Date(start.getTime() + durationMinutes * 60000);
  return { key: key, title: title, start: start, end: end };
}

/**
 * The tracker's time-boxed commitments for a given date. Durations come
 * from getPrayerTargetsForDate_() (DataService.gs) — this only adds clock
 * times on top, from the MORNING_PRAYER_START/EVENING_PRAYER_START/
 * GYM_BLOCK config in Config.gs.
 */
function getCalendarBlocksForDate_(date) {
  var targets = getPrayerTargetsForDate_(date);
  var dow = date.getDay();
  var isFriday = dow === 5;
  var isSaturday = dow === 6;
  var blocks = [];

  if (targets.morning > 0) {
    blocks.push(makeCalendarBlock_(date, 'morning-prayer', 'Morning Prayer', MORNING_PRAYER_START, targets.morning));
  }

  if (isFriday && targets.fridayNight > 0) {
    blocks.push(makeCalendarBlock_(date, 'evening-prayer', 'Friday Night Prayer', EVENING_PRAYER_START, targets.fridayNight));
  } else if (isSaturday && targets.saturdayNight > 0) {
    blocks.push(makeCalendarBlock_(date, 'evening-prayer', 'Saturday Night Prayer', EVENING_PRAYER_START, targets.saturdayNight));
  } else if (targets.evening > 0) {
    blocks.push(makeCalendarBlock_(date, 'evening-prayer', 'Evening Prayer', EVENING_PRAYER_START, targets.evening));
  }

  // Gym only gets pushed on days you've actually used the Gym tab — it has
  // no fixed days of its own, so an untouched day shouldn't get a block.
  var gym = getGymLogRow_(dateKey_(date));
  if (gym && (gym.workout || gym.done)) {
    blocks.push(makeCalendarBlock_(date, 'gym', 'Gym', GYM_BLOCK, GYM_BLOCK.durationMinutes));
  }

  return blocks;
}

/**
 * Creates or updates today's calendar events for each block above. Safe to
 * call repeatedly (by the daily trigger, or the app's "Sync to Calendar"
 * button) — each block's event ID is remembered in Script Properties keyed
 * by date+block, so re-running updates the existing event instead of
 * creating a duplicate.
 */
function syncTodayToCalendar() {
  var date = todayDate_();
  if (!isWithinTrackingWindow_(date)) return getCalendarSummaryForToday();

  var blocks = getCalendarBlocksForDate_(date);
  var cal = CalendarApp.getDefaultCalendar();
  var props = PropertiesService.getScriptProperties();
  var dateStr = dateKey_(date);

  blocks.forEach(function (block) {
    var propKey = 'CAL_EVENT_' + dateStr + '_' + block.key;
    var eventId = props.getProperty(propKey);
    var fullTitle = CALENDAR_EVENT_PREFIX + block.title;
    var event = null;

    if (eventId) {
      try { event = cal.getEventById(eventId); } catch (e) { event = null; }
    }

    if (event) {
      event.setTime(block.start, block.end);
      if (event.getTitle() !== fullTitle) event.setTitle(fullTitle);
    } else {
      event = cal.createEvent(fullTitle, block.start, block.end);
      props.setProperty(propKey, event.getId());
    }
  });

  return getCalendarSummaryForToday();
}

function getTodayCalendarEvents_(date) {
  var cal = CalendarApp.getDefaultCalendar();
  var events = cal.getEventsForDay(date);
  return events.map(function (e) {
    return {
      title: e.getTitle(),
      start: Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), 'h:mm a'),
      end: Utilities.formatDate(e.getEndTime(), Session.getScriptTimeZone(), 'h:mm a'),
      startMs: e.getStartTime().getTime(),
      endMs: e.getEndTime().getTime(),
      isTracker: e.getTitle().indexOf(CALENDAR_EVENT_PREFIX) === 0
    };
  }).sort(function (a, b) { return a.startMs - b.startMs; });
}

// Flags a tracker block against real (non-tracker) events only — two of our
// own blocks sitting near each other isn't a "conflict" worth warning about.
function findCalendarConflicts_(block, allEvents) {
  return allEvents
    .filter(function (e) {
      if (e.isTracker) return false;
      return e.startMs < block.end.getTime() && e.endMs > block.start.getTime();
    })
    .map(function (e) { return e.title; });
}

/**
 * Everything the Calendar tab needs in one call: today's planned tracker
 * blocks (with any conflicts flagged) plus the rest of what's already on
 * the calendar today.
 */
function getCalendarSummaryForToday() {
  var date = todayDate_();
  var blocks = getCalendarBlocksForDate_(date);
  var events = getTodayCalendarEvents_(date);

  var plannedBlocks = blocks.map(function (b) {
    return {
      title: b.title,
      start: Utilities.formatDate(b.start, Session.getScriptTimeZone(), 'h:mm a'),
      end: Utilities.formatDate(b.end, Session.getScriptTimeZone(), 'h:mm a'),
      conflicts: findCalendarConflicts_(b, events)
    };
  });

  return {
    dayName: Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE, MMMM d'),
    blocks: plannedBlocks,
    events: events.map(function (e) {
      return { title: e.title, start: e.start, end: e.end, isTracker: e.isTracker };
    })
  };
}
