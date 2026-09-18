/**
 * AiAssistant.gs
 * --------------
 * The "Jarvis" layer, now S.T.E.W.A.R.D. (Schedule Tracking & Event Watch
 * for Assignments, Reminders, and Deadlines) — hands everything else in
 * this project already tracks to the Gemini API. Four things:
 *   1. A priority briefing / chat (generateSmartBriefing/askAssistant) —
 *      pull-based: what actually needs attention, in order, or a specific
 *      question, only when the Assistant tab is opened.
 *   2. A running daily Progress Log, written as an actual Google Doc
 *      (writeTodaysProgressLog) — one short journal-style entry per day.
 *   3. The Daily Secretary Briefing (generateDailySecretaryBriefing/
 *      sendDailySecretaryBriefing) — push-based: one proactive message a
 *      day via Google Chat (ChatService.gs), piggybacked on the 7am
 *      trigger, richer on weekends (baseline goals + light week-ahead
 *      look) than weekdays. This is the one piece of STEWARD that reaches
 *      you without you opening anything.
 *   4. Study/reading time awareness (summarizeStudyBlocks_) — calendar
 *      events matched by keyword, folded into the secretary briefing's
 *      context so conflict/prep reasoning accounts for blocked study time.
 *
 * Uses Gemini specifically because it has a genuinely free tier (Google AI
 * Studio, no billing account needed) generous enough that a personal
 * project's handful of calls a day never gets close to its limits — the one
 * place in this project where an LLM is doing real reasoning rather than
 * everything else here just reading/writing a Sheet.
 *
 * Needs a Gemini API key, which nothing here can generate for you:
 *   1. https://aistudio.google.com/apikey — sign in with your Google
 *      account, create a key. No billing setup for the free tier.
 *   2. In the Apps Script editor, temporarily add:
 *      function _setGeminiKey(){ setGeminiApiKey('PASTE_YOUR_KEY_HERE'); }
 *      run _setGeminiKey once, then delete it. (Same pattern as
 *      setWebAppUrl() in SheetSetup.gs — see README.)
 * Until that's done, every function below fails with a clear "no API key"
 * error rather than a cryptic one — and nothing else in this project
 * depends on this file, so skipping it entirely is completely fine too.
 */

var GEMINI_API_KEY_PROPERTY = 'GEMINI_API_KEY';
// gemini-2.0-flash was retired; Google's own API error named this as the
// direct replacement. The generateContent endpoint below (as opposed to
// the newer Interactions API) remains fully supported, just no longer the
// recommended default for new work — no other code changes needed to move
// to a newer model here, only this string, as long as it's a model that
// still serves generateContent.
var GEMINI_MODEL = 'gemini-3.6-flash';
var ASSISTANT_CALENDAR_LOOKAHEAD_DAYS = 2; // today + tomorrow

function setGeminiApiKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty(GEMINI_API_KEY_PROPERTY, apiKey);
}

function getGeminiApiKey_() {
  return PropertiesService.getScriptProperties().getProperty(GEMINI_API_KEY_PROPERTY);
}

/**
 * Everything the assistant should know about "right now", as plain text —
 * built from the exact same getTodayContext() the app and emails already
 * use, plus a wider calendar lookahead (getTodayContext() only ever looks
 * at today). Kept as one function so the emails, the web app's briefing,
 * and its "Ask" box all reason over identical, consistent state.
 */
