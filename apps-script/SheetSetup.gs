/**
 * SheetSetup.gs
 * -------------
 * Run setup() once, from the Apps Script editor (select it in the function
 * dropdown, click Run). It creates "Tobi Spiritual Progress Tracker" in your
 * Drive, builds the three tabs this project needs, and seeds them.
 * Safe to re-run — it will not wipe existing data, only fill in what's missing.
 */

function setup() {
  var ss = getOrCreateSpreadsheet_();
  ensureSet1Sheet_(ss);
  ensureSet2Sheet_(ss);
  ensurePointersSheet_(ss);
  ensureDailyLogSheet_(ss);
  ensureToDoSheet_(ss);
  ensurePrayerPointsSheet_(ss);
  ensurePrayerPeopleSheet_(ss);
  ensureGymLogSheet_(ss);
  // Only safe to remove the default "Sheet1" once the tabs above exist —
  // Sheets refuses to delete the last remaining sheet in a spreadsheet.
  removeDefaultSheet_(ss);
  Logger.log('Setup complete. Spreadsheet: ' + ss.getUrl());
  return ss.getUrl();
}

function getOrCreateSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // fall through and recreate if the stored id no longer resolves
    }
  }
  var ss = SpreadsheetApp.create('Tobi Spiritual Progress Tracker');
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function removeDefaultSheet_(ss) {
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);
}

// "3 Kinds of Wisdom" — same pointer-driven shape as Set 2, just a
// different sheet/list. See ensureSet2Sheet_ below for the pattern this
// mirrors exactly.
function ensureSet1Sheet_(ss) {
  var sheet = ss.getSheetByName('Set1_Messages');
  if (!sheet) {
    sheet = ss.insertSheet('Set1_Messages');
    sheet.appendRow(['Order', 'Title', 'Status', 'Completed Date']);
    sheet.setFrozenRows(1);
    SET1_MESSAGES.forEach(function (title, i) {
      sheet.appendRow([i + 1, title, i === 0 ? 'Current' : 'Not Started', '']);
    });
    sheet.autoResizeColumns(1, 4);
  }
  return sheet;
}
function getSet1Sheet_() {
  return ensureSet1Sheet_(getOrCreateSpreadsheet_());
}

function ensureSet2Sheet_(ss) {
  var sheet = ss.getSheetByName('Set2_Messages');
  if (!sheet) {
    sheet = ss.insertSheet('Set2_Messages');
    sheet.appendRow(['Order', 'Title', 'Status', 'Completed Date']);
    sheet.setFrozenRows(1);
    SET2_MESSAGES.forEach(function (title, i) {
      sheet.appendRow([i + 1, title, i === 0 ? 'Current' : 'Not Started', '']);
    });
    sheet.autoResizeColumns(1, 4);
  }
  return sheet;
}
function getSet2Sheet_() {
  return ensureSet2Sheet_(getOrCreateSpreadsheet_());
}

function ensurePointersSheet_(ss) {
  var sheet = ss.getSheetByName('Pointers');
  if (!sheet) {
    sheet = ss.insertSheet('Pointers');
    sheet.appendRow(['Set1_CurrentIndex', 'Set2_CurrentIndex', 'Bible_Month', 'Bible_Week', 'Bible_Day', 'Last Updated']);
    sheet.setFrozenRows(1);
    sheet.appendRow([1, 1, 1, 1, 1, new Date()]);
  } else {
    migratePointersAddSet1_(sheet);
  }
  return sheet;
}
function getPointersSheet_() {
  return ensurePointersSheet_(getOrCreateSpreadsheet_());
}

/**
 * If Pointers was created before Set 1 became pointer-driven, insert a new
 * first column (Set1_CurrentIndex) ahead of Set2_CurrentIndex, shifting the
 * rest right, and seed it to 1 so the existing row keeps its shape. Same
 * pattern as migrateDailyLogAddRhapsody_ below.
 */
function migratePointersAddSet1_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('Set1_CurrentIndex') !== -1) return; // already migrated

  sheet.insertColumnBefore(1);
  sheet.getRange(1, 1).setValue('Set1_CurrentIndex');
  if (sheet.getLastRow() >= 2) sheet.getRange(2, 1).setValue(1);
}

