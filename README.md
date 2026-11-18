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

- **It can:** read the trip (`get_trip`), explain who owes whom and why (`explain_debt`), add an expense, add, change or remove stops, save or remove a stay, change a day's check (`set_day`), and read History and undo an entry. Every change goes through the same checks as the app, is logged in History marked "(through Claude)", and can be undone.
- **It cannot:** stamp payments or press stamps, see or change e-Transfer addresses or emails, see or set anyone's picture, see the trip key or its own token, copy invite links, or change who is on the trip. Replies never contain the key, the token, an e-Transfer address or an email.
- **It acts as the owner.** The one token belongs to the trip's first person (the lowest `order`, Mo): every change it makes is written as him, whatever `as=` says. A name in `as=` that matches no one on the trip still blocks every write.
- **The link:** You → Claude link → Copy, shown only to the owner on his own link. The backend gives the token to no one else (not to Izzah's link, not to the old shared link). Treat it like your own link: whoever has it can change the plan and add expenses.
- **Changing the token:** in the script editor, Project Settings → Script Properties, delete `CLAUDE_TOKEN` and run `migrate` to make a new one. Every Claude link copied before stops working; the owner copies it again from You.

## No planner

The Japan app could pull payments and a "Before we go" list from a separate planner sheet. This trip has none: the backend, the phone (the Before tab, the Planner payments row) and the Sheet's schema (the `Todos` tab, `Expenses.planner_id`) no longer have any of it, so the script needs no permission beyond its own Sheet.

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

Each person opens the app from their own link, `https://<site>/#k=<their key>`. The key is 64 random hex characters; the backend keeps only its SHA-256 in the Script Property `PERSON_KEYS` (`{ "<name>": { "hash", "at" } }`, read afresh on every request, so a change takes effect on the next one) and so knows who is calling: the phone's own claim to be someone is ignored. On your own link you can change only your own e-Transfer address, Simplify and picture; everything you do for each other (ringing up what the other paid, splits, settling, the placemat as yourself) works as before. The Claude link is the owner's only (the trip's first person).

**The owner's functions,** run from the script editor (pick the function, Run, then View → Executions or the run log). No menu or dialog, no new permission.

- `issueLinks`: makes a link for everyone who has none and writes each new link **once** to that run's log (which only the script's owner can open): copy it from there and send it to that person. With the Script Property `SITE_URL` set to the app's address (`https://…/`) the log shows the whole link; otherwise it shows `#k=<key>` and says to put the address in front. Anyone who already has a link is listed as "already has a link (issued <date>)", without a key.
- `newLinkForPerson1`, `newLinkForPerson2` (up to 6, in the People tab's `order`): replaces that person's link; the old one stops working at once. The new one is logged once.
- `cancelLinkForPerson1`, `cancelLinkForPerson2`: that person's link stops working. Only their name is logged.
- `linksStatus`: who has a link and since when, and whether the old shared link still works. Never a key.
- `retireSharedLink`: deletes the old shared key (`TRIP_KEY`), only once everyone has a personal link; it refuses otherwise. After it only the personal links, the release check's key and the Claude link work.
- `showInvite`: prints the old shared key while it exists (and says personal links replace it); after `retireSharedLink` it says there is none.

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