function buildAssistantContext_() {
  var ctx = getTodayContext();
  var lookahead = getUpcomingCalendarEvents_(ASSISTANT_CALENDAR_LOOKAHEAD_DAYS);

  var lines = [];
  lines.push('Today is ' + ctx.dayName + '.');
  lines.push('');
  lines.push('DAILY TRACKING:');
  lines.push('- First Batch (3 Kinds of Wisdom): part ' + ctx.set1Index + ' of ' + ctx.set1Total +
    ', "' + ctx.set1Message + '" — ' + (ctx.set1Done ? 'done today' : 'not done yet today'));
  lines.push('- Second Batch: "' + ctx.set2Message + '", ' + (ctx.set2MinutesLogged || 0) + ' minutes logged today');
  lines.push('- Read Rhapsody: ' + (ctx.rhapsodyDone ? 'done' : 'not done yet'));
  lines.push('- Bible reading: Month ' + ctx.bibleMonth + ' Week ' + ctx.bibleWeek + ' Day ' + ctx.bibleDay +
    ' — ' + (ctx.bibleDone ? 'done today' : 'not done yet'));
  lines.push('- Prayer (' + ctx.phaseLabel + '): ' + ctx.prayerLogged.total + ' of ' + ctx.prayerTargets.total + ' minutes logged today');
  lines.push('- Gym (' + ctx.gymDay + '): ' + (ctx.gymWorkout || 'nothing logged') + ' — ' + (ctx.gymDone ? 'done' : 'not done'));

  var openTodos = ctx.todos.filter(function (t) { return !t.done; });
  lines.push('');
  lines.push('OPEN TO-DOS (' + openTodos.length + '):');
  if (!openTodos.length) {
    lines.push('- Nothing outstanding.');
  } else {
    openTodos.forEach(function (t) { lines.push('- ' + t.task); });
  }

  lines.push('');
  lines.push('UPCOMING CALENDAR (next ' + ASSISTANT_CALENDAR_LOOKAHEAD_DAYS + ' days):');
  if (!lookahead.events.length) {
    lines.push('- Nothing on the calendar.');
  } else {
    lookahead.events.forEach(function (e) {
      lines.push('- ' + e.dateLabel + ', ' + e.start + ': ' + e.title + (e.source === 'School' ? ' (school)' : ''));
    });
  }
  if (lookahead.schoolError) lines.push('(Note: ' + lookahead.schoolError + ')');

  return lines.join('\n');
}

var ASSISTANT_SYSTEM_PROMPT =
  'You are a calm, concise personal assistant for a spiritual-growth and ' +
  'schedule tracker — think a low-key, non-corny version of Jarvis, not a ' +
  'chatbot persona, and not preachy about the spiritual content itself. ' +
  'You are given the user\'s current tracking state and upcoming calendar. ' +
  'Point out what actually needs attention, in priority order, and suggest ' +
  'realistic timing where the calendar makes that obvious (e.g. a free gap ' +
  'before a class). Do not restate everything that is already done — only ' +
  'flag what is genuinely undone, upcoming soon, or in conflict. Plain ' +
  'text, no markdown, no greeting, no sign-off.';

/**
 * Calls the Gemini API with the given user-turn text under the given
 * system prompt (defaults to the briefing/Ask persona above — the
 * progress log below passes its own). Throws with a clear message on any
 * failure (missing key, bad key, rate limit, empty response) rather than
 * failing silently — callers that shouldn't ever break because of this
 * (the reminder emails) catch it themselves.
 */
function callGemini_(userPrompt, systemPrompt) {
  var apiKey = getGeminiApiKey_();
  if (!apiKey) throw new Error('No Gemini API key set — see AiAssistant.gs / README for the one-time setup step.');

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + apiKey;
  var payload = {
    systemInstruction: { parts: [{ text: systemPrompt || ASSISTANT_SYSTEM_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
  };
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText());
  if (code !== 200) {
    var apiMsg = (body.error && body.error.message) || ('Gemini API returned HTTP ' + code);
    throw new Error(apiMsg);
  }
  var candidate = body.candidates && body.candidates[0];
  var text = candidate && candidate.content && candidate.content.parts && candidate.content.parts[0] && candidate.content.parts[0].text;
  if (!text) throw new Error('Gemini API returned an empty response (possibly blocked — check candidate.finishReason).');
  return text.trim();
}

/** The auto-generated priority briefing — used by the reminder emails and the web app's Assistant tab. */
function generateSmartBriefing() {
  return callGemini_(buildAssistantContext_());
}

/**
 * An ad-hoc question from the web app's Chat with STEWARD thread — same
 * live context every time (so it never reasons from stale state), plus
 * recent turns from this sitting folded in as plain transcript text so
 * "what about tomorrow?" reads as a follow-up. `history` is an array of
 * {question, answer} pairs the client already caps to the last few turns —
 * nothing is persisted server-side, each call is still stateless underneath.
 */
function askAssistant(question, history) {
  question = String(question || '').trim();
  if (!question) return '';

  var transcript = '';
  if (history && history.length) {
    transcript = '\n\nRecent conversation this session:\n' + history.map(function (turn) {
      return 'User: ' + turn.question + '\nSTEWARD: ' + turn.answer;
    }).join('\n') + '\n';
  }

  return callGemini_(buildAssistantContext_() + transcript + '\n\nThe user is now asking: ' + question);
}

// ---- Progress Log: a running Google Doc, one dated entry per day --------
// Same idea as getOrCreateSpreadsheet_() in SheetSetup.gs — the doc's ID is
// stored once in Script Properties and reused, created only the first time
// this is ever called.

var PROGRESS_LOG_DOC_ID_PROPERTY = 'PROGRESS_LOG_DOC_ID';

var PROGRESS_LOG_SYSTEM_PROMPT =
  'You write a single day\'s entry in a personal progress log for a ' +
  'spiritual-growth and schedule tracker, based on the day\'s tracked data ' +
  'given to you. Write 2-4 short paragraphs of plain prose, second person ' +
  '("you..."), like a thoughtful daily journal summary — not a checklist, ' +
  'no markdown, no headers, no greeting or sign-off. Note what was engaged ' +
  'with today, what fell short of target or was skipped, and one honest, ' +
  'grounded observation — not generically encouraging, not preachy. Only ' +
  'use what is actually in the data given to you; never invent detail.';

function getOrCreateProgressLogDoc_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROGRESS_LOG_DOC_ID_PROPERTY);
  if (id) {
    try {
      return DocumentApp.openById(id);
    } catch (e) {
      // stored id no longer resolves (doc deleted) — fall through and recreate
    }
  }
  var doc = DocumentApp.create('Tobi Spiritual Progress Tracker — Daily Log');
  props.setProperty(PROGRESS_LOG_DOC_ID_PROPERTY, doc.getId());
  return doc;
}

