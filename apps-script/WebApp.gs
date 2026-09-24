/**
 * WebApp.gs
 * ---------
 * Deploy > New deployment > Web app to turn this into a URL you can open
 * from your phone. doGet() serves Index.html; everything else here is
 * called from that page via google.script.run.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('S.T.E.W.A.R.D.')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Thin wrappers so the client only ever talks to WebApp.gs by name.
function clientGetToday() {
  return getTodayContext();
}

function clientSaveLog(entry) {
  return saveTodayLog(entry);
}

function clientAdvanceSet1() {
  advanceSet1Message();
  return getTodayContext();
}

function clientRetreatSet1() {
  retreatSet1Message();
  return getTodayContext();
}

function clientAdvanceSet2() {
  advanceSet2Message();
  return getTodayContext();
}

function clientSetBiblePointer(month, week, day) {
  setBiblePointer(month, week, day);
  return getTodayContext();
}

function clientGetHistory(days) {
  return getHistory(days);
}

function clientAddTodo(task) {
  return addTodo(task);
}

function clientToggleTodo(id, done) {
  return toggleTodo(id, done);
}

function clientEditTodoText(id, task) {
  return editTodoText(id, task);
}

function clientDeleteTodo(id) {
  return deleteTodo(id);
}

function clientSaveGym(workout, done) {
  return saveGymLog(workout, done);
}

function clientGetCalendar() {
  return getCalendarSummaryForToday();
}

function clientAddCalendarEvent(dateStr, title, description, startTime, endTime) {
  return createCalendarEvent(dateStr, title, description, startTime, endTime);
}

// AiAssistant.gs — both let a real error (e.g. no API key set yet) surface
// to the client as-is, unlike the emails' assistantBriefingHtml_(), since
// here the user is actively looking at the STEWARD chamber and asking for it.
function clientGetSmartBriefing() {
  return generateSmartBriefing();
}

function clientAskAssistant(question, history) {
  return askAssistant(question, history);
}

function clientWriteProgressLog() {
  return writeTodaysProgressLog();
}
