/* fx-process.js: How it works (#how). Owned by the PROCESS agent; uses window.AW from main.js.
   One scroll job: read where each step's node is, then write. A step is lit once its node is above 56% of
   the screen (CSS swings its section of the ladder down from the node), and that section's rungs light
   (--pl, 0 to 1, set on the section) as the reading line travels from its hinge to its end: the next node,
   or for the last section its feet (each section's untransformed box, .hstep-lad, says where it ends). On
   wide screens the stage shows the drawing of the last lit step (step 1 before any) and its number rolls to
   it. A stage drawing plays the first time it shows while the stage is on screen (.is-armed), and holds
   where it is while another step is showing (CSS pauses it). The steps' own drawings (narrow screens) play
   as each comes into view. Whatever is on screen when the page starts is simply shown, complete. The CSS
   hangs every "before" state off .is-live, added here in the same task that sets the first state. */
(function () {
  'use strict';
  var AW = window.AW;
  var sec = document.querySelector('[data-how]');
  if (!AW || !sec) return;
  var all = function (sel) { return Array.prototype.slice.call(sec.querySelectorAll(sel)); };
  var steps = all('[data-how-step]');
  var nodes = steps.map(function (s) { return s.querySelector('.hstep-node'); });
  var lads = steps.map(function (s) { return s.querySelector('.hstep-lad'); }); // the ladder's sections (untransformed boxes)
  var stage = sec.querySelector('[data-how-stage]');
  var panels = all('[data-ps]');
  var roll = sec.querySelector('[data-how-roll]');
  if (!steps.length || nodes.indexOf(null) > -1) return;

  var lit = -1;   // steps lit, as last written
  var shown = 0;  // the stage's step, as last written
  var fills = []; // each line's fill, as last written
  var first = true;

  var job = function () {
    var vh = window.innerHeight;
    var box = sec.getBoundingClientRect();
    if (!first && (box.bottom < -vh || box.top > vh * 2)) return; // far off screen: nothing changes
    var mark = vh * 0.56;
    var centres = nodes.map(function (n) {
      var r = n.getBoundingClientRect();
      return r.top + r.height / 2;
    });
    var st = stage ? stage.getBoundingClientRect() : null;
    var shownAt = !!(st && st.height);
    // A drawing plays once the stage is well in view; as the page starts, any of it on screen counts (shown complete)
    var stageIn = shownAt && (first ? st.top < vh && st.bottom > 0 : st.top < vh * 0.6 && st.bottom > vh * 0.25);
    var on = 0;
    centres.forEach(function (c, i) { if (c < mark) on = i + 1; });
    // each section lights from its hinge (this node) to its own end (the next node; the last one, its foot)
    var ends = lads.map(function (l, i) { return l ? l.getBoundingClientRect().bottom : centres[i + 1]; });
    var pl = centres.map(function (c, i) {
      var end = ends[i];
      return end === undefined || end - c < 1 ? 0 : Math.round(AW.clamp((mark - c) / (end - c), 0, 1) * 1000) / 1000;
    });
    var boot = first;
    first = false;

    return function () {
      steps.forEach(function (s, i) {
        if (on !== lit) s.classList.toggle('is-on', i < on);
        // on the ladder section, its only reader: written on the step, it restyled the step's drawing every frame
        if (pl[i] !== fills[i]) { (lads[i] || s).style.setProperty('--pl', pl[i]); fills[i] = pl[i]; }
      });
      lit = on;
      var show = Math.max(1, on);
      if (show !== shown) {
        shown = show;
        if (roll) roll.style.setProperty('--step', show);
        panels.forEach(function (p, i) { p.classList.toggle('is-on', i + 1 === show); });
      }
      var p = panels[show - 1];
      if (p && stageIn && !p.classList.contains('is-armed')) {
        p.classList.add('is-armed');
        if (boot || !AW.motionOK()) p.classList.add('is-instant'); // on screen as the page starts (or seen still): complete
      }
    };
  };

  // The steps' own drawings (narrow screens) play once nearly half of one is on screen (a drawing builds
  // from the floor up, so it waits to be seen whole rather than starting at its first sliver, as a plain
  // reveal would). On screen as the page starts: shown complete. Hidden ones (wide screens) never intersect.
  var figs = all('.how-fig');
  var figIO = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      if (!AW.motionOK()) en.target.classList.add('is-instant');
      figIO.unobserve(en.target);
    });
  }, { threshold: 0.45 }) : null;
  figs.forEach(function (f) {
    var r = f.getBoundingClientRect();
    if (!figIO || (r.height && r.bottom > 0 && r.top < window.innerHeight)) f.classList.add('is-in', 'is-instant');
    else figIO.observe(f);
  });
  // First state now, with transitions held for two frames, so nothing hides and re-animates in place.
  sec.classList.add('is-still');
  var write = job();
  sec.classList.add('is-live');
  if (write) write();
  AW.raf(function () { AW.raf(function () { sec.classList.remove('is-still'); }); });
  AW.onScrollFrame(job);
})();
