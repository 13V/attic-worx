// The three line drawings of "How it works" (index.html, #how): generated here, so their geometry stays exact
// and both copies of each (the stage's and the step's) stay the same.
// Run from anywhere:  node scripts/how-drawings.mjs   (no dependencies; it rewrites the drawings in index.html)
// viewBox 0 0 360 300. Every stroke is a <path pathLength="1"> with its own start (--t) and length (--u), in
// units of the drawing clock (--pace in the CSS, 0.5s), so the CSS can draw each one in order. Each drawing
// shows its point first (what's ticked, circled or new) and is done within ~1.3s; secondary text bars trail.
// Fills (.f) and labels fade in on the same clock. Classes: k1/k2/k3 line weights, ac teal (the new work),
// dm notes (teal-deep), tx* text bars, ic icons, wh white, fw/fm/ft fills (white, mint, teal), lb labels.
// Styles: assets/css/styles.css ("How it works (#how)").
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const INDEX = join(here, '..', 'index.html');
const r2 = (n) => Math.round(n * 100) / 100;
const f = (n) => String(r2(n)).replace(/^(-?)0\./, '$1.');

function Drawing() {
  const items = [];
  const time = (t, u) => {
    const a = [];
    if (t) a.push(`--t:${f(t)}`);
    if (u) a.push(`--u:${f(u)}`);
    return a.length ? ` style="${a.join(';')}"` : '';
  };
  const api = {
    // a stroke that draws in (strokes in a row with the same class and timing share one path)
    s(d, cls, t = 0, u = 0) {
      const last = items[items.length - 1];
      if (last && last.kind === 's' && last.cls === cls && last.t === t && last.u === u) last.d += d;
      else items.push({ kind: 's', d, cls, t, u });
    },
    // a fill that fades in
    fill(d, cls, t = 0, u = 0) { items.push({ kind: 'f', d, cls, t, u }); },
    // a label that fades in
    text(x, y, str, cls, t, u, anchor) { items.push({ kind: 't', x, y, str, cls, t, u, anchor }); },
    get out() {
      return items.map((it) => {
        if (it.kind === 's') return `<path class="${it.cls}" d="${it.d}" pathLength="1"${time(it.t, it.u)}/>`;
        if (it.kind === 'f') return `<path class="f ${it.cls}" d="${it.d}"${time(it.t, it.u)}/>`;
        return `<text class="lb${it.cls ? ' ' + it.cls : ''}" x="${f(it.x)}" y="${f(it.y)}"${it.anchor ? ` text-anchor="${it.anchor}"` : ''}${time(it.t, it.u)}>${it.str}</text>`;
      });
    },
  };
  return api;
}