function ensureDailyLogSheet_(ss) {
  var sheet = ss.getSheetByName('Daily_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Daily_Log');
    sheet.appendRow([
      'Date', 'Day', 'Set1 Message', 'Set1 Done',
      'Set2 Message', 'Set2 Minutes', 'Set2 Notes',
      'Rhapsody Done', 'Rhapsody Notes',
      'Bible Month', 'Bible Week', 'Bible Day', 'Bible Done',
      'Prayer Morning', 'Prayer Evening', 'Prayer Friday Night',
      'Prayer Saturday Night', 'Prayer Campus', 'Prayer Total',
      'Prayer Target', 'Notes', 'Last Updated'
    ]);
    sheet.setFrozenRows(1);
  } else {
    migrateDailyLogAddRhapsody_(sheet);
  }
  // Force column A to plain text so Sheets stops silently converting the
  // "yyyy-MM-dd" date key into a real Date value — that conversion is what
  // broke same-day row lookups (see normalizeDateCell_ in DataService.gs).
  sheet.getRange('A2:A').setNumberFormat('@');
  return sheet;
}

/**
 * Every read/write in DataService.gs should fetch Daily_Log through this,
 * not via getSheetByName() directly. It runs the same ensure/migrate check
 * every time (cheap — one header row read), so the sheet's shape can never
 * drift out from under a code change again just because setup() wasn't
 * re-run first.
 */
function getDailyLogSheet_() {
  return ensureDailyLogSheet_(getOrCreateSpreadsheet_());
}

/**
 * If Daily_Log was created before "Read Rhapsody" existed, insert the two
 * new columns (Rhapsody Done / Rhapsody Notes) ahead of Bible Month,
 * shifting existing Bible/Prayer/Notes columns right. Existing rows keep
 * their data; the new columns are simply blank for past days.
 */
function migrateDailyLogAddRhapsody_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('Rhapsody Done') !== -1) return; // already migrated

  var bibleMonthCol = headers.indexOf('Bible Month') + 1; // 1-based
  if (bibleMonthCol === 0) return; // unexpected shape, don't guess

  sheet.insertColumnsBefore(bibleMonthCol, 2);
  sheet.getRange(1, bibleMonthCol, 1, 2).setValues([['Rhapsody Done', 'Rhapsody Notes']]);
}

