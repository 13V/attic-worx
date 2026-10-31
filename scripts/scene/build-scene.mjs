#!/usr/bin/env node
/* Attic Worx: the "Get your garage back" cutaway (index.html #build), generated.

   Usage
     node scripts/scene/build-scene.mjs              write the scene into index.html, between
                                                    <!-- scene:start --> and <!-- scene:end -->
     node scripts/scene/build-scene.mjs --check      exit 1 if index.html is out of date
     node scripts/scene/build-scene.mjs --concept <state> [--frame wide|tall | --cam <x m>] [--carx <x m>]
                                    [--out file.svg]
                                                    a standalone still of one state (dusk | light |
                                                    floor | ladder | final), drawn exactly in 3D; --cam
                                                    frames it as the phone camera does (centre x, metres),
                                                    --carx puts the car anywhere (to check its motion)
   No dependencies. See scripts/scene/README.md.

   The picture is a section perspective: a single-storey Adelaide house cut front to back, seen from
   inside its roof space (one-point perspective, the eye 1.6 m above the new floor). The cut plane is
   z = 0; x runs from the street (left) to the back of the house, y is up, z goes into the picture along
   the ridge, so the trusses (600 mm centres) recede as a tunnel of A-frames. Everything is modelled in
   metres at real sizes and projected here; the SVG's units are centimetres of the cut plane.

   The story shows what changes, not how a floor is built: the floor simply appears and settles as one
   calm moment, with no framing stage, no sheets laid one by one and no batten grid.

   Motion: every moving part carries its window of the scroll (--a start, --l length, both in units of
   --p) and the travel it needs (SVG units, degrees, factors). styles.css computes every pose from
   --p. The geometry in the file is the finished state (floor down, things up, ladder away, car in,
   roller door down), which is what shows without JS or with reduced motion. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const INDEX = path.join(ROOT, 'index.html');

/* ---------- Timeline (units of --p). The captions' data-at values in index.html must match. ---------- */
/* Parts are authored on the DRAFT timeline (the story's first cut, which had a framing beat and a sheet-by-
   sheet beat between the light and the ladder) and mapped onto the real one piecewise linearly, knot by
   knot, so a beat can be given more or less of the scroll without retiming its parts. The floor's beat now
   spans the draft's 0.155..0.39. Pacing (1440x900, 430vh, the last 12% of the track a hold: about 2610px of
   scroll per unit of p): the scroll the old framing and sheet beats used goes to the light coming on, the
   floor's one moment, the carry and the car. No scrubbed move gets less than 0.04 of the draft (about 100px),
   and a ladder section's half turn gets 0.05 of it (the swing is the fastest thing on screen); the roller
   door and the garage light are timed transitions that start as the car stops (data-shut), like the
   flicker. */
export const BEATS = [
  { id: 'dusk', at: 0 },
  { id: 'light', at: 0.06 },
  { id: 'floor', at: 0.19 },
  { id: 'ladder', at: 0.31 },
  { id: 'store', at: 0.51 },
  { id: 'car', at: 0.8 },
];
const DRAFT = [0, 0.055, 0.155, 0.39, 0.57, 0.825, 1];
const REAL = BEATS.map((b) => b.at).concat(1);
function T_(p) {
  for (let i = 0; i < DRAFT.length - 1; i++) {
    if (p <= DRAFT[i + 1] || i === DRAFT.length - 2) return REAL[i] + ((p - DRAFT[i]) * (REAL[i + 1] - REAL[i])) / (DRAFT[i + 1] - DRAFT[i]);
  }
  return p;
}
const SHUT_AT = Math.round(T_(0.978) * 1000) / 1000;                      // the car stops: the door comes down, then the light settles
/* a window [a, a + l] on the draft timeline, on the real one */
const win = (a, l) => { const A = T_(a); return [A, T_(a + l) - A]; };
/* every time-like pair in a part's custom properties: start + length */
const TIMES = [['a', 'l'], ['b', 'k'], ['b', 'm'], ['c', 'm'], ['ra', 'rl']];
function retime(v) {
  const o = { ...v };
  for (const [s0, s1] of TIMES) {
    if (typeof v[s0] === 'number' && typeof v[s1] === 'number') { const [A, L] = win(v[s0], v[s1]); o[s0] = A; o[s1] = L; }
  }
  return o;
}

/* ---------- Camera ---------- */
const CAM = { vx: 4.55, vy: 4.6, f: 4.2 };        // vanishing point (m, in the cut plane), eye distance
const U = 100;                                      // SVG units per metre
const FRAMES = {
  wide: { x0: -2.7, x1: 10.3, y0: -0.6, y1: 6.6 },  // the whole cutaway
  tall: { x0: 0.9, x1: 6.3, y0: -0.4, y1: 5.9 },    // the garage column and the roof over it
};
const FRAME = FRAMES.wide;                          // the inline SVG's viewBox
const VBW = (FRAME.x1 - FRAME.x0) * U, VBH = (FRAME.y1 - FRAME.y0) * U;

const sOf = (z) => CAM.f / (CAM.f + z);
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
/** a world point (m) in SVG units */
/* (whole centimetres: under half a pixel even on a phone) */
function P(x, y, z) {
  const s = sOf(z);
  return [Math.round((CAM.vx + (x - CAM.vx) * s - FRAME.x0) * U), Math.round((FRAME.y1 - (CAM.vy + (y - CAM.vy) * s)) * U)];
}
const Praw = (x, y, z) => {
  const s = sOf(z);
  return [(CAM.vx + (x - CAM.vx) * s - FRAME.x0) * U, (FRAME.y1 - (CAM.vy + (y - CAM.vy) * s)) * U];
};
const fmt = (p) => `${p[0]} ${p[1]}`;
const poly = (list) => 'M' + list.map(fmt).join(' ') + 'Z';
const line = (list) => 'M' + list.map(fmt).join('L');
const rectXY = (x0, x1, y0, y1, z) => poly([P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)]);
const rectXZ = (x0, x1, y, z0, z1) => poly([P(x0, y, z0), P(x1, y, z0), P(x1, y, z1), P(x0, y, z1)]);
const rectYZ = (x, y0, y1, z0, z1) => poly([P(x, y0, z0), P(x, y1, z0), P(x, y1, z1), P(x, y0, z1)]);

/* ---------- Colour ---------- */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const mul = (a, k) => toHex(hex(a).map((v) => v * k));

const C = {
  band: '#0c2122',
  cut: '#117e79',
  brick: '#5f4236', concrete: '#77827e', render: '#a9a496',
  roomWall: '#a99476', roomFloor: '#6a4a33', sofa: '#36524e',
  pine: '#d39b5e', timber: '#cfa46e', board: '#d4cbb6', insul: '#dcc68c', sheetUnder: '#596867',
  kraft: '#bd915c', band2: '#5f8fb3', tub: '#d3dcd9', lid: '#117e79', tealtub: '#2b8a84',
  suitcase: '#4b7391', esky: '#e2e7e4', eskyLid: '#2f7d95', bin: '#2c5038', binLid: '#6f6532',
  car: '#c8d0ce', glass: '#1b3033', glassTop: '#2e4649', tyre: '#0b1213', rim: '#7d8c8a',
  amber: '#ffcf8a', warm: '#f6b866', mint: '#8fd6cc',
};

/* ---------- The house (m) ---------- */
const H = {
  front: -0.25, garage0: 0, garage1: 6.0, mid1: 6.11, back0: 9.1, back1: 9.35,
  ceil: 2.70, chord: 2.79, eaveL: -0.75, eaveR: 9.85, ridge: 4.55,
  garageDepth: 3.3, roomDepth: 4.2, roomFloor: 0.15,
  roofDepth: 7.8, gap: 0.6, insul: 2.9,
  door: { z0: 0.32, z1: 3.0, h: 2.12 },
};
const PITCH = 25;
const T = Math.tan((PITCH * Math.PI) / 180);
const yU = (x) => H.chord + (x <= H.ridge ? x - H.front : H.back1 - x) * T; // top chord, underside
const CH = 0.09 / Math.cos((PITCH * Math.PI) / 180);                       // top chord, vertical depth
const yO = (x) => yU(x) + CH + 0.07;                                         // roof sheet, outside

/* Floor: 19 mm sheets (2400 x 600) on plain framing timber, lifted clear of the batts (the timber shows only
   as the floor's edge at the cut) */
const F = { x0: 2.15, x1: 6.95, z0: 0, z1: 4.8, battenB: 2.88, battenT: 2.98, top: 3.0, row: 0.6 };
/* The manhole sits between the trusses at z 0.6 and 1.2 (no chord is cut), long side along x */
const HATCH = { x0: 4.05, x1: 5.05, z0: 0.64, z1: 1.16 };
/* Pull-down ladder: three sections in the plane z 0.67..1.13, hinged at the hatch's right end */
const LADDER = { hx: 5.05, hy: H.ceil, z0: 0.68, z1: 1.12, lens: [1.0, 1.0, 0.98], angle: 66.6 };
const LAMP = { x: 4.55, y: 4.42, z: 0.6 };

/* ---------- Markup helpers ---------- */
function el(tag, attrs, inner) {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  return inner === undefined ? `<${tag}${a}/>` : `<${tag}${a}>${inner}</${tag}>`;
}
const pth = (d, fill, extra = {}) => el('path', { d, fill, ...extra });
const vars = (o) => Object.entries(o).map(([k, v]) => `--${k}:${typeof v === 'number' ? r3(v) : v}`).join(';');
/* a moving part: <g class="m ..." style="--a..."> in the finished file; a plain group in a concept still.
   main.js gives each part its own --p, and only while the story is inside one of its windows (the
   pairs in TIMES): a part that isn't moving isn't restyled. */
let MODE = 'final';
function part(cls, v0, inner, extra = {}) {
  if (MODE !== 'final') return inner;
  const v = retime(v0);
  // a single shape carries the part itself (one element less to restyle)
  const one = /^<(path|ellipse|rect|circle)\b([^>]*)\/>$/.exec(inner);
  if (one && !/\b(class|style|opacity)=/.test(one[2])) return `<${one[1]} class="m ${cls}" style="${vars(v)}"${one[2]}/>`;
  return el('g', { class: `m ${cls}`, style: vars(v), ...extra }, inner);
}

/* Leaves that don't read --p, grouped so a part's --p write doesn't restyle them (.bs-in pins --p) */
const leaves = (html) => (MODE === 'final' && (html.match(/<(path|circle|rect|ellipse)\b/g) || []).length > 1 ? el('g', { class: 'bs-in' }, html) : html);

/* light from the work light, for surfaces in the roof (the finished, lit state) */
function lampK(x, y, z) {
  const d = Math.hypot(x - LAMP.x, (y - LAMP.y) * 1.2, z - LAMP.z);
  return Math.max(0.3, Math.min(1.06, 1.2 - d * 0.19));
}

/* ---------- Prisms ---------- */
/* an axis-aligned box: its visible faces, back to front, as [d, fill] */
function boxFaces(x0, x1, y0, y1, z0, z1, col, shade = {}) {
  const f = [];
  const top = shade.top ?? 1.1, side = shade.side ?? 0.8, front = shade.front ?? 0.94;
  if (y1 < CAM.vy) f.push([rectXZ(x0, x1, y1, z0, z1), mul(col, top)]);
  if (y0 > CAM.vy) f.push([rectXZ(x0, x1, y0, z0, z1), mul(col, 0.6)]);
  if (CAM.vx < x0) f.push([rectYZ(x0, y0, y1, z0, z1), mul(col, side)]);
  if (CAM.vx > x1) f.push([rectYZ(x1, y0, y1, z0, z1), mul(col, side)]);
  f.push([rectXY(x0, x1, y0, y1, z0), mul(col, front)]);
  return f;
}
const boxSVG = (...a) => boxFaces(...a).map(([d, fill]) => pth(d, fill)).join('');

