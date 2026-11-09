// Attic Worx quote requests: the website's quote form posts here (JSON).
//
// Each request is passed to Attic Worx's GoHighLevel (GHL) account through an inbound webhook, so leads
// land in the same CRM as before. The visitor only sees "thanks" when GHL accepted the lead; otherwise
// the form says it didn't send and shows the phone number, so a lead is never silently lost.
//
// Vercel → Project → Settings → Environment Variables:
//   GHL_WEBHOOK_URL   the URL from the GHL workflow's "Inbound Webhook" trigger
//                     (https://services.leadconnectorhq.com/hooks/...). Secret: never commit it.
// Setting up the GHL side is described in README.md ("Connect the quote form to GoHighLevel").

"use strict";

const SITE_HOSTS = ["atticworx.com.au", "www.atticworx.com.au"];
const TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 32 * 1024;
const LIMITS = {
  services: 300, storage_size: 80, hatch_location: 80, suburb: 120, timing: 80,
  name: 120, phone: 40, email: 254, notes: 4000, source: 80, page: 1000,
};

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === "string" ? req.body : Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
  if (!raw && typeof req[Symbol.asyncIterator] === "function") {
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) throw new Error("too_large");
    }
  }
  if (raw.length > MAX_BODY_BYTES) throw new Error("too_large");
  return raw ? JSON.parse(raw) : {};
}

const clean = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

// Australian numbers to E.164 (+61...), which GHL uses to match and dedupe contacts.
function auPhone(raw) {
  const d = raw.replace(/[^\d+]/g, "");
  if (/^\+61\d{9}$/.test(d)) return d;
  if (/^61\d{9}$/.test(d)) return "+" + d;
  if (/^0\d{9}$/.test(d)) return "+61" + d.slice(1);
  return raw;
}

// Same-site requests only (the Origin header is set by the browser on a cross-site POST).
function originOK(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let host;
  try { host = new URL(origin).hostname; } catch (e) { return false; }
  return SITE_HOSTS.includes(host) || host === req.headers.host?.split(":")[0] || /\.vercel\.app$/.test(host);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { ok: false, error: "method" });
  }
  if (!originOK(req)) return send(res, 403, { ok: false, error: "origin" });

  let body;
  try { body = await readBody(req); } catch (e) {
    return send(res, e.message === "too_large" ? 413 : 400, { ok: false, error: "body" });
  }

  const f = {};
  for (const [key, max] of Object.entries(LIMITS)) f[key] = clean(body[key], max);

  // The form's hidden spam trap: pretend it worked, send nothing.
  if (clean(body.company, 200)) return send(res, 200, { ok: true });

  const digits = f.phone.replace(/\D/g, "");
  if (!f.services || !f.name || digits.length < 8) return send(res, 422, { ok: false, error: "fields" });
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return send(res, 422, { ok: false, error: "email" });

  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) {
    console.error("quote: GHL_WEBHOOK_URL is not set");
    return send(res, 503, { ok: false, error: "not_configured" });
  }

  const parts = f.name.split(/\s+/);
  const details = [
    `Services: ${f.services}`,
    f.storage_size && `Storage size: ${f.storage_size}`,
    f.hatch_location && `Manhole: ${f.hatch_location}`,
    f.suburb && `Suburb: ${f.suburb}`,
    f.timing && `When: ${f.timing}`,
    f.notes && `Notes: ${f.notes}`,
  ].filter(Boolean).join("\n");

  // Flat keys, so each can be mapped in the GHL workflow ("Create/Update Contact" etc.).
  const lead = {
    first_name: parts[0],
    last_name: parts.slice(1).join(" "),
    full_name: f.name,
    phone: auPhone(f.phone),
    email: f.email,
    city: f.suburb,
    services: f.services,
    storage_size: f.storage_size,
    hatch_location: f.hatch_location,
    suburb: f.suburb,
    timing: f.timing,
    notes: f.notes,
    summary: details,
    source: f.source || "atticworx.com.au quote form",
    page_url: f.page,
    submitted_at: new Date().toISOString(),
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      console.error("quote: GHL webhook answered", r.status);
      return send(res, 502, { ok: false, error: "crm" });
    }
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error("quote: GHL webhook failed", e.name === "AbortError" ? "timeout" : e.message);
    return send(res, 502, { ok: false, error: "crm" });
  } finally {
    clearTimeout(timer);
  }
};
