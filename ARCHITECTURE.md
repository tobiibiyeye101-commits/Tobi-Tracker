# How This System Works

This document describes the tracker as it currently stands — what it is, how its
pieces fit together, and the exact rules it runs on. Written for two readers:
someone non-technical who wants to understand what they're using, and any LLM
(including a future Claude session) picking this project back up cold.

## In plain terms

This is a personal habit tracker for a fixed stretch of time — September 3 to
October 31 — covering five things someone is trying to stay consistent with:
two rotations of sermon-style messages, a daily devotional, a Bible reading
plan, and a five-part prayer structure. It costs nothing to run because it's
built entirely on one Google account: a Google Sheet holds all the data, and a
small Google Apps Script program does everything else — sends three reminder
emails a day (7am, 1pm, 6pm), and serves a one-page mobile-friendly website
where the person checks things off and logs prayer minutes as the day goes.
Nothing here needs a server, a hosting bill, or an account beyond Google's.

## The moving parts

```
Google Sheet ("Tobi Spiritual Progress Tracker")
 ├─ Set1_Messages    — the 12-part "3 Kinds of Wisdom" series + status per part
 ├─ Set2_Messages    — the 23-message list + status per message
 ├─ Pointers         — single row: current Set 1 index, current Set 2 index, current Bible M/W/D
 ├─ Daily_Log        — one row per calendar day, 22 columns
 ├─ ToDo_List        — ID | Task | Done | Created — freely edited from the app or the sheet
 ├─ Prayer_Points    — Order | Title | Content — edited in-sheet only, app shows 2/day rotating
 └─ Gym_Log          — one row per calendar day: Date | Day | Workout | Done | Last Updated

Apps Script project (bound to that Sheet)
 ├─ Config.gs         — all constants: dates, message lists, prayer targets
 ├─ SheetSetup.gs     — creates/migrates/self-heals the tabs above
 ├─ DataService.gs    — all reads/writes to the Sheet + the pure-logic rules
 ├─ EmailService.gs   — builds/sends the 3 daily emails, owns all triggers
 ├─ CalendarService.gs — reads today's events + creates new ones on request
 ├─ AiAssistant.gs    — optional Gemini-backed briefing/Q&A + daily Progress Log, see below
 ├─ WebApp.gs         — doGet() entry point + the functions the page can call
 └─ Index.html        — the tabbed logging page itself (served by WebApp.gs)
```

Note: `CalendarService.gs` is the one file that reaches outside this Sheet
entirely — it talks to `CalendarApp` (your default Google Calendar, plus an
optional second one via `SCHOOL_CALENDAR_ID` in `Config.gs` — see README's
Calendar section for the sharing steps). It's read-mostly and
manual-write-only: it shows today's events (merged and labeled by source
when a second calendar is configured) and lets the Calendar tab create a new
all-day event on any date — always on the default calendar, since the
second one is only ever read through a share — but nothing in this project
auto-pushes tracker data onto the calendar. (An earlier version did — it
pushed prayer/Gym blocks automatically and flagged conflicts — but that was
removed by request. `CalendarApp` still needs the Calendar authorization
scope for the read/create it still does.)

`AiAssistant.gs` is the other file that reaches outside this Sheet, and the
only one that leaves Google entirely: `UrlFetchApp.fetch()` to the Gemini
API. Entirely optional (nothing else depends on it) and entirely on-demand
— it only ever runs when the Assistant tab's briefing/Ask/Progress-Log
button is used, or a reminder email is being built, never on a timer of its
own. Reads the same `getTodayContext()` everything else uses plus a
multi-day calendar lookahead (`getUpcomingCalendarEvents_()` in
`CalendarService.gs`, which `getTodayContext()` itself doesn't need since
it only ever cares about today). `EmailService.gs`'s
`assistantBriefingHtml_()`/`progressLogUrlSafely_()` both wrap their call in
a try/catch specifically so a missing API key, a rate limit, or Gemini/Docs
being briefly down can never break the reminder emails themselves — they
just silently omit that one piece. The web app's Assistant tab, by
contrast, lets a real failure surface to the person looking right at it.