/* ---------- Stored things ---------- */
/* one item at (x centre, y bottom, z centre): kraft, archive, tub, tealtub, case, upcase, esky */
const SIZE = {
  kraft: [0.5, 0.4, 0.42], kraftS: [0.44, 0.3, 0.38], archive: [0.42, 0.3, 0.34], tub: [0.62, 0.36, 0.42],
  tealtub: [0.62, 0.36, 0.42], case: [0.72, 0.26, 0.48], upcase: [0.46, 0.66, 0.26], esky: [0.62, 0.42, 0.4],
};
function item(kind, x, y, z, k = 1) {
  const [w, h, d] = SIZE[kind];
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2, y0 = y, y1 = y + h;
  const c = (col) => mul(col, k);
  const g = [];
  if (kind === 'kraft' || kind === 'kraftS' || kind === 'archive') {
    g.push(boxSVG(x0, x1, y0, y1, z0, z1, c(C.kraft)));
    if (y1 < CAM.vy) g.push(pth(rectXZ(x0, x1, y1, z0 + d * 0.45, z0 + d * 0.55), c(mix(C.kraft, '#efe2c4', 0.4))));
    if (kind === 'archive') {
      g.push(pth(rectXY(x0, x1, y0 + h * 0.3, y0 + h * 0.56, z0), c(C.band2)));
      g.push(pth(rectXY(x - w * 0.15, x + w * 0.15, y0 + h * 0.66, y0 + h * 0.8, z0), c(mul(C.kraft, 0.42))));
    } else {
      g.push(pth(rectXY(x0, x1, y1 - 0.035, y1, z0), c(mul(C.kraft, 0.86))));
    }
  } else if (kind === 'tub' || kind === 'tealtub') {
    const body = kind === 'tub' ? C.tub : C.tealtub;
    const lt = 0.05;
    g.push(boxSVG(x0 + 0.025, x1 - 0.025, y0, y1 - lt, z0 + 0.025, z1 - 0.025, c(body)));
    if (kind === 'tub') {
      g.push(pth(rectXY(x0 + 0.07, x0 + w * 0.46, y0 + 0.03, y0 + h * 0.58, z0 + 0.025), c(mix(C.tub, '#a17f5c', 0.5))));
      g.push(pth(rectXY(x0 + w * 0.5, x1 - 0.07, y0 + 0.03, y0 + h * 0.44, z0 + 0.025), c(mix(C.tub, '#6a8fa6', 0.45))));
    }
    g.push(boxSVG(x0, x1, y1 - lt, y1, z0, z1, c(kind === 'tub' ? C.lid : mul(C.tealtub, 0.82))));
  } else if (kind === 'case' || kind === 'upcase') {
    g.push(boxSVG(x0, x1, y0, y1, z0, z1, c(C.suitcase), { top: 1.12 }));
    if (kind === 'case') g.push(pth(rectXZ(x - w * 0.13, x + w * 0.13, y1, z0 + 0.04, z0 + 0.075), c('#2a4255')));
    else g.push(pth(rectXY(x - w * 0.2, x + w * 0.2, y1 - 0.06, y1 - 0.03, z0), c('#2a4255')));
    g.push(pth(rectXY(x0, x1, y0 + h * 0.46, y0 + h * 0.52, z0), c(mul(C.suitcase, 0.72))));
  } else if (kind === 'esky') {
    g.push(boxSVG(x0, x1, y0, y1 - 0.08, z0, z1, c(C.esky)));
    g.push(boxSVG(x0 - 0.012, x1 + 0.012, y1 - 0.08, y1, z0 - 0.012, z1 + 0.012, c(C.eskyLid)));
    g.push(pth(rectXY(x0 + 0.05, x0 + 0.13, y1 - 0.2, y1 - 0.13, z0), c(mul(C.eskyLid, 0.8))));
  }
  return g.join('');
}

/* Loads: what one trip up the ladder carries (a stack, bottom first). g = garage spot [x, z], r = place
   on the new floor [x, z]. Listed in carrying order. The garage empties a row at a time from the front, each
   row from the load nearest the ladder, so a load walking to the ladder's foot never passes behind or in
   front of one still waiting. The floor fills a row at a time from the far end, each row from the outside
   in, so a load set down never crosses one already there. The tall stacks go where the roof is high. */
const LOADS = [
  { stack: ['archive', 'archive'], g: [3.45, 0.4], r: [2.55, 2.9] },
  { stack: ['tealtub', 'tub'], g: [2.85, 0.45], r: [6.55, 2.9] },
  { stack: ['tub'], g: [2.12, 0.45], r: [3.3, 2.9] },
  { stack: ['upcase'], g: [1.42, 0.38], r: [5.75, 2.9] },
  { stack: ['esky'], g: [0.75, 0.42], r: [2.55, 2.25] },
  { stack: ['archive', 'archive'], g: [3.0, 1.5], r: [6.55, 2.25] },
  { stack: ['case', 'archive'], g: [2.3, 1.48], r: [3.3, 2.25] },
  { stack: ['kraft', 'kraftS'], g: [1.48, 1.45], r: [5.75, 2.25] },
  { stack: ['tub', 'tub'], g: [0.75, 1.43], r: [2.55, 1.6] },
  { stack: ['kraft', 'archive'], g: [2.55, 2.08], r: [6.55, 1.6] },
  { stack: ['tealtub'], g: [1.7, 2.05], r: [3.3, 1.6] },
  { stack: ['kraft', 'kraft', 'kraftS'], g: [0.82, 2.02], r: [5.75, 1.6] },
];
const loadH = (L) => L.stack.reduce((s, k) => s + SIZE[k][1], 0);
const loadW = (L) => Math.max(...L.stack.map((k) => SIZE[k][0]));
const loadD = (L) => Math.max(...L.stack.map((k) => SIZE[k][2]));
/* a contact shadow on the floor under a footprint: faint, and only a centimetre or two past the box's edges,
   so it seats the box without reading as a dark plate (one element: it's restyled while its load moves) */
const shade = (x, y, z, w, d, o = 0.16) => pth(rectXZ(x - w / 2 - 0.015, x + w / 2 + 0.015, y + 0.002, z - d / 2 - 0.008, z + d / 2 + 0.02), '#020a0b', { 'fill-opacity': o, class: 'bs-shade' });
function loadSVG(L, x, y0, z, k) {
  let y = y0;
  return L.stack.map((kind) => { const s = item(kind, x, y, z, k); y += SIZE[kind][1]; return s; }).join('');
}
/* paint order: deeper first; at the same depth, the one nearer the eye's x (the vanishing point) last */
function paintOrder(list) {
  return list.slice().sort((a, b) => (b.z - a.z) || (Math.abs(b.x - CAM.vx) - Math.abs(a.x - CAM.vx)));
}

/* the journey up: garage spot -> ladder foot -> up the ladder -> through the hatch -> its place */
const ROUTE = { foot: [3.62, 0.42, 0.9], top: [4.5, 2.58, 0.9], out: [4.55, 3.06, 0.9] };

/* ---------- The car (an SUV), side profile in m: x from the rear bumper, y up ---------- */
function arcPts(cx, cy, r, a0, a1, n) {
  const o = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return o;
}
/* clockwise in y-up coordinates: up the back, along the roof to the front, down the nose, back along the
   sills (over the wheel arches) */
const CAR = {
  len: 4.6, wid: 1.84, wheelR: 0.355, wheels: [0.93, 3.66],
  profile: [
    [0.03, 0.4], [0.0, 0.66], [0.03, 0.98], [0.12, 1.1], [0.24, 1.5], [0.46, 1.66], [2.6, 1.68],
    [3.36, 1.17], [4.3, 1.03], [4.54, 0.93], [4.6, 0.66], [4.57, 0.4],
    ...arcPts(3.66, 0.36, 0.45, 0, 180, 9).slice(0),
    [2.7, 0.34], [1.85, 0.34],
    ...arcPts(0.93, 0.36, 0.45, 0, 180, 9),
  ],
  windows: [
    [[0.38, 1.12], [0.5, 1.5], [1.4, 1.55], [1.4, 1.12]],
    [[1.5, 1.12], [1.5, 1.555], [2.5, 1.565], [3.0, 1.15]],
  ],
  inX: 0.5, inZ: 0.38, outX: -5.25, // rear bumper x in the garage and on the driveway; near side z
};
/* the car's faces, split into planes so each can follow the drive in exactly:
   side (the near side, a plane parallel to the picture: translates), tops (horizontal or sloped planes
   facing up: translate and shear), nose (the front face, only seen while the car is left of the eye:
   narrows away). Returned per plane with the reference height used for the shear. */
/* The car recedes less steeply than the rest (an illustrator's cheat: at this eye height its roof would
   fill the frame). Its near side is true to the scene; across its width it uses a longer lens (CAR_F).
   Shears derived for the drive in hold for any lens. */
const CAR_F = 10;
function PC(x, y, z, z0) {
  const s = sOf(z0) * (CAR_F / (CAR_F + (z - z0)));
  return [Math.round((CAM.vx + (x - CAM.vx) * s - FRAME.x0) * U), Math.round((FRAME.y1 - (CAM.vy + (y - CAM.vy) * s)) * U)];
}
/* The car's planes at a position (rear bumper at x = cx, near side at z = cz). faces: the extruded
   faces that face the eye there, plus the nose (the front face) wherever it is, flagged; each with its
   3D corners so its motion can be worked out. side: everything in the near side's plane. */
