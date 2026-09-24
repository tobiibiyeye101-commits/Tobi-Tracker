/**
 * DataService.gs
 * --------------
 * Everything that reads or writes the Sheet, plus the pure-logic helpers
 * (which phase of the prayer ramp a date falls in, which Set 1 message is
 * due, etc). WebApp.gs and EmailService.gs both build on top of this file.
 */

// ---- Prayer ramp ------------------------------------------------------------
function getPrayerPhaseForDate_(date) {
  var idx = Math.max(0, daysSinceStart_(date));
  for (var i = 0; i < PRAYER_PHASES.length; i++) {
    var p = PRAYER_PHASES[i];
    if (idx >= p.fromDay && idx <= p.toDay) return p;
  }
  return PRAYER_PHASES[PRAYER_PHASES.length - 1];
}

/**
 * Returns the day's prayer targets by component, plus a total, factoring in
 * which day of the week it is (Friday night and Saturday night only apply
 * on their own days).
 */
function getPrayerTargetsForDate_(date) {
  var phase = getPrayerPhaseForDate_(date);
  var dow = date.getDay(); // 0 = Sun ... 5 = Fri, 6 = Sat
  var isFriday = dow === 5;
  var isSaturday = dow === 6;

  var targets = {
    phaseLabel: phase.label,
    morning: (isFriday || isSaturday) ? SHORT_MORNING_MINUTES : phase.morning, // long night session carries the day
    evening: (isFriday || isSaturday) ? 0 : phase.evening, // Fri/Sat night prayer replaces the evening block
    campus: phase.campus,
    fridayNight: isFriday ? FRIDAY_NIGHT_MINUTES : 0,
    saturdayNight: isSaturday ? phase.saturdayNight : 0
  };
  targets.total = targets.morning + targets.evening + targets.campus + targets.fridayNight + targets.saturdayNight;
  return targets;
}

// ---- Prayer Points (content-only, two-per-day rotation) -------------------
/** One topic per day from Prayer_Points — the first of "today's two". */
function getPrayerPointForDate_(date) {
  var sheet = getPrayerPointsSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var list = sheet.getRange(2, 2, lastRow - 1, 2).getValues() // Title, Content
    .map(function (r) { return { title: r[0], content: r[1] }; })
    .filter(function (p) { return p.title !== '' || p.content !== ''; });
  if (!list.length) return null;
  var idx = Math.max(0, daysSinceStart_(date));
  return list[idx % list.length];
}

/**
 * One name per day from Prayer_People — the second of "today's two". Church
 * and Outside Church are two independent name lists (columns) in the sheet,
 * but they're concatenated into a single sequence here and rotated through
 * as one list — the app never surfaces which column a name came from.
 */
function getPrayerPersonForDate_(date) {
  var sheet = getPrayerPeopleSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // Church, Outside Church
  var names = [];
  rows.forEach(function (r) { if (r[0] !== '') names.push(r[0]); });
  rows.forEach(function (r) { if (r[1] !== '') names.push(r[1]); });
  if (!names.length) return null;
  var idx = Math.max(0, daysSinceStart_(date));
  return names[idx % names.length];
}

/**
 * "Today's two": one Prayer_Points topic plus one Prayer_People name,
 * each on its own one-per-day rotation through its own list — replaced
 * the old single list that stepped two-at-a-time, so adding the people
 * rotation didn't mean touching the Prayer_Points list or its cadence.
 * Same {title, content}[] shape as before, so nothing downstream
 * (getTodayContext, the web app's renderPrayerPoints) needed to change.
 */
function getPrayerPointsForDate_(date) {
  var points = [];
  var point = getPrayerPointForDate_(date);
  if (point) points.push(point);
  var name = getPrayerPersonForDate_(date);
  if (name) {
    points.push({ title: 'Pray for ' + name, content: 'Take a moment to pray for them today.' });
  }
  return points;
}

// ---- To-Do List ---------------------------------------------------------------
function getTodos() {
  var sheet = getToDoSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  return values
    .map(function (r) { return { id: r[0], task: r[1], done: r[2] === true }; })
    .filter(function (t) { return t.task !== ''; });
}

