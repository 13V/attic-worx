/* Attic Worx: site script. No dependencies.
   1. The motion engine (window.AW): scroll jobs, reveals, word splitting.
   2. The page: header, menu, FAQ, quote form, service links, whirlybird, action bar.
   3. After that block, one block per animated section, each its own function using window.AW and queued
      with AW.section, in this order: Roof build scene (#build), How it works (#how), Before & after
      (#results), Recent work (#work), How much room? (#room). They run right after this file, in order, one
      task each (as separate scripts would, so start-up is a few short tasks rather than one long one), and
      the engine's start-up hold (.aw-still, .is-instant) lasts until they have all run. The hero's
      sequence is CSS only.
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
  var startY = window.scrollY; // (free here, while layout is clean: the header and the whirlybird start from it)
  $$('[data-words]').forEach(splitStatement);
  targets.forEach(function (el, i) { place(el, seen[i]); });

  // The section blocks at the end of this file queue themselves here and run in order, one task each,
  // starting once this file has run. One that throws doesn't stop the rest (the error still reaches the
  // console), as with separate scripts.
  var sections = [];
  var sectionsRun = false;
  var runSections = function () {
    var fn = sections.shift();
    if (!fn) { sectionsRun = true; endBoot(); return; }
    try { fn(); } catch (err) { setTimeout(function () { throw err; }, 0); }
    setTimeout(runSections, 0);
  };
  setTimeout(runSections, 0);

  // Boot lasts until the page has been parsed (DOMContentLoaded) and the section blocks have run, and
  // two frames are out.
  var domReady = false;
  var endBoot = function () {
    if (!booting || endBoot.queued || !domReady || !sectionsRun) return;
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
  var ready = function () { domReady = true; endBoot(); };
  if (document.readyState === 'complete') { ready(); loaded(); }
  else {
    document.addEventListener('DOMContentLoaded', ready);
    window.addEventListener('load', ready);
    window.addEventListener('load', loaded);
  }

  window.AW = {
    motionOK: motionOK,
    finePointer: finePointer,
    raf: raf,
    clamp: clamp,
    onScrollFrame: onScrollFrame,
    reveal: reveal,
    splitWords: splitWords,
    section: function (fn) { sections.push(fn); }
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
    var lastY = startY;
    var hidden = false;
    // An in-page link's glide is the page moving, not the visitor reading on: the header stays while it
    // runs (the section lands under it, in the room scroll-padding-top keeps). The glide counts as over
    // once the page has been still for a quarter of a second.
    var glideUntil = 0;
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (a && a.getAttribute('href').length > 1) glideUntil = performance.now() + 600;
    });
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
      var now = performance.now();
      var gliding = now < glideUntil;
      if (gliding && (down || up)) glideUntil = now + 250;
      if (y < 120 || up || menuOpen() || header.contains(document.activeElement) || !motionOK()) hide = false;
      else if (down && !arriving && !gliding) hide = true;
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
    // Tab (or Shift+Tab) out of the open menu closes it, as a tap outside does: the menu covers the page on
    // phones, so focus would go on behind it, out of sight. (Switching tab or app blurs with nowhere to go:
    // the menu stays.)
    menu.addEventListener('focusout', function (e) {
      if (menuOpen() && e.relatedTarget && !menu.contains(e.relatedTarget)) menu.hidePopover();
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

    // Each step's message is a role="alert" (announced as it shows, or when its text changes). The HTML text
    // is the step's own; a bad email or a failed send says something else, so it's kept to go back to.
    $$('[data-error]', form).forEach(function (err) { err.setAttribute('data-msg', err.textContent); });
    var showError = function (step, show, msg) {
      var err = $('[data-error]', step);
      if (!err) return;
      if (show) err.textContent = msg || err.getAttribute('data-msg');
      err.hidden = !show;
      // While it shows, the fields it's about carry it as their description, so a screen reader landing on
      // one hears why (no field marked: the step's group). Not set in the HTML: a field pointing at a hidden
      // message would still have it read out.
      $$('[aria-describedby="' + err.id + '"]', form).forEach(function (el) { el.removeAttribute('aria-describedby'); });
      if (show) {
        var about = $$('[aria-invalid="true"]', step);
        (about.length ? about : [step]).forEach(function (el) { el.setAttribute('aria-describedby', err.id); });
      }
    };

    // On a phone the card is taller than the screen, and by the time a visitor taps Next or Send (often with
    // the keyboard up) its top can be well above it: the new step's title, or the thank-you, would open out of
    // sight. The card's top comes back under the header first (where it's already in view, nothing moves).
    var showTop = function () {
      var line = parseFloat(getComputedStyle(root).scrollPaddingTop) || 0;
      var top = card ? card.getBoundingClientRect().top : 0;
      if (top < line - 1) window.scrollTo({ top: window.scrollY + top - line, behavior: motionOK() ? 'smooth' : 'auto' });
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
        // The step's first control a visitor can reach (step 2's storage question is hidden unless
        // storage is ticked); in a radio group, the option already chosen (the room visualiser may have
        // picked the size), as Tab would
        var first = $$('input:not([type=hidden]), select, textarea', steps[n - 1]).filter(function (el) {
          return !el.closest('[hidden]');
        })[0];
        if (first && first.type === 'radio') first = $('input[name="' + first.name + '"]:checked', steps[n - 1]) || first;
        showTop();
        if (first) first.focus({ preventScroll: true });
      }
    };

    var validate = function (n) {
      var step = steps[n - 1];
      var ok = true;
      var msg = null; // the step's own message
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
        if (email) {
          var badEmail = !!email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
          email.setAttribute('aria-invalid', badEmail ? 'true' : 'false');
          if (badEmail && ok) msg = 'Check your email address, or leave it blank.'; // only the email is wrong
          if (badEmail) ok = false;
        }
      }
      showError(step, !ok, msg);
      if (!ok) {
        // the first thing to fix (step 1: the first tile)
        var bad = $('[aria-invalid="true"]', step) || (n === 1 && $('input', step));
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
      // fixed, or (an optional field) emptied
      if (e.target.getAttribute('aria-invalid') === 'true' && (e.target.value.trim() || !e.target.required)) {
        e.target.setAttribute('aria-invalid', 'false');
        e.target.removeAttribute('aria-describedby');
      }
      var step = e.target.closest('.qf-step');
      if (step && !$('[aria-invalid="true"]', step)) {
        var missing = $$('[required]', step).some(function (input) { return !input.value.trim(); });
        if (!missing) showError(step, false);
      }
    });
    // Enter in a text field moves to the next step instead of submitting early (a button or link does its
    // own job: Back goes back)
    form.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA' || e.target.closest('button, a')) return;
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
        showTop();
        done.focus({ preventScroll: true });
        if (window.dataLayer) window.dataLayer.push({ event: 'quote_submitted', services: payload.services });
      };
      var fail = function () {
        submit.disabled = false;
        submit.textContent = 'Get my free quote';
        submit.focus(); // (disabled while sending, it had lost focus); then the message is announced
        showError(steps[steps.length - 1], true, "That didn't send. Please try again, or call us on 0485 065 143.");
      };

      if (!endpoint) {
        // No form endpoint set yet (see README). Show the thank-you state so the flow can be reviewed, except
        // on the live domain: there nothing was sent, so the visitor gets the phone number instead.
        if (window.console) console.warn('Attic Worx quote form: set data-endpoint on #quote-form to receive leads.');
        if (/(^|\.)atticworx\.com\.au$/.test(window.location.hostname)) fail(); else finish();
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

  /* ---------- Whirlybird: spins with the breeze, faster while the page scrolls, then winds down ---------- */
  // The vanes' CSS animation is the spin; scroll speed only changes its playbackRate. It turns as the card
  // comes into view and while the page moves, and a few seconds after the page goes still it coasts to a
  // stop, as a whirlybird does when the breeze drops: nothing moves on its own for long (WCAG 2.2.2); a
  // scroll starts it again. Still with reduced motion (the animation only exists without it), and stopped
  // while the card is off screen.
  var vanes = $('.vanes');
  var ventCard = vanes && vanes.closest('.svc');
  if (vanes && ventCard && vanes.getAnimations && 'IntersectionObserver' in window) {
    var spinLive = false;
    var spinRate = 1;
    var idle = 1; // the speed it settles to: 1 while there's a breeze, 0 once it has dropped
    var boost = 0;
    var sy = startY;
    var st = performance.now();
    var spinning = false;
    var STILL_MS = 4500;
    var lastGust = 0;
    var calm = 0;
    var stopped = false;
    var spin = function () {
      spinning = false;
      var anim = vanes.getAnimations()[0];
      if (!anim) return;
      boost *= 0.93; // the push fades...
      spinRate += (idle + boost - spinRate) * (idle ? 0.12 : 0.04); // ...and the vanes follow it softly (and coast down slowly)
      if (boost < 0.01 && Math.abs(spinRate - idle) < 0.01) spinRate = idle;
      anim.playbackRate = spinRate;
      if (!spinRate) { anim.pause(); stopped = true; } // wound down: stopped where it is
      else if (spinRate !== idle && spinLive) { spinning = true; raf(spin); }
    };
    var kick = function () { if (!spinning) { spinning = true; raf(spin); } };
    // the breeze drops once the page has been still for STILL_MS
    var settle = function () {
      var wait = lastGust + STILL_MS - performance.now();
      if (wait > 20) { calm = setTimeout(settle, wait); return; }
      calm = 0;
      idle = 0;
      kick();
    };
    var gust = function () {
      lastGust = performance.now();
      if (!calm) calm = setTimeout(settle, STILL_MS);
      idle = 1;
      if (stopped) {
        stopped = false;
        var anim = vanes.getAnimations()[0];
        if (anim) anim.play();
      }
      if (boost > 0.05 || spinRate !== idle) kick();
    };
    // (An observer can deliver more than one entry for its target at once: the last one is current.)
    new IntersectionObserver(function (entries) {
      spinLive = entries[entries.length - 1].isIntersecting;
      var anim = vanes.getAnimations()[0];
      if (!anim) return;
      if (spinLive) { anim.play(); stopped = false; gust(); return; }
      // Out of sight: back to the resting speed and stopped, so it costs nothing (it picks up where it was)
      clearTimeout(calm);
      calm = 0;
      boost = 0;
      spinRate = idle = 1;
      anim.playbackRate = 1;
      anim.pause();
    }).observe(ventCard);
    onScrollFrame(function () {
      var now = performance.now();
      var y = window.scrollY;
      var v = Math.abs(y - sy) / Math.max(16, now - st); // px per ms
      sy = y;
      st = now;
      if (!spinLive || !motionOK()) return;
      boost = Math.max(boost, Math.min(4, v * 2.2));
      gust();
    });
    // Motion allowed again mid-visit: a new animation starts at speed 1, so it gets the same few seconds
    var rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    var onRm = function () { if (spinLive && motionOK()) { spinRate = 1; gust(); } };
    if (rm.addEventListener) rm.addEventListener('change', onRm); else if (rm.addListener) rm.addListener(onRm);
  }

  /* ---------- Mobile action bar: rises once the hero buttons are gone, steps aside for the form ----------
     It's hidden by default in CSS (so it never shows at first paint, then drops away) and .is-visible
     brings it up. Without JS a noscript rule shows it. */
  var bar = $('[data-action-bar]');
  // Its height, for what has to clear it (the build scene's caption, the footer, scroll-padding): with large
  // text its buttons wrap and it grows past the 71px the CSS assumes. Only written when it changes.
  if (bar && 'ResizeObserver' in window) {
    var barSize = -1;
    new ResizeObserver(function () {
      var h = bar.offsetHeight;
      if (h === barSize) return;
      barSize = h;
      root.style.setProperty('--bar-h', h + 'px');
    }).observe(bar);
  }
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
      formVisible = entries[entries.length - 1].isIntersecting;
      update();
    }, { threshold: 0.2 }).observe(card);
    var heroCta = $('.hero-actions');
    if (heroCta) {
      // The hero buttons only count as on screen once they clear the bar's height above the bottom
      // edge, so a sliver of them at the foot of the first screen leaves the bar up.
      var barH = Math.max(80, Math.ceil(bar.getBoundingClientRect().height));
      new IntersectionObserver(function (entries) {
        heroVisible = entries[entries.length - 1].isIntersecting;
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

/* ==================== Roof build scene: "Boxes up. Car in." (#build) ==================== */
/* Uses window.AW (above). It eases one number, --p (0 -> 1), towards the scroll position so a wheel's
   notches don't jump the story, and marks the current step (data-beat on the stage, .is-on on its caption). --p goes on the stage
   (the rail), on each moving part while it moves, and on portrait stages on the svg as --bs-cam (the
   phone camera) while that moves.
   It also marks the end (data-shut, once --p passes the svg's data-shut): the roller door and the garage
   light are timed transitions from there. styles.css does the rest. It only works while the CSS pins the
   stage (JS, motion welcome, a screen at least 500px tall, pow() and container units supported; read
   live); otherwise the finished picture shows. */
window.AW.section(function () {
  'use strict';
  var AW = window.AW;
  var track = document.querySelector('[data-build]');
  if (!AW || !track) return;
  var stage = track.querySelector('.bs-stage');
  var svgs = Array.prototype.slice.call(track.querySelectorAll('.bs-svg'));
  var svg = track.querySelector('.bs-svg[data-shut]') || svgs[0];
  var shutAt = svg ? parseFloat(svg.getAttribute('data-shut')) || 2 : 2;
  var caps = Array.prototype.slice.call(track.querySelectorAll('.bs-cap'));
  var at = caps.map(function (c) { return parseFloat(c.getAttribute('data-at')) || 0; });
  var supported = !!(window.CSS && CSS.supports && CSS.supports('width', 'calc(pow(2, 2) * 1px)') && CSS.supports('width', '1cqw'));
  var tall = window.matchMedia('(min-height: 500px)');
  var scripting = window.matchMedia('(scripting: enabled)'); // as the CSS asks (false where it's unknown)
  var pinned = function () { return supported && scripting.matches && tall.matches && AW.motionOK(); };

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
  var windows = function (st, keys) {
    var w = [];
    keys.forEach(function (k) {
      var s = num(st, k[0]), d = num(st, k[1]);
      if (s !== null && d !== null) w.push([s - 0.012, s + d + 0.012]);
    });
    return w;
  };
  var parts = Array.prototype.map.call(track.querySelectorAll('.bs-svg .m'), function (el) {
    return { els: [el], prop: '--p', w: windows(el.getAttribute('style') || '', [['a', 'l'], ['b', 'k'], ['b', 'm'], ['c', 'm'], ['ra', 'rl']]), at: null };
  });
  // The portrait camera (phones, upright tablets) moves the drawing, in its own two windows; elsewhere it
  // isn't written at all (a write restyles the svg).
  var camQ = window.matchMedia('(max-width: 760px), (max-aspect-ratio: 1/1)');
  var cam = svg ? { els: svgs, prop: '--bs-cam', w: windows(svg.getAttribute('style') || '', [['cam-a', 'cam-l'], ['cam-b', 'cam-m']]), at: null } : null;
  var onCam = function () { if (cam) cam.at = null; written = ''; };
  if (camQ.addEventListener) camQ.addEventListener('change', onCam); else if (camQ.addListener) camQ.addListener(onCam);
  var where = function (p, w) {
    var k = '';
    for (var i = 0; i < w.length; i++) k += p <= w[i][0] ? '0' : p >= w[i][1] ? '1' : 'x';
    return k;
  };
  var touch = function (o, p, v) {
    var k = where(p, o.w);
    if (k !== o.at || k.indexOf('x') >= 0) {
      o.at = k;
      for (var j = 0; j < o.els.length; j++) o.els[j].style.setProperty(o.prop, v);
    }
  };
  var write = function (v) {
    var p = +v;
    stage.style.setProperty('--p', v); // the rail
    if (cam && camQ.matches) touch(cam, p, v);
    for (var i = 0; i < parts.length; i++) touch(parts[i], p, v);
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
      live = entries[entries.length - 1].isIntersecting;
      if (live) { snap = true; window.dispatchEvent(new Event('scroll')); }
    }, { rootMargin: '25% 0px' }).observe(track);
  }

  // Where the reader is in the track as of the last frame: [fraction of its travel, its top on the page, its
  // travel] (see the resize listener below)
  var place = null;

  AW.onScrollFrame(function () {
    if (!live || !pinned()) { place = null; return; }
    // read: where the track is, how long the stage stays pinned
    var top = track.getBoundingClientRect().top;
    var travel = track.offsetHeight - stage.offsetHeight;
    var f = -top / Math.max(1, travel);
    place = f > 0 && f < 1 ? [f, window.scrollY + top, travel] : null;
    var p = AW.clamp(f / 0.88, 0, 1); // the last 12% holds the end
    return function () {
      // write
      target = p;
      if (cur === null || snap) {
        snap = false;
        cur = target;
        step();
        return;
      }
      if (!easing && step()) { easing = true; AW.raf(loop); }
    };
  });

  // A resize mid-story (a desktop window resized, DevTools opened) changes the track's length (it's 430vh)
  // and often what's above it: the reader stays at the same point of the story, not wherever the old scroll
  // position now falls. Only when the track itself moved or changed length, so a phone's address bar
  // showing or hiding (neither changes) never pulls a fling back.
  window.addEventListener('resize', function () {
    if (!place || !pinned()) return;
    var top = track.getBoundingClientRect().top + window.scrollY;
    var travel = track.offsetHeight - stage.offsetHeight;
    if (Math.abs(top - place[1]) < 1 && Math.abs(travel - place[2]) < 1) return;
    place = [place[0], top, travel];
    snap = true;
    window.scrollTo({ top: Math.round(top + place[0] * travel), behavior: 'instant' });
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

  // Wide screens: the step titles sit in a row and each step's paragraph (and the last one's button) shows
  // under them. Where they start and how much room they need is measured (the tallest title, the tallest
  // paragraph), so large text or wider text spacing never prints a paragraph over the titles. At default
  // text this gives the CSS fallbacks (74px, 78px). It runs only when a size changes, never per frame.
  var row = track.querySelector('.bs-caps');
  var texts = Array.prototype.slice.call(track.querySelectorAll('.bs-cap p, .bs-cap .btn'));
  if (row && texts.length && 'ResizeObserver' in window) {
    var fit = '';
    var measure = function () {
      var k = '';
      if (getComputedStyle(texts[0]).position === 'absolute') { // the row layout (not the panel or the list)
        var rowTop = row.getBoundingClientRect().top;
        var titles = 0, para = 0, btn = 0;
        caps.forEach(function (c) { titles = Math.max(titles, c.getBoundingClientRect().bottom - rowTop); });
        texts.forEach(function (t) {
          var h = t.getBoundingClientRect().height;
          if (t.tagName === 'P') para = Math.max(para, h); else btn = Math.max(btn, h);
        });
        var top = Math.ceil(titles + 18);
        k = top + 'px,' + Math.ceil(Math.max(18 + para, 10 + btn) + 11) + 'px';
      }
      if (k === fit) return;
      fit = k;
      var v = k.split(',');
      if (k) { row.style.setProperty('--bs-cap-top', v[0]); row.style.setProperty('--bs-cap-pad', v[1]); }
      else { row.style.removeProperty('--bs-cap-top'); row.style.removeProperty('--bs-cap-pad'); }
    };
    var ro = new ResizeObserver(measure);
    ro.observe(row);
    texts.forEach(function (t) { ro.observe(t); });
  }
});

/* ==================== How it works (#how) ==================== */
/* Uses window.AW (above). One scroll job: read where each step's node is, then write. A step is lit once its node is above 56% of
   the screen (CSS swings its section of the ladder down from the node), and that section's rungs light
   (--pl, 0 to 1, set on the section) as the reading line travels from its hinge to its end: the next node,
   or for the last section its feet (each section's untransformed box, .hstep-lad, says where it ends). On
   wide screens the stage shows the drawing of the last lit step (step 1 before any) and its number rolls to
   it. A stage drawing plays the first time it shows while the stage is on screen (.is-armed), and holds
   where it is while another step is showing (CSS pauses it). The steps' own drawings (narrow screens) play
   as each comes into view. Whatever is on screen when the page starts is simply shown, complete. The CSS
   hangs every "before" state off .is-live, added here in the same task that sets the first state. */
window.AW.section(function () {
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

  var near = false; // the section is close enough to the screen for the job to work

  var job = function () {
    var vh = window.innerHeight;
    var box = sec.getBoundingClientRect();
    near = box.bottom >= -vh && box.top <= vh * 2;
    if (!first && !near) return; // far off screen: nothing changes
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

  // Once the page has been still for 160 ms (a link's glide has landed, or the reader has stopped with the
  // heading mid-screen), less of the stage is enough: a third of it, or a quarter of the screen's height.
  // The line above alone wants three quarters of the stage on a 1080p screen, so a reader who stopped
  // there would look at an empty grid. (Before & after waits the same way.)
  if (stage) {
    var stillTimer = 0;
    var onStill = function () {
      var p = panels[shown - 1];
      if (!near || !p || p.classList.contains('is-armed')) return;
      var vh = window.innerHeight;
      var st = stage.getBoundingClientRect();
      var vis = Math.min(st.bottom, vh) - Math.max(st.top, 0);
      if (!st.height || vis <= 0 || vis < Math.min(st.height / 3, vh * 0.25)) return;
      p.classList.add('is-armed');
      if (!AW.motionOK()) p.classList.add('is-instant');
    };
    window.addEventListener('scroll', function () {
      clearTimeout(stillTimer);
      stillTimer = setTimeout(onStill, 160);
    }, { passive: true });
  }
});

/* ==================== Before & after (#results) ==================== */
/* Uses window.AW (above).
   1. The tabs (one per job): an accessible tablist with a roving tabindex. Arrow keys, Home and End
      move between jobs and show them at once (automatic activation).
   2. The light pass: once, as the pair is well into view, or once the scroll stops with a good part
      of it in view (the CSS does the rest). A pair already on screen while the page starts is shown at rest.
   3. Switching jobs: the old pair leaves fast, the new one arrives under its plates once its photos are
      decoded (or after a short wait). The light doesn't pass again. Reduced motion: an instant swap.
      The other jobs' photos load when a visitor reaches for the tabs. */
window.AW.section(function () {
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
});

/* ==================== Recent work (#work) ==================== */
/* Uses window.AW (above).
   - The run (wide screens, motion allowed): CSS lays it out and gives the section its length (so nothing
     moves when this file starts); this file moves the track sideways as the page scrolls past the pinned
     stage. Geometry is measured once (on start, resize, load) in track coordinates, so a scroll frame only
     does arithmetic: one read (the section's top), then direct transform writes (the track, each nearby
     photo's drift, the progress line, the heading's step under the header) and the counter. Idle while
     the section is far off screen. A keyboard focus inside the track scrolls the page to bring its card in.
     A resize that changes the run's length keeps a visitor reading below the section where they were.
   - The strip (everything else): previous/next buttons for a mouse, a progress line, and the photos lift
     in together as the strip comes into view (so a swipe never lands on a blank frame).
   - The work light (both): each photo gets a light value (0 to 1), written as its shade's opacity (and,
     in the strip, as --work-lit for its glow; the quote button's too). In the run it's worked out in the
     same scroll frame as the track, from where each photo is: the light hangs where the first photo
     starts (near the middle of the rail), every photo is lit as it passes under it and its neighbours
     catch the edge of it (a gaussian over the spacing), and over the last two photos the light moves on
     and comes to rest on the quote button. Its pool on the band (.work-light) moves with it, and the
     counter names the photo nearest it. In the strip the photo it has come to rest on (the nearest snap
     position) is lit, its neighbours a little; at the end of the strip, the quote button, with any photos
     the strip can't snap to (they sit in full view at its end).
   Without this file the strip simply swipes, every photo at rest and lit. */
window.AW.section(function () {
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
  var light = one('[data-work-light]');
  var endEl = one('.work-end');
  var goBtn = endEl && endEl.querySelector('.btn');
  if (!pin || !head || !rail || !track || !strip || !cards.length) return;

  // The run's query: the same as the media block in styles.css (scripting on, wide, motion allowed; em, so
  // larger default text gets the strip)
  var RUN = '(scripting: enabled) and (min-width: 62.5em) and (min-height: 33.75em) and (prefers-reduced-motion: no-preference)';
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
  var pinH = 0;
  var hdrStep = 0;     // the heading's full step under the header (the rail's top padding, --hdr-step)
  var lastP = -1;
  var lastStep = -1;
  var active = -1;
  var workH = 0;       // the section's height as last seen
  var lastY = window.scrollY; // the page's scroll position and the screen's height as of the last frame
  var lastVh = window.innerHeight;

  /* ---------- The work light ---------- */
  // Who can be lit: the photos (their shades; and, in the strip, their frames for the glow), then the
  // end panel's quote button (its glow, in the strip; in the run the pool lights it).
  var shades = frames.map(function (f) { return f.querySelector('.work-shade'); });
  var DIM = 0.28;      // a shade's opacity out of the light (styles.css --wl-dim, read in measure)
  var litNow = [];     // the light as last written, per item (cleared when the layout changes)
  var setLit = function (i, v) {
    v = Math.round(v * 1000) / 1000;
    if (litNow[i] === v) return;
    litNow[i] = v;
    if (i < frames.length) {
      if (shades[i]) shades[i].style.opacity = (DIM * (1 - v)).toFixed(3);
      if (!on) frames[i].style.setProperty('--work-lit', v);
    } else if (goBtn && !on) {
      goBtn.style.setProperty('--work-lit', v);
    }
  };
  var SPILL = 0.3;     // the strip: what the lit photo's neighbours catch
  var FALL = 0.72;     // the run: the light's falloff (its gaussian width) as a share of the photos' spacing
  var station = 0;     // the run, in rail coordinates: where the light hangs (where the first photo starts)
  var midY = 0;        // ...the photos' middle line
  var goX = 0;         // the quote button's centre (track coordinates, across; rail coordinates, down)
  var goY = 0;
  var handOff = 1;     // the run's progress at which the light leaves its station for the button
  var sigma = 1;
  // An element's centre on screen, less its own translate (a reveal may be holding it a few px down).
  var centreOf = function (el) {
    var r = el.getBoundingClientRect();
    var t = (getComputedStyle(el).translate || '').split(' ');
    return { x: r.left + r.width / 2 - (parseFloat(t[0]) || 0), y: r.top + r.height / 2 - (parseFloat(t[1]) || 0) };
  };

  /* ---------- The strip ---------- */
  var stripMax = 0;
  var stripSnap = [];  // where the strip rests for each lit item (card i at the snap line; the end panel at the end)
  var stripLit = -2;
  var lit1 = [];       // (scratch) which items are lit
  // The strip's light: the place it rests nearest (ties go to the later item), and every item that rests
  // there, its neighbouring photos a little. Mostly that's one photo, the one at the snap line. At the end
  // of the strip it's the quote button, plus any photos that can't reach the snap line (their spot is
  // past the end of the strip, so the strip stops short of it): those all sit in full view there, so
  // they're lit with the button rather than never. On a phone that's the button alone. Everything fits:
  // everything lit.
  var lightStrip = function (x) {
    var a = -1;
    if (stripMax >= 2) {
      var best = Infinity;
      for (var i = 0; i < stripSnap.length; i++) {
        var d = Math.abs(x - stripSnap[i]);
        if (d <= best) { best = d; a = i; }
      }
    }
    if (a === stripLit) return;
    stripLit = a;
    var n = frames.length + (goBtn ? 1 : 0);
    var k;
    for (k = 0; k < n; k++) lit1[k] = a < 0 || Math.abs(stripSnap[k] - stripSnap[a]) < 4;
    for (k = 0; k < n; k++) {
      var near1 = k < cards.length && (lit1[k - 1] || lit1[k + 1]);
      setLit(k, lit1[k] ? 1 : near1 ? SPILL : 0);
    }
  };
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
    lightStrip(x);
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
    // The light: at its station until the hand-off, then on (smoothly) to the button, a little smaller.
    // As it settles at the end it opens up a little, so the last photo keeps some of it.
    var lx = station;
    var ly = midY;
    var ls = 1;
    var sg = sigma;
    if (p > handOff) {
      var t = (p - handOff) / (1 - handOff);
      t = t * t * (3 - 2 * t);
      lx += (goX - travel - station) * t;
      ly += (goY - midY) * t;
      ls -= 0.22 * t;
      sg *= 1 + 0.3 * t;
    }
    if (light) light.style.transform = 'translate3d(' + lx.toFixed(1) + 'px,' + ly.toFixed(1) + 'px,0) scale(' + ls.toFixed(3) + ')';
    // The counter names the photo nearest the light (at the very end, the last).
    var a = 0;
    var best = Infinity;
    for (var i = 0; i < frames.length; i++) {
      var dx = x + frameGeo[i] - lx;
      var g = dx / sg;
      setLit(i, Math.exp(-g * g));
      if (Math.abs(dx) < best) { best = Math.abs(dx); a = i; }
      var c = railX + x + frameGeo[i];
      if (c < -vw * 0.5 || c > vw * 1.5) continue; // well off screen: leave it where it was
      if (imgs[i]) imgs[i].style.translate = (((c - vw / 2) / vw) * -DRIFT).toFixed(2) + '% 0';
    }
    if (goBtn) {
      var ge = (x + goX - lx) / sg;
      setLit(frames.length, Math.exp(-ge * ge));
    }
    if (p > 0.999) a = frames.length - 1;
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
        if (light) light.style.transform = '';
        active = -1;
      }
      lastP = -1;
      lastStep = -1;
      stripLit = -2;
      litNow = [];
    }
    DIM = parseFloat(getComputedStyle(work).getPropertyValue('--wl-dim')) || DIM;
    workH = work.offsetHeight;
    if (!on) {
      stripMax = Math.max(0, strip.scrollWidth - strip.clientWidth);
      work.classList.toggle('is-fit', stripMax < 2);
      var first = cards[0].getBoundingClientRect().left;
      stripSnap = cards.map(function (c) { return AW.clamp(c.getBoundingClientRect().left - first, 0, stripMax); });
      if (goBtn) stripSnap.push(stripMax);
      stripLit = -2;
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
    // The light (rail coordinates: the track starts at the rail's left edge). It hangs where the first
    // photo's middle is when the run starts, kept near the middle of the rail; it hands off to the button
    // as the second-last photo passes under it, so the last one is lit on the way.
    var rr = rail.getBoundingClientRect();
    var f0 = frames[0].getBoundingClientRect();
    var n = frameGeo.length;
    midY = f0.top - rr.top + f0.height / 2;
    station = AW.clamp(frameGeo[0], railW * 0.4, railW * 0.6);
    sigma = Math.max(1, FALL * (n > 1 ? (frameGeo[n - 1] - frameGeo[0]) / (n - 1) : f0.width));
    if (goBtn) {
      var gc = centreOf(goBtn);
      goX = gc.x - t0;
      goY = gc.y - rr.top;
    } else {
      goX = frameGeo[n - 1];
      goY = midY;
    }
    handOff = travel ? AW.clamp((frameGeo[Math.max(0, n - 2)] - station) / travel, 0, 0.95) : 0.95;
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
});

/* ==================== How much room? (#room) ==================== */
/* Uses window.AW (above). The slider sizes a storage floor (2–20 m²). This file keeps the numbers and the text in step, and
   tells the picture which size to show by toggling .on on just the sheets and things that change
   (styles.css moves them). The first time the picture comes into view, the light comes up through
   the manhole and the floor lays itself out to the slider's size. "Price a floor this size" also
   picks the matching size in the quote form (main.js's [data-service] handler ticks Attic storage
   and takes you there). Without this file the section shows 8 m², as written in index.html. */
window.AW.section(function () {
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
     - about a third of the floor holds boxes. The rest is the 600 mm walkway from the manhole (about a
       quarter of a typical floor), a clear strip along each side where the roof comes down low, room
       to reach in and lift a box out, and the gaps between boxes and around the roof framing.
     So boxes ≈ 2 × (m² ÷ 3) / (0.42 × 0.32), about 5 per m², rounded to the nearest 5, so every whole
     m² changes the figure by 5:
     2 m² → 10, 4 m² → 20, 8 m² → 40, 12 m² → 60, 16 m² → 80, 20 m² → 100.
     The picture shows a mix (tubs, cases, camping and sports gear stand in for some of the boxes), so
     it holds fewer boxes than the figure; the footnote says so. */
  var BOX_FLOOR = 0.42 * 0.32;
  var SHARE = 1 / 3;
  var HIGH = 2;
  var boxes = function (m2) {
    var raw = (HIGH * m2 * SHARE) / BOX_FLOOR;
    return Math.round(raw / 5) * 5;
  };
  // The quote form's storage sizes (radios name="size") and the slider values that fall in each.
  // 12 m² goes with "12 m² or more", the option that names it outright. label is the radio's value;
  // show is the same words for the hand-off line, a size never split across lines (a word joiner after
  // the en dash, a no-break space before m²).
  var ZONES = [
    { id: 'size-s', max: 5, label: 'A small area for boxes' },
    { id: 'size-m', max: 11, label: 'About 6–12 m²', show: 'About 6–\u206012\u00a0m²' },
    { id: 'size-l', max: Infinity, label: '12 m² or more', show: '12\u00a0m² or more' }
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
    if (handoff) handoff.textContent = sent() ? 'Your quote request has been sent.' : "We'll tick Attic storage and “" + (z.show || z.label) + '” in the form for you.';
    sec.classList.toggle('is-kyle', kyle); // shows "The size of the floor Kyle M had put in above his garage." 
    input.setAttribute('aria-valuetext', v + ' square metres, room for about ' + n + ' archive boxes' + (kyle ? ", the size of Kyle M's floor" : ''));
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
      // away whole and only fading at the end (the delays follow styles.css's order: opacity,
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
    // the light comes up through the manhole (styles.css): the dark draws back from the hatch and
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
        if (!entries[entries.length - 1].isIntersecting) return;
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
     put back if the browser takes the touch for a scroll. (styles.css also gives the input
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
});
