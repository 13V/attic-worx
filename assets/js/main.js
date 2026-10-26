/* Attic Worx: site script. No dependencies.
   1. The motion engine (window.AW): scroll jobs, reveals, word splitting. The fx-*.js files use it.
   2. The page: header, menu, quote form, service links, before/after, recent work, action bar.
   Everything degrades: without this file every section shows at rest and the form shows all three steps. */
(function () {
  'use strict';

  // First act: say JS is here, so CSS may set up "before" states
  var root = document.documentElement;
  root.classList.add('js', 'hdr-on');

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- Motion engine ---------- */
  // Read the preference live: it can change mid-visit.
  var motionMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var motionOK = function () { return !motionMQ.matches; };
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (f) { return setTimeout(f, 16); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

  // One rAF-batched loop for everything that follows the scroll. A job reads layout; if it returns a
  // function, that runs after every job has read, so reads and writes never interleave.
  var jobs = [];
  var ticking = false;
  var runJobs = function () {
    ticking = false;
    var writes = [];
    for (var i = 0; i < jobs.length; i++) {
      var w = jobs[i]();
      if (typeof w === 'function') writes.push(w);
    }
    for (var j = 0; j < writes.length; j++) writes[j]();
  };
  var schedule = function () {
    if (!ticking) { ticking = true; raf(runJobs); }
  };
  var onScrollFrame = function (fn) {
    jobs.push(fn);
    schedule(); // every job also runs once at start
  };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  // Wraps each word in <span class="w"><span style="--w:i">word</span></span> (a mask and the word that
  // rises out of it). Inline children (<span class="hl">, <strong>, <br>) are kept, with their classes.
  var wrapWords = function (el, make) {
    var n = 0;
    var walk = function (node) {
      var out = document.createDocumentFragment();
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          child.nodeValue.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            out.appendChild(/^\s+$/.test(part) ? document.createTextNode(' ') : make(part, n++));
          });
        } else if (child.nodeType === 1) {
          var copy = child.cloneNode(false);
          copy.appendChild(walk(child));
          out.appendChild(copy);
        }
      });
      return out;
    };
    var frag = walk(el);
    el.textContent = '';
    el.appendChild(frag);
  };
  var splitWords = function (el) {
    if (!el || el.classList.contains('is-split') || el.querySelector('.w')) return el; // idempotent
    wrapWords(el, function (word, i) {
      var w = document.createElement('span');
      var inner = document.createElement('span');
      w.className = 'w';
      inner.style.setProperty('--w', i);
      inner.textContent = word;
      w.appendChild(inner);
      return w;
    });
    el.classList.add('is-split');
    return el;
  };
  // A statement's words darken one by one as they cross the reading line (CSS view timelines).
  var splitStatement = function (el) {
    if (el.classList.contains('is-split')) return;
    wrapWords(el, function (word) {
      var w = document.createElement('span');
      w.className = 'sw';
      w.textContent = word;
      return w;
    });
    el.classList.add('is-split');
  };

  // Reveals: .is-in once, as each element scrolls into view. Elements of one section arriving together
  // get a short stagger (--d, 80ms apart, capped at 5), counted per section so a jump that brings two
  // sections in at once doesn't keep the second one waiting; split headings also get a line number
  // per word (--l).
  // While the page starts, every target holds its transitions (.aw-still, for a couple of frames), so
  // nothing animates from how it was first painted (without JS) into its "before" state, or into
  // .is-in. Anything already on screen is shown at rest: .is-in at once, and .is-instant tells
  // keyframe reveals not to play.
  var booting = true;
  var stills = [];
  var hold = function (el) {
    if (!booting || el.classList.contains('aw-still')) return;
    el.classList.add('aw-still');
    stills.push(el);
  };
  var settle = function (el) {
    el.classList.add('is-in');
    if (booting) el.classList.add('is-instant');
  };
  var onScreen = function (el) {
    var r = el.getBoundingClientRect();
    return r.width + r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  };
  var revealObs = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    var hits = entries.filter(function (en) { return en.isIntersecting; }).map(function (en) { return en.target; });
    if (!hits.length) return;
    // Read first: where each split heading's words break into lines...
    var tops = hits.map(function (el) {
      return el.classList.contains('is-split') ? $$('.w', el).map(function (w) { return w.offsetTop; }) : null;
    });
    // ...then write: the stagger within each section, line numbers, then .is-in.
    var groups = [];
    var counts = [];
    hits.forEach(function (el, n) {
      revealObs.unobserve(el);
      var sec = el.closest('section') || document.body;
      var g = groups.indexOf(sec);
      if (g < 0) { g = groups.push(sec) - 1; counts.push(0); }
      el.style.setProperty('--d', Math.min(counts[g]++, 5) * 80 + 'ms');
      if (tops[n]) {
        var line = 0;
        $$('.w', el).forEach(function (w, k) {
          if (k && tops[n][k] > tops[n][k - 1] + 2) line++;
          w.style.setProperty('--l', line);
        });
      }
      el.classList.add('is-in');
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }) : null;

  var place = function (el, seen) {
    hold(el);
    if (el.hasAttribute('data-split')) splitWords(el);
    if (!revealObs || !motionOK() || seen) settle(el); // no observer or reduced motion: at rest too
    else revealObs.observe(el);
  };
  var reveal = function (el) {
    if (!el || el.classList.contains('is-in')) return;
    place(el, booting && onScreen(el));
  };

  // The page's own targets: every read first (one layout), then the writes.
  var targets = $$('[data-reveal], [data-split], [data-rule], [data-draw]');
  var seen = targets.map(onScreen);
  $$('[data-words]').forEach(splitStatement);
  targets.forEach(function (el, i) { place(el, seen[i]); });

  // Boot lasts until the fx-*.js files (deferred, after this one) have run and two frames are out.
  var endBoot = function () {
    if (!booting || endBoot.queued) return;
    endBoot.queued = true;
    raf(function () {
      raf(function () {
        booting = false;
        stills.forEach(function (el) { el.classList.remove('aw-still'); });
        stills = [];
      });
    });
  };
  // In-page links glide (CSS, html.is-loaded) only from here on: the browser's own jump to a shared
  // link's #section, on arrival, stays instant.
  var loaded = function () { raf(function () { raf(function () { root.classList.add('is-loaded'); }); }); };
  if (document.readyState === 'complete') { endBoot(); loaded(); }
  else {
    document.addEventListener('DOMContentLoaded', endBoot);
    window.addEventListener('load', endBoot);
    window.addEventListener('load', loaded);
  }

  window.AW = {
    motionOK: motionOK,
    finePointer: finePointer,
    raf: raf,
    clamp: clamp,
    onScrollFrame: onScrollFrame,
    reveal: reveal,
    splitWords: splitWords
  };

  /* ---------- Header: solid once scrolled; hides while you read down, returns when you scroll up ----------
     html.hdr-on says it's showing (for pinned sections that need to step out from under it). It stays
     near the top, while it holds focus, while the menu is open, and always with reduced motion. */
  var header = $('[data-header]');
  var menu = $('#mobile-menu');
  var menuOpen = function () {
    try { return !!(menu && menu.matches(':popover-open')); } catch (e) { return false; }
  };
  if (header) {
    var lastY = window.scrollY;
    var hidden = false;
    var setHidden = function (hide) {
      if (hide === hidden) return;
      hidden = hide;
      header.classList.toggle('is-hidden', hide);
      root.classList.toggle('hdr-on', !hide);
    };
    onScrollFrame(function () {
      var y = window.scrollY;
      var down = y > lastY + 4;
      var up = y < lastY - 4;
      var hide = hidden;
      // Before load, a move is the browser's own (a shared link's #section, a restored position), not
      // the visitor reading on: the header stays.
      var arriving = !root.classList.contains('is-loaded');
      if (y < 120 || up || menuOpen() || header.contains(document.activeElement) || !motionOK()) hide = false;
      else if (down && !arriving) hide = true;
      if (down || up) lastY = y;
      return function () {
        header.classList.toggle('is-scrolled', y > 24);
        setHidden(hide);
      };
    });
    header.addEventListener('focusin', function () { setHidden(false); });
  }

  /* ---------- Mobile menu (popover): close after choosing a link, and take focus along ---------- */
  // A section link moves focus to its heading (without scrolling), so the next Tab carries on from there
  // instead of from the menu button at the top of the page.
  var focusSpot = function (el) {
    var lab = el.getAttribute('aria-labelledby');
    var target = (lab && document.getElementById(lab)) || el;
    if (!target.hasAttribute('tabindex') && !target.matches('a[href], button, input, select, textarea')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  };
  if (menu) {
    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () {
        if (menuOpen()) menu.hidePopover();
        var id = a.getAttribute('href');
        var spot = id && id.charAt(0) === '#' && id !== '#quote' ? document.getElementById(id.slice(1)) : null;
        if (spot) setTimeout(function () { focusSpot(spot); }, 0); // after the link's own jump
      });
    });
  }

  /* ---------- FAQ: the answer's fade is for answers a visitor opens (not the one open at load) ---------- */
  $$('.faq-item > summary').forEach(function (sum) {
    sum.addEventListener('click', function () { sum.parentNode.classList.add('is-toggled'); });
  });

  /* ---------- Quote form ---------- */
  var form = $('#quote-form');
  var card = $('#quote');
  var goToStep = function () {};

  if (form) {
    var steps = $$('.qf-step', form);
    var bars = $$('.qf-progress span', form);
    var label = $('[data-step-label]', form);
    var head = $('[data-qf-head]', form);
    var done = $('[data-done]', form);
    var storageOnly = $('[data-storage-only]', form);
    var current = 1;

    var showError = function (step, show) {
      var err = $('[data-error]', step);
      if (err) err.hidden = !show;
    };

    // Changing step: the old step leaves fast (it lies over the new one for a moment, inert), the new
    // one comes 3% in from the side of travel. Without motion it's a plain swap.
    var finishSwap = null;
    var swap = function (from, to, dir, enter) {
      if (finishSwap) finishSwap();
      if (!from || from === to || from.hidden || !dir || !motionOK()) {
        if (from && from !== to) from.hidden = true;
        to.hidden = false;
        return;
      }
      var top = from.offsetTop; // read before anything moves
      to.hidden = false;
      from.style.top = top + 'px';
      from.style.setProperty('--dir', dir);
      from.classList.add('qf-leaving');
      from.inert = true;
      var timer;
      var onEnd = function (e) { if (e.target === from && e.animationName === 'aw-step-out') finishSwap(); };
      finishSwap = function () {
        clearTimeout(timer);
        from.removeEventListener('animationend', onEnd);
        finishSwap = null;
        from.classList.remove('qf-leaving');
        from.style.removeProperty('top');
        from.inert = false;
        from.hidden = true;
      };
      from.addEventListener('animationend', onEnd);
      timer = setTimeout(finishSwap, 600); // in case no animation runs
      if (enter && to.animate) {
        to.animate([
          { opacity: 0, transform: 'translateX(' + 3 * dir + '%)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 460, delay: 120, easing: EASE_OUT, fill: 'backwards' });
      }
    };

    goToStep = function (n, focus) {
      if (!done.hidden) return; // sent: the thank-you stays
      var dir = n > current ? 1 : n < current ? -1 : 0;
      var from = steps[current - 1];
      current = n;
      if (n === 2 && storageOnly) {
        // Only ask about storage size when attic storage is part of the job
        storageOnly.hidden = !$('#svc-storage', form).checked;
      }
      swap(from, steps[n - 1], dir, true);
      steps.forEach(function (s, i) {
        if (i !== n - 1 && !s.classList.contains('qf-leaving')) s.hidden = true;
      });
      bars.forEach(function (b, i) { b.classList.toggle('is-done', i < n); });
      if (label) label.textContent = 'Step ' + n + ' of ' + steps.length;
      if (focus) {
        var first = $('input:not([type=hidden]), select, textarea', steps[n - 1]);
        if (first) first.focus({ preventScroll: true });
      }
    };

    var validate = function (n) {
      var step = steps[n - 1];
      var ok = true;
      if (n === 1) {
        ok = $$('input[name="services"]:checked', form).length > 0;
      } else {
        $$('[required]', step).forEach(function (input) {
          var valid = input.value.trim().length > 0;
          if (input.type === 'tel') valid = input.value.replace(/\D/g, '').length >= 8;
          input.setAttribute('aria-invalid', valid ? 'false' : 'true');
          if (!valid) ok = false;
        });
        var email = $('input[type=email]', step);
        if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
          email.setAttribute('aria-invalid', 'true');
          ok = false;
        }
      }
      showError(step, !ok);
      if (!ok) {
        var bad = $('[aria-invalid="true"]', step);
        if (bad) bad.focus();
      }
      return ok;
    };

    $$('[data-next]', form).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (validate(current)) goToStep(current + 1, true);
      });
    });
    $$('[data-back]', form).forEach(function (btn) {
      btn.addEventListener('click', function () { goToStep(current - 1, true); });
    });
    form.addEventListener('change', function (e) {
      var step = e.target.closest('.qf-step');
      if (!step) return;
      if (e.target.name === 'services') showError(step, false);
    });
    form.addEventListener('input', function (e) {
      if (e.target.getAttribute('aria-invalid') === 'true' && e.target.value.trim()) {
        e.target.setAttribute('aria-invalid', 'false');
      }
      var step = e.target.closest('.qf-step');
      if (step && !$('[aria-invalid="true"]', step)) {
        var missing = $$('[required]', step).some(function (input) { return !input.value.trim(); });
        if (!missing) showError(step, false);
      }
    });
    // Enter in a text field moves to the next step instead of submitting early
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.type === 'submit') return;
      if (current < steps.length) {
        e.preventDefault();
        if (validate(current)) goToStep(current + 1, true);
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate(current)) return;
      var data = new FormData(form);
      if (data.get('company')) return; // spam trap filled in

      var payload = {
        services: data.getAll('services').join(', '),
        storage_size: storageOnly && !storageOnly.hidden ? (data.get('size') || '') : '',
        hatch_location: data.get('hatch') || '',
        suburb: data.get('suburb') || '',
        timing: data.get('timing') || '',
        name: data.get('name') || '',
        phone: data.get('phone') || '',
        email: data.get('email') || '',
        notes: data.get('notes') || '',
        source: 'atticworx.com.au quote form',
        page: window.location.href
      };

      var submit = $('[data-submit]', form);
      var endpoint = form.getAttribute('data-endpoint');
      var finish = function () {
        var nameSpot = $('[data-done-name]', form);
        var first = String(payload.name).trim().split(/\s+/)[0];
        if (nameSpot && first) nameSpot.textContent = ', ' + first;
        // The last step leaves like any other; the thank-you plays its own entrance (CSS)
        swap(steps[current - 1], done, 1, false);
        steps.forEach(function (s) { if (!s.classList.contains('qf-leaving')) s.hidden = true; });
        if (head) head.hidden = true;
        done.focus({ preventScroll: true });
        if (window.dataLayer) window.dataLayer.push({ event: 'quote_submitted', services: payload.services });
      };
      var fail = function () {
        submit.disabled = false;
        submit.textContent = 'Get my free quote';
        var err = $('[data-error]', steps[steps.length - 1]);
        err.textContent = 'That didn’t send. Please try again, or call us on 0434 083 530.';
        err.hidden = false;
      };

      if (!endpoint) {
        // No form endpoint set yet (see README). Show the thank-you state so the flow can be reviewed.
        if (window.console) console.warn('Attic Worx quote form: set data-endpoint on #quote-form to receive leads.');
        finish();
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Sending…';
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (res.ok) finish(); else fail();
      }).catch(fail);
    });

    goToStep(1, false);
  }

  /* ---------- Links that open the quote form (and preselect a service) ---------- */
  // A service ticked from further down the page draws its check as the form arrives, not off screen.
  var drawOnArrival = function (tile) {
    tile.classList.add('is-pending');
    var timer;
    var land = function () {
      clearTimeout(timer);
      window.removeEventListener('scrollend', land);
      tile.classList.remove('is-pending');
    };
    window.addEventListener('scrollend', land);
    timer = setTimeout(land, 900);
  };
  var openQuote = function (serviceId) {
    if (!card) return;
    var moving = motionOK();
    if (serviceId) {
      var box = document.getElementById(serviceId);
      if (box && !box.checked) {
        if (moving && !onScreen(card)) drawOnArrival(box.closest('.tile'));
        box.checked = true;
        box.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    card.scrollIntoView({ behavior: moving ? 'smooth' : 'auto', block: 'center' });
    if (form && !form.querySelector('[data-done]').hidden) return;
    window.setTimeout(function () {
      var target = serviceId ? $('[data-step="1"] [data-next]', form) : $('[data-step]:not([hidden]):not(.qf-leaving) input, [data-step]:not([hidden]):not(.qf-leaving) button', form);
      if (target) target.focus({ preventScroll: true });
    }, moving ? 500 : 0);
  };
  $$('[data-service]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      goToStep(1, false);
      openQuote(a.getAttribute('data-service'));
    });
  });
  $$('[data-quote-link]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      openQuote(null);
    });
  });

  /* ---------- Whirlybird: spins faster while the page scrolls, then eases back ---------- */
  // The vanes' CSS animation is the spin; scroll speed only changes its playbackRate. Still with
  // reduced motion (the animation only exists without it), and idle while the card is off screen.
  var vanes = $('.vanes');
  var ventCard = vanes && vanes.closest('.svc');
  if (vanes && ventCard && vanes.getAnimations && 'IntersectionObserver' in window) {
    var spinLive = false;
    var spinRate = 1;
    var boost = 0;
    var sy = window.scrollY;
    var st = performance.now();
    var spinning = false;
    var spin = function () {
      spinning = false;
      var anim = vanes.getAnimations()[0];
      if (!anim) return;
      boost *= 0.93; // the push fades...
      spinRate += (1 + boost - spinRate) * 0.12; // ...and the vanes follow it softly
      if (boost < 0.01 && Math.abs(spinRate - 1) < 0.01) spinRate = 1;
      anim.playbackRate = spinRate;
      if (spinRate !== 1 && spinLive) { spinning = true; raf(spin); }
    };
    new IntersectionObserver(function (entries) {
      spinLive = entries[0].isIntersecting;
      if (spinLive) return;
      // Out of sight: back to the resting speed, unseen
      var anim = vanes.getAnimations()[0];
      boost = 0;
      spinRate = 1;
      if (anim) anim.playbackRate = 1;
    }).observe(ventCard);
    onScrollFrame(function () {
      var now = performance.now();
      var y = window.scrollY;
      var v = Math.abs(y - sy) / Math.max(16, now - st); // px per ms
      sy = y;
      st = now;
      if (!spinLive || !motionOK()) return;
      boost = Math.max(boost, Math.min(4, v * 2.2));
      if (!spinning && boost > 0.05) { spinning = true; raf(spin); }
    });
  }

  /* ---------- Before & after sliders ---------- */
  $$('.ba').forEach(function (ba) {
    var range = $('.ba-range', ba);
    if (!range) return;
    var set = function () { ba.style.setProperty('--pos', range.value + '%'); };
    range.addEventListener('input', set);
    set();
  });
  var tabs = $$('.ba-tab');
  var selectTab = function (tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
  };
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab, false); });
    tab.addEventListener('keydown', function (e) {
      var next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  });

  /* (Recent work: fx-work.js) */

  /* ---------- Mobile action bar: rises once the hero buttons are gone, steps aside for the form ----------
     It's hidden by default in CSS (so it never shows at first paint, then drops away) and .is-visible
     brings it up. Without JS a noscript rule shows it. */
  var bar = $('[data-action-bar]');
  if (bar && !(card && 'IntersectionObserver' in window)) bar.classList.add('is-visible'); // nothing to step aside for
  if (bar && card && 'IntersectionObserver' in window) {
    var heroVisible = true;
    var formVisible = false;
    var shown = null;
    var update = function () {
      var show = !formVisible && !heroVisible;
      if (show === shown) return;
      shown = show;
      hold(bar); // shown while the page starts (opened mid-page): there at once, no slide
      bar.classList.toggle('is-visible', show);
      // Out of the way means out of the tab order too
      bar.setAttribute('aria-hidden', show ? 'false' : 'true');
      $$('a', bar).forEach(function (a) { a.tabIndex = show ? 0 : -1; });
    };
    update();
    new IntersectionObserver(function (entries) {
      formVisible = entries[0].isIntersecting;
      update();
    }, { threshold: 0.2 }).observe(card);
    var heroCta = $('.hero-actions');
    if (heroCta) {
      // The hero buttons only count as on screen once they clear the bar's height above the bottom
      // edge, so a sliver of them at the foot of the first screen leaves the bar up.
      var barH = Math.max(80, Math.ceil(bar.getBoundingClientRect().height));
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
        update();
      }, { rootMargin: '0px 0px -' + barH + 'px 0px' }).observe(heroCta);
    } else {
      heroVisible = false;
    }
  }

  /* ---------- Footer year ---------- */
  var year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