function carParts(cx, cz) {
  const z0 = cz, z1 = cz + CAR.wid;
  const P = (x, y, z) => PC(x, y, z, z0);
  const pr = CAR.profile.map(([x, y]) => [x + cx, y]);
  const faces = [];
  for (let i = 0; i < pr.length; i++) {
    const a = pr[i], b = pr[(i + 1) % pr.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const L = Math.hypot(ex, ey);
    if (L < 1e-6) continue;
    const nx = -ey / L, ny = ex / L;                         // outward (clockwise, y up)
    const midx = (a[0] + b[0]) / 2 - cx;
    const nose = nx > 0.8 && midx > 4.4;
    const vis = (CAM.vx - a[0]) * nx + (CAM.vy - a[1]) * ny > 0;
    if (!vis && !nose) continue;
    const glass = (midx > 2.62 && midx < 3.34) || (midx > 0.1 && midx < 0.44 && ny > 0.3);
    const fill = nose ? mul(C.car, 0.66) : glass ? C.glassTop : ny > 0.6 ? mix(C.car, '#e9f1f0', 0.45) : ny > 0.2 ? mul(C.car, 0.95) : mul(C.car, 0.72);
    faces.push({ v: [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], fill, nose, vis });
  }
  faces.sort((f, g) => (f.nose ? 0 : 1) - (g.nose ? 0 : 1));
  const shadow = { v: [[cx + 0.1, 0.004, z0 + 0.05], [cx + 4.5, 0.004, z0 + 0.05], [cx + 4.4, 0.004, z1 - 0.05], [cx + 0.2, 0.004, z1 - 0.05]], fill: '#020a0b' };
  const side = [];
  const Q = (pts) => poly(pts.map(([x, y]) => P(x + cx, y, z0)));
  // the near side: shaded from the shoulder down (bs-carside), dark wheel arches, a crease, the sills
  side.push(pth(poly(pr.map(([x, y]) => P(x, y, z0))), 'url(#bs-carside)'));
  side.push(pth(CAR.wheels.map((wx) => Q(arcPts(wx, 0.36, 0.44, -14, 194, 12))).join(''), '#0c1516'));
  side.push(pth(Q([[0.1, 0.995], [4.42, 0.995], [4.45, 0.965], [0.08, 0.965]]), mul(C.car, 1.04)));
  side.push(pth(Q([[0.1, 0.965], [4.45, 0.965], [4.47, 0.945], [0.08, 0.945]]), mul(C.car, 0.62)));
  side.push(pth(Q([[1.4, 0.36], [2.62, 0.36], [2.64, 0.47], [1.38, 0.47]]), mul(C.car, 0.4)));
  // door shuts and handles
  side.push(pth(Q([[1.43, 0.42], [1.455, 0.42], [1.455, 1.12], [1.43, 1.12]]) + Q([[2.66, 0.44], [2.685, 0.44], [2.97, 1.12], [2.945, 1.12]]), mul(C.car, 0.55)));
  side.push(pth(Q([[1.12, 0.9], [1.3, 0.9], [1.3, 0.87], [1.12, 0.87]]) + Q([[2.3, 0.9], [2.48, 0.9], [2.48, 0.87], [2.3, 0.87]]), mul(C.car, 0.45)));
  // glass, with the dusk sky caught in it
  for (const w of CAR.windows) side.push(pth(Q(w), C.glass));
  side.push(pth(Q([[0.72, 1.13], [0.95, 1.13], [1.17, 1.53], [0.94, 1.52]]) + Q([[1.86, 1.13], [2.16, 1.13], [2.4, 1.555], [2.1, 1.553]]), '#35575a'));
  side.push(pth(Q([[1.0, 1.13], [1.07, 1.13], [1.29, 1.54], [1.22, 1.54]]) + Q([[2.22, 1.13], [2.28, 1.13], [2.48, 1.5], [2.44, 1.52]]), '#2a4649'));
  side.push(pth(Q([[0.03, 0.98], [0.22, 1.02], [0.2, 0.86], [0.03, 0.84]]), '#7a2c24'));
  side.push(pth(Q([[4.36, 0.86], [4.56, 0.84], [4.58, 0.74], [4.34, 0.77]]), '#e8e0cc'));
  // the garage light, once on, catches the roof's edge
  side.push(el('path', { class: 'bs-rim', d: Q([[0.47, 1.655], [2.58, 1.672], [2.5, 1.64], [0.52, 1.628]]), fill: '#e3f4ee', opacity: 0.8 }));
  const wheels = CAR.wheels.map((wx) => {
    const c = P(wx + cx, CAR.wheelR, z0);
    const r = CAR.wheelR * sOf(z0) * U;
    let spokes = '';
    for (let k = 0; k < 5; k++) {
      const an = (k * 72 * Math.PI) / 180;
      spokes += `M${r1(c[0])} ${r1(c[1])}L${r1(c[0] + Math.cos(an) * r * 0.5)} ${r1(c[1] + Math.sin(an) * r * 0.5)}`;
    }
    return { c, r, svg: el('circle', { cx: c[0], cy: c[1], r: r1(r), fill: C.tyre }) + el('circle', { cx: c[0], cy: c[1], r: r1(r * 0.6), fill: mul(C.rim, 0.85) }) + pth(spokes, 'none', { stroke: mul(C.rim, 0.55), 'stroke-width': r1(r * 0.12), 'stroke-linecap': 'round' }) };
  });
  const faceD = (f) => poly(f.v.map(([x, y, z]) => P(x, y, z)));
  return { faces, shadow, faceD, side: side.join(''), wheels };
}
function carStill(cx, cz) {
  const c = carParts(cx, cz);
  return pth(c.faceD(c.shadow), c.shadow.fill, { opacity: 0.38 }) + c.faces.filter((f) => f.vis).map((f) => pth(c.faceD(f), f.fill)).join('') + c.side + c.wheels.map((w) => w.svg).join('');
}
/* How a plane of the car moves when the car moves along x by D metres: each point shifts by D * s, where s
   is its scale, and on a plane s is an affine function of the point's own screen position. So the move is
   an exact affine map, linear in D: matrix(1 + D*mx, 0, D*my, 1, D*m0, 0) in SVG units. */
function carMotion(v, z0) {
  const pts = v.map(([x, y, z]) => ({ X: Praw2(x, y, z, z0), s: sOf(z0) * (CAR_F / (CAR_F + (z - z0))) }));
  // the three corners spanning the largest triangle on screen
  let best = null;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) for (let k = j + 1; k < pts.length; k++) {
    const [A, B, Cc] = [pts[i], pts[j], pts[k]];
    const area = Math.abs((B.X[0] - A.X[0]) * (Cc.X[1] - A.X[1]) - (Cc.X[0] - A.X[0]) * (B.X[1] - A.X[1]));
    if (!best || area > best.area) best = { area, A, B, Cc };
  }
  if (best.area < 1) { const s = pts.reduce((t, p) => t + p.s, 0) / pts.length; return { mx: 0, my: 0, m0: s * U }; }
  const { A, B, Cc } = best;
  // solve s = c0 + cx X + cy Y
  const det = (B.X[0] - A.X[0]) * (Cc.X[1] - A.X[1]) - (Cc.X[0] - A.X[0]) * (B.X[1] - A.X[1]);
  const cx = ((B.s - A.s) * (Cc.X[1] - A.X[1]) - (Cc.s - A.s) * (B.X[1] - A.X[1])) / det;
  const cy = ((B.X[0] - A.X[0]) * (Cc.s - A.s) - (Cc.X[0] - A.X[0]) * (B.s - A.s)) / det;
  const c0 = A.s - cx * A.X[0] - cy * A.X[1];
  return { mx: cx * U, my: cy * U, m0: c0 * U };
}
function Praw2(x, y, z, z0) {
  const s = sOf(z0) * (CAR_F / (CAR_F + (z - z0)));
  return [(CAM.vx + (x - CAM.vx) * s - FRAME.x0) * U, (FRAME.y1 - (CAM.vy + (y - CAM.vy) * s)) * U];
}

/* ---------- Pieces of the roof ---------- */
function Apath(z) {
  return poly([P(H.front, H.chord, z), P(H.ridge, yU(H.ridge) + CH, z), P(H.back1, H.chord, z)]);
}
/* one truss's front face at depth z: top chords, posts, struts */
function trussPath(z, cut) {
  const parts = [];
  const xl = cut ? H.eaveL : H.front, xr = cut ? H.eaveR : H.back1;
  parts.push(poly([P(xl, yU(xl), z), P(H.ridge, yU(H.ridge), z), P(H.ridge, yU(H.ridge) + CH, z), P(xl, yU(xl) + CH, z)]));
  parts.push(poly([P(H.ridge, yU(H.ridge), z), P(xr, yU(xr), z), P(xr, yU(xr) + CH, z), P(H.ridge, yU(H.ridge) + CH, z)]));
  const w = 0.045;
  for (const px of [1.95, 7.15]) parts.push(rectXY(px - w, px + w, H.chord, yU(px) + 0.02, z));
  const strut = (x0, x1) => {
    const ya = H.chord, yb = yU(x1) - 0.04;
    const dx = x1 - x0, dy = yb - ya, L = Math.hypot(dx, dy);
    const nx = (-dy / L) * w, ny = (dx / L) * w;
    return poly([P(x0 - nx, ya - ny, z), P(x0 + nx, ya + ny, z), P(x1 + nx, yb + ny, z), P(x1 - nx, yb - ny, z)]);
  };
  parts.push(strut(0.45, 1.95), strut(8.65, 7.15));
  if (cut) parts.push(rectXY(H.front, H.back1, H.chord - 0.09, H.chord, z));
  return parts.join('');
}

/* the ladder, open: [ [svg of the section, hinge point (m)] ] for the three sections, top first */
function ladderSections() {
  const a = (LADDER.angle * Math.PI) / 180;
  const ux = -Math.cos(a), uy = -Math.sin(a);              // down the ladder (down-left)
  const nx = -uy, ny = ux;                                 // across it (up-left)
  const zN = LADDER.z0, zF = LADDER.z1, sw = 0.085;
  const out = [];
  let t0 = 0;
  LADDER.lens.forEach((L, i) => {
    const hx = LADDER.hx + ux * t0, hy = LADDER.hy + uy * t0;
    const q = (o0, o1, la, lb, z) => poly([P(hx + ux * la + nx * o0, hy + uy * la + ny * o0, z), P(hx + ux * lb + nx * o0, hy + uy * lb + ny * o0, z), P(hx + ux * lb + nx * o1, hy + uy * lb + ny * o1, z), P(hx + ux * la + nx * o1, hy + uy * la + ny * o1, z)]);
    const g = [];
    if (i === 0) g.push(pth(q(-sw / 2 - 0.035, -sw / 2 - 0.005, 0, L, 0.9), '#e4e9e6'));  // the lid
    g.push(pth(q(-sw / 2, sw / 2, 0.01, L - 0.01, zF), mul(C.pine, 0.6)));                // far stile
    for (let t = 0.13; t < L - 0.04; t += 0.245) {
      const x = hx + ux * t, y = hy + uy * t;
      g.push(pth(poly([P(x - 0.04, y + 0.012, zN), P(x + 0.04, y + 0.012, zN), P(x + 0.04, y + 0.012, zF), P(x - 0.04, y + 0.012, zF)]), mul(C.pine, 1.05)));
    }
    g.push(pth(q(-sw / 2, sw / 2, 0.01, L - 0.01, zN), C.pine));                           // near stile
    if (i < 2) g.push(pth(q(-0.03, 0.03, L - 0.04, L + 0.02, zN), '#56605e'));             // hinge
    out.push({ svg: g.join(''), hinge: [hx, hy], z: (zN + zF) / 2 });
    t0 += L;
  });
  return out;
}

/* the step ladder standing open under the manhole (for concept stills) */
function stepOpen() {
  const zN = 0.74, zF = 1.08, L = 1.75, w = 0.05, tilt = (12.5 * Math.PI) / 180;
  const top = [4.05 + L * Math.sin(tilt), L * Math.cos(tilt)];
  const leg = (sgn, z, fill) => {
    const d = [sgn * Math.sin(tilt), -Math.cos(tilt)], n = [-d[1], d[0]];
    const pts = [[0, 0], [L, 0], [L, w], [0, w]].map(([t, o]) => [top[0] + d[0] * t + n[0] * (o - w / 2), top[1] + d[1] * t + n[1] * (o - w / 2)]);
    return pth(poly(pts.map(([x, y]) => P(x, y, z))), fill);
  };
  const metal = '#b7c2c0';
  let g = leg(1, zF, mul(metal, 0.6)) + leg(1, zN, mul(metal, 0.8)) + leg(-1, zF, mul(metal, 0.62));
  for (let k = 1; k <= 5; k++) {
    const t = L - k * 0.29, x = top[0] - Math.sin(tilt) * t, y = top[1] - Math.cos(tilt) * t;
    g += pth(poly([P(x - 0.06, y, zN), P(x + 0.04, y, zN), P(x + 0.04, y, zF), P(x - 0.06, y, zF)]), mul(metal, 1.12));
  }
  return g + leg(-1, zN, metal);
}

