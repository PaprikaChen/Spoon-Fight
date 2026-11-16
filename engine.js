// ===== Rules engine (v2): replays both players' action logs into the game state =====
// ⚠ Numbers marked TBD are placeholders until the team settles them.
const CFG = {
  rounds: 5, startCash: 200, startStars: 3,
  // price = income per table served (fixed, tips included)
  loc: {
    country: { name: 'Countryside', tag: '$$', open: 20, rent: 5, tables: 20, price: 10 },
    city:    { name: 'City', tag: '$$$', open: 35, rent: 12, tables: 16, price: 12 }
  },
  // Tables are fixed by location (2 per section). Staff: one bunny per section; wages are paid every day before opening.
  // Bunnies stay from day to day. Letting one go costs severance (team rule, playtest Nov 15):
  //   fire.pay × daily wage × (1 / bunnies left after this one goes) × (fire.worth × net worth)
  //   so a richer restaurant pays more, and each goodbye costs more as the team gets smaller (more pressure on the rest).
  //   Net worth = cash + stars × starValue at the moment you decide. Wages are TBD.
  staff: { wage: { country: 6, city: 10 }, fire: { pay: 0.5, worth: 0.2 }, perSection: 2 },
  baseDemand: 14,
  // Ad cards start on this day (days before it have no Ads step). From then on Ads is the first step of the day,
  // and the cards stay face down (only the counts are public) until just before service.
  adsFrom: 3,
  // Day 1 has no Market: the Golden Spoon gives each restaurant this much free food instead (most of it gets wasted: that's the lesson)
  freeFood: 12,
  // Stars: each star above 3 adds perStar maybe-customers (each comes with `chance`);
  //        each star below 3 puts perStar regulars at risk (each stays away with `loseChance`)
  rep: { perStar: 2, chance: 0.5, loseChance: 0.5 },
  // Live online market: a grid of food bundles, both players click at the same time and race for the same bundles.
  //   bundles = how many plates each bundle makes (team grid, playtest Nov 15: 12 Regular + 12 Express = 24),
  //   shuffled into new spots every day. price = per plate, so a bundle costs n × price.
  //   Express arrives today; Regular arrives today or tomorrow (revealed when its cooldown bar ends). On the last day every bundle is Express.
  //   cd = cooldown in seconds after buying a bundle; time = total seconds
  market: { time: 60,
    bundles: { reg: [10, 7, 5, 5, 3, 3, 3, 2, 2, 2, 2, 2], exp: [9, 6, 4, 4, 2, 2, 2, 1, 1, 1, 1, 1] },
    exp: { price: 6, cd: 3 }, reg: { price: 3, cd: 5, tomorrow: 0.5 } },
  // Ad shop (all TBD): each day you see 1 location card + 2 general cards for your shop, and 3 random cards for your rival's shop.
  // Every card can be bought once. All cards go face down; the other player only sees how many.
  shop: { loc: 1, general: 2, rival: 3 },
  ads: {
    delivery: { side: 'self', loc: 'city', name: 'Delivery app spotlight', price: 8, n: 2, desc: '+2 delivery orders: they use food but no table' },
    lunch:    { side: 'self', loc: 'city', name: 'Office lunch deal', price: 5, n: 3, off: 4, desc: '3 guests for sure, each pays $4 less' },
    subway:   { side: 'self', loc: 'city', name: 'Subway poster', price: 13, n: 4, low: 2, lowChance: 0.3, desc: '+4 guests (30% chance it gets lost in the crowd: only 2)' },
    stall:    { side: 'self', loc: 'country', name: "Farmers' market stall", price: 7, n: 1, food: 1, desc: '+1 guest and 1 free food' },
    bus:      { side: 'self', loc: 'country', name: 'Tour bus stop', price: 10, n: 6, chance: 0.5, desc: '50%: a bus of 6 guests. Otherwise nobody' },
    wom:      { side: 'self', loc: 'country', name: 'Village word of mouth', price: 7, n: 1, desc: '+1 guest today and +1 every day after' },
    flyer:    { side: 'self', name: 'Flyers', price: 8, n: 2, desc: '+2 guests' },
    blogger:  { side: 'self', name: 'Food blogger visit', price: 12, n: 4, chance: 0.5, star: 0.3, desc: '50%: +4 guests. Turn nobody away that day: 30% chance of +1 star' },
    coupon:   { side: 'self', name: 'Opening coupon', price: 4, n: 3, off: 3, desc: '+3 guests, each pays $3 less' },
    fake:     { side: 'rival', name: 'False advertisement', price: 4, desc: 'Does nothing. Makes them over-prepare' },
    review:   { side: 'rival', name: 'Bad review', price: 8, n: 2, desc: 'They get 2 fewer guests' },
    poach:    { side: 'rival', name: 'Poach a guest', price: 9, n: 1, desc: '1 of their guests comes to you instead' },
    swamp:    { side: 'rival', name: 'Swamp them', price: 8, n: 3, desc: '+3 guests for them. Can they seat them all?' },
    corner:   { side: 'rival', name: 'Corner the rush supplier', price: 7, extra: 3, desc: 'Their rush food costs $3 more each today' }
  },
  // Service (all TBD). Real time: guests walk in over the day; bunnies seat and serve their section, you do the rest.
  //   rushShare: a rush plate costs this share of what the guest pays (half: you keep your stars, not the profit) (+ corner card extra)
  //   eventChance: chance of one event per day; food: give → foodGood chance +1 star, refuse → foodBad chance −1 star
  //   fightStaff: bunnies hurt in a fight (off for the rest of the day, still paid)
  //   live (page timing, seconds / pixels per second): dayLen, first walk-in, longest gap between walk-ins,
  //   qPat door patience, sPat patience waiting for a plate, cPat courier patience, eat time, walking speeds,
  //   mSpeed rush marker sweeps per second, zone green width (share of the bar), decide seconds for event pop-ups
  service: { rushShare: 0.5, eventChance: 0.6, foodGood: 0.2, foodBad: 0.5, propose: 0.5, tip: 20, fightStaff: 2, fewer: 3,
    live: { dayLen: 120, first: 6, gap: 8, qPat: 30, sPat: 30, cPat: 35, eat: 12, chefSpeed: 160, staffSpeed: 130,
      mSpeed: 0.7, zone: 0.11, decide: 15, tutSeed: 14 },
    // Build screen hints (TBD): about this many guests per bunny without your help; warn when less than foodWarn is left for food
    perBunny: 5, foodWarn: 20 },
  // Between two days: `chance` a thief takes half your cash, at most `cap`
  robbery: { chance: 0.05, cap: 30 },
  voucher: 18,
  // Loans (off for now): set enabled to true to bring back the Build-phase loan and the automatic loan when rent can't be paid
  loan: { enabled: false, amount: 30, repay: 40 },
  // Each step the two players do on their own (pick, ads, staff, vouchers, recap) has a timer; when it runs out the page
  // goes on with the player's current choices. Page-only (the engine never reads the clock). TBD.
  stageSeconds: 180,
  // Each star is worth starValue: paid into your cash at the end of every day, and counted again in the final score
  starValue: 20, shady: { cash: 15, fine: 20 }
};
CFG.market.stock = CFG.market.bundles.reg.length + CFG.market.bundles.exp.length;
const round2 = x => Math.round(x * 100) / 100;
const SEATS = ['p1', 'p2'];
const other = s => (s === 'p1' ? 'p2' : 'p1');

