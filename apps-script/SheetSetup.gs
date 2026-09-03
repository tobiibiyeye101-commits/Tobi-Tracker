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
  // the default "Sheet1" isn't used by this project
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1) ss.deleteSheet(sheet1);
  return ss;
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
      'Bible Month', 'Bible Week', 'Bible Day', 'Bible Done',
      'Prayer Morning', 'Prayer Evening', 'Prayer Friday Night',
      'Prayer Saturday Night', 'Prayer Campus', 'Prayer Total',
      'Prayer Target', 'Notes', 'Last Updated'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Call this once, after deploying the web app (Deploy > New deployment),
 * pasting the /exec URL in as webAppUrl. It's stored so the reminder
 * emails can link straight to your logging page.
 */
function setWebAppUrl(webAppUrl) {
  PropertiesService.getScriptProperties().setProperty(WEBAPP_URL_PROPERTY_KEY, webAppUrl);
}
