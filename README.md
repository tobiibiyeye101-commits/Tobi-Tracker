# S.T.E.W.A.R.D.

A zero-cost personal spiritual-growth and schedule tracker for the Sep 3 –
Oct 31 tracking window: two message
rotations, a Bible reading plan pointer, and a five-part prayer ramp that
builds up to 2 hours/day instead of assuming it from day one. It sends
you three reminder emails a day (7am / 1pm / 6pm) and gives you a small
mobile-friendly web page to log progress against each one.

It runs entirely on **Google Apps Script + a Google Sheet** — no hosting,
no accounts, no cost. Gmail's free send quota is ~100 emails/day; this
uses 3. An optional AI assistant (see below) is the one piece that talks
to something outside Google — still free in practice, but worth knowing
about before you turn it on.

## What it tracks

| | |
|---|---|
| **Set 1** | "3 Kinds of Wisdom," a 12-part series — tracked as a single "current part" pointer, same as Set 2. It only advances when you tick "Listened to it" for the part you're on; it doesn't move on its own, and it's fine to sit on the same part across several days. |
| **Set 2** | The 23 longer messages (This Is It, Stair Summit, Coordinators Training, Money Game series, etc.), tracked as a single "current message" pointer you advance yourself as you finish each one — not date-driven. |
| **Read Rhapsody** | A daily done checkbox + notes, logged before the Bible reading plan each day. |
| **Bible reading plan** | You enter Month / Week / Day directly; everything before your current entry is implicitly done. |
| **Prayer** | 5 components — Morning (1h, 30min Fri/Sat), Evening (1h), Friday Night (fixed, 3h, already established), Saturday Night (fixed, 2h), Campus prayer/prophesying (10min, unscheduled, fills gaps). Flat targets from day one — no ramp. See `PRAYER_PHASES` in `apps-script/Config.gs` to change any of it. |
| **To-Do List** | Its own tab, fully editable both ways — add/check/edit/delete from the app, or edit rows directly in the `ToDo_List` sheet. |
| **Prayer Points** | Two things shown per day, each on its own rotation: a Title + Content topic from the `Prayer_Points` sheet, plus 3 people to pray for from the `Prayer_People` sheet — always 2 from the **Church** column, 1 from the **Outside Church** column, stepping through each list in the order it's listed (never random, never showing which column a name came from). |
| **Gym** | One row per day (like Daily_Log) — a free-text "today's set" plus a Done checkbox, since the split just varies by what you type. |
| **Calendar** | Shows what's on your default Google Calendar today, and lets you add a new event (any date, title, optional time, optional description) straight from the app. |
| **S.T.E.W.A.R.D. chamber** *(optional)* | A Gemini-powered "what actually needs attention" briefing, a real chat thread, a daily Progress Log written to a running Google Doc, and — the one proactive piece — a Daily Secretary Briefing pushed to Google Chat every morning. Opened via the star icon in the top-right corner rather than living in the tab bar. See "AI Assistant" below — nothing here works until you add a (free) API key. |

## One-time setup (~10 minutes)