function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function rand(seed, tag) {
  let a = cyrb53(seed + '|' + tag) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const d6 = (seed, tag) => 1 + Math.floor(rand(seed, tag)() * 6);
function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const intIn = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));
const between = (r, [lo, hi]) => lo + Math.floor(r * (hi - lo + 1));

// Hidden card placement: only the count per shop is public; which cards they are is locked with a checksum
const adHash = (c, salt) => String(cyrb53(`${c.self.join(',')}|${c.rival.join(',')}|${salt}`));
const adCost = c => [...c.self, ...c.rival].reduce((a, id) => a + CFG.ads[id].price, 0);

// ---------- market helpers (the page uses these too) ----------
// Today's bundles in their shuffled spots: [{t: 'exp'|'reg', n: plates}]. On the last day the Regular bundles are sold as Express.
function marketItems(seed, r) {
  const B = CFG.market.bundles, last = r >= CFG.rounds;
  const list = [...B.reg.map(n => ({ t: last ? 'exp' : 'reg', n })), ...B.exp.map(n => ({ t: 'exp', n }))];
  return shuffle(list, rand(seed, `mk${r}`));
}
const itemPrice = it => it.n * CFG.market[it.t].price;
const regTomorrow = (seed, r, i) => rand(seed, `reg${r}:${i}`)() < CFG.market.reg.tomorrow;

