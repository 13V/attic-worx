"""Voice track from the edit list: the segments joined (short fades only where time is cut), cleaned,
levelled to -14 LUFS (two-pass loudnorm), padded to the ad's length.

usage: python3 audio.py <in.mov> <edl.json> <out.wav>
"""
import json
import subprocess
import sys

src, edl_path, out = sys.argv[1:4]
edl = json.load(open(edl_path))
fps, segs, total = edl["fps"], edl["segs"], edl["total"]

parts, labels = [], []
for i, s in enumerate(segs):
    a, b = s["in"] / fps, s["out"] / fps
    cut_before = i > 0 and segs[i - 1]["out"] != s["in"]
    cut_after = i < len(segs) - 1 and segs[i + 1]["in"] != s["out"]
    f = f"[0:a]atrim={a:.6f}:{b:.6f},asetpts=PTS-STARTPTS"
    if cut_before:
        f += ",afade=t=in:d=0.015"
    if cut_after:
        f += f",afade=t=out:st={b - a - 0.025:.6f}:d=0.025"
    if i == len(segs) - 1:
        f += f",afade=t=out:st={b - a - 0.35:.6f}:d=0.35"
    parts.append(f + f"[a{i}]")
    labels.append(f"[a{i}]")
chain = (";".join(parts) + ";" + "".join(labels) + f"concat=n={len(segs)}:v=0:a=1,"
         "highpass=f=85,afftdn=nf=-40:nr=6,equalizer=f=3200:t=q:w=1.2:g=2,"
         "acompressor=threshold=-22dB:ratio=3:attack=5:release=90:makeup=1")

meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-filter_complex",
                       chain + ",loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
j = json.loads(meas[meas.rindex("{"):meas.rindex("}") + 1])
ln = (f"loudnorm=I=-14:TP=-1.5:LRA=7:measured_I={j['input_i']}:measured_TP={j['input_tp']}:"
      f"measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter_complex",
                chain + "," + ln + f",aresample=48000,apad=whole_dur={total},atrim=0:{total}[out]",
                "-map", "[out]", "-map_metadata", "-1", "-c:a", "pcm_s24le", out], check=True)
print("speech", sum(s["out"] - s["in"] for s in segs) / fps, "s; total", total, "s")
