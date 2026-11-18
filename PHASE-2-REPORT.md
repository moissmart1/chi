# Chicago edition, phase 2: the look and the name

Brief: `mat/.superpowers/sdd/2026-11-15-triplit-rebuild-2-day-tickets/chicago-phase-2-brief.md`.
Reference: `triplit/docs/superpowers/specs/2026-11-17-chicago-look-mockup.html`, direction C, and the three pictures `triplit/reports/mockups/chicago-C-*.jpg`.
Phase 1 ended at 16fe69c. Nothing here touches `mat`, the live Japan app, a remote or clasp.

## Pieces

| Piece | State | Commit |
|---|---|---|
| Name: Wendy’s | DONE | 6d316a8 |
| Days: a day as a guest check (with the shared tokens, fonts and the bar of keys) | DONE | 840daa7 |
| Money: the week's tab, on the spindle when paid, undo takes it off | DONE | dcb3c23 |
| Keepsake: the souvenir placemat with a stamp a day | DONE | 51194c7 |
| Every other screen in the same materials | DONE | 901d28e |
| Phase 1 list, items 1 to 18 | DONE (16 kept on purpose, below) | db301cc (and the screens above) |
| Items 19 and 20: the dormant planner pieces removed; 21 and 22 kept | DONE | a523cc7 |
| Fixes from the full run (tests that pinned the Japan look, the payer seals) and this report | DONE | 7079472 |

How the commits were made: the three screens and the other screens were built together (they share one set of tokens in `css/base.css`), then committed one piece at a time by file. So each commit is one piece, but the commits before the last were not each run green on their own; the final tree is (totals below). `css/base.css` (tokens, sheets, gates) went in with Days.

## Test totals (what I actually ran)

