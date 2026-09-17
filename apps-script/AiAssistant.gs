/**
 * AiAssistant.gs
 * --------------
 * The "Jarvis" layer: hands everything else in this project already tracks
 * (today's status, open to-dos, the next couple of days on the calendar) to
 * the Gemini API. Two things:
 *   1. A priority briefing / ad-hoc Q&A (generateSmartBriefing/askAssistant)
 *      — what actually needs attention, in order, instead of a templated
 *      checklist.
 *   2. A running daily Progress Log, written as an actual Google Doc
 *      (writeTodaysProgressLog) — one short journal-style entry per day.
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
var GEMINI_MODEL = 'gemini-2.0-flash';
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

/** An ad-hoc question from the web app's Assistant tab — same context, the user's own question appended. */
function askAssistant(question) {
  question = String(question || '').trim();
  if (!question) return '';
  return callGemini_(buildAssistantContext_() + '\n\nThe user is asking you directly: ' + question);
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