// Path helpers
const L = (x1, y1, x2, y2) => `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
const H = (x1, x2, y) => `M${f(x1)} ${f(y)}H${f(x2)}`;
const V = (x, y1, y2) => `M${f(x)} ${f(y1)}V${f(y2)}`;
function RR(x, y, w, h, r) { // rounded rect, clockwise from the top-left corner's end
  r = Math.min(r, w / 2, h / 2);
  if (!r) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}` +
    `V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}
function circle(cx, cy, r, startDeg = -90) { // as a path, starting at startDeg, clockwise
  const a = (startDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(a), y1 = cy + r * Math.sin(a);
  const x2 = cx - r * Math.cos(a), y2 = cy - r * Math.sin(a);
  return `M${f(x1)} ${f(y1)}A${f(r)} ${f(r)} 0 1 1 ${f(x2)} ${f(y2)}A${f(r)} ${f(r)} 0 1 1 ${f(x1)} ${f(y1)}`;
}
function poly(pts, close) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join('') + (close ? 'Z' : '');
}
// A 24-unit Lucide icon path scaled to s and moved to (x, y)
function icon(d, x, y, s) {
  // Only handles the commands the four tile icons use: M m L l H h V v A a C c Z z (absolute & relative)
  const k = s / 24;
  const tok = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  let i = 0, cmd = '', o = '';
  let first = true; // a path's first moveto is absolute even when written relative (its implicit lineto's stay relative)
  const num = () => parseFloat(tok[i++]);
  const isNum = (t) => t !== undefined && !/[a-zA-Z]/.test(t);
  while (i < tok.length) {
    if (!isNum(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase() && !(first && cmd === 'm');
    const C = cmd.toUpperCase();
    const X = (v) => f(rel ? v * k : x + v * k);
    const Y = (v) => f(rel ? v * k : y + v * k);
    if (C === 'Z') { o += cmd; continue; }
    if (C === 'M' || C === 'L') {
      o += (first ? 'M' : cmd) + X(num()) + ' ' + Y(num());
      if (C === 'M') cmd = cmd === 'm' ? 'l' : 'L';
      first = false;
    }
    else if (C === 'H') o += cmd + X(num());
    else if (C === 'V') o += cmd + Y(num());
    else if (C === 'C') o += cmd + [X(num()), Y(num()), X(num()), Y(num()), X(num()), Y(num())].join(' ');
    else if (C === 'A') {
      const rx = num() * k, ry = num() * k, rot = num(), la = num(), sw = num();
      o += cmd + [f(rx), f(ry), rot, la, sw, X(num()), Y(num())].join(' ');
    } else throw new Error('cmd ' + cmd);
    o += ' ';
  }
  return o.trim().replace(/ ([a-zA-Z])/g, '$1');
}
const ICONS = {
  box: ['M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z', 'm3.3 7 8.7 5 8.7-5', 'M12 22V12'],
  ladder: ['M8 2.5 6 21.5', 'm16 2.5 2 19', 'M7.5 7h9', 'M7 12h10', 'M6.5 17h11'],
  wind: ['M12.8 19.6A2 2 0 1 0 14 16H2', 'M17.5 8a2.5 2.5 0 1 1 2 4H2', 'M9.8 4.4A2 2 0 1 1 11 8H2'],
  layers: ['M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z', 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12', 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17'],
};
// a check mark inside a w-unit box at (x, y)
const check = (x, y, w) => `M${f(x + w * 0.2)} ${f(y + w * 0.53)}L${f(x + w * 0.42)} ${f(y + w * 0.74)}L${f(x + w * 0.82)} ${f(y + w * 0.28)}`;
// A hand-drawn ring: an ellipse that runs a little past its start, with a slight drift in radius
function ring(cx, cy, rx, ry, start, sweep, drift) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const a = ((start + sweep * p) * Math.PI) / 180;
    const k = 1 + drift * p; // the pen ends a touch wider than it started
    pts.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]);
  }
  // smooth with Catmull-Rom -> cubic Bézier
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
// architectural tick: a 45° slash through (x, y)
const tick = (x, y, s = 4) => L(x - s, y + s, x + s, y - s);

function wrap(n, body, label) {
  return `<svg class="how-draw how-draw-${n}" viewBox="0 0 360 300" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">\n` +
    `<!-- ${label} -->\n` + body.join('\n') + '\n</svg>';
}

/* ---------------------------------------------------------------------------------------------
   1 · Tell us about your home: a phone showing the quote form's first step (the four service
   tiles). Storage and ladder get ticked. A dimension down its side reads "about a minute".
   --------------------------------------------------------------------------------------------- */
