"""Prepare frames for the Attic Worx solar-fan ad.

presenter: the iPhone HDR clip -> tonemapped + graded SDR, sun-flare ghost removed from the sky,
           upscaled 2x (1184x1920), one JPEG per source frame (30 fps).
broll:     the vent shots from the client's SolarKing promo, cropped to the rows that carry no
           burnt-in badge or caption (116-486), upscaled 2x, one JPEG per frame.

usage: python -I prep.py <in.mov> <solarking.mp4> <outdir>
"""
import os
import subprocess
import sys

import cv2
import numpy as np

src, promo, out = sys.argv[1:4]
os.makedirs(f"{out}/p", exist_ok=True)
os.makedirs(f"{out}/b", exist_ok=True)

TM = ("fps=30,zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt709,"
      "tonemap=mobius:param=0.3:desat=0,zscale=t=bt709:m=bt709:r=tv,"
      "curves=master='0/0 0.25/0.30 0.5/0.56 0.8/0.84 1/1',eq=saturation=1.12,"
      "colorbalance=rm=0.025:gm=0.005:bm=-0.025,format=rgb24")
W, H = 592, 960


def frames(cmd, w, h):
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = w * h * 3
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n:
            break
        yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    p.wait()


def sharpen(img, amount=0.45, sigma=1.1):
    blur = cv2.GaussianBlur(img, (0, 0), sigma)
    return cv2.addWeighted(img, 1 + amount, blur, -amount, 0)


SKY_BOTTOM = 340  # source rows above the trees and roofs


def deflare(rgb):
    """Replace the lens ghost (bright streak and soft disc) in the plain sky with a smooth fit of the sky."""
    sky = rgb[:SKY_BOTTOM].astype(np.float32)
    h, w = sky.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    X = np.stack([np.ones_like(xx), xx / w, yy / h, (xx / w) ** 2, (yy / h) ** 2, xx * yy / (w * h),
                  (xx / w) ** 3, (yy / h) ** 3], -1).reshape(-1, 8)
    flat = sky.reshape(-1, 3)
    ok = (flat[:, 2] > flat[:, 0] + 25).copy()          # plain blue sky only
    ok &= (xx.reshape(-1) > 70)                          # not the street lamp
    for _ in range(3):
        idx = np.nonzero(ok)[0][::7]
        coef, *_ = np.linalg.lstsq(X[idx], flat[idx], rcond=None)
        fit = X @ coef
        res = (flat - fit).sum(1)
        ok &= res < 9
    fit = fit.reshape(h, w, 3)
    res = (sky - fit).sum(2)
    blue = sky[..., 2] > sky[..., 0] + 25
    m = ((res > 7) & blue).astype(np.uint8)
    m[:, :70] = 0
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if m.sum() < 15:
        return rgb, 0
    m = cv2.dilate(m, np.ones((11, 11), np.uint8))
    a = np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 4) * 1.5, 0, 1)[..., None]
    noise = np.random.default_rng(0).normal(0, 0.8, fit.shape).astype(np.float32)
    out = rgb.copy()
    out[:SKY_BOTTOM] = np.clip(sky * (1 - a) + (fit + noise) * a, 0, 255).astype(np.uint8)
    return out, int(m.sum())


i = 0
for f in frames(["ffmpeg", "-v", "error", "-i", src, "-vf", TM, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], W, H):
    f, n = deflare(f)
    up = cv2.resize(f, (W * 2, H * 2), interpolation=cv2.INTER_LANCZOS4)
    up = sharpen(up)
    cv2.imwrite(f"{out}/p/{i:04d}.jpg", cv2.cvtColor(up, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 95])
    if i % 60 == 0:
        print("presenter", i, "flare px", n, flush=True)
    i += 1
print("presenter frames", i)

# B-roll: promo seconds 13.0 to 24.3, clean rows only
j = 0
cmd = ["ffmpeg", "-v", "error", "-ss", "13.0", "-i", promo, "-vf", "fps=30,crop=720:370:0:116,format=rgb24",
       "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
for f in frames(cmd, 720, 370):
    up = cv2.resize(f, (1440, 740), interpolation=cv2.INTER_LANCZOS4)
    up = sharpen(up, 0.3, 1.0)
    cv2.imwrite(f"{out}/b/{j:04d}.jpg", cv2.cvtColor(up, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 94])
    j += 1
print("broll frames", j, "(frame k = promo second 13.0 + k/30)")
