/* fx-build.js: drives "Boxes up. Car in." (#build). Uses window.AW from main.js.
   It sets one number, --p (0 -> 1), on the stage, eased towards the scroll position so a wheel's notches
   don't jump the story, and marks the current step (data-beat on the stage, .is-on on its caption).
   fx-build.css does the rest. It only works while the CSS pins the stage (JS, motion welcome, a screen at
   least 500px tall, pow() and container units supported; read live); otherwise the finished picture shows.
   ?p=0.42 in the address holds the story at that point (for reviews and screenshots). */
(function () {
  'use strict';
  var AW = window.AW;
  var track = document.querySelector('[data-build]');
  if (!AW || !track) return;
  var stage = track.querySelector('.bs-stage');
  var caps = Array.prototype.slice.call(track.querySelectorAll('.bs-cap'));
  var at = caps.map(function (c) { return parseFloat(c.getAttribute('data-at')) || 0; });
  var supported = !!(window.CSS && CSS.supports && CSS.supports('width', 'calc(pow(2, 2) * 1px)') && CSS.supports('width', '1cqw'));
  var tall = window.matchMedia('(min-height: 500px)');
  var held = /[?&]p=([\d.]+)/.exec(location.search);
  var fixed = held ? AW.clamp(parseFloat(held[1]), 0, 1) : null;
  var pinned = function () { return supported && tall.matches && AW.motionOK(); };

  // The current step: the last one whose start --p has reached
  var beat = -1;
  var mark = function (p) {
    var b = 0;
    for (var i = 1; i < at.length; i++) if (p >= at[i] - 0.002) b = i;
    if (b === beat) return;
    beat = b;
    stage.setAttribute('data-beat', b);
    caps.forEach(function (c, i) { c.classList.toggle('is-on', i === b); });
  };

  // --p follows the target softly (a fifth of the way each frame)
  var cur = null;
  var target = null;
  var easing = false;
  var step = function () {
    var d = target - cur;
    cur = Math.abs(d) < 0.0005 ? target : cur + d * 0.18;
    stage.style.setProperty('--p', cur.toFixed(4));
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
