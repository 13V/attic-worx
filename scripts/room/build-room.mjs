#!/usr/bin/env node
/* Attic Worx: the "How much room?" picture (index.html #room), generated.

   Usage
     node scripts/room/build-room.mjs             write the picture into index.html, between
                                                  <!-- room:start --> and <!-- room:end -->
     node scripts/room/build-room.mjs --check     exit 1 if index.html is out of date
     node scripts/room/build-room.mjs --concept 8 [--out file.svg]
                                                  a standalone still at 8 m² (no CSS needed)
     node scripts/room/build-room.mjs --stats     size, and what shows at each whole m²
   No dependencies.

   The picture: a roof space with its lid off, seen from the front right and above (an orthographic
   camera, so the floor's area reads true and identical things look identical wherever they sit).
   The ridge runs away from you. The near end is cut through and shows its section in brand teal, as
   the garage scene (#build) shows its cut; the far gable is dark, with its end truss. The ceiling has
   joists at 600 mm centres with batts between them, and the manhole glows with the light of the
   room below. The new floor is H2 battens and 2400 × 600 × 19 mm particleboard, laid from the
   manhole outwards: a 600 mm walkway under the ridge first, then a sheet either side, row by row,
   then a second run of sheets further in. Stored things stand in lanes either side of the walkway.
   Everything is modelled in metres at real sizes, in the garage scene's palette.

   The file holds the largest floor (20 m²). Each sheet and each thing is one <use> of a shared shape
   and carries the floor size at which it appears (data-at, m²). It shows while it has the class "on":
   the file is written at 8 m² (data-v="8"), which is what shows without JS, and fx-room.js only
   toggles "on" on the parts whose state changes as the slider moves (and sets their delays). Nothing
   is built or removed while the slider moves.

   Keep in step with fx-room.js: the floor sizes (2..20 m²). */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const INDEX = path.join(ROOT, 'index.html');

/* ---------- Camera: orthographic, from the front right and above ----------
   x runs across the house (0 = under the ridge, + to the right), y along the ridge (0 = the far gable,
   + towards you), z up. Screen y grows downwards. */
const CAM = { az: 30, el: 38, u: 64 };
const sa = Math.sin((CAM.az * Math.PI) / 180), ca = Math.cos((CAM.az * Math.PI) / 180);
const se = Math.sin((CAM.el * Math.PI) / 180), ce = Math.cos((CAM.el * Math.PI) / 180);
const projRaw = (x, y, z) => [(x * ca - y * sa) * CAM.u, ((x * sa + y * ca) * se - z * ce) * CAM.u];
let OX = 0, OY = 0; // the frame's corner, set in build()
const r1 = (v) => Math.round(v * 10) / 10;
const P = (x, y, z) => { const p = projRaw(x, y, z); return [r1(p[0] - OX), r1(p[1] - OY)]; }; // a point
const D = (x, y, z) => { const p = projRaw(x, y, z); return [r1(p[0]), r1(p[1])]; };            // an offset
const fmt = (p) => `${p[0]} ${p[1]}`;
const poly = (pts) => 'M' + pts.map(fmt).join('L') + 'Z';
const depth = (x, y) => x * sa + y * ca; // larger is nearer: draw in this order

/* ---------- Colour: the garage scene's palette, each face shaded by a multiplier ---------- */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const mul = (a, k) => toHex(hex(a).map((v) => v * k));
const C = {
  cut: '#117e79', roof: '#0c2122', roof2: '#133433',
  pine: '#d39b5e', h2: '#a3b99b', board: '#d4cbb6', insul: '#b49f72',
  kraft: '#bd915c', band2: '#5f8fb3', tub: '#d3dcd9', lid: '#117e79', tealtub: '#2b8a84',
  suitcase: '#4b7391', esky: '#e2e7e4', eskyLid: '#2f7d95', bag: '#36524e', roll: '#c9945a',
  amber: '#ffcf8a', warm: '#f6b866', mint: '#8fd6cc',
};
const SH = { top: 1.06, front: 0.9, side: 0.74 }; // light from above and the left
const dark = (c, k = 0.5) => mix(c, C.roof, k);   // the unlit roof space

