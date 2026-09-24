/**
 * EmailService.gs
 * ---------------
 * The three daily reminders. Run createTriggers() once (from the Apps
 * Script editor) to schedule them at 7am / 1pm / 6pm — see README for the
 * exact steps and how to authorize it. Free: consumer Gmail's send quota
 * is ~100/day, and this uses 3.
 *
 * The 7am trigger also carries STEWARD's one proactive daily push (the
 * Daily Secretary Briefing, AiAssistant.gs → Google Chat, ChatService.gs)
 * — no separate trigger for it, see sendMorningEmail().
 */

function createTriggers() {
  deleteTriggers();
  ScriptApp.newTrigger('sendMorningEmail').timeBased().everyDays(1).atHour(7).nearMinute(0).create();
  ScriptApp.newTrigger('sendMiddayEmail').timeBased().everyDays(1).atHour(13).nearMinute(0).create();
  ScriptApp.newTrigger('sendEveningEmail').timeBased().everyDays(1).atHour(18).nearMinute(0).create();
  Logger.log('Triggers created: 7am, 1pm, 6pm daily.');
}

function deleteTriggers() {
  // syncTodayToCalendar is no longer created, but stays listed here so that
  // re-running this cleans up a leftover trigger from before it was removed,
  // rather than leaving it pointed at a function that no longer exists.
  var handled = ['sendMorningEmail', 'sendMiddayEmail', 'sendEveningEmail', 'syncTodayToCalendar'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handled.indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

function recipient_() {
  return EMAIL_TO || Session.getActiveUser().getEmail();
}

/**
 * The optional AI briefing (AiAssistant.gs) prepended to each email, when
 * set up — wrapped so a missing/bad Gemini key, a rate limit, or any other
 * failure there never breaks the reminder email itself. No key set at all
 * is the common case (it's opt-in) and returns silently, no noise.
 */
function assistantBriefingHtml_() {
  try {
    if (!getGeminiApiKey_()) return '';
    var text = generateSmartBriefing();
    return '<div style="background:#f2f7f4;border-left:3px solid #2f6f4f;padding:10px 14px;margin-bottom:18px;">' +
      '<div style="font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#2f6f4f;margin-bottom:4px;">Assistant</div>' +
      '<div style="color:#333;">' + text.replace(/\n/g, '<br>') + '</div></div>';
  } catch (e) {
    Logger.log('Assistant briefing skipped: ' + e.message);
    return '';
  }
}

/**
 * Writes/updates today's Progress Log entry (AiAssistant.gs) and returns a
 * link to it, or null on any failure — same defensive wrapping as
 * assistantBriefingHtml_() above, so a missing key, a rate limit, or
 * Gemini/Docs being briefly down never breaks the evening email itself.
 * Only called from the evening email: by 6pm most of the day's tracking
 * is in, though anything logged later that evening won't be reflected —
 * re-running it from the STEWARD chamber's button after the fact updates
 * that same entry in place rather than adding a second one.
 */
function progressLogUrlSafely_() {
  try {
    if (!getGeminiApiKey_()) return null;
    return writeTodaysProgressLog().url;
  } catch (e) {
    Logger.log('Progress log skipped: ' + e.message);
    return null;
  }
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
  // Piggybacked here rather than its own trigger — one proactive push a
  // day, at the same 7am moment the day's first email already fires.
  // sendDailySecretaryBriefing() wraps its own body in try/catch, so a
  // missing/bad Chat webhook can never stop this email from sending.
  sendDailySecretaryBriefing();
  var t = ctx.prayerTargets;
  var body = assistantBriefingHtml_() +
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
  var body = assistantBriefingHtml_() +
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

  var progressLogUrl = progressLogUrlSafely_();
  var progressLogLine = progressLogUrl
    ? '<p style="margin-top:16px;"><a href="' + progressLogUrl + '" style="color:#2f6f4f;">📓 Tonight\'s Progress Log entry →</a></p>'
    : '';

  var body = assistantBriefingHtml_() +
    '<h3>' + eveningBlockLabel + '</h3>' +
    '<p>Target: <strong>' + eveningBlockMinutes + ' minutes</strong> (' + ctx.phaseLabel + ')</p>' +
    '<h3>First Batch of Messages</h3>' +
    '<p>Today\'s message: <strong>' + ctx.set1Message + '</strong></p>' +
    '<p style="color:#666;">Logged so far today: ' + ctx.prayerLogged.total + ' / ' + t.total + ' prayer minutes.</p>' +
    progressLogLine;
  MailApp.sendEmail({
    to: recipient_(),
    subject: '🌙 6pm — ' + eveningBlockLabel + ' & First Batch',
    htmlBody: emailShell_('Evening Reminder', body, ctx)
  });
}
