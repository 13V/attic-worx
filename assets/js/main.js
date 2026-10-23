/* Attic Worx — small progressive enhancements. No dependencies. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header: solid once the page scrolls ---------- */
  var header = $('[data-header]');
  if (header) {
    var ticking = false;
    var setHeader = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 24);
      ticking = false;
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; window.requestAnimationFrame(setHeader); }
    }, { passive: true });
    setHeader();
  }

  /* ---------- Mobile menu: close after choosing a link ---------- */
  var menu = $('#mobile-menu');
  if (menu) {
    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () {
        if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) menu.hidePopover();
      });
    });
  }

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

    goToStep = function (n, focus) {
      current = n;
      steps.forEach(function (s) { s.hidden = Number(s.getAttribute('data-step')) !== n; });
      bars.forEach(function (b, i) { b.classList.toggle('is-done', i < n); });
      if (label) label.textContent = 'Step ' + n + ' of ' + steps.length;
      if (n === 2 && storageOnly) {
        // Only ask about storage size when attic storage is part of the job
        storageOnly.hidden = !$('#svc-storage', form).checked;
      }
      if (focus) {
        var step = steps[n - 1];
        var first = $('input:not([type=hidden]), select, textarea', step);
        if (first && n > 1) first.focus({ preventScroll: true });
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
        steps.forEach(function (s) { s.hidden = true; });
        if (head) head.hidden = true;
        var nameSpot = $('[data-done-name]', form);
        var first = String(payload.name).trim().split(/\s+/)[0];
        if (nameSpot && first) nameSpot.textContent = ', ' + first;
        done.hidden = false;
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
  var openQuote = function (serviceId) {
    if (!card) return;
    if (serviceId) {
      var box = document.getElementById(serviceId);
      if (box && !box.checked) { box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    if (form && !form.querySelector('[data-done]').hidden) return;
    window.setTimeout(function () {
      var target = serviceId ? $('[data-step="1"] [data-next]', form) : $('[data-step]:not([hidden]) input, [data-step]:not([hidden]) button', form);
      if (target) target.focus({ preventScroll: true });
    }, reduceMotion ? 0 : 500);
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

  /* ---------- Recent work scroller buttons ---------- */
  var track = $('[data-track]');
  if (track) {
    $$('[data-scroll]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = Number(btn.getAttribute('data-scroll'));
        var item = track.querySelector('figure');
        var step = item ? item.getBoundingClientRect().width + 16 : 300;
        track.scrollBy({ left: dir * step, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });
  }

  /* ---------- Mobile action bar: step aside while the form is on screen ---------- */
  var bar = $('[data-action-bar]');
  if (bar && card && 'IntersectionObserver' in window) {
    var heroVisible = true;
    var formVisible = false;
    var update = function () { bar.classList.toggle('is-hidden', formVisible || heroVisible); };
    new IntersectionObserver(function (entries) {
      formVisible = entries[0].isIntersecting;
      update();
    }, { threshold: 0.2 }).observe(card);
    var heroCopy = $('.hero-actions');
    if (heroCopy) {
      new IntersectionObserver(function (entries) {
        heroVisible = entries[0].isIntersecting;
        update();
      }).observe(heroCopy);
    }
  }

  /* ---------- Footer year ---------- */
  var year = $('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());
})();