// ---------- service prices (the page shows them before you click) ----------
// One rush plate: half of what the guest pays (you keep your reputation, not the profit), plus the corner card's extra
const rushBase = p => round2(CFG.loc[p.loc].price * CFG.service.rushShare);
function opPrice(S, s, i) {
  return round2(rushBase(S.players[s]) + (S.script[s].cornered ? CFG.ads.corner.extra : 0));
}
const wageOf = p => CFG.staff.wage[p.loc] || 0;
const sectionsOf = p => CFG.loc[p.loc].tables / CFG.staff.perSection;
// What letting `fired` of today's bunnies go costs, one after another (see CFG.staff.fire). `cash` = cash at the moment you decide.
const netWorth = (p, cash = p.cash) => round2(Math.max(0, cash) + p.stars * CFG.starValue);
function severance(p, fired, cash = p.cash) {
  const F = CFG.staff.fire, base = F.pay * wageOf(p) * F.worth * netWorth(p, cash);
  let t = 0;
  for (let i = 1; i <= Math.min(fired, p.staff.length); i++) t += base / Math.max(1, p.staff.length - i);
  return round2(t);
}
// Hire / let go: wages for everyone on staff today, plus severance for each bunny fewer than yesterday
function staffCost(p, n, cash = p.cash) { return round2(n * wageOf(p) + severance(p, Math.max(0, p.staff.length - n), cash)); }

function newPlayer() {
  return { loc: null, cash: CFG.startCash, stars: CFG.startStars, tables: 0, staff: [], ingr: 0, pending: 0, wom: 0,
    loan: false, shadyFrom: null, bankrupt: false, ledger: [], history: [] };
}
function money(p, label, amt) { p.cash = round2(p.cash + amt); p.ledger.push({ label, amt: round2(amt) }); }
function note(p, label) { p.ledger.push({ label, amt: null }); }

// Expected customers before the doors open, for hints. selfCards = your own ad cards (known).
function expectedDemand(p, selfCards = []) {
  const d = p.stars - CFG.startStars, per = CFG.rep.perStar;
  const rep = d > 0 ? d * per * CFG.rep.chance : -(-d) * per * CFG.rep.loseChance;
  let ads = 0, adMin = 0, adMax = 0;
  for (const id of selfCards) {
    const A = CFG.ads[id];
    if (id === 'subway') { ads += A.n - (A.n - A.low) * A.lowChance; adMin += A.low; adMax += A.n; }
    else if (A.chance) { ads += A.n * A.chance; adMax += A.n; }
    else { ads += A.n; adMin += A.n; adMax += A.n; }
  }
  const base = CFG.baseDemand + p.wom;
  return { base, rep, ads, total: base + rep + ads,
    min: base - (d < 0 ? -d * per : 0) + adMin, max: base + (d > 0 ? d * per : 0) + adMax };
}
function capacityOf(p) {
  return { tables: p.tables, staff: p.staff.length, ingr: p.ingr, cap: Math.min(p.tables, p.ingr) };
}

function init(seed) {
  const decks = {};
  for (const s of SEATS) decks[s] = shuffle([...Array(3).fill('shady'), ...Array(7).fill('quiet')], rand(seed, 'deck' + s));
  return { seed, round: 0, phase: 'pick', decks, players: { p1: newPlayer(), p2: newPlayer() },
    events: {}, morning: {}, market: null, shops: {}, commits: {}, reveals: {}, script: {}, service: null, got: {}, result: null };
}

function startRound(S) {
  S.round++;
  for (const s of SEATS) {
    const p = S.players[s], L = CFG.loc[p.loc], m = { robbed: 0, arrived: p.pending };
    p.ledger = [];
    if (S.round > 1) {
      const R = rand(S.seed, `rob${S.round}${s}`);
      if (R() < CFG.robbery.chance && p.cash > 0) {
        m.robbed = Math.min(CFG.robbery.cap, round2(p.cash / 2));
        money(p, 'Robbed overnight', -m.robbed);
      }
    }
    money(p, 'Rent', -L.rent);
    p.ingr = p.pending; p.pending = 0;
    if (m.arrived) note(p, `Regular delivery arrived ×${m.arrived}`);
    if (S.round === 1 && CFG.freeFood) { p.ingr += CFG.freeFood; m.free = CFG.freeFood; note(p, `Free food from the Golden Spoon ×${CFG.freeFood}`); }
    if (p.cash < 0 && CFG.loan.enabled && !p.loan) { p.loan = true; money(p, 'Forced loan', CFG.loan.amount); }
    if (p.cash < 0) p.bankrupt = true;
    S.morning[s] = m;
    S.events[s] = { type: S.decks[s][S.round - 1], choice: null };
  }
  if (S.players.p1.bankrupt || S.players.p2.bankrupt) return finish(S, 'bankrupt');
  S.phase = S.round > 1 ? 'morning' : 'invest';
}

