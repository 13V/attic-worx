/* fx-results.js: Before & after (#results). Owned by the RESULTS agent; uses window.AW from main.js.
   1. The tabs (one per job): an accessible tablist with a roving tabindex. Arrow keys, Home and End
      move between jobs and show them at once (automatic activation).
   2. The light pass: once, as the pair is well into view (the CSS does the rest). A pair already on
      screen while the page starts is shown at rest.
   3. Switching jobs: the old pair leaves fast, the new one arrives under its plates once its photos are
      decoded (or after a short wait), then the light passes again. Reduced motion: an instant swap. */
(function () {
  'use strict';
  var sec = document.getElementById('results');
  if (!sec) return;
  var AW = window.AW || {};
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var motionOK = AW.motionOK || function () { return !reduceMQ.matches; };
  var raf = AW.raf || function (f) { return setTimeout(f, 16); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var stage = sec.querySelector('.rx-stage');
  var tabs = $$('[role="tab"]', sec);
  var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
  if (!stage || !tabs.length || panels.indexOf(null) > -1) return;

  // While the page starts (until DOMContentLoaded and two frames, as main.js does), a pair that comes
  // on screen is shown at rest: no light pass on a reload or a shared link to #results.
  var booting = true;
  var endBoot = function () { raf(function () { raf(function () { booting = false; }); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', endBoot);
  else endBoot();

  /* ---------- The light pass ---------- */
  var light = function (instant) {
    stage.classList.add('is-in');
    if (instant) stage.classList.add('is-instant');
  };
  var r = stage.getBoundingClientRect();
  var onScreen = r.bottom > 0 && r.top < window.innerHeight;
  if (onScreen || !motionOK() || !('IntersectionObserver' in window)) {
    light(true);
  } else {
    stage.classList.add('is-armed'); // the after waits in the dark (CSS), off screen
    var io = new IntersectionObserver(function (entries) {
      var e = entries[0];
      if (!e.isIntersecting) return;
      // Most of the pair in view (or as much of it as fits), or anything of it while the page starts
      var enough = e.intersectionRatio >= 0.55 ||
        e.intersectionRect.height >= Math.min(e.boundingClientRect.height, (e.rootBounds ? e.rootBounds.height : window.innerHeight)) * 0.55;
      if (!enough && !booting) return;
      io.disconnect();
      light(booting || !motionOK());
    }, { rootMargin: '0px 0px -8% 0px', threshold: [0, 0.2, 0.4, 0.55, 0.7] });
    io.observe(stage);
  }

  /* ---------- Tabs ---------- */
  var current = Math.max(0, tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; }));
  var timers = panels.map(function () { return 0; });
  var tokens = panels.map(function () { return 0; });

  var clear = function (p, k) {
    clearTimeout(timers[k]);
    tokens[k]++;
    p.classList.remove('is-leaving', 'is-arriving', 'is-pending');
    p.inert = false;
    p.removeAttribute('aria-hidden');
  };

  // Resolves once every photo in the panel can paint (or after `wait` ms, whichever is first)
  var ready = function (panel, wait) {
    var imgs = $$('img', panel);
    var jobs = imgs.map(function (img) {
      if (img.complete && img.naturalWidth) return Promise.resolve();
      if (img.loading === 'lazy') img.loading = 'eager';
      return img.decode ? img.decode().catch(function () {}) : new Promise(function (res) {
        img.addEventListener('load', res, { once: true });
        img.addEventListener('error', res, { once: true });
      });
    });
    return Promise.race([
      Promise.all(jobs),
      new Promise(function (res) { setTimeout(res, wait); })
    ]);
  };

  var select = function (i, focus) {
    if (i === current) { if (focus) tabs[i].focus(); return; }
    var prev = current;
    current = i;
    tabs.forEach(function (t, k) {
      t.setAttribute('aria-selected', k === i ? 'true' : 'false');
      t.tabIndex = k === i ? 0 : -1;
    });
    if (focus) tabs[i].focus();

    var animate = motionOK();
    // From the first switch on, the scroll-in light pass is done with (a switch before it plays skips it)
    stage.classList.add('is-in', 'is-switched');

    panels.forEach(function (p, k) {
      if (k === i) return;
      var wasShowing = !p.hidden;
      clear(p, k);
      if (animate && k === prev && wasShowing) {
        p.classList.add('is-leaving');
        p.inert = true;
        p.setAttribute('aria-hidden', 'true');
        timers[k] = setTimeout(function () { clear(p, k); p.hidden = true; }, 220);
      } else {
        p.hidden = true;
      }
    });

    var np = panels[i];
    clear(np, i);
    np.hidden = false;
    if (!animate) return;
    void np.offsetWidth; // restart the arrival from its first frame
    np.classList.add('is-arriving', 'is-pending');
    var token = ++tokens[i];
    ready(np, 650).then(function () {
      if (tokens[i] !== token) return; // switched again meanwhile
      raf(function () { if (tokens[i] === token) np.classList.remove('is-pending'); });
    });
  };

  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { select(i, false); });
    tab.addEventListener('keydown', function (e) {
      var n = tabs.length;
      var next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + n) % n;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = n - 1;
      if (next < 0) return;
      e.preventDefault();
      select(next, true);
    });
  });
})();
