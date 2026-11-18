const E = require('../engine.js');
function bot(S, seat, rnd, priv) {
  const k = S.waiting[seat];
  const pickSome = list => list.filter(() => rnd() < 0.4);
  switch (S.phase) {
    case 'pick': return { k, loc: rnd() < 0.5 ? 'city' : 'country' };
    case 'morning': return { k };
    case 'invest': {
      // Keep, hire or let go some bunnies (sometimes junk section numbers)
      const n = E.sectionsOf(S.players[seat]), staff = S.players[seat].staff.filter(() => rnd() < 0.8);
      for (let i = 0; i < 3; i++) if (rnd() < 0.5) staff.push(Math.floor(rnd() * (n + 2)) - 1);
      return { k, staff, choice: rnd() < .5 ? 'accept' : 'decline', loan: rnd() < 0.1 };
    }
    case 'market': {
      // Random items; sometimes both bots claim the same one (the engine must sort it out)
      const buys = [];
      for (let i = 0; i < E.CFG.market.stock; i++) if (rnd() < 0.15) buys.push(i);
      return { k, buys };
    }
    case 'commit': {
      const sh = S.shops[seat], c = { self: pickSome(sh.self), rival: pickSome(sh.rival) }, salt = String(rnd());
      priv[seat] = { ...c, salt };
      return { k, h: E.adHash(c, salt), nSelf: c.self.length, nRival: c.rival.length, cost: E.adCost(c), bump: E.adBump(S.seed, S.round, seat, c.rival) };
    }
    case 'reveal': return { k, ...(rnd() < 0.03 ? { ...priv[seat], self: ['flyer'] } : priv[seat]) };
    case 'service': {
      // A plausible night, sometimes with impossible numbers the engine must cut back
      const res = E.autoService(S, seat);
      if (rnd() < 0.3) res.rushN = Math.floor(rnd() * 5);
      if (rnd() < 0.3) res.served += Math.floor(rnd() * 3);
      if (rnd() < 0.05) Object.assign(res, { served: 999, earned: 1e6, unhappy: -4, rushN: 'x' });
      if (S.script[seat].mid === 'food') res.food = rnd() < 0.5 ? 'give' : 'refuse';
      return { k, res };
    }
    case 'voucher': return { k, n: Math.floor(rnd() * 3) };
    case 'report': return { k };
  }
}
let mul = 7, wins = { p1: 0, p2: 0, draw: 0 }, reasons = {}, stats = { turned: 0, served: 0, days: 0, robbed: 0 };
const rnd = () => { mul = (mul * 16807) % 2147483647; return mul / 2147483647; };
for (let g = 0; g < 2000; g++) {
  const seed = 'seed' + g, logs = { p1: [], p2: [] }, priv = {};
  let S, steps = 0;
  while (true) {
    S = E.simulate(seed, logs);
    if (S.phase === 'over') break;
    let acted = false;
    for (const s of ['p1', 'p2']) if (S.waiting[s]) {
      const a = bot(S, s, rnd, priv); logs[s].push(a); acted = true;
      if (rnd() < 0.05) logs[s].push({ ...a }); // duplicate submission occasionally
      break; // act one at a time to mimic async
    }
    if (!acted) { console.log('STUCK', seed, S.phase, S.waiting, S.submitted); process.exit(1); }
    if (++steps > 2000) { console.log('LOOP', seed); process.exit(1); }
  }
  wins[S.result.winner]++; reasons[S.result.reason] = (reasons[S.result.reason] || 0) + 1;
  for (const s of ['p1', 'p2']) {
    const p = S.players[s];
    if (p.stars < 1 || p.stars > 5) { console.log('stars', p); process.exit(1); }
    if (p.tables < 0 || p.pending < 0) { console.log('negative', p); process.exit(1); }
    if (p.staff.some(i => i < 0 || i >= E.sectionsOf(p)) || new Set(p.staff).size !== p.staff.length) { console.log('bad staff', p.staff); process.exit(1); }
    for (const h of p.history) if (h.served > h.demand) { console.log('served more than came', h); process.exit(1); }
    for (const h of p.history) { stats.turned += h.turned; stats.served += h.served; stats.days++; }
    for (const h of p.history) for (const l of h.ledger) if (l.label === 'Robbed overnight') stats.robbed++;
  }
  if (g === 3) console.log(JSON.stringify(S.result), S.players.p1.history.map(h => [h.round, h.demand, h.cap, h.served, h.turned, h.cash, h.stars]));
}
console.log(wins, reasons, { avgServed: (stats.served / stats.days).toFixed(2), avgTurned: (stats.turned / stats.days).toFixed(2), robberies: stats.robbed });
// Market conflicts: two players claiming the same item must never both get it
{
  const logs = { p1: [], p2: [] };
  for (const s of ['p1', 'p2']) logs[s].push({ k: '0:pick', loc: 'country' }, { k: '1:invest', staff: [] }, { k: '1:service', res: {} }, { k: '1:voucher', n: 0 }, { k: '1:next' }, { k: '2:morning' }, { k: '2:invest', staff: [] }, { k: '2:market', buys: [0, 1, 2] });
  const S = E.simulate('conflict', logs), b = S.market.bought;
  if (S.round !== 2) { console.log('market conflict: did not reach day 2', S.round, S.phase); process.exit(1); }
  if (b.p1.items.length !== 3 || b.p2.items.length !== 0) { console.log('market conflict wrong', b); process.exit(1); }
  console.log('market conflict OK');
  // Day 1: no Market, free food in the kitchen
  const D = E.simulate('day1', { p1: [{ k: '0:pick', loc: 'city' }, { k: '1:invest', staff: [0, 1, 1, 99] }], p2: [{ k: '0:pick', loc: 'country' }, { k: '1:invest', staff: [] }] });
  if (D.phase !== 'service' || D.players.p1.ingr !== E.CFG.freeFood) { console.log('day 1 free food wrong', D.phase, D.players.p1.ingr); process.exit(1); }
  const L = E.CFG.loc.city, w = E.CFG.staff.wage.city;
  if (D.players.p1.staff.join() !== '0,1' || D.players.p1.cash !== E.CFG.startCash - L.open - L.rent - 2 * w) { console.log('day 1 hiring wrong', D.players.p1.staff, D.players.p1.cash); process.exit(1); }
  console.log('day 1 free food + hiring OK');
  // Letting a bunny go costs severance; days 1-2 have no Ads step, day 3 does
  const H = { p1: [{ k: '0:pick', loc: 'country' }, { k: '1:invest', staff: [0, 1, 2] }, { k: '1:service', res: {} }, { k: '1:voucher', n: 0 }, { k: '1:next' }, { k: '2:morning' }, { k: '2:invest', staff: [1, 2] }],
    p2: [{ k: '0:pick', loc: 'country' }, { k: '1:invest', staff: [] }, { k: '1:service', res: {} }, { k: '1:voucher', n: 0 }, { k: '1:next' }, { k: '2:morning' }, { k: '2:invest', staff: [] }] };
  const S2 = E.simulate('fire', H), led = S2.players.p1.ledger;
  const pre = E.simulate('fire', { p1: H.p1.slice(0, -1), p2: H.p2.slice(0, -1) }).players.p1;
  if (!led.some(l => l.label === 'Severance ×1' && l.amt === -E.severance(pre, 1)) || !led.some(l => l.label === 'Wages ×2')) { console.log('severance wrong', led, E.severance(pre, 1)); process.exit(1); }
  // Goodbye pay you can't afford (2 of 3 bunnies: more than your cash) keeps the bunnies you can't pay to let go
  const H2 = { p1: H.p1.slice(0, -1).concat({ k: '2:invest', staff: [2] }), p2: H.p2 };
  const tooMuch = E.simulate('fire', H2).players.p1;
  if (E.severance(pre, 2) <= pre.cash || tooMuch.staff.length !== 2 || tooMuch.cash < 0) { console.log('unaffordable severance wrong', E.severance(pre, 2), pre.cash, tooMuch.staff, tooMuch.cash); process.exit(1); }
  // The team's worked examples (playtest Nov 15): $6 pay, net worth $245
  const team = n => ({ loc: 'country', stars: 0, cash: 245, staff: [...Array(n).keys()] });
  const ex = [[team(7), 1, 24.5], [team(7), 2, 53.9], [team(15), 1, 10.5]];
  for (const [tp, k, want] of ex) if (E.severance(tp, k) !== want) { console.log('severance formula wrong', tp.staff.length, k, E.severance(tp, k), 'want', want); process.exit(1); }
  for (const s of ['p1', 'p2']) H[s].push({ k: '2:market', buys: [] }, { k: '2:service', res: {} }, { k: '2:voucher', n: 0 }, { k: '2:next' }, { k: '3:morning' });
  const S3 = E.simulate('fire', H);
  if (S2.phase !== 'market' || S3.round !== 3 || S3.phase !== 'commit') { console.log('ads day wrong', S2.phase, S3.round, S3.phase); process.exit(1); }
  // Day 3: Ads first, then staff and market, then the flip
  for (const s of ['p1', 'p2']) H[s].push({ k: '3:commit', h: E.adHash({ self: [], rival: [] }, 'x'), nSelf: 0, nRival: 0 }, { k: '3:invest', staff: [] }, { k: '3:market', buys: [] });
  const S4 = E.simulate('fire', H);
  if (S4.phase !== 'reveal') { console.log('ads first: no flip after the market', S4.phase); process.exit(1); }
  console.log('severance + ads first from day 3 OK');
}
// Determinism and money checks: the same logs must always give the same result, and cash has at most 2 decimals.
{
  const logs = { p1: [], p2: [] }, priv = {}; let S;
  mul = 99;
  while (true) { S = E.simulate('det', logs); if (S.phase === 'over') break;
    for (const s of ['p1', 'p2']) if (S.waiting[s]) { logs[s].push(bot(S, s, rnd, priv)); break; } }
  const again = E.simulate('det', JSON.parse(JSON.stringify(logs)));
  if (JSON.stringify(again.result) !== JSON.stringify(S.result)) { console.log('NOT DETERMINISTIC'); process.exit(1); }
  for (const s of ['p1', 'p2']) for (const h of S.players[s].history) if (Math.abs(Math.round(h.cash * 100) - h.cash * 100) > 1e-6) { console.log('cash decimals', h.cash); process.exit(1); }
  console.log('determinism + cash OK', JSON.stringify(S.result.score.p1));
}
// Shady deal taken twice: the second deal must keep the original start day, so the inspector still checks
// on the day of the second deal (before the fix, taking it again skipped that day's inspection).
{
  const plain = (S, s) => {
    const k = S.waiting[s];
    switch (S.phase) {
      case 'pick': return { k, loc: 'country' };
      case 'invest': return { k, staff: [], choice: S.events[s].type === 'shady' ? 'accept' : 'decline' };
      case 'market': return { k, buys: s === 'p1' ? [0, 2, 4] : [1, 3, 5] };
      case 'commit': return { k, h: E.adHash({ self: [], rival: [] }, 'x'), nSelf: 0, nRival: 0 };
      case 'reveal': return { k, self: [], rival: [], salt: 'x' };
      case 'service': return { k, res: E.autoService(S, s) };
      case 'voucher': return { k, n: 0 };
      default: return { k };
    }
  };
  let tested = 0;
  for (let i = 0; i < 400 && tested < 20; i++) {
    const seed = 'shady' + i, deck = E.simulate(seed, { p1: [], p2: [] }).decks.p1.slice(0, E.CFG.rounds);
    const days = deck.map((t, d) => (t === 'shady' ? d + 1 : 0)).filter(Boolean);
    if (days.length < 2) continue;
    const [first, second] = days;
    const logs = { p1: [], p2: [] }; let S;
    for (let g = 0; g < 400; g++) {
      S = E.simulate(seed, logs);
      if (S.phase === 'over' || (S.phase === 'service' && S.round === second)) break;
      const s = S.waiting.p1 ? 'p1' : S.waiting.p2 ? 'p2' : null; if (!s) break;
      logs[s].push(plain(S, s));
    }
    if (S.phase !== 'service' || S.round !== second) continue;                   // went broke first
    const caught = S.players.p1.history.some(h => h.ledger.some(l => l.label === 'Inspector fine'));
    if (caught) continue;                                                         // caught before the second offer: a fresh start is correct
    const p = S.players.p1;
    if (p.shadyFrom !== first) { console.log('shady: start day moved', { seed, first, second, shadyFrom: p.shadyFrom }); process.exit(1); }
    if (!S.script.p1.inspection) { console.log('shady: no inspection on the day of the second deal', { seed, first, second }); process.exit(1); }
    if (!p.ledger.some(l => l.label === 'Shady deal' && l.amt === E.CFG.shady.cash)) { console.log('shady: second deal not paid', { seed }); process.exit(1); }
    tested++;
  }
  if (!tested) { console.log('shady: found no game with two shady deals to test'); process.exit(1); }
  console.log(`shady deal taken twice OK (${tested} games)`);
}

