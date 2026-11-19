// ===== Page: lobby, online sync through Firebase (Firestore + anonymous sign-in), local test mode =====
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = n => { const v = Math.abs(n), t = Number.isInteger(v) ? String(v) : v.toFixed(2); return (n < 0 ? '−$' : '$') + t; };
const ex = n => String(Math.round(n * 10) / 10); // expected head count, one decimal
const lsGet = k => { try { return localStorage.getItem('rr:' + k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem('rr:' + k, v); } catch (e) {} };
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = (n = 4) => { const a = new Uint32Array(n); crypto.getRandomValues(a); return [...a].map(x => CODE_CHARS[x % CODE_CHARS.length]).join(''); };
const randHex = () => { const a = new Uint8Array(12); crypto.getRandomValues(a); return [...a].map(x => x.toString(16).padStart(2, '0')).join(''); };
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const other = s => (s === 'p1' ? 'p2' : 'p1');

const app = {
  mode: null, fb: null, uid: null, dbReady: false, dbMsg: 'Connecting…',
  code: null, seed: null, seats: {}, logs: { p1: [], p2: [] }, me: null, view: 'p1',
  nick: (lsGet('nick') || '').slice(0, 12), S: null, form: {}, priv: {}, revealing: {}, unsub: [], chain: Promise.resolve(),
  err: '', busy: false, loadNote: '', intro: 0,
  mkt: null, mktUnsub: null, cool: {}, claiming: {}, svc: {}, ticker: null,
  howto: null, cover: null, acked: {}, mornSeen: {}, endStep: {}, stageT0: {}, autoDone: {},
  invite: null, resume: null, showJoin: false
};

window.__rr = app; // debugging: type __rr.S in the browser console to see the game state

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ---------- seats & names ----------
const controlled = () => (app.mode === 'local' ? ['p1', 'p2'] : [app.me]);
const viewer = () => (app.mode === 'local' ? app.view : app.me);
function nameOf(s) {
  if (app.mode === 'local') return s === 'p1' ? 'Player 1' : 'Player 2';
  if (s === app.me) return 'You';
  return (app.seats[s] && app.seats[s].name) || 'Rival';
}
function seatTag(s) { return s === 'p1' ? 'P1' : 'P2'; }
// "Your" for yourself online, otherwise "Name's"
const poss = s => (app.mode !== 'local' && s === app.me ? 'Your' : `${esc(nameOf(s))}'s`);

// ---------- Firebase backend ----------
// fb wraps the few Firestore calls the game needs, so the rest of the page never touches the SDK directly.
(async () => {
  // Test hook: automated tests can inject a fake backend; absent in normal use
  if (typeof window.__RR_FAKE_FB === 'function') {
    app.fb = window.__RR_FAKE_FB(); app.uid = app.fb.uid; app.dbReady = true; app.dbMsg = ''; return setTimeout(boot, 0); // after the whole module has loaded
  }
  const cfg = window.FIREBASE_CONFIG || {};
  if (!cfg.apiKey || !cfg.projectId) {
    app.dbMsg = 'Online play is off: firebase-config.js is empty. Try Local test for now.';
    return render();
  }
  try {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
    const fbApp = initializeApp(cfg), auth = A.getAuth(fbApp), db = F.getFirestore(fbApp);
    const cred = auth.currentUser ? { user: auth.currentUser } : await A.signInAnonymously(auth);
    app.uid = cred.user.uid;
    const ref = p => F.doc(db, p);
    app.fb = {
      async get(p) { const s = await F.getDoc(ref(p)); return { exists: s.exists(), data: s.exists() ? s.data() : null }; },
      set: (p, d) => F.setDoc(ref(p), d),
      watchDoc: (p, next, err) => F.onSnapshot(ref(p), { includeMetadataChanges: false },
        s => next({ exists: s.exists(), data: s.exists() ? s.data() : null, fromCache: s.metadata.fromCache }), err),
      watchCol: (p, next, err) => F.onSnapshot(F.collection(db, p), s => next(s.docs.map(d => ({ id: d.id, data: d.data() }))), err),
      // Take seat p2 only if nobody else holds it; the transaction makes two joiners at once safe.
      claim: (p, data) => F.runTransaction(db, async tx => {
        const s = await tx.get(ref(p));
        if (s.exists() && s.data().uid && s.data().uid !== data.uid) throw { code: 'seat-taken' };
        tx.set(ref(p), data);
      }),
      // Read-modify-write in one transaction: fn(data) returns the new doc, or null to leave it alone (it may throw).
      tx: (p, fn) => F.runTransaction(db, async tx => {
        const s = await tx.get(ref(p));
        const next = fn(s.exists() ? s.data() : null);
        if (next) tx.set(ref(p), next);
        return next;
      })
    };
    app.dbReady = true; app.dbMsg = '';
  } catch (e) {
    const c = e && e.code || '';
    app.dbMsg = c === 'auth/operation-not-allowed' ? 'Online play is off: turn on Anonymous sign-in in Firebase.'
      : c === 'auth/unauthorized-domain' ? "This site isn't on Firebase's authorized domains yet. Add it under Authentication settings."
      : "Can't reach the server. Check your connection and refresh, or try Local test.";
  }
  if (app.dbReady) boot(); else render();
})();

// Start-up: an invite link (?room=CODE) opens the invite page; otherwise look for an unfinished game on this device.
const clearRoomParam = () => { if (location.search) try { history.replaceState(null, '', location.pathname); } catch (e) {} };
async function boot() {
  const q = new URLSearchParams(location.search).get('room');
  if (q) {
    const code = q.trim().toUpperCase();
    try {
      const g = /^[A-Z0-9]{4}$/.test(code) && await app.fb.get(`games/${code}`);
      if (g && g.exists) {
        const [x, y] = await Promise.all(['p1', 'p2'].map(s => app.fb.get(`games/${code}/seats/${s}`)));
        if (x.exists && x.data.uid === app.uid) return enter(code, 'p1');
        if (y.exists && y.data.uid === app.uid) return enter(code, 'p2');
        if (y.exists && y.data.uid) app.err = `Room ${code} already has two players. Ask your old partner for a new link.`;
        else { app.invite = { code, name: x.exists ? String(x.data.name || '').slice(0, 12) : '' }; return render(); }
      } else app.err = `No room called ${code}. Ask your old partner for a new link.`;
    } catch (e) { app.err = writeErr(e); }
    clearRoomParam();
  }
  await loadResume(); render();
}
// The last room this device played in, if that game isn't over: shown as "Your game is still going"
async function loadResume() {
  app.resume = null;
  const code = lsGet('lastCode');
  if (!code || !app.fb) return;
  try {
    const g = await app.fb.get(`games/${code}`); if (!g.exists) return;
    const seat = await Promise.all(['p1', 'p2'].map(s => app.fb.get(`games/${code}/seats/${s}`)));
    const i = seat.findIndex(x => x.exists && x.data.uid === app.uid); if (i < 0) return;
    const me = i ? 'p2' : 'p1', o = i ? 'p1' : 'p2', them = seat[1 - i];
    const log = x => (x.exists && Array.isArray(x.data.log) ? x.data.log : []);
    const S = simulate(g.data.seed, { p1: log(seat[0]), p2: log(seat[1]) });
    if (S.phase === 'over') return;
    // Compare at the end of the last day both played, so nothing secret from today shows
    const h = s => S.players[s].history, d = Math.min(h(me).length, h(o).length);
    const sc = s => { const e = h(s)[d - 1]; return e.cash + e.stars * CFG.starValue; };
    app.resume = { code, day: Math.max(1, S.round), started: S.phase !== 'pick',
      rival: them.exists && them.data.uid ? String(them.data.name || '').slice(0, 12) || 'Rival' : '', gap: d ? round2(sc(me) - sc(o)) : null };
  } catch (e) {}
}

function writeErr(e) {
  const c = e && e.code || '';
  if (c === 'seat-taken') return 'That room is full.';
  if (c === 'permission-denied') return 'The server said no. Check that the Firestore rules are published.';
  if (c === 'resource-exhausted') return "We're out of free Firebase quota for today. Try tomorrow.";
  return 'Connection hiccup. Try again in a bit.';
}
function saveNick() {
  const el = $('#nick-in'); if (!el) return;
  app.nick = el.value.trim().slice(0, 12); lsSet('nick', app.nick);
}

// ---------- online: create / join / sync ----------
async function createGame() {
  if (!app.dbReady || app.busy) return;
  saveNick(); app.busy = true; app.err = ''; render();
  try {
    for (let i = 0; i < 6; i++) {
      const code = genCode();
      if ((await app.fb.get(`games/${code}`)).exists) continue;
      await app.fb.set(`games/${code}`, { seed: genCode(8) + Date.now(), host: app.uid, created: Date.now(), v: 2 });
      await app.fb.set(`games/${code}/seats/p1`, { uid: app.uid, name: app.nick, log: [] });
      app.busy = false; return enter(code, 'p1');
    }
    app.err = "Couldn't make a room. Try again.";
  } catch (e) { app.err = writeErr(e); }
  app.busy = false; render();
}
async function joinGame(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { app.err = 'Room codes are 4 letters or numbers.'; return render(); }
  if (!app.dbReady || app.busy) return;
  saveNick(); app.busy = true; app.err = ''; render();
  try {
    const g = await app.fb.get(`games/${code}`);
    if (!g.exists) { app.err = `No room called ${code}.`; app.busy = false; return render(); }
    const [a, b] = await Promise.all(['p1', 'p2'].map(s => app.fb.get(`games/${code}/seats/${s}`)));
    if (a.exists && a.data.uid === app.uid) { app.busy = false; return enter(code, 'p1'); }
    if (b.exists && b.data.uid === app.uid) { app.busy = false; return enter(code, 'p2'); }
    await app.fb.claim(`games/${code}/seats/p2`, { uid: app.uid, name: app.nick, log: [] });
    app.busy = false; enter(code, 'p2');
  } catch (e) { app.err = writeErr(e); app.busy = false; render(); }
}
function resetLive() {
  if (app.mktUnsub) { try { app.mktUnsub(); } catch (e) {} }
  Object.assign(app, { mkt: null, mktUnsub: null, cool: {}, claiming: {}, svc: {}, intro: 0 });
}
function enter(code, seat) {
  leave(true);
  Object.assign(app, { mode: 'online', code, me: seat, view: seat, seed: null, seats: {}, logs: { p1: [], p2: [] },
    S: null, form: {}, revealing: {}, err: '', loadNote: '' });
  lsSet('lastCode', code); app.invite = null; app.showJoin = false; clearRoomParam();
  const timer = setTimeout(() => { if (!app.seed) { app.loadNote = "Can't reach the game yet. Still trying…"; render(); } }, 10000);
  app.unsub.push(app.fb.watchDoc(`games/${code}`, snap => {
    if (snap.exists) { app.seed = snap.data.seed; clearTimeout(timer); app.loadNote = ''; refresh(); }
    else if (!snap.fromCache) { clearTimeout(timer); app.loadNote = 'This game is gone.'; render(); }
  }, () => { clearTimeout(timer); app.loadNote = 'Lost the connection. Refresh the page.'; render(); }));
  app.unsub.push(app.fb.watchCol(`games/${code}/seats`, docs => {
    for (const d of docs) {
      if (d.id !== 'p1' && d.id !== 'p2') continue;
      const remote = Array.isArray(d.data.log) ? d.data.log : [];
      app.seats[d.id] = { uid: d.data.uid, name: String(d.data.name || '').slice(0, 12) };
      if (d.id === app.me && app.logs[d.id].length > remote.length) continue;
      app.logs[d.id] = remote;
    }
    refresh();
  }, () => { app.loadNote = 'Lost the connection. Refresh the page.'; render(); }));
  render();
}
function leave(silent) {
  app.unsub.forEach(u => { try { u(); } catch (e) {} }); app.unsub = [];
  resetLive();
  if (!silent) { Object.assign(app, { mode: null, code: null, S: null, seed: null, err: '' }); render(); loadResume().then(render); }
}
function startLocal() {
  leave(true);
  Object.assign(app, { mode: 'local', code: 'local' + Date.now(), me: null, view: 'p1', seed: genCode(8) + Date.now(), seats: {},
    logs: { p1: [], p2: [] }, S: null, form: {}, revealing: {}, priv: {}, err: '', cover: null });
  refresh();
}

// ---------- actions ----------
function act(seat, a) {
  a.t = Date.now();
  app.logs[seat] = [...app.logs[seat], a];
  if (app.mode === 'online') {
    const path = `games/${app.code}/seats/${seat}`;
    app.chain = app.chain.then(() => app.fb.set(path, { uid: app.uid, name: app.nick, log: app.logs[seat] }))
      .catch(e => toast(writeErr(e)));
  }
  refresh();
}
// Which ad cards you bought stays on your own device (and in your private Firebase folder) until both players have placed theirs.
const privKey = (s, r) => `${app.code}:${r}:${s}`;
function myCards(s) {
  const key = privKey(s, app.S.round);
  if (!app.priv[key] && app.mode === 'online') { try { const v = JSON.parse(lsGet('ad:' + key) || 'null'); if (v) app.priv[key] = v; } catch (e) {} }
  return app.priv[key] || null;
}
async function commitCards(s, k, c) {
  const r = app.S.round, priv = { ...c, salt: randHex() };
  app.priv[privKey(s, r)] = priv;
  if (app.mode === 'online') {
    lsSet('ad:' + privKey(s, r), JSON.stringify(priv));
    try { await app.fb.set(`users/${app.uid}/ads/${app.code}-r${r}`, priv); } catch (e) {}
  }
  act(s, { k, h: adHash(c, priv.salt), nSelf: c.self.length, nRival: c.rival.length, cost: adCost(c), bump: adBump(app.seed, r, s, c.rival) });
}
async function doReveal(s, k, r) {
  let priv = app.priv[privKey(s, r)];
  if (!priv && app.mode === 'online') {
    try { priv = JSON.parse(lsGet('ad:' + privKey(s, r)) || 'null'); } catch (e) {}
    if (!priv) { try { const d = await app.fb.get(`users/${app.uid}/ads/${app.code}-r${r}`); if (d.exists) priv = d.data; } catch (e) {} }
  }
  if (!priv) { priv = { self: [], rival: [], salt: '' }; toast("Couldn't find your cards, so they do nothing this round."); }
  act(s, { k, self: priv.self || [], rival: priv.rival || [], salt: priv.salt });
}

function refresh() {
  if (!app.seed) return render();
  app.S = simulate(app.seed, app.logs);
  const S = app.S;
  if (S.phase === 'reveal') for (const s of controlled()) {
    const k = S.waiting[s];
    if (k && !app.revealing[s + k]) { app.revealing[s + k] = true; doReveal(s, k, S.round); }
  }
  if (S.phase === 'market') ensureMarket();
  // The morning news is shown inside Build, so the morning step is acknowledged automatically
  if (S.phase === 'morning') for (const s of controlled()) {
    const k = S.waiting[s];
    if (k && !app.acked[app.code + s + k]) { app.acked[app.code + s + k] = true; return act(s, { k }); }
  }
  if (app.mode === 'local' && !S.waiting[app.view]) {
    const o = other(app.view);
    if (S.waiting[o] && S.phase !== 'reveal') { app.view = o; if (PRIVATE_PHASES.includes(S.phase)) app.cover = o; }
  }
  setTicker();
  render();
}
// Steps with secrets: in one-screen practice, a cover screen hides them while the screen is passed over
const PRIVATE_PHASES = ['pick', 'invest', 'commit'];

// ---------- live clock: market and service run in real time ----------
function setTicker() {
  const live = app.S && (app.S.phase === 'market' || controlled().some(s => stageDeadline(s)));
  if (live && !app.ticker) app.ticker = setInterval(tick, 200);
  if (!live && app.ticker) { clearInterval(app.ticker); app.ticker = null; }
}
// Re-render only when something visible changes (so buttons stay put and clicks never get lost); otherwise just move the bars.
function tick() {
  const S = app.S; if (!S) return;
  if (S.phase === 'market') marketTick();
  if (stageTick()) return;
  if (!app.S || app.S.phase !== 'market') return;
  const sig = liveSig();
  if (sig !== app.sig) render(); else updateBars();
}
function liveSig() {
  const S = app.S, now = Date.now();
  if (S.phase === 'market') return JSON.stringify([app.mkt && app.mkt.owner, app.mkt && !!app.mkt.start, mktOpen(), app.mkt && app.mkt.ready, controlled().map(s => [!!(app.cool[s] && now < app.cool[s].until), !!app.claiming[s]]), mktTimeLeft() > 0, S.waiting, S.submitted, app.view]);
  return '';
}
// Time-driven bars: data-t0 / data-t1 are timestamps; drain bars empty out instead of filling up.
function updateBars() {
  const now = Date.now();
  document.querySelectorAll('[data-t0]').forEach(el => {
    let f = Math.max(0, Math.min(1, (now - +el.dataset.t0) / (+el.dataset.t1 - +el.dataset.t0)));
    if (el.dataset.drain) { f = 1 - f; el.classList.toggle('hot', f < 0.35); }
    if (el.dataset.ring) { el.style.setProperty('--p', f); return; }
    if (el.firstElementChild) el.firstElementChild.style.width = f * 100 + '%';
  });
  document.querySelectorAll('[data-count]').forEach(el => { el.textContent = Math.max(0, Math.ceil((+el.dataset.count - now) / 1000)) + 's'; });
  document.querySelectorAll('[data-clock]').forEach(el => { const left = Math.max(0, Math.ceil((+el.dataset.clock - now) / 1000)); el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; el.parentElement.classList.toggle('hot', left <= 30); });
}
const tbar = (t0, t1, drain) => `<span class="pbar" data-t0="${t0}" data-t1="${t1}" ${drain ? 'data-drain="1"' : ''}><i></i></span>`;

// ---------- market: first click wins ----------
const mktPath = () => `games/${app.code}/market/d${app.S.round}`;
function ensureMarket() {
  const key = `${app.code}:${app.seed}:${app.S.round}`;
  if (app.mkt && app.mkt.key === key) return;
  if (app.mktUnsub) { try { app.mktUnsub(); } catch (e) {} app.mktUnsub = null; }
  // The 60 seconds don't start until both players have read the market briefing and pressed Start
  // (or MKT_WAIT after the first one did). `start` is then set a few seconds ahead for a "get ready" countdown.
  app.mkt = { key, owner: {}, start: null, ready: {}, mine: {} };
  app.cool = {}; app.claiming = {};
  if (app.mode === 'local') return;
  app.mktUnsub = app.fb.watchDoc(mktPath(), snap => {
    if (!app.mkt || app.mkt.key !== key) return;
    const d = snap.data || {};
    app.mkt.owner = { ...(d.owner || {}), ...app.mkt.mine };
    app.mkt.ready = d.ready || {};
    if (d.start) app.mkt.start = d.start;
    render();
  });
}
const MKT_COUNTDOWN = 3000, MKT_WAIT = 30000;
function marketReady(s) {
  if (!app.mkt || app.mkt.start) return;
  if (app.mode === 'local') { app.mkt.start = Date.now() + MKT_COUNTDOWN; return render(); }
  app.mkt.ready = { ...app.mkt.ready, [s]: Date.now() }; render();
  app.fb.tx(mktPath(), d => {
    d = d || {};
    if (d.start) return null;
    const ready = { ...(d.ready || {}), [s]: Date.now() };
    return { ...d, owner: d.owner || {}, ready, ...(ready.p1 && ready.p2 ? { start: Date.now() + MKT_COUNTDOWN } : {}) };
  }).then(d => { if (d && d.start && !app.mkt.start) app.mkt.start = d.start; }).catch(e => toast(writeErr(e)));
}
// If one player never presses Start, open the market anyway MKT_WAIT after the other did
function marketForceStart() {
  const m = app.mkt; if (!m || m.start || m.forcing || app.mode === 'local') return;
  const first = Math.min(...Object.values(m.ready || {}).filter(Number.isFinite));
  if (!Number.isFinite(first) || Date.now() < first + MKT_WAIT) return;
  m.forcing = true;
  app.fb.tx(mktPath(), d => (d && d.start ? null : { ...(d || {}), owner: (d && d.owner) || {}, start: Date.now() + MKT_COUNTDOWN }))
    .then(d => { if (d && d.start && !m.start) m.start = d.start; }).catch(() => {}).finally(() => { m.forcing = false; });
}
const mktOpen = () => !!(app.mkt && app.mkt.start && Date.now() >= app.mkt.start);
const mktTimeLeft = () => (app.mkt && app.mkt.start ? CFG.market.time * 1000 - (Date.now() - app.mkt.start) : CFG.market.time * 1000);
const ownedBy = s => Object.keys(app.mkt ? app.mkt.owner : {}).filter(i => app.mkt.owner[i] === s).map(Number).sort((a, b) => a - b);
function mktCashLeft(s) {
  const S = app.S, items = S.market.items;
  return S.players[s].cash - adReserve(s) - ownedBy(s).reduce((a, i) => a + itemPrice(items[i]), 0);
}
async function claimItem(s, i) {
  const S = app.S, M = CFG.market, it = S.market.items[i], type = it.t, k = S.waiting[s];
  if (!k || app.claiming[s] || !mktOpen()) return;
  const c = app.cool[s];
  if (c && Date.now() < c.until) { const el = document.querySelector('.strip'); if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); } return toast('Wait for your delivery to finish first.'); }
  if (app.mkt.owner[i]) return toast(app.mkt.owner[i] === s ? 'You already have that one.' : `Too slow! ${nameOf(app.mkt.owner[i])} got that one.`);
  if (mktTimeLeft() <= 0) return;
  if (mktCashLeft(s) < itemPrice(it)) return toast(`Not enough cash for this bundle ($${itemPrice(it)}).`);
  app.claiming[s] = true;
  try {
    if (app.mode === 'online') {
      await app.fb.tx(mktPath(), d => {
        d = d || { owner: {}, start: Date.now() };
        if (d.owner[i]) throw { code: 'taken' };
        return { ...d, owner: { ...d.owner, [i]: s } };
      });
      app.mkt.mine[i] = s;
    }
    app.mkt.owner[i] = s;
    app.cool[s] = { i, type, start: Date.now(), until: Date.now() + M[type].cd * 1000 };
  } catch (e) {
    toast(e && e.code === 'taken' ? `Too slow! ${nameOf(other(s))} got that one.` : writeErr(e));
  }
  app.claiming[s] = false;
  render();
}
function finishMarket(s) {
  const k = app.S.waiting[s];
  if (!k || app.claiming[s]) return;
  act(s, { k, buys: ownedBy(s) });
}
function marketTick() {
  const S = app.S, free = S.market.items.some((_, i) => !app.mkt.owner[i]);
  if (!mktOpen()) return marketForceStart();
  for (const s of controlled()) if (S.waiting[s] && !app.claiming[s] && (mktTimeLeft() <= 0 || !free)) finishMarket(s);
}