/**
 * Writes (or, if today's section already exists, updates in place) today's
 * progress log entry — same "one entry per day" upsert principle as
 * Daily_Log/Gym_Log elsewhere in this project, just against a Doc instead
 * of a Sheet, since running this twice in a day (the automatic evening
 * call, then someone also pressing the button) should never leave two
 * entries for the same day.
 */
function writeTodaysProgressLog() {
  var ctx = getTodayContext();
  var entryText = callGemini_(buildAssistantContext_(), PROGRESS_LOG_SYSTEM_PROMPT);

  var doc = getOrCreateProgressLogDoc_();
  var body = doc.getBody();

  var existingHeading = null;
  for (var i = 0; i < body.getNumChildren(); i++) {
    var el = body.getChild(i);
    if (el.getType() === DocumentApp.ElementType.PARAGRAPH &&
        el.asParagraph().getHeading() === DocumentApp.ParagraphType.HEADING2 &&
        el.asParagraph().getText() === ctx.dayName) {
      existingHeading = el.asParagraph();
      break;
    }
  }

  if (existingHeading) {
    var idx = body.getChildIndex(existingHeading);
    var next = idx + 1 < body.getNumChildren() ? body.getChild(idx + 1) : null;
    if (next && next.getType() === DocumentApp.ElementType.PARAGRAPH) {
      next.asParagraph().setText(entryText);
    } else {
      body.insertParagraph(idx + 1, entryText);
    }
  } else {
    if (body.getText().trim() !== '') body.appendHorizontalRule();
    body.appendParagraph(ctx.dayName).setHeading(DocumentApp.ParagraphType.HEADING2);
    body.appendParagraph(entryText);
  }

  doc.saveAndClose();
  return { url: doc.getUrl(), dayName: ctx.dayName };
}

// ---- Daily Secretary Briefing: one proactive push a day, via Chat -------

var SECRETARY_CALENDAR_LOOKAHEAD_DAYS = 3; // today + the next 2 days
// Matched case-insensitively anywhere in an event's title (e.g. "CVL 905
// Study", "ECN 503 Reading") — the lowest-friction identification
// available, since Calendar events have no separate "type" field. Add to
// this list here if your naming ever includes something else.
var STUDY_EVENT_KEYWORDS = ['study', 'reading'];
// Title prefix used to find "the latest" baseline goals doc in Drive —
// see getLatestBaselineDocText_().
var BASELINE_DOC_TITLE_PREFIX = '00 - BASELINE';