/* ---------- The roof space (m) ---------- */
const R = { half: 3.6, cut: 3.1, y0: 0, y1: 6.6, slab: 0.24, ridge: 1.6 }; // cut: the slice's sides
const PITCH_T = R.ridge / R.half;                                   // ~24°
const zRoof = (x) => (R.half - Math.abs(x)) * PITCH_T;              // underside of the roof over x
const JOISTS = []; for (let y = 0.3; y < R.y1; y += 0.6) JOISTS.push(+y.toFixed(2)); // 600 centres
/* The floor: sheets 600 wide (across) and 2400 long (along the ridge), two runs, the near one first */
const F = { z: 0.13, t: 0.019, w: 0.6, l: 2.4, runs: [[2.75, 5.15], [0.35, 2.75]], cols: [0, 1, -1, 2, -2, 3, -3] };
const HATCH = { x0: -0.28, x1: 0.28, y0: 5.25, y1: 6.25 };
const WALK = 0.3;                                                    // the walkway: x in [-0.3, 0.3]

/* Sheets in laying order: the walkway sheet, then right, left, outwards; then the far run. Sheet k
   (1..14) shows from floor size SHEETS[k-1].at m²: each is 2.4 × 0.6 = 1.44 m², and shows once the
   slider is within 0.9 m² of it, so the drawn floor stays within about 1 m² of the number. */
const SHEETS = [];
F.runs.forEach(([y0, y1]) => F.cols.forEach((c) => SHEETS.push({ x0: c * F.w - F.w / 2, x1: c * F.w + F.w / 2, y0, y1, c })));
SHEETS.forEach((s, i) => { s.k = i + 1; s.at = +(1.44 * (i + 1) - 0.9).toFixed(2); });

/* ---------- Markup ---------- */
function el(tag, attrs, inner) {
  const a = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${v}"`).join('');
  return inner === undefined ? `<${tag}${a}/>` : `<${tag}${a}>${inner}</${tag}>`;
}
const pth = (d, fill) => el('path', { d, fill });

/* faces relative to a shape's own corner (offsets), and placed in the scene (points) */
const quad = (f, a, b, c, d) => poly([f(...a), f(...b), f(...c), f(...d)]);
const fFront = (f, x0, x1, z0, z1, y) => quad(f, [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]);
const fSide = (f, y0, y1, z0, z1, x) => quad(f, [x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]);
const fTop = (f, x0, x1, y0, y1, z) => quad(f, [x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]);
/* an axis-aligned prism's visible faces (front +y, side +x, top), as offsets from its corner; a prism
   with something standing on it (top: false) leaves out its hidden top */
function prism(w, d, h, col, sh = SH, at = [0, 0, 0], top = true) {
  const [ax, ay, az] = at;
  const q = (x, y, z) => D(ax + x, ay + y, az + z);
  return pth(fFront(q, 0, w, 0, h, d), mul(col, sh.front)) +
    pth(fSide(q, 0, d, 0, h, w), mul(col, sh.side)) +
    (top ? pth(fTop(q, 0, w, 0, d, h), mul(col, sh.top)) : '');
}
/* faces of one colour as one path (they don't overlap anything drawn between them) */
const many = (ds, fill) => el('path', { d: ds.join(''), fill });

/* ---------- Shapes, each defined once at its own corner ---------- */
const SHAPES = {};
const FOOT = {}; // [along x, along y, height]
const shape = (id, foot, inner) => { SHAPES[id] = inner; FOOT[id] = foot; };

/* a sheet: particleboard on H2 battens (the front and the right edge show while it's the last one) */
{
  const { w, l, z, t } = F;
  shape('rm-sheet', [w, l, z], [
    pth(fFront(D, 0, w, 0, z - t, l), mul(C.h2, SH.front)),
    pth(fSide(D, 0, l, 0, z - t, w), mul(C.h2, SH.side)),
    pth(fFront(D, 0, w, z - t, z, l), mul(C.board, 0.84)),
    pth(fSide(D, 0, l, z - t, z, w), mul(C.board, 0.72)),
    pth(fTop(D, 0, w, 0, l, z), mul(C.board, SH.top)),
    pth(fTop(D, w - 0.012, w, 0, l, z), mul(C.board, 0.9)),
  ].join(''));
}
/* archive boxes (420 × 320 × 260 mm), two high: kraft, a blue band and a hand hole in each end, the
   lid rims marking where one box sits on the other. Each colour is one path. */
