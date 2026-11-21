
// ---------------- one night of service ----------------
// opts: { loc, day, animal, me, rival, rivalName, price, cash, plates, hired, walkins, groups, notes, event, rushPrice,
//         P, seed, tutorial ('day1' | 'day3' | null), fast, auto, onDone(res) }
function create(host, opts) {
  const P = opts.P, LOC = opts.loc, MC = opts.me, RC = opts.rival, ANIMAL = opts.animal;
  const SPEED0 = opts.fast || 1;
  let speed = 1, alive = true, last = performance.now(), S;
  const RND = opts.tutorial === 'day1' ? mulberry32(P.tutSeed) : mulberry32(hashStr(String(opts.seed)));

  // ---- DOM ----
  const root = document.createElement('div');
  root.className = 'rrsvc';
  root.innerHTML = `<div class="rrsvc-hud">
      <span class="rp"><small>CASH</small><b data-h="cash"></b></span><span class="rp"><small>SERVED</small><b data-h="served">0</b></span>
      <span class="rp bad"><small>LEFT UNHAPPY</small><b data-h="unhappy">0</b></span>
      <span class="rclock"><span class="rtrack" data-h="track"><i data-h="fill"></i></span><b data-h="left"></b></span>
      <span class="rseg"><button type="button" data-spd="1" aria-pressed="true">1×</button><button type="button" data-spd="2" aria-pressed="false">2×</button></span></div>
    <div class="rrsvc-stage"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Your restaurant during service"></svg>
      <div class="rrsvc-toast" style="opacity:0"></div>
      <div class="rrsvc-coach" hidden><span class="step"></span><p></p><div class="row"><button type="button" class="cta inline" data-coach="next" hidden>Next</button></div></div>
      <div class="rrsvc-ov" hidden></div></div>`;
  host.appendChild(root);
  const $ = q => root.querySelector(q), H$ = n => root.querySelector(`[data-h="${n}"]`);
  const svg = $('svg'), ov = $('.rrsvc-ov'), coach = $('.rrsvc-coach');
  const parts = sceneParts(LOC, new Set(opts.hired), 'service', ANIMAL, MC);
  svg.innerHTML = parts.html;
  const tables = parts.tables, sections = parts.sections, L = {};
  ['plates', 'bus', 'seated', 'tplates', 'inj', 'walk', 'over', 'ui'].forEach(n => L[n] = svg.querySelector('.L-' + n));
  const el = (parent, html, attrs = {}) => { const g = document.createElementNS(NS, 'g'); for (const a in attrs) g.setAttribute(a, attrs[a]); g.innerHTML = html; parent.appendChild(g); return g; };

  // ---- helpers shared with the prototype ----
  function region(p) { return p.x < RX ? 'out' : p.x > KX ? 'kit' : 'din'; }
  function anchor(p) { const r = region(p); return r === 'din' ? { x: p.x, y: AYc } : r === 'kit' ? { x: KX + 24, y: AYc } : { x: RX - 20, y: AYc + 6 }; }
  function route(from, to) { const rf = region(from), rt = region(to); if (rf === rt && rf !== 'din') return [to]; return [anchor(from), anchor(to), to]; }
  function moveAlong(e, sp, dt) {
    let d = sp * dt;
    while (d > 0 && e.path.length) {
      const t = e.path[0], dx = t.x - e.x, dy = t.y - e.y, dist = Math.hypot(dx, dy);
      if (dist <= d) { e.x = t.x; e.y = t.y; e.path.shift(); d -= dist; } else { e.x += dx / dist * d; e.y += dy / dist * d; d = 0; }
    }
    return !e.path.length;
  }
  const slotPos = i => ({ x: RX - 46 - (i % 3) * 40, y: QY + Math.floor(i / 3) * 56 + (i % 3 === 1 ? 6 : 0) });
  let toastTimer = 0;
  function toast(msg) { const t = $('.rrsvc-toast'); t.textContent = msg; t.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = 0; }, 2200); }
  const rushCost = () => opts.rushPrice(S.rushed);
  // Food run (Nov 20): the parking spot where the delivery pickup was, the vehicle on it, and where the chef gets on
  const CITY = LOC === 'city', SPOT = { x: KX + 110, y: DY - 6, w: KR - KX - 130, h: 140 }, BIKE = { x: KX + 192, y: DY + 120 }, MOUNT = { x: KX + 156, y: DY + 112 };

  // ---- state ----
  S = { t: 0, cash: opts.cash, earned: 0, spent: 0, tip: 0, served: 0, delivered: 0, unhappy: 0, plates: opts.plates, guests: [], couriers: [], floats: [], popups: [],
    ended: false, open: false, closed: false, nextId: 1, mTime: 0, bus: null, rushed: 0, food: null, modal: null, cards: {}, doneSent: false };
  S.staff = sections.filter(s => s.on).map(s => ({ sec: s, x: s.home.x, y: s.home.y, path: [], task: null, carry: false, node: el(L.walk, '', { 'pointer-events': 'none' }) }));
  S.chef = { x: STOVE.x, y: STOVE.y, path: [], cur: null, queue: [], carry: false, rush: null, mounted: false, node: el(L.walk, '', { 'pointer-events': 'none' }) };
  S.ride = { node: el(L.walk, '', { 'pointer-events': 'none' }), key: '' };

  // ---- tonight's schedule (display timing only; who comes was decided by the engine) ----
  const dl = P.dayLen, sched = [];
  for (let i = 0; i < opts.walkins; i++) sched.push({ t: dl * 0.04 + dl * 0.8 * ((RND() + RND() + i / Math.max(1, opts.walkins) * 2) / 4), kind: 'g', price: opts.price });
  sched.sort((a, b) => a.t - b.t);
  if (sched.length > 1) {
    const t0 = sched[0].t, tN = sched[sched.length - 1].t;
    sched.forEach(e => { e.t = P.first + (e.t - t0) * (tN - P.first) / Math.max(1, tN - t0); });
    const mid = sched[Math.floor(sched.length / 2)].t;
    sched.forEach((e, i) => { if (i && e.t < mid) e.t = Math.min(e.t, sched[i - 1].t + P.gap); });
  } else if (sched.length) sched[0].t = P.first;
  (opts.groups || []).forEach((g, i) => {
    const t = dl * (0.2 + 0.45 * RND());
    if (g.noTable) { for (let k = 0; k < g.n; k++) sched.push({ t: Math.min(dl * 0.85, t + k * dl * 0.3), kind: 'courier', g, first: k === 0 }); }
    else if (g.id === 'bus') sched.push({ t, kind: 'bus', g });
    else sched.push({ t, kind: 'ad', g });
  });
  (opts.notes || []).forEach((n, i) => sched.push({ t: 2 + i * 5.5, kind: 'note', n }));
  if (opts.event) sched.push({ t: dl * 0.45, kind: 'event' });
  S.sched = sched.sort((a, b) => a.t - b.t);
  S.busAt = (S.sched.find(e => e.kind === 'bus') || {}).t;
  S.sched.filter(e => e.kind === 'bus').forEach(e => { const m = document.createElement('span'); m.className = 'ev'; m.style.left = (e.t / dl * 100) + '%'; m.textContent = 'BUS'; H$('track').appendChild(m); });
  drawPlates();

  // ---- spawning ----
  function spawnGuest(col, from, price, card) {
    const g = { id: S.nextId++, col, card, price: price || opts.price, x: from ? from.x : SPAWN.x + (RND() * 30 - 15), y: from ? from.y : SPAWN.y, path: [], state: 'arrive', pat: 0, table: null, claimed: null, node: el(L.walk, ''), ring: el(L.over, ''), key: '' };
    g.node.setAttribute('data-click', 'g' + g.id); g.node.classList.add('click');
    S.guests.push(g); return g;
  }
  const colFor = g => (g.from === 'rival' ? RC : MC);
  function cardStat(name, n, kind) { S.cards[name] = S.cards[name] || { came: 0, served: 0, kind }; S.cards[name].came += n; }
  function spawnCourier(g) {
    const c = { id: S.nextId++, card: g.name, price: g.price || opts.price, x: KR + 30, y: DROP.y + 36, path: [{ x: KX + 250, y: DROP.y + 36 }], state: 'in', pat: P.cPat, node: el(L.walk, ''), ring: el(L.over, ''), key: '' };
    c.node.setAttribute('data-click', 'c' + c.id); c.node.classList.add('click');
    S.couriers.push(c); cardStat(g.name, 1, 'orders');
  }
  function popup(name, line, side) { S.popups.push({ name, line, side, t: 5 }); }

  // ---- chef actions ----
  function enqueue(a) {
    const ch = S.chef;
    if (a.type === 'rush' && S.cash < rushCost()) return toast(`Not enough cash to rush ($${rushCost()})`);
    const same = x => x && x.type === a.type && x.target === a.target;
    const tut = tutAction(a);
    if (tut === 'blocked') return toast('Try the highlighted one first');
    if (same(ch.cur)) return;
    if (tut === 'match' && ch.cur && ch.cur.type !== 'rush') { ch.queue = ch.queue.filter(x => !same(x)); ch.queue.unshift(a); return; }
    if (ch.queue.some(same)) return;
    if (ch.cur && ch.cur.type === 'rush' && a.type !== 'rush') { ch.cur = null; ch.path = []; }
    if (!ch.cur) startAction(a); else if (ch.queue.length < 3) ch.queue.push(a); else toast('You already have 3 jobs lined up');
  }
  function startAction(a) {
    const ch = S.chef; ch.cur = a; a.phase = 0;
    if (a.type !== 'rush' && ch.mounted) { ch.mounted = false; ch.x = MOUNT.x; ch.y = MOUNT.y; }
    if (a.type === 'home') { ch.path = route(ch, STOVE); return; }
    if (a.type === 'seat') {
      const g = a.target;
      if (g.state !== 'queue' || g.claimed) return done();
      const t = tables.find(t => !t.staffed && !t.guest && !t.reserved) || tables.find(t => !t.guest && !t.reserved);
      if (!t) { toast('No free table right now'); return done(); }
      t.reserved = g; g.claimed = ch; a.table = t; ch.path = route(ch, DOOR_IN);
    } else if (a.type === 'serve' || a.type === 'deliver') {
      const g = a.target;
      if (g.state !== 'wait' || g.server) return done();
      if (S.plates <= 0) { toast(`No plates left. Click the ${CITY ? 'scooter' : 'bike'} to rush out for ingredients.`); return done(); }
      S.plates--; drawPlates(); g.server = ch; ch.path = route(ch, PICK);
    } else if (a.type === 'rush') ch.path = ch.mounted ? [] : route(ch, MOUNT);
  }
  function done() { const ch = S.chef; ch.cur = null; const n = ch.queue.shift(); if (n) startAction(n); }
  function pay(amount, x, y) { S.cash += amount; S.earned += amount; float(x, y, '+$' + amount); }
  function chefUpdate(dt) {
    const ch = S.chef, a = ch.cur;
    if (!a) return;
    if (!moveAlong(ch, P.chefSpeed, dt)) return;
    if (a.type === 'seat') {
      const g = a.target;
      if (a.phase === 0) { if (g.state !== 'queue') { a.table.reserved = null; return done(); } g.state = 'led'; g.leader = ch; a.phase = 1; ch.path = route(ch, a.table.stand); }
      else { seat(g, a.table); done(); }
    } else if (a.type === 'serve' || a.type === 'deliver') {
      const tgt = a.target;
      if (a.phase === 0) { ch.carry = true; a.phase = 1; ch.path = route(ch, a.type === 'serve' ? tgt.table.stand : DROP); }
      else {
        ch.carry = false;
        if (a.type === 'serve') { if (tgt.state === 'wait') startEating(tgt); else { S.plates++; drawPlates(); } }
        else if (tgt.state === 'wait') { if (S.cards[tgt.card]) S.cards[tgt.card].served++; S.delivered++; pay(tgt.price, tgt.x, tgt.y - 70); tgt.state = 'out'; tgt.path = [{ x: KR + 40, y: tgt.y }]; }
        else { S.plates++; drawPlates(); }
        done();
      }
    } else if (a.type === 'rush') { ch.mounted = true; if (!ch.rush) ch.rush = newRush(); ch.rush.on = true; }
    else if (a.type === 'home') done();
  }
  // ---- the food-run vehicle: a bike in the Countryside, an electric scooter in the City. (0,0) = ground under its middle ----
  function seatedChef() {
    // the chef without legs and arms (those are drawn for the ride: short and chunky, cartoon style)
    const c = FUR[ANIMAL], o = { shirt: '#FFFFFF', skin: c.fur, pants: '#3D405B' }, b = body(o, 1.6);
    return chef(ANIMAL, MC, 'A').replace(b, b.slice(b.indexOf('<path d="M-13 -9'))).replace(arms(o, 1.6), '');
  }
  function vehicleSVG(mounted, riding) {
    const paw = FUR[ANIMAL].fur, limb = (d, col, w) => `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + 3}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const shadow = `<ellipse cx="2" cy="1" rx="64" ry="6" fill="rgba(40,25,10,.22)"/>`;
    const crate = (x, y) => `<g transform="translate(${x} ${y})"><circle cx="7" cy="-15" r="6" fill="#E63946" stroke="${OUT}" stroke-width="1.3"/><path d="M16 -12 L26 -32" stroke="#52B788" stroke-width="5.5" stroke-linecap="round"/><circle cx="24" cy="-13" r="5.5" fill="#F4A261" stroke="${OUT}" stroke-width="1.3"/>
      <rect x="-2" y="-12" width="34" height="18" rx="3" fill="#D9A066" stroke="${OUT}" stroke-width="1.8"/><path d="M-2 -5 h34 M10 -12 v18 M22 -12 v18" stroke="#A9743F" stroke-width="1.6"/></g>`;
    let back, front, legs, arm, at;
    if (CITY) {
      const wheel = x => `<circle cx="${x}" cy="-15" r="15" fill="#2B2B30" stroke="${OUT}" stroke-width="2"/><circle cx="${x}" cy="-15" r="8" fill="#EDE6DA" stroke="${OUT}" stroke-width="1.4"/><circle cx="${x}" cy="-15" r="2.6" fill="#9AA3AD"/>`;
      back = `${shadow}${crate(-66, -60)}<path d="M-70 -52 h40" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>${wheel(-42)}${wheel(46)}
        <path d="M-68 -26 C-72 -48 -58 -62 -32 -62 L-10 -62 C-2 -62 2 -56 0 -46 L-2 -32 C-20 -30 -48 -28 -68 -26 Z" fill="#E8392B" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M-60 -36 C-56 -50 -44 -54 -30 -54" stroke="#FF8A7A" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g transform="translate(-30 -40)"><circle r="9" fill="#FFF7EC" stroke="${OUT}" stroke-width="1.6"/><path d="M1.5 -6 L-4 1 H0.5 L-1.5 6 L4 -1 H-0.5 Z" fill="#F4B740" stroke="${OUT}" stroke-width="1" stroke-linejoin="round"/></g>
        <path d="M-2 -30 h30" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/><rect x="-50" y="-70" width="44" height="11" rx="5.5" fill="#5B4636" stroke="${OUT}" stroke-width="1.8"/>`;
      front = `<path d="M26 -28 C34 -46 34 -76 42 -92 L52 -92 C48 -74 48 -50 54 -28 Z" fill="#E8392B" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M30 -36 C35 -54 36 -72 42 -84" stroke="#FF8A7A" stroke-width="2.4" fill="none" stroke-linecap="round"/>
        <path d="M30 -24 C32 -40 60 -40 64 -24" fill="#E8392B" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M47 -92 L50 -104" stroke="${OUT}" stroke-width="5" stroke-linecap="round"/><path d="M36 -106 h26" stroke="${OUT}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="58" cy="-97" r="6.5" fill="#FFE08A" stroke="${OUT}" stroke-width="1.8"/>`;
      at = 'translate(-6 -52) scale(1.42)';
      legs = limb('M2 -60 Q14 -62 18 -56 L20 -46', '#3D405B', 10.5) + `<ellipse cx="24" cy="-42" rx="8" ry="5.5" fill="#2B2420" stroke="${OUT}" stroke-width="1.2"/>`;
      arm = limb('M14 -88 Q28 -94 38 -102', '#FFFFFF', 8.5) + `<circle cx="40" cy="-104" r="5.8" fill="${paw}" stroke="${OUT}" stroke-width="1.4"/>`;
    } else {
      const FR = '#5E9E6E', bw = x => `<circle cx="${x}" cy="-19" r="19" fill="none" stroke="${OUT}" stroke-width="4.5"/><circle cx="${x}" cy="-19" r="19" fill="none" stroke="#3D405B" stroke-width="2.4"/>
        <path d="M${x - 13} -19 h26 M${x} -32 v26 M${x - 9} -28 l18 18 M${x + 9} -28 l-18 18" stroke="#B8B2A7" stroke-width="1.2"/><circle cx="${x}" cy="-19" r="3" fill="#9AA3AD" stroke="${OUT}" stroke-width="1"/>`;
      const frame = 'M-36 -19 L-2 -20 L-14 -56 Z M-2 -20 L30 -58';
      back = `${shadow}${bw(-36)}${bw(40)}<path d="M-36 -42 C-30 -46 -22 -46 -18 -44" fill="none" stroke="#FFF7EC" stroke-width="5" stroke-linecap="round"/>${crate(-62, -58)}
        <path d="${frame}" fill="none" stroke="${OUT}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/><path d="${frame}" fill="none" stroke="${FR}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
        <path d="M-36 -19 L-60 -50" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/>
        <path d="M-24 -60 Q-14 -66 -4 -60 Q-12 -56 -24 -60 Z" fill="#5B4636" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/><path d="M-14 -56 L-14 -60" stroke="${OUT}" stroke-width="3"/>
        <circle cx="-2" cy="-20" r="6" fill="#9AA3AD" stroke="${OUT}" stroke-width="1.6"/><path d="M-2 -20 L6 -12" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/><rect x="2" y="-13" width="10" height="4" rx="2" fill="#3D405B"/>`;
      front = `<path d="M30 -58 L34 -74 M30 -58 L40 -19" fill="none" stroke="${OUT}" stroke-width="7" stroke-linecap="round"/><path d="M30 -58 L34 -74 M30 -58 L40 -19" fill="none" stroke="${FR}" stroke-width="4" stroke-linecap="round"/>
        <path d="M24 -77 Q32 -82 40 -76" fill="none" stroke="${OUT}" stroke-width="4" stroke-linecap="round"/>
        <g transform="translate(52 -60)"><path d="M-8 -16 L4 -30 M2 -18 L14 -28" stroke="#52B788" stroke-width="5" stroke-linecap="round"/><circle cx="-4" cy="-16" r="6" fill="#E63946" stroke="${OUT}" stroke-width="1.3"/><circle cx="8" cy="-16" r="5.5" fill="#F4A261" stroke="${OUT}" stroke-width="1.3"/>
          <path d="M-14 -12 H18 L14 6 H-10 Z" fill="#D9A066" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/><path d="M-12 -5 H16 M-11 1 H15 M-4 -12 L-3 6 M6 -12 L5 6" stroke="#A9743F" stroke-width="1.4"/></g>
        <circle cx="44" cy="-62" r="4" fill="#FFE08A" stroke="${OUT}" stroke-width="1.4"/>`;
      at = 'translate(-14 -50) scale(1.42)';
      legs = limb('M-8 -58 Q6 -56 8 -46 L4 -30', '#3D405B', 10.5) + `<ellipse cx="8" cy="-25" rx="8" ry="5.5" fill="#2B2420" stroke="${OUT}" stroke-width="1.2"/>`;
      arm = limb('M6 -86 Q18 -86 28 -79', '#FFFFFF', 8.5) + `<circle cx="30" cy="-78" r="5.8" fill="${paw}" stroke="${OUT}" stroke-width="1.4"/>`;
    }
    if (!mounted) return back + front + `<text x="-78" y="-133" font-size="11" font-weight="900" letter-spacing="1.5" fill="#7A5A40" font-family="Nunito,sans-serif">${CITY ? 'RUSH TO MARKET' : 'RUSH TO FARM'}</text>`;
    const speed = riding ? `<path d="M-84 -70 h-24 M-78 -52 h-32 M-86 -34 h-20" stroke="#7A5A40" stroke-width="3" stroke-linecap="round" opacity=".5"/>` : '';
    const you = `<g transform="translate(${CITY ? -2 : -10} -178)"><rect x="-22" y="-12" width="44" height="22" rx="11" fill="${MC}" stroke="${OUT}" stroke-width="1.4"/><text y="4" text-anchor="middle" font-size="12" font-weight="900" fill="#FFFFFF" font-family="Inter,sans-serif">YOU</text></g>`;
    return speed + back + `<g transform="${at}">${seatedChef()}</g>` + legs + front + arm + you;
  }
  function newRush() { const w = P.zone, lo = 0.04, hi = 1 - 0.04 - w, a = lo + RND() * Math.max(0, hi - lo); return { step: 0, zones: [[a, a + w]], on: false, flash: 0, ok: false }; }
  function marker() { const ph = (S.mTime * P.mSpeed) % 2; return ph < 1 ? ph : 2 - ph; }
  function rushTry() {
    const ch = S.chef;
    if (!(ch.cur && ch.cur.type === 'rush' && ch.rush && ch.rush.on)) return false;
    const r = ch.rush, m = marker(), z = r.zones[r.step];
    if (m >= z[0] && m <= z[1]) {
      r.step++; r.flash = .35; r.ok = true;
      if (r.step >= r.zones.length) {
        if (ch.cur.practice) { S.plates++; drawPlates(); float(BIKE.x, SPOT.y - 112, '+1 plate (free)'); S.tut.practiced = true; ch.rush = null; ch.cur = null; return true; }
        const cost = rushCost();
        S.plates++; S.rushed++; S.cash -= cost; S.spent += cost; drawPlates(); float(BIKE.x, SPOT.y - 112, `+1 plate  −$${cost}`); tutAfterRush();
        ch.rush = null; ch.cur = null; const n = ch.queue.shift(); if (n) startAction(n);
      }
    } else { r.flash = .35; r.ok = false; }
    return true;
  }

  // ---- guests, staff, couriers ----
  function seat(g, t) { t.reserved = null; t.guest = g; g.table = t; g.state = 'wait'; g.pat = P.sPat; g.server = null; g.claimed = null; g.x = t.x; g.y = t.y - 2; g.path = []; L.seated.appendChild(g.node); }
  function startEating(g) { g.state = 'eat'; g.eat = P.eat; g.server = null; }
  function leave(g, angry) {
    if (g.table) { g.table.guest = null; g.table = null; }
    if (g.claimed && g.claimed.cur && g.claimed.cur.target === g && g.claimed.cur.table) g.claimed.cur.table.reserved = null;
    if (g.claimed && g.claimed.task && g.claimed.task.g === g && g.claimed.task.t) g.claimed.task.t.reserved = null;
    if (angry) { S.unhappy++; g.angry = true; if (opts.tutorial === 'day1') tutHint('unhappy', g.x, g.y - 70, 'Waited too long. They left unhappy.'); }
    g.state = 'out'; g.claimed = null; L.walk.appendChild(g.node);
    if (region(g) === 'din') g.y += 30;
    g.path = route(g, { x: RX - 30, y: AYc + 6 }).concat([EXIT]);
  }
  function staffUpdate(st, dt) {
    if (st.gone) { if (moveAlong(st, P.staffSpeed, dt) && !st.removed) { st.removed = true; st.node.remove(); } return; }
    const T = st.task;
    if (!T) {
      const mine = tables.filter(t => t.sec === st.sec.i);
      const need = mine.find(t => t.guest && t.guest.state === 'wait' && !t.guest.server);
      if (need && S.plates > 0) { need.guest.server = st; st.task = { type: 'serve', g: need.guest, phase: 0 }; st.path = route(st, PASS); return; }
      const free = mine.find(t => !t.guest && !t.reserved);
      const g = free && S.guests.find(g => g.state === 'queue' && !g.claimed);
      if (g) { free.reserved = g; g.claimed = st; st.task = { type: 'seat', g, t: free, phase: 0 }; st.path = route(st, DOOR_IN); return; }
      if (Math.hypot(st.x - st.sec.home.x, st.y - st.sec.home.y) > 2 && !st.path.length) st.path = route(st, st.sec.home);
      moveAlong(st, P.staffSpeed, dt); return;
    }
    if (!moveAlong(st, P.staffSpeed, dt)) return;
    if (T.type === 'seat') {
      if (T.phase === 0) { if (T.g.state !== 'queue') { T.t.reserved = null; st.task = null; return; } T.g.state = 'led'; T.g.leader = st; T.phase = 1; st.path = route(st, T.t.stand); }
      else { seat(T.g, T.t); st.task = null; }
    } else if (T.type === 'serve') {
      if (T.phase === 0) {
        if (T.g.state !== 'wait') { st.task = null; return; }
        if (S.plates <= 0) { T.g.server = null; st.task = null; return; }
        S.plates--; drawPlates(); st.carry = true; T.phase = 1; st.path = route(st, T.g.table.stand);
      } else { st.carry = false; if (T.g.state === 'wait') startEating(T.g); else { S.plates++; drawPlates(); } st.task = null; }
    }
  }
  function guestUpdate(g, dt) {
    if (g.state === 'arrive' || g.state === 'queue') {
      const rank = S.guests.filter(x => (x.state === 'arrive' || x.state === 'queue') && x.id < g.id).length, sp = slotPos(rank);
      if (Math.hypot(sp.x - g.x, sp.y - g.y) > 1) { g.path = [sp]; moveAlong(g, 90, dt); }
      if (g.state === 'arrive' && Math.hypot(sp.x - g.x, sp.y - g.y) < 4) { g.state = 'queue'; g.pat = P.qPat; }
      if (g.state === 'queue' && !g.claimed) { g.pat -= dt; if (g.pat <= 0) leave(g, true); }
    } else if (g.state === 'led') {
      const ld = g.leader, d = Math.hypot(ld.x - g.x, ld.y - g.y);
      if (d > 30) { g.path = [{ x: ld.x, y: ld.y }]; moveAlong(g, Math.max(P.chefSpeed, P.staffSpeed) * 1.05 * Math.min(1, (d - 30) / 10 + .2), dt); }
    } else if (g.state === 'wait') { if (!g.server) { g.pat -= dt; if (g.pat <= 0) leave(g, true); } }
    else if (g.state === 'eat') {
      g.eat -= dt;
      if (g.eat <= 0) { if (g.card && S.cards[g.card]) S.cards[g.card].served++; S.served++; pay(g.price, g.table.x, g.table.y - 60); leave(g, false); }
    } else if (g.state === 'out') { moveAlong(g, 110, dt); if (!g.path.length) { g.node.remove(); g.ring.remove(); g.dead = true; } }
  }
  function courierUpdate(c, dt) {
    if (c.state === 'in') { if (moveAlong(c, 90, dt)) c.state = 'wait'; }
    else if (c.state === 'wait') { if (!c.server) { c.pat -= dt; if (c.pat <= 0) { S.unhappy++; c.state = 'out'; c.angry = true; c.path = [{ x: KR + 40, y: c.y }]; } } }
    else if (c.state === 'out') { if (moveAlong(c, 110, dt)) { c.node.remove(); c.ring.remove(); c.dead = true; } }
  }

  // ---- a fight: two bunnies get hurt and go home for the rest of today (still paid) ----
  function injure(n) {
    const hurt = S.staff.filter(st => !st.gone).slice(-n);
    for (const st of hurt) {
      const T = st.task;
      if (T && T.type === 'seat') { if (T.phase === 1) seat(T.g, T.t); else { T.t.reserved = null; if (T.g.claimed === st) T.g.claimed = null; } }
      if (T && T.type === 'serve') { if (T.phase === 1) startEating(T.g); else T.g.server = null; }
      st.task = null; st.carry = false; st.gone = true; st.path = route(st, { x: RX - 30, y: AYc + 6 }).concat([EXIT]);
      tables.filter(t => t.sec === st.sec.i).forEach(t => { t.staffed = false; });
      const s = st.sec;
      L.inj.innerHTML += `<g transform="translate(${s.x + s.w / 2} ${s.y + s.h - 30})"><rect x="-52" y="-12" width="104" height="24" rx="12" fill="#FFE1E3" stroke="${OUT}" stroke-width="1.4"/><text y="5" text-anchor="middle" font-size="12" font-weight="800" fill="#B3261E" font-family="Inter,sans-serif">hurt · off today</text></g>`;
    }
    return hurt.length;
  }

  // ---- mid-service event: a pop-up you answer within P.decide seconds; the service clock stops meanwhile ----
  function startEvent() {
    const e = opts.event; if (!e) return;
    S.modal = { left: P.decide, type: e.type };
    showEvent();
  }
  function closeEvent(choice) {
    const e = opts.event, m = S.modal; if (!m) return;
    if (e.type === 'food') { const give = choice === 'give' && S.plates > 0; if (give) { S.plates--; drawPlates(); } S.food = give ? 'give' : 'refuse'; }
    if (e.type === 'fight') { const n = injure(e.fight || 2); toast(n ? `${n === 1 ? 'One bunny' : 'Two bunnies'} went home hurt.` : 'Nobody got hurt.'); }
    if (e.type === 'propose' && e.ok) { S.cash += e.tip; S.tip = e.tip; float(W / 2, AYc - 40, `+$${e.tip} tip`); }
    S.modal = null; ov.hidden = true; last = performance.now();
  }
  function showEvent() {
    const e = opts.event, place = LOC === 'city' ? 'the street' : 'the village';
    let h, p, btns;
    if (e.type === 'food') {
      h = LOC === 'city' ? 'Someone is hungry' : 'A villager is hungry';
      p = `They can't pay. Give them a plate? ${place[0].toUpperCase() + place.slice(1)} will talk about it.`;
      btns = (S.plates > 0 ? `<button type="button" class="cta inline" data-ev="give">Give 1 plate</button>` : `<span>You have no plates left to give.</span>`) + `<button type="button" class="obtn" data-ev="refuse">Say no</button>`;
    } else if (e.type === 'fight') {
      h = 'A fight broke out!';
      p = `Two of your bunnies got hurt and are going home for today. You still pay them, and they're back tomorrow.`;
      btns = `<button type="button" class="cta inline" data-ev="ok">OK</button>`;
    } else {
      h = 'Someone is proposing!';
      p = e.ok ? `They said yes! The happy couple leaves a $${e.tip} tip.` : 'They said no… Awkward. No tip tonight.';
      btns = `<button type="button" class="cta inline" data-ev="ok">OK</button>`;
    }
    ov.hidden = false;
    ov.innerHTML = `<div class="rcard" role="alertdialog" aria-label="${escT(h)}"><span class="rtimer" data-h="evleft">${Math.ceil(S.modal.left)}s</span><h2>${escT(h)}</h2><p>${escT(p)}</p><div class="row">${btns}</div></div>`;
  }

  // ---- drawing ----
  function drawPlates() {
    let h = '';
    const m = S.plates > 18 ? 17 : S.plates, extra = S.plates - m;
    for (let j = 0; j < m; j++) h += platePath(KX + 54 + (j % 6) * 38, RY + 68 + Math.floor(j / 6) * 22, 1.1);
    if (extra > 0) h += `<text x="${KX + 54 + 5 * 38}" y="${RY + 116}" text-anchor="middle" font-size="13" font-weight="900" fill="${OUT}" font-family="Inter,sans-serif">+${extra}</text>`;
    h += `<g transform="translate(${SC} ${RY + 150})"><rect x="-62" y="-11" width="124" height="22" rx="11" fill="${S.plates ? '#FFF7EC' : '#FFE1E3'}" stroke="${OUT}" stroke-width="1.3"/><text y="5" text-anchor="middle" font-size="12" font-weight="800" fill="${S.plates ? OUT : '#B3261E'}" font-family="Inter,sans-serif">${S.plates} plate${S.plates === 1 ? '' : 's'} ready</text></g>`;
    L.plates.innerHTML = h;
  }
  const badgeFor = target => {
    const ch = S.chef, list = [ch.cur, ...ch.queue], i = list.findIndex(a => a && a.target === target);
    return i < 0 ? '' : `<g transform="translate(16 -66)"><circle r="10" fill="${MC}" stroke="${OUT}" stroke-width="1.4"/><text y="4" text-anchor="middle" font-size="12" font-weight="900" fill="#fff" font-family="Inter,sans-serif">${i + 1}</text></g>`;
  };
  function float(x, y, txt) { S.floats.push({ x, y, txt, t: 1.2 }); }
  function render() {
    const hl = `<ellipse class="hl" cy="0" rx="20" ry="7" fill="none" stroke="#FFE08A" stroke-width="3"/>`;
    S.guests.forEach(g => {
      if (g.dead) return;
      const seated = g.state === 'wait' || g.state === 'eat', glow = g.col !== GUEST && S.tut.flashAd > 0;
      const key = [seated, g.angry, badgeFor(g), glow].join('|');
      if (key !== g.key) { g.key = key; g.node.innerHTML = (seated ? '' : hl + '<rect x="-22" y="-62" width="44" height="70" fill="transparent"/>') + (glow ? `<ellipse cx="0" cy="-26" rx="24" ry="34" fill="none" stroke="#FFE08A" stroke-width="4" opacity=".9"/>` : '') + pawn(g.col, seated) + (g.angry ? `<g transform="translate(0 -40)"><path d="M-5 -5 l10 10 M5 -5 l-10 10" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/></g>` : '') + badgeFor(g); }
      g.node.setAttribute('transform', `translate(${g.x.toFixed(1)} ${g.y.toFixed(1)})`);
      let r = '';
      if (g.state === 'queue') r = `<g transform="translate(${g.x} ${g.y - 70})">${ringSVG(g.pat / P.qPat)}</g>`;
      if (g.state === 'wait') {
        const f = g.pat / P.sPat;
        r = `<g transform="translate(${g.x + 26} ${g.y - 52})"><circle r="17" fill="#FFF7EC" stroke="${OUT}" stroke-width="1.5"/>${platePath(0, 1, .9)}<circle r="17" fill="none" stroke="${f < .34 ? '#E63946' : f < .6 ? '#F4A261' : '#52B788'}" stroke-width="3.5" stroke-dasharray="${(107 * f).toFixed(1)} 107" transform="rotate(-90)"/></g><rect class="click" data-click="g${g.id}" x="${g.x - 40}" y="${g.y - 72}" width="88" height="100" rx="14" fill="transparent"/>`;
      }
      g.ring.innerHTML = r;
    });
    let tp = '';
    tables.forEach(t => { if (t.guest && t.guest.state === 'eat') tp += platePath(t.x, t.y - 1, 1); });
    L.tplates.innerHTML = tp;
    S.staff.forEach(st => {
      if (st.removed) return;
      const atHome = !st.gone && !st.task && Math.hypot(st.x - st.sec.home.x, st.y - st.sec.home.y) < 3;
      const stalled = !st.gone && S.plates === 0 && !st.task && tables.some(t => t.sec === st.sec.i && t.guest && t.guest.state === 'wait' && !t.guest.server);
      const key = atHome + '|' + st.carry + '|' + stalled + '|' + !!st.gone;
      if (key !== st.key) { st.key = key; st.node.innerHTML = staffSVG(atHome, st.carry) + (stalled ? `<g transform="translate(0 -88)"><circle r="15" fill="#FFF7EC" stroke="${OUT}" stroke-width="1.5"/>${platePath(0, 1, .8)}<path d="M-10 9 L10 -9" stroke="#E63946" stroke-width="3" stroke-linecap="round"/></g>` : '') + (st.gone ? `<g transform="translate(14 -54)"><rect x="-8" y="-3" width="16" height="6" rx="2" fill="#FFFFFF" stroke="${OUT}" stroke-width="1"/><path d="M-2 0 h4 M0 -2 v4" stroke="#E63946" stroke-width="1.4"/></g>` : ''); }
      st.node.setAttribute('transform', `translate(${st.x.toFixed(1)} ${st.y.toFixed(1)})`);
    });
    const ch = S.chef, riding = !!(ch.cur && ch.cur.type === 'rush' && ch.rush && ch.rush.on), ckey = ch.mounted ? 'm' : String(ch.carry);
    if (ch.mounted && ckey !== ch.key) { ch.key = ckey; ch.node.innerHTML = ''; }
    const rkey = (ch.mounted ? 'm' : 'p') + (riding ? 'r' : '');
    if (rkey !== S.ride.key) { S.ride.key = rkey; S.ride.node.innerHTML = vehicleSVG(ch.mounted, riding); }
    // while the mini game runs the vehicle rocks back and forth and shakes a little; after a buy it stands still
    const wob = riding ? { x: Math.sin(S.mTime * 6.5) * 5 + Math.sin(S.mTime * 47) * .7, y: Math.sin(S.mTime * 53) * .8, r: Math.sin(S.mTime * 29) * 1.1 } : { x: 0, y: 0, r: 0 };
    S.ride.node.setAttribute('transform', `translate(${(BIKE.x + wob.x).toFixed(1)} ${(BIKE.y + wob.y).toFixed(1)}) rotate(${wob.r.toFixed(2)})`);
    if (!ch.mounted && ckey !== ch.key) { ch.key = ckey; ch.node.innerHTML = `<g transform="scale(1.05)">${chefSVG(ANIMAL, MC, ch.carry)}</g><g transform="translate(0 -94)"><rect x="-22" y="-12" width="44" height="22" rx="11" fill="${MC}" stroke="${OUT}" stroke-width="1.4"/><text y="4" text-anchor="middle" font-size="12" font-weight="900" fill="#FFFFFF" font-family="Inter,sans-serif">YOU</text></g>`; }
    ch.node.setAttribute('transform', `translate(${ch.x.toFixed(1)} ${ch.y.toFixed(1)})`);
    S.couriers.forEach(c => {
      if (c.dead) return;
      const key = 'c' + badgeFor(c);
      if (key !== c.key) { c.key = key; c.node.innerHTML = hl + courierSVG() + badgeFor(c); }
      c.node.setAttribute('transform', `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`);
      c.ring.innerHTML = c.state === 'wait' ? `<g transform="translate(${c.x} ${c.y - 70})">${ringSVG(c.pat / P.cPat)}</g><g transform="translate(${c.x - 40} ${c.y - 22})"><rect x="-16" y="-14" width="32" height="28" rx="8" fill="#FFF7EC" stroke="${OUT}" stroke-width="1.4"/>${platePath(0, 2, .9)}</g><rect class="click" data-click="c${c.id}" x="${c.x - 62}" y="${c.y - 86}" width="84" height="94" rx="14" fill="transparent"/>` : '';
    });
    const kids = [...L.walk.children], ys = n => { const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(n.getAttribute('transform') || ''); return m ? +m[2] : 0; };
    const sorted = kids.slice().sort((a, b) => ys(a) - ys(b));
    if (sorted.some((n, i) => n !== kids[i])) sorted.forEach(n => L.walk.appendChild(n));
    // rush panel, floats, card pop-ups, bus
    let ui = '';
    const r = ch.rush;
    if (ch.cur && ch.cur.type === 'rush' && r && r.on) {
      const CW = 184, CH = 82, CX = BIKE.x - 88, CY = SPOT.y - 144, RX0 = CX + 12, RW0 = CW - 24, RY0 = CY + 38;
      const price = ch.cur.practice ? 'FREE' : '$' + rushCost(), z = r.zones[r.step], zx = RX0 + RW0 * z[0], zw = RW0 * (z[1] - z[0]), mx = RX0 + RW0 * marker();
      const msg = r.flash > 0 ? (r.ok ? 'Nice!' : 'Missed. Try again') : 'Click or Space in the green';
      ui += `<rect x="${CX}" y="${CY + 3}" width="${CW}" height="${CH}" rx="14" fill="rgba(58,42,30,.18)"/><rect x="${CX}" y="${CY}" width="${CW}" height="${CH}" rx="14" fill="#FFF7EC" stroke="${OUT}" stroke-width="2"/>
        <text x="${CX + 12}" y="${CY + 22}" font-size="13" font-weight="900" fill="${OUT}" font-family="Inter,sans-serif">${CITY ? 'Stop at the market!' : 'Stop at the farm!'}</text>
        <g transform="translate(${CX + CW - 28} ${CY + 17})"><rect x="-20" y="-10" width="40" height="20" rx="10" fill="#E76F51" stroke="${OUT}" stroke-width="1.4"/><text y="4.5" text-anchor="middle" font-size="12" font-weight="900" fill="#fff" font-family="Inter,sans-serif">${price}</text></g>
        <rect x="${RX0}" y="${RY0}" width="${RW0}" height="22" rx="11" fill="${r.flash > 0 && !r.ok ? '#7A3B3B' : '#4A4D57'}" stroke="${OUT}" stroke-width="1.6"/>
        <path d="M${RX0 + 10} ${RY0 + 11} H${RX0 + RW0 - 10}" stroke="#F4E3B5" stroke-width="2" stroke-dasharray="6 6"/>
        <rect x="${zx}" y="${RY0 + 2}" width="${zw}" height="18" rx="7" fill="#52B788"/>
        <g transform="translate(${zx + zw / 2} ${RY0 - 2})"><path d="M${-zw / 2 - 2} 0 h${zw + 4} l-3 -8 h${-zw + 2} z" fill="#F4B740" stroke="${OUT}" stroke-width="1.3"/><path d="M${-zw / 6} 0 l1 -8 M${zw / 6} 0 l-1 -8" stroke="#FFF3C4" stroke-width="3"/></g>
        <g transform="translate(${mx} ${RY0 + 15})">${CITY
          ? `<circle cx="-6" cy="0" r="3.4" fill="#2B2B30" stroke="#fff" stroke-width="1"/><circle cx="7" cy="0" r="3.4" fill="#2B2B30" stroke="#fff" stroke-width="1"/><path d="M-10 -2 C-10 -8 -4 -10 2 -9 L6 -9 L9 -15 L12 -15 L10 -4 Z" fill="#E8392B" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>`
          : `<circle cx="-7" cy="0" r="4.5" fill="none" stroke="#FFFFFF" stroke-width="2.2"/><circle cx="8" cy="0" r="4.5" fill="none" stroke="#FFFFFF" stroke-width="2.2"/><path d="M-7 0 L0 0 L-3 -8 Z M0 0 L6 -9 L8 0 M-5 -9 h4 M4 -11 h5" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`}</g>
        <text x="${CX + CW / 2}" y="${CY + CH - 8}" text-anchor="middle" font-size="11" font-weight="800" fill="${r.flash > 0 ? (r.ok ? '#2D6A4F' : '#B3261E') : '#7A5A40'}" font-family="Inter,sans-serif">${msg}</text>`;
    } else if (ch.cur && ch.cur.type === 'rush') ui += `<rect x="${SPOT.x - 4}" y="${SPOT.y - 4}" width="${SPOT.w + 8}" height="${SPOT.h + 8}" rx="16" fill="none" stroke="${MC}" stroke-width="3" stroke-dasharray="6 5"/>`;
    if (S.cash < rushCost() && !(ch.cur && ch.cur.type === 'rush')) ui += `<rect x="${SPOT.x}" y="${SPOT.y}" width="${SPOT.w}" height="${SPOT.h}" rx="14" fill="rgba(43,36,32,.55)"/><g transform="translate(${SPOT.x + SPOT.w / 2} ${SPOT.y + SPOT.h / 2})"><rect x="-58" y="-12" width="116" height="24" rx="12" fill="#FFF7EC" stroke="${OUT}" stroke-width="1.4"/><text y="5" text-anchor="middle" font-size="11" font-weight="800" fill="${OUT}" font-family="Inter,sans-serif">Not enough cash</text></g>`;
    const ri = [ch.cur, ...ch.queue].findIndex(a => a && a.type === 'rush');
    if (ri > 0) ui += `<g transform="translate(${SPOT.x + 10} ${SPOT.y + 10})"><circle r="10" fill="${MC}" stroke="${OUT}" stroke-width="1.4"/><text y="4" text-anchor="middle" font-size="12" font-weight="900" fill="#fff" font-family="Inter,sans-serif">${ri + 1}</text></g>`;
    S.floats.forEach(f => { ui += `<text x="${f.x}" y="${f.y - (1.2 - f.t) * 30}" text-anchor="middle" font-size="16" font-weight="900" fill="#FFE08A" stroke="${OUT}" stroke-width="3" paint-order="stroke" opacity="${Math.min(1, f.t * 2)}" font-family="Inter,sans-serif">${escT(f.txt)}</text>`; });
    const pp = S.popups[0];
    if (pp) {
      const px = 10, py = H - 76, pw = 300, ph = 64, cc = pp.side === 'rival' ? RC : MC;
      ui += `<g opacity="${Math.min(1, pp.t / 1.5, (5 - pp.t) / 0.25).toFixed(2)}"><rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="14" fill="#FFF7EC" stroke="${OUT}" stroke-width="2"/><g transform="translate(${px + 34} ${py + 32})"><rect x="-20" y="-25" width="40" height="50" rx="7" fill="${cc}" stroke="${OUT}" stroke-width="1.6"/><rect x="-14" y="-18" width="28" height="18" rx="3" fill="#FFF7EC"/><path d="M-12 6 h24 M-12 12 h16" stroke="#FFF7EC" stroke-width="2.4" stroke-linecap="round"/></g>`;
      ui += `<text x="${px + 66}" y="${py + 28}" font-size="15" font-weight="900" fill="${OUT}" font-family="Inter,sans-serif">${escT(pp.name)}</text><text x="${px + 66}" y="${py + 47}" font-size="12" font-weight="700" fill="${pp.bad ? '#B3261E' : '#7A5A40'}" font-family="Inter,sans-serif">${escT(pp.line)}</text></g>`;
    }
    ui += tutRender();
    L.ui.innerHTML = ui;
    tutCoach();
    if (S.bus) {
      const b = S.bus;
      L.bus.innerHTML = `<g transform="translate(${b.x} 14)"><rect width="190" height="62" rx="12" fill="#E9C46A" stroke="${OUT}" stroke-width="2"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${12 + i * 34}" y="10" width="26" height="18" rx="4" fill="#BFE3F2" stroke="${OUT}" stroke-width="1.3"/>`).join('')}<rect x="0" y="36" width="190" height="8" fill="#E76F51"/><circle cx="40" cy="62" r="9" fill="#2F323B"/><circle cx="150" cy="62" r="9" fill="#2F323B"/><text x="95" y="56" text-anchor="middle" font-size="11" font-weight="900" fill="${OUT}" font-family="Inter,sans-serif">TOUR BUS</text></g>`;
    } else L.bus.innerHTML = '';
    H$('cash').textContent = (S.cash < 0 ? '−$' : '$') + Math.abs(Math.round(S.cash * 100) / 100);
    H$('served').textContent = S.served + S.delivered;
    H$('unhappy').textContent = S.unhappy;
    H$('fill').style.width = Math.min(100, S.t / dl * 100) + '%';
    const left = Math.max(0, Math.ceil(dl - S.t));
    H$('left').textContent = S.closed ? 'closing' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (S.modal) { const e = H$('evleft'); if (e) e.textContent = Math.ceil(S.modal.left) + 's'; }
  }

  // ---- tutorials (day 1: the basics; day 3: ads and events). Page-only: nothing here changes the rules ----
  const colName = MC === '#D61F69' ? 'Pink' : 'Blue';
  const TOUR1 = [
    { text: 'This is you, the chef.', spot: () => ({ c: [S.chef.x, S.chef.y - 50, 70] }), at: () => [S.chef.x, S.chef.y - 120] },
    { need: 'staff', text: 'Bunnies seat and serve their rug.', spot: () => { const s = sections.find(s => s.on); return s ? { r: [s.x - 6, s.y - 6, s.w + 12, s.h + 12] } : null; }, at: () => { const s = sections.find(s => s.on); return s ? [s.x + s.w / 2, s.y + s.h + 4] : [W / 2, H / 2]; }, below: true },
    { need: 'nostaff', text: 'No staff? Those tables are yours.', spot: () => { const s = sections.filter(s => !s.on).pop(); return s ? { r: [s.x - 6, s.y - 6, s.w + 12, s.h + 12] } : null; }, at: () => { const s = sections.filter(s => !s.on).pop(); return s ? [s.x + s.w / 2, s.y - 8] : [W / 2, H / 2]; } },
    { text: `Out of plates? Rush out for fresh ingredients here.`, spot: () => ({ r: [SPOT.x - 8, SPOT.y - 8, SPOT.w + 16, SPOT.h + 16] }), at: () => [BIKE.x, SPOT.y - 14] },
    { text: 'Try one now. This one is free!', done: 'Nice! That plate is yours.', practice: true, spot: () => ({ r: [SPOT.x - 12, SPOT.y - 158, SPOT.w + 24, SPOT.h + 166] }), at: () => [BIKE.x, SPOT.y - 166], last: true }
  ];
  const hasBus = S.busAt != null, hasCourier = S.sched.some(e => e.kind === 'courier'), hasAd = S.sched.some(e => (e.kind === 'ad' || e.kind === 'bus') && e.g.from !== 'rival');
  const TOUR3 = [
    hasBus && { text: 'BUS on the timeline: 6 guests at once.', spot: () => null, hud: true, at: () => [W * 0.68, 8], below: true },
    hasCourier && { text: 'Couriers wait here. Bring them a plate.', spot: () => ({ r: [KX + 114, DY - 6, KR - KX - 132, 140] }), at: () => [KX + 186, DY - 10] },
    { text: `Guests from your ad cards wear your colour. Guests from ${opts.rivalName || 'your rival'}'s cards wear theirs.`, spot: () => ({ r: [8, QY - 70, OX - 4, 200] }), at: () => [OX + 150, QY + 40] }
  ].filter(Boolean);
  if (TOUR3.length) TOUR3[TOUR3.length - 1].last = true;
  S.tut = { on: !!opts.tutorial && !opts.auto, seen: {}, freeze: null, tour: -1, hints: [], g: null, flashAd: 0,
    steps: (opts.tutorial === 'day1' ? TOUR1 : opts.tutorial === 'day3' ? TOUR3 : []).filter(st => !st.need || sections.some(sc => st.need === 'staff' ? sc.on : !sc.on)) };
  function tutHint(key, x, y, text) { if (!S.tut.on || S.tut.seen[key]) return; S.tut.seen[key] = true; S.tut.hints.push({ x, y, text, t: 3.2 }); }
  function tutFreeze(key, wait, spot, at, text, below, target) { S.tut.seen[key] = true; S.tut.freeze = { key, wait, spot, at, text, below, target }; }
  function tutAction(a) {
    const f = S.tut.freeze;
    if (!f) return 'none';
    if (f.wait !== a.type || (f.target && f.target !== a.target)) return 'blocked';
    S.tut.freeze = null; if (f.key === 'door') S.tut.g = a.target;
    return 'match';
  }
  function tutCheck() {
    const T = S.tut;
    if (!T.on || T.freeze) return;
    if (opts.tutorial === 'day3') return tutCheck3();
    if (!T.seen.bunny) { const g = S.guests.find(g => g.state === 'led' && g.leader !== S.chef); if (g) tutHint('bunny', g.leader.x, g.leader.y - 90, 'Bunnies handle their own tables.'); }
    if (!T.seen.plates && S.plates === 0 && S.cash >= rushCost() && S.guests.some(g => g.state === 'wait' && !g.server))
      return tutFreeze('plates', 'rush', { r: [SPOT.x - 8, SPOT.y - 8, SPOT.w + 16, SPOT.h + 16] }, [BIKE.x, SPOT.y - 14], `Out of plates! Click the ${CITY ? 'scooter' : 'bike'}.`, false, 'ride');
    if (!T.seen.door) {
      const g = S.guests.find(g => g.state === 'queue' && !g.claimed && P.qPat - g.pat >= 3);
      if (g) return tutFreeze('door', 'seat', { c: [g.x, g.y - 30, 46] }, [g.x + 10, g.y - 92], 'Bunnies are busy. Click this guest.', false, g);
    }
    if (T.seen.door && !T.seen.serve && T.g && T.g.state === 'wait' && !T.g.server && S.plates > 0) {
      const g = T.g, up = g.y > H / 2;
      return tutFreeze('serve', 'serve', { c: [g.x + 8, g.y - 26, 62] }, [g.x + 8, up ? g.y - 92 : g.y + 40], 'Click them to serve a plate.', !up, g);
    }
  }
  function tutCheck3() {
    const T = S.tut;
    const c = S.couriers.find(c => c.state === 'wait' && !c.server);
    if (c && !T.seen.courier && S.plates > 0) return tutFreeze('courier', 'deliver', { c: [c.x - 20, c.y - 34, 64] }, [c.x - 30, c.y - 104], 'A courier! Click them to send a plate.', false, c);
    const ad = S.guests.find(g => g.col === MC && g.state !== 'out');
    if (ad && !T.seen.ad) { tutHint('ad', 470, H - 44, `${colName} guests came from your ${ad.card || 'ad'} card.`); T.flashAd = 3.5; }
    if (S.busAt != null && !T.seen.busSoon && S.t >= S.busAt - 6) tutHint('busSoon', 330, 60, 'Tour bus soon! 6 guests coming.');
    if (S.bus && S.bus.out >= 1 && !T.seen.busHere) tutHint('busHere', 330, 110, 'Seat who you can. Bunnies help too.');
  }
  function tutAfterRush() {
    if (!S.tut.on || opts.tutorial !== 'day1' || S.tut.seen.bunnyPlates) return;
    const st = S.staff.find(st => !st.gone && tables.some(t => t.sec === st.sec.i && t.guest && t.guest.state === 'wait' && !t.guest.server));
    if (st) tutHint('bunnyPlates', st.x, st.y - 110, 'Bunnies serve again once plates return.');
  }
  const holePath = sp => sp.c ? `M${sp.c[0] - sp.c[2]} ${sp.c[1]} a${sp.c[2]} ${sp.c[2]} 0 1 0 ${2 * sp.c[2]} 0 a${sp.c[2]} ${sp.c[2]} 0 1 0 ${-2 * sp.c[2]} 0Z` : `M${sp.r[0]} ${sp.r[1]} h${sp.r[2]} v${sp.r[3]} h${-sp.r[2]}Z`;
  function tutRender() {
    const T = S.tut; let u = '';
    const step = T.tour >= 0 ? T.steps[T.tour] : null, sp = step ? step.spot() : T.freeze ? T.freeze.spot : null;
    if (step && !sp) u += `<rect width="${W}" height="${H}" fill="rgba(24,16,12,.6)"/>`;
    if (sp) u += `<path d="M0 0H${W}V${H}H0Z ${holePath(sp)}" fill="rgba(24,16,12,.6)" fill-rule="evenodd"/><path d="${holePath(sp)}" fill="none" stroke="#FFE08A" stroke-width="3" stroke-dasharray="8 6"/>`;
    T.hints.forEach(h => {
      const w = h.text.length * 7.4 + 28, x = Math.max(w / 2 + 6, Math.min(W - w / 2 - 6, h.x));
      u += `<g transform="translate(${x} ${h.y})" opacity="${Math.min(1, h.t / .6).toFixed(2)}"><rect x="${-w / 2}" y="-15" width="${w}" height="30" rx="15" fill="#FFF7EC" stroke="${OUT}" stroke-width="1.6"/><text y="5" text-anchor="middle" font-size="13" font-weight="900" fill="${OUT}" font-family="Inter,sans-serif">${escT(h.text)}</text></g>`;
    });
    return u;
  }
  function tutCoach() {
    const T = S.tut, step = T.tour >= 0 ? T.steps[T.tour] : null, f = T.freeze;
    root.querySelectorAll('.ev').forEach(n => n.classList.toggle('pulse', !!(step && step.hud)));
    if (!step && !f) { if (!coach.hidden) coach.hidden = true; return; }
    const [x, y] = step ? step.at() : f.at, below = step ? step.below : f.below;
    const text = step ? (step.practice && T.practiced ? step.done : step.text) : f.text;
    if (coach.hidden) coach.hidden = false;
    const p = coach.querySelector('p'); if (p.textContent !== text) p.textContent = text;
    coach.querySelector('.step').textContent = step ? `${T.tour + 1} / ${T.steps.length}` : 'Your turn';
    const nb = coach.querySelector('[data-coach="next"]'), show = !!step && (!step.practice || T.practiced);
    nb.hidden = !show; coach.querySelector('.row').hidden = !show; if (step) nb.textContent = step.last ? 'Open the doors' : 'Next';
    coach.classList.toggle('below', !!below);
    coach.style.left = Math.max(14, Math.min(86, x / W * 100)) + '%';
    coach.style.top = Math.max(8, Math.min(96, y / H * 100)) + '%';
  }

  // ---- loop ----
  function update(dt) {
    S.t += dt; S.mTime += (S.chef.rush && S.chef.rush.on && S.chef.cur && S.chef.cur.type === 'rush') ? dt : 0;
    while (S.sched.length && S.sched[0].t <= S.t && !S.closed) {
      const e = S.sched.shift();
      if (e.kind === 'g') spawnGuest(GUEST, null, e.price);
      else if (e.kind === 'ad') {
        const g = e.g;
        for (let i = 0; i < g.n; i++) spawnGuest(colFor(g), { x: SPAWN.x + i * 6, y: SPAWN.y + i * 30 }, g.price, g.name);
        cardStat(g.name, g.n, 'guests'); popup(g.name, g.line, g.from === 'rival' ? 'rival' : 'self');
      } else if (e.kind === 'bus') { S.bus = { x: -200, stay: 6, n: e.g.n, out: 0, g: e.g }; cardStat(e.g.name, e.g.n, 'guests'); popup(e.g.name, e.g.line, 'self'); }
      else if (e.kind === 'courier') { spawnCourier(e.g); if (e.first) popup(e.g.name, e.g.line, e.g.from === 'rival' ? 'rival' : 'self'); }
      else if (e.kind === 'note') { S.popups.push({ name: e.n.name, line: e.n.line, side: e.n.side, bad: e.n.bad, t: 5 }); }
      else if (e.kind === 'event') { startEvent(); return; }
    }
    if (S.bus) {
      const b = S.bus;
      if (b.x < 14) b.x = Math.min(14, b.x + 220 * dt);
      else if (b.out < b.n) { b.cool = (b.cool || 0) - dt; if (b.cool <= 0) { spawnGuest(MC, { x: 70 + (b.out % 2) * 30, y: 86 }, b.g.price, b.g.name); b.out++; b.cool = .45; } }
      else { b.stay -= dt; if (b.stay <= 0) { b.x += 260 * dt; if (b.x > 260) S.bus = null; } }
    }
    if (!S.closed && S.t >= dl) {
      S.closed = true; S.sched = S.sched.filter(e => e.kind === 'event'); if (opts.tutorial === 'day1') tutHint('closed', RX + 120, AYc - 40, 'Doors closed. Finish the guests inside.');
      S.guests.filter(g => g.state === 'arrive' || g.state === 'queue').forEach(g => { if (!g.claimed) leave(g, false); });
    }
    chefUpdate(dt);
    tutCheck();
    S.staff.forEach(st => staffUpdate(st, dt));
    S.guests.forEach(g => !g.dead && guestUpdate(g, dt));
    S.couriers.forEach(c => !c.dead && courierUpdate(c, dt));
    S.guests = S.guests.filter(g => !g.dead); S.couriers = S.couriers.filter(c => !c.dead);
    S.floats.forEach(f => f.t -= dt); S.floats = S.floats.filter(f => f.t > 0);
    if (S.popups[0]) { S.popups[0].t -= dt; if (S.popups[0].t <= 0) S.popups.shift(); }
    if (S.chef.rush && S.chef.rush.flash > 0) S.chef.rush.flash -= dt;
    if (S.chef.rush && !(S.chef.cur && S.chef.cur.type === 'rush')) S.chef.rush.on = false;
    if (S.closed && !S.ended && !S.modal && !S.guests.some(g => g.state !== 'out') && !S.couriers.some(c => c.state !== 'out')) { S.ended = true; showEnd(); }
  }
  function frame(now) {
    if (!alive) return;
    const real = Math.min(0.05, (now - last) / 1000) * SPEED0; last = now;
    if (S.tut.tour >= 0 && S.chef.cur && S.chef.cur.practice) { S.mTime += real; if (S.chef.rush && S.chef.rush.flash > 0) S.chef.rush.flash -= real; }
    if (S.modal) {
      S.modal.left -= real;
      if (opts.auto || S.modal.left <= 0) closeEvent(opts.event.type === 'food' ? 'refuse' : 'ok');
    } else if (S.open && !S.ended && !S.tut.freeze) {
      for (let i = 0; i < speed; i++) { update(real); if (S.tut.freeze || S.modal) break; }
    }
    if (opts.auto && S.tut.freeze) S.tut.freeze = null;
    if (S.tut.flashAd > 0 && !S.tut.freeze) S.tut.flashAd -= real;
    if (S.tut.hints.length) { S.tut.hints.forEach(h => h.t -= real); S.tut.hints = S.tut.hints.filter(h => h.t > 0); }
    render();
    requestAnimationFrame(frame);
  }

  // ---- start / end cards ----
  function openDoors() { ov.hidden = true; S.tut.tour = -1; const ch = S.chef; if (ch.cur && ch.cur.practice) { ch.cur = null; ch.rush = null; } if (ch.mounted) { ch.mounted = false; ch.x = STOVE.x; ch.y = STOVE.y; ch.key = ''; } S.open = true; last = performance.now(); }
  function showStart() {
    if (opts.auto) return openDoors();
    ov.hidden = false;
    const where = LOC === 'city' ? 'City' : 'Countryside';
    if (S.tut.on && S.tut.steps.length) {
      ov.innerHTML = opts.tutorial === 'day1'
        ? `<div class="rcard"><h2>${where} · Day 1</h2><p>Your first night. Let's take a quick look around.</p><div class="row"><button type="button" class="cta inline" data-ov="tour">Show me around</button></div></div>`
        : `<div class="rcard"><h2>${where} · Day ${opts.day}</h2><p><b>New today:</b> the ad cards you bought work tonight, and events can happen.</p><div class="row"><button type="button" class="cta inline" data-ov="tour">Show me what's new</button></div></div>`;
      return;
    }
    ov.innerHTML = `<div class="rcard"><h2>${where} · Day ${opts.day}</h2><p>${opts.walkins + (opts.groups || []).filter(g => !g.noTable).reduce((a, g) => a + g.n, 0)} guests are on their way.</p><div class="row"><button type="button" class="cta inline" data-ov="open">Open the doors</button></div></div>`;
  }
  function result() { return { served: S.served, delivered: S.delivered, unhappy: S.unhappy, earned: Math.round(S.earned * 100) / 100, rushN: S.rushed, food: S.food }; }
  function showEnd() {
    const rows = [['Guests served', S.served], ...(S.delivered || S.couriers.length ? [['Delivery orders sent', S.delivered]] : []), ['Left unhappy', S.unhappy],
      ['Plates left over (they go bad)', S.plates], ['Plates you rushed', S.rushed ? `${S.rushed} (−$${S.spent})` : 0],
      ...Object.entries(S.cards).map(([n, c]) => [n, `${c.came} ${c.kind === 'orders' ? 'orders' : 'guests'}, ${c.served} served`]),
      ['Earned tonight', '+$' + Math.round((S.earned + S.tip) * 100) / 100]];
    if (opts.auto) { S.doneSent = true; return opts.onDone(result()); }
    ov.hidden = false;
    ov.innerHTML = `<div class="rcard"><h2>Closed for the night</h2><div class="rstats">${rows.map(([a, b]) => `<span>${escT(a)}</span><b>${escT(b)}</b>`).join('')}</div><div class="row"><button type="button" class="cta inline" data-ov="done">Close for the day →</button></div></div>`;
  }

  // ---- input ----
  function onPointer(e) {
    if (e.button !== 0) return;
    if (S.tut.tour >= 0) { if (S.chef.cur && S.chef.cur.practice) rushTry(); return; }
    if (!S.open || S.ended || S.modal) return;
    const f = S.tut.freeze;
    if (f) {
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(svg.getScreenCTM().inverse()), sp = f.spot;
      const inside = sp.c ? Math.hypot(q.x - sp.c[0], q.y - sp.c[1]) <= sp.c[2] : (q.x >= sp.r[0] && q.x <= sp.r[0] + sp.r[2] && q.y >= sp.r[1] && q.y <= sp.r[1] + sp.r[3]);
      if (inside) { enqueue({ type: f.wait, target: f.target }); return; }
    }
    const n = e.target.closest('[data-click]');
    if (!n) { const ch = S.chef; if (ch.mounted && !ch.cur && !ch.queue.length) startAction({ type: 'home' }); return; }
    const c = n.getAttribute('data-click');
    if (c === 'ride') { if (!rushTry()) enqueue({ type: 'rush', target: 'ride' }); return; }
    const id = +c.slice(1);
    if (c[0] === 'g') {
      const g = S.guests.find(x => x.id === id); if (!g) return;
      if (g.state === 'queue' || g.state === 'arrive') { if (g.state === 'arrive') return toast('Wait until they reach the door'); if (g.claimed && g.claimed !== S.chef) return toast('A bunny is already on it'); enqueue({ type: 'seat', target: g }); }
      else if (g.state === 'wait') { if (g.server && g.server !== S.chef) return toast('A bunny is already bringing a plate'); enqueue({ type: 'serve', target: g }); }
    } else if (c[0] === 'c') { const cc = S.couriers.find(x => x.id === id); if (cc && cc.state === 'wait') enqueue({ type: 'deliver', target: cc }); }
  }
  // pointerdown, not click: the bubbles and rings are redrawn every frame, and a click is lost when the element under the pointer is replaced between press and release
  svg.addEventListener('pointerdown', onPointer);
  function onKey(e) {
    if (!alive || !root.isConnected) return;
    if (e.code !== 'Space' || !(S.open || (S.chef.cur && S.chef.cur.practice)) || S.ended) return;
    // Space is the rush run during service, even if a button (a pop-up, a speed button) still has focus; only typing and open pop-ups keep it
    const a = document.activeElement, tag = a ? a.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || S.modal) return;
    if ((tag === 'BUTTON' || tag === 'SUMMARY') && !root.contains(a) && a.offsetParent !== null) return;
    e.preventDefault(); if (tag === 'BUTTON' || tag === 'SUMMARY') a.blur();
    if (!rushTry() && S.chef.mounted && !S.chef.cur && S.open) enqueue({ type: 'rush', target: 'ride' });   // still on the vehicle: ride again
  }
  window.addEventListener('keydown', onKey);
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.spd) { speed = +b.dataset.spd; root.querySelectorAll('[data-spd]').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    if (b.dataset.ov === 'tour') { ov.hidden = true; S.tut.tour = 0; if (S.tut.steps[0] && S.tut.steps[0].practice) startPractice(); return; }
    if (b.dataset.ov === 'open') return openDoors();
    if (b.dataset.ov === 'done') { if (!S.doneSent) { S.doneSent = true; b.disabled = true; opts.onDone(result()); } return; }
    if (b.dataset.ev) return closeEvent(b.dataset.ev);
    if (b.dataset.coach === 'next') {
      if (S.tut.tour < 0) return;
      S.tut.tour++;
      if (S.tut.tour >= S.tut.steps.length) return openDoors();
      if (S.tut.steps[S.tut.tour].practice) startPractice();
    }
  });
  function startPractice() { const ch = S.chef; ch.x = MOUNT.x; ch.y = MOUNT.y; ch.path = []; ch.mounted = true; ch.cur = { type: 'rush', target: 'ride', practice: true }; ch.rush = newRush(); ch.rush.on = true; }

  showStart();
  requestAnimationFrame(frame);
  return {
    el: root,
    cash: () => S.cash,
    state: () => S,
    destroy() { alive = false; window.removeEventListener('keydown', onKey); root.remove(); }
  };
}

