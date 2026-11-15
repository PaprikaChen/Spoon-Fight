// ===== Drawings (SVG strings) for the page. Display only: no game rules in here. =====
const ART = (() => {
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // ---------- small stroke icons (24×24, use currentColor) ----------
  const I = {
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" stroke="none"/>',
    box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    table: '<path d="M3 9h18M6 9l-1 10M18 9l1 10M8 13h8"/>',
    cart: '<path d="M3 5h3l3 11h10l2-8H7"/><circle cx="10" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>',
    card: '<rect x="4" y="3" width="11" height="16" rx="2"/><path d="M9 21h9a2 2 0 0 0 2-2V8"/>',
    person: '<circle cx="12" cy="7" r="3"/><path d="M6 20a6 5 0 0 1 12 0"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    warn: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    ff: '<path d="M3 5l9 7-9 7zM12 5l9 7-9 7z" fill="currentColor" stroke="none"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
  };
  const icon = (name, size = 18, cls = '') =>
    `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;
  // A filled star for ratings
  const star = (on, size = 18) => `<svg class="ic star ${on ? 'on' : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/></svg>`;
  const stars = (n, size = 18) => `<span class="stars" role="img" aria-label="${n} of 5 stars">${[1, 2, 3, 4, 5].map(i => star(i <= n, size)).join('')}</span>`;
  // A plate of food (used in the kitchen and in keys)
  const plate = (size = 20) => `<svg class="ic plate" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" class="rim"/><circle cx="12" cy="12" r="5" class="dish"/></svg>`;

  // ---------- floor plan pieces (local coordinates; the table top is centred on 0,0) ----------
  const guest = '<path class="guest" d="M-14 39a14 11 0 0 1 28 0z"/><circle class="guest" cx="0" cy="21" r="7"/>';
  const chair = '<rect class="chair" x="-12" y="18" width="24" height="14" rx="7"/>';
  const dish = '<circle class="rim" cx="0" cy="-10" r="10"/><circle class="dish" cx="0" cy="-10" r="5"/>';
  const label = (t, cls = '') => `<rect class="tag-bg" x="-27" y="-19" width="54" height="18" rx="4"/><text class="tag ${cls}" x="0" y="-6">${t}</text>`;
  function tile(k, x, y, s, o = {}) {
    const g = (cls, body, attr = '') => `<g class="tbl ${cls}" transform="translate(${x} ${y}) scale(${s})"${attr}><rect class="top" x="-30" y="-32" width="60" height="44" rx="10"/>${body}</g>`;
    const btn = (d, label) => ` data-act="inc" data-f="tables" data-d="${d}" role="button" tabindex="0" aria-label="${label}"`;
    if (k === 'add') return g('add', '<text class="plus" x="0" y="0">+</text>', btn(1, `Add a table for $${o.addCost}`));
    if (k === 'new' && o.edit) return g('new', chair + '<rect class="new-bg" x="-19" y="-52" width="38" height="18" rx="9"/><text class="new-t" x="0" y="-39">NEW</text>', btn(-1, 'Remove this new table'));
    switch (k) {
      case 'seat': return g('seat', dish + guest);
      case 'free': return g('free', chair);
      case 'new': return g('new', chair + '<rect class="new-bg" x="-19" y="-52" width="38" height="18" rx="9"/><text class="new-t" x="0" y="-39">NEW</text>');
      case 'reserved': return g('blocked', label('reserved'));
      case 'fake': return g('fake', label('fake', 'm'));
      case 'broken': return g('blocked', label('broken'));
      case 'bseat': return g('borrowed', dish + guest);
      case 'bfree': return g('borrowed', chair);
      case 'arriving': return g('arriving', '<circle class="spin" cx="0" cy="-10" r="12"/>');
      case 'more': return `<g transform="translate(${x} ${y}) scale(${s})"><rect class="more" x="-30" y="-32" width="60" height="44" rx="10"/><text class="more-t" x="0" y="-4">${''}</text></g>`;
    }
    return '';
  }
  const person = (x, y, cls) => `<g class="${cls}" transform="translate(${x} ${y})"><circle cx="0" cy="0" r="6"/><path d="M-10 18a10 8 0 0 1 20 0z"/></g>`;
  const chip = (x, y, t) => `<g transform="translate(${x} ${y})"><rect class="chip-bg" x="-20" y="-11" width="40" height="22" rx="11"/><text class="chip-t" x="0" y="4">${t}</text></g>`;

  // The restaurant seen from above.
  // o = { own: [kind…] (max 14), borrowed: [kind…], food, incoming, deliv, queue, away, asker, kitchenNote, roomLabel }
  function floor(o) {
    const W = 880, out = [];
    const borrowed = o.borrowed || [];
    const patioRows = borrowed.length ? (borrowed.length > 8 ? 2 : 1) : 0;
    const H = patioRows ? 336 + (patioRows === 2 ? 176 : 106) + 8 : 330;
    out.push('<defs><pattern id="rr-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" style="fill:var(--line2)"/><rect width="3" height="8" style="fill:var(--line)"/></pattern>' +
      '<pattern id="rr-hatch-m" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" style="fill:var(--rival-soft)"/><rect width="3" height="8" style="fill:var(--rival-line)"/></pattern></defs>');
    out.push(`<rect class="street" x="0" y="0" width="${W}" height="${H}"/>`);
    // dining room + kitchen
    out.push('<rect class="room" x="104" y="10" width="770" height="312" rx="6"/>');
    out.push('<path class="wall" d="M104 120V16a6 6 0 0 1 6-6h758a6 6 0 0 1 6 6v300a6 6 0 0 1-6 6H110a6 6 0 0 1-6-6V210"/>');
    out.push(`<text class="zone" x="116" y="30">${o.roomLabel || 'DINING ROOM'}</text>`);
    out.push('<path class="split" d="M690 10v312"/>');
    const cx = [162, 277, 392, 507, 622], cy = [66, 170, 274];
    (o.own || []).slice(0, 15).forEach((k, i) => out.push(tile(k, cx[i % 5], cy[Math.floor(i / 5)], 0.85, o)));
    if (o.roomNote) out.push(`<text class="note" x="392" y="${(o.own || []).length > 10 ? 300 : (o.own || []).length > 5 ? 280 : 176}">${o.roomNote}</text>`);
    // kitchen: one plate per food
    const food = Math.max(0, o.food || 0), cap = 40, shown = Math.min(food, food > cap ? cap - 1 : cap);
    out.push(`<text class="zone mid ${food ? '' : 'bad'}" x="782" y="30">${food ? `KITCHEN · ${food} FOOD` : 'KITCHEN · NO FOOD'}</text>`);
    for (let i = 0; i < shown; i++) {
      const x = 722 + (i % 5) * 30, y = 58 + Math.floor(i / 5) * 30;
      out.push(`<g transform="translate(${x} ${y})"><circle class="rim" r="11"/><circle class="dish" r="5.5"/></g>`);
    }
    if (food > cap) out.push(chip(842, 58 + 7 * 30, `+${food - shown}`));
    let ky = 58 + Math.ceil(Math.max(shown, 1) / 5) * 30 + 6;
    if (o.incoming) {
      const i = shown, x = 722 + (i % 5) * 30, y = 58 + Math.floor(i / 5) * 30;
      out.push(`<g transform="translate(${x} ${y})"><circle class="incoming" r="11"/></g>`);
      ky = Math.max(ky, y + 30);
    }
    if (o.kitchenNote) o.kitchenNote.forEach((t, j) => out.push(`<text class="note sm" x="782" y="${ky + 14 + j * 16}">${t}</text>`));
    if (o.bin) out.push(`<g transform="translate(782 296)"><rect class="chip-bg bad" x="-62" y="-16" width="124" height="32" rx="10"/><text class="chip-t" x="0" y="5">🗑️ ${o.bin} go bad</text></g>`);
    if (o.pop) out.push(`<text class="paypop" x="392" y="176">${o.pop}</text>`);
    if (o.deliv) out.push(`<g transform="translate(782 288)"><rect class="chip-bg soft" x="-70" y="-18" width="140" height="36" rx="10"/><text class="chip-t ink" x="0" y="5">${o.deliv} delivery sent</text></g>`);
    // patio for borrowed tables
    if (patioRows) {
      out.push(`<rect class="patio" x="104" y="336" width="770" height="${patioRows === 2 ? 176 : 106}" rx="6"/>`);
      const n = borrowed.length, show = n > 16 ? 15 : n;
      out.push(`<text class="zone" x="116" y="356">PATIO · ${n} BORROWED FROM NEXT DOOR · TONIGHT ONLY</text>`);
      for (let i = 0; i < show; i++) out.push(tile(borrowed[i], 152 + (i % 8) * 96, 398 + Math.floor(i / 8) * 74, 0.75));
      if (n > 16) out.push(`<g transform="translate(${152 + 7 * 96} ${398 + 74})"><rect class="more" x="-23" y="-24" width="46" height="34" rx="8"/><text class="more-t" x="0" y="-2">+${n - 15}</text></g>`);
    }
    // outside: someone asking for food, the waiting group, guests who left
    let y = 64;
    if (o.asker) {
      out.push(person(51, 70, 'waiting'));
      out.push('<g transform="translate(51 40)"><rect class="bubble" x="-18" y="-13" width="36" height="24" rx="12"/><circle class="dish" cx="0" cy="-1" r="5"/></g>');
      y = 112;
    }
    const q = o.queue || 0, qShow = q > 8 ? 7 : q;
    const tags = o.queueTags || [];
    for (let i = 0; i < qShow; i++) {
      const px = i % 2 ? 68 : 34, py = y + 58 + Math.floor(i / 2) * 30, t = tags[i] || {};
      out.push(person(px, py, 'waiting'));
      if (t.b) out.push(`<g transform="translate(${px + 9} ${py - 6})"><circle class="gb" r="7"/><text class="gb-t" y="3.5">${t.b}</text></g>`);
      if (t.need) out.push(`<g transform="translate(${px - (i % 2 ? -14 : 14)} ${py - 4})"><circle class="need" r="9"/><text class="need-t" y="4">${t.need}</text></g>`);
    }
    if (q > 8) out.push(chip(68, y + 58 + 3 * 30 + 6, `+${q - 7}`));
    if (q) out.push(`<text class="out-t" x="51" y="${y + 58 + Math.ceil(Math.min(q, 8) / 2) * 30 + 6}">${q} ${o.queueLabel || 'waiting'}</text>`);
    const a = o.away || 0, aShow = a > 6 ? 5 : a, ay = Math.max(250, y + 58 + Math.ceil(Math.min(q, 8) / 2) * 30 + 34);
    for (let i = 0; i < aShow; i++) out.push(`<g class="left" transform="translate(${i % 2 ? 68 : 34} ${ay + Math.floor(i / 2) * 30})"><circle r="6"/><path d="M-10 18a10 8 0 0 1 20 0z"/></g>`);
    if (a > 6) out.push(chip(68, ay + 2 * 30 + 6, `+${a - 5}`));
    if (a) out.push(`<text class="out-t bad" x="51" y="${ay + Math.ceil(Math.min(a, 6) / 2) * 30 + 6}">${a} left</text>`);
    return `<svg class="floor" viewBox="0 0 ${W} ${H}" role="img" aria-label="${o.aria || 'Your restaurant'}">${out.join('')}</svg>`;
  }

  // The Spoon Fight logo (L4 round badge). Each copy needs its own ids, so pass a short unique id.
  function badge(id = 'b') {
    return `<svg class="badge" viewBox="110 20 420 340" role="img" aria-label="Spoon Fight"><defs><clipPath id="bc-${id}"><circle cx="320" cy="190" r="150"/></clipPath>
      <path id="ba-${id}" d="M196,190 A124,124 0 0 1 444,190"/><g id="bs-${id}"><rect x="-7" y="-28" width="14" height="110" rx="7" fill="currentColor" stroke="#0B0B0D" stroke-width="5"/><ellipse cx="0" cy="-54" rx="24" ry="32" fill="currentColor" stroke="#0B0B0D" stroke-width="5"/></g></defs>
      <circle cx="320" cy="190" r="164" fill="#FFD21F" stroke="#7A1A0E" stroke-width="5"/>
      <g clip-path="url(#bc-${id})"><rect x="160" y="30" width="160" height="320" fill="#1B2347"/><rect x="320" y="30" width="160" height="320" fill="#3A1527"/></g>
      <circle cx="320" cy="190" r="150" fill="none" stroke="#0B0B0D" stroke-width="4"/>
      <text font-family="Luckiest Guy, sans-serif" font-size="22" letter-spacing="5" fill="#FFD21F"><textPath href="#ba-${id}" startOffset="50%" text-anchor="middle">★ THE GOLDEN SPOON ★</textPath></text>
      <use href="#bs-${id}" transform="translate(320 200) rotate(-32)" style="color:#6B8AFF"/><use href="#bs-${id}" transform="translate(320 200) rotate(32)" style="color:#F0569A"/>
      <path d="M120,258 L520,258 L500,288 L520,318 L120,318 L140,288 Z" fill="#E8392B" stroke="#8A1610" stroke-width="5" stroke-linejoin="round"/>
      <text x="320" y="308" text-anchor="middle" font-family="Luckiest Guy, sans-serif" font-size="50" fill="#FFFFFF" stroke="#8A1610" stroke-width="6" paint-order="stroke">SPOON FIGHT</text></svg>`;
  }


  // ---------- story cards (the agreed mockup drawings; card 5 gets the rival's name) ----------
  const STORY = [
    `<svg class="storyart" viewBox="0 0 640 400" role="img" aria-label="Two chefs high-fiving over a steaming pot under a Two Spoons sign"> <defs> <g id="chef1"> <path d="M-24,-74 a14,14 0 0 1 8,-24 a17,17 0 0 1 32,0 a14,14 0 0 1 8,24 z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <rect x="-24" y="-76" width="48" height="12" rx="3" fill="#F4F4F5" stroke="currentColor" stroke-width="4"></rect> <circle cx="0" cy="-44" r="20" fill="#2A2A30" stroke="currentColor" stroke-width="4"></circle> <circle cx="-7" cy="-47" r="2.6" fill="#F4F4F5"></circle> <circle cx="7" cy="-47" r="2.6" fill="#F4F4F5"></circle> <path d="M-34,70 L-34,-4 Q-34,-22 0,-22 Q34,-22 34,-4 L34,70 Z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <circle cx="-9" cy="6" r="3" fill="currentColor"></circle><circle cx="-9" cy="26" r="3" fill="currentColor"></circle> <circle cx="9" cy="6" r="3" fill="currentColor"></circle><circle cx="9" cy="26" r="3" fill="currentColor"></circle> </g> </defs> <rect x="200" y="34" width="240" height="56" rx="12" fill="#2A1A10" stroke="#C9833F" stroke-width="4"></rect> <text x="320" y="72" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="26" fill="#E8A35C">THE TWO SPOONS</text> <line x1="60" y1="338" x2="580" y2="338" stroke="#3F3F46" stroke-width="6" stroke-linecap="round"></line> <path d="M282,300 h76 v-34 q0,-10 -10,-10 h-56 q-10,0 -10,10 z" fill="#C9833F" stroke="#E8A35C" stroke-width="4" stroke-linejoin="round"></path> <line x1="270" y1="268" x2="282" y2="268" stroke="#E8A35C" stroke-width="5" stroke-linecap="round"></line> <line x1="358" y1="268" x2="370" y2="268" stroke="#E8A35C" stroke-width="5" stroke-linecap="round"></line> <path d="M302,244 q-8,-12 0,-24 q8,-12 0,-24" fill="none" stroke="#71717A" stroke-width="4" stroke-linecap="round"></path> <path d="M338,244 q-8,-12 0,-24 q8,-12 0,-24" fill="none" stroke="#71717A" stroke-width="4" stroke-linecap="round"></path> <use href="#chef1" x="190" y="262" style="color: #6B8AFF;"></use> <use href="#chef1" x="450" y="262" style="color: #F0569A;"></use> <path d="M181,215 q9,9 18,0" fill="none" stroke="#F4F4F5" stroke-width="3.5" stroke-linecap="round"></path> <path d="M441,215 q9,9 18,0" fill="none" stroke="#F4F4F5" stroke-width="3.5" stroke-linecap="round"></path> <path d="M222,250 Q270,190 312,150" fill="none" stroke="#6B8AFF" stroke-width="10" stroke-linecap="round"></path> <path d="M418,250 Q370,190 328,150" fill="none" stroke="#F0569A" stroke-width="10" stroke-linecap="round"></path> <path d="M320,112 l6,18 l18,-6 l-12,14 l14,12 l-18,0 l-4,18 l-6,-18 l-6,18 l-4,-18 l-18,0 l14,-12 l-12,-14 l18,6 z" fill="#FFD21F"></path> </svg>`,
    `<svg class="storyart" viewBox="0 0 640 400" role="img" aria-label="A one-star review in the newspaper between two chefs who turn away from each other, under a Closed sign"> <defs> <g id="chef2"> <path d="M-24,-74 a14,14 0 0 1 8,-24 a17,17 0 0 1 32,0 a14,14 0 0 1 8,24 z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <rect x="-24" y="-76" width="48" height="12" rx="3" fill="#F4F4F5" stroke="currentColor" stroke-width="4"></rect> <circle cx="0" cy="-44" r="20" fill="#2A2A30" stroke="currentColor" stroke-width="4"></circle> <path d="M-34,70 L-34,-4 Q-34,-22 0,-22 Q34,-22 34,-4 L34,70 Z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <path d="M-26,12 L26,12" stroke="currentColor" stroke-width="12" stroke-linecap="round"></path> </g> </defs> <line x1="320" y1="0" x2="290" y2="34" stroke="#71717A" stroke-width="3"></line> <line x1="320" y1="0" x2="350" y2="34" stroke="#71717A" stroke-width="3"></line> <rect x="262" y="32" width="116" height="40" rx="8" fill="#3A1515" stroke="#F87171" stroke-width="4" transform="rotate(-5 320 52)"></rect> <text x="320" y="61" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="22" fill="#FCA5A5" transform="rotate(-5 320 52)">CLOSED</text> <line x1="60" y1="338" x2="580" y2="338" stroke="#3F3F46" stroke-width="6" stroke-linecap="round"></line> <g transform="rotate(-6 320 210)"> <rect x="236" y="112" width="168" height="196" rx="6" fill="#E9E6DE" stroke="#A1A1AA" stroke-width="3"></rect> <text x="320" y="140" text-anchor="middle" font-family="Inter Tight, Inter, sans-serif" font-weight="800" font-size="15" fill="#18181B">THE DAILY FORK</text> <line x1="250" y1="150" x2="390" y2="150" stroke="#18181B" stroke-width="2"></line> <text x="320" y="178" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="21" fill="#B91C1C">TWO SPOONS</text> <text x="320" y="200" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="21" fill="#B91C1C">FLOPS</text> <text x="320" y="230" text-anchor="middle" font-family="Inter, sans-serif" font-size="22" fill="#B45309">★<tspan fill="#A1A1AA">★★★★</tspan></text> <line x1="252" y1="252" x2="388" y2="252" stroke="#A1A1AA" stroke-width="5" stroke-linecap="round"></line> <line x1="252" y1="268" x2="372" y2="268" stroke="#A1A1AA" stroke-width="5" stroke-linecap="round"></line> <line x1="252" y1="284" x2="382" y2="284" stroke="#A1A1AA" stroke-width="5" stroke-linecap="round"></line> </g> <use href="#chef2" x="120" y="262" style="color: #6B8AFF;"></use> <use href="#chef2" x="520" y="262" style="color: #F0569A;"></use> <circle cx="109" cy="-47" r="2.6" fill="#F4F4F5" transform="translate(0 262)"></circle> <circle cx="121" cy="-47" r="2.6" fill="#F4F4F5" transform="translate(0 262)"></circle> <path d="M103,206 l12,4" stroke="#F4F4F5" stroke-width="3" stroke-linecap="round"></path> <path d="M112,229 q8,-6 16,0" fill="none" stroke="#F4F4F5" stroke-width="3.5" stroke-linecap="round"></path> <circle cx="519" cy="-47" r="2.6" fill="#F4F4F5" transform="translate(0 262)"></circle> <circle cx="531" cy="-47" r="2.6" fill="#F4F4F5" transform="translate(0 262)"></circle> <path d="M537,206 l-12,4" stroke="#F4F4F5" stroke-width="3" stroke-linecap="round"></path> <path d="M512,229 q8,-6 16,0" fill="none" stroke="#F4F4F5" stroke-width="3.5" stroke-linecap="round"></path> <path d="M176,150 q10,-14 0,-28 M190,146 q10,-14 0,-28" fill="none" stroke="#6B8AFF" stroke-width="3" stroke-linecap="round"></path> <path d="M464,150 q-10,-14 0,-28 M450,146 q-10,-14 0,-28" fill="none" stroke="#F0569A" stroke-width="3" stroke-linecap="round"></path> </svg>`,
    `<svg class="storyart" viewBox="0 0 640 400" role="img" aria-label="Two chefs cooking alone in separate kitchens, split by a crack, with calendar pages falling between them"> <defs> <g id="chef4"> <path d="M-24,-74 a14,14 0 0 1 8,-24 a17,17 0 0 1 32,0 a14,14 0 0 1 8,24 z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <rect x="-24" y="-76" width="48" height="12" rx="3" fill="#F4F4F5" stroke="currentColor" stroke-width="4"></rect> <circle cx="0" cy="-44" r="20" fill="#2A2A30" stroke="currentColor" stroke-width="4"></circle> <circle cx="-7" cy="-45" r="2.6" fill="#F4F4F5"></circle> <circle cx="7" cy="-45" r="2.6" fill="#F4F4F5"></circle> <path d="M-6,-33 h12" stroke="#F4F4F5" stroke-width="3.5" stroke-linecap="round"></path> <path d="M-34,70 L-34,-4 Q-34,-22 0,-22 Q34,-22 34,-4 L34,70 Z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <circle cx="-9" cy="6" r="3" fill="currentColor"></circle><circle cx="-9" cy="26" r="3" fill="currentColor"></circle> <circle cx="9" cy="6" r="3" fill="currentColor"></circle><circle cx="9" cy="26" r="3" fill="currentColor"></circle> </g> </defs> <rect x="36" y="36" width="250" height="306" rx="20" fill="#1F1F23" stroke="#34407A" stroke-width="3"></rect> <rect x="354" y="36" width="250" height="306" rx="20" fill="#1F1F23" stroke="#6B2747" stroke-width="3"></rect> <path d="M86,92 a22,22 0 1 0 22,26 a17,17 0 1 1 -22,-26 z" fill="#9DB0FF"></path> <circle cx="552" cy="92" r="18" fill="none" stroke="#F68DBA" stroke-width="4"></circle> <path d="M552,62 v-8 M552,122 v8 M522,92 h-8 M582,92 h8" stroke="#F68DBA" stroke-width="4" stroke-linecap="round"></path> <line x1="56" y1="322" x2="266" y2="322" stroke="#3F3F46" stroke-width="5" stroke-linecap="round"></line> <line x1="374" y1="322" x2="584" y2="322" stroke="#3F3F46" stroke-width="5" stroke-linecap="round"></line> <use href="#chef4" x="150" y="252" style="color: #6B8AFF;"></use> <use href="#chef4" x="470" y="252" style="color: #F0569A;"></use> <path d="M200,288 h56 v-22 q0,-8 -8,-8 h-40 q-8,0 -8,8 z" fill="#2A2A30" stroke="#6B8AFF" stroke-width="3.5" stroke-linejoin="round"></path> <path d="M384,272 h52 a10,10 0 0 1 -10,12 h-32 a10,10 0 0 1 -10,-12 z M436,276 h30" fill="#2A2A30" stroke="#F0569A" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path> <path d="M320,20 l-10,40 l14,30 l-12,44 l12,36 l-14,46 l10,40 l-8,40 l8,60" fill="none" stroke="#52525B" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"></path> <g transform="rotate(-12 320 112)"><rect x="304" y="92" width="32" height="38" rx="4" fill="#E9E6DE"></rect><rect x="304" y="92" width="32" height="10" rx="3" fill="#E8392B"></rect></g> <g transform="rotate(10 324 196)"><rect x="308" y="176" width="32" height="38" rx="4" fill="#E9E6DE" opacity=".8"></rect><rect x="308" y="176" width="32" height="10" rx="3" fill="#E8392B" opacity=".8"></rect></g> <g transform="rotate(-20 318 278)"><rect x="302" y="258" width="32" height="38" rx="4" fill="#E9E6DE" opacity=".55"></rect><rect x="302" y="258" width="32" height="10" rx="3" fill="#E8392B" opacity=".55"></rect></g> </svg>`,
    `<svg class="storyart" viewBox="0 0 640 400" role="img" aria-label="A Golden Spoon contest poster offering the Two Spoons' keys as the grand prize, with both chefs staring up at it in surprise"> <defs> <g id="chef5"> <path d="M-24,-74 a14,14 0 0 1 8,-24 a17,17 0 0 1 32,0 a14,14 0 0 1 8,24 z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <rect x="-24" y="-76" width="48" height="12" rx="3" fill="#F4F4F5" stroke="currentColor" stroke-width="4"></rect> <circle cx="0" cy="-44" r="20" fill="#2A2A30" stroke="currentColor" stroke-width="4"></circle> <circle cx="0" cy="-32" r="5" fill="none" stroke="#F4F4F5" stroke-width="3"></circle> <path d="M-34,70 L-34,-4 Q-34,-22 0,-22 Q34,-22 34,-4 L34,70 Z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <circle cx="-9" cy="6" r="3" fill="currentColor"></circle><circle cx="-9" cy="26" r="3" fill="currentColor"></circle> <circle cx="9" cy="6" r="3" fill="currentColor"></circle><circle cx="9" cy="26" r="3" fill="currentColor"></circle> </g> </defs> <line x1="40" y1="338" x2="600" y2="338" stroke="#3F3F46" stroke-width="6" stroke-linecap="round"></line> <g transform="rotate(2 320 180)"> <rect x="206" y="30" width="228" height="282" rx="8" fill="#E9E6DE" stroke="#A1A1AA" stroke-width="3"></rect> <circle cx="320" cy="42" r="7" fill="#E8392B"></circle> <text x="320" y="84" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="25" fill="#B45309">THE GOLDEN</text> <text x="320" y="110" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="25" fill="#B45309">SPOON</text> <path d="M320,124 v34" stroke="#F5A800" stroke-width="6" stroke-linecap="round"></path> <path d="M302,158 a18,14 0 0 0 36,0 z" fill="#FFD21F" stroke="#F5A800" stroke-width="3" stroke-linejoin="round"></path> <text x="320" y="200" text-anchor="middle" font-family="Inter Tight, Inter, sans-serif" font-weight="800" font-size="13" letter-spacing="2" fill="#18181B">GRAND PRIZE</text> <circle cx="286" cy="236" r="13" fill="none" stroke="#B45309" stroke-width="5"></circle> <path d="M299,236 h40 m-12,0 v10 m10,-10 v8" fill="none" stroke="#B45309" stroke-width="5" stroke-linecap="round"></path> <rect x="244" y="262" width="152" height="30" rx="6" fill="#2A1A10"></rect> <text x="320" y="283" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="17" fill="#E8A35C">THE TWO SPOONS</text> </g> <use href="#chef5" x="110" y="268" style="color: #6B8AFF;"></use> <use href="#chef5" x="530" y="268" style="color: #F0569A;"></use> <circle cx="108" cy="218" r="2.6" fill="#F4F4F5"></circle><circle cx="122" cy="218" r="2.6" fill="#F4F4F5"></circle> <circle cx="518" cy="218" r="2.6" fill="#F4F4F5"></circle><circle cx="532" cy="218" r="2.6" fill="#F4F4F5"></circle> <path d="M150,108 v26" stroke="#FFD21F" stroke-width="7" stroke-linecap="round"></path><circle cx="150" cy="148" r="4.5" fill="#FFD21F"></circle> <path d="M490,108 v26" stroke="#FFD21F" stroke-width="7" stroke-linecap="round"></path><circle cx="490" cy="148" r="4.5" fill="#FFD21F"></circle> </svg>`,
    `<svg class="storyart" viewBox="0 0 640 400" role="img" aria-label="Two chefs face each other across a golden spoon trophy with the Two Spoons keys, under a Golden Spoon Final banner"> <defs> <g id="chef3"> <path d="M-24,-74 a14,14 0 0 1 8,-24 a17,17 0 0 1 32,0 a14,14 0 0 1 8,24 z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <rect x="-24" y="-76" width="48" height="12" rx="3" fill="#F4F4F5" stroke="currentColor" stroke-width="4"></rect> <circle cx="0" cy="-44" r="20" fill="#2A2A30" stroke="currentColor" stroke-width="4"></circle> <path d="M-34,70 L-34,-4 Q-34,-22 0,-22 Q34,-22 34,-4 L34,70 Z" fill="#F4F4F5" stroke="currentColor" stroke-width="4" stroke-linejoin="round"></path> <circle cx="-9" cy="6" r="3" fill="currentColor"></circle><circle cx="-9" cy="26" r="3" fill="currentColor"></circle> <circle cx="9" cy="6" r="3" fill="currentColor"></circle><circle cx="9" cy="26" r="3" fill="currentColor"></circle> </g> </defs> <path d="M150,30 H490 L470,58 L490,86 H150 L170,58 Z" fill="#3A2A08" stroke="#F5A800" stroke-width="4" stroke-linejoin="round"></path> <text x="320" y="68" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="25" fill="#FFD21F">THE GOLDEN SPOON · FINAL</text> <line x1="60" y1="338" x2="580" y2="338" stroke="#3F3F46" stroke-width="6" stroke-linecap="round"></line> <rect x="282" y="290" width="76" height="46" rx="6" fill="#2A2A30" stroke="#52525B" stroke-width="4"></rect> <path d="M320,290 V170" stroke="#FFD21F" stroke-width="10" stroke-linecap="round"></path> <path d="M290,170 a30,24 0 0 0 60,0 z" fill="#FFD21F" stroke="#F5A800" stroke-width="4" stroke-linejoin="round"></path> <path d="M320,128 q-6,-10 0,-20 q6,-10 0,-20" fill="none" stroke="#F5A800" stroke-width="3" stroke-linecap="round"></path> <circle cx="342" cy="236" r="9" fill="none" stroke="#E8A35C" stroke-width="4"></circle> <path d="M342,245 v22 m0,-8 h7 m-7,8 h9" fill="none" stroke="#E8A35C" stroke-width="4" stroke-linecap="round"></path> <use href="#chef3" x="150" y="262" style="color: #6B8AFF;"></use> <use href="#chef3" x="490" y="262" style="color: #F0569A;"></use> <circle cx="148" cy="215" r="2.6" fill="#F4F4F5"></circle><circle cx="162" cy="215" r="2.6" fill="#F4F4F5"></circle> <path d="M142,205 l12,3 M168,205 l-8,3" stroke="#F4F4F5" stroke-width="3" stroke-linecap="round"></path> <path d="M146,230 h14" stroke="#F4F4F5" stroke-width="3.5" stroke-linecap="round"></path> <circle cx="478" cy="215" r="2.6" fill="#F4F4F5"></circle><circle cx="492" cy="215" r="2.6" fill="#F4F4F5"></circle> <path d="M472,205 l8,3 M498,205 l-12,3" stroke="#F4F4F5" stroke-width="3" stroke-linecap="round"></path> <path d="M480,230 h14" stroke="#F4F4F5" stroke-width="3.5" stroke-linecap="round"></path> <rect x="100" y="346" width="100" height="32" rx="8" fill="#1B2347" stroke="#6B8AFF" stroke-width="3"></rect> <text x="150" y="368" text-anchor="middle" font-family="Inter Tight, Inter, sans-serif" font-weight="800" font-size="15" fill="#9DB0FF">YOU</text> <rect x="430" y="346" width="120" height="32" rx="8" fill="#3A1527" stroke="#F0569A" stroke-width="3"></rect> <text x="490" y="368" text-anchor="middle" font-family="Inter Tight, Inter, sans-serif" font-weight="800" font-size="15" fill="#F68DBA">__RIVAL__</text> <text x="320" y="374" text-anchor="middle" font-family="Luckiest Guy, Inter Tight, sans-serif" font-size="26" fill="#E8392B">VS</text> </svg>`];
  const story = (i, rival) => STORY[i].replace('__RIVAL__', rival);


  // ---------- the restaurant, as in the v2 mockups: door queue | tables | kitchen ----------
  // o.mode 'build' | 'service'; o.tables [{k:'free'|'seat'|'add'|'new'|'booked'|'fake'|'broken'|'bseat'|'bfree', pop}]
  // o.door {people:[{tag, side, need:'plate'|'table', villager, bubble}], label, more}; o.kitchen {title, plates, label, warn, left, bin, note}
  const rmPerson = (x, y, cls = '') => `<g transform="translate(${x} ${y})" class="pp ${cls}"><circle cx="0" cy="-12" r="8"/><path d="M-12 12 q0 -16 12 -16 q12 0 12 16 z"/></g>`;
  function room(o) {
    const svc = o.mode === 'service', H = svc ? 334 : 394, dw = svc ? 96 : 92, n = o.tables.length;
    const cols = n > 12 ? 5 : 4, x0 = svc ? 70 : 110, dx = cols === 5 ? (svc ? 84 : 100) : (svc ? 100 : 120), y0 = svc ? 70 : 90, dy = 110;
    let h = `<rect class="rm-bg" width="640" height="${H}" rx="18"/><rect class="rm-door" width="${dw}" height="${H}" rx="18"/>`;
    const d = o.door || {}, cx = dw / 2;
    h += `<text class="rm-lab" x="${cx}" y="${svc ? 26 : 110}" text-anchor="middle">DOOR</text>`;
    const ppl = d.people || [];
    let y = svc ? (ppl.some(p => p.need) ? 90 : 80) : 150, i = 0;
    const step = svc ? (ppl.some(p => p.need) ? 70 : 60) : 52;
    if (ppl[0] && ppl[0].villager) {
      h += `<g transform="translate(${cx} 120)">${rmPerson(0, 0, 'vill')}<g transform="translate(0 -52)" class="bub"><rect x="-42" y="-20" width="84" height="32" rx="12"/><path d="M-6 12 L0 22 L6 12 Z"/><text y="-5" text-anchor="middle">${esc(d.bubble1 || 'Anything')}</text><text y="8" text-anchor="middle">${esc(d.bubble2 || 'to eat?')}</text></g></g>`;
      i = 1; y = 220;
    }
    for (let r = 0; i < ppl.length && r < 4; r++) for (let c = 0; c < 2 && i < ppl.length; c++, i++) {
      const p = ppl[i], px = c ? (svc ? 66 : 64) : 30;
      h += `<g transform="translate(${px} ${y + r * step})">${rmPerson(0, 0, svc ? 'svc' : '')}`;
      if (p.need) h += `<g transform="translate(16 -30)" class="needb"><circle r="14"/><text y="5" text-anchor="middle" font-size="14">${p.need === 'table' ? '🪑' : '🍽'}</text><line x1="-9" y1="9" x2="9" y2="-9"/></g>`;
      else if (p.tag) h += `<g transform="translate(12 -22)" class="tagb ${p.side || 'you'}"><circle r="9"/><text y="4" text-anchor="middle">${esc(p.tag)}</text></g>`;
      h += '</g>';
    }
    const more = ppl.length - i + (d.more || 0);
    if (more > 0) h += `<text class="rm-note" x="${cx}" y="${y + 4 * step - 10}" text-anchor="middle">+${more} more</text>`;
    if (d.label) h += `<text class="rm-note" x="${cx}" y="${svc ? (ppl.length ? 316 : 170) : 360}" text-anchor="middle">${esc(d.label)}</text>`;
    // tables
    h += `<g transform="translate(${dw} 0)">`;
    o.tables.forEach((t, j) => {
      const x = x0 + (j % cols) * dx, ty = y0 + Math.floor(j / cols) * dy;
      const act = t.k === 'add' ? ` data-act="inc" data-f="tables" data-d="1" role="button" tabindex="0" aria-label="Add a table for $${o.addCost || 6}"`
        : t.k === 'new' && o.edit ? ' data-act="inc" data-f="tables" data-d="-1" role="button" tabindex="0" aria-label="Remove this new table"' : '';
      const txt = { add: ['+', 'plus'], new: ['NEW', 'new'], booked: ['BOOKED', 'book'], fake: ['FAKE', 'book'], broken: ['BROKEN', 'bad'], bfree: ['BORROWED', 'bor'] }[t.k];
      h += `<g transform="translate(${x} ${ty})" class="tb ${t.k}"${act}><rect x="-38" y="-26" width="76" height="52" rx="12"/>`;
      if (t.k === 'seat' || t.k === 'bseat') h += '<circle class="gst" cx="0" cy="-4" r="9"/><path class="gst" d="M-14 22 q14 -20 28 0"/>';
      else if (txt) h += `<text class="tt ${txt[1]}" y="${t.k === 'add' ? 7 : 5}" text-anchor="middle">${txt[0]}</text>`;
      h += '</g>';
      if (t.pop) h += `<text class="pop" x="${x}" y="${ty - 34}" text-anchor="middle">${esc(t.pop)}</text>`;
    });
    h += '</g>';
    // kitchen (service only)
    const k = o.kitchen;
    if (k) {
      h += `<line class="rm-line" x1="540" y1="14" x2="540" y2="${H - 14}"/><text class="rm-lab ${k.warn || k.left ? 'warn' : ''}" x="590" y="26" text-anchor="middle">${esc(k.title || 'KITCHEN')}</text>`;
      if (k.left) {
        const m = Math.min(k.plates, 12);
        for (let j = 0; j < m; j++) h += `<g transform="translate(${560 + (j % 3) * 30} ${60 + Math.floor(j / 3) * 30})" class="plt old"><circle r="11"/><circle class="dot" r="4"/></g>`;
        h += '<defs><marker id="rm-arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path class="arrh" d="M0,0 L10,5 L0,10 z"/></marker></defs>';
        h += `<g transform="translate(590 230)" class="bin"><path d="M-26,-22 L26,-22 L20,34 L-20,34 Z"/><rect x="-30" y="-30" width="60" height="9" rx="3"/><text y="12" text-anchor="middle" font-size="22">🗑️</text></g>`;
        h += `<path class="arr" d="M590 ${60 + Math.ceil(m / 3) * 30} C 600 150, 600 170, 592 196" marker-end="url(#rm-arr)"/><text class="rm-warn" x="590" y="290" text-anchor="middle">${k.plates} go bad</text>`;
      } else if (!k.plates) {
        h += `<rect class="k0" x="556" y="48" width="68" height="40" rx="10"/><text class="rm-warn" x="590" y="73" text-anchor="middle">0 plates</text>`;
      } else {
        const m = Math.min(k.plates, 16), rows = Math.ceil(m / 2);
        for (let j = 0; j < m; j++) h += `<g transform="translate(${574 + (j % 2) * 32} ${66 + Math.floor(j / 2) * 32})" class="plt"><circle r="13"/><circle class="dot" r="5"/></g>`;
        h += `<text class="rm-note" x="590" y="${66 + rows * 32 + 6}" text-anchor="middle">${esc(k.label || '')}</text>`;
      }
      if (k.note) h += `<text class="rm-note pos" x="590" y="${H - 20}" text-anchor="middle">${esc(k.note)}</text>`;
    }
    return `<svg class="room2" viewBox="0 0 640 ${H}" role="img" aria-label="${esc(o.aria || '')}">${h}</svg>`;
  }
  const gift = () => `<svg class="giftart" viewBox="0 0 640 400" role="img" aria-label="An open gift crate with a Golden Spoon tag and 12 plates flying out of it"> <rect width="640" height="400" rx="28" fill="#17171A"/> <circle cx="320" cy="200" r="170" fill="#FFD21F" opacity=".08"/> <rect x="90" y="60" width="10" height="16" rx="3" fill="#FFD21F" transform="rotate(20 90 60)"/><rect x="560" y="70" width="10" height="16" rx="3" fill="#6B8AFF" transform="rotate(-25 560 70)"/><rect x="130" y="150" width="10" height="16" rx="3" fill="#F0569A" transform="rotate(45 130 150)"/><rect x="520" y="160" width="10" height="16" rx="3" fill="#FFD21F" transform="rotate(-10 520 160)"/><rect x="200" y="40" width="10" height="16" rx="3" fill="#6B8AFF" transform="rotate(60 200 40)"/><rect x="450" y="40" width="10" height="16" rx="3" fill="#F0569A" transform="rotate(15 450 40)"/><rect x="70" y="250" width="10" height="16" rx="3" fill="#86EFAC" transform="rotate(-30 70 250)"/><rect x="580" y="250" width="10" height="16" rx="3" fill="#86EFAC" transform="rotate(35 580 250)"/> <g transform="translate(170 165) rotate(-20)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#E8392B"/></g><g transform="translate(220 125) rotate(-16)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#86EFAC"/></g><g transform="translate(270 100) rotate(-12)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#FFD21F"/></g><g transform="translate(320 90) rotate(-8)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#F68DBA"/></g><g transform="translate(370 100) rotate(-4)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#E8392B"/></g><g transform="translate(420 125) rotate(0)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#86EFAC"/></g><g transform="translate(470 165) rotate(4)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#FFD21F"/></g><g transform="translate(200 215) rotate(8)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#F68DBA"/></g><g transform="translate(260 175) rotate(12)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#E8392B"/></g><g transform="translate(320 160) rotate(16)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#86EFAC"/></g><g transform="translate(380 175) rotate(20)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#FFD21F"/></g><g transform="translate(440 215) rotate(24)"><ellipse rx="30" ry="30" fill="#F4F4F5" stroke="#0B0B0D" stroke-width="4"/><ellipse rx="17" ry="17" fill="none" stroke="#D4D4D8" stroke-width="3"/><circle r="9" fill="#F68DBA"/></g> <g transform="translate(320 300)"> <rect x="-120" y="-20" width="240" height="96" rx="10" fill="#C9833F" stroke="#0B0B0D" stroke-width="5"/> <rect x="-18" y="-20" width="36" height="96" fill="#E8392B" stroke="#0B0B0D" stroke-width="4"/> <path d="M-132,-24 L132,-24 L118,-58 L-118,-58 Z" fill="#E8A35C" stroke="#0B0B0D" stroke-width="5" transform="rotate(-8 -132 -24)"/> <g transform="translate(96 30) rotate(10)"><rect x="-44" y="-18" width="88" height="36" rx="8" fill="#FFD21F" stroke="#0B0B0D" stroke-width="3"/><text y="6" text-anchor="middle" font-family="Luckiest Guy" font-size="15" fill="#7A1A0E">GOLDEN SPOON</text></g> </g> </svg>`;


  // ---------- goal pages after the story (from the team's sketch): 0 goal, 1 how to win, 2 stars, 3 your rival ----------
  const chefFig = (x, col, rival) => `<g transform="translate(${x} 0)">
      ${rival ? `<g transform="rotate(14 65 250)"><rect x="40" y="215" width="50" height="70" rx="7" fill="${col}" stroke="#fff" stroke-width="3"/><text x="66" y="260" text-anchor="middle" font-family="Luckiest Guy" font-size="34" fill="#fff">?</text></g>` : ''}
      <path d="M-45 225 c0 -30 20 -42 45 -42 s45 12 45 42 v105 h-90z" fill="#F5F5F4" stroke="${col}" stroke-width="5"/>
      <circle cy="160" r="30" fill="#0B0B0D" stroke="${col}" stroke-width="5"/>
      <path d="M-30 110 a16 16 0 0 1 10 -28 a20 20 0 0 1 40 0 a16 16 0 0 1 10 28z" fill="#F5F5F4" stroke="${col}" stroke-width="5"/><rect x="-30" y="110" width="60" height="16" fill="#F5F5F4" stroke="${col}" stroke-width="4"/>
      ${rival ? '<path d="M-18 150 l14 6 M18 150 l-14 6" stroke="#F5F5F4" stroke-width="4" stroke-linecap="round"/><circle cx="-9" cy="162" r="4" fill="#F5F5F4"/><circle cx="9" cy="162" r="4" fill="#F5F5F4"/><path d="M-10 176 q10 8 20 0" fill="none" stroke="#F5F5F4" stroke-width="4" stroke-linecap="round"/>'
        : '<circle cx="-9" cy="158" r="5" fill="#F5F5F4"/><circle cx="13" cy="158" r="5" fill="#F5F5F4"/><path d="M-8 174 h16" stroke="#F5F5F4" stroke-width="4" stroke-linecap="round"/>'}
      <g fill="${col}"><circle cx="-12" cy="235" r="4"/><circle cx="12" cy="235" r="4"/><circle cx="-12" cy="255" r="4"/><circle cx="12" cy="255" r="4"/></g></g>`;
  const starPath = (x, y, r) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; d += (i ? 'L' : 'M') + (x + rr * Math.cos(a)).toFixed(1) + ' ' + (y + rr * Math.sin(a)).toFixed(1); } return d + 'Z'; };
  const GOAL = [
    () => `<g transform="translate(200 210)">
        <path d="M-70 -110 h140 v30 c0 60 -40 95 -70 95 s-70 -35 -70 -95z" fill="#FFD21F" stroke="#B8860B" stroke-width="5"/>
        <path d="M-70 -95 c-50 0 -55 60 -5 70 M70 -95 c50 0 55 60 5 70" fill="none" stroke="#FFD21F" stroke-width="10" stroke-linecap="round"/>
        <rect x="-10" y="15" width="20" height="45" fill="#FFD21F" stroke="#B8860B" stroke-width="4"/>
        <rect x="-55" y="58" width="110" height="26" rx="6" fill="#2A2A2E" stroke="#3F3F46" stroke-width="3"/>
        <g transform="translate(0 -62)"><ellipse cx="0" cy="-10" rx="13" ry="15" fill="#FFF7D6" stroke="#B8860B" stroke-width="3"/><path d="M0 5v32" stroke="#B8860B" stroke-width="5" stroke-linecap="round"/></g>
        <text y="125" text-anchor="middle" font-family="Luckiest Guy" font-size="24" fill="#FFD21F">GOLDEN SPOON</text></g>
      <path d="M318 200 h80 m-22 -22 l24 22 -24 22" fill="none" stroke="#F0559A" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
      <g transform="translate(540 200)">
        <circle cx="-60" cy="0" r="42" fill="none" stroke="#F4A261" stroke-width="14"/><circle cx="-60" cy="0" r="12" fill="#F4A261"/>
        <path d="M-18 0 h120 M70 0 v28 M95 0 v20" stroke="#F4A261" stroke-width="14" stroke-linecap="round"/>
        <g transform="translate(-5 -120)"><rect x="-130" y="-28" width="260" height="56" rx="12" fill="#2A1A0E" stroke="#C67A3C" stroke-width="4"/><text y="10" text-anchor="middle" font-family="Luckiest Guy" font-size="26" fill="#F4A261">THE TWO SPOONS</text></g>
        <text x="-5" y="110" text-anchor="middle" font-family="Luckiest Guy" font-size="24" fill="#F4A261">RE-OPEN IT!</text></g>`,
    (rival, days) => `<text x="360" y="70" text-anchor="middle" font-family="Inter" font-weight="700" font-size="28" fill="#E4E4E7">Earn the most</text>
      <g font-family="Luckiest Guy">
        <circle cx="110" cy="170" r="44" fill="#FFD21F" stroke="#B8860B" stroke-width="6"/><text x="110" y="187" text-anchor="middle" font-size="50" fill="#B8860B">$</text>
        <circle cx="610" cy="170" r="44" fill="#FFD21F" stroke="#B8860B" stroke-width="6"/><text x="610" y="187" text-anchor="middle" font-size="50" fill="#B8860B">$</text>
        <text x="360" y="205" text-anchor="middle" font-size="120" fill="#0B0B0D" stroke="#FFD21F" stroke-width="5" paint-order="stroke">MONEY</text></g>
      <text x="300" y="300" text-anchor="end" font-family="Inter" font-weight="700" font-size="28" fill="#E4E4E7">by the end of</text>
      <g transform="translate(320 250)"><rect width="150" height="104" rx="14" fill="#F5F5F4"/><rect width="150" height="30" rx="14" fill="#E8392B"/><rect y="16" width="150" height="14" fill="#E8392B"/>
        <circle cx="35" cy="-4" r="7" fill="#3F3F46"/><circle cx="115" cy="-4" r="7" fill="#3F3F46"/>
        <text x="75" y="92" text-anchor="middle" font-family="Luckiest Guy" font-size="56" fill="#E8392B">${days}</text></g>
      <text x="490" y="322" font-family="Luckiest Guy" font-size="44" fill="#E8392B">DAYS</text>`,
    (rival, days, per) => [0, 1, 2, 3, 4].map(i => { const x = 120 + i * 120; return `<path d="${starPath(x, 140, 48)}" fill="#FFD21F" stroke="#B8860B" stroke-width="4" stroke-linejoin="round"/><rect x="${x - 40}" y="208" width="80" height="40" rx="12" fill="#16361F" stroke="#4ADE80" stroke-width="3"/><text x="${x}" y="237" text-anchor="middle" font-family="Luckiest Guy" font-size="26" fill="#4ADE80">+$${per}</text>`; }).join('')
      + `<text x="360" y="320" text-anchor="middle" font-family="Inter" font-weight="700" font-size="26" fill="#E4E4E7">5 stars at the end = <tspan font-family="Luckiest Guy" font-size="40" fill="#4ADE80">+$${per * 5}</tspan></text>
      <text x="360" y="362" text-anchor="middle" font-family="Inter" font-weight="600" font-size="18" fill="#A1A1AA">Serve guests well to earn stars. Lose them when guests leave unhappy.</text>`,
    rival => `<path d="M90 330 h540" stroke="#3F3F46" stroke-width="6" stroke-linecap="round"/>${chefFig(200, '#6B83FF', false)}${chefFig(520, '#F0559A', true)}
      <text x="200" y="372" text-anchor="middle" font-family="Luckiest Guy" font-size="24" fill="#6B83FF">YOU</text><text x="520" y="372" text-anchor="middle" font-family="Luckiest Guy" font-size="24" fill="#F0559A">${rival}</text>
      <g transform="translate(360 165)"><path d="M-70 0 h140" stroke="#FFD21F" stroke-width="4" stroke-dasharray="10 9"/><text y="-22" text-anchor="middle" font-family="Luckiest Guy" font-size="40" fill="#E8392B">VS</text>
        <text y="60" text-anchor="middle" font-family="Luckiest Guy" font-size="22" fill="#FFD21F">WATCH OUT!</text></g>`];
  const GOAL_ALT = ['The Golden Spoon trophy, then the key to the Two Spoons', 'Earn the most money by the end of the last day', 'Five stars, each worth a money bonus at the end', 'You and your rival face each other; the rival hides a card'];
  const goal = (i, rival, days, per) => `<svg class="storyart goalart" viewBox="0 0 720 400" role="img" aria-label="${GOAL_ALT[i]}">${GOAL[i](rival, days, per)}</svg>`;
  const spoonMark = (flip) => `<svg class="spoonmark" viewBox="0 0 22 34" aria-hidden="true" style="transform:${flip ? 'scaleX(-1) ' : ''}rotate(-20deg)"><ellipse cx="11" cy="9" rx="7" ry="8" fill="none" stroke="#FFD21F" stroke-width="3"/><path d="M11 17v15" stroke="#FFD21F" stroke-width="3" stroke-linecap="round"/></svg>`;

  // ---------- pick screen: the two restaurants (drawn to match the key art and Service; prototypes/location-art) ----------
  const place = (() => {
    const O = '#2B1D14', SW = 4;
    const outl = (w = SW) => `stroke="${O}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
    // scalloped awning like the key art: stripes + half-circle edge
    function awning(x, y, w, h, c1, c2, n) {
      const sw = w / n; let s = '';
      for (let i = 0; i < n; i++) {
        const c = i % 2 ? c2 : c1, xx = x + i * sw;
        s += `<path d="M${xx} ${y} h${sw} l${sw * 0.18} ${h} h${-sw * 1.36} z" fill="${c}"/>`;
        s += `<path d="M${xx - sw * 0.18} ${y + h} a${sw * 0.68} ${sw * 0.55} 0 0 0 ${sw * 1.36} 0z" fill="${c}" ${outl(3)}/>`;
      }
      return s + `<path d="M${x} ${y} h${w} l${sw * 0.18} ${h} h${-w - sw * 0.36}z" fill="none" ${outl()}/>`;
    }
    // a little outdoor table with a red-check cloth and two chairs
    const table = (x, y, cloth = '#E8392B') => `<g transform="translate(${x} ${y})">
      ${[-1, 1].map(d => `<g transform="translate(${d * 58} 0) scale(${d} 1)"><path d="M10 -18 v58" stroke="#8A5A3A" stroke-width="7" stroke-linecap="round"/><path d="M10 -18 v58" stroke="${O}" stroke-width="2" opacity="0"/><rect x="-14" y="16" width="28" height="8" rx="3" fill="#B7713F" ${outl(3)}/><path d="M-11 24 v16 M8 24 v16" stroke="${O}" stroke-width="4" stroke-linecap="round"/><rect x="5" y="-20" width="10" height="40" rx="4" fill="#B7713F" ${outl(3)}/></g>`).join('')}
      <path d="M-34 0 h68 l6 26 h-80z" fill="#FFFDF7" ${outl()}/>
      ${[-28, -14, 0, 14].map(dx => `<rect x="${dx}" y="2" width="7" height="22" fill="${cloth}" opacity=".85"/>`).join('')}
      <path d="M-34 8 h68 M-36 16 h72" stroke="${cloth}" stroke-width="4" opacity=".55"/>
      <path d="M-34 0 h68 l6 26 h-80z" fill="none" ${outl()}/>
      <rect x="-4" y="26" width="8" height="18" fill="#7A4A2A" ${outl(2.5)}/>
      <circle cx="-10" cy="-6" r="7" fill="#FFFDF7" ${outl(2.5)}/><path d="M12 -14 v-10" stroke="#7FB069" stroke-width="3"/><circle cx="12" cy="-26" r="5" fill="#FFD21F" ${outl(2)}/></g>`;
    const flower = (x, y, c) => `<g transform="translate(${x} ${y})"><path d="M0 0 v-16" stroke="#3E7D3A" stroke-width="3"/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-22" rx="4" ry="6" fill="${c}" transform="rotate(${a} 0 -16)"/>`).join('')}<circle cy="-16" r="3" fill="#FFD21F"/></g>`;
    const lamp = (x, y, h) => `<g transform="translate(${x} ${y})"><rect x="-4" y="${-h}" width="8" height="${h}" fill="#3A3A40" ${outl(3)}/><path d="M-14 ${-h - 30} h28 l-5 30 h-18z" fill="#FFE08A" ${outl(3)}/><path d="M-16 ${-h - 30} h32 l-8 -10 h-16z" fill="#3A3A40" ${outl(3)}/><circle cx="0" cy="${-h - 15}" r="26" fill="#FFE08A" opacity=".25"/></g>`;


    // ================= COUNTRYSIDE =================
    function countryArt() {
      let s = '';
      s += `<defs><linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9FD8F0"/><stop offset="1" stop-color="#FDF1D6"/></linearGradient></defs>`;
      s += `<rect width="1050" height="400" fill="url(#sky1)"/>`;
      s += `<circle cx="140" cy="70" r="34" fill="#FFD21F" ${outl()}/>`;
      s += [[60, 60], [300, 40], [880, 70]].map(([x, y]) => `<path d="M${x} ${y} a18 18 0 0 1 30 -10 a22 22 0 0 1 40 6 a14 14 0 0 1 4 26 h-70 a14 14 0 0 1 -4 -22z" fill="#fff" ${outl(3)}/>`).join('');
      // hills, barn, windmill
      s += `<path d="M0 230 q160 -90 330 -10 q160 -90 360 0 q200 -100 360 -10 v190 h-1050z" fill="#9BCB74" ${outl()}/>`;
      s += `<path d="M0 270 q250 -60 520 -6 q280 -50 530 -10 v146 h-1050z" fill="#7FB069" ${outl()}/>`;
      s += `<g transform="translate(870 150)"><path d="M0 60 v-46 l40 -26 l40 26 v46z" fill="#D9534F" ${outl()}/><rect x="28" y="28" width="24" height="32" fill="#FFFDF7" ${outl(3)}/><path d="M28 28 l24 32 M52 28 l-24 32" stroke="${O}" stroke-width="3"/></g>`;
      s += `<g transform="translate(985 175)"><rect x="-5" y="-60" width="10" height="66" fill="#8A5A3A" ${outl(3)}/>${[0, 90, 180, 270].map(a => `<rect x="-4" y="-104" width="8" height="44" fill="#FFFDF7" ${outl(2.5)} transform="rotate(${a + 20} 0 -60)"/>`).join('')}<circle cy="-60" r="6" fill="#3A3A40"/></g>`;
      // the cottage restaurant
      s += `<g>`;
      s += `<rect x="300" y="120" width="450" height="200" fill="#F3D7A6" ${outl()}/>`;
      s += [0, 1, 2, 3, 4, 5, 6].map(i => `<path d="M300 ${148 + i * 26} h450" stroke="#D8B27A" stroke-width="3"/>`).join('');
      s += `<rect x="300" y="120" width="450" height="200" fill="none" ${outl()}/>`;
      s += `<path d="M280 128 l245 -92 l245 92z" fill="#C0392B" ${outl()}/>`;
      s += [0, 1, 2, 3].map(i => `<path d="M${330 + i * 30} ${110 - i * 11} l${390 - i * 60} 0" stroke="#A93226" stroke-width="3"/>`).join('');
      s += `<rect x="640" y="28" width="34" height="56" fill="#B66D44" ${outl()}/><path d="M650 20 q8 -14 0 -26 q-6 -10 4 -18" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>`;
      // sign
      s += `<g transform="translate(525 92)"><path d="M-30 -24 v-8 M30 -24 v-8" stroke="${O}" stroke-width="3"/><rect x="-110" y="-24" width="220" height="44" rx="10" fill="#E8A35C" ${outl()}/><circle cx="-96" cy="-2" r="4" fill="${O}"/><circle cx="96" cy="-2" r="4" fill="${O}"/><text y="10" text-anchor="middle" font-family="Luckiest Guy" font-size="28" fill="${O}">RESTAURANT</text></g>`;
      // windows with warm light and flower boxes
      for (const x of [330, 640]) {
        s += `<rect x="${x}" y="170" width="80" height="70" rx="6" fill="#FFE7A3" ${outl()}/><path d="M${x + 40} 170 v70 M${x} 205 h80" stroke="${O}" stroke-width="4"/>`;
        s += `<rect x="${x - 6}" y="240" width="92" height="18" rx="4" fill="#8A5A3A" ${outl(3)}/>` + [10, 30, 50, 70].map((dx, i) => `<circle cx="${x + dx}" cy="238" r="7" fill="${['#F06292', '#FFD21F', '#BA68C8', '#FF8A65'][i]}" ${outl(2)}/>`).join('');
      }
      // door + awning
      s += `<rect x="480" y="190" width="90" height="130" rx="8" fill="#9C5B33" ${outl()}/><rect x="492" y="202" width="66" height="50" rx="5" fill="#FFE7A3" ${outl(3)}/><circle cx="556" cy="275" r="5" fill="#FFD21F" ${outl(2)}/>`;
      s += awning(445, 148, 160, 32, '#E8392B', '#FFFDF7', 6);
      s += `</g>`;
      // flagstone path
      s += `<path d="M470 320 h110 l90 80 h-290z" fill="#C9B79A" ${outl()}/>`;
      s += [[505, 340, 26], [555, 345, 22], [495, 372, 30], [565, 378, 32], [620, 392, 24], [450, 392, 22]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.42}" fill="#E8DCC4" ${outl(3)}/>`).join('');
      // tables, flowers, bunny, lamp
      s += table(230, 330) + table(820, 330);
      s += lamp(150, 330, 80);
      s += [[60, 380, '#F06292'], [95, 360, '#FFD21F'], [130, 385, '#BA68C8'], [700, 392, '#FF8A65'], [740, 372, '#F06292'], [960, 380, '#FFD21F'], [995, 395, '#BA68C8'], [320, 392, '#FFD21F'], [420, 386, '#F06292']].map(a => flower(...a)).join('');
      return s;
    }

    // ================= CITY =================
    function cityArt() {
      let s = '';
      s += `<defs><linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7C6CC9"/><stop offset=".6" stop-color="#F29E8E"/><stop offset="1" stop-color="#FDD9A8"/></linearGradient></defs>`;
      s += `<rect width="1050" height="400" fill="url(#sky2)"/>`;
      // skyline
      const tall = [[0, 140, 90, '#5B5FA8'], [80, 90, 70, '#6E74C2'], [140, 150, 80, '#4E528F'], [700, 110, 80, '#4E528F'], [770, 60, 90, '#6E74C2'], [850, 130, 70, '#5B5FA8'], [910, 80, 80, '#4E528F'], [980, 150, 70, '#6E74C2']];
      for (const [x, y, w, c] of tall) {
        s += `<rect x="${x}" y="${y}" width="${w}" height="${300 - y}" fill="${c}" ${outl()}/>`;
        for (let yy = y + 16; yy < 270; yy += 24) for (let xx = x + 12; xx < x + w - 14; xx += 20) s += `<rect x="${xx}" y="${yy}" width="10" height="12" fill="${(xx * 7 + yy) % 3 ? '#FFE08A' : '#3D4070'}"/>`;
      }
      s += `<path d="M780 60 v-30" stroke="${O}" stroke-width="4"/><circle cx="780" cy="28" r="5" fill="#E8392B"/>`;
      // the shop building
      s += `<rect x="230" y="70" width="480" height="250" fill="#F2E3D0" ${outl()}/>`;
      s += [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<path d="M230 ${98 + i * 28} h480" stroke="#E2CDB4" stroke-width="2"/>`).join('');
      s += `<rect x="230" y="70" width="480" height="250" fill="none" ${outl()}/>`;
      s += `<rect x="222" y="60" width="496" height="18" fill="#3A3A40" ${outl()}/>`;
      // upstairs windows
      for (const x of [270, 400, 530, 640]) s += `<rect x="${x}" y="92" width="44" height="46" rx="4" fill="#BFE3F2" ${outl(3)}/><path d="M${x + 22} 92 v46" stroke="${O}" stroke-width="3"/>`;
      // sign
      s += `<g transform="translate(470 172)"><rect x="-130" y="-22" width="260" height="44" rx="10" fill="#1F2A2E" ${outl()}/><text y="10" text-anchor="middle" font-family="Luckiest Guy" font-size="28" fill="#5EEAD4">RESTAURANT</text></g>`;
      // big shop windows, warm light, diners' silhouettes
      for (const x of [252, 572]) {
        s += `<rect x="${x}" y="226" width="116" height="80" rx="6" fill="#FFE7A3" ${outl()}/>`;
        s += `<circle cx="${x + 34}" cy="262" r="10" fill="#C98B5E" opacity=".55"/><path d="M${x + 22} 290 q12 -22 24 0" fill="#C98B5E" opacity=".55"/><circle cx="${x + 80}" cy="262" r="10" fill="#C98B5E" opacity=".55"/><path d="M${x + 68} 290 q12 -22 24 0" fill="#C98B5E" opacity=".55"/>`;
        s += `<rect x="${x + 40}" y="282" width="36" height="6" fill="#E8392B"/><path d="M${x} 288 h116" stroke="${O}" stroke-width="3"/>`;
      }
      // door + teal/white awning (the City's colours in Service)
      s += `<rect x="420" y="220" width="100" height="100" rx="6" fill="#20807A" ${outl()}/><rect x="434" y="232" width="72" height="58" rx="4" fill="#FFE7A3" ${outl(3)}/><circle cx="508" cy="300" r="5" fill="#FFD21F" ${outl(2)}/>`;
      s += awning(236, 196, 468, 30, '#14B8A6', '#FFFDF7', 12);
      // OPEN neon
      s += `<g transform="translate(660 172)"><rect x="-40" y="-16" width="80" height="32" rx="16" fill="#2B1D2E" ${outl(3)}/><text y="7" text-anchor="middle" font-family="Inter" font-weight="800" font-size="16" fill="#FF7AB6" letter-spacing="2">OPEN</text></g>`;
      // pavement + street + bike lane
      s += `<rect x="0" y="320" width="1050" height="34" fill="#D9D4CC" ${outl()}/>`;
      s += [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => `<path d="M${i * 84} 320 v34" stroke="#BDB7AD" stroke-width="3"/>`).join('');
      s += `<rect x="0" y="354" width="1050" height="16" fill="#2DD4BF" ${outl(3)}/>`;
      s += `<rect x="0" y="370" width="1050" height="30" fill="#3A3A40"/>` + [0, 1, 2, 3, 4, 5, 6].map(i => `<rect x="${30 + i * 160}" y="383" width="70" height="6" rx="3" fill="#FFE08A"/>`).join('');
      s += `<g transform="translate(160 362)"><circle r="6" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="18" r="6" fill="none" stroke="#fff" stroke-width="2.5"/><path d="M0 0 l8 -9 h8 l2 9 M8 -9 l-3 -4" stroke="#fff" stroke-width="2.5" fill="none"/></g>`;
      // tables, planters, lamps, bunny
      s += table(150, 300, '#14B8A6') + table(800, 300, '#14B8A6');
      s += lamp(60, 330, 120) + lamp(990, 330, 120);
      s += `<g transform="translate(900 316)"><rect x="-22" y="-26" width="44" height="30" rx="4" fill="#20807A" ${outl(3)}/><circle cx="-10" cy="-34" r="12" fill="#3E9A5A" ${outl(3)}/><circle cx="10" cy="-36" r="14" fill="#4CAF6A" ${outl(3)}/></g>`;
      return s;
    }
    const ALT = { country: 'A wooden cottage restaurant with a red-and-white awning, a flagstone path, wildflowers and a farm on the hills behind',
      city: 'A city restaurant with a teal-and-white awning and an OPEN sign, on a street with a bike lane and tall buildings behind' };
    return loc => `<svg class="placeart" viewBox="0 0 1050 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${ALT[loc === 'city' ? 'city' : 'country']}">${loc === 'city' ? cityArt() : countryArt()}</svg>`;
  })();
  return { icon, star, stars, plate, floor, badge, story, room, gift, goal, spoonMark, place };
})();