function startMarket(S) {
  S.market = { items: marketItems(S.seed, S.round), owner: {}, bought: {} };
  S.phase = 'market';
}

function shopFor(S, s) {
  const p = S.players[s], R = rand(S.seed, `shop${S.round}${s}`), ids = Object.keys(CFG.ads), A = CFG.ads;
  const pick = (list, n) => shuffle(list.slice(), R).slice(0, n);
  return {
    self: [...pick(ids.filter(i => A[i].side === 'self' && A[i].loc === p.loc), CFG.shop.loc),
           ...pick(ids.filter(i => A[i].side === 'self' && !A[i].loc), CFG.shop.general)],
    rival: pick(ids.filter(i => A[i].side === 'rival'), CFG.shop.rival)
  };
}

// ---------- service ----------
// Everything random about today's service is rolled here, before anyone acts, so both browsers see the same script.
// The page plays the night out in real time (service.js) and logs one result; finishService() checks it against this script.
function prepService(S, s) {
  const p = S.players[s], o = other(s), L = CFG.loc[p.loc], C = CFG.service, A = CFG.ads;
  const r = rand(S.seed, `svc${S.round}${s}`), d100 = () => 1 + Math.floor(r() * 100);
  const info = [], mine = S.reveals[s].self, theirs = S.reveals[o].rival;
  const sc = { info, groups: [], mid: null, fewer: 0, cornered: false, stallFood: 0,
    blogger: false, rolls: { food: r(), blogger: r(), propose: r() } };
  // The one event of the day (or none)
  let ev = null;
  if (r() < C.eventChance) {
    const pool = ['food', 'fight', 'propose', p.loc === 'city' ? 'protest' : 'weather'];
    ev = pool[Math.floor(r() * pool.length)];
  }
  sc.event = ev;
  if (p.shadyFrom !== null && S.round > p.shadyFrom) {
    const roll = d6(S.seed, `shady${s}${S.round}`);
    sc.inspection = { roll, caught: roll === 1 };
    info.push({ k: 'inspect', ...sc.inspection });
  }
  if (ev === 'weather' || ev === 'protest') { sc.fewer = C.fewer; info.push({ k: 'event', ev, n: C.fewer }); }
  // Word of mouth from stars
  const diff = p.stars - CFG.startStars;
  let repGain = 0, repLoss = 0;
  if (diff > 0) for (let i = 0; i < diff * CFG.rep.perStar; i++) {
    const roll = d100(), need = Math.round(CFG.rep.chance * 100), ok = roll <= need;
    if (ok) repGain++; info.push({ k: 'rep', roll, need, ok });
  }
  if (diff < 0) for (let i = 0; i < -diff * CFG.rep.perStar; i++) {
    const roll = d100(), need = Math.round(CFG.rep.loseChance * 100), ok = roll <= need;
    if (ok) repLoss++; info.push({ k: 'lose', roll, need, ok });
  }
  // Flip every card in front of this shop, in a shuffled order. Groups keep `from` so the page can colour the guests.
  const cards = shuffle([...mine.map(id => ({ id, from: 'self' })), ...theirs.map(id => ({ id, from: 'rival' }))], r);
  let minus = 0;
  const groups = sc.groups;
  for (const c of cards) {
    const a = A[c.id], f = { k: 'card', id: c.id, from: c.from, n: 0 };
    const add = (n, price, extra = {}) => groups.push({ n, price, src: c.id, from: c.from, ...extra });
    switch (c.id) {
      case 'flyer': case 'wom': case 'swamp': f.n = a.n; add(a.n, L.price); break;
      case 'coupon': case 'lunch': f.n = a.n; add(a.n, L.price - a.off); break;
      case 'delivery': f.n = a.n; add(a.n, L.price, { noTable: true }); break;
      case 'subway': f.n = r() < a.lowChance ? a.low : a.n; f.low = f.n < a.n; add(f.n, L.price); break;
      case 'bus': f.n = r() < a.chance ? a.n : 0; if (f.n) add(f.n, L.price); break;
      case 'blogger': f.n = r() < a.chance ? a.n : 0; sc.blogger = f.n > 0; if (f.n) add(f.n, L.price); break;
      case 'stall': f.n = a.n; f.food = a.food; sc.stallFood += a.food; add(a.n, L.price); break;
      case 'review': f.n = -a.n; minus += a.n; break;
      case 'poach': f.n = -a.n; minus += a.n; break;
      case 'corner': f.extra = a.extra; sc.cornered = true; break;
    }
    info.push(f);
  }
  if (S.reveals[s].rival.includes('poach')) { info.push({ k: 'poached', n: A.poach.n }); groups.push({ n: A.poach.n, price: L.price, src: 'poached', from: 'self' }); }
  const base = Math.max(0, CFG.baseDemand + repGain - repLoss - sc.fewer - minus);
  // Walk-ins: regulars plus old word-of-mouth guests (plain colour)
  sc.walkins = base + p.wom;
  sc.repGain = repGain; sc.repLoss = repLoss; sc.base = base;
  sc.tableGuests = sc.walkins + groups.filter(g => !g.noTable).reduce((a, g) => a + g.n, 0);
  sc.orders = groups.filter(g => g.noTable).reduce((a, g) => a + g.n, 0);
  sc.plates = p.ingr + sc.stallFood; sc.price = L.price;
  sc.staff = p.staff.slice();
  // Mid-service events: a pop-up during service
  if (ev === 'food' || ev === 'fight' || ev === 'propose') sc.mid = ev;
  sc.proposeOk = ev === 'propose' && sc.rolls.propose < C.propose;
  return sc;
}

