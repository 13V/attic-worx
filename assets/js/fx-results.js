/* fx-results.js: Before & after (#results). Owned by the RESULTS agent; uses window.AW from main.js.
   1. The tabs (one per job): an accessible tablist with a roving tabindex. Arrow keys, Home and End
      move between jobs and show them at once (automatic activation).
   2. The light pass: once, as the pair is well into view, or once the scroll stops with a good part
      of it in view (the CSS does the rest). A pair already on screen while the page starts is shown at rest.
   3. Switching jobs: the old pair leaves fast, the new one arrives under its plates once its photos are
      decoded (or after a short wait). The light doesn't pass again. Reduced motion: an instant swap.
      The other jobs' photos load when a visitor reaches for the tabs. */
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

  // While the page arrives (until two frames after load, when main.js marks html.is-loaded), a pair
  // that comes on screen is shown at rest: no light pass on a reload or a shared link to #results.
  // (A phone can make the jump to #results after DOMContentLoaded, so that was too early.)
  var booting = true;
  var endBoot = function () { raf(function () { raf(function () { booting = false; }); }); };
  if (document.readyState === 'complete') endBoot();
  else window.addEventListener('load', endBoot, { once: true });

  var current = Math.max(0, tabs.findIndex(function (t) { return t.getAttribute('aria-selected') === 'true'; }));

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

  /* ---------- The light pass ---------- */
  var light = function (instant) {
    if (instant) { stage.classList.add('is-in', 'is-instant'); return; }
    // The photos first (briefly): a light passing over empty frames is wasted. Meanwhile the pair
    // waits as it is, the before muted and the after in the dark.
    ready(panels[current], 1200).then(function () { raf(function () { stage.classList.add('is-in'); }); });
  };
  var r = stage.getBoundingClientRect();
  var onScreen = r.bottom > 0 && r.top < window.innerHeight;
  if (onScreen || !motionOK() || !('IntersectionObserver' in window)) {
    light(true);
  } else {
    stage.classList.add('is-armed'); // the after waits in the dark (CSS), off screen
    // How much of the pair is in view, measured against the screen as well as the pair, so a short
    // laptop screen (where a nav link lands with only the top half of the pair showing) still counts.
    // While scrolling: half the pair, or 36% of the screen's height. Once the scroll has stopped
    // (a nav link's glide has landed, or the reader has paused): a third of it, or a quarter.
    // On phones the screen ends at the action bar while it shows.
    var bar = document.querySelector('.action-bar');
    var seen = function (part, ofScreen) {
      var b = stage.getBoundingClientRect();
      var vh = window.innerHeight || document.documentElement.clientHeight;
      if (bar) {
        var a = bar.getBoundingClientRect();
        if (a.height && a.top < vh) vh = Math.max(vh * 0.6, a.top);
      }
      var vis = Math.min(b.bottom, vh) - Math.max(b.top, 0);
      return vis > 0 && vis >= Math.min(b.height * part, vh * ofScreen);
    };
    var settle = 0;
    var listening = false;
    var done = false;
    var fire = function () {
      if (done) return;
      done = true;
      io.disconnect();
      clearTimeout(settle);
      if (listening) window.removeEventListener('scroll', onScroll);
      listening = false;
      light(booting || !motionOK());
    };
    var onSettle = function () { if (!done && seen(1 / 3, 0.25)) fire(); };
    var onScroll = function () { clearTimeout(settle); settle = setTimeout(onSettle, 160); };
    var thresholds = [];
    for (var t = 0; t <= 20; t++) thresholds.push(t / 20);
    var io = new IntersectionObserver(function (entries) {
      var e = entries[entries.length - 1];
      if (!e.isIntersecting) {
        // Out of view again: stop waiting for the scroll to settle
        clearTimeout(settle);
        if (listening) window.removeEventListener('scroll', onScroll);
        listening = false;
        return;
      }
      // Anything of it while the page starts (a link to #results): shown at rest
      if (booting || seen(0.5, 0.36)) { fire(); return; }
      if (!listening) { window.addEventListener('scroll', onScroll, { passive: true }); listening = true; }
      onScroll(); // also counts a stop right here
    }, { threshold: thresholds });
    io.observe(stage);
  }

  /* ---------- Tabs ---------- */
  var timers = panels.map(function () { return 0; });
  var tokens = panels.map(function () { return 0; });

  var clear = function (p, k) {
    clearTimeout(timers[k]);
    tokens[k]++;
    p.classList.remove('is-leaving', 'is-arriving', 'is-pending');
    p.inert = false;
    p.removeAttribute('aria-hidden');
  };

  // The other jobs' photos load only when a visitor reaches for the tabs (hidden pairs aren't rendered,
  // so the browser's lazy loading leaves them alone): most visitors never open them.
  var tablist = sec.querySelector('[role="tablist"]');
  var warm = function () {
    tablist.removeEventListener('pointerover', warm);
    tablist.removeEventListener('focusin', warm);
    tablist.removeEventListener('touchstart', warm);
    panels.forEach(function (p) {
      $$('img', p).forEach(function (img) { if (img.loading === 'lazy') img.loading = 'eager'; });
    });
  };
  if (tablist) {
    tablist.addEventListener('pointerover', warm);
    tablist.addEventListener('focusin', warm);
    tablist.addEventListener('touchstart', warm, { passive: true });
  }

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