// Playtest Nov 15 rules: rush = half the meal price, stars pay out every day, the market is a grid of 24 bundles
{
  const C = E.CFG;
  // Rush plates: half of what the guest pays (Countryside $5, City $6), +$3 with the rival's corner card
  if (E.rushBase({ loc: 'country' }) !== 5 || E.rushBase({ loc: 'city' }) !== 6) { console.log('rush price wrong', E.rushBase({ loc: 'country' }), E.rushBase({ loc: 'city' })); process.exit(1); }
  const fake = { players: { p1: { loc: 'city' } }, script: { p1: { cornered: true } } };
  if (E.opPrice(fake, 'p1', 0) !== 6 + C.ads.corner.extra) { console.log('cornered rush price wrong', E.opPrice(fake, 'p1', 0)); process.exit(1); }
  // Bundles: the team's sizes, 24 in all, in different spots on different days; the last day is all Express
  const sizes = items => items.filter(it => it.t === 'reg').map(it => it.n).sort((x, y) => y - x).join() + '|' + items.filter(it => it.t === 'exp').map(it => it.n).sort((x, y) => y - x).join();
  const d2 = E.marketItems('bund', 2), d3 = E.marketItems('bund', 3), d5 = E.marketItems('bund', C.rounds);
  if (d2.length !== 24 || sizes(d2) !== '10,7,5,5,3,3,3,2,2,2,2,2|9,6,4,4,2,2,2,1,1,1,1,1') { console.log('bundles wrong', sizes(d2)); process.exit(1); }
  if (JSON.stringify(d2) === JSON.stringify(d3)) { console.log('bundles are in the same spots two days running'); process.exit(1); }
  if (d5.length !== 24 || d5.some(it => it.t !== 'exp')) { console.log('last day should be all Express', d5); process.exit(1); }
  // Buying a bundle: plates × price per plate, and all its plates arrive together
  const L = { p1: [{ k: '0:pick', loc: 'country' }, { k: '1:invest', staff: [] }, { k: '1:service', res: {} }, { k: '1:voucher', n: 0 }, { k: '1:next' }, { k: '2:morning' }, { k: '2:invest', staff: [] }],
    p2: [{ k: '0:pick', loc: 'country' }, { k: '1:invest', staff: [] }, { k: '1:service', res: {} }, { k: '1:voucher', n: 0 }, { k: '1:next' }, { k: '2:morning' }, { k: '2:invest', staff: [] }] };
  const before = E.simulate('bund', L), items = before.market.items, big = items.findIndex(it => it.t === 'exp' && it.n === 9);
  L.p1.push({ k: '2:market', buys: [big] }); L.p2.push({ k: '2:market', buys: [] });
  const after = E.simulate('bund', L), b = after.market.bought.p1;
  if (b.exp !== 9 || b.spent !== 9 * C.market.exp.price || after.players.p1.cash !== before.players.p1.cash - 9 * C.market.exp.price) { console.log('bundle purchase wrong', b, before.players.p1.cash, after.players.p1.cash); process.exit(1); }
  // Stars pay out at the end of every day: a "Stars ×n" line worth n × starValue in each day's ledger
  const logs = { p1: [], p2: [] }, priv = {}, rnd = (() => { let x = 7; return () => (x = (x * 16807) % 2147483647) / 2147483647; })();
  let S;
  for (let g = 0; g < 400; g++) { S = E.simulate('stars', logs); if (S.phase === 'over') break; for (const s of ['p1', 'p2']) if (S.waiting[s]) { logs[s].push(bot(S, s, rnd, priv)); break; } }
  for (const s of ['p1', 'p2']) for (const h of S.players[s].history) {
    const line = h.ledger.find(l => /^Stars ×\d$/.test(l.label));
    if (!line || line.amt !== h.stars * C.starValue) { console.log('daily star pay wrong', s, h.round, h.stars, line); process.exit(1); }
  }
  console.log('rush price + bundles + daily star pay OK');
}