// The highest the night can pay: every guest at their own price
function maxSales(sc, served, delivered) {
  const prices = [];
  const L = sc.price;
  for (let i = 0; i < sc.walkins; i++) prices.push(L);
  for (const g of sc.groups) if (!g.noTable) for (let i = 0; i < g.n; i++) prices.push(g.price);
  prices.sort((a, b) => b - a);
  const dp = sc.groups.filter(g => g.noTable).flatMap(g => Array(g.n).fill(g.price)).sort((a, b) => b - a);
  return prices.slice(0, served).reduce((a, x) => a + x, 0) + dp.slice(0, delivered).reduce((a, x) => a + x, 0);
}

// Checks the night the page played (`res`) against today's script and books it. Anything impossible is cut back.
//   res = { served, delivered, unhappy, earned, rushN, food: 'give'|'refuse'|null }
function finishService(S, s, res) {
  const p = S.players[s], sc = S.script[s], C = CFG.service;
  const R = res && typeof res === 'object' ? res : {};
  const give = sc.mid === 'food' && R.food === 'give' && sc.plates + intIn(R.rushN, 0, 60) >= 1;
  // Rush plates must be paid for with cash on hand (the page stops you otherwise); cut back any you couldn't afford
  let rushN = intIn(R.rushN, 0, 60), cost = 0, cash = p.cash;
  for (let i = 0; i < rushN; i++) { const c = opPrice(S, s, i); if (cash - cost < c) { rushN = i; break; } cost += c; }
  const plates = sc.plates + rushN - (give ? 1 : 0);
  const delivered = Math.min(intIn(R.delivered, 0, sc.orders), plates);
  const served = Math.min(intIn(R.served, 0, sc.tableGuests), plates - delivered);
  const turned = intIn(R.unhappy, 0, sc.tableGuests + sc.orders - served - delivered);
  const sales = round2(Math.min(Math.max(0, Number(R.earned) || 0), maxSales(sc, served, delivered)));
  const tip = sc.proposeOk ? C.tip : 0;
  if (rushN) money(p, `Rush plates ×${rushN}`, -cost);
  if (served + delivered) money(p, `Sales (${served + delivered} guests)`, sales);
  if (tip) money(p, 'Proposal tip', tip);
  if (sc.inspection && sc.inspection.caught) money(p, 'Inspector fine', -CFG.shady.fine);
  if (sc.mid === 'fight') note(p, `${Math.min(C.fightStaff, sc.staff.length)} bunnies hurt in a fight (back tomorrow)`);
  if (S.reveals[s].self.includes('wom')) p.wom += CFG.ads.wom.n;
  p.ingr = Math.max(0, plates - served - delivered);
  return { served, delivered, turned, unhappy: turned, sales, tip, rush: { n: rushN, cost }, food: sc.mid === 'food' ? (give ? 'give' : 'refuse') : null,
    fight: sc.mid === 'fight', propose: sc.mid === 'propose' ? sc.proposeOk : null, demand: sc.tableGuests + sc.orders, orders: sc.orders,
    tables: p.tables, staff: sc.staff.length, ingr: p.ingr,
    base: sc.base, repGain: sc.repGain, repLoss: sc.repLoss, inspection: sc.inspection || null, event: sc.event, vouchers: 0 };
}

