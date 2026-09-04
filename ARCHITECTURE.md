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
 ├─ Set2_Messages   — the 23-message list + status per message
 ├─ Pointers        — single row: current Set 2 index, current Bible M/W/D
 └─ Daily_Log       — one row per calendar day, 22 columns

Apps Script project (bound to that Sheet)
 ├─ Config.gs        — all constants: dates, message lists, prayer targets
 ├─ SheetSetup.gs     — creates/migrates/self-heals the three tabs above
 ├─ DataService.gs   — all reads/writes to the Sheet + the pure-logic rules
 ├─ EmailService.gs  — builds and sends the three daily reminder emails
 ├─ WebApp.gs        — doGet() entry point + the functions the page can call
 └─ Index.html       — the logging page itself (served by WebApp.gs)
```

Everything both the emails and the web page show is derived from one function,
`getTodayContext()` in `DataService.gs`. It is the single source of truth for
"what does today look like" — neither the emails nor the page compute
anything about today independently of it.

## Data model

**`Pointers`** (1 header row + 1 data row — always exactly one row):
`Set2_CurrentIndex | Bible_Month | Bible_Week | Bible_Day | Last Updated`
This is *positional* state — it doesn't say what happened on any given day, it
says where the person currently is in Set 2 and in the Bible plan, right now.

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

**Set 1 rotation** — purely a function of the date, nothing stored:
`SET1_ROTATION[daysSinceStart(date) % 4]`.

**Prayer targets** — a function of the date's phase (currently one flat phase,
see `PRAYER_PHASES` in `Config.gs`) and day-of-week: Friday and Saturday nights
replace the Evening block on their respective days rather than stacking on
top of it.

**Set 2 / Bible position** — not date-driven at all. Both live in `Pointers`
and only change when the person explicitly advances them (`advanceSet2Message()`,
`setBiblePointer()`). `Daily_Log` still records whatever the pointers said on
each day that was saved, as a historical snapshot — but the pointers
themselves are the current-state source of truth, `Daily_Log` is the journal.

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

## Everything is free

MailApp's send quota for a consumer Gmail account is roughly 100/day; this
uses 3. The Sheet, the Script, and the web app deployment all live inside the
one Google account's free tier indefinitely — there's no hosting cost, no API
key, no subscription anywhere in this system.
