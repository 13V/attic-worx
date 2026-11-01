#!/usr/bin/env bash
# Build the site's video files in assets/video from the client's original phone clips.
#
#   scripts/build-video.sh /path/to/originals
#
# Run it from the repo root. Needs ffmpeg (with libx264 and libsvtav1) and bc. The originals (iPhone .mov
# files) are not in the repo: they are large and carry location data. Every output is written with
# -map_metadata -1 (no dates, no GPS, no device tags).
#
# Videos (assets/video):
#   hero-reel-wide.{mp4,webm}  1280x720  the hero's background reel on wide screens (over 960px)
#   hero-reel-tall.{mp4,webm}  720x1280  the same cut, framed for phones and tablets
#   ladder-pull.{mp4,webm}     528x1278  the ladder card's loop: a timber attic ladder pulled down and unfolded
#   solarking.mp4              720x720   the SolarKing promo, with sound (captions burnt in)
# The .webm files are AV1 (smaller); the .mp4 files are H.264 for every other browser.
#
# Poster masters (source/photos, JPEG, no metadata); scripts/build-images.py makes the AVIF/WebP/JPEG posters:
#   hero-reel-wide.jpg, hero-reel-tall.jpg  the reel's first frame (the hero's poster and LCP image)
#   ladder-pull.jpg                         the ladder card's poster (its last frame: the ladder down)
#   solarking.jpg                           the promo's poster (5.5 s in)
#
# To change the hero reel, edit CLIPS below (file, start, length, wide-crop focus), run this, then run
# python3 scripts/build-images.py so the posters match the reel's first frame.
set -euo pipefail
SRC=${1:?usage: scripts/build-video.sh /path/to/originals}
OUT=assets/video
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

FADE=0.5   # crossfade between clips (s)

# The hero reel: file, start (s), length (s), vertical focus of the 16:9 crop (0 top, 1 bottom)
CLIPS=(
  "IMG_6388.mov 0.0 3.6 0.55"   # the hatch and the work lights, then the camera turns to the new floor
  "IMG_8837.mov 1.2 3.8 0.38"   # walking across a finished floor under the trusses
  "IMG_1599.mov 5.0 2.8 0.56"   # a stocked roof space, lamp on
)

# Each clip, normalised to 30 fps and cut to both framings (intermediate, near lossless)
i=0
for c in "${CLIPS[@]}"; do
  read -r f ss t fy <<<"$c"
  ffmpeg -v error -y -ss "$ss" -t "$t" -i "$SRC/$f" -an -map_metadata -1 \
    -filter_complex "[0:v]fps=30,setsar=1,split[a][b];
      [a]scale=720:1280:flags=lanczos[tall];
      [b]crop=iw:iw*9/16:0:(ih-iw*9/16)*$fy,scale=1280:720:flags=lanczos[wide]" \
    -map "[tall]" -c:v libx264 -crf 10 -preset veryfast -pix_fmt yuv420p "$TMP/tall$i.mp4" \
    -map "[wide]" -c:v libx264 -crf 10 -preset veryfast -pix_fmt yuv420p "$TMP/wide$i.mp4"
  i=$((i + 1))
done
n=$i

# Join with crossfades, and fade the last clip into the first clip's opening FADE seconds, so the loop
# has no seam: the reel starts FADE seconds into the first clip and ends on that same frame.
for v in tall wide; do
  ins=() ; graph=""
  for ((k = 0; k < n; k++)); do ins+=(-i "$TMP/$v$k.mp4"); done
  ins+=(-i "$TMP/${v}0.mp4")
  graph="[0:v]trim=start=$FADE,setpts=PTS-STARTPTS[s0];"
  graph+="[$n:v]trim=end=$FADE,setpts=PTS-STARTPTS[head];"
  prev="s0"; acc=0
  len0=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/${v}0.mp4")
  acc=$(echo "$len0 - $FADE" | bc -l)
  for ((k = 1; k <= n; k++)); do
    if ((k < n)); then src="[$k:v]"; else src="[head]"; fi
    off=$(echo "$acc - $FADE" | bc -l)
    graph+="[$prev]${src}xfade=transition=fade:duration=$FADE:offset=$off[x$k];"
    prev="x$k"
    if ((k < n)); then
      lk=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$TMP/$v$k.mp4")
      acc=$(echo "$acc + $lk - $FADE" | bc -l)
    fi
  done
  graph+="[$prev]format=yuv420p[out]"
  ffmpeg -v error -y "${ins[@]}" -filter_complex "$graph" -map "[out]" -an -map_metadata -1 \
    -c:v libx264 -crf 8 -preset veryfast "$TMP/reel-$v.mp4"
done

# Final encodes. The hero sits under a dark shade, so it can take a high CRF.
enc() { # in out crf maxrate
  ffmpeg -v error -y -i "$1" -an -map_metadata -1 -c:v libx264 -profile:v high -preset veryslow -crf "$3" \
    -maxrate "$4" -bufsize "$4" -pix_fmt yuv420p -movflags +faststart -g 60 "$2.mp4"
  ffmpeg -v error -y -i "$1" -an -map_metadata -1 -c:v libsvtav1 -preset 4 -svtav1-params log-level=1 -crf $(( $3 + 14 )) \
    -g 60 -pix_fmt yuv420p "$2.webm"
}
enc "$TMP/reel-wide.mp4" "$OUT/hero-reel-wide" 24 2400k
enc "$TMP/reel-tall.mp4" "$OUT/hero-reel-tall" 26 1600k
ffmpeg -v error -y -i "$TMP/reel-wide.mp4" -frames:v 1 -q:v 2 source/photos/hero-reel-wide.jpg
ffmpeg -v error -y -i "$TMP/reel-tall.mp4" -frames:v 1 -q:v 2 source/photos/hero-reel-tall.jpg

# The ladder card: Attic Worx pulling down and unfolding a timber attic ladder in a hallway
ffmpeg -v error -y -ss 0 -t 9.2 -i "$SRC/IMG_2849.mov" -an -map_metadata -1 \
  -vf "fps=30,scale=528:1278:flags=lanczos,setsar=1" -c:v libx264 -crf 8 -preset veryfast \
  -pix_fmt yuv420p "$TMP/ladder.mp4"
enc "$TMP/ladder.mp4" "$OUT/ladder-pull" 27 1100k
ffmpeg -v error -y -sseof -0.05 -i "$TMP/ladder.mp4" -frames:v 1 -update 1 -q:v 2 source/photos/ladder-pull.jpg

# The SolarKing promo (captions are burnt in), with its sound levelled
ffmpeg -v error -y -i "$SRC/attic-worx-solar-king-video-no-chrome.mov" -map_metadata -1 \
  -vf "scale=720:720:flags=lanczos,setsar=1" -c:v libx264 -profile:v high -preset veryslow -crf 25 \
  -maxrate 1300k -bufsize 2600k -pix_fmt yuv420p -g 60 \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 96k -ar 48000 -movflags +faststart "$OUT/solarking.mp4"
ffmpeg -v error -y -ss 5.5 -i "$OUT/solarking.mp4" -frames:v 1 -q:v 2 source/photos/solarking.jpg

ls -l "$OUT"
