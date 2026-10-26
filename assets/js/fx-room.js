/* fx-room.js: "How much room?" (#room). Owned by the ROOM agent; uses window.AW from main.js.
   The slider sizes a storage floor (2–20 m²). This file keeps the numbers and the text in step, and
   tells the picture which size to show by toggling .on on just the sheets and things that change
   (fx-room.css moves them). The first time the picture comes into view, the light comes up through
   the manhole and the floor lays itself out to the slider's size. "Price a floor this size" also
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
     So boxes ≈ 2 × (m² × 0.5) / (0.42 × 0.32), about 7.4 per m², rounded to the nearest 5, so every
     whole m² changes the figure (by 5 or 10):
     2 m² → 15, 8 m² → 60, 9 m² → 65, 10 m² → 75, 12 m² → 90, 20 m² → 150.
     The picture shows a mix (tubs, cases, camping and sports gear stand in for some of the boxes), so
     it holds fewer boxes than the figure; the footnote says so. */
  var BOX_FLOOR = 0.42 * 0.32;
  var SHARE = 0.5;
  var HIGH = 2;
  var boxes = function (m2) {
    var raw = (HIGH * m2 * SHARE) / BOX_FLOOR;
    return Math.round(raw / 5) * 5;
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

  // The quote form's thank-you: once it shows, the request is sent and the form isn't changed any more
  var done = document.querySelector('#quote-form [data-done]');
  var sent = function () { return !!done && !done.hidden; };
  var said = 8; // the size the text shows (8 in the HTML); the button prices this size
  var digits = 0;
  var text = function (v) {
    var n = boxes(v);
    var z = zoneOf(v);
    var kyle = v === KYLE;
    said = v;
    if (valueEl) {
      // The unit follows the digits by transform: their count and the letter-spacing in use (a
      // reader's own text spacing included) place it. The spacing is read only when the count
      // changes (9 to 10), before anything is written, so it costs nothing while dragging.
      var p = valueEl.parentNode;
      var count = String(v).length;
      if (count !== digits) {
        var ls = parseFloat(getComputedStyle(p).letterSpacing);
        digits = count;
        p.style.setProperty('--n', count);
        p.style.setProperty('--ls', (isNaN(ls) ? 0 : ls) + 'px');
      }
      valueEl.textContent = v;
    }
    if (boxesEl) boxesEl.textContent = n;
    if (handoff) handoff.textContent = sent() ? 'Your quote request has been sent.' : 'Ticks Attic storage and “' + z.label + '” in the quote form.';
    sec.classList.toggle('is-kyle', kyle); // shows "The size of the floor Kyle M had put in above his garage." 
    input.setAttribute('aria-valuetext', v + ' square metres, room for about ' + n + ' archive boxes' + (kyle ? ', the size of Kyle M’s floor' : ''));
    if (range) range.style.setProperty('--f', ((v - MIN) / (MAX - MIN)).toFixed(4));
    zones.forEach(function (s) { s.classList.toggle('is-on', s.getAttribute('data-zone') === z.id); });
  };

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
      // growing, things land just after the sheet under them; shrinking, they go first: lifted
      // away whole and only fading at the end (the delays follow fx-room.css's order: opacity,
      // transform), and the sheet under them after
      var d = Math.round(t * spread + (up ? (p.thing ? 140 : 0) : (p.thing ? 0 : 140)));
      p.el.style.transitionDelay = !up && p.thing ? (d + 100) + 'ms, ' + d + 'ms' : d + 'ms';
      p.el.classList.toggle('on', up);
    }
    // the warm light on the floor grows with it (from a glow round the hatch, with no floor)
    if (pool) pool.style.transform = 'scale(' + (to ? 0.4 + to * 0.03 : 0.2).toFixed(3) + ')';
  };
  var step = function (to) { return Math.min(Math.abs(to - shown) * 80, 420); };

  var onScreen = function (el) {
    var r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
  };

  // A value the browser restored wins over the 8 m² written into the HTML. Chrome can restore it after
  // this file runs (by pageshow), so it's read again then: see sync() below.
  var start = Number(input.value) || 8;
  if (start !== said) text(start);

  var waiting = null; // the first build, while it waits for the picture to come into view
  var touched = false; // the visitor has moved the slider
  var lightsOn = function () {
    if (waiting) { waiting.disconnect(); waiting = null; }
    if (!sec.classList.contains('is-dark')) return;
    sec.classList.remove('is-dark');
    if (!motionOK()) return;
    // the light comes up through the manhole (fx-room.css): the dark draws back from the hatch and
    // fades, then the lamp comes on. Once it's over, the dark is hidden again, so it costs nothing
    // at rest
    var over = function (e) {
      if (e && e.animationName !== 'aw-room-fade') return;
      sec.removeEventListener('animationend', over);
      clearTimeout(timer);
      sec.classList.remove('is-lighting');
    };
    var timer = setTimeout(over, 4000); // in case the end never comes
    sec.addEventListener('animationend', over);
    sec.classList.add('is-lighting');
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

  /* ---------- The slider: the text at once (so what a screen reader speaks is never a step behind),
     the picture once a frame ---------- */
  var queued = false;
  var changed = function () {
    touched = true;
    lightsOn();
    text(Number(input.value));
    if (queued) return;
    queued = true;
    raf(function () {
      queued = false;
      var v = Number(input.value);
      paint(v, step(v));
    });
  };

  /* A touch that's really a scroll. On touch screens Chrome (any Blink browser) moves the thumb to
     where a finger lands on the track at once, and only then decides whether the finger is
     scrolling the page (pointercancel). So scrolling past with a finger that lands on the slider
     would change the size. While a touch on the slider is undecided, its value is held back: it
     shows once the finger lifts (a tap), moves sideways (a drag) or rests a moment, and the size is
     put back if the browser takes the touch for a scroll. (fx-room.css also gives the input
     touch-action: pan-y, so only vertical moves can scroll.) Mouse, keyboard and assistive tech
     change it at once. */
  var held = null;     // the size when the touch began, while it could still turn out to be a scroll
  var pending = false; // its value is held back
  var first = null;    // the value the touch first gave (where the finger landed)
  var origin = null, rest = 0;
  var settle = function () { pending = false; held = null; first = null; clearTimeout(rest); };
  var commit = function () { pending = false; clearTimeout(rest); if (Number(input.value) !== said) changed(); };
  input.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') return;
    settle();
    held = said; pending = true; origin = [e.clientX, e.clientY];
  });
  input.addEventListener('pointermove', function (e) {
    if (held === null) return;
    var dx = Math.abs(e.clientX - origin[0]), dy = Math.abs(e.clientY - origin[1]);
    if (dx >= 6 && dx > dy) { held = null; if (pending) commit(); } // a drag along the slider: it's the visitor's
  });
  input.addEventListener('pointerup', function () { held = null; if (pending) commit(); });
  input.addEventListener('pointercancel', function () {
    var v = held;
    settle();
    if (v === null) return;
    if (Number(input.value) !== v) input.value = v; // the browser took it for a scroll: put it back
    if (said !== v) changed(); // (only if it had already shown)
  });
  input.addEventListener('lostpointercapture', function () { if (pending) commit(); settle(); }); // in case
  input.addEventListener('keydown', function () { if (pending) commit(); settle(); });
  input.addEventListener('input', function () {
    if (!pending) { changed(); return; }
    if (first === null) {
      // where the finger landed: held back. A finger that rests there is pressing, not scrolling, so
      // it shows after a moment
      first = input.value;
      rest = setTimeout(commit, 450);
    } else if (input.value !== first) commit(); // the thumb is following the finger: a drag
  });

  // Back to the page (back/forward, or a restored tab): the browser may have put back the slider's
  // last value after start-up. Bring the text and the picture to it. While the picture waits for its
  // first showing, the entrance lays out whatever the slider says by then.
  var sync = function () {
    var v = Number(input.value);
    if (!v) return;
    if (v !== said) text(v);
    if (!waiting && !sec.classList.contains('is-dark') && v !== shown) paint(v, 0);
  };
  window.addEventListener('pageshow', sync);

  // Once the quote is sent, the line under the button says so
  if (done && 'MutationObserver' in window) {
    new MutationObserver(function () { text(said); }).observe(done, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ---------- "Price a floor this size": pick the matching size in the quote form ----------
     The size the text shows (and the line under the button names), not a value read afresh. Once the
     quote is sent, the button only takes you back to the thank-you; the form isn't changed. */
  var cta = $('[data-room-cta]');
  if (cta) {
    cta.addEventListener('click', function () {
      if (sent()) return;
      var z = zoneOf(said);
      var radio = document.getElementById(z.id);
      if (radio && !radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // so leads that started here can be counted (the form's payload is unchanged)
      if (window.dataLayer) window.dataLayer.push({ event: 'room_price_floor', size_m2: said, size_option: z.label });
    });
  }
})();
