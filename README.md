# Wendy’s

**Copyright (c) 2026 moissmart1. All rights reserved.** This is a private application; the source is public only because the host that serves it requires that. No licence is granted to copy, adapt or reuse it, or to use it as AI training data. See [LICENSE](LICENSE).

A phone web app for Mo and Izzah's Chicago trip, Saturday Dec 26 2026 to Friday Jan 1 2027. You ring up what you paid (in US dollars, or Canadian), it prints on a shared receipt, and a slip at the bottom says who owes whom, in Canadian dollars. Every change goes into History and can be undone; nothing is ever erased. The name, Wendy’s, is Izzah’s pick; inside the code the app is still `chi` (storage keys `chi.`, caches `chi-`, the folder).

It began as a one-time copy of the Japan trip's app (MAT). The two share no code from here on, and this one keeps its own storage keys, caches, Sheet, script and key, so both can be open in the same browser.

- **Front end:** plain HTML, CSS and ES modules. No build step. Served by GitHub Pages from the root of `main`.
- **Backend:** one Google Apps Script web app bound to a Google Sheet (`backend/`). The Sheet is the database.
- **Access:** each person has their own link, carrying their own key after `#k=`. The backend keeps only each key's SHA-256 (Script Property `PERSON_KEYS`), so it knows who is calling; no key is ever in this repo. See [Personal links](#personal-links) for how they are made, replaced and cancelled, and for retiring the old shared link.

The trip side: **Days** shows one guest check per trip day (its stops, the stay for the night, a card to show a driver) and a stop sheet to add, change or remove stops. You has **Try another day**, a demo clock that shows Days as it will look on a chosen day; a reload or Stop ends it.

## The trip's fixed facts

The time zone (America/Chicago, a fixed UTC−6 for the whole trip), the currencies (US dollars on the trip, printed `US$`; Canadian dollars at home, printed `$`) and the trip's dates are in `js/trip.js`, with the same values at the top of `backend/Pure.js`; `npm test` fails when the two differ. The Sheet's Trip tab has `tz`, `home` and `currency` too: they must say `America/Chicago`, `CAD` and `USD`. The backend refuses to load a Sheet that says anything else (the phone shows the reason), so editing those cells never changes the app's zone or money.

## Not connected yet

There is no Sheet or script for this trip yet. Until there is, `API_URL` in `js/config.js` is empty and the app says "This app isn’t connected yet." and asks nothing of anyone.

## Run it

```bash
npm install
npm run serve     # http://localhost:4173
npm test          # unit tests
npm run e2e       # click-through tests in a headless browser (a few minutes)
```

The click-through tests use a fake backend and never call the real one. They use port 4173; set `MAT_PORT` to use another (two checkouts testing at once need two ports): `MAT_PORT=4187 node tests/e2e/run.cjs`, or `node tests/e2e/run.cjs register` for the files whose names contain a word.

## Changing the front end

`sw.js` keeps the app's files on the phone so it opens with no signal. Its version is a hash of those files, so after changing anything under `css/`, `js/`, `index.html`, the manifest or the icons:

```bash
npm run stamp
```

`npm test` fails if you forget. Phones pick up the new version the next time the app is opened.

`backend/Money.js` is generated from `js/money.js` by the same command. Do not edit it by hand; `npm test` fails if it has drifted.

## Setting up the backend (once)

Steps marked **owner** need Mo at the keyboard, signed in to his Google account: nobody else can create the Sheet or grant the script its permissions.

1. **owner** Create a new Google Sheet for this trip. The script must be bound to it (every helper uses `getActiveSpreadsheet()`). Set the Sheet's File → Settings → Time zone to Chicago (Central), or hand-typed dates can shift a day.
2. **owner** Turn on the Apps Script API (script.google.com/home/usersettings) and sign in with `clasp login`. Create the bound script from this folder: `clasp create --type sheets --title CHI --rootDir backend` makes a new Sheet and script together, or bind one to the Sheet from step 1 (Extensions → Apps Script) and write its id into a new `.clasp.json`. Never copy a `.clasp.json` from another app: it names that app's live script.
3. Push the backend: `clasp push -f` (it sends `backend/*.js` and `backend/appsscript.json`; `appsscript.json` already says `America/Chicago`).
4. **owner** Run `setup` once from the script editor. It makes every tab, writes the trip (name Chicago 2026, Dec 26 to Jan 1, CAD and USD, America/Chicago), Mo and Izzah, and seven Days rows in Chicago with no titles; makes the old shared trip key (only on a brand-new trip) and the Claude connector's token; deletes a blank Sheet1; and fetches today's US dollar rate (it stops with a plain error if the rate site refuses Google). The first run shows Google's consent screen for the two permissions (this Sheet only; outside requests) and the "Google hasn't verified this app" warning.
5. **owner** Run `issueLinks` and copy each person's link from the Execution log (see [Personal links](#personal-links)).
6. Fill in the plan: day titles, stops and stays, through the app, Claude, or the Sheet (see "Typing into the Sheet" below). Type `StampDefs` rows if the stamp book is wanted.
7. Deploy as a web app: execute as me, access Anyone (`clasp create-deployment -d "first"` after step 4 granted the permissions; a deployment whose permissions were never granted fails for everybody). The deployment's `/exec` address is the backend's address.
8. Put that address into `API_URL` in `js/config.js`, `npm run stamp`, commit, and publish (step 9).
9. **owner** Create the GitHub repository for this app and turn on Pages from `main`. Its address must not be the Japan app's.
10. Run `migrate` once to confirm the Sheet is current (it should answer `added: []` on a fresh Sheet). `npm run ship -- --migrate` runs it with the release check's read-only key (`CHI_CHECK_KEY`). By hand, from a terminal, with a key in an environment variable (never typed into a file or a script, never in the address):

    ```bash
    read -rs CHI_CHECK_KEY && export CHI_CHECK_KEY   # paste the check key, then Enter
    curl -sL -H 'Content-Type: text/plain;charset=utf-8' \
      --data "{\"key\":\"$CHI_CHECK_KEY\",\"action\":\"migrate\"}" \
      "https://script.google.com/macros/s/<deployment id>/exec"
    unset CHI_CHECK_KEY
    ```