// A simple stand-in player for tests and fast-forward: serves what the plates allow, rushes nothing
function autoService(S, s) {
  const sc = S.script[s];
  const delivered = Math.min(sc.orders, sc.plates), served = Math.min(sc.tableGuests, sc.plates - delivered);
  return { served, delivered, unhappy: sc.tableGuests + sc.orders - served - delivered, earned: maxSales(sc, served, delivered), rushN: 0, food: sc.mid === 'food' ? 'refuse' : null };
}

function review(S) {
  const C = CFG.service;
  for (const s of SEATS) {
    const p = S.players[s], v = S.service[s], sc = S.script[s];
    const unv = v.turned - v.vouchers;
    let delta = v.turned === 0 ? 1 : unv === 0 ? 0 : unv <= 3 ? -1 : -2;
    const why = [];
    if (v.turned === 0) why.push('served everyone +1');
    else if (unv > 0) why.push(`turned away ${unv} ${unv <= 3 ? '−1' : '−2'}`);
    if (v.inspection && v.inspection.caught) { delta -= 1; why.push('inspector −1'); p.shadyFrom = null; }
    if (v.food === 'give' && sc.rolls.food < C.foodGood) { delta += 1; why.push('kindness paid off +1'); }
    if (v.food === 'refuse' && sc.rolls.food < C.foodBad) { delta -= 1; why.push('word got out you said no −1'); }
    if (sc.blogger && v.turned === 0 && sc.rolls.blogger < CFG.ads.blogger.star) { delta += 1; why.push('blogger loved it +1'); }
    delta = Math.max(-2, Math.min(2, delta));
    const before = p.stars;
    p.stars = Math.max(1, Math.min(5, p.stars + delta));
    // Stars pay out every day (and count again in the final score)
    v.starPay = round2(p.stars * CFG.starValue);
    money(p, `Stars ×${p.stars}`, v.starPay);
    const spoiled = Math.max(0, p.ingr);
    if (spoiled) note(p, `${spoiled} food spoiled`);
    p.ingr = 0;
    v.starsBefore = before; v.starsAfter = p.stars; v.why = why; v.spoiled = spoiled;
    const income = round2(p.ledger.filter(x => x.amt > 0).reduce((a, x) => a + x.amt, 0));
    const spend = round2(p.ledger.filter(x => x.amt < 0).reduce((a, x) => a + x.amt, 0));
    p.history.push({ round: S.round, demand: v.demand, cap: v.served + v.delivered, served: v.served + v.delivered, turned: v.turned,
      spoiled, income, spend, cash: p.cash, stars: p.stars, staff: v.staff, ledger: p.ledger.slice() });
  }
  S.phase = 'report';
}

function finish(S, reason) {
  const score = {};
  for (const s of SEATS) {
    const p = S.players[s];
    score[s] = { cash: p.cash, stars: p.stars, starPts: p.stars * CFG.starValue,
      loan: p.loan ? -CFG.loan.repay : 0, total: round2(p.cash + p.stars * CFG.starValue - (p.loan ? CFG.loan.repay : 0)) };
  }
  let winner;
  if (reason === 'bankrupt') {
    const b1 = S.players.p1.bankrupt, b2 = S.players.p2.bankrupt;
    winner = b1 && b2 ? (score.p1.total === score.p2.total ? 'draw' : score.p1.total > score.p2.total ? 'p1' : 'p2') : b1 ? 'p2' : 'p1';
  } else if (score.p1.total !== score.p2.total) winner = score.p1.total > score.p2.total ? 'p1' : 'p2';
  else if (S.players.p1.stars !== S.players.p2.stars) winner = S.players.p1.stars > S.players.p2.stars ? 'p1' : 'p2';
  else winner = 'draw';
  S.result = { reason, score, winner };
  S.phase = 'over';
}

