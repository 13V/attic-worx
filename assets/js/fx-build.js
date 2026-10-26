/* fx-build.js: drives "Boxes up. Car in." (#build). Uses window.AW from main.js.
   It eases one number, --p (0 -> 1), towards the scroll position so a wheel's notches don't jump the
   story, and marks the current step (data-beat on the stage, .is-on on its caption). --p goes on the stage
   (the rail), on the svg as --bs-cam (the phone camera) and on each moving part while it moves.
   It also marks the end (data-shut, once --p passes the svg's data-shut): the roller door and the garage
   light are timed transitions from there. fx-build.css does the rest. It only works while the CSS pins the
   stage (JS, motion welcome, a screen at least 500px tall, pow() and container units supported; read
   live); otherwise the finished picture shows. ?bs-p=0.42 in the address holds the story at that point
   (for reviews and screenshots; drop it at consolidation if you like). */
(function () {
  'use strict';
  var AW = window.AW;
  var track = document.querySelector('[data-build]');
  if (!AW || !track) return;
  var stage = track.querySelector('.bs-stage');
  var svg = track.querySelector('.bs-svg');
  var shutAt = svg ? parseFloat(svg.getAttribute('data-shut')) || 2 : 2;
  var caps = Array.prototype.slice.call(track.querySelectorAll('.bs-cap'));
  var at = caps.map(function (c) { return parseFloat(c.getAttribute('data-at')) || 0; });
  var supported = !!(window.CSS && CSS.supports && CSS.supports('width', 'calc(pow(2, 2) * 1px)') && CSS.supports('width', '1cqw'));
  var tall = window.matchMedia('(min-height: 500px)');
  var held = /[?&]bs-p=([\d.]+)/.exec(location.search);
  var fixed = held ? AW.clamp(parseFloat(held[1]), 0, 1) : null;
  var pinned = function () { return supported && tall.matches && AW.motionOK(); };

  // The current step: the last one whose start --p has reached; and whether the door is down yet
  var beat = -1;
  var shut = null;
  var mark = function (p) {
    var s = p >= shutAt;
    if (s !== shut) { shut = s; stage.toggleAttribute('data-shut', s); }
    var b = 0;
    for (var i = 1; i < at.length; i++) if (p >= at[i] - 0.002) b = i;
    if (b === beat) return;
    beat = b;
    stage.setAttribute('data-beat', b);
    caps.forEach(function (c, i) { c.classList.toggle('is-on', i === b); });
  };

  // --p follows the target softly (about a fifth of the way each frame). It's written to 3 decimals (2-3px
  // of scroll) and only when that changes: every write restyles the moving parts, so frames that wouldn't
  // move anything visibly skip it.
  var cur = null;
  var target = null;
  var easing = false;
  var written = '';
  // The moving parts and their windows (from the generator's inline --a/--l, --b/--k, ...; padded a little
  // for the edges that run past them). A part gets --p while the story is inside a window, and once more
  // as it leaves; the rest of the frame it isn't touched, so it isn't restyled.
  var num = function (st, k) { var m = new RegExp('--' + k + ':(-?[\\d.]+)').exec(st); return m ? parseFloat(m[1]) : null; };
  var parts = svg ? Array.prototype.map.call(svg.querySelectorAll('.m'), function (el) {
    var st = el.getAttribute('style') || '', w = [];
    [['a', 'l'], ['b', 'k'], ['b', 'm'], ['c', 'm'], ['ra', 'rl']].forEach(function (k) {
      var s = num(st, k[0]), d = num(st, k[1]);
      if (s !== null && d !== null) w.push([s - 0.012, s + d + 0.012]);
    });
    return { el: el, w: w, at: null };
  }) : [];
  var where = function (p, w) {
    var k = '';
    for (var i = 0; i < w.length; i++) k += p <= w[i][0] ? '0' : p >= w[i][1] ? '1' : 'x';
    return k;
  };
  var write = function (v) {
    var p = +v;
    stage.style.setProperty('--p', v); // the rail
    if (svg) svg.style.setProperty('--bs-cam', v); // the phone camera
    for (var i = 0; i < parts.length; i++) {
      var o = parts[i], k = where(p, o.w);
      if (k !== o.at || k.indexOf('x') >= 0) { o.at = k; o.el.style.setProperty('--p', v); }
    }
  };
  var step = function () {
    var d = target - cur;
    cur = Math.abs(d) < 0.0005 ? target : cur + d * 0.18;
    var v = cur.toFixed(3);
    if (v !== written) { written = v; write(v); }
    mark(cur);
    return cur !== target;
  };
  var loop = function () {
    easing = false;
    if (target !== null && step()) { easing = true; AW.raf(loop); }
  };

  // Only while the track is near the screen
  var live = true;
  var snap = true; // arriving (load, a jump, coming back on screen): no catching up
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      live = entries[0].isIntersecting;
      if (live) { snap = true; window.dispatchEvent(new Event('scroll')); }
    }, { rootMargin: '25% 0px' }).observe(track);
  }

  AW.onScrollFrame(function () {
    if (!live || !pinned()) return;
    // read: where the track is, how long the stage stays pinned
    var top = track.getBoundingClientRect().top;
    var travel = track.offsetHeight - stage.offsetHeight;
    var p = fixed !== null ? fixed : AW.clamp(-top / Math.max(1, travel) / 0.94, 0, 1); // the end holds a moment
    return function () {
      // write
      target = p;
      if (cur === null || snap || fixed !== null) {
        snap = false;
        cur = target;
        step();
        return;
      }
      if (!easing && step()) { easing = true; AW.raf(loop); }
    };
  });

  // Keyboard: the last step's button lives in the pinned stage. Tabbing to it while another step shows
  // jumps to the end of the story, where it's on screen and lit.
  stage.addEventListener('focusin', function () {
    if (!pinned() || beat === caps.length - 1) return;
    var travel = track.offsetHeight - stage.offsetHeight;
    var y = window.scrollY + track.getBoundingClientRect().top + travel * 0.97;
    snap = true;
    window.scrollTo({ top: y, behavior: 'instant' });
  });
})();
