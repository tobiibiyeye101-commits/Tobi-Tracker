/**
 * DataService.gs
 * --------------
 * Everything that reads or writes the Sheet, plus the pure-logic helpers
 * (which phase of the prayer ramp a date falls in, which Set 1 message is
 * due, etc). WebApp.gs and EmailService.gs both build on top of this file.
 */

// ---- Set 1 (date-driven rotation) -----------------------------------------
function getSet1MessageForDate_(date) {
  var idx = daysSinceStart_(date);
  if (idx < 0) idx = 0;
  return SET1_ROTATION[idx % SET1_ROTATION.length];
}

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
    morning: phase.morning,
    evening: (isFriday || isSaturday) ? 0 : phase.evening, // Fri/Sat night prayer replaces the evening block
    campus: phase.campus,
    fridayNight: isFriday ? FRIDAY_NIGHT_MINUTES : 0,
    saturdayNight: isSaturday ? phase.saturdayNight : 0
  };
  targets.total = targets.morning + targets.evening + targets.campus + targets.fridayNight + targets.saturdayNight;
  return targets;
}

// ---- Pointers (Set 2 current message, Bible reading position) -------------
function getPointers_() {
  var sheet = getOrCreateSpreadsheet_().getSheetByName('Pointers');
  var row = sheet.getRange(2, 1, 1, 5).getValues()[0];
  return {
    set2Index: row[0] || 1,
    bibleMonth: row[1] || 1,
    bibleWeek: row[2] || 1,
    bibleDay: row[3] || 1
  };
}

function savePointers_(pointers) {
  var sheet = getOrCreateSpreadsheet_().getSheetByName('Pointers');
  sheet.getRange(2, 1, 1, 5).setValues([[
    pointers.set2Index, pointers.bibleMonth, pointers.bibleWeek, pointers.bibleDay, new Date()
  ]]);
}

function advanceSet2Message() {
  var pointers = getPointers_();
  var sheet = getOrCreateSpreadsheet_().getSheetByName('Set2_Messages');
  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();

  // mark the current one Done
  data.forEach(function (r, i) {
    if (r[0] === pointers.set2Index) {
      sheet.getRange(i + 2, 3, 1, 2).setValues([['Done', new Date()]]);
    }
  });

  var nextIndex = Math.min(pointers.set2Index + 1, SET2_MESSAGES.length);
  data.forEach(function (r, i) {
    if (r[0] === nextIndex && nextIndex !== pointers.set2Index) {
      sheet.getRange(i + 2, 3, 1, 1).setValue('Current');
    }
  });

  pointers.set2Index = nextIndex;
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

  return {
    dateStr: dateStr,
    dayName: Utilities.formatDate(date, Session.getScriptTimeZone(), 'EEEE, MMMM d'),
    inWindow: isWithinTrackingWindow_(date),
    phaseLabel: targets.phaseLabel,
    set1Message: getSet1MessageForDate_(date),
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
    webAppUrl: PropertiesService.getScriptProperties().getProperty(WEBAPP_URL_PROPERTY_KEY) || ''
  };
}