function findToDoRow_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (Number(ids[i][0]) === Number(id)) return i + 2;
  }
  return -1;
}

function addTodo(task) {
  task = String(task || '').trim();
  if (!task) return getTodos();
  var sheet = getToDoSheet_();
  var lastRow = sheet.getLastRow();
  var nextId = 1;
  if (lastRow >= 2) {
    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().map(function (r) { return Number(r[0]) || 0; });
    nextId = Math.max.apply(null, ids) + 1;
  }
  sheet.appendRow([nextId, task, false, new Date()]);
  return getTodos();
}

function toggleTodo(id, done) {
  var sheet = getToDoSheet_();
  var row = findToDoRow_(sheet, id);
  if (row !== -1) sheet.getRange(row, 3).setValue(!!done);
  return getTodos();
}

function editTodoText(id, task) {
  var sheet = getToDoSheet_();
  var row = findToDoRow_(sheet, id);
  if (row !== -1) sheet.getRange(row, 2).setValue(String(task || '').trim());
  return getTodos();
}

function deleteTodo(id) {
  var sheet = getToDoSheet_();
  var row = findToDoRow_(sheet, id);
  if (row !== -1) sheet.deleteRow(row);
  return getTodos();
}

// ---- Gym ------------------------------------------------------------------
function getGymLogRow_(dateStr) {
  var sheet = getGymLogSheet_();
  var row = findRowForDate_(sheet, dateStr);
  if (row === -1) return null;
  var values = sheet.getRange(row, 1, 1, 5).getValues()[0];
  return { date: values[0], day: values[1], workout: values[2], done: values[3] };
}

function saveGymLog(workout, done) {
  var sheet = getGymLogSheet_();
  var date = todayDate_();
  var dateStr = dateKey_(date);
  var row = findRowForDate_(sheet, dateStr);
  var values = [
    dateStr, Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE'),
    workout || '', !!done, new Date()
  ];
  if (row === -1) {
    sheet.appendRow(values);
  } else {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  }
  return getTodayContext();
}

// ---- Pointers (Set 1 + Set 2 current message, Bible reading position) -----
function getPointers_() {
  var sheet = getPointersSheet_();
  var row = sheet.getRange(2, 1, 1, 6).getValues()[0];
  return {
    set1Index: row[0] || 1,
    set2Index: row[1] || 1,
    bibleMonth: row[2] || 1,
    bibleWeek: row[3] || 1,
    bibleDay: row[4] || 1
  };
}

function savePointers_(pointers) {
  var sheet = getPointersSheet_();
  sheet.getRange(2, 1, 1, 6).setValues([[
    pointers.set1Index, pointers.set2Index, pointers.bibleMonth, pointers.bibleWeek, pointers.bibleDay, new Date()
  ]]);
}

/**
 * Shared by advanceSet1Message/advanceSet2Message: marks the current row
 * Done in a Set1_Messages/Set2_Messages-shaped sheet, marks the next row
 * Current, and returns the next index (capped at the list length).
 */
function advanceMessageSheet_(sheet, currentIndex, messages) {
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

  data.forEach(function (r, i) {
    if (r[0] === currentIndex) {
      sheet.getRange(i + 2, 3, 1, 2).setValues([['Done', new Date()]]);
    }
  });

  var nextIndex = Math.min(currentIndex + 1, messages.length);
  data.forEach(function (r, i) {
    if (r[0] === nextIndex && nextIndex !== currentIndex) {
      sheet.getRange(i + 2, 3, 1, 1).setValue('Current');
    }
  });

  return nextIndex;
}

/**
 * Set 1's "Listened to it" checkbox is just a plain daily flag (like
 * Rhapsody/Bible) — it never moves the pointer itself. Moving to a
 * different part (either direction, see below) always clears today's flag
 * for the same reason: it always means "have I listened to whichever part
 * is showing now", and that answer resets the moment the part changes.
 * Column D is "Set1 Done" in Daily_Log's fixed header order (see
 * ARCHITECTURE.md's Daily_Log column table) — a no-op if today has no row
 * yet, since getTodayContext() already reads a missing row as not-done.
 */
