#!/usr/bin/env bash
# Build the solar fan promo (assets/video/promo-solar-fan.webm / .mp4 and its poster master) from the
# installer's phone clip.
#
#   scripts/promo/build.sh /path/to/IMG_2780.mov [ads-out-dir]
#
# Run it from the repo root. Needs ffmpeg (libx264, libsvtav1, libopus), Python 3 with numpy and
# opencv-python-headless, and Node with Playwright. The clip is not in the repo (it is large and carries
# location data); every output is written without metadata.
#
#   1. prep.py    the clip: HDR to standard range, graded warmer, the sun's lens flare taken out of the sky,
#                 upscaled 2x. The vent shots: cut from the client's earlier promo
#                 (source/video/solarking-promo.mp4), cropped clear of its old badge and captions.
#   2. audio.py   the voice, joined by the edit list (edl.json), cleaned and levelled to -14 LUFS.
#   3. render.cjs every frame drawn by promo.html: the hook, captions word by word, the vent card, the
#                 airflow figure, the offer, the end card.
#   4. below      the website's files (AV1 WebM, H.264 MP4) and the poster master (the first frame).
# Then run python3 scripts/build-images.py to make the poster's AVIF, WebP and JPEG.
#
# With ads-out-dir it also writes 9:16 (Reels, Stories) and 4:5 (feed) cuts whose end card says
# "Message us" instead of "Get your free quote", plus a cover still for each.
set -euo pipefail
MOV=${1:?usage: scripts/promo/build.sh /path/to/IMG_2780.mov [ads-out-dir]}
ADS=${2:-}
DIR=scripts/promo
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
T=$(python3 -c "import json; print(json.load(open('$DIR/edl.json'))['total'])")

python3 -I "$DIR/prep.py" "$MOV" source/video/solarking-promo.mp4 "$WORK"
python3 -I "$DIR/audio.py" "$MOV" "$DIR/edl.json" "$WORK/voice.wav"

fmts=(1x1)
[ -n "$ADS" ] && fmts+=(9x16 4x5)
pids=()
for f in "${fmts[@]}"; do
  node "$DIR/render.cjs" "$f" "$WORK/m-$f.mp4" --work "$WORK" & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done

TAGS=(-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)
IN=(-i "$WORK/m-1x1.mp4" -i "$WORK/voice.wav" -map 0:v -map 1:a -af apad -t "$T" -map_metadata -1)

# The website: 1080x1080, which the promo shows at 540 CSS px on desktop and full width on phones, so it
# lands about pixel for pixel on retina screens and the captions stay crisp. AV1 first (smaller), H.264
# for everything else.
ffmpeg -v error -y "${IN[@]}" -c:v libsvtav1 -preset 4 -crf 30 -g 60 -pix_fmt yuv420p \
  -svtav1-params log-level=1 "${TAGS[@]}" -c:a libopus -b:a 96k -ac 2 assets/video/promo-solar-fan.webm
ffmpeg -v error -y "${IN[@]}" -c:v libx264 -profile:v high -level 4.0 -preset veryslow -tune film -crf 20 \
  -maxrate 4M -bufsize 8M -g 60 -pix_fmt yuv420p "${TAGS[@]}" -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -movflags +faststart assets/video/promo-solar-fan.mp4

# The poster master: the first frame, drawn straight from the page (so it matches the video exactly)
node "$DIR/render.cjs" 1x1 --stills "$WORK/st" --work "$WORK" 0
ffmpeg -v error -y -i "$WORK/st/1x1-0.png" -q:v 2 -map_metadata -1 source/photos/promo-solar-fan.jpg

if [ -n "$ADS" ]; then
  mkdir -p "$ADS"
  for f in 9x16 4x5; do
    ffmpeg -v error -y -i "$WORK/m-$f.mp4" -i "$WORK/voice.wav" -map 0:v -map 1:a -af apad -t "$T" \
      -map_metadata -1 -c:v libx264 -profile:v high -preset slow -crf 17 -g 60 -pix_fmt yuv420p "${TAGS[@]}" \
      -c:a aac -b:a 192k -ar 48000 -ac 2 -movflags +faststart "$ADS/attic-worx-solar-fan-$f.mp4"
    node "$DIR/render.cjs" "$f" --stills "$WORK/st" --work "$WORK" 1.7
    ffmpeg -v error -y -i "$WORK/st/$f-1.7.png" -q:v 2 -map_metadata -1 "$ADS/cover-$f.jpg"
  done
fi
ls -l assets/video/promo-solar-fan.* source/photos/promo-solar-fan.jpg ${ADS:+"$ADS"}