- `npm test`: 506 passed, 0 failed (519 at the end of phase 1; the planner tests left, new look tests came).
- Full e2e runs (`MAT_PORT=4187 node tests/e2e/run.cjs`), two in all, both logged in `/private/tmp/claude-501/mat-shots/chi2/`:
  - first (`e2e-full.log`): 383 passed, 15 failed. All 15 were tests that pinned the Japan look (grain, four-layer shadows, half-moon notches, the lit square's glow, the glass display, Zen Kaku Gothic on the tape, the vermilion and dark bar colours, the old focus-ring inks), plus the stamp-after-undo drawing (now carries its time), the stop sheet's keep-in-view case (the form is shorter; the case now uses a 390x640 phone) and the tab's payer seals (now red, as every other seal). Fixed; those files re-run: 162 passed, then `picture` 5 passed.
  - final (`e2e-full2.log`): 397 passed, 1 failed: `landscape > the stop sheet under a notch: a notice raised while it is open leaves its Done clear` timed out at 30 s under the full run's load; `landscape` re-run alone straight after: 32 passed, 0 failed.
- While working: `look days today zones stay stampbook stampwide receipt stamp slip line` (156 passed, 12 failed on the first try; all twelve fixed, see below), `youtap you` (28 passed).

New tests:
- `tests/e2e/look.e2e.cjs`: Days, Money and the placemat each at 393x852, 320x568, 844x390 and 1440x900 (materials, no sideways scroll, no cut box or figure, spots on the map and apart, today's legend line presses today's stamp), and the tab going on the spindle when the last debt is stamped and coming off with Undo.
- `tests/plan.test.js`: `checkDate`, the stub line. `tests/stamp.test.js`: the SERVED print, the PAID print (with its day and time, no 済). `tests/stampbook.test.js`: the placemat stamp, New Year's Eve burst, the crest with the app's name, the three inks, `placemat()` (known places, free spots, no overlap, 30 days). `tests/isolation.test.js`: the name everywhere a person sees it.

## Tests changed because the look or wording they pin changed

- `tests/isolation.test.js`, `tests/you.test.js`, `tests/e2e/you.e2e.cjs`, `tests/e2e/youtap.e2e.cjs`, `tests/e2e/run.cjs`: CHI and "MAT: a problem…" → Wendy’s.
- `tests/plan.test.js`: `issueLine` was `2026.12.27 MI発行 00002-01`, now `Guest receipt · 12/27`.
- `tests/stamp.test.js`: the gate stamp is the SERVED print (`SERVED`, place, date, `WENDY’S`); the paid stamp no longer holds 済.
- `tests/stampbook.test.js`: the stamp drawing tests (Japanese arc, motif library of twelve, old inks) replaced by the placemat stamp's.
- `tests/format.test.js`: `dayHead` returns `{ en, city }` (no `jp`).
- `tests/backend-pure.test.cjs`: "Keep the second name under 80 letters."
- `tests/e2e/days.e2e.cjs`: the header (`.gc-box`, `No.0003`, the route in one English line, no line colour, the stub `Thank you, call again` / `Guest receipt · 12/28`), the price column's `·` instead of the sign name, no neutral band.
- `tests/e2e/today.e2e.cjs`, `tests/e2e/zones.e2e.cjs`: the countdown is on the stub (`Valid in 25 days`), "Good for this day only" is gone, the SERVED print holds `WENDY’S`, no line colour.
- `tests/e2e/stay.e2e.cjs`: the last line before the total and stub; `No.0003` in the all-days list; the hotel card's large name is the English one.
- `tests/e2e/receipt.e2e.cjs`: `Thank you, call again.`; the summary's figures are weight 800.
- `tests/e2e/stamp.e2e.cjs`: the stamp is compared with the PAID print drawn in the page for its seed and stamped time.
- `tests/e2e/stampbook.e2e.cjs`, `tests/e2e/stampwide.e2e.cjs`: Placemat (title, pill, aria-label), the map's words, the legend, `today` / day number in a spot, Today / The placemat’s own stamp, the held-up name, spots on the map instead of a 3- or 6-column grid.
- `tests/e2e/register.e2e.cjs`: the chip Onsen → Museum.
- `tests/e2e/stopedit.e2e.cjs`: no `#stSign` (the IME and keep-in-view cases use the link field).
- `tests/e2e/tabs.e2e.cjs`, `tests/e2e/you.e2e.cjs`, `tests/e2e/effects.e2e.cjs`: no Before key, screen or Planner row at all (they were hidden, now absent).

Tests deleted with the planner (item 19): `tests/before-we-go.test.js` (whole file: js/todos.js is gone); `tests/you.test.js` "plannerWord…" and "problemHead…"; `tests/fake-backend.test.cjs` "garbage in PAYMENT_PROBLEMS loads as the empty shape…" and its unused planner fixtures; `tests/e2e/you.e2e.cjs` "Planner payments: no row while no planner sheet is linked". Rewritten: `backend-env` and `store` "no planner" tests now check the fields and functions are absent, and the Sheet has no `Todos` tab or `planner_id`.

## Screenshots

`/private/tmp/claude-501/mat-shots/chi2/` (not committed), over a made-up Chicago week (the mock-up's invented stops; nothing real): every screen at 393x852 (`who-are-you`, `how-this-works`, `days`, `days-used`, `stop-sheet`, `stay-card`, `all-days`, `money`, `money-foot`, `money-armed`, `money-spiked`, `line-sheet`, `history`, `undo-bar`, `ring-up`, `uneven`, `you`, `placemat`, `no-signal`, `no-key`, `not-connected`), and `days`, `money`, `money-spiked`, `placemat` also at 320x568, 844x390 and 1440x900 (the two-pane layout). The script that made them: `scratchpad/chi2/shots.cjs` (session scratchpad).

## Decisions the brief did not settle

Days
- A stop has no price in the data, so the check's price column holds the mock-up's `·` for every stop; the day's total ("Today, about") is what was rung up for that day (US$, with dollars under it), and is left off when nothing was. No stop gets a made-up price.
- Boxes: Date `12/28`; Table and Guests are both the number of people (as the mock-up's 2 and 2); Server is whoever is looking (Mo on Mo's phone); No. is the day number, `0003`.
- The day's line and route print in one small green line under the title (English first: `Blue Line · Clark/Lake → Jackson`), else the city, else the trip's name. No line colour anywhere (C has none). The big station names are gone.
- "Good for this day only" is gone entirely (it was doubled; C has no such line). The stub says `Thank you, call again` / `Guest receipt · 12/28`; before the trip Day 1's stub says `Valid in 25 days` instead of the thanks.
- A used day: the cashier's purple SERVED print (date, place, the app's name) on its stub, and the spindle's hole through the heading. The 7 squares that jump to a day stay, as small ruled boxes on their own line under the top line (the mock-up has none; removing them would remove the jump).
- The top line shows the day in view's date large, then `Day 3 of 7 today` (the counter keeps its button and words, so tapping either lists the days); the stamp button became the `Placemat` pill.
- The bar: the mock-up's cream keys, red lamp and red Ring up key, with its second words (Checks, The tab, Settings). With no Before key there are four keys; Ring up stays last and the row stays even (phase 1's order), rather than the mock-up's middle position, which needs five keys.
- Phone times stay `08:30` (the Sheet's own text), not the mock-up's `8:30`.

Money
- The tab is the old receipt as a guest check (Date `12/26 on`, Server `Both`, `All` with three or more, No. `TAB`), grouped by day as before, with the settling (the old slip) joined to its foot on the same paper; so the order is sentence, tab, settling (it was sentence, slip, receipt). With a long week the settling is further down; the sentence at the top still says who owes whom.
- There is no separate "Paid: put it on the spike" button: the existing two-tap stamp spot is the action (behaviour unchanged). The spot is the PAID print's ghost; the print that lands is the purple time-clock PAID with the day and time (phone's clock). The tab goes on the spindle when nothing is left to send and at least one payment is stamped; Undo (or removing a stamp) that reopens a debt takes it off. Wording kept: "Tap again to stamp.", "Stamp it the moment you send…", "Trip settlement" (now a small green label).
- The headline keeps the app's sentences ("Izzah owes you $111.83.", "You’re square.") rather than the mock-up's "You and Izzah are even".