var SECRETARY_SYSTEM_PROMPT =
  'You are STEWARD, a calm, concise personal secretary for a spiritual-growth ' +
  'and schedule tracker. You are given the user\'s current tracking state, ' +
  'upcoming calendar (including any flagged study/reading blocks), and — on ' +
  'weekends only — their baseline goals doc. Write a short daily secretary ' +
  'brief: what needs attention today, what\'s coming up in the next couple ' +
  'of days worth knowing about now, and any real conflicts (e.g. a heavy ' +
  'study load butting up against a deadline). On weekends, also give a ' +
  'light look at the week ahead against the baseline goals — reflective, ' +
  'not a full review, that already happens elsewhere. A short greeting is ' +
  'fine, no sign-off, plain text, no markdown. Keep it proportionate — ' +
  'don\'t pad it out if there isn\'t much going on.';

function isStudyEventTitle_(title) {
  var lower = String(title || '').toLowerCase();
  return STUDY_EVENT_KEYWORDS.some(function (k) { return lower.indexOf(k) !== -1; });
}

/**
 * Total study/reading time per upcoming day, from calendar events matching
 * STUDY_EVENT_KEYWORDS. Returns display lines like "Tomorrow: 3h", not raw
 * numbers, since this only ever feeds straight into briefing text.
 */
function summarizeStudyBlocks_(events) {
  var minutesByDay = {};
  var order = [];
  events.forEach(function (e) {
    if (e.allDay || !e.durationMinutes || !isStudyEventTitle_(e.title)) return;
    if (!(e.dateLabel in minutesByDay)) order.push(e.dateLabel);
    minutesByDay[e.dateLabel] = (minutesByDay[e.dateLabel] || 0) + e.durationMinutes;
  });
  return order.map(function (day) {
    var hours = Math.round((minutesByDay[day] / 60) * 10) / 10;
    return day + ': ' + hours + 'h';
  });
}

/**
 * The latest doc whose title starts with BASELINE_DOC_TITLE_PREFIX —
 * "latest" by last-modified, since the doc gets recreated with a new date
 * suffix each time it's superseded (e.g. "00 - BASELINE - Goals and
 * Carry-Forward (Aug 25)") rather than edited in place. Needs the broader
 * Drive search scope (DriveApp), not just the narrower per-file Docs
 * access the Progress Log uses — a real step up in permissions, flagged in
 * README, since finding a doc by title inherently means being able to see
 * across Drive rather than only the files this project itself created.
 * Returns null (not a thrown error) when nothing matches, so a weekend
 * briefing still goes out without this section rather than failing
 * outright over a doc that hasn't been created yet.
 */
