# The roof-space cutaway ("Boxes up. Car in.")

`build-scene.mjs` draws the centrepiece of `#build`: a single-storey Adelaide house cut front to back at
dusk, seen from inside its roof, and writes it into `index.html` between `<!-- scene:start -->` and
`<!-- scene:end -->`. Plain Node, no dependencies.

The story is told in six beats: the full garage at dusk, the light goes on, a floor goes in, the ladder
comes down, everything goes up, the car's back in. It shows what changes, not how a floor is built: the
floor appears and settles as one calm moment, with no framing stage, no sheets laid one by one and no
batten grid, and the captions name no materials or methods (the client asked for this, so the page doesn't
teach a visitor to install a floor themselves).

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
- House: garage 6.0 × 3.3 m, 2.7 m ceilings, a 3 m living room beside it (sofa, a table lamp, a window
  on the dusk), 25° roof, Colorbond on battens, attic-style trusses, R4/R5 batts between the ceiling
  joists (soft humps, staggered 1160 mm joints). Outside: the driveway with its control joints, the
  footpath and kerb running into the picture, a hedge and a brick letterbox pier.
- Floor: 2400 × 600 × 19 mm sheets on plain framing timber (pine), clear of the batts, a strip 4.8 m wide
  and 8 bays deep. The timber isn't drawn, except as the floor's edge at the cut; the sheets' joints show
  faintly, as a finished floor's do. It is two moving parts with one window (the front row is painted over
  the loads passing up through the hatch). The manhole sits
  between two trusses (no chord is cut), long side along x, so the pull-down ladder (three sections,
  2.98 m) unfolds in the picture's plane. While it's open the hatch reads as an opening from above.
- Things: twelve loads (stacks of archive boxes, kraft boxes, clear tubs with teal lids, a teal tub, a
  suitcase, an esky), each drawn twice: in the garage (dim, the garage's dusk baked in) and on the new
  floor (lit). The garage is packed in three rows with an aisle to the ladder between the first two. A
  trip is walk | climb | rise | set: walked to the ladder's foot, carried up it with its lower right corner
  riding just above the treads, pushed up through the hatch, set down in its row. Both copies follow the
  same path on screen for the climb (the generator checks it), but the garage copy is clipped to below the
  ceiling's cut line and the roof copy to above it, so the hand-over happens inside the cut ceiling: no
  cross-fade, no double image.
- The carry's order: the garage empties a row at a time from the front, each row from the load nearest
  the ladder, so nothing walks past a load still waiting; the floor fills a row at a time from the far
  end, each row from the outside in, so nothing is set down across a load already there. The ladder and
  the hatch take one load at a time, so the climbs are evenly spaced (`STAG`, with a breath between rows);
  each walk takes as long as it is (`W0 + WK` per metre). The generator then checks the whole carry in 3D
  (`carryOrder`): at each moment, any two copies on the same side that overlap where they show (the
  garage below the cut line; the roof above the far edge of the floor's front row) are ordered by a plane
  that separates their boxes, and the DOM order is the one that satisfies every moment. It stops if no
  order works, or if two loads would pass more than 2 cm into each other. `BS_CLASH=1` lists every touch;
  `BS_STAG`, `BS_W0`, `BS_WK`, `BS_CLIMB`, `BS_SET`, ... in the environment try other timings against it.
- Car: an SUV profile extruded 1.84 m wide, drawn with a longer lens across its width (`CAR_F`; at this
  eye height a true roof would fill the frame). Its near side is shaded from the shoulder to the sills,
  with dark wheel arches, door shuts and the dusk in its glass; the garage light catches its roof's edge
  at the end. Its drive in is exact: on every plane of the car the scale is an affine function of the
  plane's own screen position, so each plane moves by an affine `matrix()` that is linear in the distance
  still to go (`carMotion`). The wall beside the door is drawn after it, so it passes behind the wall.
- Roller door: a curtain of slats in the doorway, clipped to it. Raising it on its plane is an exact
  vertical shear (`matrix(1, b0, 0, 1, 0, f0)`), so one number lowers it.
- Light is shapes: the dusk sky and its glow, one dark ring per truss bay (the work light reaches in bay
  by bay), the lamp's glow, the light through the open hatch, the headlights, the garage's dusk and its
  light. No filters.

## The contract with the CSS (styles.css, "Roof build scene")

Every moving part is `class="m bs-…"` with its window and travel in inline custom properties:
`--a` (start) and `--l` (length) in units of `--p`, and per kind: `--s0..s3` (the trip's segments) with
`--x0..3 --y0..3 --k0..3` (its waypoints, relative to the copy's own spot), `--dx --dy` (step ladder),
`--ox --oy --r --c --m` (ladder sections, step ladder: rotation origin, closed angle, fold-back window),
`--mx --my --m0` (car planes), `--b --k / --b --m` (lights that go off again). The geometry in the file is
the finished state; CSS computes every other pose from `--p`.

The script (`main.js`, "Roof build scene") writes `--p` on a part only while the story is inside one of its windows (the time pairs
listed in `TIMES`, padded by 0.012) and once as it leaves; the svg pins `--p`, so the rest of the drawing
is never restyled (about 36 elements a frame, against about 260 when the svg carried `--p`). The phone
camera reads `--bs-cam`, which isn't inherited; it's written only on portrait stages and only inside the
camera's two windows (`--cam-a/--cam-l`, `--cam-b/--cam-m` on the svg). The roller door and the garage
light are timed transitions keyed on `data-shut` (the svg's `data-shut`: the moment the car stops), like
the work light's flicker.

The beats (`BEATS`) must match the captions' `data-at` in `index.html`, and the rail's six segments (`--at`,
`--to`) follow them; the generator warns if the captions don't. Parts are authored on a draft timeline
(`DRAFT`: the story's first cut, which had separate framing and sheet beats) and mapped knot by knot onto
the real one, so the floor's beat spans the draft's 0.155..0.39 and the carry's own timing (and its
checks) are unchanged.

## Changing it

Edit the dimensions, colours (`C`), loads (`LOADS`) or windows in the script, run it, and scroll
through `#build` in a browser at a wide size and a phone size (the `--concept` stills show what each beat
should look like). Keep the inline SVG under ~70 KB (it's ~58 KB) and
the moving parts under ~250 (62). Pacing: the track is 430vh (345vh on portrait stages) and its last 12% holds
the finished picture, so a unit of `--p` is about 2610px of scroll at 1440 × 900. The scroll the old framing
and sheet beats used went to the light coming on, the floor's moment, the carry and the drive in. Keep every scrubbed move
at 0.04 or more, and a ladder section's half turn at about 0.05.
