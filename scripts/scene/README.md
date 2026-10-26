# The roof-space cutaway ("Boxes up. Car in.")

`build-scene.mjs` draws the centrepiece of `#build`: a single-storey Adelaide house cut front to back at
dusk, seen from inside its roof, and writes it into `index.html` between `<!-- scene:start -->` and
`<!-- scene:end -->`. Plain Node, no dependencies.

```sh
node scripts/scene/build-scene.mjs            # regenerate the inline SVG in index.html
node scripts/scene/build-scene.mjs --check    # exit 1 if index.html is out of date
node scripts/scene/build-scene.mjs --concept dusk --out dusk.svg            # a still of one state, wide
node scripts/scene/build-scene.mjs --concept final --cam 2.9 --out f.svg    # framed as the phone camera
node scripts/scene/build-scene.mjs --concept final --carx -3 --out car.svg  # the car at any x (m)
```

States for `--concept`: `dusk`, `light`, `floor`, `ladder`, `final`. Concept stills are drawn exactly in 3D
(no CSS), so they are the reference the motion is checked against.

## The model

Everything is in metres at real sizes and projected in one-point perspective (a section perspective):

- Camera: vanishing point (4.55, 4.6), the eye 1.6 m above the new floor, 4.2 m in front of the cut. The cut
  plane is z = 0; x runs from the street to the back of the house; z runs along the ridge, so the trusses
  (600 mm centres) recede as a tunnel of A-frames. SVG units are centimetres of the cut plane.
- House: garage 6.0 × 3.3 m, 2.7 m ceilings, a 3 m room beside it, 25° roof, Colorbond on battens,
  attic-style trusses, R-rated batts on the ceiling.
- Floor: H2 battens (35 × 90, packers included) at 600 centres over the bottom chords, 2400 × 600 × 19 mm
  sheets, a strip 4.8 m wide and 8 bays deep. The manhole sits between two trusses (no chord is cut), long
  side along x, so the pull-down ladder (three sections, 2.98 m) unfolds in the picture's plane.
- Things: twelve loads (stacks of archive boxes, kraft boxes, clear tubs with teal lids, a teal tub, a
  suitcase, an esky), each drawn twice: in the garage (dim) and on the new floor (lit). The garage copy
  is walked to the ladder's foot and hands over to the lit copy, which climbs, goes through the hatch and
  is set down in its row, far end first. Each copy is drawn where it is seen longest, so its perspective is
  always right; the hand-over happens at the ladder, where the two look the same.
- Car: an SUV profile extruded 1.84 m wide, drawn with a longer lens across its width (at this eye height
  a true roof would fill the frame). Its drive in is exact: on every plane of the car the scale is an affine
  function of the plane's own screen position, so each plane moves by an affine `matrix()` that is linear
  in the distance still to go (`carMotion`). The nose only shows while the car is left of the eye.
- Light is shapes: the dusk sky and its glow, one dark ring per truss bay (the work light reaches in bay
  by bay), the lamp's glow, the light through the open hatch, the headlights, the garage's dusk and its
  light. No filters.

## The contract with fx-build.css

Every moving part is `class="m bs-…"` with its window and travel in inline custom properties:
`--a` (start) and `--l` (length) in units of `--p`, and per kind: `--dx --dy --k` (pick-up), `--x1..3
--y1..3 --k1..3` (the climb and the set-down), `--ox --oy --r --c --m` (ladder sections, step ladder:
rotation origin, closed angle, fold-back window), `--mx --my --m0` (car planes), `--b --k / --b --m`
(lights that go off again). The geometry in the file is the finished state; CSS computes every other pose
from `--p`. Groups that never read `--p` are `.bs-still` / `.bs-in`, which pin it, so a write restyles
only what moves (about 200 elements instead of 800).

The beats (`BEATS`) must match the captions' `data-at` in `index.html`; the generator warns if they don't.

## Changing it

Edit the dimensions, colours (`C`), loads (`LOADS`) or windows in the script, run it, and check the
contact sheets (see the scene notes). Keep the inline SVG under ~70 KB (it's ~55 KB, ~13 KB gzipped) and
the moving parts under ~250 (97).