function drawing1() {
  const D = Drawing();
  const px = 176, py = 20, pw = 124, ph = 260; // phone body
  const sx = px + 6, sy = py + 6, sw = pw - 12, sh = ph - 12; // screen
  const cx0 = sx + 10, cw = sw - 20; // content box (x 192..284)
  // fills first (under everything); the paper follows its outline in
  D.fill(RR(px, py, pw, ph, 20), 'fw', 0.35, 0.4);
  // body, screen, island, buttons: the phone is there within the first ~0.35s
  D.s(RR(px, py, pw, ph, 20), 'k1', 0, 0.7);
  D.s(RR(sx, sy, sw, sh, 14), 'k3', 0.12, 0.6);
  D.s(RR(px + pw / 2 - 13, py + 14, 26, 8, 4), 'k2', 0.45, 0.25);
  D.s(RR(px + pw, py + 76, 2.5, 40, 1.25), 'k2', 0.55, 0.18);
  D.s(RR(px - 2.5, py + 58, 2.5, 14, 1.25) + RR(px - 2.5, py + 84, 2.5, 24, 1.25) + RR(px - 2.5, py + 116, 2.5, 24, 1.25), 'k2', 0.6, 0.2);
  // form head (text trails the tiles)
  const seg = (cw - 8) / 3;
  for (let i = 0; i < 3; i++) D.s(H(cx0 + i * (seg + 4), cx0 + i * (seg + 4) + seg, 79), i ? 'pg' : 'pg ac', 0.9 + i * 0.06, 0.2);
  D.s(H(cx0, cx0 + 54, 58), 'tx1', 1.0, 0.25);
  D.s(H(cx0, cx0 + 76, 67), 'tx2', 1.06, 0.25);
  D.s(H(cx0, cx0 + 20, 87), 'tx3', 1.18, 0.14);
  D.s(H(cx0, cx0 + 60, 101), 'tx1 tx-s', 1.12, 0.25);
  D.s(H(cx0, cx0 + 44, 108.5), 'tx2', 1.2, 0.2);
  // tiles (2 x 2): the two that get ticked are drawn in teal from the start
  const tw = (cw - 4) / 2, th = 50, ty0 = 117;
  const names = ['box', 'ladder', 'wind', 'layers'];
  const picked = [0, 1];
  const tiles = [];
  for (let i = 0; i < 4; i++) {
    const x = cx0 + (i % 2) * (tw + 4), y = ty0 + Math.floor(i / 2) * (th + 4);
    tiles.push([x, y]);
    if (picked.includes(i)) D.fill(RR(x, y, tw, th, 7), 'fm', 0.85 + picked.indexOf(i) * 0.16, 0.3);
  }
  tiles.forEach(([x, y], i) => {
    const t = 0.4 + i * 0.06;
    D.s(RR(x, y, tw, th, 7), picked.includes(i) ? 'k2 ac' : 'k3', t, 0.3);
    D.s(ICONS[names[i]].map((d) => icon(d, x + 6.5, y + 7, 12)).join(''), 'ic', t + 0.12, 0.3);
    D.s(H(x + 7, x + 7 + [26, 25, 22, 24][i], y + 33), 'tx1 tx-t', 1.3 + i * 0.06, 0.2);
    D.s(H(x + 7, x + 7 + [21, 18, 23, 19][i], y + 40), 'tx2', 1.36 + i * 0.06, 0.18);
    D.s(circle(x + tw - 8.5, y + 9.5, 4.25), 'k3', t + 0.2, 0.18);
  });
  // ticked: the tile fills mint, its radio fills teal and the check draws
  picked.forEach((i, n) => {
    const [x, y] = tiles[i];
    const t = 0.85 + n * 0.16;
    D.fill(circle(x + tw - 8.5, y + 9.5, 4.6), 'ft pop', t + 0.08, 0.2);
    D.s(check(x + tw - 12.5, y + 5.5, 8), 'wh', t + 0.14, 0.15);
  });
  // Next button
  const by = 231;
  D.fill(RR(cx0, by, cw, 20, 10), 'ft', 1.0, 0.3);
  D.s(H(cx0 + cw / 2 - 12, cx0 + cw / 2 + 4, by + 10) + `M${f(cx0 + cw / 2 + 7)} ${f(by + 10)}h8m-3.2 -3.2 3.2 3.2 -3.2 3.2`, 'wh', 1.12, 0.25);
  // home indicator
  D.s(H(px + pw / 2 - 18, px + pw / 2 + 18, py + ph - 13), 'k2', 0.6, 0.2);
  // dimension: about a minute
  const dx = 160;
  D.s(H(dx - 6, px - 6, py) + H(dx - 6, px - 6, py + ph), 'dm', 1.2, 0.18);
  D.s(V(dx, py, py + ph), 'dm', 1.3, 0.4);
  D.s(tick(dx, py) + tick(dx, py + ph), 'dm', 1.65, 0.1);
  D.text(dx - 9, py + ph / 2 + 3.4, 'About a minute', '', 1.5, 0.4, 'end');
  return wrap(1, D.out, 'Step 1: the quote form on a phone. Storage and ladder ticked; "about a minute" down its side.');
}

/* ---------------------------------------------------------------------------------------------
   2 · Get your price and options: a docket held by a bulldog clip. Three options with prices; two
   are ticked. Below the tear-off line, a week: a day gets circled, "pick a day". The sheet, the
   ticks and the circled day come first (done by ~0.75s); the text bars trail.
   --------------------------------------------------------------------------------------------- */