/* ---------- The scene ---------- */
const STATES = {
  dusk: { light: 0, sheets: 0, ladder: 0, things: 'garage', car: 'out', door: 0, garageLight: 0 },
  light: { light: 1, sheets: 0, ladder: 0, things: 'garage', car: 'out', door: 0, garageLight: 0 },
  floor: { light: 1, sheets: 1, ladder: 0, things: 'garage', car: 'out', door: 0, garageLight: 0 },
  ladder: { light: 1, sheets: 99, ladder: 1, things: 'garage', car: 'out', door: 0, garageLight: 0 },
  final: { light: 1, sheets: 99, ladder: 0, things: 'roof', car: 'in', door: 1, garageLight: 1 },
};

function scene(state) {
  const out = [];
  const add = (s) => out.push(s);
  const fin = MODE === 'final';
  const G0 = H.garage0, G1 = H.garage1, GD = H.garageDepth, DR = H.door;
  const yCut = r1(Praw(0, H.ceil - 0.013, 0)[1]);   // the ceiling's cut line on screen (SVG y): garage below, roof above
  const doorX = G0 + 0.03;                           // the roller door's plane

  const defs = [
    `<linearGradient id="bs-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c2122"/><stop offset=".55" stop-color="#11292a"/><stop offset="1" stop-color="#1c3a3a"/></linearGradient>`,
    `<radialGradient id="bs-dusk"><stop offset="0" stop-color="#e3a35e" stop-opacity=".3"/><stop offset=".45" stop-color="#e3a35e" stop-opacity=".08"/><stop offset="1" stop-color="#e3a35e" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="bs-ground" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#152e2e"/><stop offset=".7" stop-color="#11292a"/><stop offset="1" stop-color="#1a3838"/></linearGradient>`,
    `<radialGradient id="bs-warm"><stop offset="0" stop-color="#ffd291" stop-opacity=".55"/><stop offset="1" stop-color="#ffd291" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="bs-glow"><stop offset="0" stop-color="#fff3d6" stop-opacity=".9"/><stop offset=".1" stop-color="${C.amber}" stop-opacity=".5"/><stop offset=".42" stop-color="${C.warm}" stop-opacity=".14"/><stop offset="1" stop-color="${C.warm}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="bs-spill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.amber}" stop-opacity=".34"/><stop offset=".6" stop-color="${C.amber}" stop-opacity=".1"/><stop offset="1" stop-color="${C.amber}" stop-opacity=".03"/></linearGradient>`,
    `<linearGradient id="bs-dark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#051316" stop-opacity=".3"/><stop offset=".35" stop-color="#051316" stop-opacity=".62"/><stop offset="1" stop-color="#051316" stop-opacity=".7"/></linearGradient>`,
    `<linearGradient id="bs-beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fdf6e3" stop-opacity=".34"/><stop offset=".55" stop-color="#fdf6e3" stop-opacity=".1"/><stop offset="1" stop-color="#fdf6e3" stop-opacity=".02"/></linearGradient>`,
    `<linearGradient id="bs-wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdf6e3" stop-opacity="0"/><stop offset=".5" stop-color="#fdf6e3" stop-opacity=".22"/><stop offset="1" stop-color="#fdf6e3" stop-opacity=".05"/></linearGradient>`,
    `<linearGradient id="bs-tube" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.mint}" stop-opacity=".2"/><stop offset="1" stop-color="${C.mint}" stop-opacity="0"/></linearGradient>`,
    // the car's near side: lit along the shoulder by the dusk sky, darker down to the sills
    `<linearGradient id="bs-carside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mul(C.car, 1.0)}"/><stop offset=".4" stop-color="${mul(C.car, 0.9)}"/><stop offset=".44" stop-color="${mul(C.car, 0.78)}"/><stop offset="1" stop-color="${mul(C.car, 0.5)}"/></linearGradient>`,
    `<linearGradient id="bs-hole" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#170f08" stop-opacity=".25"/><stop offset="1" stop-color="#0b0806" stop-opacity=".85"/></linearGradient>`,
    // the carry: a load is the garage copy below the ceiling's cut line and the roof copy above it
    `<clipPath id="bs-below"><rect x="-1600" y="${yCut}" width="${r1(VBW + 3200)}" height="${r1(VBH + 400 - yCut)}"/></clipPath>`,
    `<clipPath id="bs-above"><rect x="-1600" y="-400" width="${r1(VBW + 3200)}" height="${r1(yCut + 400)}"/></clipPath>`,
    `<clipPath id="bs-doorway"><path d="${rectYZ(doorX, 0, DR.h, DR.z0, DR.z1)}"/></clipPath>`,
  ];
  add('<defs>' + defs.join('') + '</defs>');

  /* ----- Outside: sky, dusk, ground, the street ----- */
  const hz = P(0, CAM.vy, 1e6)[1];
  // sky and ground run well past the frame: wide stages show more of the street (the SVG paints outside its viewBox)
  add(el('rect', { x: -1600, width: r1(VBW + 3200), height: r1(hz), fill: 'url(#bs-sky)' }));
  add(el('ellipse', { cx: r1(VBW * 0.08), cy: r1(hz), rx: r1(VBW * 0.42), ry: 210, fill: 'url(#bs-dusk)' }));
  add(el('rect', { x: -1600, y: r1(hz), width: r1(VBW + 3200), height: r1(VBH - hz), fill: 'url(#bs-ground)' }));
  // the street beyond: a low line of rooftops and trees on the horizon, a few lights on
  {
    const hzY = hz;
    const sil = [[-1600, 0], [-1600, -12], [-1300, -14], [-1250, -30], [-1190, -14], [-900, -13], [-860, -22], [-800, -12], [-500, -14], [-460, -27], [-420, -14], [-200, -12], [-150, -20], [-100, -12], [0, -12], [60, -14], [95, -26], [130, -14], [210, -14], [240, -24], [262, -30], [290, -22], [330, -16], [400, -16], [430, -28], [470, -16], [520, -15], [560, -9], [600, -9], [600, 0]];
    add(pth(poly(sil.map(([x, y]) => [x, r1(hzY + y)])), '#0a1d1e'));
    for (const [x, y] of [[150, -10], [380, -9], [505, -8]]) add(el('rect', { x, y: r1(hzY + y), width: 7, height: 4, fill: '#d9a964', opacity: 0.6 }));
    for (const [x, y, r] of [[40, -16, 3], [300, -20, 2.5], [560, -12, 2]]) add(el('circle', { cx: x, cy: r1(hzY + y), r, fill: '#f2c27b', opacity: 0.75 }));
    const back = [[880, 0], [880, -8], [940, -10], [975, -24], [1010, -11], [1090, -12], [1110, -34], [1135, -46], [1165, -40], [1190, -26], [1230, -14], [1300, -16], [1500, -14], [1560, -30], [1620, -14], [1900, -13], [1960, -24], [2010, -12], [2400, -12], [2900, -12], [2900, 0]];
    add(pth(poly(back.map(([x, y]) => [x, r1(hzY + y)])), '#0a1d1e'));
    add(el('rect', { x: 1060, y: r1(hzY - 8), width: 7, height: 4, fill: '#d9a964', opacity: 0.5 }));
  }
  // the side fence (Colorbond) past the back corner
  add(pth(poly([P(11.2, 0, 0), P(11.2, 1.8, 0), P(11.2, 1.8, 200), P(11.2, 0, 200)]), '#14292a'));
  for (let z = 0; z < 60; z += 2.4) add(pth(rectYZ(11.19, 0, 1.8, z, z + 0.05), '#0f2223'));
  // the footpath and kerb along the street (they run into the picture), the driveway out to them with its
  // control joints, and on its far side a low hedge and a brick letterbox pier
  add(pth(poly([P(-8.25, 0, 0), P(-6.6, 0, 0), P(-6.6, 0, 80), P(-8.25, 0, 80)]), '#1d3534'));
  add(pth(poly([P(-8.45, 0, 0), P(-8.25, 0, 0), P(-8.25, 0, 80), P(-8.45, 0, 80)]), '#2e4a49'));
  add(pth(poly([P(-30, 0, DR.z0 - 0.1), P(H.front, 0, DR.z0 - 0.1), P(H.front, 0, DR.z1 + 0.1), P(-30, 0, DR.z1 + 0.1)]), '#223a3a'));
  add(pth(rectXZ(-8.25, -6.6, 0.001, DR.z0 - 0.1, DR.z1 + 0.1), '#29403f'));
  add(pth([-1.95, -3.75, -5.55].map((x) => rectXZ(x - 0.014, x + 0.014, 0.002, DR.z0 - 0.1, DR.z1 + 0.1)).join('') + rectXZ(-6.6, H.front, 0.002, 1.65, 1.674), '#192f2f'));
  add(boxSVG(-6.1, -0.45, 0, 0.62, 3.32, 3.78, '#173029'));
  add(boxSVG(-6.5, -6.12, 0, 1.0, 3.3, 3.62, '#4f382e'));
  add(boxSVG(-6.54, -6.08, 1.0, 1.06, 3.26, 3.66, '#6d5f52'));
  add(pth(rectXY(-6.4, -6.22, 0.74, 0.79, 3.299), '#1b1512'));

  /* ----- The room beside the garage: a lamp on beside the sofa, the dusk through its window ----- */
  const R0 = H.mid1, R1 = H.back0, RD = H.roomDepth, RF = H.roomFloor;
  add(pth(rectXZ(R0, R1, RF, 0, RD), C.roomFloor));
  add(pth(rectXY(R0, R1, RF, H.ceil, RD), mul(C.roomWall, 0.82)));
  add(pth(rectYZ(R1, RF, H.ceil, 0, RD), mul(C.roomWall, 0.7)));
  // a window in the side wall (the dusk and the fence outside), a rug, the sofa, a side table and its lamp
  add(pth(rectYZ(R1 - 0.01, 0.92, 2.02, 0.4, 1.6), '#2b4f52'));
  add(pth(rectYZ(R1 - 0.011, 0.92, 1.3, 0.4, 1.6), '#16302f'));
  add(pth(rectYZ(R1 - 0.012, 0.92, 2.02, 0.98, 1.02), mul(C.roomWall, 0.5)));
  add(pth(rectYZ(R1 - 0.012, 0.9, 0.95, 0.35, 1.65), mul(C.roomWall, 0.55)));
  add(pth(rectXZ(6.75, 8.15, RF + 0.003, 1.95, 3.75), '#55473a'));
  add(pth(rectXZ(6.87, 8.03, RF + 0.004, 2.07, 3.63), '#625243'));
  {
    const sf = C.sofa, top = RF + 0.42;
    add(boxSVG(8.82, 9.06, RF, RF + 0.86, 2.2, 3.95, mul(sf, 0.86), { side: 0.9 }));      // the back
    add(boxSVG(8.3, 9.06, RF, RF + 0.62, 3.77, 3.95, mul(sf, 0.95)));                      // far arm
    add(boxSVG(8.32, 8.84, RF + 0.08, top, 2.38, 3.77, sf));                               // seat base
    add(boxSVG(8.36, 8.84, top, top + 0.09, 2.42, 3.06, mix(sf, '#d8e3df', 0.14)));       // cushions
    add(boxSVG(8.36, 8.84, top, top + 0.09, 3.1, 3.74, mix(sf, '#d8e3df', 0.1)));
    add(boxSVG(8.74, 8.86, top + 0.09, top + 0.42, 2.9, 3.28, '#c78e57', { side: 0.85 }));   // a throw cushion
    add(boxSVG(8.3, 9.06, RF, RF + 0.62, 2.2, 2.38, mul(sf, 0.95)));                       // near arm
    add(boxSVG(8.6, 9.04, RF, RF + 0.55, 1.72, 2.1, '#5b4130', { side: 0.72 }));           // side table
    const lg = P(8.82, 1.08, 1.91);
    add(el('ellipse', { cx: lg[0], cy: lg[1], rx: 175, ry: 160, fill: 'url(#bs-warm)' }));
    add(boxSVG(8.79, 8.85, RF + 0.55, RF + 0.84, 1.88, 1.94, '#2a2522'));
    add(boxSVG(8.66, 8.98, RF + 0.82, RF + 1.07, 1.76, 2.06, '#ecd3a2'));
  }

  /* ----- The garage: slab, walls, the roller door, what stays ----- */
  add(pth(rectXZ(G0, G1, 0, 0, GD), C.concrete));
  add(pth(rectXY(G0, G1, 0, H.ceil, GD), C.brick));
  add(pth(rectYZ(G0, 0, H.ceil, DR.z1, GD), mul(C.brick, 0.85)));
  add(pth(rectYZ(G0, DR.h, H.ceil, DR.z0, DR.z1), mul(C.brick, 0.85)));
  // (the wall beside the door, nearest the cut, is drawn after the car: the car passes behind it)
  add(pth(rectYZ(G1, 0, H.ceil, 0, GD), mul(C.render, 0.7)));
  add(pth(rectYZ(G1, 0.15, 2.19, 2.25, 3.05), mul('#bdb5a3', 0.62)));
  // the roller door: a curtain of slats in the doorway, drawn down. CSS rolls it up into the drum and lets it
  // down: on the door's plane a rise is an exact vertical shear (matrix b0, f0, like the car's planes)
  {
    let slats = '';
    for (let i = 0; i < 10; i++) {
      const y1 = DR.h - (i * DR.h) / 10, y0 = y1 - DR.h / 10 + 0.012;
      slats += pth(rectYZ(doorX, y0, y1, DR.z0, DR.z1), mul('#8e9a97', 0.82 - i * 0.012));
    }
    const up = DR.h + 0.03, kx = doorX - CAM.vx;
    if (fin) add(el('g', { 'clip-path': 'url(#bs-doorway)' }, el('g', { class: 'bs-door', style: `--b0:${Math.round((-up / kx) * 1e5) / 1e5};--f0:${r1((-up * U * (FRAME.x0 - CAM.vx)) / kx)}` }, slats)));
    else if (state.door) add(slats);
  }
  add(boxSVG(0.04, 0.42, 2.16, 2.52, DR.z0 - 0.04, DR.z1 + 0.04, '#3b4847'));  // the drum
  // shelving on the back wall (stays), a bike (stays), a wheelie bin (stays)
  add(pth(rectXY(4.45, 5.85, 0, 1.85, GD - 0.02), '#2b3736'));
  for (const ux of [4.45, 5.81]) add(boxSVG(ux, ux + 0.04, 0, 1.85, GD - 0.4, GD - 0.36, '#55625f'));
  for (const sy of [0.06, 0.64, 1.22, 1.8]) add(boxSVG(4.45, 5.85, sy - 0.03, sy, GD - 0.4, GD, '#55625f'));
  for (const [x0, x1, y0, h, col] of [[4.6, 5.0, 0.64, 0.28, '#8d7b5b'], [5.1, 5.7, 0.64, 0.22, '#58808b'], [4.7, 5.4, 1.22, 0.3, '#7b6a52'], [5.45, 5.75, 1.22, 0.2, '#a4a99c'], [4.6, 5.2, 0.06, 0.38, '#46524f']]) add(boxSVG(x0, x1, y0, y0 + h, GD - 0.36, GD - 0.06, col));
  {
    // the bike against the back wall, in flat shapes: tyres as rings, tubes as bars
    const bz = GD - 0.22, bs = sOf(bz) * U;
    const ring = (x, y, r, w) => {
      const c = Praw(x, y, bz);
      const circ = (rr) => `M${r1(c[0] - rr)} ${r1(c[1])}a${r1(rr)} ${r1(rr)} 0 1 0 ${r1(2 * rr)} 0a${r1(rr)} ${r1(rr)} 0 1 0 ${r1(-2 * rr)} 0Z`;
      return circ(r * bs) + circ((r - w) * bs);
    };
    const bar = (a, b, w) => {
      const p = Praw(a[0], a[1], bz), q = Praw(b[0], b[1], bz);
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), nx = (-dy / L) * w * bs * 0.5, ny = (dx / L) * w * bs * 0.5;
      return `M${r1(p[0] + nx)} ${r1(p[1] + ny)}L${r1(q[0] + nx)} ${r1(q[1] + ny)}L${r1(q[0] - nx)} ${r1(q[1] - ny)}L${r1(p[0] - nx)} ${r1(p[1] - ny)}Z`;
    };
    const Rh = [1.25, 0.34], BB = [1.72, 0.32], S = [1.6, 0.84], Ht = [2.06, 0.86], Hb = [2.11, 0.72], Fh = [2.35, 0.34];
    add(pth(ring(1.25, 0.34, 0.33, 0.055) + ring(2.35, 0.34, 0.33, 0.055), '#162322', { 'fill-rule': 'evenodd' }));
    add(pth([bar(Rh, BB, 0.035), bar(Rh, S, 0.03), bar(BB, [1.57, 0.93], 0.042), bar(S, Ht, 0.04), bar(BB, Hb, 0.05), bar(Hb, Ht, 0.055), bar(Hb, Fh, 0.036), bar(Ht, [2.02, 0.97], 0.032), bar([1.97, 0.985], [2.2, 0.99], 0.032)].join(''), '#2f6474'));
    add(pth(bar([1.45, 0.955], [1.69, 0.965], 0.05) + ring(1.72, 0.32, 0.075, 0.075) + ring(1.25, 0.34, 0.035, 0.035) + ring(2.35, 0.34, 0.035, 0.035), '#1a2827'));
  }
  add(boxSVG(5.3, 5.85, 0, 0.95, 2.28, 2.84, C.bin));
  add(boxSVG(5.28, 5.87, 0.95, 1.02, 2.26, 2.86, C.binLid));

  /* ----- The roof space: sheeting undersides, batts, roof battens, trusses (far first) ----- */
  const RZ = H.roofDepth, L = state.light, bays = Math.round(RZ / H.gap);
  add(pth(poly([P(H.front, H.chord, RZ), P(H.ridge, yU(H.ridge), RZ), P(H.back1, H.chord, RZ)]), '#091819'));
  for (let z = 0; z < RZ - 1e-6; z += H.gap) {
    const z1 = z + H.gap, k = lampK(H.ridge, 4.3, z + 0.3);
    add(pth(poly([P(H.front, H.chord, z), P(H.ridge, yU(H.ridge), z), P(H.ridge, yU(H.ridge), z1), P(H.front, H.chord, z1)]), mul(C.sheetUnder, k * 0.95)));
    add(pth(poly([P(H.ridge, yU(H.ridge), z), P(H.back1, H.chord, z), P(H.back1, H.chord, z1), P(H.ridge, yU(H.ridge), z1)]), mul(C.sheetUnder, k * 0.78)));
  }
  {
    // Batts (R4/R5 wool) laid between the ceiling joists, a row per bay, far first. Each row is a soft hump:
    // seen this low across them, its crest bows up once per 1160 mm batt (joints staggered row to row) over
    // the shadowed gap at the foot of the row behind, so the joints show as dark notches and the joists just
    // show between rows. The new floor stands clear of them.
    const xa = 0.05, xb = 9.05, yB = H.insul, hsh = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    for (let b = bays - 1; b >= 0; b--) {
      const z0 = b * H.gap, z1 = z0 + H.gap, kk = lampK(H.ridge, 3.2, z0 + 0.3), zc = z1 - 0.03;
      add(pth(rectXZ(xa, xb, yB - 0.03, z0, z1), mul(mix(C.insul, C.pine, 0.35), kk * 0.5)));
      let d = 'M' + fmt(P(xa, yB - 0.01, z0 + 0.13)) + 'L' + fmt(P(xb, yB - 0.01, z0 + 0.13)) + 'L' + fmt(P(xb, yB - 0.02, zc));
      if (b < 10) {
        const js = [xb];
        for (let x = xb - (b % 2 ? 0.58 : 1.16) + (hsh(b) - 0.5) * 0.14; x > xa + 0.3; x -= 1.16 + (hsh(b * 7 + x) - 0.5) * 0.12) js.push(x);
        js.push(xa);
        for (let j = 1; j < js.length; j++) {
          const lift = 0.085 + hsh(b * 31 + j) * 0.05;
          d += 'Q' + fmt(P((js[j - 1] + js[j]) / 2, yB + lift, zc)) + ' ' + fmt(P(js[j], yB - 0.02, zc));
        }
      } else d += 'L' + fmt(P(xa, yB + 0.02, zc));
      add(pth(d + 'Z', mul(C.insul, kk * 0.95)));
    }
  }
  for (const side of [-1, 1]) {
    for (let k = 1; k <= 4; k++) {
      const x = side < 0 ? H.front + k * 1.0 : H.back1 - k * 1.0;
      const y = yU(x) + CH;
      add(pth(poly([P(x - 0.025, y, 0), P(x + 0.025, y, 0), P(x + 0.025, y, RZ), P(x - 0.025, y, RZ)]), '#3a352e', { opacity: 0.85 }));
    }
  }
  for (let z = RZ - H.gap; z > 0.01; z -= H.gap) {
    const backlit = z < LAMP.z + 0.01;
    const k = backlit ? 0.4 : lampK(H.ridge, 4.0, z);
    add(pth(trussPath(z), mul(C.pine, k)));
  }

  /* ----- Dark before the work light: one ring per bay, the light falls in from the front ----- */
  for (let i = 0; i < bays; i++) {
    const z = i * H.gap;
    const ring = pth(Apath(z) + Apath(z + H.gap), '#030c0d', { 'fill-rule': 'evenodd', opacity: 0.78 });
    if (fin) add(part('bs-dark', { a: 0.061 + i * 0.0046, l: 0.034 }, ring));
    else if (!L) add(ring);
  }
  if (fin || !L) {
    const core = pth(Apath(RZ), '#030c0d', { opacity: 0.6 });
    add(fin ? part('bs-dark', { a: 0.118, l: 0.034 }, core) : core);
  }

  /* ----- The work light ----- */
  {
    const lp = P(LAMP.x, LAMP.y, LAMP.z), s = sOf(LAMP.z) * U;
    const glow = el('ellipse', { cx: lp[0], cy: lp[1], rx: r1(3.8 * s), ry: r1(2.4 * s), fill: 'url(#bs-glow)' });
    // off, the fitting is a dim shape in the dark (its orange housing barely there); on, the housing shows
    // in its own light, with the glow and the lit face: the flicker is the first light in the roof
    const housing = rectXY(LAMP.x - 0.11, LAMP.x + 0.11, LAMP.y - 0.075, LAMP.y + 0.075, LAMP.z);
    const inner = pth(rectXY(LAMP.x - 0.09, LAMP.x + 0.09, LAMP.y - 0.065, LAMP.y + 0.045, LAMP.z), '#171513');
    const body = pth(line([P(LAMP.x, yU(LAMP.x) - 0.02, LAMP.z), P(LAMP.x, LAMP.y + 0.07, LAMP.z)]), 'none', { stroke: '#171615', 'stroke-width': 1.4 })
      + pth(housing, '#2c241d') + inner;
    const lit = pth(housing, '#e07b2c') + inner + pth(rectXY(LAMP.x - 0.075, LAMP.x + 0.075, LAMP.y - 0.06, LAMP.y - 0.01, LAMP.z), '#fff6e2');
    if (fin) add(el('g', { class: 'bs-lamp bs-still' }, body + el('g', { class: 'bs-lit' }, glow + lit)));
    else add(body + (L ? glow + lit : ''));
  }

  /* ----- The new floor: it appears and settles as one piece (one calm moment, not a build sequence) ----- */
  // 2400 x 600 sheets, joints staggered: even rows a full sheet between two halves, odd rows two full sheets
  // (the hatch row is cut round the manhole). The finished floor shows its joints faintly, as a real one
  // does; it arrives whole. The front row is painted later (over the loads passing up through the hatch),
  // so it is a second part with the same window.
  const rows = Math.round((F.z1 - F.z0) / F.row);
  const sheets = [];
  for (let r = rows - 1; r >= 0; r--) {
    const z0 = F.z0 + r * F.row, z1 = z0 + F.row;
    const pieces = z0 < HATCH.z1 && z1 > HATCH.z0 ? [[F.x0, HATCH.x0], [HATCH.x1, F.x1]] : r % 2 ? [[F.x0, 4.55], [4.55, F.x1]] : [[F.x0, 3.35], [3.35, 5.75], [5.75, F.x1]];
    for (const [x0, x1] of pieces) sheets.push({ r, x0, x1, z0, z1 });
  }
  const FLOOR = { a: 0.165, l: 0.17 };              // (draft time: the old framing and sheet beats)
  const floorPart = (svg) => (fin ? part('bs-floor', FLOOR, leaves(svg)) : state.sheets ? svg : '');
  let floorBack = '', floorFront = '';
  sheets.forEach((sh) => {
    const k = lampK((sh.x0 + sh.x1) / 2, 3, (sh.z0 + sh.z1) / 2);
    const g = 0.004;
    let svg = boxFaces(sh.x0 + g, sh.x1 - g, F.battenT, F.top, sh.z0 + g, sh.z1 - g, mul(C.board, k), { top: 1, front: 0.7, side: 0.7 }).map(([d, f]) => pth(d, f)).join('');
    if (sh.r === 1 && sh.x0 === F.x0) {
      // the hatch lining (pine), seen from above: its far side and both ends
      svg += pth(rectXY(HATCH.x0, HATCH.x1, H.ceil, F.top, HATCH.z1), mul(C.pine, 0.9));
      svg += pth(rectYZ(HATCH.x0, H.ceil, F.top, HATCH.z0, HATCH.z1), mul(C.pine, 0.75));
      svg += pth(rectYZ(HATCH.x1, H.ceil, F.top, HATCH.z0, HATCH.z1), mul(C.pine, 0.66));
    }
    if (sh.r === 0) floorFront += svg; else floorBack += svg;
  });
  add(floorPart(floorBack));
  {
    // while the lid is down the hatch reads as an opening: the lining falls into shadow, a hinge arm shows
    const hole = pth(rectXY(HATCH.x0 + 0.012, HATCH.x1 - 0.012, H.ceil, F.top - 0.035, HATCH.z1 - 0.003), 'url(#bs-hole)')
      + pth(poly([P(4.9, H.ceil + 0.04, 1.12), P(4.94, H.ceil + 0.04, 1.12), P(4.8, F.top - 0.04, 1.12), P(4.76, F.top - 0.04, 1.12)]), '#9aa4a2');
    if (fin) add(part('bs-spill', { a: 0.442, l: 0.03, b: 0.871, k: 0.028 }, leaves(hole)));
    else if (state.ladder) add(hole);
  }

  /* ----- The stored things: in the garage (dim, at dusk) and on the new floor (lit) ----- */
  /* Each load is drawn twice: in the garage where it starts and on the floor where it ends, each copy
     exact in perspective where it's seen longest. A trip: walked to the ladder's foot, carried up the ladder
     (its lower right corner riding just above the treads), pushed up through the hatch, set down in its row.
     Both copies follow the same path on screen for the climb, but the garage copy only shows below the
     ceiling's cut line and the roof copy only above it, and between them the cut ceiling and the floor's
     front row hide the load as it passes through: no cross-fade, no double image, no swap to see. */
  const ZR = 0.9;
  const ladderX = (y) => { const a = (LADDER.angle * Math.PI) / 180; return LADDER.hx + (-0.06 + (y - LADDER.hy) * Math.cos(a)) / Math.sin(a); };
  const route = (Ld) => {
    const w = loadW(Ld), ct = ladderX(2.56) - w / 2;
    return [[ladderX(0.42) - w / 2, 0.42, ZR], [ct, 2.56, ZR], [ct, 3.06, ZR]];
  };
  /* A trip: walk | climb | rise | set. The ladder and the hatch take one load at a time, so the climbs are
     spaced evenly (STAG apart, with a breath between rows); the walk before each takes as long as it is
     (a step from beside the ladder, a few seconds across the garage), so every load walks at much the same
     pace. The generator's check below confirms no two loads ever meet. */
  const E = (k, d) => +(process.env['BS_' + k] || d);
  // (BS_* in the environment override these, to try other timings against the check)
  const CARRY0 = E('C0', 0.57), CLIMB = E('CLIMB', 0.028), RISE = E('RISE', 0.005), SET = E('SET', 0.02);
  const STAG = E('STAG', 0.016), GAP = E('GAP', 0.003), G3 = E('G3', 0.004), W0 = E('W0', 0.008), WK = E('WK', 0.0055);
  const walkOf = (Ld) => { const f = route(Ld)[0]; return W0 + WK * Math.hypot(f[0] - Ld.g[0], f[2] - Ld.g[1]); };
  const climbAt = (i) => CARRY0 + walkOf(LOADS[0]) + i * STAG + GAP * ((i >= 5) + (i >= 9)) + G3 * (i >= 11);
  const tripOf = (i) => {
    const wk = walkOf(LOADS[i]), l = wk + CLIMB + RISE + SET;
    return { a: climbAt(i) - wk, l, seg: [0, wk / l, (wk + CLIMB) / l, (wk + CLIMB + RISE) / l, 1] };
  };
  const origin = (x, y, z) => { const p = Praw(x, y, z); return [r1(p[0]), r1(p[1])]; };
  const rel = (W, o, s0) => { const p = Praw(W[0], W[1], W[2]); return [r1(p[0] - o[0]), r1(p[1] - o[1]), r3(sOf(W[2]) / s0)]; };
  const way = (prefix, W) => Object.fromEntries(W.flatMap((w, i) => [[`x${prefix[i]}`, w[0]], [`y${prefix[i]}`, w[1]], [`k${prefix[i]}`, w[2]]]));
  const garageSpots = LOADS.map((Ld, i) => ({ i, x: Ld.g[0], z: Ld.g[1] }));
  const roofSpots = LOADS.map((Ld, i) => ({ i, x: Ld.r[0], z: Ld.r[1] }));
  const check = {};
  /* The carry's paint order. Each copy is painted in one place in the DOM, but it moves in depth, so the
     order is worked out over the whole carry: at each moment, any two copies of the same side (garage or roof)
     that overlap on screen must be painted far one first, judged in 3D by a plane that separates their
     boxes. The orders that satisfy every moment are sorted out (topologically, ties in the plain
     far-to-near order); the generator stops if there is none, or if two loads would pass through each
     other where it shows. */
  const carry = (kind) => LOADS.map((Ld, i) => {
    const [x, z] = kind === 'pick' ? Ld.g : Ld.r, y = kind === 'pick' ? 0 : F.top;
    const o = origin(x, y, z), W = route(Ld).map((w) => rel(w, o, sOf(z)));
    const w = loadW(Ld), h = loadH(Ld), d = loadD(Ld);
    const corners = [];
    for (const cx of [x - w / 2, x + w / 2]) for (const cy of [y, y + h]) for (const cz of [z - d / 2, z + d / 2]) corners.push(Praw(cx, cy, cz));
    return {
      i, x, y, z, w, h, d, o, corners, a: tripOf(i).a, l: tripOf(i).l,
      seg: kind === 'pick' ? tripOf(i).seg.slice(0, 4) : tripOf(i).seg.slice(1),
      way: kind === 'pick' ? [[0, 0, 1], ...W] : [...W, [0, 0, 1]],
      shows: (t) => (kind === 'pick' ? t < tripOf(i).seg[3] : t >= tripOf(i).seg[1]),
      below: kind === 'pick',
    };
  });
  const cl01 = (v) => Math.min(1, Math.max(0, v)), sm = (u) => u * u * (3 - 2 * u);
  function poseAt(c, p) {
    const t = cl01((p - c.a) / c.l), [s0, s1, s2, s3] = c.seg, [w0, w1, w2, w3] = c.way;
    const e1 = sm(cl01((t - s0) / (s1 - s0))), e2 = sm(cl01((t - s1) / (s2 - s1))), e3 = 1 - Math.pow(1 - cl01((t - s2) / (s3 - s2)), 3);
    const v = (n) => w0[n] + (w1[n] - w0[n]) * e1 + (w2[n] - w1[n]) * e2 + (w3[n] - w2[n]) * e3;
    const tx = v(0), ty = v(1), k = v(2);
    // on screen: the drawing at its spot, scaled about its origin and moved
    const pts = c.corners.map(([X, Y]) => [c.o[0] + tx + k * (X - c.o[0]), c.o[1] + ty + k * (Y - c.o[1])]);
    // in 3D: where that puts the box (its depth from the scale, its spot from the origin's new place)
    const sN = k * sOf(c.z), zc = CAM.f / sN - CAM.f;
    const xc = CAM.vx + ((c.o[0] + tx) / U + FRAME.x0 - CAM.vx) / sN, yc = CAM.vy + (FRAME.y1 - (c.o[1] + ty) / U - CAM.vy) / sN;
    const box = { x0: xc - c.w / 2, x1: xc + c.w / 2, y0: yc, y1: yc + c.h, z0: zc - c.d / 2, z1: zc + c.d / 2 };
    return { t, moving: t > 0 && t < 1, shows: c.shows(t), hull: hull(pts), box };
  }
  function hull(pts) {
    const q = pts.slice().sort((A, B) => A[0] - B[0] || A[1] - B[1]);
    const cr = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
    const lo = [], up = [];
    for (const P_ of q) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], P_) <= 0) lo.pop(); lo.push(P_); }
    for (const P_ of q.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], P_) <= 0) up.pop(); up.push(P_); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // the area two convex outlines share, on one side of the ceiling's cut line
  function shared(A, B, below) {
    const clip = (poly_, inside, cut) => {
      const out_ = [];
      for (let n = 0; n < poly_.length; n++) {
        const P_ = poly_[n], Q = poly_[(n + 1) % poly_.length], ip = inside(P_), iq = inside(Q);
        if (ip) out_.push(P_);
        if (ip !== iq) out_.push(cut(P_, Q));
      }
      return out_;
    };
    let r = A;
    for (let n = 0; n < B.length && r.length; n++) {
      const E0 = B[n], E1 = B[(n + 1) % B.length];
      const side = (P_) => (E1[0] - E0[0]) * (P_[1] - E0[1]) - (E1[1] - E0[1]) * (P_[0] - E0[0]);
      const sgn = side(B[(n + 2) % B.length]) > 0 ? 1 : -1;
      r = clip(r, (P_) => side(P_) * sgn >= 0, (P_, Q) => { const a_ = side(P_), b_ = side(Q), t = a_ / (a_ - b_); return [P_[0] + (Q[0] - P_[0]) * t, P_[1] + (Q[1] - P_[1]) * t]; });
    }
    // what shows: the garage below the ceiling's cut line; in the roof, above the far edge of the floor's
    // front row (it, the floor's edge and the cut are painted over the loads)
    const yL = below ? yCut : Praw(H.ridge, F.top, F.z0 + F.row)[1];
    if (r.length) r = clip(r, (P_) => (below ? P_[1] >= yL : P_[1] <= yL), (P_, Q) => { const t = (yL - P_[1]) / (Q[1] - P_[1]); return [P_[0] + (Q[0] - P_[0]) * t, yL]; });
    let ar = 0;
    for (let n = 0; n < r.length; n++) { const P_ = r[n], Q = r[(n + 1) % r.length]; ar += P_[0] * Q[1] - Q[0] * P_[1]; }
    return Math.abs(ar) / 2;
  }
  // which of two boxes can hide the other: 'A', 'B', null (neither), 'X' (they intersect)
  function nearer(A, B) {
    const e = 0.004, eye = { x: CAM.vx, y: CAM.vy };
    if (A.z1 <= B.z0 + e) return 'A';
    if (B.z1 <= A.z0 + e) return 'B';
    for (const ax of ['x', 'y']) {
      const a0 = A[ax + '0'], a1 = A[ax + '1'], b0 = B[ax + '0'], b1 = B[ax + '1'];
      if (a1 <= b0 + e) return eye[ax] > b0 ? 'B' : eye[ax] < a1 ? 'A' : null;
      if (b1 <= a0 + e) return eye[ax] > a0 ? 'A' : eye[ax] < b1 ? 'B' : null;
    }
    return 'X';
  }
  function carryOrder(kind) {
    const cs = carry(kind), n = cs.length, after = cs.map(() => new Set()), clash = [];
    const plain = paintOrder(cs.map((c) => ({ i: c.i, x: c.x, z: c.z }))).map((sp) => sp.i);
    for (let p = 0.56; p <= 0.84; p += 0.00025) {
      const ps = cs.map((c) => poseAt(c, p));
      for (let a_ = 0; a_ < n; a_++) for (let b_ = a_ + 1; b_ < n; b_++) {
        const A = ps[a_], B = ps[b_];
        if (!A.shows || !B.shows || shared(A.hull, B.hull, cs[a_].below) < 2) continue;
        const f = nearer(A.box, B.box);
        if (f === 'A') after[a_].add(b_);
        else if (f === 'B') after[b_].add(a_);
        else if (f === 'X' && (A.moving || B.moving)) {
          const pen = Math.min(...['x', 'y', 'z'].map((ax) => Math.min(A.box[ax + '1'], B.box[ax + '1']) - Math.max(A.box[ax + '0'], B.box[ax + '0'])));
          clash.push({ txt: `${kind} ${a_} and ${b_} at p ${p.toFixed(4)} (${(pen * 100).toFixed(1)} cm deep, t ${A.t.toFixed(2)}/${B.t.toFixed(2)})`, pen });
        }
      }
    }
    if (process.env.BS_CLASH) clash.forEach((c) => console.log(c.txt));
    const deep = clash.filter((c) => c.pen > 0.02);
    if (deep.length) throw new Error(`the carry: loads pass through each other where it shows (${deep.slice(0, 6).map((c) => c.txt).join('; ')}${deep.length > 6 ? '; ...' : ''})`);
    // painted far first: everything a copy must be painted after comes before it; ties in the plain order
    const order = [], done = new Set();
    while (order.length < n) {
      const next = plain.find((i) => !done.has(i) && [...after[i]].every((j) => done.has(j)));
      if (next === undefined) throw new Error(`the carry: no paint order works for the ${kind} copies`);
      order.push(next); done.add(next);
    }
    return order;
  }
  const garageOrder = fin ? carryOrder('pick') : paintOrder(garageSpots).map((sp) => sp.i);
  const roofOrder = fin ? carryOrder('load') : paintOrder(roofSpots).map((sp) => sp.i);
  /* ----- The car: on the driveway at dusk, in the garage at the end ----- */
  if (!fin) add(state.car === 'in' ? carStill(CAR.inX, CAR.inZ) : state.car === 'out' ? carStill(CAR.outX, CAR.inZ) : carStill(+state.car, CAR.inZ));
  else {
    const c = carParts(CAR.inX, CAR.inZ);
    const dX = CAR.outX - CAR.inX;                           // the drive in, backwards (m)
    const roll = { a: 0.905, l: 0.08 };
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    const mv = (v) => { const m = carMotion(v, CAR.inZ); return { mx: r5(m.mx * dX), my: r5(m.my * dX), m0: r1(m.m0 * dX) }; };
    add(part('bs-car', { ...roll, ...mv(c.shadow.v) }, pth(c.faceD(c.shadow), c.shadow.fill, { opacity: 0.38 })));
    for (const f of c.faces) {
      const extra = f.nose ? { nv: r3((CAR.inX + CAR.len - CAM.vx) / -dX) } : {};
      add(part(f.nose ? 'bs-car bs-nose' : 'bs-car', { ...roll, ...mv(f.v), ...extra }, pth(c.faceD(f), f.fill)));
    }
    add(part('bs-car', { ...roll, mx: 0, my: 0, m0: r1(sOf(CAR.inZ) * U * dX) }, leaves(c.side) + c.wheels.map((w) => el('g', { class: 'bs-wheel', style: vars({ ox: r1(w.c[0]), oy: r1(w.c[1]), rot: r1((dX / CAR.wheelR) * (180 / Math.PI)) }) }, leaves(w.svg))).join('')));
  }

  /* ----- The old step ladder: under the manhole at the start (how anyone got up there), folded and leaned
     on the wall before the new ladder comes down. Drawn as it ends up; CSS unfolds it and moves it back. ----- */
  {
    const zN = 0.74, zF = 1.08, L = 1.75, w = 0.05;
    const tiltEnd = (10.9 * Math.PI) / 180, tiltStart = (12.5 * Math.PI) / 180;
    const top = [5.95, L * Math.cos(tiltEnd)];               // the hinge, against the wall
    const dirF = [-Math.sin(tiltEnd), -Math.cos(tiltEnd)];   // from the hinge down the front leg
    const nrm = [-dirF[1], dirF[0]];
    const rail = (o, z, len, d) => poly([0, len].flatMap((t) => [[top[0] + d[0] * t - nrm[0] * o, top[1] + d[1] * t - nrm[1] * o]]).concat([0, len].reverse().map((t) => [top[0] + d[0] * t - nrm[0] * (o + w), top[1] + d[1] * t - nrm[1] * (o + w)])).map(([x, y]) => P(x, y, z)));
    const metal = '#b7c2c0';
    const rear = pth(rail(-0.06, zF, L * 0.98, dirF), mul(metal, 0.6)) + pth(rail(-0.06, zN, L * 0.98, dirF), mul(metal, 0.8));
    let front = pth(rail(0, zF, L, dirF), mul(metal, 0.62));
    for (let k = 1; k <= 5; k++) {
      const t = L - k * 0.29;
      const x = top[0] + dirF[0] * t, y = top[1] + dirF[1] * t;
      front += pth(poly([P(x - 0.06, y, zN), P(x + 0.04, y, zN), P(x + 0.04, y, zF), P(x - 0.06, y, zF)]), mul(metal, 1.12));
    }
    front += pth(rail(0, zN, L, dirF), metal);
    front += pth(poly([P(top[0] - 0.09, top[1] + 0.05, zN), P(top[0] + 0.03, top[1] + 0.05, zN), P(top[0] + 0.03, top[1] - 0.03, zN), P(top[0] - 0.09, top[1] - 0.03, zN)]), '#5d6866');
    const hp = P(top[0], top[1], (zN + zF) / 2);
    if (fin) {
      const startTop = [4.05 + L * Math.sin(tiltStart), L * Math.cos(tiltStart)];
      const sp = Praw(startTop[0], startTop[1], (zN + zF) / 2), ep = Praw(top[0], top[1], (zN + zF) / 2);
      const rearPart = part('bs-step-rear', { a: 0.392, l: 0.016, ox: hp[0], oy: hp[1], r: -(12.5 + 12.5 + 1.6) }, leaves(rear));
      add(part('bs-step', { a: 0.4, l: 0.04, ox: hp[0], oy: hp[1], dx: r1(sp[0] - ep[0]), dy: r1(sp[1] - ep[1]), r: 1.6 }, rearPart + leaves(front)));
    } else if (state.ladder || state.things === 'roof') add(rear + front);
    else add(stepOpen());
  }

  /* ----- Dusk in the garage; at the end its light comes on (timed, after the door: see styles.css) ----- */
  {
    const gar = rectXY(H.garage0, H.garage1, 0, H.ceil, 0);
    if (fin) add(el('path', { class: 'bs-dusk', d: gar, fill: 'url(#bs-dark)' }) + el('path', { class: 'bs-tube', d: gar, fill: 'url(#bs-tube)' }));
    else add(pth(gar, state.garageLight ? 'url(#bs-tube)' : 'url(#bs-dark)'));
  }

  /* ----- Light through the open hatch (it follows the lid) ----- */
  {
    const lamp = [LAMP.x, LAMP.y, LAMP.z];
    const toFloor = (x, z) => { const t = lamp[1] / (lamp[1] - H.ceil); return [lamp[0] + (x - lamp[0]) * t, 0, lamp[2] + (z - lamp[2]) * t]; };
    const a = toFloor(HATCH.x0, HATCH.z0), b = toFloor(HATCH.x1, HATCH.z0), c = toFloor(HATCH.x1, HATCH.z1), d = toFloor(HATCH.x0, HATCH.z1);
    const clampX = (p) => [Math.min(p[0], H.garage1), p[1], p[2]];
    const shaft = pth(poly([P(HATCH.x0, H.ceil, HATCH.z0), P(HATCH.x1, H.ceil, HATCH.z0), P(...clampX(b)), P(...a)]), 'url(#bs-spill)');
    const patch = pth(poly([P(...a), P(...clampX(b)), P(...clampX(c)), P(...d)]), C.amber, { opacity: 0.12 });
    if (fin) add(part('bs-spill', { a: 0.442, l: 0.03, b: 0.871, k: 0.028 }, leaves(patch + shaft)));
    else if (state.ladder) add(patch + shaft);
  }

  /* ----- The stored things in the garage (dim, at dusk): walked to the ladder and carried up it ----- */
  if (fin || state.things === 'garage') {
    const picks = [];
    for (const sp of garageOrder.map((i) => garageSpots[i])) {
      const Ld = LOADS[sp.i];
      // drawn over the garage's dusk and the light from the hatch (so a load on the ladder stays solid), with
      // the dusk's darkness at its spot (bs-dark, left to right across the garage) baked into its colours
      const f = (Praw(sp.x, 0.3, sp.z)[0] / U + FRAME.x0) / (H.garage1 - H.garage0);
      const dusk = f < 0.35 ? 0.3 + (0.32 * f) / 0.35 : 0.62 + (0.08 * (f - 0.35)) / 0.65;
      const svg = shade(sp.x, 0, sp.z, loadW(Ld), loadD(Ld), 0.16) + leaves(loadSVG(Ld, sp.x, 0, sp.z, 0.95 * (1 - dusk)));
      if (!fin) { add(svg); continue; }
      const o = origin(sp.x, 0, sp.z), W = route(Ld).map((w) => rel(w, o, sOf(sp.z)));
      check[sp.i] = { g: W.slice(0, 2).map((w) => [w[0] + o[0], w[1] + o[1], w[2] * sOf(sp.z)]) };
      const tr = tripOf(sp.i);
      picks.push(part('bs-pick', { a: tr.a, l: tr.l, s1: tr.seg[1], s2: tr.seg[2], s3: tr.seg[3], ...way('123', W), ox: o[0], oy: o[1] }, svg));
    }
    if (fin) add(el('g', { class: 'bs-clip', 'clip-path': 'url(#bs-below)' }, picks.join('')));
  }


  /* ----- The pull-down ladder (drawn open; CSS folds it away) ----- */
  {
    const secs = ladderSections();
    const hinge = (i) => P(secs[i].hinge[0], secs[i].hinge[1], secs[i].z);
    if (fin) {
      // nested: the lid and section 1 swing about the hatch hinge, 2 about the end of 1, 3 about the end of 2
      const h0 = hinge(0), h1 = hinge(1), h2 = hinge(2);
      // each half turn gets 0.05 of the story (about 145px at 1440x900): a calm pull, not a flick; the next
      // section starts as the last one settles. Folding away, each gets 0.03.
      const s3 = part('bs-fold bs-s3', { a: 0.52, l: 0.048, c: 0.825, m: 0.03, ox: h2[0], oy: h2[1], r: -178 }, leaves(secs[2].svg));
      const s2 = part('bs-fold bs-s2', { a: 0.476, l: 0.05, c: 0.848, m: 0.03, ox: h1[0], oy: h1[1], r: 178 }, leaves(secs[1].svg) + s3);
      add(part('bs-fold bs-s1', { a: 0.442, l: 0.04, c: 0.871, m: 0.03, ox: h0[0], oy: h0[1], r: LADDER.angle }, leaves(secs[0].svg) + s2));
    } else if (state.ladder) add(secs.map((s) => s.svg).join(''));
  }

  /* ----- Headlights (beat 7): from the driveway, through the door, across the clear floor to the wall.
     Drawn from where the car starts; it shortens towards the wall as the car comes in. ----- */
  {
    const hx = CAR.outX + CAR.len, hz = CAR.inZ;
    const beam = pth(poly([P(hx, 0.86, hz), P(H.garage1, 1.25, hz + 0.15), P(H.garage1, 0, hz + 1.5), P(hx + 1.2, 0, hz + 0.25)]), 'url(#bs-beam)');
    const wall = pth(rectYZ(H.garage1 - 0.005, 0.15, 1.25, hz + 0.15, hz + 1.5), 'url(#bs-wash)', { opacity: 0.5 });
    const wx = Praw(H.garage1, 0.6, hz + 0.5)[0];
    if (fin) {
      add(part('bs-beam', { a: 0.898, l: 0.008, b: 0.986, m: 0.008, ra: 0.905, rl: 0.08, ox: r1(wx), w: r3((H.garage1 - (CAR.inX + CAR.len)) / (H.garage1 - hx)) }, beam));
      add(part('bs-beam', { a: 0.898, l: 0.008, b: 0.986, m: 0.008 }, wall));
    }
  }

  /* ----- The wall beside the door, nearest the cut: in front of anything outside (the car on the
     driveway, the headlights' first stretch), so it's drawn after them, with the garage's dusk and light ----- */
  {
    const jamb = rectYZ(G0, 0, H.ceil, 0, DR.z0);
    add(pth(jamb, mul(C.brick, 0.85)));
    if (fin) add(el('path', { class: 'bs-dusk', d: jamb, fill: '#051316', 'fill-opacity': 0.33 }) + el('path', { class: 'bs-tube', d: jamb, fill: 'url(#bs-tube)' }));
    else add(state.garageLight ? pth(jamb, 'url(#bs-tube)') : pth(jamb, '#051316', { opacity: 0.33 }));
  }

  /* ----- The stored things on the new floor (lit): up through the hatch, set down in their rows ----- */
  if (fin || state.things === 'roof') {
    const lits = [];
    for (const sp of roofOrder.map((i) => roofSpots[i])) {
      const Ld = LOADS[sp.i];
      const k = lampK(sp.x, 3.4, sp.z);
      const svg = shade(sp.x, F.top, sp.z, loadW(Ld), loadD(Ld), 0.11) + leaves(loadSVG(Ld, sp.x, F.top, sp.z, k));
      if (!fin) { add(svg); continue; }
      const o = origin(sp.x, F.top, sp.z), W = route(Ld).map((w) => rel(w, o, sOf(sp.z)));
      // the climb must line up with the garage copy's: same screen points, same size
      W.slice(0, 2).forEach((w, n) => {
        const g = check[sp.i].g[n], dx = w[0] + o[0] - g[0], dy = w[1] + o[1] - g[1], ks = w[2] * sOf(sp.z) / g[2] - 1;
        if (Math.abs(dx) > 0.15 || Math.abs(dy) > 0.15 || Math.abs(ks) > 0.004) throw new Error(`load ${sp.i}: the two copies part on the ladder (${dx}, ${dy}, ${ks})`);
      });
      const tr = tripOf(sp.i);
      lits.push(part('bs-load', { a: tr.a, l: tr.l, s0: tr.seg[1], s1: tr.seg[2], s2: tr.seg[3], ...way('012', W), ox: o[0], oy: o[1] }, svg));
    }
    if (fin) add(el('g', { class: 'bs-clip', 'clip-path': 'url(#bs-above)' }, lits.join('')));
  }

  const floorEdge = pth(rectXY(F.x0, F.x1, F.top - 0.022, F.top, 0), '#d9cfb9') + pth(rectXY(F.x0, F.x1, F.battenB, F.top - 0.022, 0), mix(C.timber, C.cut, 0.3));
  add(floorPart(floorFront));

  /* ----- The section cut (brand teal): ground, slab, walls, ceiling, the cut truss and the roof ----- */
  const cut = [];
  add(pth(rectXY(-30, 40, -4, 0, 0), '#081a1b'));
  cut.push(rectXY(H.front, H.back1, -0.14, 0, 0));
  cut.push(rectXY(H.mid1 - 0.11, H.back1, 0, H.roomFloor, 0));
  cut.push(rectXY(H.front, G0, 0, yU(H.front), 0));
  cut.push(rectXY(G1, H.mid1, 0, H.chord, 0));
  cut.push(rectXY(H.back0, H.back1, H.roomFloor, yU(H.back1), 0));
  cut.push(rectXY(H.front, H.back1, H.ceil - 0.013, H.chord, 0));
  cut.push(trussPath(0, true));
  cut.push(poly([P(H.eaveL, yU(H.eaveL) + CH, 0), P(H.ridge, yU(H.ridge) + CH, 0), P(H.eaveR, yU(H.eaveR) + CH, 0), P(H.eaveR, yO(H.eaveR), 0), P(H.ridge, yO(H.ridge), 0), P(H.eaveL, yO(H.eaveL), 0)]));
  // fascia and gutter, then the soffit back to the wall
  cut.push(poly([P(H.eaveL + 0.03, yO(H.eaveL), 0), P(H.eaveL - 0.15, yO(H.eaveL) - 0.02, 0), P(H.eaveL - 0.13, yU(H.eaveL) - 0.16, 0), P(H.eaveL + 0.03, yU(H.eaveL) - 0.16, 0)]));
  cut.push(poly([P(H.eaveR - 0.03, yO(H.eaveR), 0), P(H.eaveR + 0.15, yO(H.eaveR) - 0.02, 0), P(H.eaveR + 0.13, yU(H.eaveR) - 0.16, 0), P(H.eaveR - 0.03, yU(H.eaveR) - 0.16, 0)]));
  cut.push(rectXY(H.eaveL, H.front, yU(H.eaveL) - 0.16, yU(H.eaveL) - 0.13, 0), rectXY(H.back1, H.eaveR, yU(H.eaveR) - 0.16, yU(H.eaveR) - 0.13, 0));
  {
    // the batts, cut: soft wool on the ceiling, one bow per batt
    let d = 'M' + fmt(P(H.front, H.chord, 0)) + 'L' + fmt(P(H.front, H.insul - 0.03, 0));
    for (let x = H.front; x < H.back1 - 1e-6;) { const nx = Math.min(H.back1, x + 1.16); d += 'Q' + fmt(P((x + nx) / 2, H.insul + 0.075, 0)) + ' ' + fmt(P(nx, H.insul - 0.03, 0)); x = nx; }
    add(pth(d + 'L' + fmt(P(H.back1, H.chord, 0)) + 'Z', mul(C.insul, 0.72)));
  }
  add(pth(cut.join(''), C.cut, { class: 'bs-cut' }));
  // the floor's own cut edge: the sheet on its plain timber frame (comes with the floor)
  add(floorPart(floorEdge));

  if (!fin) return out.join('\n');
  // Runs of still parts go in groups (.bs-still): fewer children for the svg, and they pin --p
  const grouped = [];
  let run = [];
  const flush = () => { if (run.length) grouped.push(run.length > 1 ? el('g', { class: 'bs-still' }, run.join('')) : run[0]); run = []; };
  for (const s of out) {
    const moving = /^<\w+ class="m /.test(s) || s.startsWith('<g class="bs-lamp') || s.startsWith('<g class="bs-clip') || s.startsWith('<defs');
    if (moving) { flush(); grouped.push(s); } else run.push(s);
  }
  flush();
  return grouped.join('\n');
}

