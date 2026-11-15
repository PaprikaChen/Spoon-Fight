# Spoon Fight (was Restaurant Rivals) · notes for Claude

Project context for Claude (in chat or in Claude Code). Read all of it before making changes.

## What this is

A two-player web game that teaches restaurant management to players aged 13+. It's a team project for a game design class, currently a first prototype. The goal is fast iteration and playtesting.

- Live site: https://paprikachen.github.io/cs377g_Project3/ (GitHub Pages)
- Backend: Firebase anonymous sign-in + Firestore; no server of our own
- Team AI policy: **game design content (rules, numbers, the ideas behind the copy) is the team's own original work; AI is used for code and cross-checking.** When changing rules or numbers, implement what the team asks for; don't invent new mechanics or numbers. If a design looks problematic, say so with reasons and let the team decide.
- On-screen text and project files are in English.

## Files

| File | Contents |
| --- | --- |
| `engine.js` | All game rules. `CFG` holds every number; `simulate(seed, logs)` replays both players' action logs into the game state |
| `app.js` | Rendering, Firebase sync, local test mode (ES module) |
| `art.js` | SVG drawings, display only: `ART.icon(name)` small icons, `ART.stars(n)`, `ART.plate()`, card art and story pictures. (`ART.room()` / `ART.floor()` are the old table floor plans, no longer used by Build or Service) |
| `service.js` | The real-time service and the hire-staff floor plan (`window.RRService`: `create(host, opts)`, `floorPlan(loc, staff, animal, color)`). **Generated** from the tested prototype `prototypes/service-feel/index.html` (art: face style A, Countryside and City finals). Display and timing only: it never decides who comes, the engine does |
| `style.css` | Styles (UI v3, "minimal premium"); colors are `:root` tokens with light and dark themes. You = cobalt `--you`, rival = magenta `--rival`, main buttons use the logo red (`.cta`), celebration numbers use the gold logo lettering (`.gold`) |
| `assets/` | `key-art.jpg` (landing + final results), `logo.jpg` (header), `countryside.jpg` / `city.jpg` (old pick-screen photos, no longer used: the pick screen now draws `ART.place(loc)`, from `prototypes/location-art`) |
| `docs/mockups/` | The earlier agreed design for every screen (PNG) |
| `docs/uiux-v2-changes.md` | The UI/UX v2 changes (agreed on the mockup canvas): what each screen does now and why. Match this when changing the UI |
| `index.html` | Entry; loads `firebase-config.js` → `engine.js` → `app.js` |
| `firebase-config.js` | Firebase web config (public values, safe to commit) |
| `firestore.rules` | Security rules. **After changing them, a person must paste them into the Firebase console and publish** |
| `tests/` | Tests, see below |

## Architecture (understand before editing)