const BOX = { w: 0.42, d: 0.32, h: 0.26 };
{
  const { w, d, h } = BOX;
  const lv = [0, h];
  shape('rm-box2', [w, d, 2 * h], [
    pth(fFront(D, 0, w, 0, 2 * h, d), mul(C.kraft, SH.front)),
    pth(fSide(D, 0, d, 0, 2 * h, w), mul(C.kraft, SH.side)),
    pth(fTop(D, 0, w, 0, d, 2 * h), mul(C.kraft, SH.top)),
    many(lv.map((z0) => fFront(D, 0, w, z0 + h * 0.34, z0 + h * 0.58, d + 0.001)), mul(C.band2, SH.front)),
    many(lv.map((z0) => fSide(D, 0, d, z0 + h * 0.34, z0 + h * 0.58, w + 0.001)), mul(C.band2, SH.side)),
    many(lv.map((z0) => fSide(D, d * 0.3, d * 0.7, z0 + h * 0.68, z0 + h * 0.82, w + 0.002)), mul(C.kraft, 0.4)),
    many(lv.map((z0) => fFront(D, 0, w, z0 + h - 0.028, z0 + h, d + 0.001)), mul(C.kraft, 0.78)),
    many(lv.map((z0) => fSide(D, 0, d, z0 + h - 0.028, z0 + h, w + 0.001)), mul(C.kraft, 0.64)),
  ].join(''));
}
/* two storage tubs: a clear one with things inside under a teal lid, a teal one on top */
{
  const w = 0.42, d = 0.6, h = 0.3, lid = 0.04;
  shape('rm-tubs', [w, d, 2 * h], [
    prism(w, d, h - lid, C.tub, SH, [0, 0, 0], false),
    pth(fFront(D, 0.05, 0.36, 0.04, 0.18, d + 0.001), mix(C.tub, '#a17f5c', 0.42)),
    pth(fSide(D, 0.06, 0.3, 0.04, 0.2, w + 0.001), mix(C.tub, '#6a8fa6', 0.4)),
    pth(fSide(D, 0.33, 0.54, 0.04, 0.15, w + 0.001), mix(C.tub, '#b9876a', 0.35)),
    prism(w + 0.02, d + 0.02, lid, C.lid, SH, [-0.01, -0.01, h - lid]),
    prism(w, d, h - lid, C.tealtub, SH, [0, 0, h], false),
    prism(w + 0.02, d + 0.02, lid, mul(C.tealtub, 0.8), SH, [-0.01, -0.01, 2 * h - lid]),
  ].join(''));
}
/* a suitcase lying flat */
{
  const w = 0.42, d = 0.7, h = 0.25;
  shape('rm-case', [w, d, h], [
    prism(w, d, h, C.suitcase, { top: 1.12, front: 0.92, side: 0.74 }),
    pth(fSide(D, 0, d, h * 0.46, h * 0.54, w + 0.001), mul(C.suitcase, 0.6)),
    pth(fFront(D, 0, w, h * 0.46, h * 0.54, d + 0.001), mul(C.suitcase, 0.66)),
    pth(fTop(D, 0.15, 0.27, d - 0.1, d - 0.05, h + 0.001), mul(C.suitcase, 0.55)),
  ].join(''));
}
/* an esky (camping) */
{
  const w = 0.42, d = 0.62, h = 0.4, lid = 0.07;
  shape('rm-esky', [w, d, h], [
    prism(w, d, h - lid, C.esky, SH, [0, 0, 0], false),
    prism(w + 0.02, d + 0.02, lid, C.eskyLid, SH, [-0.01, -0.01, h - lid]),
    pth(fSide(D, 0.08, 0.2, h - lid - 0.09, h - lid - 0.04, w + 0.001), mul(C.eskyLid, 0.7)),
  ].join(''));
}
/* a cricket kit bag (sports gear) */
{
  const w = 0.36, d = 0.86, h = 0.3;
  shape('rm-bag', [w, d, h], [
    prism(w, d, h, C.bag, { top: 1.25, front: 0.95, side: 0.78 }),
    pth(fSide(D, 0, d, h * 0.56, h * 0.7, w + 0.001), mul(C.mint, 0.78)),
    pth(fTop(D, w * 0.42, w * 0.58, d * 0.3, d * 0.7, h + 0.001), mul(C.bag, 0.55)),
  ].join(''));
}
/* rolled camping gear: a tent bag and a sleeping mat, lying along y (round ends towards you) */
function roll(len, dia, col) {
  const r = dia / 2, n = 20;
  const ring = (y, k = 1) => Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return D(r + r * k * Math.cos(t), y, r + r * k * Math.sin(t));
  });
  const hull = convexHull([...ring(0), ...ring(len)]);
  return [pth(poly(hull), mul(col, 0.8)), pth(poly(ring(len)), mul(col, 1.02)), pth(poly(ring(len + 0.001, 0.42)), mul(col, 0.78))].join('');
}
function convexHull(pts) {
  const p = pts.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1)).map((q) => [r1(q[0]), r1(q[1])]);
}
shape('rm-tent', [0.24, 0.62, 0.24], roll(0.62, 0.24, '#5e7b5a'));
shape('rm-mat', [0.2, 0.56, 0.2], roll(0.56, 0.2, C.roll));