function resetSet1DoneForToday_() {
  var sheet = getDailyLogSheet_();
  var row = findRowForDate_(sheet, dateKey_(todayDate_()));
  if (row === -1) return;
  sheet.getRange(row, 4).setValue('No');
}

function advanceSet1Message() {
  var pointers = getPointers_();
  pointers.set1Index = advanceMessageSheet_(getSet1Sheet_(), pointers.set1Index, SET1_MESSAGES);
  savePointers_(pointers);
  resetSet1DoneForToday_();
  return pointers;
}

/**
 * The "‹ Previous" side of Set 1's navigation — real recovery for landing
 * on the wrong part, not just a preview. Moves the pointer back one slot;
 * the part being left is relabeled Not Started unless it already has a
 * Completed Date (in which case it's genuinely done, so it stays labeled
 * Done) — either way its Completed Date cell itself is never touched, so
 * real completion history can't be lost by browsing back over it.
 */
function retreatSet1Message() {
  var pointers = getPointers_();
  var newIndex = Math.max(1, pointers.set1Index - 1);
  if (newIndex !== pointers.set1Index) {
    var sheet = getSet1Sheet_();
    var lastRow = sheet.getLastRow();
    var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues(); // Order, Title, Status, Completed Date
    data.forEach(function (r, i) {
      if (r[0] === pointers.set1Index) {
        sheet.getRange(i + 2, 3).setValue(r[3] ? 'Done' : 'Not Started');
      }
      if (r[0] === newIndex) {
        sheet.getRange(i + 2, 3).setValue('Current');
      }
    });
    pointers.set1Index = newIndex;
    savePointers_(pointers);
    resetSet1DoneForToday_();
  }
  return pointers;
}

function advanceSet2Message() {
  var pointers = getPointers_();
  pointers.set2Index = advanceMessageSheet_(getSet2Sheet_(), pointers.set2Index, SET2_MESSAGES);
  savePointers_(pointers);
  return pointers;
}

function setBiblePointer(month, week, day) {
  var pointers = getPointers_();
  pointers.bibleMonth = Number(month) || pointers.bibleMonth;
  pointers.bibleWeek = Number(week) || pointers.bibleWeek;
  pointers.bibleDay = Number(day) || pointers.bibleDay;
  savePointers_(pointers);
  return pointers;
}

// ---- Daily log --------------------------------------------------------------
/**
 * Sheets silently converts a date-shaped string ("2026-09-03") into a real
 * Date value when it's written, even via the API. Comparing that Date back
 * against the plain dateStr with === always fails, so every lookup would
 * have missed and every save would have appended a fresh row instead of
 * updating today's. Normalizing both sides to the same yyyy-MM-dd string
 * before comparing is what makes "one row per day" actually hold.
 */
function normalizeDateCell_(cellValue) {
  if (cellValue instanceof Date) {
    return Utilities.formatDate(cellValue, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(cellValue);
}

function findRowForDate_(sheet, dateStr) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < dates.length; i++) {
    if (normalizeDateCell_(dates[i][0]) === dateStr) return i + 2;
  }
  return -1;
}

function getLogRow_(dateStr) {
  var sheet = getDailyLogSheet_();
  var row = findRowForDate_(sheet, dateStr);
  if (row === -1) return null;
  var values = sheet.getRange(row, 1, 1, 22).getValues()[0];
  return {
    date: values[0], day: values[1], set1Message: values[2], set1Done: values[3],
    set2Message: values[4], set2Minutes: values[5], set2Notes: values[6],
    rhapsodyDone: values[7], rhapsodyNotes: values[8],
    bibleMonth: values[9], bibleWeek: values[10], bibleDay: values[11], bibleDone: values[12],
    prayerMorning: values[13], prayerEvening: values[14], prayerFriday: values[15],
    prayerSaturday: values[16], prayerCampus: values[17], prayerTotal: values[18],
    prayerTarget: values[19], notes: values[20]
  };
}

/**
 * Upserts today's row from a plain object coming out of the web app form.
 */
