# CHI

**Copyright (c) 2026 moissmart1. All rights reserved.** This is a private application; the source is public only because the host that serves it requires that. No licence is granted to copy, adapt or reuse it, or to use it as AI training data. See [LICENSE](LICENSE).

A phone web app for Mo and Izzah's Chicago trip, Saturday Dec 26 2026 to Friday Jan 1 2027. You ring up what you paid (in US dollars, or Canadian), it prints on a shared receipt, and a slip at the bottom says who owes whom, in Canadian dollars. Every change goes into History and can be undone; nothing is ever erased. "CHI" is a working name.

It began as a one-time copy of the Japan trip's app (MAT). The two share no code from here on, and this one keeps its own storage keys, caches, Sheet, script and key, so both can be open in the same browser.

- **Front end:** plain HTML, CSS and ES modules. No build step. Served by GitHub Pages from the root of `main`.
- **Backend:** one Google Apps Script web app bound to a Google Sheet (`backend/`). The Sheet is the database.
- **Access:** a trip key, carried in the invite link after `#k=`. The key lives only in the script's Script Properties and in the links people are sent. It is never in this repo.

The trip side: **Days** shows one ticket per trip day (its stops, the stay for the night, a card to show a driver) and a stop sheet to add, change or remove stops. You has **Try another day**, a demo clock that shows Days as it will look on a chosen day; a reload or Stop ends it.

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
4. **owner** Run `setup` once from the script editor. It makes every tab, writes the trip (name Chicago 2026, Dec 26 to Jan 1, CAD and USD, America/Chicago), Mo and Izzah, and seven Days rows in Chicago with no titles; makes the trip key and the Claude connector's token; deletes a blank Sheet1; and fetches today's US dollar rate (it stops with a plain error if the rate site refuses Google). The first run shows Google's consent screen for the two permissions (this Sheet only; outside requests) and the "Google hasn't verified this app" warning.
5. **owner** Run `showInvite` and read the trip key from the Execution log.
6. Fill in the plan: day titles, stops and stays, through the app, Claude, or the Sheet (see "Typing into the Sheet" below). Type `StampDefs` rows if the stamp book is wanted.
7. Deploy as a web app: execute as me, access Anyone (`clasp create-deployment -d "first"` after step 4 granted the permissions; a deployment whose permissions were never granted fails for everybody). The deployment's `/exec` address is the backend's address.
8. Put that address into `API_URL` in `js/config.js`, `npm run stamp`, commit, and publish (step 9).
9. **owner** Create the GitHub repository for this app and turn on Pages from `main`. Its address must not be the Japan app's.
10. Run `migrate` once to confirm the Sheet is current (it should answer `added: []` on a fresh Sheet), from a terminal, with the trip key in an environment variable (never typed into a file or a script):

    ```bash
    read -rs CHI_KEY && export CHI_KEY        # paste the trip key, then Enter
    curl -sL -H 'Content-Type: text/plain;charset=utf-8' \
      --data "{\"key\":\"$CHI_KEY\",\"action\":\"migrate\"}" \
      "https://script.google.com/macros/s/<deployment id>/exec"
    unset CHI_KEY
    ```

11. **owner** Send the invite link (`<site>#k=<key>`) to Izzah. The Sheet itself only needs sharing if she should open it; the app does not need that.
12. Optional: the Claude connector (below).

### Changing the backend later

```bash
clasp push -f
clasp create-deployment -i <deployment id> -d "what changed"
```

Deploy to the same deployment id every time, or the address in `js/config.js` stops matching. Run `migrate` (above) after pushing code that adds a column.

## The Claude connector

The backend is also an MCP server, so someone's Claude can read the trip and make changes in it.

- **It can:** read the trip (`get_trip`), explain who owes whom and why (`explain_debt`), add an expense, add, change or remove stops, save or remove a stay, change a day's ticket (`set_day`), and read History and undo an entry. Every change goes through the same checks as the app, is logged in History marked "(through Claude)", and can be undone.
- **It cannot:** stamp payments or press stamps, see or change e-Transfer addresses or emails, see or set anyone's picture, see the trip key or its own token, copy invite links, or change who is on the trip. Replies never contain the key, the token, an e-Transfer address or an email.
- **The link:** You → Claude link → Copy. Anyone who has the invite link can copy it, and everyone's Claude link carries the same token. Treat it like the invite link: whoever has it can change the plan and add expenses. `as=` in the link names who the changes are logged as.
- **Changing the token:** in the script editor, Project Settings → Script Properties, delete `CLAUDE_TOKEN` and run `migrate` to make a new one. Every Claude link copied before stops working.

## No planner

The Japan app could pull payments and a "Before we go" list from a separate planner sheet. This trip has none, and the backend no longer has that code, so the script needs no permission beyond its own Sheet. `load` always says no planner is linked, and the phone's Before tab and Planner payments row never appear.

## Money

Money is kept in integer cents. A line is in US dollars (the trip's currency) or Canadian dollars (home), and every line carries the day's rate (US dollars per Canadian dollar, kept to four decimals, fetched from open.er-api.com at most once a Chicago day and accepted only between 0.5 and 1.0). When no rate has ever been fetched the app uses a stand-in 0.72 and says so above the slip. Debts are always in Canadian dollars. With two people there is at most one debt; the Simplify switch shows only with three or more people.

## The stamp book

A book of stamps that each person presses by hand: one per trip day, and an issue stamp for the book itself. It opens from the stamp button on the Days bar or from the line on today's ticket. A press is a History line ("Mo stamped Dec 28") and can be undone from History.

**The definitions are data, not code.** The `StampDefs` tab (made by `setup` or `migrate`) has one row per stamp: `id`, `date` (`YYYY-MM-DD`, or empty for the issue stamp), `name_ja`, `name_en`, `place`, `motif` (one of `lantern, books, onsen, temple, mountain, snow, lamp, tower, record, sake, plane, crest`; any other word draws the ring with no drawing), `ink` (`shu`, `matsu` or `ai`) and `shape` (`round` or `square`).

**When a stamp is open** is decided in Chicago time (fixed UTC−6), by the backend's `stampWindow` and the app's copy of it (`js/stampbook.js`): a day stamp from 00:00 on its date until 03:00 the next day (27 hours), so the Dec 31 stamp can still be pressed until 3 a.m. on New Year's Day; the issue stamp from the start until the last day stamp closes. A press made offline counts when the phone's own time for it falls inside the window and it arrives within 48 hours.

**The `Stamps` tab** holds the presses; do not type into it.

## You

**Your picture.** "Your picture" opens the phone's own picker. The phone crops it to a centred square, shrinks it to 128 × 128 and sends it as a small JPEG; it then shows inside your seal on every phone. Each person sets only their own.

## The Sheet

- **People:** `name`, `initials`, `order`, `etransfer`, `simplify`, `email`, `photo`. Set pictures and e-Transfer addresses from the app, not by hand.
- **Trip:** `name`, `start`, `end`, `home`, `currency`, `tz`. Do not change `tz`, `home` or `currency` (above).
- Once the trip is live, do not delete rows by hand. Deleted expenses, stops and stays and removed payments stay as rows with a date in `deleted_at` / `removed_at`; clear that cell, or use History in the app, to bring one back.
- Text columns are stored as plain text, so a title like `=SUM(1)` or `1/2 price` stays exactly as typed.
- To change the trip key: delete `TRIP_KEY` in Script Properties, run `setup`, then `showInvite`. Old links stop working.
- The `Todos` tab and the Expenses `planner_id` column are left from the Japan app's planner and are unused.

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