function drawing2() {
  const D = Drawing();
  const ox = 70; // sheet left
  const x0 = ox, x1 = ox + 152, y0 = 28, y1 = 284, perf = 198;
  const cl = x0 + 10, cr = x1 - 10; // content box
  D.fill(`M${x0 + 3} ${y0}H${x1 - 3}A3 3 0 0 1 ${x1} ${y0 + 3}V${perf - 4}A4 4 0 0 0 ${x1} ${perf + 4}V${y1 - 3}A3 3 0 0 1 ${x1 - 3} ${y1}H${x0 + 3}A3 3 0 0 1 ${x0} ${y1 - 3}V${perf + 4}A4 4 0 0 0 ${x0} ${perf - 4}V${y0 + 3}A3 3 0 0 1 ${x0 + 3} ${y0}Z`, 'fw', 0.35, 0.4);
  D.s(`M${x0 + 3} ${y0}H${x1 - 3}A3 3 0 0 1 ${x1} ${y0 + 3}V${perf - 4}A4 4 0 0 0 ${x1} ${perf + 4}V${y1 - 3}A3 3 0 0 1 ${x1 - 3} ${y1}H${x0 + 3}A3 3 0 0 1 ${x0} ${y1 - 3}V${perf + 4}A4 4 0 0 0 ${x0} ${perf - 4}V${y0 + 3}A3 3 0 0 1 ${x0 + 3} ${y0}Z`, 'k1', 0, 0.7);
  // bulldog clip: body, pivot, wire handle
  const mx = (x0 + x1) / 2;
  D.fill(RR(mx - 22, 18, 44, 18, 3), 'fw', 0.3, 0.2);
  D.s(RR(mx - 22, 18, 44, 18, 3), 'k2', 0.05, 0.35);
  D.s(H(mx - 22, mx + 22, 24), 'k3', 0.35, 0.15);
  D.s(`M${mx - 15} 19C${mx - 15} 13 ${mx - 18} 9 ${mx - 18} 6.5A2.5 2.5 0 0 1 ${mx - 15.5} 4H${mx + 15.5}A2.5 2.5 0 0 1 ${mx + 18} 6.5C${mx + 18} 9 ${mx + 15} 13 ${mx + 15} 19`, 'k2', 0.4, 0.3);
  // header: the Attic Worx mark (circle + ladder A), name, reference
  const hy = 54;
  D.s(circle(cl + 9, hy, 9), 'k2 ac', 0.45, 0.3);
  D.s(`M${cl + 5} ${hy + 5}L${cl + 9} ${hy - 5}L${cl + 13} ${hy + 5}M${cl + 6.6} ${hy + 1}H${cl + 11.4}`, 'k2 ac', 0.6, 0.2);
  D.s(H(cl + 26, cl + 78, hy - 3), 'tx1', 1.3, 0.25);
  D.s(H(cl + 26, cl + 60, hy + 5), 'tx2', 1.36, 0.2);
  D.s(H(cr - 26, cr, hy - 3), 'tx2', 1.42, 0.18);
  D.s(H(cr - 16, cr, hy + 4), 'tx3', 1.48, 0.14);
  D.s(H(cl, cr, 76), 'k3', 0.55, 0.3);
  // three options: checkbox (the two picked ones in teal, ticked at once), description, amount
  const rows = [96, 120, 144];
  rows.forEach((c, i) => {
    D.s(RR(cl, c - 6, 12, 12, 2.5), i < 2 ? 'k2 ac' : 'k2', 0.55 + i * 0.07, 0.18);
    D.s(H(cl + 20, cl + 20 + [52, 40, 46][i], c - 2.5), 'tx1', 1.45 + i * 0.08, 0.25);
    D.s(H(cl + 20, cl + 20 + [36, 30, 40][i], c + 4), 'tx2', 1.52 + i * 0.08, 0.2);
    D.s(H(cr - [26, 22, 24][i], cr, c), 'tx1', 1.6 + i * 0.08, 0.18);
  });
  // the ticks: storage floor and ladder
  [0, 1].forEach((i) => D.s(check(cl + 1, rows[i] - 5.5, 10.5), 'k1 ac', 0.78 + i * 0.14, 0.2));
  // total
  D.s(H(cr - 46, cr, 160), 'k3', 1.8, 0.2);
  D.s(H(cl, cl + 30, 174), 'tx1 tx-s', 1.85, 0.22);
  D.s(H(cr - 36, cr, 174), 'tx1 tx-s', 1.9, 0.22);
  D.s(H(cr - 36, cr, 181.5) + H(cr - 36, cr, 184.5), 'k3', 2.0, 0.18);
  // tear-off line
  let perfD = '';
  for (let x = x0 + 8; x < x1 - 8; x += 7) perfD += H(x, Math.min(x + 3.5, x1 - 8), perf);
  D.s(perfD, 'k3', 0.65, 0.35);
  // the stub: pick a day
  D.s(H(cl, cl + 40, 216), 'tx1 tx-t', 1.9, 0.2);
  const cw = 21, gap = 5.75, gx = (x0 + x1) / 2 - (5 * cw + 4 * gap) / 2;
  const pick = 3;
  for (let i = 0; i < 5; i++) {
    const x = gx + i * (cw + gap), t = 0.7 + i * 0.04;
    D.s(RR(x, 226, cw, 28, 5), 'k3', t, 0.2);
    D.s(H(x + 6, x + cw - 6, 233.5), 'tx3', t + 0.14, 0.12);
    D.s(H(x + 7.5, x + cw - 7.5, 243), i === pick ? 'tx1 tx-s' : 'tx1 tx-n', t + 0.18, 0.12);
  }
  D.s(H(cl, cl + 52, 270), 'tx3', 2.1, 0.2);
  // a day, circled by hand
  const dcx = gx + pick * (cw + gap) + cw / 2;
  D.s(ring(dcx, 240, 16.5, 19.5, -118, 384, 0.07), 'k2 ac', 1.0, 0.5);
  // leader and label
  const lx = x1 + 24;
  D.s(`M${f(dcx + 15)} ${f(226)}L${f(lx)} 206H${f(lx + 10)}`, 'dm', 1.45, 0.2);
  D.text(lx + 14, 209.4, 'Pick a day', '', 1.5, 0.4);
  return wrap(2, D.out, 'Step 2: the price docket. Two options ticked; a day circled below the tear-off line.');
}