/* ---------- Where things go ----------
   Three lanes either side of the walkway (the outer edge, with the least headroom, stays clear).
   Each lane runs from the manhole end of the floor inwards and repeats its own pattern. */
const LANES = [
  { x: WALK + 0.04, pat: ['rm-box2', 'rm-box2', 'rm-esky', 'rm-box2', 'rm-box2', 'rm-tubs', 'rm-box2', 'rm-box2', 'rm-box2', 'rm-case', 'rm-box2', 'rm-box2'] },
  { x: WALK + 0.49, pat: ['rm-box2', 'rm-tubs', 'rm-box2', 'rm-box2', 'rm-box2', 'rm-box2', 'rm-tubs', 'rm-box2', 'rm-box2', 'rm-box2'] },
  { x: WALK + 0.94, pat: ['rm-box2', 'rm-box2', 'rm-box2', 'rm-tent', 'rm-box2', 'rm-box2', 'rm-box2', 'rm-bag', 'rm-box2'] },
  { x: -(WALK + 0.04), pat: ['rm-box2', 'rm-tubs', 'rm-box2', 'rm-box2', 'rm-box2', 'rm-bag', 'rm-box2', 'rm-box2', 'rm-tubs', 'rm-box2'] },
  { x: -(WALK + 0.49), pat: ['rm-box2', 'rm-box2', 'rm-case', 'rm-box2', 'rm-box2', 'rm-box2', 'rm-tubs', 'rm-box2', 'rm-box2'] },
  { x: -(WALK + 0.94), pat: ['rm-box2', 'rm-mat', 'rm-box2', 'rm-box2', 'rm-esky', 'rm-box2', 'rm-box2', 'rm-box2', 'rm-tent'] },
];
const GAP = 0.03;
function planItems() {
  const items = [];
  const yNear = F.runs[0][1], yFar = F.runs[1][0];
  LANES.forEach((lane, li) => {
    let y = yNear - 0.06, i = 0;
    for (;;) {
      const id = lane.pat[i++ % lane.pat.length];
      const [w, d] = FOOT[id];
      if (y - d < yFar + 0.04) break;
      const x0 = lane.x >= 0 ? lane.x : lane.x - w;
      items.push({ id, x0, y0: y - d, w, d, lane: li });
      y -= d + GAP;
    }
  });
  // a thing shows once every sheet under it is down
  items.forEach((it) => {
    it.at = 0;
    for (const s of SHEETS) {
      if (s.x1 > it.x0 + 0.001 && s.x0 < it.x0 + it.w - 0.001 && s.y1 > it.y0 + 0.001 && s.y0 < it.y0 + it.d - 0.001) it.at = Math.max(it.at, s.at);
    }
  });
  // When each thing arrives (data-at, m²): never before the sheets under it, and spread so the drawn load
  // grows with the floor like the number does (about the same share at every whole m²). Within a
  // step, things nearest the manhole come first.
  items.forEach((it) => { it.e = it.at; });
  const order = [...items].sort((a, b) => a.e - b.e || (b.y0 + b.d) - (a.y0 + a.d) || Math.abs(a.x0) - Math.abs(b.x0));
  // S[v]: how many things show at v m². At most what the sheets allow (A), about in proportion to v,
  // and at least one more at every step (worked backwards from the largest floor, so none run out).
  const N = items.length, A = [], S = [];
  for (let v = 2; v <= 20; v++) A[v] = order.filter((it) => it.e <= v).length;
  S[20] = N;
  for (let v = 19; v >= 2; v--) S[v] = Math.min(A[v], Math.round((N * v) / 20), S[v + 1] - 1);
  let n = 0;
  for (let v = 2; v <= 20; v++) {
    const batch = order.slice(n, S[v]);
    n = S[v];
    const lo = Math.max(v - 1, ...batch.map((it) => it.e));
    batch.forEach((it, j) => { it.at = +(lo + ((v - lo) * (j + 1)) / (batch.length + 1)).toFixed(3); });
  }
  return items;
}