11. **owner** Send Izzah her own link (`<site>#k=<her key>`), privately. The Sheet itself only needs sharing if she should open it; the app does not need that.
12. Optional: the Claude connector (below).

### Changing the backend later

```bash
clasp push -f
clasp create-deployment -i <deployment id> -d "what changed"
```

Deploy to the same deployment id every time, or the address in `js/config.js` stops matching. Run `migrate` (above) after pushing code that adds a column.

## The Claude connector

The backend is also an MCP server, so someone's Claude can read the trip and make changes in it.

- **It can:** read the trip (`get_trip`, with the Before list's open items), explain who owes whom and why (`explain_debt`), add an expense, add, change or remove stops, save or remove a stay, change a day's check (`set_day`), bring in the planner's payments (`sync_payments`), and read History and undo an entry. Every change goes through the same checks as the app, is logged in History marked "(through Claude)", and can be undone.
- **It cannot:** add, read or remove ticket pictures (it sees a stop's ticket facts), stamp payments or press stamps, see or change e-Transfer addresses or emails, see or set anyone's picture, see the trip key or its own token, copy invite links, or change who is on the trip. Replies never contain the key, the token, an e-Transfer address or an email.
- **It acts as the owner.** The one token belongs to the trip's first person (the lowest `order`, Mo): every change it makes is written as him, whatever `as=` says. A name in `as=` that matches no one on the trip still blocks every write.
- **The link:** You → Claude link → Copy, shown only to the owner on his own link. The backend gives the token to no one else (not to Izzah's link, not to the old shared link). Treat it like your own link: whoever has it can change the plan and add expenses.
- **Changing the token:** in the script editor, Project Settings → Script Properties, delete `CLAUDE_TOKEN` and run `migrate` to make a new one. Every Claude link copied before stops working; the owner copies it again from You.

## The planner

The Japan app's planner link is here (the workings ported on 2026-11-20, "Link it like Japan"; the screens, look K, "the rail", picked by Mo on 2026-11-20). The backend reads Mo's own planner sheet (a separate Google Sheet): payments come into Money from its `Payments` tab, and the "Before we go" list comes from its `Book Now` tab. The only thing it ever writes there is a Before-list tick: one Status cell and one Change Log row. Until `PLANNER_ID` is set nothing of it runs and `load` says `plannerLinked: false`.

**Payments.** The `Payments` tab has its column names in row 1 (any order): `payment_id, date_paid, payer, description, category, vendor, booking_ref, amount, currency, amount_cad, cad_is_exact, split_between, split_type, status, include_in_split, source, added_by, notes`. Only rows whose `include_in_split` is `yes` come in (`status` is not read: a payment due at check-out stays out while it says `no`), and only `equal` splits between people on the trip (`payer` and `split_between` are matched to Mo and Izzah in any case). A payment becomes an expense in Canadian dollars when `amount_cad` has a number (a formula's value counts), otherwise in its own US or Canadian dollars (an amount may carry a `US$` or `CA$` sign; the currency cell may say `USD`, `US$`, `US`, `CAD`, `CA$`, `C$` or `CA`; a bare `$` is not guessed: with no `amount_cad` the payment is listed as one that needs a look); any other currency with no `amount_cad` is a problem. Its note starts with the payment's id (`P003 · vendor · US$58.00 charged`). The expense is tied to its payment by the Expenses tab's `planner_id` column, which only a pull writes and the app never shows: `load` says only whether each expense is tied, `fromPlanner: true` or `false`, never the payment's id. `fromPlanner` is read from that cell each time; it is never written to the Sheet or kept in the Log, and never taken from a phone or the connector. In Money such a line carries the sign "From the planner" and is not edited in the app: its sheet has no Edit and its note is shown but not typed into ("Change it there and it comes in here"); Delete works, and a deleted one stays out. A line rung up by hand that a pull ties by its note is locked from then on. The planner owns a payment's title, amount, currency, payer, split and note; the app owns its day and kind. An expense deleted in the app is never brought back; nothing is deleted by a pull. Each change is logged in History marked "(from the planner)", credited to who paid, and can be undone. One pull adds or changes at most 10 expenses and reads at most 300 rows. A phone that is open asks on its own at most every 10 minutes (`syncPayments { auto: true }`, also skipped when any phone pulled in the last 10 minutes: `load` says when, `paymentsPulledAt`); the connector's `sync_payments` always reads. The last pull's problems (a payment that can't be brought in, and why, with its row) are kept for `load` as `paymentProblems`.

**The Before list.** Chicago's `Book Now` tab: a title on row 1, a line of description on row 2, and the header on row 3 from column B: `#`, `Item`, `Book by`, `Days left` (a formula, never read or written), `Status`, `Notes`, `Booking link`, `PASS CHECK before buying` (not read). The header is found as the first row with `#`, `Item`, `Book by` and `Status`, wherever it is. An item is done when its Status starts with `Booked` (`To book`, `Pending` and `Decide` are open) or someone ticked it. `syncTodos` copies the list into this Sheet's `Todos` tab (at most once in 10 minutes unless forced, 15 rows a pull). `tickTodo` saves the tick here first, then writes `Booked` into that row's Status cell (column F) and appends one row to the `Change Log` (its header on row 3 from column B: `#`, `Date / time` in Toronto time, `Agent / session` "Wendy’s app (Mo)", `Tab`, `Cell(s)`, `Item`, `Old value`, `New value`, `Why` "Ticked off in the Wendy’s app", `Proof / source`, `Verified?`). It is written only to the row whose `#` and `Item` still match the tick, never over a formula (the tick then stays in the app only), and never while the app's own lock is held. An undone tick puts the old Status back while the planner still says exactly `Booked`, and logs that too. `claimTodo` says who is on an item. Nothing done through Claude writes to the planner. The rules in full are the Japan app's (its README, "Before we go"), unchanged.

**The plan.** The planner's `Plan` tab can lead the trip's stops: one row per stop. The app reads it and never writes to it. Until the Script Property `PLAN_FOLLOW` is `on` nothing of it runs: `syncPlan` answers `off` and reads nothing, `load` says `planFollow: false`, and every stop is the app's, whatever its cells say.

- **The tab.** The header is the first row with `stop_id`, `date`, `time` and `what` (any order, any case), so a title line above it is fine; `booked` and `fixed` are read when there; `notes` and any other column are never read. `stop_id` is the stop's id (8 to 40 letters, digits, `_` or `-`; never changed, never reused; a new row gets `chiplan` and the next three-digit number). `date`: `2026-12-29`, `Dec 29`, `29 Dec` or a date cell, a day of the trip. `time`: `19:00`, `7:00`, `7:00 PM` or a time cell; blank is no set time. `what`: the name, 1 to 80 letters. `booked`: `yes`, a ticked box, `y`, `x`, `✓` or text starting `Booked`. `fixed`: the same without `Booked`. A blank row is skipped and never ends the table; a row with no `stop_id` and no `date` is a heading line and is skipped; at most 200 rows are read. Deleting a row takes the stop off (a soft removal, everything on it kept); putting the row back with the same id brings it back.
- **Who owns what.** The planner owns a stop's day, time, name, booked and fixed, and whether it exists. The app owns everything else: the detail line, directions and minutes, place, map position, sign name, link, photo, note, ticket pictures, and ticket details (until the Tickets tab names the stop). While following, a phone or the connector cannot change the planner's five fields of a planner stop (`planner_led`, "Change them there and they come in here"; restating a value as it is passes), cannot remove it, and cannot put back one the planner took off. A stop added on a phone stays the app's (listed as only in the app) until a Plan row carries its id; then the planner adopts it. With `PLAN_APP_STOPS_` false in `Actions.js` no stop is added in the app at all.
- **The Stops tab** gains `planner` (`yes`: led by the planner), `tk_planner` (`yes`: ticket details led by the Tickets tab) and `moved_from` (the day a stop with directions was moved from), at the end. Only a pull writes them; `load` gives each stop `fromPlanner`, `tkFromPlanner` and `movedFrom` from them (all false and empty while not following). They are never in History.
- **A pull** (`syncPlan { auto? }`): the planner is read with no lock held, then the Stops tab is written under the app's lock, one row per stop, at most 15 rows a pull (`more: true`: the phone asks again at once). Each change is one History line in the trip's first person's name, marked "(from the planner)", that cannot be undone (an older History line on the same stop undoes only its own detail); an adoption writes no line. A stop moved to another day keeps its directions and is listed in `load`'s `planProblems` ("Moved from … in the planner. Check how to get there.") until its directions or minutes are changed or it moves back. Rows the app cannot use are listed there too, with their row number and a few words of the name; a bad row for a stop the app has leaves that stop as it was.
- **Guards.** A tab that can't be read, is missing or has no header changes nothing. A read with any row whose id could not be read (blank, unusable, twice) or cut at 200 takes nothing off. More than 8 stops, or more than half of the planner's stops, going in one read: none are taken off, and the list says so.
- **Gaps.** A phone's own ask (`auto: true`) reads the planner at most once a minute; any ask at most every 15 seconds. An auto ask over a tab unchanged since the last full pull, with no write to the app's Sheet since, takes no lock and reads no Stops. An older read that lands after a newer one is dropped. An open phone asks on its own (`store.autoPlan`) every 3 minutes, and when the app opens or comes back to the front (not twice within 30 seconds), only while `load` says `planFollow: true`; it reloads when a stop changed and says nothing. `store.syncPlan()` is Pull now's plan part (asked again while more remain, at most 4 calls); no screen calls it yet. Nothing on the screens changes in this version.
- **Tickets.** Once the planner's `Tickets` tab has a `stop_id` column (with `ticket_id` and `status`), the rows whose `status` is `active` lead the four ticket details of the stop they name: `confirmation` values joined with " / " (booking ref), `holder` joined (name on booking), `traveler` joined, `ALL` meaning everyone on the trip (people), and `seat` (one seat, or each traveller's when they differ), each cut to 60 letters; at most 300 rows are read. While a stop has such rows the app can't change those four (`planner_led`, "Change them there"); `pending` rows are ignored; when the last active row goes, the details stay and are the app's again. Ticket pictures stay the app's in every case. A Tickets tab that can't be read on a pull frees nothing: the stops still come in and the list says so. These values never reach a problems line, a History sentence, the dry run or a log.
- **The dry run** (`planDiff`, no arguments): what a pull would add, change, put back, take off and leave only in the app, and the rows it could not use, without writing anything, switch on or off. Only the check key and the trip's first person on their own link may run it. It lists day, time, name, booked and fixed, and only the names of the stops whose ticket details would change, never a ticket value.
- **Setting it up,** in this order. The release adds the three columns: `npm run ship -- --migrate` (no new permission). The switch is off: nothing changes for anyone. Then, with the owner's yes for each write to the planner: the Plan tab is made from the app's stops (columns as plain text), and `stop_id` is added to the Tickets tab. The owner runs `checkPlanner` in the script editor and reads the Plan lines. The dry run: `planDiff` with the check key from a terminal (the key from the environment, in the POST body, never printed); its lists must agree line for line with what the owner expects, or the tab is fixed and the dry run repeated. Stops to drop are removed in the app. The owner then adds the Script Property `PLAN_FOLLOW` = `on`. Proof it is live: a live `load` says `planFollow: true` and each Plan row's stop `fromPlanner: true`, `planDiff` lists nothing to do, and one harmless change shows on a phone within three minutes and in History as "(from the planner)". Then `npm run private`, so the scan knows the new stop names.
- **Turning it off:** delete `PLAN_FOLLOW`. The plan stays as it then stands, and every stop is the app's again. The three columns stay and are ignored.

**The screens.** Until `PLANNER_ID` is set none of them shows.

- **Before we go** (`js/views/before.js`, `js/views/hand.js`, `js/before.js`, `css/before.css`; its key is `#beforeBtn`). What is still to book hangs from a steel ticket rail as order slips, soonest first, two to a rail, the undated one last (yellow; pink for Decide, white for Pending; the due date goes red within 3 days and when late). What is booked is on the spike below, newest first: the newest three, and "and N more under these" for the rest. A slip is the planner's `#` and its Status word; "You’re on it" or "Izzah’s on it" when someone has claimed it. Tapping a slip takes it into your hand, a sheet with the note, a link (only a plain `https://` link becomes one), the claim key (I’ll do it, Hand it back, Take it over; no Take it over on your own link) and the counter bell. Ringing the bell is the tick: it rings at the tap (the **Stamp sound** switch in You covers it, there is no switch of its own), the slip is printed BOOKED with the day and your name, the sheet closes after about a second and a half, and the slip is on the spike. A tick is written into the planner as before (`store.tickTodo`); the screens never call the backend themselves. Any slip ticked in the app, on this visit or an earlier one, by either of you, can be taken back from the spike (Not booked after all, `store.untickTodo`: this phone's own write while it still holds it, otherwise the item's newest tick in History, undone as History undoes it, with the same refusals and the same words on the undo bar); one the planner itself says is booked says to change it there. Fetch brings the list in again; the list also fetches itself, quietly, when it is an hour old and the screen is shown. Items the last pull could not read are listed under Fetch as "Not read from the planner".
- **The key.** Second in the bar, as in the Japan app: five keys with Ring up in the middle. Before the trip: Days, Before, Ring up, Money, You (Before is there as soon as a planner list has come in, even with nothing left to book). From the trip's first day Tickets takes its place, and what is still open is reached from the Tickets tab (a slip that opens the list as a sheet with Done); the Tickets key shows from that day even with no tickets while something is still open. It is never what the app opens on and is not remembered. Its count is what is still to book.
- **The Planner row in You.** "Pull now" brings in the planner's payments and fetches the Before list with them; it says "Added 2", "Changed 1", "Nothing new", "2 need a look" or "Not pulled" for a few seconds. Under it, "Last pulled" with the day and time. Payments that could not be brought in are listed under the row ("Not brought in from the planner"), with the same count in red, and as a pill ("2 planner lines need a look") under the sentence in Money, which opens You on the row. Book Now rows that could not be read are listed on the Before screen, not here.

**What the screens read:** `store.state.todos` (each `{ id, item, bookBy, status, note, link, claimedBy, tickedBy, tickedAt, done, plannerComputes }`, plus `pending` while a tick or claim is on its way), `todosPulledAt`, `todoProblems` and `paymentProblems` (`{ at, list: [{ id, message, row, what }], more }`), `paymentsPulledAt`, `plannerLinked`; the actions `store.syncTodos({ force, quiet })`, `store.tickTodo(id)`, `store.untickTodo(id)`, `store.claimTodo(id, on)` and `store.syncPayments()`; each expense's `fromPlanner` (Money's sign, the locked line); and `js/todos.js` for the order (`openTodos`, `doneTodos`), the due line on the Toronto calendar (`dueLine`), `isStale` (an hour) and `untickOutcome`. A tick or claim made with no signal is not saved: the slip goes back on the rail and the undo bar says so (the store does not queue them).

**Setting it up,** in this order. A deployment whose version asks for a permission nobody has granted stops working for everyone (the web app runs as Mo), so `npm run ship` never puts such a version live by itself: when `backend/appsscript.json` asks for a scope or an advanced service that the last release's (origin/main) does not, it pushes to the script's head only, says what to approve, and stops with an error; the live deployment and the site are left as they were. `npm run ship -- --check` says which way it would go.

1. Merge, `npm run gate`, then `npm run ship -- --migrate`. It pushes the backend to the script's head only and stops. The live app keeps running its old version (a live `load` with the check key still answers ok).
2. **owner** In the script editor, run `checkPlanner`. Google asks for "See, edit, create and delete all your Google Sheets spreadsheets" (`https://www.googleapis.com/auth/spreadsheets`, with the Sheets service). Approve it; if that run only asked, run it again. It logs "Planner: not linked yet". That permission reaches every spreadsheet the account can open; the code writes only the two things above, to the planner only.
3. **owner** Project Settings → Script Properties → Add script property: `PLANNER_ID`, the planner's spreadsheet id (the part of its address between `/d/` and `/edit`). It is kept only there: never paste it into a chat, a commit or a log. The planner must be a Google Sheet, not an uploaded .xlsx (convert it first; "couldn't read" usually means this).
4. **owner** Run `checkPlanner` again. It logs counts and positions only, never a value. **Pre-flight, all four before going on** (anything else: stop here; the live app is still untouched):
   - "N payment rows, columns ok", N the number of filled rows in the Payments tab;
   - "Book Now: N items, columns ok", N exactly the number of items you see in the tab (a fully blank row inside the list ends it: every item below a blank spacer row is left out, so remove such rows);
   - "Book Now: 0 Status cells are formulas" (Days left is the formula column, Status must hold typed values; the app never writes over a formula, so such an item's tick stays in the app only; "couldn't check its Status cells" means every tick would stay pending);
   - "Change Log: found", and the Change Log has no blank rows inside it (the row a tick adds goes in with Sheets' own append, which never overwrites a row, but a blank row inside the log can take it).
5. `npm run ship -- --migrate --scopes-approved`: the new version goes on the same deployment, `migrate` adds `Expenses.planner_id` and the `Todos` tab (until then a pull or a tick is refused with "The trip sheet needs updating first."), the trip loads, and the front end is published. The phones then ask for payments by themselves; rows whose `include_in_split` is `no` bring nothing in.
6. **Before the first real tick** (the release of the Before-list screen, or any tick by hand), check one real write on Chicago's layout: add a test row to Book Now (`#` 99, Item "TEST delete me", Status "To book"), fetch the list, tick it in the app, then undo the tick. In the planner, that row's Status (column F) must read `Booked` after the tick and `To book` after the undo, and the Change Log must have exactly two new rows, directly under the last one and starting in column B. Then delete the test row (and those two log rows, if you like) by hand. If anything lands elsewhere, stop and say so: nobody ticks for real until it is understood.

**Changing or unlinking it.** Change or delete `PLANNER_ID` in Script Properties. Expenses already brought in stay.

## Money

Money is kept in integer cents. A line is in US dollars (the trip's currency) or Canadian dollars (home), and every line carries the day's rate (US dollars per Canadian dollar, kept to four decimals, fetched from open.er-api.com at most once a Chicago day and accepted only between 0.5 and 1.0). When no rate has ever been fetched the app uses a stand-in 0.72 and says so above the slip. Debts are always in Canadian dollars. With two people there is at most one debt; the Simplify switch shows only with three or more people.

## The look

Look C, "The guest check" (Izzah's pick, 2026-11-18): each day is a diner guest check, Money is the week's tab that goes on the spindle when it is paid, and the keepsake is a souvenir placemat with a stamp a day. The faces are Libre Franklin, Zilla Slab and VT323 from Google Fonts. The Home Screen icons are drawn by `node scripts/make-icons.cjs` (needs local Chrome); run `npm run stamp` afterwards.

## The placemat

A souvenir placemat of Chicago that each person stamps by hand: one spot per trip day, and the placemat's own stamp. It opens from the Placemat pill on the Days top line or from the line on today's check. A press is a History line ("Mo stamped Dec 28") and can be undone from History.

**The definitions are data, not code.** The `StampDefs` tab (made by `setup` or `migrate`) has one row per stamp: `id`, `date` (`YYYY-MM-DD`, or empty for the placemat's own stamp), `name_ja` (kept, not printed), `name_en` (printed round the stamp), `place` (where the spot goes on the map and its label), `motif` (kept, not drawn: the date is the picture), `ink` (`shu` red, `matsu` green or `ai` blue) and `shape` (`round` or `square`; Dec 31 is always the fireworks burst).

**Where a spot goes.** These places have their own spot on the hand-drawn map: O'Hare, Midway, Uptown, Andersonville, Wrigleyville, Lakeview, Lincoln Park, Logan Square, Wicker Park, Bucktown, The River, Gold Coast, Old Town, River North, Streeterville, Magnificent Mile, Navy Pier, West Loop, The Loop, Millennium Park, Grant Park, South Loop, Museum Campus, Chinatown, Pilsen, Hyde Park (`js/stampbook.js` `PLACES`). Any other place, or a second day in the same place, takes the next free spot.

**When a stamp is open** is decided in Chicago time (fixed UTC−6), by the backend's `stampWindow` and the app's copy of it (`js/stampbook.js`): a day stamp from 00:00 on its date until 03:00 the next day (27 hours), so the Dec 31 stamp can still be pressed until 3 a.m. on New Year's Day; the issue stamp from the start until the last day stamp closes. A press made offline counts when the phone's own time for it falls inside the window and it arrives within 48 hours.

**The `Stamps` tab** holds the presses; do not type into it.

## The ticket on a stop (no screen yet)

The workings of the Japan app's tickets (its versions 29 to 31) are here; the screens are not. A stop can carry its real ticket: pictures of the codes (a screenshot, a photo, or a PDF turned into pictures of its pages) and four facts staff ask for. Until the Chicago ticket screens are picked and built, nothing on the phone shows or adds them; the backend, the store and the phone's keep already work.

**Limits** (checked on the phone and again by the backend): JPEG or PNG, at most 1,500 px on the longer side and 450,000 base64 characters a picture; 8 pictures a stop; 120 in the trip; each fact at most 60 letters.

**The Sheet.** `Stops` gains `tk_ref`, `tk_name`, `tk_people`, `tk_seat` (booking ref, name on booking, people, seat or time), saved through `addStop` / `updateStop` with History and undo ("changed … : ticket"). The `Tickets` tab has one row per picture: `id`, `stop`, `who` (empty for both of you, or a person's name), `seat`, `page`, `mime`, `w`, `h`, `size` (base64 characters), `chunks`, `by`, `at`, `gone` (`yes` when removed). The `TicketData` tab holds each picture's base64 in pieces: `ticket` (the picture's id), `n` (0, 1, 2 …) and `data` (at most 45,000 characters a cell). No Drive and no new Google permission. Do not type into either tab. `migrate` adds the columns and both tabs; until it has run, `load` sends no `tickets`, and the ticket actions (and a stop edit with a ticket fact) answer "The trip sheet needs updating first."

**The actions** (writes under the lock): `addTicket { ticket: { id, stop, who, seat, page, mime, w, h, data } }` checks everything (the stop is there and not removed, `who` is a person or empty, the first bytes are the type's, sizes and counts), writes the chunks, then the row (a failure in between leaves chunks no row names; the next add deletes them), and answers `{ ticket, logId }`; a resend with the same id answers the first, with or without its data. `ticket { id }` answers `{ id, mime, data }` (a read: no lock, no History). `removeTicket { id }` marks it gone (History, undoable; its data rows stay). `load` lists the pictures without their data and never reads `TicketData`. A picture on a removed stop is left out of `load` and does not count toward the limits. A release that brings these tabs needs `npm run ship -- --migrate`; then run `npm run private` once facts are entered, so the scan knows the booking refs and names.

**Who may.** Under a person's own link a picture is that person's, whatever the phone says; the release check's read-only key may not add, remove, undo or read a picture, and its `load` leaves out booking refs and names on bookings. The Claude connector sees the four facts with each stop; it cannot add, read or remove pictures, or undo a change to one.

**On the phone.** `js/where.js` asks the phone only after a tap, only while the app is on screen, at most every 2 minutes (`getCurrentPosition`, coarse; never `watchPosition`). `js/geo.js` (distances, the grid, the Maps-link reader), `js/plan.js` (`hereLine`, `nearStops`, `stayDistance`, `inPlace`) and `js/board.js` are the pure parts; `js/views/sign.js` makes every sign. Taking the trip off the phone (a refused link, Forget this phone) stops the asking and keeps no choice.

## You

**Your picture.** "Your picture" opens the phone's own picker. The phone crops it to a centred square, shrinks it to 128 × 128 and sends it as a small JPEG; it then shows inside your seal on every phone. Each person sets only their own.

## The Sheet

- **People:** `name`, `initials`, `order`, `etransfer`, `simplify`, `email`, `photo`. Set pictures and e-Transfer addresses from the app, not by hand.
- **Trip:** `name`, `start`, `end`, `home`, `currency`, `tz`. Do not change `tz`, `home` or `currency` (above).
- Once the trip is live, do not delete rows by hand. Deleted expenses, stops and stays and removed payments stay as rows with a date in `deleted_at` / `removed_at`; clear that cell, or use History in the app, to bring one back.
- Text columns are stored as plain text, so a title like `=SUM(1)` or `1/2 price` stays exactly as typed.
- To change someone's link: run `newLinkForPerson1` (or 2) in the script editor (see [Personal links](#personal-links)).

### Typing into the Sheet

The plan can be built in the app, through Claude, or by typing into the Sheet. The app reads what it can and leaves the rest out, so type carefully:

- **A new row needs an `id`** of 8 or more letters and digits, different from every other row's (for example `stopmo0001`). A row with no id is not shown at all.
- **Dates** are `YYYY-MM-DD` (`2026-12-28`) and must be one of the trip's days.
- **Times** are `HH:MM`, 24-hour (`09:30`, `18:05`).
- **`travel_min`** is whole minutes, from 0 to 600.
- **Stops:** `id`, `date`, `time`, `title` (required), `detail`, `getting_there`, `travel_min`, `fixed` (TRUE or FALSE), `place` (a name or a Maps link), `sign_jp`, `link` (must start with `https://`), `note`.
- **Stays:** `id`, `name` (required), `name_jp`, `address_jp`, `first_night`, `last_night`, `note`, `place`, `link`.
- **Days:** one row per trip day, keyed by `date`; `city`, `title`, `line_jp`, `line_en`, `line_colour` (`#RRGGBB`), `from_jp`, `from_en`, `to_jp`, `to_en`. Do not add or delete day rows.
- **A hand edit does not reach phones that are already open** until someone taps You → Last updated, or makes any change in the app.

## Personal links

Each person opens the app from their own link, `https://<site>/#k=<their key>`. The key is 64 random hex characters; the backend keeps only its SHA-256 in the Script Property `PERSON_KEYS` (`{ "<name>": { "hash", "at" } }`, plus `"next"` while `mailLinks` hands that person a new link to the mail desk; read afresh on every request, so a change takes effect on the next one) and so knows who is calling: the phone's own claim to be someone is ignored. On your own link you can change only your own e-Transfer address, Simplify and picture; everything you do for each other (ringing up what the other paid, splits, settling, the placemat as yourself) works as before. The Claude link is the owner's only (the trip's first person).

**The owner's functions,** run from the script editor (pick the function, Run, then View → Executions or the run log). No menu or dialog, no new permission.

- `issueLinks`: makes a link for everyone who has none and writes each new link **once** to that run's log (which only the script's owner can open): copy it from there and send it to that person. With the Script Property `SITE_URL` set to the app's address (`https://…/`) the log shows the whole link; otherwise it shows `#k=<key>` and says to put the address in front. Anyone who already has a link is listed as "already has a link (issued <date>)", without a key.
- `newLinkForPerson1`, `newLinkForPerson2` (up to 6, in the People tab's `order`): replaces that person's link; the old one stops working at once. The new one is logged once.
- `cancelLinkForPerson1`, `cancelLinkForPerson2`: that person's link stops working. Only their name is logged.
- `linksStatus`: who has a link and since when, whose new link is still waiting for the mail desk (a `mailLinks` run going on, or one that stopped half way: `dropWaitingLinks` withdraws it), and whether the old shared link still works. Never a key.
- `retireSharedLink`: deletes the old shared key (`TRIP_KEY`), only once everyone has a personal link; it refuses otherwise. After it only the personal links, the release check's key and the Claude link work.
- `showInvite`: prints the old shared key while it exists (and says personal links replace it); after `retireSharedLink` it says there is none.
- `mailLinks`: gives each person a **new** link and has the mail desk send it to them, so nobody copies a link out of a log. Running it is your go-ahead for those mails. For each person in the People tab it makes a new key, stores its hash in `PERSON_KEYS` as that person's `next`, beside their current link, and posts `{ "action": "link", "app": "chi", "name", "link" }` to the desk's web app address (the Script Property `DESK_URL`, which must be `https://script.google.com/macros/s/…/exec`). While the desk works both links open the trip as that person, so a phone that asks in that moment is not refused. The desk keeps its own list of who gets mail at which address, checks that the link really opens the trip as that person (by asking this backend's `load` with it) and mails it to that person alone. It answers `{ "ok": true }` when the mail went: the new link then replaces the old one, which stops working. Anything else (`{ "ok": false, "error": "<word>" }`, no answer, an odd answer) drops the new link, and the old one, if there was one, carries on working as before. A `newLinkForPersonN` or `cancelLinkForPersonN` run while the desk works (or `issueLinks`, for someone with no link yet) wins: the mailed link then never works, and the log says so. The run log says only `Sent to <name>.` or `Not sent to <name>: <the desk's word>.` (`no answer` for anything that is not a plain word), then how many were sent, and while the old shared link exists that it still works until `retireSharedLink`. Never a key, a link or the desk's address. Two of your runs never overlap (they hold your own lock, not the one phones wait for): a second one started while one is going says so and changes nothing. A run begins nobody new after 4 minutes (Apps Script stops a run at 6); it then says who was not tried and which `mailLinkForPersonN` to run for them. The end of a hand-over is tried three times if the app is busy; if it still is, the log says so and both links work until you run `dropWaitingLinks` (or `mailLinkForPersonN` again). A `{ "ok": false }` answer is never taken as sent, whatever its word. A name the People tab lists twice is mailed once. If `PERSON_KEYS` is found broken during a run, the log says so (not "busy") and the run stops there. If the desk mails a link but its answer is lost, the mailed link does not work (the old one does): run `mailLinkForPersonN` again. It needs `SITE_URL` set to the app's address ending in `/` (`https://…/`); without it, or without a usable `DESK_URL`, an empty or unreadable People tab or a broken `PERSON_KEYS`, it changes nothing.
- `mailLinkForPerson1`, … (up to 6): the same for that one person.
- `dropWaitingLinks`: withdraws every new link still waiting for the mail desk (left by a `mailLinks` run that was cut off or found the app busy), without any mail. Each person's working link is untouched; someone whose only link was waiting has none again. The log names only who. It refuses while a `mailLinks` run is going.

**The shared link, until it is retired,** still opens the trip as before (the phone says who it is), except that no e-Transfer address can be changed through it ("Open your own link to change an e-Transfer address.") and the Claude link is not given out. `setup` never makes a new shared key once anyone has a personal link or the shared one was retired.

**The release check's key** (`CHI_CHECK_KEY` in the owner's private env file, never in this repo; `backend/CheckKey.js` holds only its hash) can `load`, `rev`, `history` and `migrate`, nothing else, and its `load` leaves out the e-Transfer addresses.

**On the phone.** A phone on a personal link is that person: You shows who you are, with no choice. A key the backend refuses (a cancelled or replaced link) clears the trip off the phone (the saved trip, the key, the pictures in it, every small setting) and shows the no-key screen; only that person's own unsent lines are kept, and they go out once their new link is opened (they survive any number of refusals until then). A key that comes in the address while the phone already holds another (an old Home Screen icon, an old invite link, any link someone sends) is tried for that visit only: it is kept only if the trip takes it and it is a personal key (or the phone's own key is the old shared one); refused, it is dropped and the phone stays on its own key, saying "That link didn’t work. This phone stays on the link it already had." It never clears the phone. You → Forget this phone clears everything by hand (it says first how many entries not sent yet would be lost), and also removes the app's offline copy.

**People's names.** A link belongs to a name in the People tab. Renaming, blanking or removing a person there makes their link refused at once, and their phone clears itself; run `issueLinks` to make a link for the new name (it also removes the old name's link, and `linksStatus` lists such leftovers).

**If `PERSON_KEYS` is broken** (edited by hand into something that is not what `issueLinks` writes): every request answers "Something went wrong on our side. Try again.", so nobody gets in but no phone clears itself, and `linksStatus` says so. If only its punctuation is broken (a quote, brace or comma), mend the text in Script Properties: every link keeps working. Deleting or emptying it cancels every personal link: each phone then clears itself and needs a new link (`issueLinks`, then send each person theirs). One entry that is unusable (a hash cut short) is listed by `linksStatus` as "unreadable entry"; `newLinkForPersonN` gives that person a new link. `issueLinks` changes nothing while the People tab lists nobody.

**Never roll the backend back past this version once `issueLinks` has run.** An older backend knows only the shared key: it refuses every personal key, and every phone on a personal link would clear itself. Fix forward. (`npm run ship` asks the live trip again for about 30 seconds after a deploy, since a request can still land on the old version for a moment.)

**Errors.** A request that fails on the backend answers only "Something went wrong on our side. Try again."; the detail goes to the script's executions log (`console.error`), with every key, token and id blanked.

**Cut-over, in order.**

0. Check who can edit the Sheet (Share). Anyone who can edit it can open the script editor, read Script Properties and run these functions, so personal links only keep apart people who cannot edit it.
1. Release as usual (`npm run gate`, then `npm run ship`): the backend goes first. From this moment the shared link still works for both of you, but nobody can change an e-Transfer address through it, and the Claude link row is gone (it comes back for the owner on his own link).
2. In the script editor: set the Script Property `SITE_URL` to the app's address (optional), then run `issueLinks`. Copy each link from the run log and send Izzah hers, privately. Open your own on your phone.
3. After opening your own link: remove the old Home Screen icon and add it again from the app's You screen (Add to Home Screen); force-quit the app and open it again, and check You still says "This phone is". Ask Izzah to do the same. When you both have, run `linksStatus`, then `retireSharedLink`. From then on the old shared link is refused: a phone still on it clears the trip and asks for a link.
4. Copy the Claude link again from You on your own link, if you use it (the token is the same; the old link keeps working).
5. From step 2 on, never roll the backend back past this version (above): fix forward.
