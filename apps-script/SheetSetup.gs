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
  ensureSet2Sheet_(ss);
  ensurePointersSheet_(ss);
  ensureDailyLogSheet_(ss);
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

function ensurePointersSheet_(ss) {
  var sheet = ss.getSheetByName('Pointers');
  if (!sheet) {
    sheet = ss.insertSheet('Pointers');
    sheet.appendRow(['Set2_CurrentIndex', 'Bible_Month', 'Bible_Week', 'Bible_Day', 'Last Updated']);
    sheet.setFrozenRows(1);
    sheet.appendRow([1, 1, 1, 1, new Date()]);
  }
  return sheet;
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
  return sheet;
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

/**
 * Call this once, after deploying the web app (Deploy > New deployment),
 * pasting the /exec URL in as webAppUrl. It's stored so the reminder
 * emails can link straight to your logging page.
 */
function setWebAppUrl(webAppUrl) {
  PropertiesService.getScriptProperties().setProperty(WEBAPP_URL_PROPERTY_KEY, webAppUrl);
}