/* ---------- Main ---------- */
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

if (args.includes('--concept')) {
  MODE = 'concept';
  const st = opt('--concept', 'final');
  let fr = FRAMES[opt('--frame', 'wide')];
  if (opt('--cam')) { const cx = +opt('--cam'); fr = { x0: cx - 2.7, x1: cx + 2.7, y0: FRAME.y0, y1: FRAME.y1 }; }
  const stt = { ...STATES[st] };
  if (opt('--carx')) stt.car = opt('--carx');
  const body = scene(stt);
  const vb = `${r1((fr.x0 - FRAME.x0) * U)} ${r1((FRAME.y1 - fr.y1) * U)} ${r1((fr.x1 - fr.x0) * U)} ${r1((fr.y1 - fr.y0) * U)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n${body}\n</svg>\n`;
  const file = opt('--out', `scene-${st}.svg`);
  writeFileSync(file, svg);
  console.log(`wrote ${file} (${(svg.length / 1024).toFixed(1)} KB)`);
} else {
  MODE = 'final';
  const body = scene(STATES.final);
  // the portrait camera: from the car and the door to the garage column as the light comes on, and back a
  // little as the ladder folds away, ready for the car
  const [ca, cl] = win(0.025, 0.07), [cb, cm] = win(0.843, 0.062);
  const svg = `<svg class="bs-svg" viewBox="0 0 ${r1(VBW)} ${r1(VBH)}" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false" data-shut="${SHUT_AT}" style="${vars({ 'cam-a': ca, 'cam-l': cl, 'cam-b': cb, 'cam-m': cm })}">\n${body}\n</svg>`;
  const html = readFileSync(INDEX, 'utf8');
  const re = /(<!-- scene:start -->)[\s\S]*?(<!-- scene:end -->)/;
  if (!re.test(html)) { console.error('index.html has no <!-- scene:start --> ... <!-- scene:end --> markers'); process.exit(2); }
  const next = html.replace(re, `$1\n${svg}\n$2`);
  const moving = (svg.match(/class="m /g) || []).length;
  if (args.includes('--check')) {
    if (next !== html) { console.error('index.html is out of date: run node scripts/scene/build-scene.mjs'); process.exit(1); }
    console.log('index.html is up to date');
  } else {
    writeFileSync(INDEX, next);
    console.log(`scene written: ${(svg.length / 1024).toFixed(1)} KB, ${moving} moving parts`);
  }
  // the captions must start where the beats do
  const at = [...html.matchAll(/class="bs-cap[^"]*"[^>]*data-at="([\d.]+)"/g)].map((m) => +m[1]);
  if (at.length && at.join() !== BEATS.map((b) => b.at).join()) console.warn(`caption data-at ${at.join()} != beats ${BEATS.map((b) => b.at).join()}`);
}