function saveTodayLog(entry) {
  var sheet = getDailyLogSheet_();
  var date = todayDate_();
  var dateStr = dateKey_(date);
  var row = findRowForDate_(sheet, dateStr);

  var prayerTotal = Number(entry.prayerMorning || 0) + Number(entry.prayerEvening || 0) +
    Number(entry.prayerFriday || 0) + Number(entry.prayerSaturday || 0) + Number(entry.prayerCampus || 0);
  var targets = getPrayerTargetsForDate_(date);

  var values = [
    dateStr, Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE'),
    entry.set1Message, entry.set1Done ? 'Yes' : 'No',
    entry.set2Message, Number(entry.set2Minutes || 0), entry.set2Notes || '',
    entry.rhapsodyDone ? 'Yes' : 'No', entry.rhapsodyNotes || '',
    entry.bibleMonth, entry.bibleWeek, entry.bibleDay, entry.bibleDone ? 'Yes' : 'No',
    Number(entry.prayerMorning || 0), Number(entry.prayerEvening || 0), Number(entry.prayerFriday || 0),
    Number(entry.prayerSaturday || 0), Number(entry.prayerCampus || 0), prayerTotal,
    targets.total, entry.notes || '', new Date()
  ];

  if (row === -1) {
    sheet.appendRow(values);
  } else {
    sheet.getRange(row, 1, 1, values.length).setValues([values]);
  }
  return getTodayContext();
}

function getHistory(days) {
  var sheet = getDailyLogSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var numRows = Math.min(days || 14, lastRow - 1);
  var startRow = lastRow - numRows + 1;
  var values = sheet.getRange(startRow, 1, numRows, 22).getValues();
  return values.map(function (v) {
    return {
      date: v[0], day: v[1], set1Message: v[2], set1Done: v[3],
      set2Message: v[4], set2Minutes: v[5],
      rhapsodyDone: v[7],
      bibleMonth: v[9], bibleWeek: v[10], bibleDay: v[11], bibleDone: v[12],
      prayerTotal: v[18], prayerTarget: v[19]
    };
  }).reverse();
}

/**
 * The single function both the web app and the reminder emails build off:
 * everything relevant to "today" in one object.
 */
function getTodayContext() {
  var date = todayDate_();
  var dateStr = dateKey_(date);
  var pointers = getPointers_();
  var targets = getPrayerTargetsForDate_(date);
  var existing = getLogRow_(dateStr) || {};
  var gym = getGymLogRow_(dateStr) || {};

  return {
    dateStr: dateStr,
    dayName: Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE, MMMM d'),
    inWindow: isWithinTrackingWindow_(date),
    phaseLabel: targets.phaseLabel,
    set1Index: pointers.set1Index,
    set1Total: SET1_MESSAGES.length,
    set1Message: SET1_MESSAGES[pointers.set1Index - 1] || 'All messages complete',
    set1Done: existing.set1Done === 'Yes',
    set2Index: pointers.set2Index,
    set2Total: SET2_MESSAGES.length,
    set2Message: SET2_MESSAGES[pointers.set2Index - 1] || 'All messages complete',
    set2MinutesLogged: existing.set2Minutes || 0,
    set2Notes: existing.set2Notes || '',
    rhapsodyDone: existing.rhapsodyDone === 'Yes',
    rhapsodyNotes: existing.rhapsodyNotes || '',
    bibleMonth: pointers.bibleMonth,
    bibleWeek: pointers.bibleWeek,
    bibleDay: pointers.bibleDay,
    bibleDone: existing.bibleDone === 'Yes',
    prayerTargets: targets,
    prayerLogged: {
      morning: existing.prayerMorning || 0,
      evening: existing.prayerEvening || 0,
      friday: existing.prayerFriday || 0,
      saturday: existing.prayerSaturday || 0,
      campus: existing.prayerCampus || 0,
      total: existing.prayerTotal || 0
    },
    notes: existing.notes || '',
    todos: getTodos(),
    prayerPoints: getPrayerPointsForDate_(date),
    gymDay: Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE'),
    gymWorkout: gym.workout || '',
    gymDone: gym.done === true,
    webAppUrl: PropertiesService.getScriptProperties().getProperty(WEBAPP_URL_PROPERTY_KEY) || ''
  };
}
