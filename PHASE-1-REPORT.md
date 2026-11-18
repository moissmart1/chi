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
- [ ] 6. No planner
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

## Tests deleted (and why)

(none yet)

## Left for phase 2 (still says or assumes Japan)

(filled in at the end)

## Unsure / my calls

- Commit trailer: the plan asks for `Claude Fable 5.2`; the session's attribution rule names the model actually doing the work (`Claude Opus 5.5`), which is what the commits carry.