Placemat
- The map is the mock-up's drawing. Where a spot goes is not in the data, so known Chicago places have their own spot (26 names, listed in README) and anything else takes the next free spot; the placemat's own stamp (the issue stamp) sits at the bottom near the lake, drawn as a crest with WENDY’S and the year. No hotel mark (the mock-up's "Hotel" is not tied to any data).
- A stamp is the mock-up's: double ring, `DEC 28` and the weekday, in the definition's ink (shu → the check's red, ai → blue, matsu → green); the English name goes round the top. `name_ja` and `motif` are still read but not drawn; the Japan-flavoured motif library is gone. Dec 31 is always the fireworks burst (dashed until pressed, "Fireworks" in the legend).
- The legend's lines press too (as the mock-up's). The count `3 of 8` includes the placemat's own stamp, as before. The Today row and the held-up stamp stay, on placemat paper. A spot is at least 44 px to the finger even where its ring is smaller.

Other screens and materials
- Sheets on the mint counter with the dark `Done` pill (44 px tall to the finger); paper parts (line sheet, stop sheet, hotel card, uneven panel, undo bar, gates, how-this-works) on check paper under a double green rule; red only for Ring it up, Got it, Open, Save and Retry.
- The register's amount is in VT323 (the time clock's face), the rest of the display as before.
- The status bar strip: on a Home Screen app the clock is drawn white, so the top inset is painted in the check's ink (`.phone::after`). The status-bar style stays `black-translucent` (changing it would change the layout).
- Icons: a tilted guest check with the PAID print on the mint counter, drawn by `scripts/make-icons.cjs` (CSS and the app's own PAID SVG; Zilla Slab and VT323 were reached).
- Name: manifest `Wendy’s Chicago 2026` / `Wendy’s`. `APP_NAME` in `js/config.js` is the printed mark (SERVED print, crest).
- Item 13: the chip Onsen is now Museum (same kind, activity).
- Item 14: the stop sheet no longer has "Japanese name on signs"; the `sign_jp` column stays and an edit never sends it, so a value typed in the Sheet is kept. The connector's help for `sign_jp`, `name_jp`, `address_jp`, `line_jp`, `from_jp`, `to_jp` no longer says Japanese. The hotel card prints the English name first, the other one small under it.
- Item 16, "Tell Mo" / "Ask Mo": kept; Mo runs this trip too.
- Item 19: the planner pieces also left the backend's `load` (its planner fields) and the "planner" History source; an old "planner" Log row would read as a plain change.
- Items 21, 22: fixtures keep their place names (Shibuya etc.), as ruled.

## Behaviour

Unchanged: ringing up, settling (the two-tap stamp), undo, History, sync, the updater, offline. The one structural change on Money is the order of the tab and the settling (look only). Backend files changed in wording and schema only (the planner columns); there is no deployment of this backend, so nothing to redeploy.

## Japan look still left

- `js/views/register.js:413`: a comment about confirming a Japanese input-method conversion (generic keyboard behaviour, kept).
- `backend/Pure.js:35-37` and the Sheet: column names `line_jp`, `from_jp`, `to_jp`, `sign_jp`, `name_jp`, `address_jp`, and `name_ja`/`motif` in StampDefs (schema kept, as the brief says); `js/views/ticket.js` still falls back to a `*_jp` value when the English one is empty.
- `js/format.js:62`: `issuer()` (initials) is no longer printed anywhere; kept with its test.
- `README.md:7, 58, 92`: the history of the Japan app (context, not look).
- Test fixtures (items 21, 22): Japanese place names and inputs, kept.
