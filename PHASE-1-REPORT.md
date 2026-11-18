# Chicago edition, phase 1: report

Plan: `triplit/docs/superpowers/plans/2026-11-17-chicago-app-phase-1.md`.
Survey: `triplit/docs/superpowers/specs/2026-11-17-second-trip-survey.md`.

## Checklist (kept as the work goes, so a restart can pick up)

- [x] 0. Isolation commit (storage prefix, sw caches, manifest, titles, API_URL empty, changes.html gone, isolation test)
- [x] 1. One place for the trip's constants (js/trip.js, backend/Pure.js top, tripMismatch in load and setup)
- [x] 2. Time zone
- [ ] 3. Currency
- [ ] 4. Two people
- [ ] 5. The trip's own seed
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

## Tests deleted (and why)

(none yet)

## Left for phase 2 (still says or assumes Japan)

(filled in at the end)

## Unsure / my calls

- Commit trailer: the plan asks for `Claude Fable 5.2`; the session's attribution rule names the model actually doing the work (`Claude Opus 5.5`), which is what the commits carry.
