# Spiritual Progress Tracker

A zero-cost tracker for the Sep 3 – Oct 31 tracking window: two message
rotations, a Bible reading plan pointer, and a five-part prayer ramp that
builds up to 2 hours/day instead of assuming it from day one. It sends
you three reminder emails a day (7am / 1pm / 6pm) and gives you a small
mobile-friendly web page to log progress against each one.

It runs entirely on **Google Apps Script + a Google Sheet** — no hosting,
no accounts, no cost. Gmail's free send quota is ~100 emails/day; this
uses 3.

## What it tracks

| | |
|---|---|
| **Set 1** | `Every Tree A Forest → A Man Sent From God → Prevailing Prayer 2 → Soul Winners Congress 2024`, repeating every 4 days from Sep 3. Computed automatically from the date — nothing to enter. |
| **Set 2** | The 23 longer messages (This Is It, Stair Summit, Coordinators Training, Money Game series, etc.), tracked as a single "current message" pointer you advance yourself as you finish each one — not date-driven. |
| **Read Rhapsody** | A daily done checkbox + notes, logged before the Bible reading plan each day. |
| **Bible reading plan** | You enter Month / Week / Day directly; everything before your current entry is implicitly done. |
| **Prayer** | 5 components — Morning (1h), Evening (1h), Friday Night (fixed, 3h, already established), Saturday Night (fixed, 2h), Campus prayer/prophesying (10min, unscheduled, fills gaps). Flat targets from day one — no ramp. See `PRAYER_PHASES` in `apps-script/Config.gs` to change any of it. |

## One-time setup (~10 minutes)

1. **Create the project.** Go to [script.google.com](https://script.google.com) → New project.
2. **Copy in the files.** For each file in `apps-script/` (`Config.gs`, `SheetSetup.gs`,
   `DataService.gs`, `EmailService.gs`, `WebApp.gs`, `Index.html`, `appsscript.json`):
   - In the Apps Script editor, click the **+** next to Files → **Script** (for `.gs` files)
     or **HTML** (for `Index.html`) → name it to match (drop the `.gs` extension when naming).
   - Paste the file's contents in.
   - For `appsscript.json`: click the gear icon (Project Settings) → check "Show
     `appsscript.json` manifest file in editor" → open it → paste the contents in.

   (If you use [`clasp`](https://github.com/google/clasp), you can instead run
   `clasp create --type standalone` inside `apps-script/` and `clasp push` — same result, faster.)

3. **Run setup.** In the function dropdown at the top, select `setup`, click **Run**.
   The first run will ask you to authorize the script (it needs access to Sheets, Gmail,
   and to create files in your Drive) — click through the "Google hasn't verified this app"
   warning (Advanced → Go to [project name]) since this is your own script. Check the
   execution log for the new spreadsheet's URL — that's your data store,
   **"Tobi Spiritual Progress Tracker"**, now in your Drive.
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
7. **Bookmark the web app URL** from step 4 on your phone's home screen — that's your
   logging page all the way through Oct 31.

## Using it day to day

- Open the web app link (from the morning email, or your bookmark).
- Check off today's Set 1 message, log Set 2 minutes (and hit "move to next message"
  once you finish one), update your Bible reading position, and log prayer minutes
  per component.
- Hit **Save today's log**. The Daily_Log tab in the spreadsheet is the full history —
  the web app's "Last 14 Days" table is a quick view of the same data.

## Adjusting things later

Everything that might need to change lives in `apps-script/Config.gs`:
- `SET1_ROTATION` / `SET2_MESSAGES` — the message lists.
- `PRAYER_PHASES` — the ramp: edit minutes-per-component per phase, or the day
  ranges the phases cover.
- `START_DATE_STR` / `END_DATE_STR` — the tracking window.
- `EMAIL_TO` — leave blank to send to whichever account runs the script, or set an
  explicit address.

After editing `Config.gs` in the Apps Script editor, nothing else needs to change —
`setup()` is safe to re-run (it won't wipe existing data) if you add sheets later.