/* ---------- The picture ---------- */
export function build({ v = 8, still = false } = {}) {
  const X0 = -R.cut, X1 = R.cut; // the slice's sides, cut through short of the eaves
  const corners = [];
  for (const x of [X0, X1]) for (const y of [R.y0, R.y1]) for (const z of [-R.slab, 0]) corners.push(projRaw(x, y, z));
  corners.push(projRaw(0, R.y0, R.ridge + 0.2));
  const pad = 8;
  const minX = Math.min(...corners.map((p) => p[0])) - pad, maxX = Math.max(...corners.map((p) => p[0])) + pad;
  const minY = Math.min(...corners.map((p) => p[1])) - pad, maxY = Math.max(...corners.map((p) => p[1])) + pad;
  OX = minX; OY = minY;
  const W = Math.round(maxX - minX), H = Math.round(maxY - minY);

  const defs = [];
  defs.push(`<radialGradient id="rm-pool"><stop offset="0" stop-color="${C.amber}" stop-opacity=".5"/><stop offset=".55" stop-color="${C.warm}" stop-opacity=".16"/><stop offset="1" stop-color="${C.warm}" stop-opacity="0"/></radialGradient>`);
  defs.push(`<radialGradient id="rm-spill"><stop offset="0" stop-color="#fff3d6" stop-opacity=".9"/><stop offset=".25" stop-color="${C.amber}" stop-opacity=".45"/><stop offset="1" stop-color="${C.warm}" stop-opacity="0"/></radialGradient>`);
  for (const [id, inner] of Object.entries(SHAPES)) defs.push(el('g', { id }, inner));

  const out = [];
  const T = (pts, col) => out.push(pth(poly(pts.map((p) => P(...p))), col));

  /* a roof slope, cut off level at KNEE, from the slice's side up: its top dark, the rafters on it at
     600 centres, the level cut along the top in teal. side -1 is the far (left) slope, +1 the near. */
  const KNEE = 0.45, TH = 0.1, zS = zRoof(R.cut);
  const slope = (sd) => {
    const xe = sd * R.cut, xk = sd * (R.half - KNEE / PITCH_T);
    T([[xe, R.y0, zS + TH], [xk, R.y0, KNEE + TH], [xk, R.y1, KNEE + TH], [xe, R.y1, zS + TH]], sd > 0 ? C.roof2 : C.roof);
    for (const y of JOISTS) {
      const w = 0.03;
      T([[xe, y - w, zS + TH], [xk, y - w, KNEE + TH], [xk, y + w, KNEE + TH], [xe, y + w, zS + TH]], dark(C.pine, sd > 0 ? 0.28 : 0.42));
    }
    // the level cut along the top
    T([[xk, R.y0, KNEE + TH], [xk, R.y1, KNEE + TH], [xk - sd * 0.22, R.y1, KNEE + TH], [xk - sd * 0.22, R.y0, KNEE + TH]], sd > 0 ? C.cut : mul(C.cut, 0.85));
    // the inside face of the cut, down to the slope's underside (it faces the floor)
    T([[xk - sd * 0.22, R.y0, KNEE + TH], [xk - sd * 0.22, R.y1, KNEE + TH], [xk - sd * 0.22, R.y1, KNEE + TH - 0.1], [xk - sd * 0.22, R.y0, KNEE + TH - 0.1]], sd > 0 ? mul(C.cut, 0.7) : mul(C.cut, 0.62));
  };
  /* a section through the slice at its near end (y = R.y1) or its near side (x = R.cut): the ceiling,
     the dark eave space and the low slope, all cut, in teal */
  const sectionEnd = () => {
    T([[X0, R.y1, -R.slab], [X1, R.y1, -R.slab], [X1, R.y1, 0], [X0, R.y1, 0]], C.cut);
    for (const sd of [-1, 1]) {
      const xe = sd * R.cut, xk = sd * (R.half - KNEE / PITCH_T), xi = xk - sd * 0.22;
      T([[xe, R.y1, 0], [xi, R.y1, 0], [xi, R.y1, KNEE], [xk, R.y1, KNEE], [xe, R.y1, zS]], C.roof);
      T([[xe, R.y1, zS], [xk, R.y1, KNEE], [xi, R.y1, KNEE], [xi, R.y1, KNEE + TH], [xk, R.y1, KNEE + TH], [xe, R.y1, zS + TH]], C.cut);
    }
  };
  const sectionSide = () => {
    const x = R.cut;
    T([[x, R.y0, -R.slab], [x, R.y1, -R.slab], [x, R.y1, 0], [x, R.y0, 0]], mul(C.cut, 0.8));
    T([[x, R.y0, 0], [x, R.y1, 0], [x, R.y1, zS], [x, R.y0, zS]], mul(C.roof, 0.9));
    T([[x, R.y0, zS], [x, R.y1, zS], [x, R.y1, zS + TH], [x, R.y0, zS + TH]], mul(C.cut, 0.8));
  };

  /* the far gable: its end wall in the dark, the end truss on it */
  const gable = poly([P(X0, R.y0, 0), P(X0, R.y0, zS + TH), P(0, R.y0, R.ridge + TH), P(X1, R.y0, zS + TH), P(X1, R.y0, 0)]);
  out.push(pth(gable, C.roof));
  defs.push(el('clipPath', { id: 'rm-gable' }, el('path', { d: gable })));
  const truss = (y, col, k = 0.09) => { // members in the plane y: a strip from a to b (x,z), k wide
    const strip = (a, b, w) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), nx = (-dz / L) * w, nz = (dx / L) * w;
      T([[a[0], y, a[1]], [b[0], y, b[1]], [b[0] + nx, y, b[1] + nz], [a[0] + nx, y, a[1] + nz]], col);
    };
    strip([-R.cut, zS], [0, R.ridge], -k);
    strip([0, R.ridge], [R.cut, zS], -k);
    strip([-0.03, R.ridge - 0.1], [-0.03, 0], -0.06);
    strip([-1.8, 0.05], [-0.03, R.ridge * 0.62], 0.06);
    strip([1.8, 0.05], [0.03, R.ridge * 0.62], -0.06);
  };
  truss(R.y0 + 0.01, dark(C.pine, 0.2));
  /* the work light, hung from the king post: it comes on as the picture first shows (.rm-lit) */
  {
    const L = { x: -0.2, y: 0.18, z: 1.06, w: 0.4, d: 0.07, h: 0.08 };
    const c = P(L.x + L.w / 2, L.y, L.z);
    out.push(el('g', { class: 'rm-lit', 'clip-path': 'url(#rm-gable)' }, el('ellipse', { cx: c[0], cy: c[1], rx: r1(1.5 * CAM.u), ry: r1(1.1 * CAM.u), fill: 'url(#rm-spill)' })));
    T([[0, L.y, L.z + L.h], [0, L.y, R.ridge - 0.15], [0.02, L.y, R.ridge - 0.15], [0.02, L.y, L.z + L.h]], dark(C.pine, 0.2)); // its hanger
    out.push(pth(poly([P(L.x, L.y + L.d, L.z), P(L.x + L.w, L.y + L.d, L.z), P(L.x + L.w, L.y + L.d, L.z + L.h), P(L.x, L.y + L.d, L.z + L.h)]), '#2c3b3b'));
    out.push(pth(poly([P(L.x, L.y, L.z), P(L.x + L.w, L.y, L.z), P(L.x + L.w, L.y + L.d, L.z), P(L.x, L.y + L.d, L.z)]), '#3a4a4a'));
    out.push(el('g', { class: 'rm-lit' }, pth(poly([P(L.x + 0.02, L.y + L.d + 0.001, L.z + 0.012), P(L.x + L.w - 0.02, L.y + L.d + 0.001, L.z + 0.012), P(L.x + L.w - 0.02, L.y + L.d + 0.001, L.z + 0.045), P(L.x + 0.02, L.y + L.d + 0.001, L.z + 0.045)]), '#fff6e2')));
  }

  /* the ceiling: batts between the joists, in the dark */
  T([[X0, R.y0, 0], [X1, R.y0, 0], [X1, R.y1, 0], [X0, R.y1, 0]], dark(C.insul, 0.6));
  for (const y of JOISTS) T([[X0, y - 0.0225, 0.004], [X1, y - 0.0225, 0.004], [X1, y + 0.0225, 0.004], [X0, y + 0.0225, 0.004]], dark(C.pine, 0.58));
  for (const x of [-2.4, -1.2, 1.2, 2.4]) T([[x, R.y0, 0.003], [x + 0.025, R.y0, 0.003], [x + 0.025, R.y1, 0.003], [x, R.y1, 0.003]], dark(C.insul, 0.68));
  /* the light of the floor: a warm pool that grows with it (fx-room.js scales it; 8 m² in the CSS) */
  {
    const c = P(0, 3.0, 0), o = P(0, HATCH.y0, 0);
    out.push(el('g', { class: 'rm-lit' }, el('ellipse', { class: 'rm-pool', cx: c[0], cy: c[1], rx: r1(3.3 * CAM.u), ry: r1(3.3 * CAM.u * se), fill: 'url(#rm-pool)', style: `transform-origin:${o[0]}px ${o[1]}px` })));
  }
  /* the manhole, lit from the garage below: what's in it (its far and left walls, the ladder going
     down) shows only through the opening */
  {
    const { x0, x1, y0, y1 } = HATCH;
    const hole = poly([P(x0, y0, 0), P(x1, y0, 0), P(x1, y1, 0), P(x0, y1, 0)]);
    defs.push(el('clipPath', { id: 'rm-hole' }, el('path', { d: hole })));
    const g = [];
    const Tg = (pts, col) => g.push(pth(poly(pts.map((q) => P(...q))), col));
    Tg([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], '#fff3d6');
    Tg([[x0, y0, 0], [x1, y0, 0], [x1, y0, -R.slab], [x0, y0, -R.slab]], mul(C.pine, 0.84));
    Tg([[x0, y0, 0], [x0, y1, 0], [x0, y1, -R.slab], [x0, y0, -R.slab]], mul(C.pine, 0.68));
    for (const sx of [x0 + 0.07, x1 - 0.115]) Tg([[sx, y0 + 0.06, 0.02], [sx + 0.045, y0 + 0.06, 0.02], [sx + 0.045, y1, -0.95], [sx, y1, -0.95]], C.pine);
    for (const t of [0.22, 0.5, 0.78]) {
      const yy = y0 + 0.06 + t * (y1 - y0 - 0.06), zz = 0.02 - t * 0.97;
      Tg([[x0 + 0.1, yy, zz], [x1 - 0.1, yy, zz], [x1 - 0.1, yy + 0.05, zz], [x0 + 0.1, yy + 0.05, zz]], mul(C.pine, 0.9));
    }
    out.push(el('g', { 'clip-path': 'url(#rm-hole)' }, g.join('')));
    // the trim round the opening
    T([[x0 - 0.05, y1, 0.012], [x1 + 0.05, y1, 0.012], [x1 + 0.05, y1 + 0.05, 0.012], [x0 - 0.05, y1 + 0.05, 0.012]], C.pine);
    T([[x1, y0 - 0.05, 0.012], [x1 + 0.05, y0 - 0.05, 0.012], [x1 + 0.05, y1, 0.012], [x1, y1, 0.012]], mul(C.pine, 1.04));
    const c = P(0, (y0 + y1) / 2, 0);
    out.push(el('ellipse', { cx: c[0], cy: c[1], rx: r1(1.1 * CAM.u), ry: r1(1.25 * CAM.u * se), fill: 'url(#rm-spill)' }));
  }

  /* the roof, cut off level at knee height: the far (left) slope behind the floor */
  slope(-1);

  /* the floor: sheets drawn far to near, left to right, whatever order they arrive in */
  const sheets = [...SHEETS].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const s of sheets) {
    if (still && v < s.at) continue;
    const [px, py] = P(s.x0, s.y0, 0);
    // it slides in from the walkway's side (or, for a walkway sheet, from the manhole's)
    const slide = s.c === 0 ? D(0, 0.45, 0) : D(-Math.sign(s.c) * 0.45, 0, 0);
    out.push(el('use', still ? { href: '#rm-sheet', x: px, y: py } : { href: '#rm-sheet', x: px, y: py, class: v >= s.at ? 'rm-s on' : 'rm-s', 'data-at': s.at, style: `--dx:${slide[0]}px;--dy:${slide[1]}px` }));
  }
  /* things, far to near */
  const items = planItems().sort((a, b) => depth(a.x0 + a.w / 2, a.y0 + a.d / 2) - depth(b.x0 + b.w / 2, b.y0 + b.d / 2));
  for (const it of items) {
    if (still && v < it.at) continue;
    const [px, py] = P(it.x0, it.y0, F.z);
    out.push(el('use', still ? { href: '#' + it.id, x: px, y: py } : { href: '#' + it.id, x: px, y: py, class: v >= it.at ? 'rm-i on' : 'rm-i', 'data-at': it.at }));
  }

  /* the near (right) slope, in front of everything on the floor */
  slope(1);

  /* the near end and the near side, cut through */
  sectionEnd();
  sectionSide();

  const svg = el('svg', { class: 'room-svg', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false', 'data-v': v },
    el('defs', {}, defs.join('')) + out.join(''));
  return { svg, W, H, items };
}

