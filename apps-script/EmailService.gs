/**
 * EmailService.gs
 * ---------------
 * The three daily reminders. Run createTriggers() once (from the Apps
 * Script editor) to schedule them at 7am / 1pm / 6pm — see README for the
 * exact steps and how to authorize it. Free: consumer Gmail's send quota
 * is ~100/day, and this uses 3.
 */

function createTriggers() {
  deleteTriggers();
  ScriptApp.newTrigger('sendMorningEmail').timeBased().everyDays(1).atHour(7).nearMinute(0).create();
  ScriptApp.newTrigger('sendMiddayEmail').timeBased().everyDays(1).atHour(13).nearMinute(0).create();
  ScriptApp.newTrigger('sendEveningEmail').timeBased().everyDays(1).atHour(18).nearMinute(0).create();
  Logger.log('Triggers created: 7am, 1pm, 6pm daily.');
}

function deleteTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['sendMorningEmail', 'sendMiddayEmail', 'sendEveningEmail'].indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

function recipient_() {
  return EMAIL_TO || Session.getActiveUser().getEmail();
}

function emailShell_(title, bodyHtml, ctx) {
  var link = ctx.webAppUrl
    ? '<p style="margin-top:24px;"><a href="' + ctx.webAppUrl + '" style="background:#2f6f4f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Log today\'s progress →</a></p>'
    : '<p style="margin-top:24px;color:#888;">(Set your web app URL with setWebAppUrl() to make this a clickable button — see README.)</p>';
  return '<div style="font-family:Georgia,serif;max-width:520px;">' +
    '<h2 style="color:#2f6f4f;margin-bottom:0;">' + title + '</h2>' +
    '<p style="color:#666;margin-top:4px;">' + ctx.dayName + '</p>' +
    bodyHtml + link +
    '</div>';
}

function sendMorningEmail() {
  var ctx = getTodayContext();
  if (!ctx.inWindow) return;
  var t = ctx.prayerTargets;
  var body =
    '<h3>Morning Prayer</h3>' +
    '<p>Target: <strong>' + t.morning + ' minutes</strong> (' + ctx.phaseLabel + ')</p>' +
    '<h3>Second Batch of Messages</h3>' +
    '<p>You\'re on <strong>#' + ctx.set2Index + ' of ' + ctx.set2Total + '</strong>: ' +
    '<em>' + ctx.set2Message + '</em></p>';
  MailApp.sendEmail({
    to: recipient_(),
    subject: '🌅 7am — Morning Prayer & Second Batch of Messages',
    htmlBody: emailShell_('Morning Reminder', body, ctx)
  });
}

function sendMiddayEmail() {
  var ctx = getTodayContext();
  if (!ctx.inWindow) return;
  var t = ctx.prayerTargets;
  var body =
    '<h3>Campus Prayer & Prophesying</h3>' +
    '<p>Target: <strong>' + t.campus + ' minutes</strong>, worked into gaps in the day (before class, etc.)</p>' +
    '<h3>Read Rhapsody</h3>' +
    '<p>Today\'s devotional — read it before moving into the Bible reading plan below.</p>' +
    '<h3>Bible Reading Plan</h3>' +
    '<p>Currently: <strong>Month ' + ctx.bibleMonth + ', Week ' + ctx.bibleWeek + ', Day ' + ctx.bibleDay + '</strong></p>' +
    '<h3>First Batch of Messages</h3>' +
    '<p>Today\'s message: <strong>' + ctx.set1Message + '</strong></p>';
  MailApp.sendEmail({
    to: recipient_(),
    subject: '☀️ 1pm — Prophesy, Bible Reading & First Batch',
    htmlBody: emailShell_('Midday Reminder', body, ctx)
  });
}

function sendEveningEmail() {
  var ctx = getTodayContext();
  if (!ctx.inWindow) return;
  var t = ctx.prayerTargets;
  var dow = new Date().getDay();
  var eveningBlockLabel, eveningBlockMinutes;
  if (dow === 5) { eveningBlockLabel = 'Friday Night Prayer'; eveningBlockMinutes = t.fridayNight; }
  else if (dow === 6) { eveningBlockLabel = 'Saturday Night Prayer'; eveningBlockMinutes = t.saturdayNight; }
  else { eveningBlockLabel = 'Evening Prayer'; eveningBlockMinutes = t.evening; }

  var body =
    '<h3>' + eveningBlockLabel + '</h3>' +
    '<p>Target: <strong>' + eveningBlockMinutes + ' minutes</strong> (' + ctx.phaseLabel + ')</p>' +
    '<h3>First Batch of Messages</h3>' +
    '<p>Today\'s message: <strong>' + ctx.set1Message + '</strong></p>' +
    '<p style="color:#666;">Logged so far today: ' + ctx.prayerLogged.total + ' / ' + t.total + ' prayer minutes.</p>';
  MailApp.sendEmail({
    to: recipient_(),
    subject: '🌙 6pm — ' + eveningBlockLabel + ' & First Batch',
    htmlBody: emailShell_('Evening Reminder', body, ctx)
  });
}
