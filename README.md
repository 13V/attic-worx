# Attic Worx website

The new one-page site for [atticworx.com.au](https://atticworx.com.au): Adelaide's roof-space specialists (attic storage floors, pull-down ladders, whirlybirds and SolarKing vents, ceiling insulation).

It is plain static HTML, CSS and JavaScript: one page (`index.html`), one stylesheet (`assets/css/styles.css`) and one deferred script (`assets/js/main.js`). There is no framework and no build step, so any static host can serve it as-is. Three small Node scripts generate the page's drawings (see "The drawings" below); you only run them when you change a drawing.

## What's on the page

In order, top to bottom. The page alternates "in the roof" (dark bands) and "in the home" (white and pale bands).

1. **Hero with a 3-step quote form.** It opens dark, as in a roof: mint lines trace the photo's real edges (the walkway, the trusses, the hatch), then the work light flickers on and the lines fade. Visitors pick services as tiles, answer two quick questions about their home, then leave a name and mobile. Each service card further down has a "Price my…" link that ticks that service in the form and scrolls back to it.
2. **Trust strip:** same-day installs, priced online, no council approval, no space no charge.
3. **Garage story:** the problem (a cluttered garage) and the fix (storage in the roof), with Kyle M's review. Its first paragraph is the page's one "statement": its words darken as you read down.
4. **Services bento:** storage floors, ladders, roof ventilation (the whirlybird spins faster while you scroll, and winds down a few seconds after the page goes still), insulation.
5. **How much room?** (`#room`): a slider sizes a storage floor from 2 to 20 m², the picture lays the floor and fills it with boxes, tubs and gear (two lanes either side of the walkway, the low edges clear), and a rough figure says how many archive boxes fit: about 5 per m² (8 m² → 40, 12 m² → 60, 20 m² → 100), counting about a third of the floor as holding boxes. "Price a floor this size" ticks Attic storage and the matching size in the quote form, then takes you there. At 12 m² it notes that's the size of Kyle M's floor.
6. **"Boxes up. Car in."** (`#build`): a cutaway of a house at dusk. On screens with motion the picture stays put while you scroll and the change plays out in six steps: the full garage, the light goes on, a floor goes in (it simply appears and settles), the ladder comes down, everything goes up, the car's back in. It shows the result, not how a floor is built (no framing, no sheets laid one by one, no materials or methods in the captions).
7. **How it works** (`#how`): three steps. The line through them is a folding attic ladder that swings down as each step lights. Wide screens have a sticky panel beside the steps showing each step's drawing; narrower screens show each drawing under its step.
8. **Before and after** (`#results`): three real jobs as still pairs (never a drag slider). The before sits muted, the after lit, and a work light passes once from one to the other as the pair scrolls in. Tabs switch jobs.
9. **Recent work** (`#work`): on wide screens with motion the section holds still while the photos run sideways, and a warm work light travels along them. Elsewhere it's a swipe strip. It opens with a link to the Facebook page and ends with a quote button.
10. **Reviews, FAQ, final call to action, footer.**
11. **Mobile action bar:** Call and Get my free quote buttons stay at the bottom of the screen on phones and tablets. They step aside while the hero buttons or the form are on screen.

## Before going live

### 1. Connect the quote form (required)

The form needs somewhere to send leads. Open `index.html`, find `id="quote-form"`, and paste your endpoint into `data-endpoint`:

```html
<form class="quote-form" id="quote-form" data-endpoint="https://your-endpoint-here" novalidate aria-labelledby="qf-title">
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

While `data-endpoint` is empty, the form still shows its thank-you screen (so the flow can be reviewed) but **nothing is sent**, and the browser console shows a warning. The exception is the live domain (`atticworx.com.au` and its subdomains): there an empty endpoint shows the "That didn't send" message with the phone number instead, so a visitor is never thanked for a lead that went nowhere. If the endpoint returns an error, the visitor sees the same message.

### 2. Tracking (optional)

If Google Tag Manager (or anything else that sets up `window.dataLayer`) is added, the page pushes two events:

| Event | When | Fields |
| --- | --- | --- |
| `quote_submitted` | The form was sent (the thank-you shows) | `services` |
| `room_price_floor` | "Price a floor this size" was clicked in How much room? | `size_m2` (the slider's value), `size_option` (the form size it picked) |

`room_price_floor` lets you count leads that started at the visualiser. The form's payload is the same either way.

### 3. Check the details

- Phone: 0485 065 143 (used in `tel:+61485065143` links and the structured data).
- Facebook: `https://www.facebook.com/profile.php?id=61562459426494`.
- The "90+ five-star reviews" line and all review quotes come from the current site.
- No email address, street address or ABN is shown, because the current site doesn't publish them. Add them to the footer and the JSON-LD in `<head>` if you want them.

## Editing

- **Copy** lives in `index.html`. Each section is marked with a comment (`<!-- Services -->`, `<!-- FAQ -->` and so on).
- **FAQ:** if you change a question, update the matching entry in the `FAQPage` JSON-LD in `<head>` so Google sees the same text.
- **Styles** are all in `assets/css/styles.css`: the tokens at the top (colours, type sizes, spacing, motion), then the base and the sections in page order, then the "Motion" part (the shared primitives below), then one part per animated section, in page order: Hero sequence, How much room?, Roof build scene, How it works, Before & after, Recent work. Each of those is scoped to its own section and comes last on purpose, because it builds on the rules above it.
- **Behaviour** is all in `assets/js/main.js`: the motion engine first, then the page (header, menu, FAQ, quote form, "Price my…" links, whirlybird, action bar), then one block per animated section (Roof build scene, How it works, Before & after, Recent work, How much room?), each queued with `AW.section`. The hero's sequence is CSS only.

### Motion

Motion is a small system. The idea is "drawn, then lit, then built": lines draw, the work light comes on, timber goes down. Nothing bounces, nothing loops (the whirlybird spins while the page moves and winds down a few seconds after it stops), and nothing follows the cursor.

The engine is the first part of `main.js`, exposed as `window.AW`:

| | |
| --- | --- |
| `AW.motionOK()` | `false` while the visitor prefers reduced motion (read live: it can change mid-visit) |
| `AW.finePointer` | a mouse or trackpad (`hover: hover` and `pointer: fine`) |
| `AW.onScrollFrame(fn)` | runs `fn` once per frame after a scroll or resize (and once at the start). Read layout in `fn`; if it returns a function, that runs after every job has read, so reads and writes never interleave |
| `AW.reveal(el)` | adds `.is-in` once `el` scrolls into view |
| `AW.splitWords(el)` | wraps each word for the rising-word effect, keeping inline elements like `<span class="hl">` |
| `AW.section(fn)` | queues a section's script: the blocks at the end of `main.js` run in order, one task each, right after the file (so start-up is a few short tasks, not one long one), and the start-up hold below lasts until they have all run |
| `AW.raf(fn)`, `AW.clamp(v, a, b)` | helpers |

Mark up any element with these attributes and the engine and CSS do the rest:

| Attribute | Effect |
| --- | --- |
| `data-split` on a heading | its words rise out of a mask, line by line |
| `data-reveal="photo"` on a positioned wrapper with `overflow: hidden` | a plate in the band's colour (`--plate`) lifts off the photo and the photo settles |
| `data-reveal` | just gets `.is-in`; the section's CSS decides what that means |
| `data-rule` | the element's top hairline draws left to right |
| `data-draw` on an inline `<svg>` | its strokes (paths with `pathLength="1"`) draw themselves |
| `data-words` on a paragraph | the statement: its words darken as they cross the reading line (use it once) |

Elements of one section arriving together are staggered 80 ms apart (at most 5 steps); `--delay` adds a fixed offset. Anything already on screen when the page starts is shown at rest, with no animation (`.is-in.is-instant`, with transitions held by `.aw-still` until the page and the section scripts have started), so nothing hides and then reappears. Keyframe animations on a reveal should be gated on `.is-in:not(.is-instant)`.

Rules the system keeps, so it stays fast and calm:

- Only `transform`, `opacity`, `clip-path` (small areas) and `stroke-dashoffset` animate, plus custom properties that feed them. No layout properties, no animated filters or shadows on large areas.
- Every "before" state needs `html.js` (added by `main.js` as its first act) and no reduced-motion preference.
- The page's layout never waits for the script. Anything that changes the page's length, such as the build's pinned track or the Recent work run, keys on `@media (scripting: enabled)`, never `html.js`, so a link to a section further down lands without the page moving under it.
- One scroll loop (`AW.onScrollFrame`) and IntersectionObservers. Each section's script goes idle when the section is off screen.

### Reduced motion and no JavaScript

- **Reduced motion** (read live): everything rests in its final state, fully visible, with no waiting. Nothing pins: the build shows its finished picture (car in, boxes up) with the six steps as a numbered list, and Recent work is the swipe strip. The hero is lit with no drawing, the slider's picture changes instantly, the before/after tabs swap at once, the header doesn't hide, and the whirlybird is still.
- **No JavaScript:** everything is visible and usable. The form shows all three steps at once, How much room? shows 8 m² and its button goes straight to the form, the build shows its finished picture and the step list, How it works shows every step lit, Before and after shows all three pairs one under the other with their captions, Recent work is the swipe strip, and the header keeps a solid background (`<noscript>` rules in `<head>`).

### The drawings (generated: don't hand-edit them)

Three drawings are written into `index.html` by plain Node scripts (Node 18 or newer, no dependencies). Edit the script, then run it from the repo root:

- **The roof build scene** (`#build`): `node scripts/scene/build-scene.mjs` rewrites everything between `<!-- scene:start -->` and `<!-- scene:end -->`. `--check` exits 1 if `index.html` is out of date; `--concept dusk --out dusk.svg` draws a still of one beat. The captions' `data-at` values in `index.html` must match the script's `BEATS` (it warns if they don't). How the scene is modelled and animated: `scripts/scene/README.md`.
- **How much room?** (`#room`): `node scripts/room/build-room.mjs` rewrites the picture between `<!-- room:start -->` and `<!-- room:end -->`. `--check` exits 1 if it's out of date, `--concept 12 --out x.svg` draws a still at 12 m², and `--stats` prints what shows at each size. The floor sizes (2 to 20 m²) must match the slider and the "How much room?" block in `main.js`, which also holds the box-count assumptions (stated in the section's footnote too).
- **How it works** (`#how`): `node scripts/how-drawings.mjs` rewrites the three step drawings. Each drawing is in the page twice (the sticky panel's copy and the step's own copy), and the script replaces every `<svg class="how-draw how-draw-N">…</svg>` in place; it stops with an error unless it finds exactly two of each. It has no `--check`: run it and look at `git diff index.html`.

Everything between the scene and room markers, and both copies of each How it works drawing, is overwritten on the next run, so make changes in the scripts.

### Brand

| Token | Hex | Use |
| --- | --- | --- |
| `--teal` | `#117E79` | Brand teal from the logo mark. Buttons and links |
| `--teal-deep` | `#0B5E5A` | Hover states, teal text on white |
| `--mint` | `#8FD6CC` | Teal tint for buttons and highlights on dark backgrounds |
| `--roof` | `#0C2122` | Deep teal-black for the dark bands and the footer |
| `--ink` | `#0A0C0C` | Wordmark black, body text |
| `--gold` | `#F2B01E` | Review stars only |

The logo was redrawn as SVG from the original artwork: `source/logo/logo-wordmark.svg` (wordmark) and `source/logo/logo-mark.svg` (teal circle with the ladder "A"). The page carries its own copy of both in the SVG sprite at the top of `index.html`.

Font: [Archivo](https://github.com/Omnibus-Type/Archivo) (SIL Open Font License, see `assets/fonts/OFL.txt`), self-hosted as one variable file that covers every weight and width the site uses. Headlines use the condensed width, body text the normal width.

### Photos

The master photos are in `source/photos/` (2400px JPEGs taken from the current site). The site uses responsive AVIF and WebP versions in `assets/img/`, plus one JPEG fallback each (the hero's tall crop shares the wide crop's JPEG).

To add or re-crop a photo:

1. Put the master JPEG in `source/photos/`.
2. Add or edit its line in `VARIANTS` in `scripts/build-images.py` (aspect ratio, vertical focus point and widths).
3. Run `python3 scripts/build-images.py` (needs Pillow 11.3 or newer).
4. Reference the new files in `index.html` with a `<picture>` element, following the existing ones.

## Hosting

Upload the repository root to any static host: Netlify, Cloudflare Pages, Vercel, GitHub Pages or plain cPanel hosting. `index.html` is the homepage and `404.html` is the not-found page. `_headers` sets cache and security headers on Netlify and Cloudflare Pages; other hosts ignore it. Make sure the host compresses HTML, CSS and JS (gzip or Brotli; all of the hosts above do): the page's inline drawings make the HTML about 209 KB raw but about 48 KB compressed.

## Performance

Lighthouse 12.8.2, run locally on the full page served with gzip (as a real host serves it), median of three runs each:

| | Performance | Accessibility | Best practices | SEO | LCP | CLS | TBT | Transferred |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Mobile | 96 | 100 | 100 | 100 | 2.6 s | 0 | 69 ms | 318 KiB, 12 requests |
| Desktop | 99 | 100 | 100 | 100 | 0.6 s | 0 | 0 ms | 425 KiB, 13 requests |

Mobile scores move a few points from run to run (a busy machine can drop a single run much lower). Before the motion work the page scored 99 (mobile) and 100 (desktop); the difference is mostly the hero's opening, which starts dark and lights up (it lowers Speed Index), and the larger HTML and stylesheet.

What keeps it fast:

- No frameworks. One stylesheet (about 37 KB compressed), one deferred script (about 29 KB compressed) and one font file (preloaded).
- The hero photo is preloaded and painted from the first frame, under the darkness. On phones the browser takes the lede as the largest paint, so the lede doesn't animate.
- Images are AVIF/WebP sized per screen, everything below the hero is lazy-loaded, and every image has fixed dimensions.
- The page has its full length from the first frame (nothing that changes the layout waits for the script), so nothing jumps, including when a visitor arrives on a link to a section further down.
- Only `transform` and `opacity` (and SVG stroke offsets) animate. There's one scroll loop, each section goes idle when it's off screen, and the section scripts start up as separate short tasks. Each band paints on its own (`contain: paint`), so a scroll-linked drawing repaints its band, not the whole page.

## Credits

- Icons: [Lucide](https://lucide.dev) (ISC licence). Facebook and Google glyphs from [Simple Icons](https://simpleicons.org) (CC0).
- UI references gathered from Mobbin (Airtasker's quote-card hero and tile-based task form, Jobber's step progress, and others).