/* ---------- CLI ---------- */
const args = process.argv.slice(2);
const START = '<!-- room:start -->', END = '<!-- room:end -->';
if (!args.length || args[0] === '--check') {
  const html = readFileSync(INDEX, 'utf8');
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < a) { console.error('index.html: room markers not found'); process.exit(1); }
  const indent = html.slice(html.lastIndexOf('\n', a) + 1, a);
  const { svg } = build({ v: 8 });
  const next = html.slice(0, a + START.length) + '\n' + indent + svg + '\n' + indent + html.slice(b);
  if (args[0] === '--check') {
    if (next !== html) { console.error('index.html: the room picture is out of date (run node scripts/room/build-room.mjs)'); process.exit(1); }
    console.log('room picture up to date');
  } else {
    writeFileSync(INDEX, next);
    console.log(`room picture written (${(svg.length / 1024).toFixed(1)} KB)`);
  }
} else if (args[0] === '--concept') {
  const v = Number(args[1] || 8);
  const o = args.indexOf('--out');
  const { svg, items } = build({ v, still: true });
  const file = o > 0 ? args[o + 1] : `room-${v}.svg`;
  writeFileSync(file, svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  console.log(file, items.filter((i) => i.at <= v).length, 'things');
} else if (args[0] === '--stats') {
  const { svg, items } = build({});
  console.log('bytes', svg.length, 'items', items.length, 'sheets', SHEETS.map((s) => s.at).join(' '));
  for (let v = 2; v <= 20; v++) {
    const on = items.filter((i) => i.at <= v);
    const boxes = on.reduce((n, i) => n + (i.id === 'rm-box2' ? 2 : 0), 0);
    console.log(v, 'm²', 'sheets', SHEETS.filter((s) => s.at <= v).length, 'things', on.length, 'boxes drawn', boxes, 'others', on.filter((i) => !/box/.test(i.id)).length);
  }
}
