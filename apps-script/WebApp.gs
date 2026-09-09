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
    .setTitle('Spiritual Progress Tracker')
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

function clientSyncCalendar() {
  return syncTodayToCalendar();
}