1. **Deterministic replay**: game state is never stored in the database. Each player only appends actions to their own seat doc `games/{code}/seats/{p1|p2}` (the `log` array). Both browsers rebuild the same state with `simulate(seed, {p1: log, p2: log})`. So **`engine.js` must never use `Math.random()` or the current time**; use `rand(seed, tag)` / `d6(seed, tag)` for randomness.
2. **Action keys `k`**: every action carries a key like `"3:market"` (day 3, market phase). Daily phase order: `morning` (day 2+) → `commit` (buy/place ad cards, from day `CFG.adsFrom`) → `invest` (staff + that player's own event choice) → `market` → `reveal` (automatic, from day `CFG.adsFrom`) → `service` → `voucher` → `report`. `expected(S)` decides who we're waiting on and for which key; actions with the wrong key are dropped, so double clicks don't apply twice. A new phase needs changes in `expected()`, `apply()` and `gameHTML()` in `app.js`.
3. **Live market (the one real-time exception)**: who got which item is settled live in `games/{code}/market/d{day}` (`owner` map + `start` time); each click is an `fb.tx()` transaction, so the first click wins. Before the clock runs, each player sees a briefing (`marketBriefHTML()`) and presses Start: the start time is set in the market doc once both are ready (`ready` map), 3 seconds ahead for a countdown, or 30 seconds after the first player pressed Start (`marketForceStart()`). Cooldowns and the 60s timer run on each device. When a player finishes, their action is `{k, buys:[item indexes]}`, and `apply('market')` replays it (if both logs ever claim one item, P1 keeps it). Item types come from `marketItems(seed, day)`, and Regular today/tomorrow from `regTomorrow()`, so both sides agree without storing them.
4. **Face-down ad cards**: the daily shop is `shopFor()` (seeded, per player). At placement only the counts (`nSelf` / `nRival`) and `adHash({self, rival}, salt)` are public; the card ids are kept on the device and in `users/{uid}/ads/...`. `apply('reveal')` checks the checksum; the commit also carries the total `cost`, which is paid right away in the Ads step; `apply('reveal')` checks the checksum and that the cards add up to that cost, and on failure the ads do nothing and the money is refunded.
5. **Real-time service**: `prepService()` rolls everything random for the day into `S.script[seat]` (card outcomes with `from: 'self'|'rival'`, the day's event, inspector roll, walk-ins, plates, staff). The page plays the night in real time with `RRService.create()` (opts from `svcOpts()` in `app.js`: walk-ins, card guest groups, pop-ups for every card effect, the event, `opPrice()` for rush plates, `CFG.service.live` timings) and logs one result `{k, res}` with `res = {served, delivered, unhappy, earned, rushN, food}` when the player closes for the day. This night can't be replayed, so `finishService()` **checks the result against the script and cuts back anything impossible** (more guests than came, more plates than you had, rush plates you couldn't afford, more money than those guests pay). `autoService()` is a stand-in player for tests. Guests from your own cards wear your seat colour, guests from your rival's cards wear theirs; mid-service events (food request, fight, proposal) are a pop-up with a `decide`-second timer while the service clock stops. A fight sends `fightStaff` bunnies home for the day (still paid).
6. **Rendering while live**: during the market the page ticks every 200ms but only re-renders when `liveSig()` changes; bars and rings (`data-t0/t1`, plus `data-ring` for rings) and countdowns (`data-count`) are moved in place by `updateBars()`. Don't re-render on every tick: replacing buttons under the pointer drops clicks. The service runs its own `requestAnimationFrame` loop inside `service.js`; `render()` calls `mountService()`, which moves the running instance into the new page instead of restarting it (so a re-render never resets the night). Inside the service, clicks use `pointerdown` because the drawing under the pointer is redrawn every frame.
7. **Private information**: each player's morning event (shady deal) and its outcome are shown only to them; see the offer card in `buildHTML()`, `PRIVATE_LINES` and `PRIVATE_WHY` in `app.js`.
8. **Text and rules**: on-screen text is plain language for a 13-year-old: say what happened to the player and why, effect first, no engine jargon; odds only where the player decides (Ads). Every button on screen must work: unavailable actions are explained in text, not shown as disabled buttons. Rules live in the How to play drawer (`howtoHTML()` in `app.js`), built from `CFG` numbers. Card faces shown to players come from `adFace()` (emoji art, big effect, short line, keyword tag), and results from `adResult()` / `trickResult()` / `flipStamp()`; they and are a plain-language rewrite of `CFG.ads` text: the team owns that wording.
9. **Placeholder numbers**: values marked TBD in `CFG` comments (ad cards, service prices and chances, event numbers) are placeholders until the team settles them.
10. **Same version on both sides**: both players must run the same `engine.js`, or they'll compute different results. Changing rules or numbers recomputes games in progress under the new rules. Remind the team to change versions between games and have both players refresh.
11. **Morning step**: the engine still has a separate `morning` phase; the page acknowledges it automatically in `refresh()`. Inside `invest` the page shows up to three screens, tracked in the form state (`f.gift`, `f.offer`): the day 1 gift (`giftHTML()`), the secret offer card on shady-deal days (`offerHTML()`), then hiring staff (`buildHTML()`, `toggleHire()`).
13. **Day 1 and 2, staff**: there is no Market on day 1. `CFG.freeFood` plates are put in the kitchen in `startRound()`. Ads start on day `CFG.adsFrom` (3), and from then on they are the first step of the day (`apply('morning')` opens the shop). Until the flip after the Market (`afterMarket()` → `reveal`), each player knows their own cards but only the count of cards the rival placed on them (`S.commits[o].nRival`, shown by `rivalCardsNote()`); ads are paid when confirmed, so nothing is carried into Staff or Market. Before day 3, `afterMarket()` skips `reveal` and goes straight to service, and `stepsFor()` hides Ads in the top bar. Tables are fixed per location (2 per section, one bunny per section). The invest action is `{k, staff: [section numbers], choice}`: wages for everyone on staff are paid that morning, letting a bunny go costs `CFG.staff.fire`, staff carry over to the next day, and new hires you can't pay for are dropped.
14. **Staff, Ads and Service screens**: Staff and Ads follow the v2 mockups (`shell()` puts the main card left and the side column right with the button at the bottom). Staff is full width like Service: `RRService.floorPlan()` (click a rug to hire or let go) with the money panel placed in the lower kitchen (`RRService.buildBox`), and on day 1 the team's three pop-ups first (`hireTip()`, counted in `f.tip`). Ads (`adsHTML()`, screens in `f.astep`): on day 3 an intro and a budget page, then "Ads for your restaurant" and "Ads for your opponent" (team sketch, `prototypes/ads-flow`); on ad days the Staff step opens with "Opponent ads: N" (`hiddenAdsHTML()`, `f.seenAds`). Service is full width: on ad days it first shows "Ads received" (`receivedHTML()`: only the opponent's ads on you; your own appear as pop-ups during service), then the live restaurant with its own start card, Day 1 and Day 3 tutorials, and closing summary. Vouchers are their own page after service (`voucherHTML()`).
12. **One-screen practice**: before steps with secrets (`PRIVATE_PHASES`: pick, invest, commit) a cover screen (`coverHTML()`) asks the other player to look away.
15. **Start screens**: `lobbyHTML()` shows the invite page when the URL has `?room=CODE` (`app.invite`, set in `boot()`), the "still going" card when this device has an unfinished game (`app.resume`, from `loadResume()`), otherwise the first-visit page. Online, until seat p2 is taken, the game shows the waiting room (`roomHTML()`, `inRoom()`) instead of the story. Story pictures are `ART.story(i, rivalName)`; after the 5 story pages come 4 goal pages (`GOAL_PAGES` in `app.js`, pictures `ART.goal()`; `app.intro` counts through both, Skip on the story jumps to the goal pages); pick needs a tap to select (`picksel`, `f.loc`) and then the Open button.

## Firestore data

```
games/{code}                 { seed, host, created, v }                           created by the host, never changed
games/{code}/seats/p1|p2     { uid, name, log: [actions...] }                     only the seated player can update
games/{code}/market/d{n}     { owner: {itemIndex: 'p1'|'p2'}, start }             live market for day n; claimed by transaction
users/{uid}/ads/{code}-r{n}  { self: [cardIds], rival: [cardIds], salt }          only that player can read/write
```

If you change paths or fields, update `firestore.rules` too and tell the team to republish the rules in the console.

## Tests (run after every change)

```
node tests/engine.test.js        # simulates 2000 random games; checks nothing gets stuck, stars stay 1–5, replays are deterministic
```

UI and online flow (needs Python playwright and Chromium):

```
python3 -m http.server 8765 &     # from the repo root
python3 tests/online.test.py http://localhost:8765/index.html
```

Market start (both players press Start → same start time; only one presses → opens after 30s). Takes about 45 seconds:

```
python3 tests/market-start.test.py http://localhost:8765/index.html
```

Screenshots of every screen in light and dark theme, in about 15 seconds (builds each game state straight from the engine instead of playing in real time):

```
python3 tests/screens.py http://localhost:8765/index.html out-folder
```

`online.test.py` uses `tests/fake-backend.js` in place of Firebase and plays a full game as two players on two pages, checking both sides get the same result, card reveals pass the checksum, and there are no page errors. The `window.__RR_FAKE_FB` check in `app.js` is for this test; don't remove it. In the tests the service plays itself: `window.__RR_SVC_AUTO = 1` (no clicks, no tutorial, pop-ups answered automatically) and `window.__RR_SVC_FAST = 20` (20× speed). If Playwright can't find its browser, set `RR_CHROMIUM` to the Chromium path.

`service.js` is generated: edit `tools/service/instance.js` (the live instance) or the prototype (the drawings), then run `python3 tools/service/build.py`. Editing the output by hand gets lost at the next build.

## Publishing

Push to `main`; GitHub Pages updates in about a minute. Other branches deploy to `/preview/<branch>/` on the same site (see `.github/workflows/pages.yml`); the Pages source is the `gh-pages` branch, which only the workflow writes to. **Whenever `style.css`, `engine.js`, `art.js`, `service.js`, `app.js` or `firebase-config.js` changes, bump the `?v=...` after those files in `index.html`** (e.g. to the current short commit hash), or browsers may keep cached old files. Write short commit messages in English describing what changed.

## Related docs

- v1 prototype proposal (source of the rules and numbers): https://claude.ai/artifact/XXaDQPnC3Tgbi1U9Z1FE2t (visible only to people it's shared with)
- Playtest 1 notes: https://claude.ai/artifact/Ke61jjQgiuCPV23Q89BpHN
- Setup and deployment: `README.md`
