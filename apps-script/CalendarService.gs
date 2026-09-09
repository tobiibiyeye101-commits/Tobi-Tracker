/**
 * CalendarService.gs
 * ------------------
 * Links the tracker to your default Google Calendar (CalendarApp — built
 * into Apps Script, no extra setup or API key). Two things:
 *   1. getCalendarSummaryForToday() — what's on your calendar today, for
 *      display in the app.
 *   2. createCalendarEvent() — manually add an event, any date, from the
 *      app's "Add an Event" form.
 */

function getTodayCalendarEvents_(date) {
  var cal = CalendarApp.getDefaultCalendar();
  var events = cal.getEventsForDay(date);
  return events
    .map(function (e) {
      return {
        title: e.getTitle(),
        start: Utilities.formatDate(e.getStartTime(), Session.getScriptTimeZone(), 'h:mm a'),
        startMs: e.getStartTime().getTime()
      };
    })
    .sort(function (a, b) { return a.startMs - b.startMs; });
}

/** Everything the Calendar tab needs: today's date plus what's on it. */
function getCalendarSummaryForToday() {
  var date = todayDate_();
  return {
    dateStr: dateKey_(date),
    dayName: Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE, MMMM d'),
    events: getTodayCalendarEvents_(date).map(function (e) {
      return { title: e.title, start: e.start };
    })
  };
}

/**
 * Manually adds an all-day event to any date, from the app's "Add an Event"
 * form. Returns today's summary either way, since that's what the Calendar
 * tab is showing (adding an event for a different day won't visibly change
 * it, and that's fine — the new event still exists on the calendar for
 * that day).
 */
function createCalendarEvent(dateStr, title, description) {
  title = String(title || '').trim();
  if (!dateStr || !title) return getCalendarSummaryForToday();
  var date = parseDate_(dateStr);
  CalendarApp.getDefaultCalendar().createAllDayEvent(title, date, { description: description || '' });
  return getCalendarSummaryForToday();
}
