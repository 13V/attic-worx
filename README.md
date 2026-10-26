# Attic Worx website

The new one-page site for [atticworx.com.au](https://atticworx.com.au): Adelaide's roof-space specialists (attic storage floors, pull-down ladders, whirlybirds and SolarKing vents, ceiling insulation).

It is plain static HTML, CSS and JavaScript. There is no framework and no build step, so any static host can serve it as-is.

## What's on the page

1. **Hero with a 3-step quote form.** Visitors pick services as tiles, answer two quick questions about their home, then leave a name and mobile. Each service card further down has a "Price my…" link that ticks that service in the form and scrolls back to it.
2. **Trust strip:** same-day installs, priced online, no council approval, no space no charge.
3. **Garage story:** the problem (a cluttered garage) and the fix (storage in the roof), with Kyle M's review.
4. **Services bento:** storage floors, ladders, roof ventilation (with an animated whirlybird), insulation.
5. **The install:** a dark section where a storage floor goes in (the 3D build).
6. **How it works:** three steps, with the 4–5 hour install time.
7. **Before and after:** three real jobs.
8. **Recent work:** a swipeable strip of job photos and a link to Facebook.
9. **Reviews, FAQ, final call to action, footer.**
10. **Mobile action bar:** Call and Get a quote buttons stay at the bottom of the screen on phones. They step aside while the form is on screen.

## Before going live

### 1. Connect the quote form (required)

The form needs somewhere to send leads. Open `index.html`, find `id="quote-form"`, and paste your endpoint into `data-endpoint`:

```html
<form class="quote-form" id="quote-form" data-endpoint="https://your-endpoint-here" novalidate>
```

Any service that accepts a JSON `POST` works: a GoHighLevel / LeadConnector inbound webhook, Zapier or Make, Formspree, or your own endpoint. The form sends:

```json
{
  "services": "Attic storage floor, Attic ladder",
  "storage_size": "About 6–12 m²",
  "hatch_location": "Garage",
  "suburb": "Marion",
  "timing": "ASAP",
  "name": "Sam Citizen",
  "phone": "0412 345 678",
  "email": "",
  "notes": "",
  "source": "atticworx.com.au quote form",
  "page": "https://atticworx.com.au/"
}
```

While `data-endpoint` is empty, the form still shows its thank-you screen (so the flow can be reviewed) but **nothing is sent**, and the browser console shows a warning. If the endpoint returns an error, the visitor sees a message with the phone number.

If Google Tag Manager is added later, a successful submission pushes `{ event: "quote_submitted" }` to `dataLayer` for conversion tracking.

### 2. Check the details

- Phone: 0434 083 530 (used in `tel:+61434083530` links and the structured data).
- Facebook: `https://www.facebook.com/profile.php?id=61562459426494`.
- The "90+ five-star reviews" line and all review quotes come from the current site.
- No email address, street address or ABN is shown, because the current site doesn't publish them. Add them to the footer and the JSON-LD in `<head>` if you want them.

## Editing

- **Copy** lives in `index.html`. Each section is marked with a comment (`<!-- Services -->`, `<!-- FAQ -->` and so on).
- **FAQ:** if you change a question, update the matching entry in the `FAQPage` JSON-LD in `<head>` so Google sees the same text.
- **Styles** are in `assets/css/styles.css`. Colours, type sizes and spacing are tokens at the top of the file.
- **Behaviour** (form steps, menus, the action bar) is in `assets/js/main.js`.
- **Motion** is a small system: tokens at the top of `styles.css`, the rules in its "Motion" part, and the engine at the top of `main.js` (`window.AW`). Mark a heading `data-split` and its words rise as it scrolls into view; `data-reveal="photo"` lifts a plate off a photo; `data-rule` draws a hairline; `data-draw` draws an inline SVG's strokes. With reduced motion, or without JavaScript, everything simply shows at rest.

### Brand

| Token | Hex | Use |
| --- | --- | --- |
| `--teal` | `#117E79` | Brand teal from the logo mark. Buttons and links |
| `--teal-deep` | `#0B5E5A` | Hover states, teal text on white |
| `--mint` | `#8FD6CC` | Teal tint for buttons and highlights on dark backgrounds |
| `--roof` | `#0C2122` | Deep teal-black for the hero, before/after and footer |
| `--ink` | `#0A0C0C` | Wordmark black, body text |
| `--gold` | `#F2B01E` | Review stars only |

The logo was redrawn as SVG from the original artwork: `assets/img/logo-wordmark.svg` (wordmark) and `assets/img/logo-mark.svg` (teal circle with the ladder "A").

Font: [Archivo](https://github.com/Omnibus-Type/Archivo) (SIL Open Font License, see `assets/fonts/OFL.txt`), self-hosted as one variable file that covers every weight and width the site uses. Headlines use the condensed width, body text the normal width.

### Photos

The master photos are in `source/photos/` (2400px JPEGs taken from the current site). The site uses responsive AVIF and WebP versions in `assets/img/`, plus one JPEG fallback each.

To add or re-crop a photo:

1. Put the master JPEG in `source/photos/`.
2. Add or edit its line in `VARIANTS` in `scripts/build-images.py` (aspect ratio, vertical focus point and widths).
3. Run `python3 scripts/build-images.py` (needs Pillow 11.3 or newer).
4. Reference the new files in `index.html` with a `<picture>` element, following the existing ones.

## Hosting

Upload the repository root to any static host: Netlify, Cloudflare Pages, Vercel, GitHub Pages or plain cPanel hosting. `index.html` is the homepage and `404.html` is the not-found page. `_headers` sets cache and security headers on Netlify and Cloudflare Pages; other hosts ignore it.

## Performance

Lighthouse, tested locally on the full page:

| | Performance | Accessibility | Best practices | SEO |
| --- | --- | --- | --- | --- |
| Mobile | 99 | 100 | 100 | 100 |
| Desktop | 100 | 100 | 100 | 100 |

What keeps it fast: no frameworks, one small script (deferred), one font file (preloaded), AVIF/WebP images sized per screen with the hero preloaded and everything below it lazy-loaded, and fixed image dimensions so nothing jumps while loading.

## Credits

- Icons: [Lucide](https://lucide.dev) (ISC licence). Facebook and Google glyphs from [Simple Icons](https://simpleicons.org) (CC0).
- UI references gathered from Mobbin (Airtasker's quote-card hero and tile-based task form, Jobber's step progress, and others).