// ---- To-Do List ------------------------------------------------------------
// Fully editable both ways: the app adds/checks/edits/deletes rows by ID,
// and you can just as easily add or edit rows directly in the sheet.
function ensureToDoSheet_(ss) {
  var sheet = ss.getSheetByName('ToDo_List');
  if (!sheet) {
    sheet = ss.insertSheet('ToDo_List');
    sheet.appendRow(['ID', 'Task', 'Done', 'Created']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function getToDoSheet_() {
  return ensureToDoSheet_(getOrCreateSpreadsheet_());
}

// ---- Prayer Points ----------------------------------------------------------
// Content-only — edit the list in this sheet, the app steps through it one
// per day (see getPrayerPointForDate_ in DataService.gs) as the first of
// "today's two"; the second is a rotating name from Prayer_People below.
function ensurePrayerPointsSheet_(ss) {
  var sheet = ss.getSheetByName('Prayer_Points');
  if (!sheet) {
    sheet = ss.insertSheet('Prayer_Points');
    sheet.appendRow(['Order', 'Title', 'Content']);
    sheet.setFrozenRows(1);
    for (var i = 1; i <= 10; i++) {
      sheet.appendRow([i, 'Prayer Point ' + i, 'Edit the title and content for this point in the Prayer_Points sheet.']);
    }
  } else {
    migratePrayerPointsAddContent_(sheet);
  }
  return sheet;
}
function getPrayerPointsSheet_() {
  return ensurePrayerPointsSheet_(getOrCreateSpreadsheet_());
}

// ---- Prayer People (rotating "pray for" list — replaces the old second-
// of-two Prayer Points slot) --------------------------------------------
// Two independent name lists, one per column — Church and Outside Church —
// purely for your own bookkeeping. The app concatenates both columns into
// one sequence and rotates through it a name a day (see
// getPrayerPersonForDate_ in DataService.gs); it never shows which column a
// name came from.
function ensurePrayerPeopleSheet_(ss) {
  var sheet = ss.getSheetByName('Prayer_People');
  if (!sheet) {
    sheet = ss.insertSheet('Prayer_People');
    sheet.appendRow(['Church', 'Outside Church']);
    sheet.setFrozenRows(1);
    sheet.getRange(2, 1, 2, 1).setValues([
      ['Church Member 1 — edit in Prayer_People sheet'],
      ['Church Member 2 — edit in Prayer_People sheet']
    ]);
    sheet.getRange(2, 2).setValue('Someone Outside Church — edit in Prayer_People sheet');
    sheet.autoResizeColumns(1, 2);
  } else {
    migratePrayerPeopleToTwoColumns_(sheet);
  }
  return sheet;
}
function getPrayerPeopleSheet_() {
  return ensurePrayerPeopleSheet_(getOrCreateSpreadsheet_());
}

/**
 * If Prayer_People predates the two-column Church/Outside Church shape, it
 * has Order | Name | Church Member instead. Split its names into the two
 * new columns by that boolean, then rewrite the sheet — same "reshape in
 * place, keep the data" pattern as the other migrate*_ functions here.
 */
function migratePrayerPeopleToTwoColumns_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers[0] === 'Church' && headers[1] === 'Outside Church') return; // already migrated

  var nameCol = headers.indexOf('Name') + 1; // 1-based
  var churchCol = headers.indexOf('Church Member') + 1;
  if (nameCol === 0 || churchCol === 0) return; // unexpected shape, don't guess

  var lastRow = sheet.getLastRow();
  var churchNames = [];
  var outsideNames = [];
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).getValues().forEach(function (r) {
      var name = r[nameCol - 1];
      if (name === '') return;
      (r[churchCol - 1] === true ? churchNames : outsideNames).push(name);
    });
  }

  sheet.clear();
  sheet.appendRow(['Church', 'Outside Church']);
  sheet.setFrozenRows(1);
  if (churchNames.length) sheet.getRange(2, 1, churchNames.length, 1).setValues(churchNames.map(function (n) { return [n]; }));
  if (outsideNames.length) sheet.getRange(2, 2, outsideNames.length, 1).setValues(outsideNames.map(function (n) { return [n]; }));
  sheet.autoResizeColumns(1, 2);
}

/**
 * If Prayer_Points predates the Title/Content split, it only has a single
 * "Point" column. Relabel it "Title" in place and insert a new blank
 * "Content" column right after it — existing points keep their text as a
 * title with no content yet, rather than losing anything.
 */
function migratePrayerPointsAddContent_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers.indexOf('Content') !== -1) return; // already migrated

  var pointCol = headers.indexOf('Point') + 1; // 1-based
  if (pointCol === 0) return; // unexpected shape, don't guess

  sheet.getRange(1, pointCol).setValue('Title');
  sheet.insertColumnAfter(pointCol);
  sheet.getRange(1, pointCol + 1).setValue('Content');
}

// ---- Gym --------------------------------------------------------------------
// One row per day, same upsert-by-date shape as Daily_Log — free-text
// "today's set" since the actual split just varies by what you type.
function ensureGymLogSheet_(ss) {
  var sheet = ss.getSheetByName('Gym_Log');
  if (!sheet) {
    sheet = ss.insertSheet('Gym_Log');
    sheet.appendRow(['Date', 'Day', 'Workout', 'Done', 'Last Updated']);
    sheet.setFrozenRows(1);
  }
  sheet.getRange('A2:A').setNumberFormat('@'); // same date-autoconvert defense as Daily_Log
  return sheet;
}
function getGymLogSheet_() {
  return ensureGymLogSheet_(getOrCreateSpreadsheet_());
}

/**
 * Call this once, after deploying the web app (Deploy > New deployment),
 * pasting the /exec URL in as webAppUrl. It's stored so the reminder
 * emails can link straight to your logging page.
 */
function setWebAppUrl(webAppUrl) {
  PropertiesService.getScriptProperties().setProperty(WEBAPP_URL_PROPERTY_KEY, webAppUrl);
}
