/**
 * CalendarService.gs
 * ------------------
 * Links the tracker to your default Google Calendar (CalendarApp — built
 * into Apps Script, no extra setup or API key), plus an optional second,
 * read-only calendar (SCHOOL_CALENDAR_ID in Config.gs) for a schedule that
 * lives on a different Google account, like a school one. Three things:
 *   1. getCalendarSummaryForToday() — what's on your calendar(s) today, for
 *      display in the app.
 *   2. createCalendarEvent() — manually add an event, any date, from the
 *      app's "Add an Event" form. Always writes to your default calendar —
 *      the school calendar is read-only from here, same as the share is.
 *   3. getUpcomingCalendarEvents_() — a multi-day lookahead (each event
 *      carries durationMinutes/allDay too) that AiAssistant.gs uses for
 *      the priority briefing and to total up study/reading time.
 */

function getEventsFromCalendar_(cal, date, sourceLabel) {
  return cal.getEventsForDay(date).map(function (e) {
    var allDay = e.isAllDayEvent();
    var start = allDay
      ? 'All day'
      : Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), 'h:mm a') +
        ' – ' + Utilities.formatDate(e.getEndTime(), Session.getScriptTimeZone(), 'h:mm a');
    return {
      title: e.getTitle(),
      start: start,
      startMs: e.getStartTime().getTime(),
      // 0 for all-day events — an all-day block isn't a study-time duration,
      // and AiAssistant.gs's summarizeStudyBlocks_() skips allDay entirely.
      durationMinutes: allDay ? 0 : Math.round((e.getEndTime().getTime() - e.getStartTime().getTime()) / 60000),
      allDay: allDay,
      source: sourceLabel
    };
  });
}

function getTodayCalendarEvents_(date) {
  var events = getEventsFromCalendar_(CalendarApp.getDefaultCalendar(), date, 'You');
  var schoolError = '';

  if (SCHOOL_CALENDAR_ID) {
    try {
      var schoolCal = CalendarApp.getCalendarById(SCHOOL_CALENDAR_ID);
      if (schoolCal) {
        events = events.concat(getEventsFromCalendar_(schoolCal, date, 'School'));
      } else {
        schoolError = 'School calendar not found — check SCHOOL_CALENDAR_ID and that it\'s shared with this account.';
      }
    } catch (e) {
      schoolError = 'Could not read school calendar (' + e.message + ').';
    }
  }

  events.sort(function (a, b) { return a.startMs - b.startMs; });
  return { events: events, schoolError: schoolError };
}

/**
 * Today plus the next (days - 1) days worth of events, flattened into one
 * list with a human date label per event. Used by AiAssistant.gs, which
 * needs to reason about what's coming up — getTodayCalendarEvents_() alone
 * only ever looks at a single day. Reuses that same per-day fetch (same
 * default+school merge, same schoolError handling) rather than duplicating
 * the CalendarApp calls.
 */
function getUpcomingCalendarEvents_(days) {
  var today = todayDate_();
  var results = [];
  var schoolError = '';
  for (var i = 0; i < days; i++) {
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    var dayResult = getTodayCalendarEvents_(d);
    var dateLabel = i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : Utilities.formatDate(d, Session.getScriptTimeZone(), 'EEEE'));
    dayResult.events.forEach(function (e) {
      results.push({
        dateLabel: dateLabel, start: e.start, title: e.title, source: e.source,
        durationMinutes: e.durationMinutes, allDay: e.allDay
      });
    });
    if (dayResult.schoolError && !schoolError) schoolError = dayResult.schoolError;
  }
  return { events: results, schoolError: schoolError };
}

/** Everything the Calendar tab needs: today's date plus what's on it. */
function getCalendarSummaryForToday() {
  var date = todayDate_();
  var result = getTodayCalendarEvents_(date);
  return {
    dateStr: dateKey_(date),
    dayName: Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE, MMMM d'),
    events: result.events.map(function (e) {
      return { title: e.title, start: e.start, source: e.source };
    }),
    schoolError: result.schoolError
  };
}

/** Combines a day-only Date with an "HH:MM" time-of-day string from an <input type="time">. */
function combineDateAndTime_(date, timeStr) {
  var parts = String(timeStr).split(':').map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), parts[0] || 0, parts[1] || 0);
}

/**
 * Manually adds an event to any date, from the app's "Add an Event" form.
 * With both startTime and endTime ("HH:MM" strings) it creates a timed
 * event; leaving either blank creates an all-day event, same as before —
 * so existing calls with just (dateStr, title, description) still work
 * unchanged. Always goes to your default calendar — the school one (if
 * configured) is read-only, same as the share it's read through. Returns
 * today's summary either way, since that's what the Calendar tab is showing
 * (adding an event for a different day won't visibly change it, and that's
 * fine — the new event still exists on the calendar for that day).
 */
function createCalendarEvent(dateStr, title, description, startTime, endTime) {
  title = String(title || '').trim();
  if (!dateStr || !title) return getCalendarSummaryForToday();
  var date = parseDate_(dateStr);
  var cal = CalendarApp.getDefaultCalendar();

  if (startTime && endTime) {
    var start = combineDateAndTime_(date, startTime);
    var end = combineDateAndTime_(date, endTime);
    if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000); // end wasn't after start — default to 1hr
    cal.createEvent(title, start, end, { description: description || '' });
  } else {
    cal.createAllDayEvent(title, date, { description: description || '' });
  }
  return getCalendarSummaryForToday();
}