function expected(S) {
  const r = S.round, need = { p1: null, p2: null };
  switch (S.phase) {
    case 'pick': need.p1 = need.p2 = '0:pick'; break;
    case 'morning': need.p1 = need.p2 = `${r}:morning`; break;
    case 'invest': need.p1 = need.p2 = `${r}:invest`; break;
    case 'market': need.p1 = need.p2 = `${r}:market`; break;
    case 'commit': need.p1 = need.p2 = `${r}:commit`; break;
    case 'reveal': need.p1 = need.p2 = `${r}:reveal`; break;
    case 'service': need.p1 = need.p2 = `${r}:service`; break;
    case 'voucher':
      for (const s of SEATS) if (S.service[s].turned > 0 && S.players[s].cash >= CFG.voucher) need[s] = `${r}:voucher`;
      break;
    case 'report': need.p1 = need.p2 = `${r}:next`; break;
  }
  return need;
}

// After the Market: flip the cards placed this morning, or straight to service on days before CFG.adsFrom
function afterMarket(S) {
  if (S.round >= CFG.adsFrom) { S.phase = 'reveal'; return; }
  S.commits = {}; S.reveals = {};
  for (const s of SEATS) S.reveals[s] = { self: [], rival: [], ok: true };
  toService(S);
}
function toService(S) {
  for (const s of SEATS) S.script[s] = prepService(S, s);
  S.service = null;
  S.phase = 'service';
}

function validCards(list, allowed) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const id of list) { if (!allowed.includes(id) || out.includes(id)) return null; out.push(id); }
  return out;
}

function apply(S, got) {
  const r = S.round;
  switch (S.phase) {
    case 'pick': {
      for (const s of SEATS) {
        const p = S.players[s], loc = got[s].loc === 'city' ? 'city' : 'country', L = CFG.loc[loc];
        p.loc = loc; p.tables = L.tables; p.cash -= L.open;
        p.history = [];
      }
      startRound(S); break;
    }
    case 'morning':
      if (r >= CFG.adsFrom) { for (const s of SEATS) S.shops[s] = shopFor(S, s); S.phase = 'commit'; }
      else S.phase = 'invest';
      break;
    case 'invest': {
      for (const s of SEATS) {
        const p = S.players[s], a = got[s], e = S.events[s];
        if (e.type === 'shady') {
          e.choice = a.choice === 'accept' ? 'accept' : 'decline';
          // A second deal while one is still active keeps the original start day, so it can't skip a day's inspection
          if (e.choice === 'accept') { money(p, 'Shady deal', CFG.shady.cash); if (p.shadyFrom === null) p.shadyFrom = r; }
        }
        if (a.loan && CFG.loan.enabled && !p.loan) { p.loan = true; money(p, 'Loan', CFG.loan.amount); }
        // Staff: a list of section numbers. New hires are dropped if there isn't enough cash for their wages.
        const nSec = sectionsOf(p), want = [];
        for (const raw of Array.isArray(a.staff) ? a.staff : []) { const i = Number(raw); if (Number.isInteger(i) && i >= 0 && i < nSec && !want.includes(i)) want.push(i); }
        const kept = want.filter(i => p.staff.includes(i)), added = want.filter(i => !p.staff.includes(i));
        const cash0 = p.cash;
        while (added.length && staffCost(p, kept.length + added.length, cash0) > Math.max(0, cash0)) added.pop();
        // Goodbye pay you can't afford: those bunnies stay (the page stops you before this happens)
        for (const i of p.staff) {
          if (staffCost(p, kept.length + added.length, cash0) <= Math.max(0, cash0) || kept.length + added.length >= p.staff.length) break;
          if (!kept.includes(i)) kept.push(i);
        }
        const fired = Math.max(0, p.staff.length - kept.length - added.length), sev = severance(p, fired, cash0);
        p.staff = [...kept, ...added].sort((x, y) => x - y);
        if (fired) money(p, `Severance ×${fired}`, -sev);
        if (p.staff.length) money(p, `Wages ×${p.staff.length}`, -p.staff.length * wageOf(p));
      }
      // Day 1 skips the Market (the free food is already in the kitchen)
      if (r === 1 && CFG.freeFood) afterMarket(S);
      else startMarket(S);
      break;
    }
    case 'market': {
      // Who got which item was settled live (first click wins). If both logs somehow claim one item, P1 keeps it.
      const m = S.market, M = CFG.market;
      for (const s of SEATS) {
        const p = S.players[s], b = { exp: 0, today: 0, tomorrow: 0, spent: 0, items: [] };
        for (const raw of Array.isArray(got[s].buys) ? got[s].buys : []) {
          const i = intIn(raw, -1, m.items.length - 1);
          if (i < 0 || m.owner[i]) continue;
          const it = m.items[i], price = itemPrice(it);
          if (p.cash < price) continue;
          m.owner[i] = s; p.cash = round2(p.cash - price); b.spent += price; b.items.push(i);
          if (it.t === 'exp') { b.exp += it.n; p.ingr += it.n; }
          else if (r < CFG.rounds && regTomorrow(S.seed, r, i)) { b.tomorrow += it.n; p.pending += it.n; }
          else { b.today += it.n; p.ingr += it.n; }
        }
        if (b.exp) p.ledger.push({ label: `Express food ×${b.exp}`, amt: -b.exp * M.exp.price });
        if (b.today + b.tomorrow) p.ledger.push({ label: `Regular food ×${b.today + b.tomorrow}${b.tomorrow ? ` (${b.tomorrow} tomorrow)` : ''}`, amt: -(b.today + b.tomorrow) * M.reg.price });
        m.bought[s] = b;
      }
      afterMarket(S); break;
    }
    case 'commit': {
      S.commits = {}; S.reveals = {};
      for (const s of SEATS) {
        const a = got[s], sh = S.shops[s];
        const p = S.players[s], cost = Math.min(intIn(a.cost, 0, 999), Math.max(0, Math.floor(p.cash)));
        S.commits[s] = { h: String(a.h), nSelf: intIn(a.nSelf, 0, sh.self.length), nRival: intIn(a.nRival, 0, sh.rival.length), cost };
        if (cost) money(p, `Ads ×${S.commits[s].nSelf + S.commits[s].nRival}`, -cost);
      }
      S.phase = 'invest'; break;   // staff and market next; the cards flip after the market
    }
    case 'reveal': {
      for (const s of SEATS) {
        const p = S.players[s], a = got[s], cm = S.commits[s], sh = S.shops[s];
        let c = { self: validCards(a.self, sh.self), rival: validCards(a.rival, sh.rival) };
        let ok = !!(c.self && c.rival) && adHash(c, a.salt) === cm.h && c.self.length === cm.nSelf && c.rival.length === cm.nRival && adCost(c) === cm.cost;
        // A failed check (wrong cards, or a price that doesn't match what was paid) makes every ad do nothing, and the money comes back
        if (!ok) { c = { self: [], rival: [] }; if (cm.cost) money(p, 'Ads refunded', cm.cost); }
        S.reveals[s] = { ...c, ok };
      }
      toService(S); break;
    }
    case 'service': {
      S.service = {};
      for (const s of SEATS) S.service[s] = finishService(S, s, got[s].res);
      const needV = SEATS.some(s => S.service[s].turned > 0 && S.players[s].cash >= CFG.voucher);
      if (needV) S.phase = 'voucher'; else review(S);
      break;
    }
    case 'voucher': {
      for (const s of SEATS) {
        if (!got[s]) continue;
        const p = S.players[s], v = S.service[s];
        const n = Math.min(intIn(got[s].n, 0, v.turned), Math.floor(p.cash / CFG.voucher));
        if (n) { money(p, `Comp vouchers ×${n}`, -n * CFG.voucher); v.vouchers = n; }
      }
      review(S); break;
    }
    case 'report': {
      if (r >= CFG.rounds) finish(S, 'done'); else startRound(S);
      break;
    }
  }
}