/* ---------------------------------------------------------------------------------------------
   3 · We install: a section through the house. Room below, roof above, the manhole in the ceiling,
   the folding ladder down (its stiles converge as it leans away), the new floor over the ceiling
   joists with boxes on it. The floor is one plain shape: the drawing shows what you get, not how it's
   built. A dimension from the room floor to the new floor: 4–5 hours.
   New work is teal; the house is ink. The house goes down in ~0.45s, the new work by ~1s, the
   dimension by ~1.3s.
   --------------------------------------------------------------------------------------------- */
function drawing3() {
  const D = Drawing();
  const FL = 282;            // room floor
  const CT = 104, CB = 111;  // bottom chord top / bottom (ceiling joists)
  const CL = 114.5;          // plasterboard ceiling line
  const WL = 30, WR = 330;   // inner faces of the walls
  const OL = 214, OR = 290;  // manhole opening
  const ridge = [180, 36], eL = [14, CT], eR = [346, CT];
  const slope = (ridge[1] - eL[1]) / (ridge[0] - eL[0]); // left rafter dy/dx (negative)
  const roofY = (x) => (x <= ridge[0] ? eL[1] + (x - eL[0]) * slope : eR[1] + (x - eR[0]) * -slope);

  // room floor and slab
  D.s(H(8, 352, FL), 'k1', 0, 0.6);
  D.s(H(8, 352, FL + 6), 'k3', 0.1, 0.5);
  // walls (two faces each), skirtings
  D.s(V(WL, CB, FL) + V(WR, CB, FL), 'k2', 0.05, 0.55);
  D.s(V(WL - 8, CB, FL) + V(WR + 8, CB, FL), 'k3', 0.1, 0.55);
  D.s(`M${WL} ${FL - 8}h3.5v8M${WR} ${FL - 8}h-3.5v8`, 'k3', 0.9, 0.15);
  // bottom chord (ceiling joist), with the opening trimmed out
  D.s(H(eL[0], OL - 6, CT) + H(OR + 6, eR[0], CT), 'k1', 0.1, 0.6);
  D.s(H(eL[0] + 2, OL - 6, CB) + H(OR + 6, eR[0] - 2, CB), 'k2', 0.15, 0.55);
  // plasterboard ceiling and cornices
  D.s(H(WL, OL, CL) + H(OR, WR, CL), 'k2', 0.2, 0.5);
  D.s(`M${WL} ${CL + 7}A7 7 0 0 0 ${WL + 7} ${CL}M${WR} ${CL + 7}A7 7 0 0 1 ${WR - 7} ${CL}`, 'k3', 0.95, 0.15);
  // trimmers either side of the opening (timber in section) and the hatch frame
  D.s(RR(OL - 6, CT, 6, CB - CT, 0) + RR(OR, CT, 6, CB - CT, 0), 'k2', 0.6, 0.2);
  D.s(L(OL - 6, CT, OL, CB) + L(OR, CT, OR + 6, CB), 'k3', 0.7, 0.1);
  D.s(V(OL, CB, CL + 2) + V(OR, CB, CL + 2) + H(OL - 4, OL, CL + 2) + H(OR, OR + 4, CL + 2), 'k3', 0.7, 0.12);
  // roof: rafters from both eaves up to the ridge, roofing above them, battens between
  D.s(`M${eL[0]} ${eL[1]}L${ridge[0]} ${ridge[1]}`, 'k1', 0.1, 0.6);
  D.s(`M${eR[0]} ${eR[1]}L${ridge[0]} ${ridge[1]}`, 'k1', 0.1, 0.6);
  {
    // the roofing line, on the battens (4.5 units above the rafters (offset along the normal), with an overhang
    const ang = Math.atan(-slope), off = 4.5 / Math.cos(ang);
    const yL = (x) => eL[1] + (x - eL[0]) * slope - off;
    D.s(`M${f(4)} ${f(yL(4))}L${ridge[0]} ${f(ridge[1] - off)}L${f(356)} ${f(yL(4))}`, 'k3', 0.35, 0.55);
    // box gutters at the eaves
    D.s(`M${f(1.5)} ${f(yL(4) - 1)}v6.5a1.5 1.5 0 0 0 1.5 1.5h5a1.5 1.5 0 0 0 1.5 -1.5v-4M${f(358.5)} ${f(yL(4) - 1)}v6.5a1.5 1.5 0 0 1 -1.5 1.5h-5a1.5 1.5 0 0 1 -1.5 -1.5v-4`, 'k3', 1.0, 0.18);
    // battens: small squares sitting on the rafters, every ~30 units along each slope
    let bat = '';
    for (const side of [-1, 1]) {
      for (let k = 1; k <= 5; k++) {
        const x = ridge[0] + side * (ridge[0] - eL[0]) * (k / 5.6);
        const y = roofY(x);
        // a 4x4 square, rotated to the slope, sitting on the rafter
        const a = side < 0 ? Math.atan(slope) : -Math.atan(slope);
        const ux = Math.cos(a), uy = Math.sin(a); // along the rafter
        const nx = uy, ny = -ux;                  // up from it
        const p = [[x - ux * 2, y - uy * 2], [x + ux * 2, y + uy * 2]];
        const q = p.map(([px, py]) => [px + nx * 4.5, py + ny * 4.5]);
        bat += poly([p[0], p[1], q[1], q[0]], true);
      }
    }
    D.s(bat, 'k3', 0.8, 0.25);
  }
  // the new floor (teal): one shape over the ceiling joists
  const FX0 = 66, FX1 = OL - 6, ST = 95;
  D.s(RR(FX0, ST, FX1 - FX0, CT - ST, 0.8), 'k2 ac', 0.85, 0.45);
  // boxes, a tub
  const bx = [[106, 140, 22], [146, 172, 16]];
  bx.forEach(([a, b, h], i) => {
    const t = 1.45 + i * 0.1, top = ST - h;
    D.s(RR(a, top, b - a, h, 1), 'k2', t, 0.3);
    D.s(H(a, b, top + 4.5) + H((a + b) / 2 - 2, (a + b) / 2 + 2, top) + V((a + b) / 2 - 2, top, top + 9) + V((a + b) / 2 + 2, top, top + 9), 'k3', t + 0.18, 0.16);
  });
  D.s(`M181 ${ST}L178.5 79.5H205.5L203 ${ST}Z`, 'k2', 1.65, 0.3);
  D.s(RR(176, 75.5, 32, 4, 1.5) + H(186, 198, 87), 'k3', 1.8, 0.16);
  // the hatch panel, swung down behind the ladder
  const PB = 178, PX0 = OL + 4, PX1 = OR - 4;
  // stiles: outer and inner edges, converging as the ladder leans away (top y 117, foot y 276)
  const LT = 117, LB = 276;
  const stile = {
    lo: [[231, LT], [221.5, LB]], li: [[235.5, LT], [227, LB]],
    ri: [[268.5, LT], [277, LB]], ro: [[273, LT], [282.5, LB]],
  };
  const at = (e, y) => e[0][0] + (e[1][0] - e[0][0]) * ((y - e[0][1]) / (e[1][1] - e[0][1]));
  // panel bottom edge, broken where the stiles cross in front of it
  D.s(V(PX0, CL + 2, PB) + V(PX1, CL + 2, PB), 'k2', 1.05, 0.25);
  D.s(H(PX0, at(stile.lo, PB), PB) + H(at(stile.li, PB), at(stile.ri, PB), PB) + H(at(stile.ro, PB), PX1, PB), 'k2', 1.2, 0.15);
  // stiles draw down from the hatch (the ladder unfolding)
  D.s(L(...stile.lo[0], ...stile.lo[1]) + L(...stile.li[0], ...stile.li[1]), 'k1 ac', 1.15, 0.55);
  D.s(L(...stile.ri[0], ...stile.ri[1]) + L(...stile.ro[0], ...stile.ro[1]), 'k1 ac', 1.15, 0.55);
  D.s(H(stile.lo[0][0], stile.li[0][0], LT) + H(stile.ri[0][0], stile.ro[0][0], LT), 'k2 ac', 1.15, 0.08);
  // treads, top to bottom; spacing closes up towards the top (it's further away)
  const treads = [];
  let y = 262, sp = 19;
  for (let i = 0; i < 9; i++) { treads.push(y); y -= sp; sp *= 0.955; }
  treads.reverse().forEach((ty, i) => {
    const a = at(stile.li, ty), b = at(stile.ri, ty);
    D.s(RR(a, ty - 1.25, b - a, 2.5, 0.6), 'k2 ac', 1.25 + i * 0.05, 0.12);
  });
  // section joints (where it folds) and the feet
  const J = [168, 222];
  D.s(J.map((jy) => L(at(stile.lo, jy), jy + 1.5, at(stile.li, jy), jy - 1.5) + L(at(stile.ri, jy), jy - 1.5, at(stile.ro, jy), jy + 1.5)).join(''), 'k3 ac', 1.75, 0.12);
  D.s(RR(at(stile.lo, LB) - 0.5, LB, 7, FL - LB, 1.5) + RR(at(stile.ri, LB) - 0.5, LB, 7, FL - LB, 1.5), 'k2', 1.8, 0.14);
  // dimension: room floor to the top of the new floor, 4–5 hours. It stands inboard, so it reads off
  // the floor's top face and stays clear of the rafter.
  const dx = 86;
  D.s(V(dx, ST, FL), 'dm', 1.95, 0.4);
  D.s(tick(dx, ST, 3.5) + tick(dx, FL, 3.5), 'dm', 2.3, 0.1);
  D.text(dx + 9, 203, '4–5 hours', 'lb-lg', 2.15, 0.45);
  return wrap(3, D.out, 'Step 3: a section through the house. The ladder down through the manhole, the new floor above; "4–5 hours" from floor to floor.');
}

// Each drawing is in the page twice: on the stage (wide screens, keeps its comment) and in its step (narrow
// screens). Rewrite every copy in place, so the two never drift apart.
let html = readFileSync(INDEX, 'utf8');
for (const [n, fn] of [[1, drawing1], [2, drawing2], [3, drawing3]]) {
  const svg = fn();
  const bare = svg.replace(/\n<!--[^]*?-->/, '');
  let k = 0;
  html = html.replace(new RegExp(`<svg class="how-draw how-draw-${n}"[^]*?</svg>`, 'g'), () => (k++ ? bare : svg));
  if (k !== 2) throw new Error(`drawing ${n}: expected 2 copies in index.html, found ${k}`);
}
writeFileSync(INDEX, html);
console.log('How it works drawings updated in index.html');