// ---------- service: play the day back, pausing for shortages and choices ----------
// ---------- step timer: pick, ads, staff, vouchers and recap each get CFG.stageSeconds ----------
const TIMED = ['pick', 'commit', 'invest', 'voucher', 'report'];
// The clock starts when the step starts: the newest action in either log (the one that ended the step before).
// Picking starts when this player reaches the pick screen (the story before it isn't timed).
function stageDeadline(s) {
  const S = app.S;
  if (!S || !S.waiting[s] || !TIMED.includes(S.phase) || !CFG.stageSeconds) return null;
  if (app.mode === 'local' && s !== app.view) return null;   // one screen: only the player holding it is on the clock
  if (S.phase === 'pick') {
    if (app.intro < INTRO_ALL()) return null;
    const key = `${app.code}:pick:${s}`; app.stageT0[key] = app.stageT0[key] || Date.now(); return app.stageT0[key] + CFG.stageSeconds * 1000;
  }
  let t0 = 0;
  for (const w of ['p1', 'p2']) for (const a of app.logs[w]) if (a && a.t > t0) t0 = a.t;
  return (t0 || Date.now()) + CFG.stageSeconds * 1000;
}
// Time's up: go on with whatever the player has chosen so far (safe defaults otherwise)
function autoSubmit(s) {
  const S = app.S, k = S.waiting[s], p = S.players[s], f = app.form[s + '|' + k] || {};
  if (!k || app.autoDone[s + k]) return; app.autoDone[s + k] = true;
  toast("Time's up! We went on with your choices so far.");
  switch (S.phase) {
    case 'pick': return act(s, { k, loc: f.loc || 'country' });
    case 'commit': { const sel = f.sel || [], A = CFG.ads; return commitCards(s, k, { self: sel.filter(id => A[id].side === 'self'), rival: sel.filter(id => A[id].side === 'rival') }); }
    case 'invest': return act(s, { k, staff: f.staff || p.staff.slice(), choice: f.choice || null, loan: false });
    case 'voucher': return act(s, { k, n: f.n || 0 });
    case 'report': return act(s, { k });
  }
}
// Called by the ticker: run out the clock, keep the countdown moving. True when it handled the tick.
function stageTick() {
  const now = Date.now(); let any = false;
  for (const s of controlled()) { const d = stageDeadline(s); if (d === null) continue; any = true; if (now >= d) { autoSubmit(s); return true; } }
  if (any && app.S.phase !== 'market') { updateBars(); return true; }
  return false;
}
const timerPill = s => { const d = stageDeadline(s); if (d === null) return '';
  const left = Math.max(0, Math.ceil((d - Date.now()) / 1000));
  return `<div class="steptimer ${left <= 30 ? 'hot' : ''}" role="timer" aria-label="Time left for this step">⏱ <b data-clock="${d}">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b><span>left for this step</span></div>`; };

// ---------- form state ----------
function F(defaults) {
  const s = viewer(), k = app.S.waiting[s] || 'none', key = s + '|' + k;
  if (!app.form[key]) app.form[key] = { ...defaults };
  return app.form[key];
}

// =====================================================================
// Rendering (UI v3). Every screen is built from plain words: what happened to you, and why.
// =====================================================================
const V = 'v35';
const IMG = { art: `assets/key-art.jpg?v=${V}`, country: `assets/countryside.jpg?v=${V}`, city: `assets/city.jpg?v=${V}` };
const STEPS = [['commit', 'Ads'], ['invest', 'Staff'], ['market', 'Market'], ['service', 'Service'], ['report', 'Recap']];
// Day 1 has no Market (free food instead), and ads start on day CFG.adsFrom (then they are the first step), so early days have fewer steps
const stepsFor = r => STEPS.filter(x => !(x[0] === 'market' && r === 1 && CFG.freeFood) && !(x[0] === 'commit' && r < CFG.adsFrom));
const stepOf = p => ({ morning: app.S && app.S.round >= CFG.adsFrom ? 'commit' : 'invest', reveal: 'service', voucher: 'service' })[p] || p;
// Cards are paid when they flip (after the Market), so until then the page keeps their price aside
function adReserve(s) {
  const S = app.S;
  return 0; // ads are paid in the Ads step now, so nothing is kept aside
}
// What a player knows before the flip: how many cards the rival placed on them, not which
// Extra guests the rival's hidden cards seem to bring (False advertisement and Swamp them), until the cards flip
function looksBump(s) { const S = app.S, c = S.commits && S.commits[other(s)]; return S.round >= CFG.adsFrom && c && !(S.reveals && S.reveals[other(s)]) ? c.bump || 0 : 0; }
// Tonight's guest estimate: regulars, stars, your own ads and what the rival's hidden ads seem to bring
function guestGuess(s) { const S = app.S, mine = S.round >= CFG.adsFrom ? myCards(s) : null; return expectedDemand(S.players[s], mine ? mine.self : [], looksBump(s)); }
function rivalCardsNote(s) {
  const S = app.S, o = other(s), n = S.round >= CFG.adsFrom && S.commits && S.commits[o] ? S.commits[o].nRival : 0;
  return n ? `<span class="pill2 rivalcards">📣 ${esc(nameOf(o))} placed ${plural(n, 'ad')} for you · revealed before dinner</span>` : '';
}
const PRIVATE_LINES = ['Shady deal', 'Reservation paid', 'Inspector fine'];
const PRIVATE_WHY = ['reservation had no seat −1', 'inspector −1'];
// The opening story (wording from the agreed mockups): one line per card
const INTRO = [
  { pic: 'team', t: 'You two were the best team at the Two Spoons.' },
  { pic: 'review', t: 'One bad review. Each blamed the other. It closed.' },
  { pic: 'apart', t: 'You went separate ways. Years passed. Not one word.' },
  { pic: 'prize', t: 'Then the Golden Spoon named its prize: the Two Spoons.' },
  { pic: 'final', t: 'You made the final. So did they.' }];
// After the story: four pages on the goal (from the team's sketch). app.intro counts story pages, then these.
const GOAL_PAGES = [
  { chip: 'YOUR GOAL', cap: 'Win the Golden Spoon competition.', sub: () => 'Then you get the keys and <b>re-open the Two Spoons restaurant.</b>' },
  { chip: 'HOW TO WIN', cap: 'Every dollar counts.', sub: () => 'Each day you spend money on staff, food and ads. <b>Spend it wisely!</b>' },  // the picture already says "earn the most money", and stars have their own page next (playtest Nov 17: it felt repetitive)
  { chip: 'STARS', cap: 'Star ratings can increase your money.', sub: () => `Each star pays you <b>$${CFG.starValue} every night</b>, and adds a <b>$${CFG.starValue} bonus</b> at the end of ${CFG.rounds} days.` },
  { chip: 'REMEMBER!', cap: 'Your rival is also trying to win!', sub: () => 'Watch what they do, and look out for tricks. You can play tricks too… <b>May the best restaurateur win!</b>' }];
const INTRO_ALL = () => INTRO.length + GOAL_PAGES.length;
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const gold = (t, cls = '') => `<span class="gold ${cls}" aria-hidden="true">${t}</span>`;
const score = s => { const p = app.S.players[s]; return round2(p.cash + p.stars * CFG.starValue); };
const restName = loc => (loc === 'city' ? 'City' : 'Countryside');

function render() {
  if (app.mode === 'local') document.body.dataset.view = app.view; else delete document.body.dataset.view;
  renderBar();
  const root = $('#app');
  if (!app.mode) root.innerHTML = lobbyHTML();
  else if (!app.S) root.innerHTML = `<section class="panel" style="max-width:520px;justify-self:center"><p class="wait"><span class="dot round rival"></span>Loading the game…</p>${app.loadNote ? `<p class="err">${esc(app.loadNote)}</p>` : ''}<div class="row"><button class="btn" data-act="leave">Back to the start</button></div></section>`;
  else root.innerHTML = gameHTML();
  $('#modal').innerHTML = app.howto ? howtoHTML() : '';
  app.sig = app.S && app.S.phase === 'market' ? liveSig() : '';
  setTicker();   // the step timer can start from a page click (e.g. reaching the pick screen)
  updateBars();
  mountService();
}