// Playtest Nov 17: False advertisement and Swamp them make the rival expect 2–5 more guests until the cards flip
{
  const C = E.CFG, seen = new Set();
  for (let i = 0; i < 200; i++) for (const id of ['fake', 'swamp']) {
    const n = E.adBump('look' + i, 3, 'p1', [id]); seen.add(n);
    if (n < 2 || n > 5) { console.log('bump out of range', id, n); process.exit(1); }
  }
  if (seen.size !== 4) { console.log('bump should take every value 2–5', [...seen]); process.exit(1); }
  if (E.adBump('x', 3, 'p1', ['review', 'poach', 'corner']) !== 0) { console.log('only fake and swamp should look like guests'); process.exit(1); }
  const p = { stars: C.startStars, wom: 0 }, e0 = E.expectedDemand(p), e1 = E.expectedDemand(p, [], 4);
  if (e1.total !== e0.total + 4 || e1.min !== e0.min + 4 || e1.max !== e0.max + 4) { console.log('expected guests should include the bump', e0, e1); process.exit(1); }
  // A commit whose bump doesn't match the revealed cards: the ads do nothing and the money comes back
  const play = (seed, bumpFix) => {
    const logs = { p1: [], p2: [] }, salt = 's';
    let S, c = { self: [], rival: [] };
    for (let g = 0; g < 80; g++) {
      S = E.simulate(seed, logs); if (S.phase === 'service' && S.round === C.adsFrom) break;
      const s = S.waiting.p1 ? 'p1' : 'p2', k = S.waiting[s];
      if (S.phase === 'commit' && s === 'p1') c = S.shops.p1.rival.includes('fake') ? { self: [], rival: ['fake'] } : { self: [], rival: [] };
      const mine = s === 'p1' ? c : { self: [], rival: [] };
      const a = { pick: { k, loc: 'country' }, morning: { k }, invest: { k, staff: [] }, market: { k, buys: [] }, voucher: { k, n: 0 }, report: { k }, service: { k, res: {} },
        commit: { k, h: E.adHash(mine, salt), nSelf: 0, nRival: mine.rival.length, cost: E.adCost(mine), bump: E.adBump(S.seed, S.round, s, mine.rival) + (s === 'p1' ? bumpFix : 0) },
        reveal: { k, ...mine, salt } }[S.phase];
      logs[s].push(a);
    }
    return S;
  };
  let seed = null;
  for (let i = 0; i < 300 && !seed; i++) { const S = play('fk' + i, 0); if (S.reveals && S.reveals.p1.rival.includes('fake')) seed = 'fk' + i; }
  if (!seed) { console.log('no seed with a fake card in the shop'); process.exit(1); }
  const good = play(seed, 0), bad = play(seed, 1);
  if (!good.reveals.p1.ok || !good.commits.p1.bump) { console.log('honest bump should pass', good.commits.p1, good.reveals.p1); process.exit(1); }
  if (bad.reveals.p1.ok || bad.reveals.p1.rival.length || bad.players.p1.cash !== good.players.p1.cash + C.ads.fake.price) { console.log('wrong bump should cancel the ads and refund', bad.reveals.p1, bad.players.p1.cash, good.players.p1.cash); process.exit(1); }
  console.log('fake ad looks like guests OK');
}
