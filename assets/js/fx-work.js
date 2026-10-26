/* fx-work.js: Recent work. Owned by the WORK agent; uses window.AW from main.js.
   - The run (wide screens, motion allowed): CSS lays it out and gives the section its length (so nothing
     moves when this file starts); this file moves the track sideways as the page scrolls past the pinned
     stage. Geometry is measured once (on start, resize, load) in track coordinates, so a scroll frame only
     does arithmetic: one read (the section's top), then direct transform writes (the track, each nearby
     photo's drift, the progress line, the heading's step under the header) and the counter. Idle while
     the section is far off screen. A keyboard focus inside the track scrolls the page to bring its card in.
     A resize that changes the run's length keeps a visitor reading below the section where they were.
   - The strip (everything else): previous/next buttons for a mouse, a progress line, and the photos lift
     in together as the strip comes into view (so a swipe never lands on a blank frame).
   Without this file the strip simply swipes, every photo at rest. */
(function () {
  'use strict';

  var AW = window.AW;
  var work = document.querySelector('[data-work]');
  if (!AW || !work) return;

  var root = document.documentElement;
  var one = function (sel) { return work.querySelector(sel); };
  var all = function (sel) { return Array.prototype.slice.call(work.querySelectorAll(sel)); };
  var pin = one('[data-work-pin]');
  var head = one('.work-head');
  var rail = one('[data-work-rail]');
  var track = one('[data-work-track]');
  var strip = one('[data-work-strip]');
  var bar = one('[data-work-bar]');
  var nEl = one('[data-work-n]');
  var totalEl = one('[data-work-total]');
  var cards = all('.work-card');
  var frames = all('.work-frame');
  var imgs = frames.map(function (f) { return f.querySelector('img'); });
  var steps = all('[data-work-step]');
  if (!pin || !head || !rail || !track || !strip || !cards.length) return;

  // The run's query: the same as the media block in fx-work.css (scripting on, wide, motion allowed)
  var RUN = '(scripting: enabled) and (min-width: 1000px) and (min-height: 540px) and (prefers-reduced-motion: no-preference)';
  var runMQ = window.matchMedia(RUN);
  var LAND = 0.2; // a card brought into view by keyboard lands this far across the rail
  var DRIFT = 6;  // % of a photo's width it drifts across a screen's width of travel (it rests at scale 1.16)
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  if (totalEl) totalEl.textContent = pad2(cards.length);
  work.classList.add('is-live'); // the buttons and the progress line work from here

  // Scroll to y without the page's smooth scrolling (html.is-loaded), for corrections nobody should see.
  var jump = function (y) {
    var s = root.style;
    var was = s.scrollBehavior;
    s.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    s.scrollBehavior = was;
  };

  var on = false;      // the run is live (.is-h)
  var near = true;     // the section is within reach of the screen (IntersectionObserver below)
  var span = 0;        // how far the page scrolls while the stage is pinned (CSS sets the section's length)
  var travel = 0;      // how far the track moves over that span
  var railW = 0;
  var railX = 0;
  var frameGeo = [];   // each frame's centre along the track
  var cardGeo = [];    // each card's left edge along the track
  var pinH = 0;
  var hdrStep = 0;     // the heading's full step under the header (the rail's top padding, --hdr-step)
  var lastP = -1;
  var lastStep = -1;
  var active = -1;
  var workH = 0;       // the section's height as last seen
  var lastY = window.scrollY; // the page's scroll position and the screen's height as of the last frame
  var lastVh = window.innerHeight;

  /* ---------- The strip ---------- */
  var stripMax = 0;
  var updateStrip = function () {
    if (on) return;
    var x = strip.scrollLeft;
    var p = stripMax ? AW.clamp(x / stripMax, 0, 1) : 0;
    if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    steps.forEach(function (btn) {
      var dir = Number(btn.getAttribute('data-work-step'));
      var end = dir < 0 ? x <= 2 : x >= stripMax - 2;
      btn.setAttribute('aria-disabled', end ? 'true' : 'false');
    });
  };
  var stripTick = false;
  strip.addEventListener('scroll', function () {
    if (on || stripTick) return;
    stripTick = true;
    AW.raf(function () { stripTick = false; updateStrip(); });
  }, { passive: true });
  steps.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.getAttribute('aria-disabled') === 'true') return;
      var gap = parseFloat(getComputedStyle(strip).columnGap) || 16;
      var stepW = cards[0].getBoundingClientRect().width + gap;
      strip.scrollBy({ left: Number(btn.getAttribute('data-work-step')) * stepW, behavior: AW.motionOK() ? 'smooth' : 'auto' });
    });
  });

  // In the strip, every photo lifts in as the strip arrives: the ones off to the side too (unseen), so a
  // swipe shows photos, not plates. (In the run, each lifts as it slides on: main.js's reveal does that.)
  var revealAll = function () {
    cards.forEach(function (c, i) {
      if (c.classList.contains('is-in')) return;
      c.style.setProperty('--d', Math.min(i, 5) * 80 + 'ms');
      c.classList.add('is-in');
    });
  };
  var stripObs = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    if (on) return;
    for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting) return revealAll();
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }) : null;
  if (stripObs) stripObs.observe(strip);

  /* ---------- The run ---------- */
  var setCount = function (a) {
    var dir = a > active ? 1 : -1;
    var first = active < 0;
    active = a;
    if (!nEl) return;
    nEl.textContent = pad2(a + 1);
    // The new number rolls in from the side of travel
    if (!first && nEl.animate && AW.motionOK()) {
      nEl.animate([{ transform: 'translateY(' + dir * 100 + '%)' }, { transform: 'none' }],
        { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
  };

  // Writes only.
  var place = function (p) {
    var x = -p * travel;
    var vw = window.innerWidth;
    track.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
    if (bar) bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
    for (var i = 0; i < frames.length; i++) {
      var c = railX + x + frameGeo[i];
      if (c < -vw * 0.5 || c > vw * 1.5) continue; // well off screen: leave it where it was
      if (imgs[i]) imgs[i].style.translate = (((c - vw / 2) / vw) * -DRIFT).toFixed(2) + '% 0';
    }
    // The counter shows the card nearest the spot a keyboard-focused card lands on; at the end, the last.
    var a = 0;
    var best = Infinity;
    for (var k = 0; k < cardGeo.length; k++) {
      var d = Math.abs(x + cardGeo[k] - railW * LAND);
      if (d < best) { best = d; a = k; }
    }
    if (p > 0.999) a = cardGeo.length - 1;
    if (a !== active) setCount(a);
  };
  // The heading steps down only as far as the header would cover it (CSS applies it while the header
  // shows): nothing while the heading sits lower on the screen, the full step once the stage is pinned.
  var setStep = function (s) {
    lastStep = s;
    head.style.setProperty('--work-step', s.toFixed(1) + 'px');
  };
  // Reads where the section is (one read) into view; returns the run's progress.
  var view = { inside: false, below: false, run: false, p: 0, step: 0 };
  var look = function () {
    var r = work.getBoundingClientRect();
    var vh = window.innerHeight;
    var p = on && span ? AW.clamp(-r.top / span, 0, 1) : 0;
    view.inside = r.top <= vh / 2 && r.bottom >= vh / 2;
    view.below = r.bottom < vh / 2; // the visitor is reading what follows the section
    view.run = on;
    view.p = p;
    // where the sticky stage sits: with the section, held at the top, then leaving with the section's end
    var pinTop = Math.min(Math.max(r.top, 0), r.bottom - pinH);
    view.step = Math.round(AW.clamp(hdrStep - pinTop, 0, hdrStep) * 2) / 2;
    return p;
  };
  var update = function () {
    var p = look();
    if (!on) return;
    lastP = p;
    place(p);
    setStep(view.step);
  };

  // Decides the layout and caches the geometry (reads and writes freely: it runs on start, resize, load).
  var measure = function () {
    var want = runMQ.matches;
    if (want !== on) {
      on = want;
      work.classList.toggle('is-h', on);
      if (on) {
        strip.removeAttribute('tabindex'); // in the run it doesn't scroll, so it isn't a stop
        work.classList.remove('is-fit');
        rail.scrollLeft = 0; // (it scrolls natively until this file takes over)
      } else {
        strip.setAttribute('tabindex', '0');
        track.style.transform = '';
        imgs.forEach(function (im) { if (im) im.style.translate = ''; });
        head.style.removeProperty('--work-step');
        active = -1;
      }
      lastP = -1;
      lastStep = -1;
    }
    workH = work.offsetHeight;
    if (!on) {
      stripMax = Math.max(0, strip.scrollWidth - strip.clientWidth);
      work.classList.toggle('is-fit', stripMax < 2);
      updateStrip();
      var r = strip.getBoundingClientRect();
      if (r.bottom > 0 && r.top < window.innerHeight) revealAll();
      return;
    }
    railW = rail.clientWidth;
    travel = Math.max(0, track.scrollWidth - railW);
    pinH = pin.offsetHeight;
    span = Math.max(0, workH - pinH);
    hdrStep = parseFloat(getComputedStyle(rail).paddingTop) || 0;
    // In track coordinates: the track's own transform cancels out.
    var t0 = track.getBoundingClientRect().left;
    railX = rail.getBoundingClientRect().left;
    frameGeo = frames.map(function (f) {
      var fr = f.getBoundingClientRect();
      return fr.left - t0 + fr.width / 2;
    });
    cardGeo = cards.map(function (c) { return c.getBoundingClientRect().left - t0; });
  };

  // view says where the visitor is as of the last frame ("inside": the section covers the middle of the
  // screen). A resize or a preference change takes a copy first (keep), before the page reflows under it.
  var keep = null;

  // Re-measures and keeps the visitor's place inside the section: the same point along the run, or the
  // section's start when the layout changes between the run and the strip.
  var remeasure = function () {
    var was = keep;
    keep = null;
    measure();
    if (was && was.inside && (on || was.run)) {
      jump(work.getBoundingClientRect().top + window.scrollY + (on && was.run ? was.p * span : 0));
    }
    update();
  };

  AW.onScrollFrame(function () {
    lastY = window.scrollY; // (free: layout is clean when the frame's jobs read)
    lastVh = window.innerHeight;
    if (!near) return;
    var p = look(); // the one read
    if (!on) return;
    var s = view.step;
    var moved = p !== lastP;
    var stepped = s !== lastStep;
    if (!moved && !stepped) return;
    lastP = p;
    lastStep = s;
    return function () {
      if (moved) place(p);
      if (stepped) setStep(s);
    };
  });

  if ('IntersectionObserver' in window) {
    near = false;
    new IntersectionObserver(function (entries) {
      near = entries[entries.length - 1].isIntersecting;
      if (near) update();
    }, { rootMargin: '50% 0px' }).observe(work);
  }

  // Keyboard: bring a focused card into view by scrolling the page to its spot. Focus from a click or
  // tap (Chrome focuses a link on mousedown) is left alone, so a click never slides the track away.
  var fromPointer = false;
  work.addEventListener('pointerdown', function () {
    fromPointer = true;
    setTimeout(function () { fromPointer = false; }, 0);
  }, true);
  work.addEventListener('focusin', function (e) {
    if (!on || fromPointer) return;
    try { if (!e.target.matches(':focus-visible')) return; } catch (err) {}
    var item = e.target.closest('.work-card, .work-intro, .work-end');
    if (!item) return;
    var x = item.getBoundingClientRect().left - track.getBoundingClientRect().left;
    var p = travel ? AW.clamp((x - railW * LAND) / travel, 0, 1) : 0;
    window.scrollTo(0, work.getBoundingClientRect().top + window.scrollY + p * span);
    rail.scrollLeft = 0;
    pin.scrollLeft = 0;
  });

  // Holding a reader's place below the section through a resize (see queue): where each of the page's
  // blocks (main's sections) began as of the last layout. A ResizeObserver keeps the table current; it
  // runs after layout, so at a resize event the table still describes the page the visitor was reading.
  var blocks = Array.prototype.slice.call(work.parentNode.children);
  var tops = null;
  var mapBlocks = function () {
    var y = window.scrollY;
    tops = blocks.map(function (b) { return b.offsetHeight ? b.getBoundingClientRect().top + y : NaN; });
  };
  if ('ResizeObserver' in window) {
    var ro = new ResizeObserver(mapBlocks);
    blocks.forEach(function (b) { ro.observe(b); });
  }

  // Resizes settle first (a dragged window sends a stream of them); the place is copied at the first one.
  // A visitor reading below the section is held at once, at every step: the run's length follows the
  // screen's size (about 2,000px between 1440 and 900 wide), so without this what they were reading would
  // move by that much. The block that was at the middle of the screen goes back to where it was (this runs
  // before the frame paints, so nothing visibly jumps). It only corrects a page the browser left where it
  // was (desktop browsers keep the scroll position across a width change) or merely stopped at its new
  // end; when the browser has kept its own anchor (a phone or tablet turning), that stands.
  var resizeT = 0;
  var queue = function () {
    if (!keep) {
      keep = {
        inside: near && view.inside,
        // far off: which side of it the visitor is on (the section's top only moves a little in a resize)
        below: near ? view.below : work.getBoundingClientRect().top < 0,
        run: view.run,
        p: view.p
      };
    }
    var h = work.offsetHeight; // the new layout (and any clamp of the scroll position at the page's end)
    if (keep.below) {
      var y = window.scrollY;
      if (Math.abs(y - lastY) < 1 || y >= root.scrollHeight - window.innerHeight - 1) {
        var shift = workH ? h - workH : 0; // (no table: the section's own change)
        if (tops) {
          var line = lastY + lastVh / 2;
          for (var k = blocks.length - 1; k >= 0; k--) {
            if (tops[k] <= line) { shift = blocks[k].getBoundingClientRect().top + y - tops[k]; break; }
          }
        }
        if (Math.abs(shift) >= 0.5) {
          lastY = Math.max(0, lastY + shift);
          jump(lastY);
        }
      }
    }
    // The page as it is now (a media query change can follow the resize event in the same frame, before
    // the observer reports)
    if (tops) mapBlocks();
    lastVh = window.innerHeight;
    workH = h;
    clearTimeout(resizeT);
    resizeT = setTimeout(remeasure, 120);
  };
  var onChange = function (mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  };
  window.addEventListener('resize', queue);
  onChange(runMQ, queue);
  window.addEventListener('load', remeasure);

  remeasure();
})();