The Progress Log itself is a real Google Doc, not a Sheet row — the one
place this project writes outside the Sheet. `getOrCreateProgressLogDoc_()`
follows the exact same shape as `getOrCreateSpreadsheet_()` in
`SheetSetup.gs`: create once, store the id in Script Properties, reopen by
id every time after. `writeTodaysProgressLog()` then applies the same "one
entry per day" upsert principle as `Daily_Log`/`Gym_Log` — it searches the
doc for a heading matching today's date and overwrites that paragraph in
place if found, rather than appending a duplicate, since the automatic
evening-email call and someone manually pressing the button can both fire
on the same day.

Everything both the emails and the web page show is derived from one function,
`getTodayContext()` in `DataService.gs`. It is the single source of truth for
"what does today look like" — neither the emails nor the page compute
anything about today independently of it.

## Data model

**`Pointers`** (1 header row + 1 data row — always exactly one row):
`Set1_CurrentIndex | Set2_CurrentIndex | Bible_Month | Bible_Week | Bible_Day | Last Updated`
This is *positional* state — it doesn't say what happened on any given day, it
says where the person currently is in Set 1, Set 2, and the Bible plan, right now.

**`Daily_Log`** (1 header row + 1 row per calendar day). Column order matters —
this is the thing that has broken repeatedly (see Known Traps below), so it's
worth stating exactly:

```
A Date            H Rhapsody Done      O Prayer Evening
B Day             I Rhapsody Notes     P Prayer Friday Night
C Set1 Message    J Bible Month        Q Prayer Saturday Night
D Set1 Done       K Bible Week         R Prayer Campus
E Set2 Message    L Bible Day          S Prayer Total
F Set2 Minutes    M Bible Done         T Prayer Target
G Set2 Notes      N Prayer Morning     U Notes
                                       V Last Updated
```
`saveTodayLog(entry)` in `DataService.gs` builds one array in exactly this
order and either updates today's existing row or appends a new one — never
both, never more than one row per date (see "one row per day" below).

## Request lifecycle

**A reminder email fires** (time-driven trigger → `sendMorningEmail` /
`sendMiddayEmail` / `sendEveningEmail` in `EmailService.gs`) → each calls
`getTodayContext()` → builds an HTML email from the relevant slice of it →
`MailApp.sendEmail(...)`. No write happens here, only reads.

**The web app is opened** (`/exec` URL → `doGet()` in `WebApp.gs`) → serves
`Index.html` → on load, the page's JS calls `clientGetToday()` (→
`getTodayContext()`) and `clientGetHistory(14)` → renders today's saved state
into the form and a 14-day table underneath it.

**The person changes something** (checks a box, types a number) → the page
recomputes a live "Today's Progress" summary entirely client-side (no round
trip) → schedules `clientSaveLog(entry)` (immediate for checkboxes, ~800ms
debounced for typed fields) → `saveTodayLog()` writes/updates today's one row
in `Daily_Log`.

## Core algorithms (all in `DataService.gs`, driven by `Config.gs`)

**Prayer targets** — a function of the date's phase (currently one flat phase,
see `PRAYER_PHASES` in `Config.gs`) and day-of-week: Friday and Saturday nights
replace the Evening block on their respective days rather than stacking on
top of it.