function getLatestBaselineDocText_() {
  var files = DriveApp.searchFiles(
    "title contains '" + BASELINE_DOC_TITLE_PREFIX.replace(/'/g, "\\'") + "' and mimeType = '" +
    MimeType.GOOGLE_DOCS + "' and trashed = false"
  );
  var latest = null;
  while (files.hasNext()) {
    var f = files.next();
    if (!latest || f.getLastUpdated() > latest.getLastUpdated()) latest = f;
  }
  return latest ? DocumentApp.openById(latest.getId()).getBody().getText().trim() : null;
}

/**
 * Everything the Daily Secretary Briefing reasons over — its own context
 * builder, not buildAssistantContext_(), since this pulls a longer
 * calendar lookahead, study-time totals, and (weekends only) the baseline
 * goals doc that the shorter pull-based briefing/chat never need.
 */
function buildSecretaryBriefingContext_() {
  var ctx = getTodayContext();
  var dow = new Date().getDay(); // 0 = Sun, 6 = Sat
  var isWeekend = dow === 0 || dow === 6;
  var lookahead = getUpcomingCalendarEvents_(SECRETARY_CALENDAR_LOOKAHEAD_DAYS);
  var studyLines = summarizeStudyBlocks_(lookahead.events);

  var lines = [];
  lines.push('Today is ' + ctx.dayName + (isWeekend ? ' (weekend)' : ' (weekday)') + '.');
  lines.push('');
  lines.push('DAILY TRACKING:');
  lines.push('- First Batch: part ' + ctx.set1Index + ' of ' + ctx.set1Total + ' — ' + (ctx.set1Done ? 'done today' : 'not done yet today'));
  lines.push('- Second Batch: "' + ctx.set2Message + '", ' + (ctx.set2MinutesLogged || 0) + ' minutes logged today');
  lines.push('- Read Rhapsody: ' + (ctx.rhapsodyDone ? 'done' : 'not done yet'));
  lines.push('- Bible reading: ' + (ctx.bibleDone ? 'done today' : 'not done yet'));
  lines.push('- Prayer (' + ctx.phaseLabel + '): ' + ctx.prayerLogged.total + ' of ' + ctx.prayerTargets.total + ' minutes logged today');
  lines.push('- Gym (' + ctx.gymDay + '): ' + (ctx.gymDone ? 'done' : 'not done'));

  var openTodos = ctx.todos.filter(function (t) { return !t.done; });
  lines.push('');
  lines.push('OPEN TO-DOS (' + openTodos.length + '):');
  if (!openTodos.length) {
    lines.push('- Nothing outstanding.');
  } else {
    openTodos.forEach(function (t) { lines.push('- ' + t.task); });
  }

  lines.push('');
  lines.push('UPCOMING CALENDAR (next ' + SECRETARY_CALENDAR_LOOKAHEAD_DAYS + ' days):');
  if (!lookahead.events.length) {
    lines.push('- Nothing on the calendar.');
  } else {
    lookahead.events.forEach(function (e) {
      lines.push('- ' + e.dateLabel + ', ' + e.start + ': ' + e.title + (e.source === 'School' ? ' (school)' : ''));
    });
  }
  if (lookahead.schoolError) lines.push('(Note: ' + lookahead.schoolError + ')');

  lines.push('');
  lines.push('STUDY/READING TIME BLOCKED (next ' + SECRETARY_CALENDAR_LOOKAHEAD_DAYS + ' days):');
  lines.push(studyLines.length ? studyLines.map(function (l) { return '- ' + l; }).join('\n') : '- None blocked.');

  if (isWeekend) {
    lines.push('');
    var baseline = getLatestBaselineDocText_();
    if (baseline) {
      lines.push('BASELINE GOALS (weekly planning doc):');
      lines.push(baseline);
    } else {
      lines.push('(No baseline goals doc found — skip the week-ahead section.)');
    }
  }

  return lines.join('\n');
}

/**
 * The rule-based fallback used when Gemini is unavailable — just the raw
 * facts, no reasoning, so a real deadline is never silently missed just
 * because the day's free-tier quota is gone. Deliberately duplicates a
 * little logic from buildSecretaryBriefingContext_() rather than reusing
 * it directly, since that one is written as an LLM prompt (labeled
 * sections, instructions implied by structure) rather than a message a
 * person should read as-is.
 */
function generateFallbackSecretaryBriefing_() {
  var lookahead = getUpcomingCalendarEvents_(SECRETARY_CALENDAR_LOOKAHEAD_DAYS);
  var ctx = getTodayContext();
  var openTodos = ctx.todos.filter(function (t) { return !t.done; });
  var studyLines = summarizeStudyBlocks_(lookahead.events);

  var lines = ['Good morning — here\'s today\'s plain rundown (AI briefing unavailable right now):', ''];
  lines.push('Calendar (next ' + SECRETARY_CALENDAR_LOOKAHEAD_DAYS + ' days):');
  if (!lookahead.events.length) {
    lines.push('- Nothing on the calendar.');
  } else {
    lookahead.events.forEach(function (e) { lines.push('- ' + e.dateLabel + ', ' + e.start + ': ' + e.title); });
  }
  if (studyLines.length) lines.push('Study/reading blocked: ' + studyLines.join(', '));
  lines.push('');
  lines.push('Open to-dos: ' + (openTodos.length ? openTodos.map(function (t) { return t.task; }).join(', ') : 'none'));
  return lines.join('\n');
}

/** Tries Gemini first; any failure at all falls back to the plain rule-based version rather than sending nothing. */
function generateDailySecretaryBriefing() {
  try {
    if (!getGeminiApiKey_()) throw new Error('no Gemini key set');
    return callGemini_(buildSecretaryBriefingContext_(), SECRETARY_SYSTEM_PROMPT);
  } catch (e) {
    Logger.log('Secretary briefing falling back to rule-based: ' + e.message);
    return generateFallbackSecretaryBriefing_();
  }
}

/**
 * The one proactive push a day — piggybacked on the 7am trigger (see
 * sendMorningEmail() in EmailService.gs), delivered to Google Chat only
 * (not logged anywhere in-app). Wrapped so a missing/bad Chat webhook can
 * never break the 7am email that calls this.
 */
function sendDailySecretaryBriefing() {
  try {
    sendGoogleChatMessage(generateDailySecretaryBriefing());
  } catch (e) {
    Logger.log('Daily secretary briefing not sent: ' + e.message);
  }
}