function simulate(seed, logs) {
  const S = init(seed), ptr = { p1: 0, p2: 0 };
  const take = (seat, key) => {
    const L = logs[seat] || [];
    while (ptr[seat] < L.length) { const a = L[ptr[seat]++]; if (a && a.k === key) return a; }
    return null;
  };
  for (let guard = 0; guard < 500 && S.phase !== 'over'; guard++) {
    const need = expected(S);
    for (const s of SEATS) if (need[s] && !S.got[s]) { const a = take(s, need[s]); if (a) S.got[s] = a; }
    if (SEATS.every(s => !need[s] || S.got[s])) { const g = S.got; S.got = {}; apply(S, g); continue; }
    break;
  }
  const need = expected(S);
  S.waiting = { p1: need.p1 && !S.got.p1 ? need.p1 : null, p2: need.p2 && !S.got.p2 ? need.p2 : null };
  S.submitted = { p1: !!(need.p1 && S.got.p1), p2: !!(need.p2 && S.got.p2) };
  return S;
}

if (typeof module !== 'undefined') module.exports = { CFG, simulate, adHash, adCost, capacityOf, expectedDemand, expected,
  marketItems, itemPrice, regTomorrow, opPrice, rushBase, staffCost, severance, netWorth, wageOf, sectionsOf, autoService };