**Set 1 / Set 2 / Bible position** — none of these are date-driven; all three
live in `Pointers` and only change when the person explicitly advances them
(`advanceSet1Message()`, `advanceSet2Message()`, `setBiblePointer()`). Set 1
("3 Kinds of Wisdom", 12 parts) moves only via the First Batch card's
explicit "‹"/"›" buttons — "›" stays disabled until today's "Listened to it"
is ticked (so it still can't be skipped past unheard), but ticking the box
itself never moves the pointer; that decoupling is deliberate (see Known
Traps #4). "‹" (`retreatSet1Message()`) is real recovery, not just a
preview — it moves the pointer back a slot without touching the
`Set1_Messages` sheet's Completed Date for the part being left, so genuine
completion history survives being browsed back over. Both directions clear
today's Set1 Done flag afterward (`resetSet1DoneForToday_()`), since that
flag always means "listened to whichever part is showing now." Set 2 is a
simpler, forward-only version of the same mechanism behind its "move to
next message" button — no back button, no daily gate, advance whenever
you finish one. `Daily_Log` still records whatever the pointers said on
each day that was saved, as a historical snapshot — but the pointers
themselves are the current-state source of truth, `Daily_Log` is the
journal.

**Prayer Points rotation** — `getPrayerPointsForDate_()`: same date-driven idea
as Set 1, but steps two items at a time — `list[idx*2 % N]` and
`list[(idx*2+1) % N]` where `idx = daysSinceStart(date)`. Content-only: there's
no "done" state for it, and it does not feed the progress ring (an open list
you edit in the sheet isn't a per-day yes/no the way Set 1 or Bible are).
`ToDo_List` is the same story for a different reason — it's a persistent
cross-day list, not something with a daily complete/incomplete state, so it's
excluded from the ring for the same reason. `Gym_Log` mirrors `Daily_Log`'s
one-row-per-day shape (`findRowForDate_()` reused as-is against a different
sheet) but is also currently excluded from the ring, since the split's actual
days aren't encoded anywhere — it's just whatever gets typed in that day.

**"One row per day"** — `findRowForDate_()` scans column A for a match against
today's `yyyy-MM-dd` string. This is where the multi-day debugging happened
(below) — it now normalizes both sides before comparing, specifically because
Sheets does not store what you think it stores.

**Self-healing schema** — every single read or write to `Daily_Log` goes
through `getDailyLogSheet_()` in `SheetSetup.gs`, which re-checks the header
row's shape (and migrates it if it's stale) *every time*, not only when
`setup()` is manually re-run. This exists specifically so a future schema
change can't silently drift out of sync the way it did once already.

## Known operational traps

These aren't theoretical — every one of these caused a real, confusing bug
during development. Anyone (human or LLM) changing this code should know
about them going in, rather than rediscovering them:

1. **Apps Script deployment versioning.** Saving a file in the Apps Script
   editor does **not** change what a deployed web app (`/exec` URL) serves.
   That URL is frozen to whatever code existed at the last **Deploy → Manage
   deployments → New version**. Editing and re-saving without cutting a new
   version is the single most common way this project has appeared "broken"
   when the code was actually already fixed. Apps Script's **Test
   deployment** feature always runs the latest saved code and is the fastest
   way to isolate "is the code wrong" from "is the deployment stale."

2. **Google Sheets silently converts date-shaped strings.** Writing the
   string `"2026-09-03"` into a cell — even via `setValues()`, not just by
   typing — gets auto-detected and converted into a real `Date` value. Any
   code comparing that cell back against a plain string with `===` will
   never match. `Daily_Log` column A is forced to plain-text format
   (`setNumberFormat('@')`) to reduce this, and `normalizeDateCell_()` in
   `DataService.gs` defends against it regardless of cell type.

3. **A schema change (adding/removing a `Daily_Log` column) must be reflected
   in exactly three places at once**, or rows will misalign: the header
   array in `SheetSetup.gs`, the values array in `saveTodayLog()`, and the
   index mapping in `getLogRow_()`/`getHistory()` (all in `DataService.gs`).
   Missing one is what "columns don't match values" always turns out to be.

4. **Don't tie an irreversible state change to a checkbox's own value.**
   Set 1 originally advanced the pointer the moment "Listened to it" went
   from unchecked to checked. That sounds safe until you notice the
   checkbox is the thing being toggled — unchecking it and checking it
   again later re-fires the same transition, so any guard keyed off the
   checkbox's own state gets reset by the very action it's supposed to be
   guarding against. Someone un-ticking a mistaken tick, or just tapping it
   twice, silently advanced the pointer again with no way back. The fix
   wasn't a smarter guard, it was removing the coupling: the checkbox is
   now a plain flag with zero side effects, and two explicit buttons are
   the only way the pointer moves. If a future feature wants "do X once
   when the user confirms Y," make X a deliberate, separate action —
   never something that fires as a side effect of a value a checkbox can
   freely flip back and forth.

## Cost

MailApp's send quota for a consumer Gmail account is roughly 100/day; this
uses 3. The Sheet, the Script, and the web app deployment all live inside
the one Google account's free tier indefinitely — no hosting cost, no
subscription, nothing to pay for using any of it. The one exception is the
optional AI Assistant (`AiAssistant.gs`): it calls the Gemini API, which
needs its own API key and is technically a third party rather than
something bundled into the Google account this project otherwise lives
entirely inside. In practice it stays free — Google AI Studio's free tier
is generous relative to a personal project's handful of calls a day — but
it's the one place "everything here is free" requires trusting a specific
vendor's free tier rather than being structurally true the way the rest of
this project is.