// The hire-staff floor plan for the Build step (static; the page re-renders it on every click)
function floorPlan(loc, hired, animal, color) {
  const p = sceneParts(loc, new Set(hired), 'build', animal, color);
  return `<svg class="rrplan" viewBox="0 0 ${W} ${H}" role="img" aria-label="Your restaurant: click a section to hire or let go a bunny">${p.html}</svg>`;
}
function sectionCount(loc) { return typeof CFG !== 'undefined' ? CFG.loc[loc].tables / CFG.staff.perSection : (loc === 'country' ? 10 : 8); }
// Where the Build panel sits on the plan: the lower half of the kitchen (CSS for an absolutely placed box)
const buildBox = `left:${(KX / W * 100 + 0.8).toFixed(2)}%;top:${((SY + 138) / H * 100).toFixed(2)}%;width:${((KR - KX) / W * 100 - 1.6).toFixed(2)}%;height:${((RY + RH - SY - 138) / H * 100 - 1.5).toFixed(2)}%`;
// The kitchen above that panel: hovering it explains that you, the owner, work there
const kitchenBox = `left:${(KX / W * 100).toFixed(2)}%;top:${(RY / H * 100).toFixed(2)}%;width:${((KR - KX) / W * 100).toFixed(2)}%;height:${((SY + 130 - RY) / H * 100).toFixed(2)}%`;
// One section's rectangle on the plan (for tutorial spotlights and cropped pictures)
function sectionRect(loc, i) { const sc = sceneParts(loc, new Set(), 'build', 'cat', '#000').sections[i]; return { x: sc.x, y: sc.y, w: sc.w, h: sc.h, W, H }; }
window.RRService = { create, floorPlan, sectionCount, buildBox, kitchenBox, sectionRect };
})();