// ---------- header ----------
// The day's steps as one progress bar (not tabs: nothing here is clickable)
function progressHTML(S) {
  const st = stepsFor(S.round), i = st.findIndex(x => x[0] === stepOf(S.phase)), n = st.length, name = st[i] ? st[i][1] : '';
  return `<div class="pgbar" role="progressbar" aria-valuemin="1" aria-valuemax="${n}" aria-valuenow="${i + 1}" aria-label="Day ${S.round} of ${CFG.rounds}, step ${i + 1} of ${n}: ${name}">
    <div class="ph"><span class="gold sm">Day ${S.round} of ${CFG.rounds}</span><b>${S.round === CFG.rounds ? 'Last day · ' : ''}${name}</b></div>
    <div class="track"><i style="width:${(i + 0.5) / n * 100}%"></i>${st.slice(1).map((_, j) => `<s style="left:${(j + 1) / n * 100}%"></s>`).join('')}</div>
    <div class="lbls">${st.map((x, j) => `<span class="${j === i ? 'on' : j < i ? 'done' : ''}">${x[1]}</span>`).join('')}</div></div>`;
}
// Cash as the player sees it right now (it moves during the Market and Service)
function liveCash(s) {
  const S = app.S, p = S.players[s];
  if (S.phase === 'market' && app.mkt && controlled().includes(s) && S.waiting[s]) return mktCashLeft(s);
  if (S.phase === 'service' && app.svcInst && app.svcInst.key === svcKey(s)) return app.svcInst.cash();
  return p.cash;
}
// The rival's cash as of the end of their last day (day 1: after opening and rent). Their cash during the day would give away secret offers.
function rivalCash(o) {
  const q = app.S.players[o], h = q.history[q.history.length - 1];
  return h ? h.cash : CFG.startCash - CFG.loc[q.loc].open - CFG.loc[q.loc].rent;
}
const miniStars = (n, cls) => `<span class="ministars ${cls}" role="img" aria-label="${n} of 5 stars">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('')}</span>`;
// Light / dark theme: follows the computer's setting until the player picks one with the header button (remembered on this device)
const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
{ const t = lsGet('theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; }
// Online, before the second player has joined: the waiting room
const inRoom = () => app.mode === 'online' && app.S && app.S.phase === 'pick' && !(app.seats.p2 && app.seats.p2.uid);
function renderBar() {
  const S = app.S, bar = $('#bar');
  let mid = '', pills = '', logo = !!app.mode;
  if (S && app.mode && !inRoom()) {
    if (S.phase === 'invest' && S.round === 1 && CFG.freeFood && S.waiting[viewer()] && !(app.form[`${viewer()}|${S.waiting[viewer()]}`] || {}).gift) logo = false;
    else if (S.phase === 'pick') {
      logo = false;
      if (app.intro >= INTRO_ALL()) mid = `<span class="daypill"><span>Day <b>1</b> of ${CFG.rounds}</span><i></i><b class="num">$${CFG.startCash}</b><i></i><span class="gstars" role="img" aria-label="${CFG.startStars} of 5 stars">${'★'.repeat(CFG.startStars)}<span>${'★'.repeat(5 - CFG.startStars)}</span></span></span>`;
    }
    else if (S.phase === 'over') mid = `<span class="day"><b>Game over</b> · ${S.result.reason === 'bankrupt' ? 'a restaurant closed' : '5 days played'}</span>`;
    else {
      const s = viewer(), o = other(s), p = S.players[s], q = S.players[o];
      mid = progressHTML(S);
      pills = `<div class="pill you"><b>${app.mode === 'online' ? 'You' : esc(nameOf(s))}</b><span class="num">${usd(liveCash(s))}</span>${miniStars(p.stars, 'you')}</div>
        <div class="pill rival"><b>${esc(nameOf(o))}</b>${q.loc ? `<span class="loc" title="Their restaurant">${restName(q.loc)}</span>` : ''}<span class="num" title="Cash at the end of their last day">${usd(rivalCash(o))}</span>${miniStars(q.stars, 'rival')}<span class="st">${themStatus(o)}</span></div>`;
    }
  }
  let tools = '';
  if (app.mode === 'online' && !inRoom() && !(S && S.phase === 'pick')) tools = `<span>Room <b style="color:var(--ink);letter-spacing:.06em">${esc(app.code)}</b> · ${seatTag(app.me)}</span><button class="btn" data-act="copy" aria-label="Copy room code">${ART.icon('copy', 14)}</button>`;
  if (app.mode === 'local') tools = `<span>Practice</span>${['p1', 'p2'].map(s => `<button class="btn" data-act="view" data-seat="${s}" aria-pressed="${app.view === s}" style="${app.view === s ? 'border-color:var(--ink)' : ''}">Player ${s === 'p1' ? 1 : 2}${S && S.waiting[s] ? ' •' : ''}</button>`).join('')}`;
  tools += `<button class="btn round" data-act="theme" aria-label="Switch to ${isDark() ? 'light' : 'dark'} theme" title="Switch to ${isDark() ? 'light' : 'dark'} theme">${ART.icon(isDark() ? 'sun' : 'moon', 16)}</button>`;
  if (!inRoom()) tools += `<button class="btn${app.mode ? ' help' : ' pillbtn'}" data-act="howto" aria-label="How to play" title="How to play">${app.mode ? '?' : 'How to play'}</button>`;
  if (app.mode) tools += inRoom() ? '<button class="linkish quiet" data-act="leave">Leave room</button>' : `<button class="btn" data-act="leave">${app.mode === 'local' ? 'Quit' : 'Leave'}</button>`;
  bar.classList.toggle('bare', !mid && !pills);
  bar.innerHTML = `${logo ? `<span class="logo">${ART.badge('hd')}</span>` : ''}<div class="mid">${mid}</div>${pills ? `<div class="pills">${pills}</div>` : ''}<div class="tools">${tools}</div>`;
}

// ---------- landing ----------
const initial = n => esc((String(n || '').trim()[0] || '?').toUpperCase());
function lobbyHTML() {
  const ok = app.dbReady && !app.busy;
  const note = !app.dbMsg ? '' : app.dbMsg === 'Connecting…' ? '<p class="wait"><span class="dot round you"></span>Connecting to the game server…</p>' : `<div class="callout bad">${ART.icon('warn', 20)}<span>${esc(app.dbMsg)}</span></div>`;
  const err = app.err ? `<div class="callout bad">${ART.icon('warn', 20)}<span>${esc(app.err)}</span></div>` : '';
  const name = ph => `<div class="sfield"><label for="nick-in">Your name</label><input type="text" id="nick-in" maxlength="12" autocomplete="nickname" placeholder="${ph}" value="${esc(app.nick)}"${app.invite ? ' class="hi"' : ''}></div>`;
  const join = label => `<form class="sjoin" data-form="join"><label for="code-in">${label}</label><div class="row1"><input type="text" id="code-in" maxlength="4" autocomplete="off" placeholder="ABCD" ${app.dbReady ? '' : 'disabled'}><button class="obtn" type="submit" ${ok ? '' : 'disabled'}>Join</button></div></form>`;
  let col;
  if (app.invite) {
    const v = app.invite;
    col = `<div class="shead"><div class="inv"><span class="av rival">${initial(v.name || 'P')}</span><span>Your old partner ${v.name ? `<b>${esc(v.name)}</b> ` : ''}made the final too</span></div>
        <h1 class="funh">You used to cook together.</h1><p class="lede">Now you are competing for the Golden Spoon. Run your own restaurant and make more money than your rival to win.</p><span class="smuted">The Golden Spoon final · Room ${esc(v.code)} · they're waiting</span></div>
      ${note}${name('Type a name your rival will see')}${err}
      <button class="cta bigc" data-act="joininvite" ${ok ? '' : 'disabled'}>${app.busy ? 'Joining…' : 'Join the game'}</button>
      <button class="linkish quiet" data-act="noinvite">Not now, start my own game</button>`;
  } else if (app.resume) {
    const r = app.resume, gap = r.gap == null ? (r.rival ? 'day 1' : 'waiting for your old partner') : r.gap > 0 ? `you're $${r.gap} ahead` : r.gap < 0 ? `you're $${-r.gap} behind` : "you're tied";
    col = `<div class="rcard"><span class="eyebrow you">Your game is still going</span>
        <div class="rl"><b>${r.started || r.rival ? `Day ${r.day} of ${CFG.rounds} vs <span class="rv">${esc(r.rival || 'your old partner')}</span>` : 'Your room is open'}</b><span>Room ${esc(r.code)} · ${gap}</span></div>
        <button class="cta bigc" data-act="rejoin" data-code="${esc(r.code)}" ${ok ? '' : 'disabled'}>Rejoin the game</button></div>
      ${note}${err}
      <div class="alt"><span>Or start something new</span><div class="row1"><button class="obtn" data-act="create" ${ok ? '' : 'disabled'}>${app.busy ? 'Making a room…' : 'Create a new room'}</button><button class="obtn" data-act="showjoin">Join with a code</button></div></div>
      ${app.showJoin ? join('Type the code from your old partner') : ''}
      <button class="linkish quiet" data-act="local">Practice alone</button>`;
  } else {
    col = `<div class="shead"><span class="eyebrow">The Golden Spoon final · ${CFG.rounds} days · $${CFG.startCash}</span>
        <h1 class="funh">You used to cook together.</h1><p class="lede">Now you are competing for the Golden Spoon. Run your own restaurant and make more money than your rival to win.</p></div>
      ${note}${name('e.g. Sam')}${err}
      <button class="cta bigc" data-act="create" ${ok ? '' : 'disabled'}>${app.busy ? 'Making a room…' : 'Create a room'}</button>
      ${join('Got a code from your old partner?')}
      <button class="linkish quiet" data-act="local">New here? Practice alone first</button>`;
  }
  return `<div class="start"><figure class="sart"><img src="${IMG.art}" alt="A cat chef in blue and a dog chef in pink clash wooden spoons under The Two Spoons sign"><span class="sbadge">${ART.badge('ld')}</span></figure>
    <section class="scol">${col}</section></div>`;
}
// The waiting room (D2): online, until the second player joins
function roomHTML() {
  const me = (app.seats[app.me] && app.seats[app.me].name) || app.nick || 'You';
  const link = `${location.origin}${location.pathname}?room=${app.code}`;
  return `<section class="room" aria-label="Waiting room">
    <div class="rcode"><span class="eyebrow">Your room</span><span class="code">${esc(app.code)}</span></div>
    <div class="rlink"><span class="lbl">Send this link to your old partner. They join with one tap.</span>
      <div class="row1"><span class="linkbox">${esc(link)}</span><button class="cta inline" data-act="copylink">${ART.icon('copy', 16)}Copy link</button></div></div>
    <div class="rseats"><div class="rseat you"><span class="av you">${initial(me)}</span><span><b>${esc(me)}</b><span>You · ready</span></span></div>
      <div class="rseat empty"><span class="av empty"></span><span><b>Your old partner</b><span>Not here yet</span></span></div></div>
    <div class="waitpill"><span class="dot round rival"></span><span>Waiting for your old partner to arrive. The final starts as soon as they do.</span></div></section>`;
}

// ---------- how to play ----------
function howtoHTML() {
  const C = CFG, L = C.loc, A = C.ads, open = app.howto.open;
  const sec = (id, title, sub, body) => `<div class="acc ${open === id ? 'open' : ''}"><button class="acc-h" data-act="howto-sec" data-sec="${id}" aria-expanded="${open === id}"><span><b>${title}</b><span>${sub}</span></span>${ART.icon('chevron', 18)}</button>${open === id ? `<div class="acc-b">${body}</div>` : ''}</div>`;
  const n = i => gold(i, 'sm');
  return `<div class="overlay" data-act="howto-close"></div>
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="howto-title">
    <header><h1 id="howto-title">How to play</h1><button class="btn" data-act="howto-close" aria-label="Close">Esc ${ART.icon('x', 16)}</button></header>
    <div class="body">
      <section class="short" aria-label="The short version"><h2 style="font-size:13px;font-family:var(--body);color:var(--muted)">The short version</h2>
        <ol><li>${n(1)}<span>You and a friend each run a restaurant for <b>${C.rounds} days</b>. Whoever ends with the <b>most money and best star rating</b> wins.</span></li>
        <li>${n(2)}<span>Every guest needs <b>a seat and a plate of food</b>. Run out of plates, or keep them waiting too long, and guests leave unhappy. Buy more than you need, and the extra is wasted, because leftover food goes bad overnight.</span></li>
        <li>${n(3)}<span>Your rival is doing the same, and can <b>play tricks on you</b>. You can play tricks back.</span></li></ol>
        <span style="font-size:13px;color:var(--muted)">That's enough to start. The game explains each step as you go.</span></section>
      <div><h2 style="font-size:13px;font-family:var(--body);color:var(--muted);margin-bottom:6px">Want more detail?</h2>
      ${sec('pick', 'Picking your restaurant', 'Countryside or City, and paying rent', `<p>You both start with $${C.startCash} and ${C.startStars} stars, and ${C.regulars.start} regular guests come on day 1. After that, your stars change how many regulars come (see Stars).</p>
        <table><thead><tr><th></th><th>Countryside</th><th>City</th></tr></thead><tbody>
        <tr><td>Costs to open</td><td>$${L.country.open}</td><td>$${L.city.open}</td></tr><tr><td>Rent every morning</td><td>$${L.country.rent}</td><td>$${L.city.rent}</td></tr>
        <tr><td>Tables</td><td>${L.country.tables}</td><td>${L.city.tables}</td></tr><tr><td>Each bunny costs a day</td><td>$${C.staff.wage.country}</td><td>$${C.staff.wage.city}</td></tr><tr><td>Each guest pays</td><td><b>$${L.country.price}</b></td><td><b>$${L.city.price}</b></td></tr></tbody></table>
        <p><b>Watch your rent.</b> It's paid every morning. If you can't pay it, you're out of the game.</p>`)}
      ${sec('day', 'A day, step by step', 'What you do in each of the 5 steps', `<ol class="steps">
        <li><b>Staff</b><br>Hire bunnies. Each one seats and serves the ${C.staff.perSection} tables in its own section. Wages are paid every morning before you open, and bunnies stay until you let them go. Letting one go costs goodbye pay: ${C.staff.fire} days of their wage ($${round2(C.staff.fire * C.staff.wage.country)} in the Countryside, $${round2(C.staff.fire * C.staff.wage.city)} in the City).</li>
        <li><b>Market</b><br>You both shop at once for ${C.market.time} seconds, racing for the same ${C.market.stock} food bundles. Each bundle makes 1 to ${Math.max(...C.market.bundles.reg, ...C.market.bundles.exp)} plates. Whoever clicks first gets it. <b>Express</b> ($${C.market.exp.price} a plate) arrives today. <b>Regular</b> ($${C.market.reg.price} a plate) is cheaper, but might not arrive until tomorrow. On the last day there's only Express.</li>
        <li><b>Ads</b> (from day ${C.adsFrom}, first thing in the morning)<br>Buy ads that bring you guests, or that cause trouble for your rival. You see what your own ads do right away; you only learn what your rival's ads do to you right before the doors open. Ads are paid then too.</li>
        <li><b>Service</b><br>Guests walk in for ${Math.round(C.service.live.dayLen / 60)} minutes. Your bunnies look after their own tables. You are the chef: click a guest at the door to seat them, click a seated guest to bring a plate. Out of plates? Click the stove to rush one: it costs half of what the guest pays ($${rushBase({ loc: 'country' })} in the Countryside, $${rushBase({ loc: 'city' })} in the City), so you earn less, but you keep your stars. Guests wait about ${C.service.live.qPat} seconds before they leave unhappy.</li>
        <li><b>Recap</b><br>See what you earned, what you spent and how your stars changed. Leftover food goes bad overnight.</li></ol>`)}
      ${sec('stars', 'Stars', 'How to earn them and how to lose them', `<p>You start with ${C.startStars} stars. They change at the end of each day.</p>
        <ul><li><b>You gain a star</b> when nobody left unhappy.</li><li><b>You lose stars</b> when guests leave unhappy: 1 star for 1 to 3 guests, 2 stars for 4 or more.</li></ul>
        <p><b>Saying sorry helps.</b> After service you can give each guest you turned away a $${C.voucher} voucher, so they don't count against you.</p>
        <p><b>Why stars matter.</b> Every morning, yesterday's stars change how many regulars come, and the change sticks: 1 star ${sgn(C.regulars.change[1])}, 2 stars ${sgn(C.regulars.change[2])}, 3 stars no change, 4 stars ${sgn(C.regulars.change[4])}, 5 stars ${sgn(C.regulars.change[5])} regulars a day. Never fewer than ${C.regulars.min}, and at most ${C.regulars.max.country} in the Countryside and ${C.regulars.max.city} in the City. Each star also pays you $${C.starValue} at the end of every day, and counts $${C.starValue} again in the final score.</p>`)}
      ${sec('surprises', 'Surprises', 'Secret offers, and things that happen during service', `<p><b>Secret offers.</b> Some mornings you get an offer only you can see:</p>
        <ul><li><b>A shady deal:</b> take $${C.shady.cash} now. But on every day after, there's a 1 in 6 chance an inspector catches you. If that happens you pay $${C.shady.fine} and lose a star.</li></ul>
        <p><b>During service.</b> A fight (${C.service.fightStaff} bunnies get hurt and go home for the day, still paid), a storm, a proposal, someone asking for free food. A pop-up explains it and the clock stops while you decide.</p>
        <p><b>Overnight.</b> There's a small chance of a break-in that takes some of your cash.</p>`)}
      ${sec('friend', 'Playing with a friend', 'Room codes, reconnecting and keyboard shortcuts', `<ul><li>One of you clicks <b>Create a room</b> and sends the 4-letter code. The other types it under <b>Join a game</b>.</li>
        <li>Each browser counts as one player. To try it alone, pick <b>Practice alone on one screen</b>.</li><li>Lost your connection? Open the page again and click <b>Back to your game</b>.</li></ul>
        <p><b>Keys during service:</b> <kbd>Space</kbd> stop the rush marker in the green</p>`)}
      </div>
    </div>
    <footer><button class="cta" data-act="howto-close">Got it</button></footer>
  </aside>`;
}

// ---------- shared pieces ----------
function themStatus(o) {
  const S = app.S, done = S.submitted[o] || (!S.waiting[o] && S.waiting[other(o)]);
  const t = { pick: ['choosing', 'has picked'], invest: ['still choosing', 'ready'], market: ['shopping', 'done shopping'], commit: ['choosing ads', 'ads placed'],
    reveal: ['', ''], service: ['still serving', 'closed for the day'], voucher: ['', 'ready'], report: ['reading their recap', 'ready'] }[S.phase] || ['', ''];
  return done ? t[1] : t[0];
}
function statusHTML(s, live = {}) {
  const S = app.S, p = S.players[s], o = other(s), q = S.players[o], L = CFG.loc[p.loc];
  const cashNow = live.cash ?? p.cash, foodNow = live.food ?? p.ingr;
  const foodLow = S.phase === 'service' ? false : p.ingr <= 1;
  return `<section class="status" aria-label="Both restaurants">
    <div class="me"><div><span class="dot you"></span><span class="who"><b>${esc(nameOf(s))}</b><span>${L.name} · $${L.price} a guest</span></span></div>
      <div><span class="k">Cash</span><span class="v">${usd(cashNow)}</span></div>
      <div><span class="k">Stars</span><span class="v">${p.stars} <small>of 5</small></span></div>
      <div><span class="k">Staff</span><span class="v">${p.staff.length} <small>of ${sectionsOf(p)}</small></span></div>
      <div><span class="k ${foodLow && S.phase !== 'invest' ? 'bad' : ''}">Food</span><span class="v">${foodNow}</span></div></div>
    <div class="them"><span class="dot rival"></span><span class="who"><b>${esc(nameOf(o))}</b><span>${q.loc ? CFG.loc[q.loc].name + ' · ' : ''}${plural(q.stars, 'star')}</span></span><span class="st">${themStatus(o)}</span></div>
  </section>`;
}
const titleHTML = (h, sub, right = '') => `<div class="title"><div style="display:grid;gap:2px"><h1>${h}</h1>${sub ? `<span class="sub">${sub}</span>` : ''}</div>${right}</div>`;
const waitCard = (o, line = '', extra = '') => `<section class="panel"><span class="wait"><span class="dot round rival"></span><b>Waiting for ${esc(nameOf(o))}…</b></span>${line ? `<span style="font-size:13px;color:var(--ink2)">${line}</span>` : ''}${extra}</section>`;
const ring = (t0, t1, cls = '', drain = true) => `<span class="ringp ${cls}" data-t0="${t0}" data-t1="${t1}" data-ring="1" ${drain ? 'data-drain="1"' : ''}></span>`;
const pbar = (t0, t1) => `<span class="prog" data-t0="${t0}" data-t1="${t1}"><i></i></span>`;
const keyHTML = () => `<div class="key" aria-label="Key">
  <span><svg width="28" height="30" viewBox="-34 -36 68 78" class="floor" style="width:28px"><g class="tbl seat"><rect class="top" x="-30" y="-32" width="60" height="44" rx="10"/><circle class="rim" cx="0" cy="-10" r="10"/><circle class="dish" cx="0" cy="-10" r="5"/><path class="guest" d="M-14 39a14 11 0 0 1 28 0z"/><circle class="guest" cx="0" cy="21" r="7"/></g></svg>guest eating</span>
  <span><svg width="28" height="30" viewBox="-34 -36 68 78" class="floor" style="width:28px"><g class="tbl free"><rect class="top" x="-30" y="-32" width="60" height="44" rx="10"/><rect class="chair" x="-12" y="18" width="24" height="14" rx="7"/></g></svg>free table</span>
  <span><svg width="28" height="30" viewBox="-34 -36 68 78" class="floor" style="width:28px"><defs><pattern id="rr-hatch-k" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" style="fill:var(--line2)"/><rect width="3" height="8" style="fill:var(--line)"/></pattern></defs><rect x="-30" y="-32" width="60" height="44" rx="10" style="fill:url(#rr-hatch-k);stroke:var(--line);stroke-width:2"/></svg>can't be used tonight</span>
  <span><svg width="28" height="30" viewBox="-34 -36 68 78" class="floor" style="width:28px"><g class="tbl borrowed"><rect class="top" x="-30" y="-32" width="60" height="44" rx="10"/></g></svg>borrowed</span>
  <span>${ART.plate(18)}1 food</span></div>`;
function coverHTML(s) {
  return `<div class="cover" role="dialog" aria-label="Pass the screen"><span style="color:#A1A1AA;font-size:13px">${esc(nameOf(other(s)))} is done</span><b>Pass the screen to ${esc(nameOf(s))}</b>
    <span>${esc(nameOf(other(s)))}, look away. ${esc(nameOf(s))} has secret choices to make.</span><button class="cta" data-act="cover-ok">I'm ${esc(nameOf(s))}, show me</button></div>`;
}

function gameHTML() {
  const S = app.S, s = viewer(), o = other(s);
  if (app.mode === 'local' && app.cover === s && PRIVATE_PHASES.includes(S.phase)) return coverHTML(s);
  if (inRoom()) return roomHTML();
  // One-screen practice: say whose turn it is (the old "Playing as P1" bar)
  const playing = app.mode === 'local' && S.phase !== 'over' ? `<div class="strip soft"><span class="dot round ${s === 'p1' ? 'you' : 'rival'}"></span><span><b>Playing as ${esc(nameOf(s))}</b> · switch players with the buttons at the top. Look away when it's not your turn.</span></div>` : '';
  return playing + timerPill(s) + phaseHTML(s);
}
function phaseHTML(s) {
  const S = app.S;
  switch (S.phase) {
    case 'pick': return pickHTML(s);
    case 'morning': return `<section class="panel" style="justify-self:center"><p class="wait"><span class="dot round rival"></span>Opening up for the day…</p></section>`;
    case 'invest': return needMorning(s) ? morningHTML(s) : buildHTML(s);
    case 'market': return marketHTML(s);
    case 'commit': return needMorning(s) ? morningHTML(s) : adsHTML(s);
    case 'reveal': return `<section class="panel" style="justify-self:center"><p class="wait"><span class="dot round rival"></span>Turning over the ad cards…</p></section>`;
    case 'service': return serviceHTML(s);
    case 'voucher': return voucherHTML(s);
    case 'report': return recapHTML(s);
    case 'over': return endingHTML(s);
  }
  return '';
}

// ---------- intro + pick ----------
function pickHTML(s) {
  const S = app.S, k = S.waiting[s], o = other(s);
  if (app.intro >= INTRO.length && app.intro < INTRO_ALL()) {
    const g = app.intro - INTRO.length, G = GOAL_PAGES[g], lastCard = g === GOAL_PAGES.length - 1;
    return `<section class="story goal" aria-label="Goal ${g + 1} of ${GOAL_PAGES.length}"><div class="stop"><button class="linkish quiet" data-act="introskip">Skip</button></div>
      <div class="smid"><span class="goalchip">${ART.spoonMark(false)}${G.chip}${ART.spoonMark(true)}</span>${ART.goal(g, esc(nameOf(o)).toUpperCase(), CFG.rounds, CFG.starValue)}<div class="goaltext"><p class="cap">${G.cap}</p><p class="gsub">${G.sub()}</p></div></div>
      <div class="sfoot"><div class="sdots" aria-label="Page ${g + 1} of ${GOAL_PAGES.length}">${GOAL_PAGES.map((_, j) => `<i class="${j === g ? 'on' : ''}"></i>`).join('')}</div>
        <span class="tbtns"><button type="button" class="tback" data-act="introback">Back</button><button class="cta inline" data-act="intro">${lastCard ? 'Pick your restaurant →' : 'Next'}</button></span></div></section>`;
  }
  if (app.intro < INTRO.length) {
    const i = app.intro, lastCard = false;
    return `<section class="story" aria-label="Story ${i + 1} of ${INTRO.length}"><div class="stop"><button class="linkish quiet" data-act="introskip">Skip story</button></div>
      <div class="smid">${ART.story(i, esc(nameOf(o)).toUpperCase())}<p class="cap">${INTRO[i].t}</p></div>
      <div class="sfoot"><div class="sdots" aria-label="Page ${i + 1} of ${INTRO.length}">${INTRO.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
        <span class="tbtns">${i ? '<button type="button" class="tback" data-act="introback">Back</button>' : ''}<button class="cta inline" data-act="intro">${lastCard ? 'Pick your restaurant →' : 'Next'}</button></span></div></section>`;
  }
  if (!k) {
    const mine = S.got[s] && S.got[s].loc;
    return `<div class="pick-title"><h1>Good choice!</h1><p class="muted">You're opening in the ${mine === 'city' ? 'City' : 'Countryside'}.</p></div>${waitCard(o, `Once ${esc(nameOf(o))} picks, day 1 begins.`)}`;
  }
  const f = F({}), sel = f.loc;
  const card = loc => {
    const L = CFG.loc[loc], on = sel === loc;
    const tile = (v, l) => `<span class="st"><b>${v}</b><span>${l}</span></span>`;
    return `<button type="button" class="pickc${on ? ' on' : ''}" data-act="picksel" data-loc="${loc}" aria-pressed="${on}">
      <span class="pic">${ART.place(loc)}${on ? '<span class="chip">Selected</span>' : ''}</span>
      <span class="in"><span class="nm"><b>${L.name}</b><span>${loc === 'city' ? 'Fewer seats, bigger bills' : 'More seats, cheaper'}</span></span>
        <span class="stats">${tile(L.tables, 'tables')}${tile('$' + L.price, 'income per guest')}${tile('$' + L.open, 'to open')}</span></span></button>`;
  };
  return `<div class="pick-title"><h1>Where will you open?</h1><p class="muted">The contest gives you $${CFG.startCash} and an empty space. Pick one.</p></div>
    <div class="picks">${card('country')}${card('city')}</div>
    <div class="pickfoot"><div class="waitpill"><span class="dot round rival"></span><span><b class="rv">${esc(nameOf(o))}</b> ${S.waiting[o] ? 'is choosing too' : 'has picked'}. Neither of you sees the other's pick until you both lock in.</span></div>
      ${sel ? `<button class="cta inline bigc" data-act="pick" data-loc="${sel}">Open in the ${CFG.loc[sel].name}</button>` : '<span class="muted">Tap a restaurant to choose it.</span>'}</div>`;
}


// ---------- v2 page shell (the mockups): main card left, side column right with the button at the bottom ----------
const lab = t => `<span class="lab">${t}</span>`;
const fhead = (h, sub, right = '') => `<div class="fhead"><div class="fh"><h1 class="funt">${h}</h1>${sub ? `<span class="fsub">${sub}</span>` : ''}</div>${right}</div>`;
const shell = (main, side, cta = '') => `<div class="g2"><section class="card2 main2">${main}</section><aside class="side2">${side}<div class="grow"></div>${cta}</aside></div>`;
const box = (inner, cls = '') => `<section class="card2 box ${cls}">${inner}</section>`;
const verdict2 = (cls, t) => `<div class="vd2 ${cls}">${t}</div>`;
const mrow = (l, r, cls = '') => `<div class="mrow ${cls}"><span>${l}</span><b>${r}</b></div>`;
const plateDots = n => `<span class="pdots" role="img" aria-label="${n} plates">${Array.from({ length: n }, () => '<i></i>').join('')}</span>`;
const waitBox = (o, line = '') => box(`${lab('Waiting')}<span class="wait"><span class="dot round rival"></span><b>Waiting for ${esc(nameOf(o))}…</b></span>${line ? `<span class="fnote">${line}</span>` : ''}`);

// ---------- build ----------
// Day 1 opens with a gift screen, event days with the morning card, then the tables (one job per screen).
function morningLine(s) {
  const S = app.S, p = S.players[s], m = S.morning[s] || {}, L = CFG.loc[p.loc];
  const prev = p.history[p.history.length - 1], fight = prev && prev.ledger.find(x => /hurt in a fight/.test(x.label));
  const bits = S.round === 1 ? [`−$${L.open}`, `rent −$${L.rent}`] : [`rent −$${L.rent}`];
  if (m.robbed) bits.push(`break-in −${usd(m.robbed).replace('$', '$')}`);
  if (m.arrived) bits.push(`${plural(m.arrived, 'plate')} arrived`);
  if (fight) bits.push('your hurt bunnies are back');
  if (S.round === CFG.rounds - 1) bits.push('tomorrow: Express only');
  return `<span class="pill2">${S.round === 1 ? 'Opened: ' + bits.join(' · ') : 'This morning: ' + bits.join(' · ')}</span>`;
}
function giftHTML(s) {
  const o = other(s);
  return `<section class="gift2" aria-labelledby="gift-t"><span class="pill2">Day 1 · before you open</span>${ART.gift()}
    <div class="gtext"><h1 id="gift-t" class="funt">A gift from the Golden Spoon!</h1><b>${CFG.freeFood} free plates of food for your first night.</b>
      <span>From tomorrow, the food is on you: you and ${esc(nameOf(o))} race for it at the Market. 🛒</span></div>
    <button class="cta gcta" data-act="stage" data-v="gift">Set up my restaurant →</button></section>`;
}
function offerHTML(s, f) {
  const S = app.S, p = S.players[s], e = S.events[s];
  const opt = (v, t, lines) => `<button type="button" class="och ${f.choice === v ? 'on' : ''}" role="radio" aria-checked="${f.choice === v}" data-act="choose" data-c="${v}"><b>${t}</b>${lines.map((l, i) => `<span class="${i ? 'd2' : 'd1'}">${l}</span>`).join('')}</button>`;
  let h, sub, opts, go;
  {
    const active = p.shadyFrom !== null;
    h = active ? `The stranger is back with another $${CFG.shady.cash}` : `A stranger offers you $${CFG.shady.cash}`;
    sub = active ? `Same deal as before: cheap food with no health papers. You already took one on day ${p.shadyFrom}, so the inspector is already watching you (1 in 6 each day). Taking this one doesn't change that chance.`
      : "They want you to take a delivery of cheap food that has no health papers, and keep quiet about it. That's against the rules: if a health inspector finds out, you pay a fine and lose a star.";
    opts = opt('accept', `Take the $${CFG.shady.cash}`, [`Now: <b class="pos">+$${CFG.shady.cash}</b>`, `Every day after: 1 in 6 chance an inspector catches you: <b class="neg">−$${CFG.shady.fine} and −1 star</b>`])
      + opt('decline', 'Say no', ['Nothing happens']);
    go = f.choice === 'accept' ? 'Take the money · set up →' : 'Say no · set up →';
  }
  return `<section class="card2 offer2" aria-labelledby="offer-t"><div class="otop"><span class="offer-tag">🔒 Only you can see this</span>${morningLine(s).replace('pill2', 'otext')}</div>
    <div class="fh"><h1 id="offer-t" class="funt">${h}</h1><span class="fsub">${sub}</span></div>
    <div role="radiogroup" class="ochoices">${opts}</div>
    ${f.choice ? `<button class="cta" data-act="stage" data-v="offer">${go}</button>` : '<span class="fnote center">Pick one to continue. It\'s a yes or no, and neither is wrong.</span>'}</section>`;
}
// The Staff step: the restaurant fills the page (like Service); the money panel sits in the lower kitchen.
// Day 1 starts with the team's three pop-ups (f.tip counts them).
function hireStage(s, staff, card, over = '', locked = false) {
  const p = app.S.players[s], look = seatLook(s);
  let plan = RRService.floorPlan(p.loc, staff, look.animal, look.color);
  if (locked) plan = plan.replace(/<rect class="sec-hit"[^>]*\/>/g, '');
  // The kitchen can't be picked: hovering (or tapping) it pops up a note, from the team's sketch
  const kitchen = `<div class="khover" style="${RRService.kitchenBox}" tabindex="0" role="note" aria-label="Kitchen" onmouseleave="this.classList.remove('done')">
    <div class="kbubble"><b>You cook in the kitchen.</b><p>When the bunnies can't keep up, you seat and serve guests too.</p></div></div>`;
  return `<div class="hstage">${plan}${kitchen}<div class="hcard" style="${RRService.buildBox}">${card}</div>${over}</div>`;
}
const hrow = (l, r, cls = '') => `<div class="hrw ${cls}"><span>${l}</span><b>${r}</b></div>`;
// Day-1 hiring tips (the team's three sticky notes; designs B and D from prototypes/hire-tip-options)
const TIP_SEC = 1; // the section the spotlight points at (top row, second from the left)
const pct = (a, b) => `${(a / b * 100).toFixed(2)}%`;
// Just the bunny, cut out of a hired section of the real plan
function bunnyPic(s, width) {
  const p = app.S.players[s], look = seatLook(s), r = RRService.sectionRect(p.loc, TIP_SEC);
  const vb = `${r.x + r.w / 2 - 45} ${r.y + r.h - 100} 90 92`;
  return RRService.floorPlan(p.loc, [TIP_SEC], look.animal, look.color).replace(/viewBox="[^"]*"/, `viewBox="${vb}"`).replace('class="rrplan"', `class="tipbun" width="${width}"`).replace(/<rect class="sec-hit"[^>]*\/>/g, '');
}
const tipDots = i => `<div class="dots">${[0, 1, 2].map(j => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>`;
// A small grey Back next to Next, from the second tip on
const tipBtns = (i, label) => `<span class="tbtns">${i ? '<button type="button" class="tback" data-act="hiretipback">Back</button>' : ''}<button type="button" class="cta inline" data-act="hiretip">${label}</button></span>`;
function hireTip(s, i) {
  const p = app.S.players[s], w = wageOf(p);
  if (i === 0) return `<div class="hover2"><div class="rcard tipcard" role="dialog" aria-label="Hiring tip 1 of 3"><p>You can't run your restaurant by yourself.</p><h2>Time to hire staff!</h2>
    <div class="tfoot">${tipDots(0)}${tipBtns(0, 'Next')}</div></div></div>`;
  if (i === 1) {
    // B: the screen darkens except one real section, a hand points at it, the bubble sits beside it. Clicking the section hires there and moves on.
    const r = RRService.sectionRect(p.loc, TIP_SEC), box = `left:${pct(r.x, r.W)};top:${pct(r.y, r.H)};width:${pct(r.w, r.W)};height:${pct(r.h, r.H)}`;
    return `<button type="button" class="tiphole" style="${box}" data-act="hiretip" data-hire="${TIP_SEC}" aria-label="Hire a server for this section">
        <svg class="tiphand" viewBox="0 0 40 48" aria-hidden="true"><path d="M14 4a4 4 0 0 1 8 0v16l3-1a4 4 0 0 1 5 3l1 0a4 4 0 0 1 5 4v8c0 8-6 13-14 13s-12-5-15-11l-5-9a4 4 0 0 1 6-4l4 4V4z" fill="#FFF7EC" stroke="#3A2A1E" stroke-width="2.5" stroke-linejoin="round"/></svg></button>
      <div class="rcard tipbub" style="left:calc(${pct(r.x + r.w, r.W)} + 22px);top:${pct(r.y, r.H)}" role="dialog" aria-label="Hiring tip 2 of 3">
        <h3>Click on a "staff section" to hire a server.</h3>
        <p>This is one section with <b>2 tables</b>. Its server looks after those tables all night: seating each new guest and bringing their food.</p>
        <div class="tfoot">${tipDots(1)}${tipBtns(1, 'Next')}</div></div>`;
  }
  // D: one big daily price
  return `<div class="hover2"><div class="rcard tipcard pay" role="dialog" aria-label="Hiring tip 3 of 3"><h2>Pay rate</h2>
    <div class="paygrid"><span class="tipbunbox">${bunnyPic(s, 140)}</span><div><div class="paybig">$${w}<small>/ day</small></div><div class="payper">for each server, every day you keep them</div></div></div>
    <div class="tfoot">${tipDots(2)}${tipBtns(2, 'Start')}</div></div></div>`;
}
function buildHTML(s) {
  const S = app.S, p = S.players[s], o = other(s), k = S.waiting[s], e = S.events[s], M = CFG.market;
  const day1 = S.round === 1 && CFG.freeFood, nSec = sectionsOf(p), w = wageOf(p);
  const head = (h) => `<div class="hhead"><div class="fh"><h1 class="funt">${h}</h1></div></div>`;
  if (!k) {
    const g = S.got[s] || {}, bits = [];
    if (e.type === 'shady' && g.choice) bits.push(g.choice === 'accept' ? 'take the shady deal' : 'say no to the shady deal');
    // Your confirmed staff: the engine only books them once both players are done, so show what you sent
    const chosen = Array.isArray(g.staff) ? g.staff.slice().sort((a, b) => a - b) : p.staff;
    bits.push(chosen.length ? `have ${plural(chosen.length, 'bunny', 'bunnies')} on staff today` : 'run the restaurant without staff today');
    return `<section class="hire2">${head('Your staff', `You chose to ${bits.join(', and ')}.`)}${hireStage(s, chosen,
      `<b class="htitle">Waiting for ${esc(nameOf(o))}…</b><span class="hnote">${day1 ? 'Service starts as soon as they\'re done.' : `The Market opens as soon as they're done. It lasts ${M.time} seconds, and the fastest clicks get the food.`}</span>`, '', true)}</section>`;
  }
  const f = F({ staff: p.staff.slice(), choice: null, loan: false, stage: '', tip: 0 }), needChoice = e && e.type === 'shady';
  if (day1 && !f.gift) return giftHTML(s);
  if (S.round >= CFG.adsFrom && !f.seenAds) return hiddenAdsHTML(s);
  if (!day1 && !f.sintro) return staffIntroHTML(s);
  if (needChoice && !f.offer) return `<div class="solo2">${offerHTML(s, f)}</div>`;
  const loanOn = CFG.loan.enabled && !p.loan; // loans are off in CFG for now; this brings the option back if the team turns them on
  const reserved = adReserve(s), mine = myCards(s);
  const cash = p.cash - reserved + (f.choice === 'accept' ? CFG.shady.cash : 0) + (loanOn && f.loan ? CFG.loan.amount : 0);
  const n = f.staff.length, fired = Math.max(0, p.staff.length - p.staff.filter(i => f.staff.includes(i)).length - f.staff.filter(i => !p.staff.includes(i)).length);
  // Goodbye pay follows the team's rule (CFG.staff.fire): the same number of days' wage for each bunny.
  const cashNow = cash + reserved, sev = severance(p, fired, cashNow), wages = n * w, after = round2(cash - wages - sev);
  const keptOld = p.staff.filter(i => f.staff.includes(i)).length, nextSev = !day1 && keptOld > 0 ? round2(severance(p, fired + 1, cashNow) - sev) : 0;
  const E = guestGuess(s), guess = Math.max(0, Math.round(E.total)), sug = Math.min(nSec, Math.ceil(guess / CFG.service.perBunny));
  const warn = !day1 && after < CFG.service.foodWarn ? `<span class="hwarn">Only ${usd(after)} left for food at the Market.</span>` : '';
  const loan = !loanOn ? '' : `<button type="button" class="linkish" data-act="loan" data-v="${f.loan ? 0 : 1}">${f.loan ? `Loan taken: +$${CFG.loan.amount} (pay back $${CFG.loan.repay}). Undo` : `Take a $${CFG.loan.amount} loan (pay back $${CFG.loan.repay} at the end)`}</button>`;
  const sub = day1 ? `Click a section to hire a server. Each server looks after the ${CFG.staff.perSection} tables in their section.`
    : `Your staff from yesterday are still here. Click a section to hire, or click a bunny to let them go. Letting a bunny go costs goodbye pay.`;
  const change = needChoice ? `<span class="hnote">${f.choice === 'accept' ? `You took the $${CFG.shady.cash}.` : 'You said no to the deal.'}</span>` : '';
  const card = `<b class="htitle">Hire staff</b>
    ${reserved ? hrow('Ads (paid before dinner)', usd(-reserved)) : ''}${hrow(`$${w} per bunny a day`, n ? usd(-wages) : '$0')}${fired ? hrow(`Goodbye pay ×${fired}`, usd(-sev), 'neg') : ''}
    ${nextSev ? `<span class="hnote" title="Goodbye pay is ${CFG.staff.fire} days of wage for each bunny you let go.">${fired ? 'One more goodbye' : 'Letting a bunny go'}: <b>${fired ? '+' : ''}${usd(nextSev)}</b></span>` : ''}
    ${hrow('Expect about', plural(guess, 'guest'))}${hrow('Suggested without your help', plural(sug, 'bunny', 'bunnies'))}${hrow('Left after staff costs', usd(after), 'you')}${warn}${change}${loan}
    <button class="cta" data-act="invest">${day1 ? 'Open for service →' : 'Go shopping →'}</button>`;
  return `<section class="hire2">${head(day1 ? 'Time to hire staff' : 'Hire staff', sub)}${hireStage(s, f.staff, card, day1 && f.tip < 3 ? hireTip(s, f.tip) : '')}</section>`;
}
// Which chef and colour each seat plays (from the key art): P1 the blue cat, P2 the pink dog
const SEAT_LOOK = { p1: { animal: 'cat', color: '#2546F0' }, p2: { animal: 'dog', color: '#D61F69' } };
const seatLook = s => SEAT_LOOK[s];
function toggleHire(s, i) {
  const S = app.S, p = S.players[s], f = F({ staff: p.staff.slice() }), e = S.events[s];
  const cash = p.cash - adReserve(s) + (f.choice === 'accept' && e.type === 'shady' ? CFG.shady.cash : 0) + (CFG.loan.enabled && !p.loan && f.loan ? CFG.loan.amount : 0);
  if (f.staff.includes(i)) {
    const left = f.staff.filter(x => x !== i);
    // Letting a bunny go: the goodbye pay has to be paid today, so check there's cash for it
    const fired = Math.max(0, p.staff.length - p.staff.filter(x => left.includes(x)).length - left.filter(x => !p.staff.includes(x)).length);
    const sev = severance(p, fired, cash + adReserve(s));
    if (p.staff.includes(i) && left.length * wageOf(p) + sev > Math.max(0, cash)) return toast(`Not enough cash for the goodbye pay (${usd(sev)} in all).`);
    f.staff = left; return render();
  }
  const next = [...f.staff, i], cost = staffCost(p, next.length, cash + adReserve(s));
  if (cost > Math.max(0, cash)) return toast(`Not enough cash for another bunny ($${wageOf(p)} a day)`);
  f.staff = next.sort((a, b) => a - b);
  if (S.round === 1 && !f.firstHire) { f.firstHire = true; toast(`Hired! Each bunny costs $${wageOf(p)} a day.`); }
  render();
}

// ---------- market ----------
// Before the clock starts: what Express and Regular mean, so players can plan (from the team's sketch)
function marketBriefHTML(s) {
  const S = app.S, M = CFG.market, p = S.players[s], o = other(s), mk = app.mkt || {}, now = Date.now();
  const last = S.round >= CFG.rounds, E = guestGuess(s), tables = p.tables;
  const guests = E.min === E.max ? `${E.min}` : `${Math.max(0, E.min)} to ${E.max}`;
  const card = (type, title, price, line, sub) => `<div class="brief-card"><span class="tbox ${type}">${ART.icon(type === 'exp' ? 'bolt' : 'box', 26)}</span>
    <b>${title}</b><span class="price">$${price} a plate</span><span class="line">${line}</span><span class="hint">${sub}</span></div>`;
  let action;
  if (mk.start && now < mk.start) action = `<div class="brief-go"><span class="hint">Get ready…</span><b class="gold" data-count="${mk.start}">${Math.ceil((mk.start - now) / 1000)}s</b></div>`;
  else if (mk.ready && mk.ready[s]) {
    const first = Math.min(...Object.values(mk.ready).filter(Number.isFinite));
    action = `<div class="center-note" style="max-width:420px;justify-self:center"><span class="wait" style="justify-content:center"><span class="dot round rival"></span>Waiting for ${esc(nameOf(o))} to press Start…</span>
      <span>The market opens in <b data-count="${first + MKT_WAIT}">${Math.max(0, Math.ceil((first + MKT_WAIT - now) / 1000))}s</b> either way.</span></div>`;
  } else action = `<button class="cta brief-start" data-act="mkstart">Start!<small>The ${M.time} seconds begin when you've both pressed Start</small></button>`;
  return `<section class="panel lift brief" aria-labelledby="brief-title">
    <h1 id="brief-title">It's time for grocery shopping!</h1>
    <ol class="brief-rules">
      <li>${gold(1, 'sm')}<span>You and ${esc(nameOf(o))} shop at the same time for <b>${M.time} seconds</b>. Food comes in bundles of 1 to ${Math.max(...M.bundles.reg, ...M.bundles.exp)} plates. Whoever clicks a bundle first gets it.</span></li>
      <li>${gold(2, 'sm')}<span>After each buy you wait a few seconds while it's delivered (${last ? `${M.exp.cd}s` : `${M.exp.cd}s for Express, ${M.reg.cd}s for Regular`}). You can't grab anything else meanwhile.</span></li>
      <li>${gold(3, 'sm')}<span>Every guest needs 1 plate, and a bundle costs its plates × the price. Food you don't use tonight goes bad overnight, so buy what you'll need.</span></li>
    </ol>
    <div class="brief-cards ${last ? 'one' : ''}">
      ${card('exp', 'Express', M.exp.price, 'Arrives today!', 'Always in time for tonight')}
      ${last ? '' : card('reg', 'Regular', M.reg.price, `${Math.round((1 - M.reg.tomorrow) * 100)}% chance it arrives today, ${Math.round(M.reg.tomorrow * 100)}% tomorrow`, S.round === CFG.rounds - 1 ? "Cheaper, but you only find out which day after you buy it. Tomorrow is the last day." : 'Cheaper, but you only find out which day after you buy it')}
    </div>
    ${last ? '<p class="hint" style="text-align:center">Last day: only Express food is sold.</p>' : ''}
    <div class="brief-plan"><span><b>Tonight:</b> about ${guests} guests expected</span><span>${plural(tables, 'table')} free</span><span>${plural(p.ingr, 'plate')} already in your kitchen</span><span>${usd(p.cash)} to spend</span></div>
    ${action}
  </section>`;
}
function marketHTML(s) {
  if (!mktOpen()) return marketBriefHTML(s);
  const S = app.S, M = CFG.market, items = S.market.items, mk = app.mkt || { owner: {} }, o = other(s), now = Date.now();
  const left = mktTimeLeft(), cash = mktCashLeft(s), c = app.cool[s], cooling = c && now < c.until;
  const mine = ownedBy(s), theirs = ownedBy(o), done = !S.waiting[s], p = S.players[s];
  const settled = i => !(c && c.i === i && cooling);
  const tomorrow = i => items[i].t === 'reg' && S.round < CFG.rounds && regTomorrow(app.seed, S.round, i);
  const plates = list => list.reduce((a, i) => a + items[i].n, 0);
  const tbox = (type, cls = '') => `<span class="tbox sm ${type} ${cls}">${ART.icon(type === 'exp' ? 'bolt' : 'box', 16)}</span>`;
  // One bundle: how many plates it makes, Express or Regular, and its price (plates × price per plate)
  const slot = (it, i) => {
    const type = it.t, own = mk.owner[i], nm = type === 'exp' ? 'Express' : 'Regular', price = itemPrice(it);
    const head = `<span class="ihead">${tbox(type)}<span class="pn">${it.n}<small>${it.n === 1 ? 'plate' : 'plates'}</small></span></span>`;
    const label = `${nm}, ${plural(it.n, 'plate')}, $${price}`;
    if (own === s) {
      const body = settled(i) ? `<span class="s ${tomorrow(i) ? 'later' : ''}">Yours · ${tomorrow(i) ? 'tomorrow morning' : 'tonight'}</span>`
        : `<span style="display:grid;gap:4px;width:100%"><span class="s">Yours · on its way…</span><span class="bar" data-t0="${c.start}" data-t1="${c.until}"><i></i></span></span>`;
      return `<button class="item mine ${type}" data-act="grab" data-i="${i}" data-who="${s}" disabled aria-label="${label}, yours">${head}${body}</button>`;
    }
    if (own) return `<button class="item taken ${type}" data-act="grab" data-i="${i}" data-who="${own}" disabled aria-label="${label}, taken">${head}<span class="s">${esc(nameOf(own))} got it</span></button>`;
    let st = '';
    if (done || left <= 0) st = 'off'; else if (cash < price) st = 'poor'; else if (cooling) st = 'wait';
    const sub = st === 'poor' ? `<span class="s">${nm} · $${price} · you have ${usd(cash)}</span>` : `<span class="p">${nm} · $${price}</span>`;
    // Only 'off' is disabled: a click while waiting or short of cash explains why (claimItem's message) instead of doing nothing
    return `<button class="item ${type} ${st}" data-act="grab" data-i="${i}" ${st === 'off' ? 'disabled' : ''} aria-label="${label}">${head}${sub}</button>`;
  };
  const t0 = mk.start || now, t1 = t0 + M.time * 1000;
  const cheapest = Math.min(Infinity, ...items.map((it, i) => (mk.owner[i] ? Infinity : itemPrice(it))));
  let strip = '';
  if (done) strip = '';
  else if (cooling) strip = `<div class="strip" role="status">${ring(c.start, c.until, 'sm')}<span>Your ${c.type === 'exp' ? 'Express' : 'Regular'} is on its way. You can grab again in <span data-count="${c.until}">${Math.ceil((c.until - now) / 1000)}s</span>.</span></div>`;
  else if (cash < cheapest) strip = `<div class="strip soft"><span><b>You're out of cash for food.</b> The cheapest bundle left is $${cheapest} and you have ${usd(cash)}. Click "I'm done shopping" to move on.</span></div>`;
  else if (!mine.length) strip = `<div class="strip soft"><span>Click any item to buy it. Be quick: ${esc(nameOf(o))} is shopping too.</span></div>`;
  else if (S.submitted[o]) strip = `<div class="strip soft"><span class="dot round rival"></span><span><b>${esc(nameOf(o))} is done.</b> Everything left on the shelf is yours until the timer ends.</span></div>`;
  const today = p.ingr + plates(mine.filter(i => settled(i) && !tomorrow(i))), later = plates(mine.filter(i => settled(i) && tomorrow(i)));
  const onway = plates(mine.filter(i => !settled(i))), bought = mine.filter(i => !settled(i) || !tomorrow(i)).length;
  const E = guestGuess(s), tables = p.tables, guests = Math.round(E.total), need = Math.min(guests, tables);
  const plenty = today > Math.max(E.max, tables) + 2;
  const advice = plenty
    ? `<span style="font-size:13px;font-weight:600">That's plenty</span><span style="font-size:13px;color:var(--ink2);line-height:1.45">You have ${today} plates for about ${guests} guests. Unless your ads bring a crowd, the extra goes bad overnight.</span>`
    : `<span style="font-size:13px;font-weight:600">How much do you need?</span><span style="font-size:13px;color:var(--ink2);line-height:1.45">About ${guests} guests are coming. Tables are used again when guests leave, so plan about 1 plate per guest. Buy a few more if your ads will bring extra guests.</span><span class="hint">Food you don't use tonight goes bad overnight.</span>`;
  const legend = S.round >= CFG.rounds
    ? `<div class="legend" style="grid-template-columns:1fr"><div>${tbox('exp')}<span><b>Last day: only Express food · $${M.exp.price} a plate</b><span>It all arrives in time for tonight.</span></span></div></div>`
    : `<div class="legend"><div><span class="tbox exp">${ART.icon('bolt', 18)}</span><span><b>Express · $${M.exp.price} a plate</b><span>Always arrives in time for tonight</span></span></div>
        <div><span class="tbox reg">${ART.icon('box', 18)}</span><span><b>Regular · $${M.reg.price} a plate</b><span>${S.round === CFG.rounds - 1 ? "Half the time it arrives tomorrow, the last day" : 'Half the time it arrives tomorrow morning instead'}</span></span></div></div>`;
  return `<div class="game">
    <section class="panel lift" aria-label="The market shelf">
      ${titleHTML('Market', `You and ${esc(nameOf(o))} shop at the same time. Whoever clicks a bundle first gets it.${adReserve(s) ? ` $${adReserve(s)} is kept aside for your ad cards.` : ''}`,
        `<div class="timer" role="timer">${ring(t0, t1)}<span class="t"><b data-count="${t1}">${Math.max(0, Math.ceil(left / 1000))}s</b><span>until the market closes</span></span></div>`)}
      ${legend}${strip}
      <div class="shelf">${items.map((it, i) => slot(it, i)).join('')}</div>
      <p class="hint">Each bundle makes the number of plates on it, and 1 plate feeds 1 guest. After each buy you wait while it's delivered: ${M.exp.cd} seconds for Express, ${M.reg.cd} for Regular.${S.round < CFG.rounds ? ' You find out when a Regular will arrive once its delivery finishes.' : ''}</p>
    </section>
    <aside class="stack">
      <section class="panel"><div class="row" style="gap:8px"><span class="dot you"></span><h2>Dishes you can make tonight</h2></div>
        <div class="row" style="gap:10px;align-items:baseline"><span class="big">${today}</span><span class="muted">${today === 1 ? 'dish' : 'dishes'} · 1 plate each</span></div>
        <div class="lines">${p.ingr ? `<div><span>Already in your kitchen</span><b>${p.ingr}</b></div>` : '<div><span class="muted">Your kitchen is empty. Everything you serve tonight comes from here.</span></div>'}
          ${bought ? `<div><span>Bought just now, arriving tonight</span><b>${today - p.ingr}</b></div>` : ''}${onway ? `<div class="muted"><span>Still on its way</span><b>${onway}</b></div>` : ''}${later ? `<div class="muted"><span>Arriving tomorrow morning</span><b>${later}</b></div>` : ''}</div>
        <div class="tile" style="gap:4px;padding:12px 14px">${advice}</div></section>
      <section class="panel" style="grid-template-columns:1fr auto;align-items:center"><span style="display:grid"><span class="hint">Cash left</span><span class="num" style="font-size:24px">${usd(cash)}</span></span>
        <span class="hint" style="text-align:right">Spent ${usd(p.cash - cash)} here.<br>Leftover food goes bad tonight.</span></section>
      <section class="panel" style="grid-template-columns:auto 1fr auto;align-items:center"><span class="dot rival"></span><span style="font-size:13px;color:var(--ink2)"><b style="color:var(--ink)">${esc(nameOf(o))}</b> has grabbed ${plural(theirs.length, 'bundle')} (${plural(plates(theirs), 'plate')})</span><span class="hint">${S.submitted[o] ? 'done' : 'still shopping'}</span></section>
      ${done ? waitCard(o, `They can keep shopping for <span data-count="${t1}">${Math.max(0, Math.ceil(left / 1000))}s</span> more. You bought ${plural(plates(mine), 'plate')} for ${usd(p.cash - cash)}.`)
        : `<button class="cta outline" data-act="mkdone">I'm done shopping<small>Whatever's left stays on the shelf for ${esc(nameOf(o))}</small></button>`}
    </aside></div>`;
}

// ---------- ads ----------
const S_last = () => app.S && app.S.round >= CFG.rounds;
// Card faces (style S1 from the mockups): emoji art placeholder, a big effect, one short line and a keyword tag.
// Numbers come from CFG.ads; the wording is the team's (agreed on the mockup canvas).
const KW = { SURE: ['✓', 'Always happens.'], GAMBLE: ['🎲', 'Might do nothing at all.'], IF: ['?', 'Only works if something else is true.'],
  LASTING: ['∞', 'Keeps working on later days.'], BLUFF: ['🃏', 'Does nothing. Just makes them worry.'] };
function adFace(id, o) {
  const A = CFG.ads[id], pct = x => `${Math.round(x * 100)}%`, them = esc(nameOf(o || other(viewer())));
  switch (id) {
    case 'flyer': return { art: '📄', eff: `+${A.n} 👤`, line: 'Tonight only', kw: 'SURE' };
    case 'coupon': return { art: '🎟️', eff: `+${A.n} 👤`, line: `Each pays $${A.off} less`, kw: 'SURE' };
    case 'blogger': return { art: '📸', eff: `+${A.n} 👤`, line: `Seat all: ${pct(A.star)} for +1★`, kw: 'GAMBLE', pct: pct(A.chance) };
    case 'stall': return { art: '🧺', eff: `+${A.n} 👤 +${A.food} 🍽`, line: 'Comes with a free plate', kw: 'SURE' };
    case 'bus': return { art: '🚌', eff: `+${A.n} 👤`, line: 'Or nobody at all', kw: 'GAMBLE', pct: pct(A.chance) };
    case 'wom': return { art: '💬', eff: `+${A.n} 👤 / day`, line: S_last() ? 'Last day: tonight only' : 'Today and every day after', kw: S_last() ? 'SURE' : 'LASTING' };
    case 'delivery': return { art: '🛵', eff: `+${A.n} 🍽`, line: 'Uses food, no table', kw: 'SURE' };
    case 'lunch': return { art: '🍱', eff: `+${A.n} 👤`, line: `Each pays $${A.off} less`, kw: 'SURE' };
    case 'subway': return { art: '🚇', eff: `+${A.n} 👤`, line: `${pct(A.lowChance)}: only +${A.low}`, kw: 'GAMBLE', pct: pct(1 - A.lowChance) };
    case 'review': return { art: '👎', eff: `−${A.n} 👤`, line: `${them} gets fewer guests`, kw: 'SURE' };
    case 'poach': return { art: '🪝', eff: `${A.n} 👤 → you`, line: 'Theirs becomes yours', kw: 'SURE' };
    case 'swamp': return { art: '🌊', eff: `+${A.n} 👤`, line: 'Helps them if they have room', kw: 'IF', pct: "THEY'RE FULL" };
    case 'fakebook': return { art: '📋', eff: `🪑 ✕${A.tables}`, line: `${A.tables} of their tables sit empty`, kw: 'SURE' };
    case 'corner': return { art: '📦', eff: `+$${A.extra} 🍽`, line: 'Only if they rush food', kw: 'IF', pct: 'THEY RUSH FOOD' };
    case 'fake': return { art: '📣', eff: '? ? ?', line: `${them} over-prepares`, kw: 'BLUFF' };
  }
  return { art: '🃏', eff: '', line: A.desc, kw: 'SURE' };
}
const shortName = { lunch: 'Lunch deal', stall: 'Market stall', bus: 'Tour bus stop', wom: 'Word of mouth', delivery: 'Delivery app', blogger: 'Food blogger', corner: 'Corner supplier', fake: 'False advert' };
const cardName = id => shortName[id] || CFG.ads[id].name;
const kwChip = (kw, pct) => `<span class="kw ${kw.toLowerCase()}" title="${KW[kw][1]}">${KW[kw][0]} ${kw}${pct ? ' ' + pct : ''}</span>`;
// One card. state: '' | 'on' (played) | 'poor' (can't afford). tag = optional HTML tag for a button
function adCard(id, o, { state = '', button = true, stamp = '' } = {}) {
  const A = CFG.ads[id], f = adFace(id, o), side = A.side === 'self' ? 'you' : 'rival';
  const inner = `<span class="ac-top"><span class="ac-nm">${esc(cardName(id))}</span><span class="coin">$${A.price}</span></span>
    <span class="ac-art" aria-hidden="true">${f.art}${A.loc ? `<span class="ac-loc">${A.loc === 'city' ? 'CITY' : 'COUNTRY'}</span>` : ''}</span>
    <span class="ac-eff">${f.eff}</span><span class="ac-line">${f.line}</span>${kwChip(f.kw, f.pct)}
    ${state === 'on' ? '<span class="ac-played">✓ PLAYED</span>' : ''}${stamp}`;
  const cls = `acard ${side} ${f.kw === 'GAMBLE' ? 'gamble' : ''} ${state}`;
  const label = `${cardName(id)}, $${A.price}: ${f.eff.replace(/👤/g, 'guests').replace(/🍽/g, 'plates')}, ${f.line}. ${f.kw}${f.pct ? ' ' + f.pct : ''}`;
  if (!button) return `<div class="${cls}" role="img" aria-label="${esc(label)}">${inner}</div>`;
  return `<button type="button" class="${cls}" data-act="ad" data-id="${id}" aria-pressed="${state === 'on'}" aria-label="${esc(label)}${state === 'poor' ? ' (not enough cash)' : ''}" ${state === 'poor' ? 'disabled' : ''}>${inner}</button>`;
}
const cardBack = (i = 0) => `<div class="acard back" aria-hidden="true">${ART.badge('cb' + i)}</div>`;
// ---------- ads (from day CFG.adsFrom; the team's sketch, prototypes/ads-flow) ----------
// One step, several screens (f.astep): day 3 opens with an intro and the budget; then ads for your restaurant, then ads for your opponent.
const MEGAPHONE = `<svg class="megaphone" viewBox="0 0 200 140" aria-hidden="true"><path d="M40 60 l80 -40 v100 l-80 -40z" fill="#E8392B" stroke="#2B1D14" stroke-width="5" stroke-linejoin="round"/>
  <rect x="18" y="52" width="26" height="36" rx="6" fill="#FFD21F" stroke="#2B1D14" stroke-width="5"/><ellipse cx="122" cy="70" rx="12" ry="50" fill="#FFF7EC" stroke="#2B1D14" stroke-width="5"/>
  <path d="M50 86 l10 34 h18 l-8 -26" fill="#F4A261" stroke="#2B1D14" stroke-width="5" stroke-linejoin="round"/><path d="M150 40 l24 -14 M156 70 h28 M150 100 l24 14" stroke="#E8392B" stroke-width="6" stroke-linecap="round"/></svg>`;
function adsHTML(s) {
  const S = app.S, p = S.players[s], o = other(s), k = S.waiting[s], A = CFG.ads;
  if (!k) {
    const mine = myCards(s), ids = mine ? [...mine.self, ...mine.rival] : [];
    return `<section class="adsflow"><div class="card2 adsc center">${ids.length ? `<h1 class="funt">Your ads are placed</h1><span class="fsub">${esc(nameOf(o))} only knows how many ads you placed for them, not which.</span>
      <div class="adhand">${ids.map(id => adCard(id, o, { button: false })).join('')}</div>` : `<h1 class="funt">No ads today</h1><span class="fsub">You chose not to place any ads.</span>`}
      ${waitBox(o, 'Hiring staff comes next, then the Market.')}</div></section>`;
  }
  const first = S.round === CFG.adsFrom;
  const f = F({ sel: [], astep: first ? 'intro' : 'self' }), sh = S.shops[s];
  const cost = f.sel.reduce((a, id) => a + A[id].price, 0), left = p.cash - cost;
  const card = id => adCard(id, o, { state: f.sel.includes(id) ? 'on' : A[id].price > left ? 'poor' : '' });
  const next = (v, label) => `<button class="cta inline" data-act="astep" data-v="${v}">${label}</button>`;
  const back = '<button type="button" class="aback" data-act="astep" data-v="budget">← Budget</button>';
  if (f.astep === 'intro') return `<section class="adsflow"><div class="card2 adsc center intro"><span class="lab">Day ${S.round}</span><h1 class="funt big">Get the word out!</h1>${MEGAPHONE}
      <span class="fsub">From today you can buy <b>ads</b>: some bring guests to your restaurant, some cause trouble for your rival.</span>${next('budget', 'Plan my ads')}</div></section>`;
  if (f.astep === 'budget') {
    const tile = (now, when, em, h, t) => `<div class="btile ${now ? 'now' : ''}"><span class="when">${when}</span><span class="em" aria-hidden="true">${em}</span><b>${h}</b><span>${t}</span></div>`;
    return `<section class="adsflow"><div class="card2 adsc"><h1 class="funt">Before dinner · Budget</h1>
      <span class="fsub">Today your money goes to three things. Ads come first, so keep enough for the rest.</span>
      <div class="btiles">${tile(true, 'Now', '📣', 'Ads', 'Bring guests, or trouble your rival. Paid just before dinner.')}${tile(false, 'Next', '🐰', 'Staff', `$${wageOf(p)} a day for each server you keep.`)}${tile(false, 'Then', '🥕', 'Food', 'Buy plates at the Market. Leftovers go bad.')}</div>
      ${next('self', 'Next')}</div></section>`;
  }
  if (f.astep === 'self') {
    const self = f.sel.filter(id => A[id].side === 'self'), E0 = expectedDemand(p), E = expectedDemand(p, self);
    const g0 = Math.round(E0.total), g1 = Math.round(E.total);
    return `<section class="adsflow"><div class="card2 adsc"><div class="ahead">${back}<h1 class="funt">Ads for your restaurant</h1></div>
      <span class="fnote center">Pick as many as you like and can afford, or none. Click a card again to put it back.</span>
      <div class="adhand">${sh.self.map(card).join('')}</div>
      <div class="asum"><span>Tonight, with these: <b class="you">about ${g0}${g1 !== g0 ? ` → ${g1}` : ''} guests</b></span><span>Ads so far: <b>${usd(cost)}</b></span></div>
      ${next('rival', 'Next')}</div></section>`;
  }
  return `<section class="adsflow"><div class="card2 adsc"><div class="ahead">${back}<h1 class="funt">Ads for your opponent</h1></div>
      <div class="anote"><span>🤫 ${esc(nameOf(o))} can't see what these do until right before the doors open for dinner.</span><span>But remember: that means you can't see what ads they placed for you either!</span><span>You can pick as many as you like and can afford.</span></div>
      <div class="adhand">${sh.rival.map(card).join('')}</div>
      <div class="asum"><span></span><span>Ads so far: <b>${usd(cost)}</b></span></div>
      <button class="cta inline" data-act="commit">Confirm ads</button></div></section>`;
}
// Day 2+: the Staff step opens with its own landing page, like the Ads intro (playtest Nov 17: players didn't see
// that hiring comes after Ads). Day 1 doesn't need it: the gift page and the three hiring tips come first.
function staffIntroHTML(s) {
  const S = app.S, p = S.players[s], n = p.staff.length;
  const have = n ? `You have ${plural(n, 'bunny', 'bunnies')} from yesterday.` : 'You have no bunnies on staff right now.';
  return `<section class="adsflow"><div class="card2 adsc center intro"><span class="lab">Day ${S.round} · Next step</span><h1 class="funt big">Time to hire staff!</h1>
    <div class="sintro-art">${bunnyPic(s, 150)}</div>
    <span class="fsub">${have} Hire more for tonight, or let some go (that costs goodbye pay). Each bunny costs <b>$${wageOf(p)} a day</b>. After this comes the Market.</span>
    <button class="cta inline" data-act="stage" data-v="sintro">Hire staff</button></div></section>`;
}
// Before staff: how many ads the opponent placed for you (not which)
function hiddenAdsHTML(s) {
  // Today's ads: yours face up, the opponent's for you face down (how many, not which)
  const S = app.S, o = other(s), n = S.commits && S.commits[o] ? S.commits[o].nRival : 0, mine = myCards(s), ids = mine ? [...mine.self, ...mine.rival] : [];
  const paid = S.commits && S.commits[s] ? S.commits[s].cost : 0;
  return `<section class="adsflow"><div class="card2 adsc sumads"><h1 class="funt center">Today's ads</h1>
    <div class="grp"><div class="gh"><b>Your ads</b><span>${ids.length ? `You paid $${paid}. ${esc(nameOf(o))} can't see these until right before dinner.` : 'You didn\'t place any ads today.'}</span></div>
      ${ids.length ? `<div class="adhand">${ids.map(id => adCard(id, o, { button: false })).join('')}</div>` : ''}</div>
    <div class="sep"></div>
    <div class="grp"><div class="gh"><b>Ads from ${esc(nameOf(o))} for you: ${n}</b><span>${!n ? 'None today.' : looksBump(s) ? `They look like they'll bring you about <b style="font-size:inherit">${plural(looksBump(s), 'more guest', 'more guests')}</b> tonight. You'll see what they really do right before the doors open.` : "You'll see what they do right before the doors open."}</span></div>
      ${n ? `<div class="adhand">${Array.from({ length: n }, (_, i) => cardBack(i)).join('')}</div>` : ''}</div>
    <button class="cta inline" data-act="stage" data-v="ads">Ready</button></div></section>`;
}
// New day (day 2+): what happened overnight, rent in small print, and today's starting cash. Shown once, before the day's first step.
const mornKey = s => `${app.code}:${app.seed}:${app.S.round}:${s}`;
function needMorning(s) {
  const S = app.S;
  return S.round > 1 && !!S.waiting[s] && S.phase === (S.round >= CFG.adsFrom ? 'commit' : 'invest') && !app.mornSeen[mornKey(s)];
}
const SUNRISE = `<svg class="sunrise" viewBox="0 0 160 90" aria-hidden="true"><path d="M10 80 h140" stroke="#2B1D14" stroke-width="5" stroke-linecap="round"/><path d="M30 80 a50 50 0 0 1 100 0z" fill="#FFD21F" stroke="#2B1D14" stroke-width="5"/>
  <path d="M80 12 v-10 M36 30 l-8 -8 M124 30 l8 -8 M18 62 h-10 M142 62 h10" stroke="#F4A261" stroke-width="5" stroke-linecap="round"/></svg>`;
const sgn = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
function morningHTML(s) {
  const S = app.S, p = S.players[s], m = S.morning[s] || {}, L = CFG.loc[p.loc];
  const prev = p.history[p.history.length - 1], fight = prev && prev.ledger.some(x => /hurt in a fight/.test(x.label));
  const ev = (cls, em, h, t) => `<div class="evt ${cls}"><span class="em" aria-hidden="true">${em}</span><span><b>${h}</b>${t}</span></div>`;
  const list = [];
  if (m.robbed) list.push(ev('bad', '🦝', `Break-in overnight: −${usd(m.robbed)}`, 'A thief got into the till while you slept.'));
  if (m.arrived) list.push(ev('good', '📦', `${plural(m.arrived, 'plate')} arrived`, "Your Regular order from yesterday is in the kitchen."));
  if (fight) list.push(ev('good', '🐰', 'Your hurt bunnies are back', 'They are ready to work again today.'));
  if (!list.length) list.push(ev('info', '🌙', 'A quiet night', 'Nothing happened overnight.'));
  const rg = m.regulars;
  if (rg) {
    const stars = plural(rg.stars, 'star'), now = `${rg.to} regulars come every day now.`;
    if (rg.to > rg.from) list.unshift(ev('good', '⭐', `${sgn(rg.to - rg.from)} regulars`, `Your ${stars} got people talking. ${now}`));
    else if (rg.to < rg.from) list.unshift(ev('bad', '📉', `${sgn(rg.to - rg.from)} regulars`, `With ${stars}, fewer people want to eat here. ${now}`));
    else if (rg.change > 0) list.unshift(ev('good', '⭐', 'Fully booked', `Your ${stars} keep the room full: ${rg.to} regulars, as many as your restaurant can get.`));
    else if (rg.change < 0) list.unshift(ev('bad', '📉', 'Hardly anyone left', `With ${stars}, only your ${rg.to} most loyal regulars still come.`));
    else list.unshift(ev('info', '⭐', `${rg.to} regulars`, `Your ${stars} keep your regulars coming, the same as yesterday.`));
  }
  if (S.round === CFG.rounds - 1) list.push(ev('info', '⚡', 'Tomorrow is the last day', 'The Market will only sell Express food.'));
  if (S.round === CFG.rounds) list.push(ev('info', '🏁', 'Last day!', 'Tonight decides who wins the Golden Spoon.'));
  return `<section class="adsflow"><div class="card2 adsc center morn">${SUNRISE}<span class="kick">Next day</span><h1 class="funt big">Day ${S.round}</h1>
    <div class="evts">${list.join('')}</div>
    <div class="cashday"><span class="l">You start today with</span><span class="v">${usd(p.cash)}</span></div>
    <span class="rent">Rent −$${L.rent} was paid this morning.</span>
    <button class="cta inline" data-act="mornok">Start day ${S.round}</button></div></section>`;
}
// Right before the doors open: what the opponent's ads do to you tonight
const RECEIVED = {
  review: (A) => [`−${A.n} guests`, `A bad review keeps ${A.n} of your guests away tonight.`],
  poach: (A, o) => [`−${A.n} guest`, `${plural(A.n, 'guest')} goes to ${o} instead of you.`],
  swamp: (A) => [`+${A.n} guests`, `${A.n} extra guests come to you tonight. Can you serve them all?`],
  corner: (A) => [`+$${A.extra} rush`, `Each plate you rush tonight costs $${A.extra} more.`],
  fake: (A, o, n) => ['Fake ad!', `It made you expect ${n ? `about ${plural(n, 'more guest')}` : 'more guests'}, but nobody is coming. Did ${o} make you buy too much food?`]
};
// How many guests one hidden card seemed to bring (the same roll as the engine's adBump), for the reveal text
const looksFor = (s, id) => adBump(app.seed, app.S.round, other(s), [id]);
function receivedHTML(s, list) {
  const o = esc(nameOf(other(s)));
  const ad = x => { const A = CFG.ads[x.id], [big, line] = (RECEIVED[x.id] || (() => ['', A.desc]))(A, o, looksFor(s, x.id));
    return `<div class="radc"><span class="em" aria-hidden="true">${adFace(x.id).art}</span><b>${esc(A.name)}</b><span class="big">${big}</span><span>${line}</span></div>`; };
  return `<section class="adsflow"><div class="card2 adsc center"><h1 class="funt">Ads received</h1>
    <span class="fsub">${o} placed ${list.length === 1 ? 'this ad' : 'these ads'} for your restaurant. Here's what ${list.length === 1 ? 'it does' : 'they do'} tonight.</span>
    <div class="radlist">${list.map(ad).join('')}</div>
    <button class="cta inline" data-act="play">Open restaurant</button></div></section>`;
}

// ---------- service ----------
const SRC = { regulars: 'regulars', 'wom-old': 'word-of-mouth regulars', poached: 'guest you poached', flyer: 'Flyers guests', wom: 'word-of-mouth guests',
  swamp: `guests sent by your rival`, coupon: 'coupon guests', lunch: 'office lunch guests', delivery: 'delivery orders', subway: 'subway poster guests', bus: 'tour bus guests', blogger: "food blogger's guests", stall: 'market stall guests' };
const srcName = (src, s) => (src === 'swamp' ? `guests sent by ${nameOf(other(s))}` : SRC[src] || src);
// Letter badges for guests brought by an ad (F = Flyers), shown at the door
const BADGE = { flyer: 'F', coupon: 'C', blogger: 'B', stall: 'M', bus: 'T', wom: 'W', 'wom-old': 'W', delivery: 'D', lunch: 'L', subway: 'S', swamp: '!', poached: 'P' };
// A card result in plain words (from the step the engine recorded)
function adResult(x) {
  const A = CFG.ads[x.id];
  switch (x.id) {
    case 'bus': return x.n ? `The bus came! ${x.n} guests.` : `No bus today, so that $${A.price} was wasted.`;
    case 'blogger': return x.n ? `The blogger came with ${x.n} guests. Turn nobody away for a chance at a star.` : 'The blogger didn\'t come.';
    case 'subway': return x.n < A.n ? `It got lost in the crowd: only ${x.n} guests came.` : `${x.n} guests came.`;
    case 'stall': return `${plural(x.n, 'guest')} came, plus ${plural(x.food, 'free plate')} of food.`;
    case 'wom': return `${plural(x.n, 'guest')} came, and ${A.n} more will come every day after.`;
    case 'delivery': return `${x.n} delivery orders. They need food, but no table.`;
    case 'coupon': case 'lunch': return `${x.n} guests came, each paying $${A.off} less.`;
    default: return `${plural(x.n, 'guest')} came.`;
  }
}
function trickResult(x, s) {
  const A = CFG.ads[x.id];
  switch (x.id) {
    case 'review': return [`Kept ${A.n} of your guests away with a bad review`, 'card: Bad review'];
    case 'poach': return [`Took ${plural(A.n, 'guest')} of yours`, 'card: Poach a guest'];
    case 'swamp': return [`Sent you ${A.n} extra guests to overload you`, 'card: Swamp them'];
    case 'corner': return [`Made your emergency food cost $${A.extra} more`, 'Only matters if you rush food tonight · card: Corner the rush supplier'];
    case 'fake': { const n = looksFor(s, x.id); return [`Made you expect ${n ? plural(n, 'more guest') : 'more guests'} with a fake ad`, 'Nobody came: it was a bluff · card: False advertisement']; }
  }
  return [A.name, ''];
}
function logLine(st, s) {
  const o = nameOf(other(s));
  switch (st.k) {
    case 'arrive': return st.away ? `${st.n} ${srcName(st.src, s)} came. ${st.seated ? `${st.seated} got a table, ` : ''}${st.away} left unhappy.` : `${st.n} ${srcName(st.src, s)} came and got a table.`;
    case 'event': return st.ev === 'weather' ? `A storm flooded the road: ${st.n} fewer regulars tonight.` : `A protest is blocking the street: ${st.n} fewer regulars tonight.`;
    case 'short': return st.villagers ? `Villagers brought ${st.villagers} food for free.` : st.n ? `You got ${plural(st.n, 'extra table or food', 'extra tables or food')} in time.` : null;
    case 'food': return st.give ? 'You gave free food to someone in need.' : 'You said no to someone asking for food.';
    case 'fight': return `A fight broke out: ${plural(st.tables, 'table')} broken for good, ${st.food} food ruined.`;
    case 'propose': return st.ok ? `Someone proposed at a table. Yes! +$${st.tip} tip.` : 'Someone proposed at a table… awkward.';
    case 'booking': return `The booked party came and paid $${st.pay}.`;
    case 'noshow': return st.arrive ? (st.choice === 'hold' ? 'The booked party is on its way.' : 'The booked party came, but you had given their tables away.') : 'The booked party didn\'t show up.';
    case 'inspect': return st.caught ? `The health inspector caught your shady deal: −$${CFG.shady.fine}.` : 'A health inspector came by: all clear.';
    case 'close': return `Closing time: ${st.served} served, ${st.turned} left unhappy.`;
  }
  return null;
}
// The star rule, always in view during service (P5). n = guests left unhappy so far (or if you let them go)
function starCheck(n, note) {
  const tier = n === 0 ? 0 : n <= 3 ? 1 : 2;
  const row = (i, l, r) => `<div class="${i === tier ? 'on' : ''} t${i}"><span class="ar" aria-hidden="true">${i === tier ? '▶' : ''}</span><span>${l}</span><b>${r}</b></div>`;
  return box(`<div class="bhead">${lab('Star check at closing')}<span>${note}</span></div>
    <div class="tiers2">${row(0, '0 left unhappy', '+1 ★')}${row(1, '1–3 left unhappy', '−1 ★')}${row(2, '4 or more', '−2 ★')}</div>`, 'starcheck2');
}
// Card flips before the doors open: what each card did, one at a time
function flipList(s) {
  const S = app.S, o = other(s), mine = S.script[s].info.filter(x => x.k === 'card'), onThem = S.script[o].info.filter(x => x.k === 'card' && x.from === 'rival');
  return [...mine.filter(x => x.from === 'self').map(x => ({ ...x, who: 'You played', mineSide: true })),
    ...onThem.map(x => ({ ...x, who: `You played on ${esc(nameOf(o))}`, onRival: true })),
    ...mine.filter(x => x.from === 'rival').map(x => ({ ...x, who: `${esc(nameOf(o))} played on you` }))];
}
function flipStamp(x, s) {
  const A = CFG.ads[x.id], o = esc(nameOf(other(s)));
  if (x.onRival) return ['PLAYED', `It works on ${o}'s restaurant tonight.`, ''];
  switch (x.id) {
    case 'bus': return x.n ? [`🎲 THE BUS CAME! +${x.n}`, `Coin flip won. ${x.n} more guests at your door.`, 'gold'] : ['🎲 NO BUS', `No bus today. The $${A.price} is spent anyway.`, 'bad'];
    case 'blogger': return x.n ? [`🎲 THEY CAME! +${x.n}`, `Coin flip won. Serve every guest for a ${Math.round(A.star * 100)}% shot at a star.`, 'gold'] : ['🎲 NO SHOW', "The blogger didn't come.", 'bad'];
    case 'subway': return [`+${x.n} ARRIVED`, x.n < A.n ? `Lost in the crowd: only ${x.n} came.` : `${x.n} more guests at your door.`, x.n < A.n ? 'bad' : ''];
    case 'stall': return [`+${x.n} 👤 +${x.food} 🍽`, 'A guest, plus a free plate in your kitchen.', ''];
    case 'delivery': return [`+${x.n} ORDERS`, 'Couriers come to the kitchen. They need food, but no table.', ''];
    case 'review': return [`OUCH −${A.n}`, `${o} left you a bad review.`, 'bad'];
    case 'poach': return [`−${A.n} 👤`, `${o} took one of your guests.`, 'bad'];
    case 'swamp': return [`+${A.n} 👤`, `${o} sent you ${A.n} extra guests. Can you serve them?`, 'bad'];
    case 'corner': return [`+$${A.extra} 🍽`, 'Your rush plates cost more tonight.', 'bad'];
    case 'fake': { const n = looksFor(s, x.id); return ['FAKE AD!', `${n ? `The ${plural(n, 'guest')} you expected` : 'The guests you expected'} won't come. ${o} bluffed.`, 'bad']; }
  }
  return [`+${x.n} ARRIVED`, `${plural(x.n, 'more guest')} at your door.`, ''];
}
const unesc = t => String(t).replace(/&(amp|lt|gt|quot|#39);/g, (_, c) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[c]));
// What the real-time service needs from the engine's script (who comes, what the cards did, the event)
function svcOpts(s) {
  const S = app.S, p = S.players[s], sc = S.script[s], o = other(s), on = unesc(nameOf(o)), look = seatLook(s);
  const cards = sc.info.filter(x => x.k === 'card');
  const pop = (x, side) => {
    const [, line] = flipStamp(x, s);
    return { name: side === 'rival' ? `${on}'s ${cardName(x.id)}` : cardName(x.id), line: unesc(line), side };
  };
  const groups = sc.groups.map(g => {
    if (g.src === 'poached') return { ...g, id: 'poached', name: 'Poach a guest', line: `${plural(g.n, 'guest')} from ${on} came to you`, from: 'self' };
    const x = cards.find(c => c.id === g.src && c.from === g.from) || { id: g.src, n: g.n };
    return { ...g, id: g.src, ...pop(x, g.from === 'rival' ? 'rival' : 'self'), from: g.from };
  });
  // Card effects that bring no guests still get a pop-up (bad review, poach, corner, bluff, no bus, no blogger)
  const notes = cards.filter(x => !sc.groups.some(g => g.src === x.id && g.from === x.from) && x.id !== 'stall')
    .map(x => ({ ...pop(x, x.from === 'rival' ? 'rival' : 'self'), bad: x.from === 'rival' ? x.id !== 'fake' : !x.n }));
  const evn = sc.info.find(x => x.k === 'event');
  if (evn) notes.unshift({ name: evn.ev === 'weather' ? 'Storm' : 'Protest', line: `${evn.n} fewer regulars tonight`, side: 'self', bad: true });
  return { loc: p.loc, day: S.round, animal: look.animal, me: look.color, rival: seatLook(o).color, rivalName: on, price: sc.price,
    cash: p.cash, plates: sc.plates, hired: sc.staff, walkins: sc.walkins, groups, notes,
    event: sc.mid ? { type: sc.mid, ok: sc.proposeOk, tip: CFG.service.tip, fight: CFG.service.fightStaff } : null,
    rushPrice: i => opPrice(S, s, i), P: CFG.service.live, seed: `${S.seed}:${S.round}:${s}`,
    tutorial: S.round === 1 ? 'day1' : S.round === CFG.adsFrom ? 'day3' : null,
    fast: window.__RR_SVC_FAST || 1, auto: !!window.__RR_SVC_AUTO };
}
// The live service lives outside render(): its element is moved back into each new page, so a re-render never restarts it
function mountService() {
  const host = document.getElementById('svc-host'), S = app.S;
  const want = host && host.dataset.key;
  if (app.svcInst && app.svcInst.key !== want) { app.svcInst.destroy(); app.svcInst = null; }
  if (!host) return;
  if (!app.svcInst) {
    const s = host.dataset.seat, k = S.waiting[s];
    const inst = RRService.create(host, { ...svcOpts(s), onDone: res => { if (app.S.waiting[s] === k) act(s, { k, res }); } });
    inst.key = want; app.svcInst = inst;
  } else if (app.svcInst.el.parentNode !== host) host.appendChild(app.svcInst.el);
}
function svcKey(s) { return `${app.code}:${app.seed}:${app.S.round}:${s}`; }
function svcState(s) {
  const key = svcKey(s);
  if (!app.svc[s] || app.svc[s].key !== key) app.svc[s] = { key, started: false, flip: 0 };
  return app.svc[s];
}
function serviceHTML(s) {
  const S = app.S, sv = svcState(s), o = other(s), p = S.players[s], sc = S.script[s];
  // after closing: waiting for the rival
  if (!S.waiting[s]) {
    const r = (S.got[s] && S.got[s].res) || {};
    return shell(fhead('Closed for the night', 'Your doors are closed.') + `<div class="cpills"><span class="cp earn">+${usd(r.earned || 0)} tonight</span><span class="cp seat">Served ${(r.served || 0) + (r.delivered || 0)}</span><span class="cp ${r.unhappy ? 'bad' : ''}">Left unhappy ${r.unhappy || 0}</span></div>`,
      waitBox(o, 'The recap opens when they finish serving.') + starCheck(r.unhappy || 0, `${r.unhappy || 0} unhappy`));
  }
  // before the doors open: what the opponent's ads do to you tonight
  const recv = S.round >= CFG.adsFrom ? sc.info.filter(x => x.k === 'card' && x.from === 'rival') : [];
  if (!sv.started && recv.length) return receivedHTML(s, recv);
  const list = [];
  if (!sv.started && list.length) {
    const shownN = Math.min(sv.flip, list.length), done = shownN >= list.length;
    const start = sc.base + p.wom;
    const counted = list.slice(0, shownN).filter(x => !x.onRival && x.n);
    const poachN = S.reveals[s].rival.includes('poach') && list.slice(0, shownN).some(x => x.onRival && x.id === 'poach') ? CFG.ads.poach.n : 0;
    const parts = counted.map(x => (x.n > 0 ? ` + ${x.n}` : ` − ${-x.n}`)).join('') + (poachN ? ` + ${poachN}` : '');
    const total = start + counted.reduce((a, x) => a + x.n, 0) + poachN;
    if (!done) {
      const key = `${sv.key}:${sv.flip}`;
      if (app.flipKey !== key) { app.flipKey = key; setTimeout(() => { if (app.flipKey === key && !sv.started) { sv.flip++; render(); } }, shownN ? 1700 : 800); }
    }
    const col = x => {
      const [st, line, cls] = flipStamp(x, s), whoCls = x.who.endsWith('on you') ? 'rival' : 'you';
      return `<div class="fcol"><span class="who ${whoCls}">${x.who}</span><div class="fcard">${adCard(x.id, o, { button: false })}<span class="stamp2 ${cls}">${st}</span></div><span class="fline">${line}</span></div>`;
    };
    const next = done ? '' : `<div class="fcol nx"><span class="who">Next</span><div class="fback">${cardBack('f' + shownN)}</div><span class="fline dim">${shownN ? 'The next card flips…' : 'Turning over the cards…'}</span></div>`;
    return `<section class="flip2" aria-live="polite"><div class="fh center"><h1 class="funt">Cards flip!</h1><span class="fsub">One at a time, before the doors open.</span></div>
      <div class="flips2">${list.slice(0, shownN).map(col).join('')}${next}</div>
      <div class="eqpill"><span>Tonight so far:</span><b>${parts ? `${start}${parts} = ${total}` : start} guests</b></div>
      ${done ? `<span class="fnote center">They don't all come at once: each card's guests walk in during the night.</span><button class="cta inline bigc" data-act="play">Go to your restaurant →</button>` : ''}</section>`;
  }
  return `<section class="svc2" aria-label="Service"><div id="svc-host" data-seat="${s}" data-key="${svcKey(s)}"></div>
    <div class="svchelp"><span><b>Click a guest at the door</b> to seat them. <b>Click a seated guest</b> with a plate bubble to serve them. Out of plates? <b>Click the stove</b> to rush one, then click again (or Space) in the green.</span>
    <span class="dim">Every guest pays $${sc.price}. Each bunny seats and serves the guests in its own section; the other tables are yours. When guests finish eating and leave, their table is free for the next guests.</span></div></section>`;
}
const CARDART = id => (adFace(id).art || '•');

// ---------- sorry vouchers: a pop-up after service, before the recap ----------
function voucherHTML(s) {
  const S = app.S, v = S.service[s], p = S.players[s], k = S.waiting[s], o = other(s);
  if (!k) {
    const note = v.turned > 0 && !S.submitted[s] && p.cash < CFG.voucher ? `You turned away ${plural(v.turned, 'guest')}, but don't have $${CFG.voucher} for a voucher.` : 'Done. The recap is next.';
    return `<div class="vpage"><section class="card2 vcard2" aria-label="Sorry vouchers">${lab('After service')}<b class="vh2">${note}</b>${waitBox(o)}</section></div>`;
  }
  const f = F({ n: 0 }), max = Math.min(v.turned, Math.floor(p.cash / CFG.voucher));
  if (f.n > max) f.n = max;
  const res = n => { const u = v.turned - n; return u === 0 ? 'no star lost' : u <= 3 ? '−1 ★' : '−2 ★'; };
  const faces = Array.from({ length: Math.min(v.turned, 12) }, (_, i) => {
    const on = i < f.n, can = i < max;
    return `<button type="button" class="face2 ${on ? 'on' : ''}" data-act="vface" data-i="${i}" aria-pressed="${on}" ${can ? '' : 'disabled'} aria-label="Guest ${i + 1}: ${on ? 'voucher sent' : `send a $${CFG.voucher} voucher`}"><span class="em">${on ? '😊' : '😞'}</span><span>${on ? '🎟️ voucher sent' : can ? `tap to send $${CFG.voucher}` : 'not enough cash'}</span></button>`;
  }).join('');
  const boxes = Array.from({ length: Math.min(v.turned, 8) + 1 }, (_, n) => n).filter(n => n <= max);
  const u = v.turned - f.n, need = u > 3 ? u - 3 : u;
  const hint = f.n >= max && u > 0 ? `That's all your cash allows.` : u === 0 ? 'Nobody counts against your stars.' : need <= max - f.n
    ? `Send ${need} more and you ${u > 3 ? 'lose only 1 star instead of 2' : 'keep your star'}. Each star pays you $${CFG.starValue} every night, and $${CFG.starValue} more in the final score.` : `Each star pays you $${CFG.starValue} every night, and $${CFG.starValue} more in the final score.`;
  return `<div class="vpage"><section class="card2 vcard2" role="dialog" aria-labelledby="vh">
    ${lab('After service')}<h1 class="funt" id="vh">${plural(v.turned, 'guest')} left unhappy</h1>
    <span class="fsub">Send a $${CFG.voucher} sorry voucher. Guests who get one don't count against your stars.</span>
    <div class="faces2">${faces}</div>${v.turned > 12 ? `<span class="fnote">Showing 12 of ${v.turned} guests.</span>` : ''}
    <div class="vres2"><span class="vl">Your star result</span><div>${boxes.map(n => `<div class="${n === f.n ? 'on' : ''} ${res(n) === 'no star lost' ? 'ok' : ''}"><span>${n} sent · $${n * CFG.voucher}</span><b>${res(n)}</b></div>`).join('')}</div>
      <span class="vhint2">${hint}</span></div>
    <div class="vbtns2"><button class="obtn" data-act="voucher" data-n="0">Don't send any</button>${f.n ? `<button class="cta" data-act="voucher">Send ${plural(f.n, 'voucher')} (${usd(f.n * CFG.voucher)})</button>` : '<span class="fnote center">Tap a face to send a voucher.</span>'}</div>
  </section></div>`;
}

// ---------- recap ----------
const WHY = { 'served everyone +1': 'Every guest who came was served.',
  'inspector −1': 'The health inspector caught your shady deal.', 'kindness paid off +1': 'Word got out that you shared food with someone in need.',
  'word got out you said no −1': 'Word got out that you said no to someone in need.', 'blogger loved it +1': 'The food blogger loved it.' };
const whyText = w => WHY[w] || (/^turned away (\d+)/.test(w) ? `${w.match(/^turned away (\d+)/)[1]} guests left unhappy.` : w);
function tipFor(s) {
  const S = app.S, v = S.service[s], h = S.players[s].history.slice(-1)[0], L = CFG.loc[S.players[s].loc];
  const robbed = S.morning[s] && S.morning[s].robbed;
  if (robbed && !v.turned && !v.rush.n && h.spoiled <= 1) return [`A thief took ${usd(robbed)} last night.`, "That's bad luck, not your running of the restaurant: nobody was turned away and almost nothing went to waste."];
  if (v.turned > 0 && h.spoiled === 0) return [`${plural(v.turned, 'guest')} left unhappy, and your plates ran out.`, `Regular food at the Market is $${CFG.market.reg.price} a plate. Buying ahead is cheaper than rushing or losing stars.`];
  if (v.turned > 0) return [`${plural(v.turned, 'guest')} waited too long and left.`, `Another bunny costs $${wageOf(S.players[s])} a day and seats and serves 2 tables. Or keep clicking guests at the door yourself.`];
  if (v.rush.n) return [`You were ${plural(v.rush.n, 'plate')} short and had to rush ${v.rush.n === 1 ? 'it' : 'them'} for ${usd(v.rush.cost)}.`, `One more Regular plate at the Market costs $${CFG.market.reg.price}. Buying ahead is cheaper than rushing.`];
  // Ads only come up once there are ads tomorrow (from day CFG.adsFrom)
  if (h.spoiled > 1) return [`${plural(h.spoiled, 'plate')} went to waste.`, S.round + 1 >= CFG.adsFrom ? 'Buy a little less food tomorrow, or bring in more guests with an ad.' : 'Buy a little less food tomorrow.'];
  const flop = (S.script[s].info || []).find(x => x.k === 'card' && x.from === 'self' && (x.id === 'bus' || x.id === 'blogger') && !x.n);
  if (flop) return [`The ${CFG.ads[flop.id].name.toLowerCase()} didn't pay off.`, 'Chance cards are a gamble. Sure things like Flyers are steadier.'];
  return ['A perfect night!', `Nothing wasted, nobody turned away. Every guest paid $${L.price}. Do it again!`];
}
const gstar = (cls) => `<svg class="gstar ${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/></svg>`;
const confetti = '<svg class="confetti" viewBox="0 0 700 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect x="560" y="34" width="10" height="4" rx="2" fill="#FFD21F" transform="rotate(30 565 36)"/><rect x="610" y="80" width="12" height="4" rx="2" fill="#E8392B" transform="rotate(-20 616 82)"/><rect x="520" y="110" width="8" height="4" rx="2" fill="#fff" opacity=".6" transform="rotate(60 524 112)"/><circle cx="650" cy="44" r="3" fill="#FFD21F"/><circle cx="590" cy="150" r="2.5" fill="#E8392B"/><rect x="660" y="140" width="10" height="4" rx="2" fill="#FFD21F" transform="rotate(-50 665 142)"/><circle cx="480" cy="40" r="2" fill="#fff" opacity=".6"/><rect x="630" y="210" width="9" height="4" rx="2" fill="#fff" opacity=".5" transform="rotate(15 634 212)"/><circle cx="545" cy="230" r="3" fill="#FFD21F"/></svg>';
function recapHTML(s) {
  const S = app.S, p = S.players[s], o = other(s), q = S.players[o], v = S.service[s], rv = S.service[o], k = S.waiting[s];
  const h = p.history.slice(-1)[0], profit = round2(h.income + h.spend), last = S.round >= CFG.rounds;
  const best = p.history.length > 1 && p.history.every(x => round2(x.income + x.spend) <= profit);
  const d = v.starsAfter - v.starsBefore;
  const gs = [1, 2, 3, 4, 5].map(i => gstar(i <= v.starsAfter ? (d > 0 && i > v.starsBefore ? 'on new' : 'on') : d < 0 && i <= v.starsBefore ? 'lost' : '')).join('');
  const starHead = d > 0 ? `+${plural(d, 'star')}! You're at ${v.starsAfter} now` : d < 0 ? `−${plural(-d, 'star')}. You're at ${v.starsAfter} now` : `Still ${plural(v.starsAfter, 'star')}`;
  const whys = (v.why || []).map(whyText);
  const capped = (v.why || []).length > 1 && Math.abs(d) === 2 ? ' Stars can\'t change by more than 2 in one night.' : '';
  const me = score(s), them = score(o), max = Math.max(me, them, 1), gap = round2(Math.abs(me - them));
  const daysLeft = CFG.rounds - S.round;
  const prevGap = p.history.length > 1 ? (p.history[p.history.length - 2].cash + p.history[p.history.length - 2].stars * CFG.starValue) - (q.history[q.history.length - 2].cash + q.history[q.history.length - 2].stars * CFG.starValue) : null;
  let verdict;
  if (me === them) verdict = ['Dead even!', last ? 'Tied on score.' : 'Tomorrow could decide it.'];
  else if (me > them) verdict = [last ? `You finished ${usd(gap)} ahead` : `You're ${usd(gap)} ahead`, last ? 'See who won.' : `Keep it up for ${plural(daysLeft, 'more day')}.`];
  else verdict = [last ? `You finished ${usd(gap)} behind` : `${gap <= 15 ? 'Just ' : ''}${usd(gap)} behind, with ${plural(daysLeft, 'day')} to go`, gap < CFG.starValue ? 'One more star would put you ahead.' : 'A good night tomorrow can close it.'];
  if (prevGap !== null && !last) { const now = me - them, ch = round2(now - prevGap); if (ch > 0) verdict[1] = `You closed the gap by ${usd(ch)} tonight. ` + verdict[1]; }
  const lane = (who, n, cls, name, detail) => `<div class="lane"><div class="t"><span class="inl"><span class="dot ${cls}"></span><b>${name}</b></span><span><b class="n">${n}</b> <span class="hint">${detail}</span></span></div><span class="tr"><i style="width:${Math.max(4, n / max * 100)}%;background:var(--${cls})"></i></span></div>`;
  const ledger = p.ledger.filter(x => x.amt !== null && x.amt !== 0);
  const ins = ledger.filter(x => x.amt > 0).sort((a, b) => b.amt - a.amt), outs = ledger.filter(x => x.amt < 0).sort((a, b) => a.amt - b.amt);
  const [tipA, tipB] = tipFor(s);
  const tomorrowFood = p.pending ? `<span class="hint" style="padding-top:6px;border-top:1px solid var(--line2)">Arriving tomorrow morning: ${plural(p.pending, 'plate')} from today's Regular order${p.pending === 1 ? '' : 's'}.</span>` : '';
  const rd = rv.starsAfter - rv.starsBefore;
  const btn = k ? `<button class="cta" data-act="next">${last ? 'See who won →' : `Start day ${S.round + 1} →`}</button>` : waitCard(o, `Waiting for ${esc(nameOf(o))} to finish their recap…`);
  return `<div class="recap-top">
    <section class="hero">${profit > 0 ? confetti : ''}<span class="eyebrow">Day ${S.round} is done</span>
      <div class="money">${profit > 0 ? `<span>You made a profit of</span>${gold(`+$${profit}`)}<span>tonight.${best ? ' Your best day so far.' : ''}</span>`
        : profit === 0 ? `<span>You broke even</span><span class="loss">$0</span><span>tonight. See the tip below.</span>`
        : `<span>Tonight you lost</span><span class="loss">${usd(profit)}</span><span>${S.morning[s] && S.morning[s].robbed ? "Mostly because of last night's break-in." : 'A tough night. See the tip below.'}</span>`}</div>
      <div class="starbox"><span class="gstars" role="img" aria-label="Stars went from ${v.starsBefore} to ${v.starsAfter}">${gs}</span><span><b>${starHead}</b><span>${whys.length ? esc(whys.join(' ')) : 'Nothing changed your rating tonight.'}${capped}</span></span></div>
    </section>
    <section class="race"><div class="hd"><h2>The race</h2><span>score = cash + $${CFG.starValue} per star</span></div>
      ${[[o, them, 'rival', esc(nameOf(o)), `${usd(q.cash)} + ${q.stars} ★`], [s, me, 'you', app.mode === 'online' ? 'You' : esc(nameOf(s)), `${usd(p.cash)} + ${p.stars} ★`]].sort((a, b) => b[1] - a[1]).map(x => lane(...x)).join('')}
      <div class="verdict"><b>${verdict[0]}</b><span>${verdict[1]}</span></div></section>
  </div>
  <div class="recap-bot">
    <section class="panel"><h2>Where your money went</h2><div class="lines">
      ${ins.map(x => `<div><span>${esc(x.label)}</span><b class="pos">+${usd(x.amt)}</b></div>`).join('')}${outs.map(x => `<div><span class="muted">${esc(x.label)}</span><span>${usd(x.amt)}</span></div>`).join('')}
      <div class="tot"><span>${profit >= 0 ? 'Profit tonight' : 'Loss tonight'}</span><span>${profit >= 0 ? '+' : ''}${usd(profit)}</span></div><div><span class="muted">Cash now</span><span>${usd(p.cash)}</span></div></div></section>
    <section class="panel"><h2>Tonight in numbers</h2><div class="tiles two">
      <div class="tile"><span class="v">${v.served + v.delivered} of ${v.demand}</span><span class="s">guests served</span></div><div class="tile ${v.turned ? 'bad' : ''}"><span class="v">${v.turned}</span><span class="s">left unhappy${v.vouchers ? ` (${v.vouchers} got a voucher)` : ''}</span></div>
      <div class="tile"><span class="v">${h.spoiled}</span><span class="s">plates thrown away</span></div><div class="tile"><span class="v">${v.rush.n}</span><span class="s">plates rushed${v.rush.n ? ` (${usd(-v.rush.cost)})` : ''}</span></div></div></section>
    <div class="stack"><section class="panel edge"><span class="hint" style="font-weight:700;color:var(--muted)">For tomorrow</span><b style="font-size:15px;line-height:1.35">${tipA}</b><span style="font-size:13px;color:var(--ink2);line-height:1.45">${tipB}</span>${last ? '' : tomorrowFood}</section>
      <section class="panel" style="grid-template-columns:auto 1fr;align-items:center"><span class="dot round rival"></span><span style="font-size:13px;color:var(--ink2)"><b style="color:var(--ink)">${esc(nameOf(o))}</b> served ${rv.served + rv.delivered}, ${rv.turned} left unhappy${rd ? `, ${rd > 0 ? 'gained' : 'lost'} ${plural(Math.abs(rd), 'star')}` : ''}. ${S.round < CFG.adsFrom ? '' : S.reveals[o] && S.reveals[o].self.length ? `Their ads: ${S.reveals[o].self.map(id => esc(CFG.ads[id].name)).join(', ')}.` : 'No ads for their own restaurant.'}</span></section>
      ${btn}</div>
  </div>`;   // the day-by-day table is on the final results page
}
// Every finished day for both restaurants (the old "Daily log" table), folded away by default
function dayLogHTML(s) {
  const S = app.S, rows = [];
  for (let r = 1; r <= CFG.rounds; r++) for (const w of [s, other(s)]) {
    const h = S.players[w].history.find(x => x.round === r); if (!h) continue;
    rows.push(`<tr><td>Day ${r} · ${esc(nameOf(w))}</td><td>${h.demand}</td><td>${h.served}</td><td class="${h.turned ? 'neg' : ''}">${h.turned}</td><td>${h.spoiled}</td><td class="pos">+${usd(h.income)}</td><td>${usd(h.spend)}</td><td>${usd(h.cash)}</td><td>${h.stars}</td></tr>`);
  }
  if (!rows.length) return '';
  return `<details class="panel daylog"><summary><b>Every day so far</b><span class="hint">guests, money and stars for both restaurants</span></summary>
    <div style="overflow-x:auto"><table><thead><tr><th>Day</th><th>Came</th><th>Served</th><th>Left unhappy</th><th>Thrown away</th><th>Money in</th><th>Money out</th><th>Cash</th><th>Stars</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
}

// ---------- the ending after day 5 (team sketch; prototypes/ending) ----------
// Both players: doors closed → the judges count. Winner: you won → reward. Loser: you lost → consolation. Then the summary (finalHTML).
// A draw or a bankruptcy skips the win/lose pages. The step is page-only (app.endStep), per player.
const END_PIC = { p1: 'assets/ending-cat-wins.webp', p2: 'assets/ending-dog-wins.webp' };   // who wins → the picture where that chef celebrates
// where each chef sits in each picture (CSS background-position): happy winner and sad loser
const END_CROP = { p1: { win: '6% 40%', lose: '6% 62%' }, p2: { win: '94% 40%', lose: '96% 62%' } };  // the cat is always on the left, the dog on the right
// The winner's note to the loser (fixed; ties back to the story of the two partners)
const WINNER_NOTE = "Hey partner… good game! 🥄 Remember when the two of us ran the Two Spoons together? Honestly, the kitchen feels way too quiet without you. Wanna come back and cook with me? I'll even let you hold the big spoon. 💛";
const avatar = (s, cls = '') => `<span class="eav ${s === 'p1' ? 'cat' : 'dog'} ${cls}" aria-hidden="true"></span>`;
function endingHTML(s) {
  const S = app.S, R = S.result, o = other(s), sc = R.score;
  const step = app.endStep[s] || 0, decided = R.reason === 'done' && R.winner !== 'draw', won = R.winner === s;
  const you = app.mode === 'online' ? 'You' : esc(nameOf(s)), next = (label, n) => `<button class="cta inline" data-act="endstep" data-n="${n}">${label}</button>`;
  if (R.reason !== 'done' || step >= 4) return finalHTML(s);
  const gap = usd(round2(Math.abs(sc[s].total - sc[o].total)));
  const wrap = (inner, cls = '') => `<section class="ending ${cls}"><div class="ein">${inner}</div></section>`;
  if (step === 0) return wrap(`<svg class="moon" viewBox="0 0 90 90" aria-hidden="true"><path d="M60 10 a38 38 0 1 0 20 52 a30 30 0 1 1 -20 -52z" fill="#FFD21F"/><circle cx="20" cy="20" r="3" fill="#FFF7D6"/><circle cx="76" cy="26" r="2" fill="#FFF7D6"/></svg>
    <span class="ekick">Day ${CFG.rounds} · the last service is over</span><h1 class="efun">The doors are closed</h1><p class="esub">The judges are counting the money…</p>
    <div class="edots" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="epair"><div class="ewho">${avatar(s)}<span class="${s === 'p1' ? 'you' : 'riv'}">${you}</span></div><div class="ewho">${avatar(o)}<span class="${o === 'p1' ? 'you' : 'riv'}">${esc(nameOf(o))}</span></div></div>
    ${next('See the count', 1)}`);
  if (step === 1) {
    const box = (w, cls, name) => { const p = S.players[w], x = sc[w];
      const c = w === 'p1' ? 'you' : 'riv';
      return `<div class="ebal ${c}"><div class="ewho row">${avatar(w, 'sm')}<span class="${c}">${name}</span></div>
        <div class="eline"><span>Cash</span><b>${usd(x.cash)}</b></div>
        <div class="eline"><span class="estars" aria-label="${x.stars} of 5 stars">${'★'.repeat(x.stars)}<s>${'★'.repeat(5 - x.stars)}</s></span><b>${x.stars} × $${CFG.starValue} = $${x.starPts}</b></div>
        ${x.loan ? `<div class="eline"><span>Loan to pay back</span><b>${usd(x.loan)}</b></div>` : ''}
        <div class="etot"><span>Total</span><b>${usd(x.total)}</b></div></div>`; };
    return wrap(`<span class="ekick">The judges count</span><h1 class="efun sm">Money + $${CFG.starValue} for every star</h1>
      <div class="etally">${box(s, 'you', you)}${box(o, 'riv', esc(nameOf(o)))}</div>
      <span class="erule">If the totals are equal, more stars wins.</span>
      ${decided ? next('And the winner is…', 2) : next('See the results', 4)}`);
  }
  const pic = END_PIC[R.winner], crop = (w, mood, cls) => `<span class="ecrop ${cls}" style="background-image:url(${pic});background-position:${END_CROP[w][mood]}" aria-hidden="true"></span>`;
  if (step === 2 && won) return wrap(`<span class="ebadge" aria-hidden="true">${ART.badge('end')}</span><span class="ekick gold2">Congratulations</span>
    <h1 class="efun big">You won the</h1><span class="espoon">GOLDEN SPOON!</span><p class="esub">You beat ${esc(nameOf(o))} by ${gap}.</p>${next('Continue', 3)}`, 'glow');
  if (step === 2) return wrap(`<div class="etwo">${crop(s, 'lose', s === 'p1' ? 'you' : 'riv')}<div class="ecol"><span class="ekick">The judges have decided</span>
    <h1 class="efun sm">Unfortunately, you lost the competition</h1><p class="esub">${esc(nameOf(o))} won the Golden Spoon by ${gap}.</p><div>${next('Continue', 3)}</div></div></div>`);
  if (won) return wrap(`<span class="ekick">Your reward</span><h1 class="efun sm">The Two Spoons is yours again!</h1>
    <img class="epic" src="${pic}" alt="Your chef celebrates with the golden spoon at the Two Spoons">
    <p class="esub">Congratulations! You got your restaurant back.</p>${next('Summary', 4)}`);
  return wrap(`<h1 class="efun sm">Better luck next time!</h1>
    <div class="econs"><div class="epair2">${crop(s, 'lose', 'sm2')}<span class="eplus">+</span>${crop(o, 'win', 'sm2')}</div>
      <div class="equote">“${esc(WINNER_NOTE)}”<small>— a note from ${esc(nameOf(o))}, the winner</small></div></div>
    ${next('Summary', 4)}`);
}
// Share: a picture of the summary page (html2canvas, loaded on first use from vendor/), shared or downloaded
async function shareSummary() {
  const el = document.querySelector('#app');
  try {
    if (!window.html2canvas) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'vendor/html2canvas-1.4.1.min.js'; sc.onload = ok; sc.onerror = no; document.head.appendChild(sc); });
    const bg = getComputedStyle(document.body).backgroundColor;
    // html2canvas redraws the page itself and misses a few styles, so the copy it draws is simplified first:
    // the top picture is cropped as a background (no object-fit there), shadows go (they leave white corners),
    // and the buttons, the "playing as" strip and the folded day table are left out of the picture.
    const onclone = doc => {
      const st = doc.createElement('style');
      st.textContent = '*{box-shadow:none!important;filter:none!important} .again,.daylog,.strip,[data-act=share]{display:none!important} .final-mid{grid-template-columns:1fr!important}';
      doc.head.appendChild(st);
      doc.querySelectorAll('.final-hero > img').forEach(img => {
        const hero = img.parentElement;
        Object.assign(hero.style, { backgroundImage: `url("${img.src}")`, backgroundSize: 'cover', backgroundPosition: '50% 22%' });
        img.remove();
      });
    };
    const canvas = await window.html2canvas(el, { backgroundColor: bg, scale: Math.min(2, window.devicePixelRatio || 1), onclone });
    const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
    const file = new File([blob], 'spoon-fight-result.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Spoon Fight' }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'spoon-fight-result.png'; document.body.appendChild(a); a.click(); a.remove();
    toast('Picture saved: spoon-fight-result.png');
  } catch (e) { if (!(e && e.name === 'AbortError')) toast("Couldn't make the picture. Try a screenshot instead."); }
}

// ---------- final results ----------
function finalHTML(s) {
  const S = app.S, R = S.result, sc = R.score, o = other(s), p = S.players[s], q = S.players[o];
  const meWon = R.winner === s, tie = R.winner === 'draw', gap = round2(Math.abs(sc[s].total - sc[o].total));
  const you = app.mode === 'online' ? 'You' : nameOf(s);
  let head, line;
  if (R.reason === 'bankrupt') {
    const meBroke = p.bankrupt, themBroke = q.bankrupt;
    if (meBroke && themBroke) { head = meWon ? 'You win!' : tie ? "It's a draw" : `${nameOf(o)} wins`; line = 'Both restaurants ran out of money for rent on the same morning, so the higher score wins.'; }
    else if (meBroke) { head = 'Your restaurant had to close'; line = `You couldn't pay this morning's rent, so the game ends, and ${nameOf(o)} wins.`; }
    else { head = 'You win!'; line = `${nameOf(o)}'s restaurant closed: they couldn't pay their rent this morning, so the game ends early.`; }
  } else if (tie) { head = "It's a draw"; line = 'Same score and same stars. A perfect match.'; }
  else if (sc[s].total === sc[o].total) { head = meWon ? 'You win!' : `${nameOf(o)} wins`; line = `Same score, so more stars wins: ${p.stars} ★ against ${q.stars} ★.`; }
  else if (meWon) { head = 'You win!'; line = `${app.mode === 'online' ? 'Your' : `${esc(nameOf(s))}'s`} ${restName(p.loc)} restaurant beat ${esc(nameOf(o))}'s by <b>${usd(gap)}</b>.`; }
  else { head = gap < CFG.starValue ? 'So close!' : `${esc(nameOf(o))} wins this one`; line = `${esc(nameOf(o))} won by ${usd(gap)}.${gap < CFG.starValue ? " That's less than one star." : ''}`; }
  const big = meWon ? gold(esc(head)) : `<span class="plain">${esc(head)}</span>`;
  const card = (w, place) => `<div class="score ${place === 1 && !tie ? 'win' : ''}"><span class="w"><span class="dot ${w === s ? 'you' : 'rival'}"></span>${w === s ? esc(you) : esc(nameOf(w))}${tie ? '' : ` · ${place === 1 ? '1st' : '2nd'}`}</span><span class="n">${sc[w].total}</span><span class="s">${usd(sc[w].cash)} cash + ${S.players[w].stars} ★ ($${sc[w].starPts})${sc[w].loan ? ` − loan $${-sc[w].loan}` : ''}</span></div>`;
  const first = R.winner === o ? o : s;
  // the race chart
  const days = Math.max(p.history.length, q.history.length);
  const ser = w => S.players[w].history.map(h => h.cash + h.stars * CFG.starValue);
  const a = ser(s), b = ser(o), all = [...a, ...b, CFG.startCash + CFG.startStars * CFG.starValue];
  const stepV = Math.max(10, Math.ceil((Math.max(...all) - Math.min(...all)) / 3 / 10) * 10), lo = Math.floor(Math.min(...all) / stepV) * stepV, hi = lo + stepV * 3 >= Math.max(...all) ? lo + stepV * 3 : lo + stepV * 4;
  const X = i => (days <= 1 ? 340 : 60 + i * (540 / (days - 1))), Y = vv => 220 - (vv - lo) / (hi - lo || 1) * 180;
  const pts = arr => arr.map((vv, i) => `${X(i).toFixed(1)},${Y(vv).toFixed(1)}`).join(' ');
  const grid = Array.from({ length: Math.round((hi - lo) / stepV) + 1 }, (_, i) => i).map(i => { const val = lo + stepV * i; const y = Y(val); return `<path class="grid" d="M40 ${y}h580"/><text x="30" y="${y + 4}" text-anchor="end">${val}</text>`; }).join('');
  const labels = Array.from({ length: days }, (_, i) => `<text class="d" x="${X(i)}" y="244" text-anchor="middle">Day ${i + 1}</text>`).join('');
  let lead = '';
  const ledFor = a.filter((x, i) => b[i] > x).length;
  if (meWon && ledFor >= days - 1 && days > 1) lead = `${esc(nameOf(o))} led for ${plural(ledFor, 'day')}. You took the lead at the very end.`;
  else if (meWon) lead = 'You led for most of the game.';
  else lead = `${esc(nameOf(o))} was ahead for most of the game.`;
  const served = p.history.reduce((x, h) => x + h.served, 0), came = p.history.reduce((x, h) => x + h.demand, 0), spoiled = p.history.reduce((x, h) => x + h.spoiled, 0);
  const adsSpent = -p.history.reduce((x, h) => x + h.ledger.filter(l => /^Ads (×|refunded)/.test(l.label)).reduce((y, l) => y + l.amt, 0), 0);
  const bestDay = p.history.reduce((bd, h) => (round2(h.income + h.spend) > round2(bd.income + bd.spend) ? h : bd), p.history[0] || { income: 0, spend: 0, round: 1 });
  return `<section class="final-hero" aria-label="Result"><img src="${IMG.art}" alt="">
    <div class="in"><div style="display:grid;gap:6px">${big}<p>${line}</p></div><div class="scores">${card(first, 1)}${card(other(first), 2)}</div></div></section>
  <div class="final-mid">
    <section class="panel" style="padding:22px 24px"><div class="row" style="justify-content:space-between"><h2 style="font-family:var(--display);font-size:20px">How the race went</h2>
      <span class="row" style="gap:14px;font-size:12px"><span class="inl"><span style="width:14px;height:3px;border-radius:2px;background:var(--you)"></span><b>${esc(you)} ${sc[s].total}</b></span><span class="inl"><span style="width:14px;height:3px;border-radius:2px;background:var(--rival)"></span><b>${esc(nameOf(o))} ${sc[o].total}</b></span></span></div>
      ${days ? `<svg class="chart" viewBox="0 0 640 250" role="img" aria-label="Score by day">${grid}${labels}
        <polyline points="${pts(b)}" fill="none" stroke="var(--rival)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/><polyline points="${pts(a)}" fill="none" stroke="var(--you)" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
        ${a.length ? `<circle cx="${X(a.length - 1)}" cy="${Y(a[a.length - 1])}" r="6" fill="var(--you)"/>` : ''}${b.length ? `<circle cx="${X(b.length - 1)}" cy="${Y(b[b.length - 1])}" r="5" fill="var(--rival)"/>` : ''}</svg>` : ''}
      <span style="font-size:13px;color:var(--ink2)">${lead} Your best day was day ${bestDay.round} (${usd(round2(bestDay.income + bestDay.spend))}).</span></section>
    <section class="panel" style="padding:22px 24px"><h2 style="font-family:var(--display);font-size:20px">Your game in numbers</h2>
      <div class="tiles two"><div class="tile"><span class="v">${served} of ${came}</span><span class="s">guests served</span></div><div class="tile"><span class="v">${CFG.startStars} → ${p.stars} ★</span><span class="s">stars, start to finish</span></div>
        <div class="tile"><span class="v">${plural(spoiled, 'plate')}</span><span class="s">thrown away</span></div><div class="tile"><span class="v">${usd(adsSpent)}</span><span class="s">spent on ads</span></div></div></section>
  </div>
  <div class="final-mid">
    <section class="panel talk" style="padding:22px 24px"><div class="row" style="justify-content:space-between"><h2 style="font-family:var(--display);font-size:20px">Talk it over with ${esc(nameOf(o))}</h2><span class="hint">about 5 minutes</span></div>
      <ol><li>${gold(1, 'sm')}How many guests a day did you need to break even?</li><li>${gold(2, 'sm')}Which day were you short on staff or food? What would you change?</li>
        <li>${gold(3, 'sm')}Which ad was worth its price? Which of their ads hurt you most?</li><li>${gold(4, 'sm')}Did you take the shady deal? Would you again?</li></ol></section>
    <section class="again"><b>${meWon ? 'Think you can win by more?' : 'Want a rematch?'}</b><span>Each game deals different offers, ads and surprises. ${p.loc === 'city' ? 'Try the Countryside' : 'Try the City'} next time.</span>
      <button class="ghost" data-act="share">📸 Share a picture of this page</button>
      ${app.mode === 'local' ? '<button class="cta" data-act="local">Play again</button>' : `<button class="cta" data-act="create">Start a new game</button>`}<button class="ghost" data-act="leave">Back to the start</button></section>
  </div>${dayLogHTML(s)}`;
}

// ---------- events ----------
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, S = app.S, s = viewer(), k = S && S.waiting[s];
  switch (a) {
    case 'create': return createGame();
    case 'rejoin': return joinGame(b.dataset.code);
    case 'local': return startLocal();
    case 'leave': app.howto = null; return leave(false);
    case 'view': app.view = b.dataset.seat; if (S && PRIVATE_PHASES.includes(S.phase)) app.cover = app.view; return render();
    case 'cover-ok': app.cover = null; return render();
    case 'theme': { const t = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = t; lsSet('theme', t); return render(); }
    case 'intro': app.intro++; return render();
    case 'introback': app.intro = Math.max(0, app.intro - 1); return render();
    case 'picksel': { const f = F({}); f.loc = b.dataset.loc; return render(); }
    case 'showjoin': app.showJoin = true; render(); { const el = $('#code-in'); if (el) el.focus(); } return;
    case 'joininvite': return joinGame(app.invite && app.invite.code);
    case 'noinvite': app.invite = null; app.err = ''; clearRoomParam(); render(); return loadResume().then(render);
    case 'copylink': {
      const link = `${location.origin}${location.pathname}?room=${app.code}`;
      try { navigator.clipboard.writeText(link).then(() => toast('Link copied'), () => toast(link)); } catch (err) { toast(link); }
      return;
    }
    case 'introskip': app.intro = app.intro < INTRO.length ? INTRO.length : INTRO_ALL(); return render();  // Skip story → the goal pages; Skip on those → pick
    case 'howto': {
      const ph = S && app.mode ? S.phase : null;
      app.howto = { open: ph === 'pick' ? 'pick' : ['invest', 'market', 'commit', 'service', 'voucher', 'report'].includes(ph) ? 'day' : null };
      return render();
    }
    case 'howto-close': app.howto = null; return render();
    case 'howto-sec': app.howto.open = app.howto.open === b.dataset.sec ? null : b.dataset.sec; return render();
    case 'copy': {
      const done = () => toast(`Copied ${app.code}`);
      try { navigator.clipboard.writeText(app.code).then(done, () => toast(`Room code: ${app.code}`)); } catch (err) { toast(`Room code: ${app.code}`); }
      return;
    }
    case 'inc': { const f = F({}); f[b.dataset.f] = Math.max(0, (f[b.dataset.f] || 0) + Number(b.dataset.d)); return render(); }
    case 'choose': { const f = F({}); f.choice = b.dataset.c; return render(); }
    case 'stage': { const f = F({}), v = b.dataset.v; if (v === 'gift') f.gift = true; else if (v === 'offer') f.offer = true; else if (v === 'ads') f.seenAds = true; else if (v === 'sintro') f.sintro = true; return render(); }
    case 'endstep': app.endStep[s] = Number(b.dataset.n); window.scrollTo(0, 0); return render();
    case 'share': return shareSummary();
    case 'mornok': app.mornSeen[mornKey(s)] = true; return render();
    case 'astep': { const f = F({}); f.astep = b.dataset.v; return render(); }
    case 'loan': { const f = F({}); f.loan = b.dataset.v === '1'; return render(); }
    case 'hiretipback': { const f = F({}); f.tip = Math.max(0, (f.tip || 0) - 1); return render(); }
    case 'hiretip': {
      const f = F({}); f.tip = (f.tip || 0) + 1;
      // Clicking the lit section in tip 2 also hires a server there
      if (b.dataset.hire != null && k && !(f.staff || []).includes(Number(b.dataset.hire))) return toggleHire(s, Number(b.dataset.hire));
      return render();
    }
    case 'ad': {
      const f = F({ sel: [] }), id = b.dataset.id;
      f.sel = f.sel.includes(id) ? f.sel.filter(x => x !== id) : [...f.sel, id];
      return render();
    }
    case 'flip': { const sv = svcState(s); sv.flip++; return render(); }
    case 'vface': { const f = F({ n: 0 }), i = Number(b.dataset.i); f.n = f.n === i + 1 ? i : i + 1; return render(); }
  }
  if (!k) return;
  switch (a) {
    case 'pick': return act(s, { k, loc: b.dataset.loc });
    case 'hire': return toggleHire(s, Number(b.dataset.i));
    case 'invest': { const f = F({ staff: S.players[s].staff.slice() }); return act(s, { k, staff: f.staff, choice: f.choice || null, loan: !!(CFG.loan.enabled && f.loan) }); }
    case 'grab': if (e.detail) return; return claimItem(s, Number(b.dataset.i)); // mouse/touch grabs happen on press (below); this is the keyboard
    case 'mkdone': return finishMarket(s);
    case 'mkstart': return marketReady(s);
    case 'commit': {
      const f = F({ sel: [] }), A = CFG.ads;
      return commitCards(s, k, { self: f.sel.filter(id => A[id].side === 'self'), rival: f.sel.filter(id => A[id].side === 'rival') });
    }
    case 'play': { const sv = svcState(s); sv.started = true; return render(); }
    case 'voucher': { const f = F({}); return act(s, { k, n: b.dataset.n === '0' ? 0 : f.n || 0 }); }
    case 'next': return act(s, { k });
  }
});
// Market bundles grab on press, not on click: the shelf redraws whenever the rival grabs something, and a redraw
// between press and release drops the click (players had to click twice)
document.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const b = e.target.closest('[data-act="grab"]'); if (!b || b.disabled) return;
  const S = app.S, s = viewer(); if (!S || !S.waiting[s]) return;
  e.preventDefault(); claimItem(s, Number(b.dataset.i));
});
// Keyboard: Esc closes How to play; Enter / Space press a focused drawing button (the service has its own keys in service.js)
document.addEventListener('keydown', e => {
  if (e.target.matches && e.target.matches('input,textarea')) return;
  if (app.howto && e.key === 'Escape') { app.howto = null; return render(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('g[role=button], rect[role=button]')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); return; }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.matches('[data-form="join"]')) joinGame($('#code-in').value);
});
render();
