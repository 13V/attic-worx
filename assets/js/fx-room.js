/* fx-room.js: "How much room?" (#room). Owned by the ROOM agent; uses window.AW from main.js.
   The slider sizes a storage floor (2–20 m²). This file keeps the numbers and the text in step, and
   tells the picture which size to show by toggling .on on just the sheets and things that change
   (fx-room.css moves them). The first time the picture comes into view, the work light comes on and
   the floor lays itself out to the slider's size. "Price a floor this size" also
   picks the matching size in the quote form (main.js's [data-service] handler ticks Attic storage
   and takes you there). Without this file the section shows 8 m², as written in index.html. */
(function () {
  'use strict';

  var sec = document.getElementById('room');
  var input = sec && sec.querySelector('#room-size');
  var svg = sec && sec.querySelector('.room-svg');
  if (!input || !svg) return;

  var AW = window.AW || {};
  var motionOK = AW.motionOK || function () {
    return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  var raf = AW.raf || (window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (f) { return setTimeout(f, 16); });
  var $ = function (sel) { return sec.querySelector(sel); };

  /* ---------- The numbers ----------
     A rough guide, and it says so (the footnote in index.html states the same assumptions):
     - an archive box takes about 420 × 320 mm of floor and stands 260 mm tall; boxes go two high;
     - about half the floor holds boxes. The rest is the 600 mm walkway from the manhole (about a
       quarter of a typical floor), the edges where the roof comes down, and the gaps between boxes
       and around the roof framing.
     So boxes ≈ 2 × (m² × 0.5) / (0.42 × 0.32), about 7.4 per m², then rounded to a friendly figure:
     to the nearest 5 under 50, to the nearest 10 from there.
     2 m² → 15, 8 m² → 60, 12 m² → 90, 20 m² → 150. */
  var BOX_FLOOR = 0.42 * 0.32;
  var SHARE = 0.5;
  var HIGH = 2;
  var boxes = function (m2) {
    var raw = (HIGH * m2 * SHARE) / BOX_FLOOR;
    return raw < 50 ? Math.round(raw / 5) * 5 : Math.round(raw / 10) * 10;
  };
  // The quote form's storage sizes (radios name="size") and the slider values that fall in each.
  // 12 m² goes with "12 m² or more", the option that names it outright.
  var ZONES = [
    { id: 'size-s', max: 5, label: 'A small area for boxes' },
    { id: 'size-m', max: 11, label: 'About 6–12 m²' },
    { id: 'size-l', max: Infinity, label: '12 m² or more' }
  ];
  var zoneOf = function (v) {
    for (var i = 0; i < ZONES.length; i++) if (v <= ZONES[i].max) return ZONES[i];
    return ZONES[ZONES.length - 1];
  };
  var KYLE = 12; // Kyle M's review: "The guys came out and put in 12sqm of space above my garage"
  var MIN = Number(input.min) || 2;
  var MAX = Number(input.max) || 20;

  /* ---------- The text ---------- */
  var valueEl = $('[data-room-value]');
  var boxesEl = $('[data-room-boxes]');
  var handoff = $('[data-room-handoff]');
  var range = $('[data-room-range]');
  var zones = Array.prototype.slice.call(sec.querySelectorAll('[data-zone]'));

  var text = function (v) {
    var n = boxes(v);
    var z = zoneOf(v);
    var kyle = v === KYLE;
    if (valueEl) {
      valueEl.textContent = v;
      valueEl.parentNode.style.setProperty('--n', String(v).length);
    }
    if (boxesEl) boxesEl.textContent = n;
    if (handoff) handoff.textContent = 'Ticks Attic storage and “' + z.label + '” in the quote form.';
    sec.classList.toggle('is-kyle', kyle); // shows "The size of the floor Kyle M had put in above his garage." 
    input.setAttribute('aria-valuetext', v + ' square metres, room for about ' + n + ' archive boxes' + (kyle ? ', the size of Kyle M’s floor' : ''));
    if (range) range.style.setProperty('--f', ((v - MIN) / (MAX - MIN)).toFixed(4));
    zones.forEach(function (s) { s.classList.toggle('is-on', s.getAttribute('data-zone') === z.id); });
  };

  /* ---------- The picture ---------- */
  /* ---------- The picture ----------
     Every sheet and stored thing is drawn once (scripts/room/build-room.mjs), with the floor size it
     appears at (data-at). It shows while it has .on. A change only touches the parts that cross
     between the old size and the new one: each gets its delay (in floor order: growing, nearest the
     manhole first; shrinking, the newest first) and .on toggled. One loop, no layout reads. */
  var parts = Array.prototype.slice.call(svg.querySelectorAll('.rm-s, .rm-i')).map(function (el) {
    return { el: el, at: parseFloat(el.getAttribute('data-at')), thing: el.classList.contains('rm-i') };
  });
  var pool = svg.querySelector('.rm-pool');
  var shown = Number(svg.getAttribute('data-v')) || 8; // the size the picture shows (8 in the HTML)
  // spread: over how many ms the arrivals (or departures) of this change are spread
  var paint = function (to, spread) {
    var from = shown;
    if (to === from) return;
    shown = to;
    var up = to > from;
    var lo = Math.min(from, to);
    var hi = Math.max(from, to);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.at <= lo || p.at > hi) continue; // the same at both sizes
      var t = (p.at - from) / (to - from); // 0..1 through this change, in arrival order
      // growing, things land just after the sheet under them; shrinking, they go before it
      var d = t * spread + (up ? (p.thing ? 140 : 0) : (p.thing ? 0 : 90));
      p.el.style.transitionDelay = Math.round(d) + 'ms';
      p.el.classList.toggle('on', up);
    }
    if (pool) pool.style.transform = 'scale(' + (0.4 + to * 0.03).toFixed(3) + ')';
  };
  var step = function (to) { return Math.min(Math.abs(to - shown) * 80, 420); };

  var onScreen = function (el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
  };

  // A value the browser restored (back/forward) wins over the 8 m² written into the HTML
  var start = Number(input.value) || 8;
  if (start !== shown) text(start);

  var waiting = null; // the first build, while it waits for the picture to come into view
  var touched = false; // the visitor has moved the slider
  var lightsOn = function () {
    if (waiting) { waiting.disconnect(); waiting = null; }
    if (!sec.classList.contains('is-dark')) return;
    sec.classList.remove('is-dark');
    if (motionOK()) sec.classList.add('is-lighting');
  };
  // Transitions are held while the picture is set up (and for two frames after)
  svg.classList.add('is-still');
  if (start !== shown) paint(start, 0);
  sec.classList.add('is-live');
  // Whether the picture is already on screen needs layout: it's read in the first frame, with the
  // layout the browser does for that frame anyway (before it paints), not here, mid-start-up.
  raf(function () {
    if (!touched && motionOK() && 'IntersectionObserver' in window && !onScreen(svg)) {
      // The empty roof (only the manhole lit) until the picture is in view; then the work light comes
      // on and the floor lays itself out to the slider's size
      sec.classList.add('is-dark');
      paint(0, 0);
      waiting = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        lightsOn();
        setTimeout(function () { if (!touched) paint(Number(input.value), 1400); }, motionOK() ? 520 : 0);
      }, { threshold: 0.4 });
      waiting.observe(svg);
    }
    raf(function () { raf(function () { svg.classList.remove('is-still'); }); });
  });

  /* ---------- The slider: text at once, the picture once a frame ---------- */
  var queued = false;
  input.addEventListener('input', function () {
    touched = true;
    lightsOn();
    if (queued) return;
    queued = true;
    raf(function () {
      queued = false;
      var v = Number(input.value);
      text(v);
      paint(v, step(v));
    });
  });

  /* ---------- "Price a floor this size": pick the matching size in the quote form ---------- */
  var cta = $('[data-room-cta]');
  if (cta) {
    cta.addEventListener('click', function () {
      var radio = document.getElementById(zoneOf(Number(input.value)).id);
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }
})();