1. **Create the project.** Go to [script.google.com](https://script.google.com) → New project.
2. **Copy in the files.** For each file in `apps-script/` (`Config.gs`, `SheetSetup.gs`,
   `DataService.gs`, `EmailService.gs`, `CalendarService.gs`, `AiAssistant.gs`, `ChatService.gs`,
   `WebApp.gs`, `Index.html`, `appsscript.json`):
   - In the Apps Script editor, click the **+** next to Files → **Script** (for `.gs` files)
     or **HTML** (for `Index.html`) → name it to match (drop the `.gs` extension when naming).
   - Paste the file's contents in.
   - For `appsscript.json`: click the gear icon (Project Settings) → check "Show
     `appsscript.json` manifest file in editor" → open it → paste the contents in.

   (If you use [`clasp`](https://github.com/google/clasp), you can instead run
   `clasp create --type standalone` inside `apps-script/` and `clasp push` — same result, faster.)

3. **Run setup.** In the function dropdown at the top, select `setup`, click **Run**.
   The first run will ask you to authorize the script (it needs access to Sheets, Gmail,
   Calendar, and to create files in your Drive) — click through the "Google hasn't verified
   this app" warning (Advanced → Go to [project name]) since this is your own script. Check
   the execution log for the new spreadsheet's URL — that's your data store,
   **"Tobi Spiritual Progress Tracker"**, now in your Drive.
   (If you'd already authorized this project before Calendar sync existed, Google will show
   you a fresh consent screen the first time anything touches `CalendarApp` — same click-through,
   just for the added Calendar scope.)
4. **Deploy the web app.** Deploy → New deployment → type: **Web app**.
   - Execute as: **Me**
   - Who has access: **Only myself**
   - Click Deploy, authorize again if asked, and copy the `/exec` URL it gives you.
5. **Wire the URL back in.** In the editor, select `setWebAppUrl` from the function
   dropdown — you can't pass an argument from the UI, so instead open the editor's
   built-in **Execution log / debugger**, or simpler: temporarily add
   `function _setUrl(){ setWebAppUrl('PASTE_YOUR_URL_HERE'); }`, run `_setUrl` once, then
   delete it. This makes the reminder emails link straight to your logging page.
6. **Create the triggers.** Select `createTriggers`, click **Run**. This schedules the
   7am / 1pm / 6pm emails. (Re-running it is safe — it clears and recreates them, so use
   it if you ever change the times in `EmailService.gs`.)
7. **Add the web app URL to your phone's home screen** from step 4 (Safari: Share →
   Add to Home Screen; Chrome: ⋮ → Add to Home screen) — that's your logging page all the
   way through Oct 31. It gets a custom icon (a flowing double wave in the app's gold/
   graphite palette, set via an `apple-touch-icon` tag baked right into `Index.html`)
   instead of a generic bookmark icon — nothing extra to configure. Note the icon is separate from the
   tab favicon Apps Script shows while browsing to the URL, which is fixed to Google's own
   and can't be changed — this only affects the home-screen shortcut itself.

## Calendar

`CalendarService.gs` reads and writes your **default Google Calendar** (the one tied to
whichever account runs the script) — no API key, no separate calendar to create. It's
read-mostly: the Calendar tab shows today's events, and "Add an Event" lets you create a
new all-day event (any date, title, optional description). Nothing here auto-pushes
anything onto your calendar — that's a deliberate choice, not a limitation.

**A second calendar (e.g. a school class schedule on a different Google account)** can be
read alongside your default one — set `SCHOOL_CALENDAR_ID` in `apps-script/Config.gs`.
In the school account, share that calendar with the account running this script (view
access is enough: Google Calendar → ⋮ next to the calendar → Settings and sharing →
Share with specific people), then copy its Calendar ID from the same settings page
("Integrate calendar" → Calendar ID) into `SCHOOL_CALENDAR_ID`. Once set, the Calendar tab
merges events from both and labels each with a small "You"/"School" pill. New events from
"Add an Event" still always go to your default calendar — the school one stays read-only,
matching the share.

## AI Assistant — S.T.E.W.A.R.D. (optional)

`AiAssistant.gs` hands everything else in this project already tracks — today's
status, open to-dos, the calendar, blocked study/reading time — to the **Gemini
API**. Named S.T.E.W.A.R.D. (Schedule Tracking & Event Watch for Assignments,
Reminders, and Deadlines) for the one piece of it that's actually proactive.
Four things:

- **A priority briefing / Chat with STEWARD** — what actually needs attention,
  in order, instead of just listing everything, plus a real back-and-forth
  chat thread for ad-hoc questions ("what should I prioritize this evening?",
  then "what about tomorrow?" as a natural follow-up). Both live in the
  **STEWARD chamber** — tap the star icon in the top-right corner of any tab
  to open it; a short version of the briefing is also folded into the
  top of all three daily reminder emails. The chat's history lives only in
  that browser tab for that sitting — nothing persists across a reload, and
  each call is still stateless on the server side underneath.
- **A daily Progress Log** — a running Google Doc ("Tobi Spiritual Progress
  Tracker — Daily Log", created automatically the first time it's used, same
  as the Sheet) with one short, journal-style entry per day, written from
  that day's tracked data. Runs automatically as part of the evening email
  (so it reflects whatever's logged by 6pm — anything you log later that
  night won't be in it until the next run), and there's also a "Write
  today's entry" button in the STEWARD chamber for on demand/after the fact.
  Running it more than once in a day updates that day's entry rather than
  adding a duplicate.
- **The Daily Secretary Briefing** — the one proactive piece: a single message
  pushed to **Google Chat** every morning at 7am (piggybacked on the existing
  morning email trigger, no new trigger to create), rather than waiting for
  you to open the app. Weekdays: today's calendar plus a short lookahead (so
  anything 2 days out gets flagged early), open to-dos, and any study/reading
  time blocked on the calendar. Weekends: all of that, plus a light look at
  the week ahead against your baseline goals doc (see below). If Gemini is
  unavailable or rate-limited that day, it falls back to a plain, rule-based
  version (just the calendar and to-dos, no reasoning) rather than sending
  nothing — a real deadline shouldn't go silently missing over a quota outage.
  This message is Chat-only — nothing from it is logged in the app.
- **Study/reading time awareness** — calendar events get flagged as study
  time by keyword match (`STUDY_EVENT_KEYWORDS` in `AiAssistant.gs`, default
  `['study', 'reading']`, matched case-insensitively anywhere in the title —
  e.g. "CVL 905 Study" or "ECN 503 Reading" both match). No new place to enter
  this — just title your calendar blocks so one of the keywords appears, and
  the Secretary Briefing's conflict/prep reasoning picks it up automatically.
  Add to the keyword list directly if your naming ever includes something else.

This is genuinely optional. Nothing else in the project depends on it, and
skipping this whole section leaves everything else exactly as described above.

**Why Gemini and not something else:** [Google AI Studio](https://aistudio.google.com)
gives Gemini a real free tier — no billing account needed — generous enough that
a personal project's handful of calls a day never comes close to its limits.
It's the one piece of this project that calls something outside your Google
account, so it's worth knowing that's happening even though it costs nothing
in practice. Free-tier quotas do shift over time and are project-specific —
worth a quick check of your AI Studio dashboard now and then, especially if
you add more AI-backed features later.

**Setup (2 minutes) — briefing/chat/Progress Log:**
1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in
   with your Google account, and create an API key. No billing setup needed for the
   free tier.
2. In the Apps Script editor, temporarily add:
   `function _setGeminiKey(){ setGeminiApiKey('PASTE_YOUR_KEY_HERE'); }`,
   select `_setGeminiKey` from the function dropdown, run it once, then delete the
   function. (Same pattern as `setWebAppUrl()` in step 5 above.)

That's it for the STEWARD chamber and the emails — no new trigger, no redeploy
needed just for this. Without a key set, the chamber shows a clear "no
API key" message instead of failing silently, and the emails just quietly
skip the briefing (and the Progress Log entry) and send exactly as before —
a bad key, a rate limit, or Gemini/Docs being briefly down never breaks the
reminder emails themselves, only those extra pieces.

**Setup (2 more minutes) — the Daily Secretary Briefing, additionally needs a
Google Chat webhook:**
1. In Google Chat, create a Space (any name — "STEWARD" works fine).
2. Space settings → Apps & integrations → Webhooks → add one, copy its URL.
3. In the Apps Script editor: `function _setChatWebhook(){ setGoogleChatWebhookUrl('PASTE_URL_HERE'); }`,
   run it once, then delete it. (Same pattern as step 2 above, in `ChatService.gs`.)

Without a webhook set, `sendDailySecretaryBriefing()` fails quietly (caught in
`sendMorningEmail()`) and the 7am email still sends normally — just no Chat
message that day.

The first time anything in `AiAssistant.gs` actually runs, Google will show a
fresh authorization screen for **Google Docs** access (Progress Log) — same
click-through as when Calendar access was added, just one more permission on
the same account. The weekend baseline-goals lookup is a bigger ask: it needs
**Drive search** access (`DriveApp`), broader than the Docs-only access the
Progress Log uses, since finding a doc by title means being able to see across
your Drive rather than only files this project created itself. Still the same
one Google account, still free — just worth knowing it's a wider permission
than everything else here asks for.

**What "baseline goals" needs:** a Google Doc titled starting with
`00 - BASELINE` (matches `BASELINE_DOC_TITLE_PREFIX` in `AiAssistant.gs`) —
the weekend briefing reads whichever one was modified most recently, so
recreating it with a new date in the title (rather than editing in place)
still gets picked up correctly. No such doc yet → the weekend briefing just
skips that section rather than failing. (Reading your separate Daily
Update / Weekly Review docs from an existing manual Claude practice was
considered for this same weekend slot but isn't built yet — those weren't
in a state this could safely build against yet. Baseline-only for now.)

To change the model (`GEMINI_MODEL`), the assistant/chat's calendar lookahead
(`ASSISTANT_CALENDAR_LOOKAHEAD_DAYS`, 2 days), or the Secretary Briefing's own
lookahead (`SECRETARY_CALENDAR_LOOKAHEAD_DAYS`, 3 days) — all in
`AiAssistant.gs` — edit those constants directly.

## Using it day to day

- Open the web app link (from the morning email, or your bookmark).
- Check off today's Set 1 message, log Set 2 minutes (and hit "move to next message"
  once you finish one), update your Bible reading position, and log prayer minutes
  per component.
- Hit **Save today's log**. The Daily_Log tab in the spreadsheet is the full history —
  the web app's "Last 14 Days" table is a quick view of the same data.
- Every card (in every tab) can be collapsed by tapping its header — a few start
  collapsed by default (Prayer Points, Last 14 Days, Add an Event) since they're used
  less often day to day; the rest start open. Nothing here is remembered between visits,
  so the page always opens with those same defaults.
- If you've set up the AI Assistant, tap the star icon (top-right corner) to open the
  **STEWARD chamber** and hit "Get today's briefing" — the fastest way to see what
  actually needs attention today rather than reading every card yourself. If you've
  also set up the Chat webhook, a fuller Daily Secretary Briefing lands in Google
  Chat every morning on its own — nothing to open for that one.

## Adjusting things later

Everything that might need to change lives in `apps-script/Config.gs`:
- `SET1_MESSAGES` / `SET2_MESSAGES` — the message lists.
- `PRAYER_PHASES` — the ramp: edit minutes-per-component per phase, or the day
  ranges the phases cover.
- `START_DATE_STR` / `END_DATE_STR` — the tracking window.
- `EMAIL_TO` — leave blank to send to whichever account runs the script, or set an
  explicit address.

After editing `Config.gs` in the Apps Script editor, nothing else needs to change —
`setup()` is safe to re-run (it won't wipe existing data) if you add sheets later.
