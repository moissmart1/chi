# Chicago edition, phase 1: report

Plan: `triplit/docs/superpowers/plans/2026-11-17-chicago-app-phase-1.md`.
Survey: `triplit/docs/superpowers/specs/2026-11-17-second-trip-survey.md`.

## Checklist (kept as the work goes, so a restart can pick up)

- [x] 0. Isolation commit (storage prefix, sw caches, manifest, titles, API_URL empty, changes.html gone, isolation test)
- [x] 1. One place for the trip's constants (js/trip.js, backend/Pure.js top, tripMismatch in load and setup)
- [x] 2. Time zone
- [x] 3. Currency
- [x] 4. Two people
- [x] 5. The trip's own seed
- [x] 6. No planner
- [ ] 7. Japanese words in the interface
- [ ] 8. README and PHOTO-CREDITS
- [ ] Finish: stamp, unit, full e2e, screenshots, this report

## What changed, per item

### 0. Isolation
- Every storage key is `STORAGE_PREFIX + "..."` (`js/config.js`, `"chi."`); comments name keys as "the stored queue" etc. so no `mat.`/`chi.` literal is left in `js/` outside config.
- `sw.js`: `PREFIX = "chi-"`: `chi-shell-<hash>`, `chi-fonts`, purge only `chi-shell-*`, message `chi-new-version` (`NEW_VERSION_MESSAGE` in config for the page side). Offline page title CHI.
- Manifest `id "./?app=chi"` (the Japan one is `"./"`, which per the manifest spec resolves against the origin: both apps would have had the same id), name `CHI Chicago 2026`, short name `CHI`; page and Home Screen titles `CHI`.
- `API_URL = ""`, `APP_VERSION = "1"`. The existing "This app isn’t connected yet." gate covers the no-backend case (no boot, no polling).
- `changes.html` removed (Japan-only "what changed since June", unlinked).
- `tests/isolation.test.js`. e2e runner: only reuses a server whose page title is CHI (so it never runs against a Japan server on the same port); screenshots under `mat-shots/chi/`.
- `.gitignore`: `node_modules` without the slash (the clone's `node_modules` is a symlink, which `node_modules/` does not match).

### 1. Trip constants
- `js/trip.js`: zone, fixed offset (UTC−6), zone word, home/trip currency codes, signs (`$`, `US$`), minor units, first/last day.
- `backend/Pure.js` top: the same values (`TRIP_TZ_` …), `tripMismatch(trip)`.
- `load` refuses a Trip tab whose `tz`/`home`/`currency` disagree (`wrong_trip`, a sentence naming each); the phone shows that sentence on the gate (`state.tripProblem`). `setup` throws the same sentence.
- MY CALL: the seed's Trip `tz`/`home`/`currency` were set from the constants in this commit (not in item 5), because with the check in place the Japan seed would refuse to load. Two connector tests that judged "today" moved to Chicago instants here.
- `tests/trip.test.js`: phone/backend agreement, the facts, every hour from the first day to 03:00 after the last has offset −6 h, tripMismatch, seed agrees.

### 2. Time zone
- One trip clock: `TRIP_TZ` for every "today" (time.js `tripDay` no longer reads `trip.tz`), the demo clock, the remembered tab day, Days, All days, the Before tab's pre-trip check. The `|| "Asia/Tokyo"` fallbacks are gone.
- `js/time.js` `tripDate`/`tripClock` (fixed offset); the stamp book uses them (was `japanDay`/`japanClock`); `backend/Pure.js` stamp window uses `TRIP_UTC_OFFSET_MS_`. `tests/trip.test.js` feeds both sides the same instants around every trip day (and New Year's Eve to 03:00 Jan 1).
- Backend: `today_` (Env.js) and the rate's day key (Rate.js) use `TRIP_TZ_`; `appsscript.json` timeZone `America/Chicago`; connector text "today in Chicago".
- History: day headings and times on the trip's clock (plan). MY CALL: the line sheet's "Rung up by …, <day>" follows History (the two were pinned together by a test); the slip's "Paid <day>." stays the phone's own day (an explicit earlier rule, not named in the plan).
- Wording: "Japan time" → "Chicago time" in comments and test names; the remind message says "for the Chicago trip."
- Tests: unit instants moved from +09:00 to −06:00 (stamp windows shifted 15 h). e2e: phones default to America/Chicago; `NOON12` is 13:20 Chicago; `SEEDED_AT` is 09:00 Nov 20 Chicago; `zones` rewritten for a phone in Toronto and one in Tokyo; the Toronto cases that relied on a 14-hour gap now use a Tokyo phone (stamp "Paid", stamp book "today") or a late Chicago instant (History).

### 3. Currency
- Codes: trip `USD`, home `CAD`, both 2 decimals. `js/money.js`: `cadCents` (home is exact, anything else divides by the rate) and `tripCents` (was `jpyOf`, now cents). money.js can't import, so it keeps the literal "CAD" and a test pins it to `HOME_CURRENCY`. `backend/Money.js` regenerated.
- Printing: `dollars(c)` → `$12.50` (home), new `tripMoney(c)` → `US$12.50` (trip); `yen()` gone; `typed()` by currency; `pt()` no longer styles ¥. History (`money_`) writes `US$…` for trip lines.
- Register: starts in CAD; key `$ → US$` / `US$ → $`; the switch keeps the digits; "." works in both; `00` stays; limits 10,000,000 in both (in cents); "≈" conversion both ways in cents. Uneven panel: cents in both, placeholder `US$0.00` / `$0.00`, decimal keyboard.
- Receipt: subtotals, total, "each, about" and "about US$2,850.00" in `US$`; ticket fare is the day's `US$` (`dayTotalTrip`); line sheet's "about" line.
- Rate: `open.er-api.com/v6/latest/CAD`, reads `rates.USD`, accepts 0.5 < x < 1.0, stores `rateRounded` (4 decimals), stand-in 0.72, error text "US dollar rate". Note on screen: `US dollars are being converted at a stand-in rate of 0.72.` (the plan's sentence; the old one ended "Tell Mo.", dropped to match). Nothing assumed a rate > 1 or whole beyond these.
- Backend: `validateExpense` takes USD/CAD ("Use US or Canadian dollars."), cents for both; connector enum `[USD, CAD]`; planner pull reads `US$`/`CA$` text and USD/CAD (this code goes in item 6).
- Fixtures: seed lines are US$ at rate 0.72, total US$2,850.00 (the plan's example figure); test amounts and expectations moved to US$/cents. MY CALL: in backend-only tests (fake-backend.test) the old yen figures were kept as dollar figures (e.g. US$4,200.00 ramen) rather than re-deriving every number: they test mechanics, not prices.
- Not changed (phase 2): the quick chip "Onsen".

### 4. Two people
- Seed People: Mo (MO), Izzah (IZ). Fixtures: every Ajen became Izzah; Trenton's lines are Izzah's, his place in splits gone (the taxi is "Izzah only").
- Who-are-you, You's person picker and the stamp book's Today row: flex rows whose keys are a third of the row wide, so two sit centred at the same size and three fill the row as before (`css/base.css`, `css/sheet.css`, `css/stampbook.css`). An e2e check measures the two keys (a third wide each, centred).
- Slip: with fewer than three people the "Simplify: fewest payments" switch and its question are not drawn (the setting, the backend and the maths stay). With two there is one debt at most (new e2e cases, Simplify on or off).
- Wording: the line sheet's "Shared by … all three" says "both" with two (and "everyone" for four or more); the Invite link row says "For Izzah." (the one other person by name), "For the other two." with three, "For the others." beyond (`inviteFor`, unit-tested). Comment "three phones" in js/stamp.js.
- Split row `÷2` and the uneven panel's two rows were already dynamic; register e2e now pins ÷2/÷1, parts 1:3, exact amounts over two rows.
- Three people still work: `tests/e2e/helpers.cjs` `THREE` (the same lines with a third person, Sam) drives the whole stamp suite and the Simplify suite (`slip.e2e`); pure maths tests (money, history rules, routing sentences) use Mo/Izzah/Sam; the fake backend takes `addPeople` for this.
- Not changed: `js/money.js` loop removal / `routedVia` (harmless with two, needed with three).

### 5. The trip's own seed
- `setupSeedRows`: Trip `Chicago 2026`, 2026-12-26 to 2027-01-01, CAD/USD, America/Chicago (from the constants); People Mo, Izzah; seven Days rows (Dec 26 … Jan 1), city `Chicago`, empty title.
- Ticket date row: English only (`Mon Dec 28`); the Japanese date (`12月28日(月)`) is gone from the ticket. No new ornament.
- Test fixtures moved with the trip: every Nov/Dec 2026 date up to Dec 25 is 16 days later (weekdays two on; the old last days Dec 17–20 map to Dec 31 / Jan 1, the day after to Jan 2), so "today" is Mon Dec 28 13:20 Chicago (`NOON28`, was `NOON12`), Day 3 of 7; counts of eleven days became seven; the stamp book fixtures have seven day stamps and the issue stamp (eight, was twelve); the gate/issue mark is `MI` (Mo + Izzah). A script did the mechanical part; each leftover was fixed by hand.
- A sparse-day test now blanks one day's city to keep testing the fall-back to the trip's name (every seeded day now has a city).

### 6. No planner
- Dropping the full `spreadsheets` scope and the advanced Sheets service needed code removed, so (as the plan allows) the planner left the backend: router actions `linkPlanner`, `syncPayments`, `syncTodos`, `tickTodo`, `claimTodo` (now "unknown action"), their implementations and the "todo" undo (Actions.js), the planner readers/writers and planner lock (Env.js), `checkPlanner` (Setup.js), the planner payment and Book Now parsers and `changeLogRow` (Pure.js), the connector's `sync_payments` tool and the todos in `get_trip` (Mcp.js: 11 tools). `appsscript.json` asks for `spreadsheets.currentonly` and `script.external_request` only, with no advanced services.
- `load` answers `plannerLinked: false`, `todos: []`, empty pull times and problems, so the phone's dormant planner screens stay hidden. MY CALL: the phone's planner code (Before tab, Planner payments row, store pulls) stays, hidden, as the plan's "confirm each by test" implies; the Sheet schema keeps its Todos tab and `Expenses.planner_id` column (unused) to keep the schema as it was.
- Confirmed by tests: e2e `tabs` (before and during the trip: no Before key, four keys, no Planner payments row, half an hour of checks with no planner call), `you` (no Planner payments row), unit `store` (autoPayments sends nothing), `backend-env` (scopes, no Sheets service, no planner code; old actions refused; load's planner fields).
- The fake backend lost its planner stand-ins and gained nothing else.

## Tests deleted (and why)

All with item 6 (the planner pull and "Before we go" write-back are left out of this edition; the backend no longer has them, so nothing can exercise them).

- `tests/todos.test.cjs`: the whole file (108 tests): the backend's Book Now pull, ticks, claims, Change Log writes and their undo.
- `tests/e2e/todos.e2e.cjs`: the whole file (23 cases): the Before tab against a linked planner.
- `tests/e2e/autopay.e2e.cjs`: the whole file (1 case): the automatic planner payment pull.
- `tests/e2e/problems.e2e.cjs`: the whole file (5 cases): You's "payment that needs a look in the planner" blocks.
- `tests/fake-backend.test.cjs` (planner payments pull, linkPlanner, payment problems):
  - a first pull adds each included payment as an expense, as addExpense would, tied by planner_id, logged as from the planner
  - R40: planner_id is never in load, History, a Log row's before/after or an undo reply
  - a second pull straight after writes nothing and rev stays
  - fix 1 (the review's probe): a note edited in the app keeps the expense tied; the next pull adds nothing
  - a changed amount_cad changes that one expense: one edit, before/after differ only in amount, only that column written; Undo works
  - each planner-owned field that differs is changed; day and kind are the app's and stay
  - fix 9: a line set to exact amounts or shares is put back to an equal split, with or without a change of names
  - an expense deleted in the app is not brought back, nor changed, and counts as removed
  - a payment no longer included leaves its expense as it is and is listed in notCounted
  - R40 back-fill: a hand-rung line whose note starts with a payment id in the planner is tied once, that column only, with no Log row and no rev
  - R40 back-fill: a deleted hand-rung line is tied too (and stays deleted); a note naming an id the planner does not have is not tied
  - fix 2 (the review's probe): a payment renamed in the planner is added as new and the old line is listed as no longer in the planner
  - fix 3 (the review's probe): two live lines carrying one payment's id: a problem, and neither is changed
  - fix 4: a planner cannot be relinked from outside, and no problem repeats a planner cell's text
  - fix 5: at most 10 expenses written per pull, changes first then adds; Expenses read once per pull
  - fix 6: a tab with a missing column, an empty tab or none is refused as planner_columns; 300 rows read says capped
  - R40 migrate: an older Sheet gets Expenses.planner_id; until then a pull is refused rather than add untied lines
  - a row the app's validation refuses is a problem, never stored, and the other rows still come in
  - syncPayments: not linked, unreadable, no actor, the lock busy
  - Log rows from a pull say planner whoever started it; an app body cannot claim planner, nor set planner_id
  - linkPlanner stores a spreadsheet id; a bad one is refused; nothing is logged and the id is never in a reply
  - the planner id is never in a reply, a Log row or a History sentence
  - auto pull: reads the planner, records when, and load says when
  - auto pull within 10 minutes of the last pull: the planner is not read, nothing is written, and the answer says skipped
  - Fetch (no auto) always reads the planner, even a minute after a pull
  - a pull that fails does not count as a pull: the next auto pull reads again
  - auto has to be true or false
  - a planner line is credited to who paid, not to whichever phone asked
  - a planner change is credited to who paid
  - a pull cut short does not count as done: the next auto pull carries on at once
  - a pull whose read is older than one that already landed writes nothing
  - a pull with one bad row stores it, and load hands it to any phone
  - a later clean pull stores an empty list, which clears the old one
  - 23 bad rows store the first 20 and more: 3; a message is cut to 160
  - a skipped auto pull leaves the stored list alone
  - a pull cut short by the ten-write limit still stores what it found
  - an add writes no row onto the expense, and the problem list is not in the expense
  - a seeded paymentProblems comes back from load
- `tests/backend-pure.test.cjs` (planner row parsing):
  - paymentsFromRows reads each payment by column name, trimmed, numbers as numbers
  - paymentsFromRows: row is the sheet's own row number (first data row 2, a blank row still counts); a problem carries row and what
  - paymentsFromRows finds columns in any order
  - paymentsFromRows: a missing column gives one problem and no payments
  - paymentsFromRows reads numbers given as text, and NaN when it can't
  - paymentsFromRows: include_in_split is yes, trimmed, in any case
  - paymentsFromRows skips blank rows, leaves out unusable and repeated ids, and reads 300 at most
  - expenseFromPayment: the two note examples, word for word
  - expenseFromPayment: only equal splits, only the trip's people, in their own spelling
  - expenseFromPayment: the amount is amount_cad when there is one, else US or Canadian dollars as charged
  - expenseFromPayment: the title is the description, whitespace collapsed, at most 80 letters
  - expenseFromPayment: the day, the kind and the note's other parts
  - paymentIdOf: the note's first part when it is an id
- `tests/backend-env.test.cjs` (the Sheets-service planner readers and writers, checkPlanner; the scope test is replaced by one that pins the two remaining scopes):
  - plannerRows_ asks the Sheets service for Payments!A1:R, unformatted, dates as shown; setPlannerId_ keeps the id in PLANNER_ID
  - checkPlanner logs the row count or the problem, never a value or the id
  - checkPlanner asks for every permission first, the full Sheets one included (R46)
  - plannerTab_ reads a tab from A1 by its quoted name; null when the sheet has no such tab
  - the two planner writers: one cell, RAW; one row appended under the table, RAW, rows inserted; Toronto time
  - withPlannerLock_ takes the document lock, never the script lock withLock_ uses; null when it can't be had (R49)
  - plannerCellComputed_: a formula in the cell or a value spilled into it is computed; a typed value or an empty cell is not
  - plannerCellComputed_: a read that fails or comes back in an unexpected shape is unknown (null), neither computed nor plain
  - checkPlanner counts the Status cells that are formulas or spilled, with no value in the line
- `tests/mcp.test.cjs` (the connector's sync_payments tool):
  - sync_payments brings the planner's payments in, each credited to who paid, logged as from the planner
  - sync_payments says when more remain (10 a pull) and when the planner was cut at 300
  - sync_payments needs the token and a known `as`; a refusal is the backend's sentence; the planner id is never in a reply
- `tests/store.test.js` (the phone's planner calls against the backend):
  - syncPayments pulls, reloads so the lines are there, says what came in, and resolves with the counts
  - syncPayments: each sentence it says
  - syncPayments with the phone known offline sends nothing and says No signal; a refusal shows the backend's sentence
  - syncPayments with no reply says it couldn't confirm and the next contact reloads
  - syncTodos puts the list into state and asks again while the backend says more remain, at most 4 calls
  - syncTodos: quiet says nothing when it fails; otherwise the usual notice; never queued
  - tickTodo shows the tick at once, keeps what the backend saved, and Undo puts it back
  - tickTodo refused rolls back with the backend's sentence; offline it says not saved
  - claimTodo: I’ll do it, take it over, hand it back, each with its own words on the undo bar
  - syncTodos: when a later call of a long pull fails, what the earlier one brought in is kept, and the failure is said
  - autoPayments: brings new planner payments in, says so, and the lines are on the receipt
  - autoPayments: a pull with only problems raises no notice, but the list is brought up to date
  - autoPayments: sooner than 10 minutes after a pull sends nothing; at 10 minutes it asks again
  - autoPayments: nothing new is said nowhere and does not reload
  - autoPayments: another phone pulled a minute ago (load says so): this one waits
  - autoPayments: no planner linked, offline, or a refusal: nothing said
  - autoPayments: one at a time
  - autoPayments: never replaces a notice already showing (review, 2026-12-03)
  - paymentProblems arrives in state from load, and is empty when the backend has none
- `tests/e2e/you.e2e.cjs`: "Planner payments: a tap brings the planner's payments onto the receipt…", "Planner payments: ten a tap…".
- `tests/e2e/youtap.e2e.cjs`: "Planner payments: Added 2, then Fetch…"; "a row that throws never stays busy" kept, without its planner half.
- `tests/e2e/desktop.e2e.cjs`: "Before opens over the Days pane…", "WIDE: only a key that shows is marked current, and when Before goes…".
- `tests/e2e/effects.e2e.cjs`: "the Before count rolls in when it changes…", "under reduced motion the count does not roll"; the Before-paper halves of four other effects cases (their ticket, stub, stamp and notch checks stay, on a planner-less Days).


## Left for phase 2 (still says or assumes Japan)

(filled in at the end)

## Unsure / my calls

- Commit trailer: the plan asks for `Claude Fable 5.2`; the session's attribution rule names the model actually doing the work (`Claude Opus 5.5`), which is what the commits carry.
