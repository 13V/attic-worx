#!/usr/bin/env python3
"""Build the responsive images in assets/img from the master photos in source/photos.

Run from the repo root:  python3 scripts/build-images.py
Needs Pillow 11.3 or newer (AVIF and WebP support built in).

Each variant is cropped to a fixed aspect ratio around a vertical focus point,
then saved as AVIF and WebP at each width, plus one JPEG fallback.
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "photos"
OUT = ROOT / "assets" / "img"

# name, master photo, aspect ratio (width / height), vertical focus (0 top, 1 bottom), widths
VARIANTS = [
    ("hero-wide",      "walkway-after",     16 / 10, 0.50, [800, 1200, 1800]),
    ("hero-tall",      "walkway-after",      4 / 5,  0.62, [480, 800, 1200]),
    ("ba1-before",     "open-floor-before",  4 / 5,  0.55, [480, 800, 1200]),
    ("ba1-after",      "open-floor-after",   4 / 5,  0.55, [480, 800, 1200]),
    ("ba2-before",     "walkway-before",     4 / 5,  0.55, [480, 800, 1200]),
    ("ba2-after",      "walkway-after",      4 / 5,  0.55, [480, 800, 1200]),
    ("ba3-before",     "deck-before",        4 / 5,  0.55, [480, 800, 1200]),
    ("ba3-after",      "deck-after",         4 / 5,  0.55, [480, 800, 1200]),
    ("svc-storage",    "floor-edge",        16 / 10, 0.66, [600, 1000, 1400]),
    ("svc-ladder",     "ladder-hallway",     9 / 16, 0.50, [400, 800]),
    ("svc-insulation", "walkway-before",     1 / 1,  0.74, [400, 800]),
    ("story-garage",   "garage-clutter",     1 / 1,  0.50, [480, 800, 1200]),
    ("story-roof",     "storage-boxes",      1 / 1,  0.62, [480, 790]),
    ("step-ladder",    "ladder-garage",      4 / 5,  0.45, [480, 800]),
    ("work-laundry",   "ladder-laundry",     3 / 4,  0.50, [400, 700, 1000]),
    ("work-hatch",     "hatch-above",        3 / 4,  0.50, [400, 500]),
    ("work-deck",      "deck-after",         3 / 4,  0.55, [400, 700, 1000]),
    ("work-boxes",     "storage-boxes",      3 / 4,  0.55, [400, 700]),
    ("work-garage",    "ladder-garage",      3 / 4,  0.45, [400, 700, 1000]),
    ("work-floor",     "open-floor-after",   3 / 4,  0.55, [400, 700, 1000]),
]

AVIF_Q, WEBP_Q, JPEG_Q = 52, 74, 76


def crop_to(im, aspect, focus_y):
    w, h = im.size
    if w / h > aspect:  # too wide: trim the sides evenly
        nw = round(h * aspect)
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = round(w / aspect)  # too tall: trim around the focus point
    y = round((h - nh) * focus_y)
    return im.crop((0, y, w, y + nh))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, master, aspect, focus, widths in VARIANTS:
        im = ImageOps.exif_transpose(Image.open(SRC / f"{master}.jpg")).convert("RGB")
        im = crop_to(im, aspect, focus)
        for w in widths:
            w = min(w, im.width)
            h = round(w / aspect)
            r = im.resize((w, h), Image.LANCZOS)
            r.save(OUT / f"{name}-{w}.avif", "AVIF", quality=AVIF_Q, speed=4)
            r.save(OUT / f"{name}-{w}.webp", "WEBP", quality=WEBP_Q, method=6)
        # one JPEG fallback for browsers without AVIF/WebP, about 800px wide
        fw = widths[0] if widths[0] >= 800 else min(800, im.width, max(widths))
        im.resize((fw, round(fw / aspect)), Image.LANCZOS).save(
            OUT / f"{name}-{fw}.jpg", "JPEG", quality=JPEG_Q, optimize=True, progressive=True)
        print(f"{name}: {im.width}x{im.height} -> {widths}")

    # Social share image (1200 x 630) from the brand photo, centred on the logo
    im = Image.open(SRC / "brand-ladder.jpg").convert("RGB")
    og = im.crop((0, 205, 1000, 730)).resize((1200, 630), Image.LANCZOS)
    og.save(OUT / "og-image.jpg", "JPEG", quality=82, optimize=True, progressive=True)
    print("og-image: 1200x630")


if __name__ == "__main__":
    main()
