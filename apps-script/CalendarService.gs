/**
 * CalendarService.gs
 * ------------------
 * Links the tracker to your default Google Calendar (CalendarApp — built
 * into Apps Script, no extra setup or API key), plus an optional second,
 * read-only calendar (SCHOOL_CALENDAR_ID in Config.gs) for a schedule that
 * lives on a different Google account, like a school one. Two things:
 *   1. getCalendarSummaryForToday() — what's on your calendar(s) today, for
 *      display in the app.
 *   2. createCalendarEvent() — manually add an event, any date, from the
 *      app's "Add an Event" form. Always writes to your default calendar —
 *      the school calendar is read-only from here, same as the share is.
 */

function getEventsFromCalendar_(cal, date, sourceLabel) {
  return cal.getEventsForDay(date).map(function (e) {
    return {
      title: e.getTitle(),
      start: Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), 'h:mm a'),
      startMs: e.getStartTime().getTime(),
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

/**
 * Manually adds an all-day event to any date, from the app's "Add an Event"
 * form. Always goes to your default calendar — the school one (if
 * configured) is read-only, same as the share it's read through. Returns
 * today's summary either way, since that's what the Calendar tab is showing
 * (adding an event for a different day won't visibly change it, and that's
 * fine — the new event still exists on the calendar for that day).
 */
function createCalendarEvent(dateStr, title, description) {
  title = String(title || '').trim();
  if (!dateStr || !title) return getCalendarSummaryForToday();
  var date = parseDate_(dateStr);
  CalendarApp.getDefaultCalendar().createAllDayEvent(title, date, { description: description || '' });
  return getCalendarSummaryForToday();
}
