# Oh Jee!! — J/88 Tactician 🛥️

A mobile-first race-day brain for the J/88 **Oh Jee!!** (Quantum sails), built for the
Thursday-night CanOne regatta. Feed it wind, current, and the course; it tells the crew
**what heading to sail on every leg, the target boat speed, and exactly how to tune the
rig and sails.**

It's a **static web app** — no build step, no server, no Node. Just HTML/CSS/JS. Host it
anywhere and the whole crew opens one URL.

## Built for the Can One series

This is wired for the **2026 Can One Thursday Night Series** (COERA / Larchmont YC) on
western Long Island Sound, where Oh Jee (USA 25) races the **J/88 one-design class**:

- One-tap **"Use Can One venue"** sets the start by Execution Rocks and the next Thursday
  **19:00** warning. **Every heading and bearing in the app is °Magnetic** so the numbers match
  the RC course board and your compass directly — no true-vs-magnetic toggling. The magnetic
  **variation is pulled live from your location** (BGS World Magnetic Model, keyless) on each
  fetch, so it's always right and self-updating anywhere, with the venue default as fallback if
  offline. The internal math runs in true; you only ever see magnetic.
- The geometry comes straight from the SIs' **Appendix A2 matrix** — the official magnetic
  bearing + distance between every pair of marks (A–U), the same numbers on the RC course
  board. Fixed-mark legs use those values directly, so a displayed `295°M / 3.9 nm` is the
  table cell, not an approximation.
- **"Tonight's course"** — tap the Can One government marks the RC signals **in race order**
  (each shows its order number; tap again to remove), pick laps and rounding (port, or
  **starboard for a green placard**), and it builds the whole plan. Start/finish at A and the
  90-min time limit are handled. Every leg's bearing and distance comes straight from the SI's
  Appendix A2 mark table — no estimation.
- The **Tips** tab carries the Can One race rules, VHF 71, and the J/88 fleet you're racing.

## What it does

- **Conditions** — load the Can One venue, or search any venue / GPS / lat-lon, set the race
  time, and pull the forecast:
  - **Wind** from Open-Meteo's **HRRR (3 km)** model — the high-res model that resolves the
    local sea breeze a global model smears away — falling back to ECMWF automatically when
    HRRR's 48 h horizon doesn't reach the race. A single **forecast-confidence line** (High /
    Medium / Low, plus a light-air flag) is computed quietly from cross-model agreement so you
    know how much to trust it: tight agreement = commit; wide spread or light air = stay
    flexible. No model picker — HRRR is the call.
  - A **race-window timeline** (17:00→21:00 from HRRR's hourly data) shows the wind speed and
    direction through the start window with a trend read — the single most important twilight
    dynamic, since these races start as the afternoon sea breeze dies. "Dying 10→3 kt — tune
    for the lulls, hunt the last pressure" beats knowing only the 19:00 number.
  - **Current** at the Can One venue from the **actual NOAA tidal-current prediction**
    (station LIS1036, Execution Rocks) — speed, set, flood/ebb — for your race time, plus a
    **"Tide through the race" timeline** (30-min steps) that calls out if the current turns
    mid-race.
  - **🔴 LIVE mode** — arms itself around race time (1 h before the start → 2.5 h after) and
    auto-refreshes **measured wind** from the NOAA Kings Point anemometer (~3 nm from the
    start, 6-minute updates) + the tide at this minute. Pauses automatically the moment you
    set a slider by hand (manual override always wins); one button pauses/resumes or turns it
    on outside the window. The answer to "the forecast is 30 minutes stale."
  - Override anything by hand with big sliders.
- **Course** — build **tonight's Can One course** by mark letters (above), or use the generic
  builder: a Windward-Leeward (1–3 laps) / triangle, or hand-added marks by bearing + distance.
- **Plan** — per-leg cards:
  - Leg type (**beat / reach / run**) from the true wind angle to the mark.
  - **Beats/runs:** both tacks/gybes with the heading to steer, boat speed, course-over-
    ground, and VMG-to-mark — the **favored** side is starred (it accounts for current).
  - **Reaches:** the single compass heading to steer, **current-corrected** so you actually
    lay the mark, plus whether the A2 kite is carryable.
  - Distance + estimated leg time, and J/88-specific tactical notes.
  - **Layline calls** on beats/runs: the exact **current-adjusted** bearing to tack/gybe on —
    e.g. *"tack to starboard when Mark C bears 157°M"* (put it on a hand-bearing compass and
    tack when the mark reaches it). Uses COG, not heading, so the current is built in.
- **Layline** (its own tab) — **live GPS layline assist**: pick a mark and it uses your **GPS +
  the mark's position** to show, in real time, the bearing to the mark, the two layline
  bearings, and **"tack to starboard in 15° → TACK NOW"** with an **OVERSTOOD** warning if you
  sail past. Each beat/run leg also has a button that jumps here with that mark preselected.
  GPS only runs while you're on the tab. (GPS ±5–10 m, so treat the call as ±a boatlength or two.)
  It also runs a **shift tracker**: while you beat, it derives the *actual* wind from your GPS
  track (current-corrected, both tacks), shows lifts/headers vs the plan wind — *"tracked wind
  179°M · 12° RIGHT → starboard lifted"* — and one tap **applies the tracked wind to the plan**,
  re-computing every heading, layline and tune band from what the boat is actually feeling.
  - A **shore-vs-offshore pressure call** (lite spatial wind): HRRR is sampled at 3 points
    ~3 nm apart across the Sound. When the gradient clears model noise (≥2 kt) the plan shows
    a bold *"Pressure: ~3 kt more offshore — favor the right of the first beat"* (+ a geographic-
    bend note in a real breeze); when it's within noise it shows a dimmed *"Pressure even — no
    side favored"* so you can always see the read without it ever bluffing a side call.
- **Start** — a race-start tab with two tools: a **countdown timer** with **sync-to-gun**
  (tap on each RC signal and it snaps to the nearest minute) and audio cues at 1:00 / 30 s /
  the last 5 s / the gun; and a **line-bias** calculator. The Can One start line is committee
  boat → Mark A, and Mark A's position is known — so you just **ping the committee boat at
  check-in** (or sight the line bearing) and it tells you which end is favored, by how many
  degrees off square, and the boat-length advantage.
- **Tune** — the matching **Quantum J/88 Quick Tune Chart** band for the current wind,
  transcribed verbatim from the chart: V1/D1/D2 shroud turns, jib inhaul area, jib lead,
  outhaul, traveler, vang, backstay, jib furl, jib (L/M vs HVY) and spinnaker (A2/A3) —
  plus base dock-tune numbers and ORC target speeds/angles/heel. Every control has an **ⓘ**
  that opens a self-contained WHERE / WHAT IT DOES / HOW explainer — where the control
  physically is on the boat, what it changes, and how to set it (e.g. counting turnbuckle
  turns from your taped base marks). No references to external charts.
- **Tips** — J/88 crew playbook by phase (twilight/dying-breeze, starts, upwind, downwind, maneuvers, current).
- **Night-vision mode** 🌙 — red low-light theme so the helm keeps dark-adapted eyes on a
  night start. All headings are **°Magnetic** to match the boat compass and course board.

Everything persists in the browser (localStorage), so a setup survives a reload on the rail.

## The data behind it (so you can trust the numbers)

- **Polars / target speeds + heel:** the official **ORC J/88 Speed Guide** polar (VPP 2013) —
  the full angle-by-angle boat-speed grid — confirmed against Oh Jee's own taped cockpit
  target card, which also supplies the **target heel** (the gauge the crew trims to live),
  shown per leg and in the Tune targets.
- **Tuning:** the **Quantum Sails J/88 Quick Tune Chart** (turns-from-base + Loos PT-2),
  cross-checked against the North Sails J/88 guide.
- **Tactics:** North Sails / Quantum J/88 articles, the J/88 class association, and forums.
- **Marks & geometry:** the 2026 Can One Sailing Instructions — the Appendix A2 mark matrix
  (bearings/distances) and course conventions, plus the Notice of Race and registration list.
  The marks are referenced by their SI letter (A–U); the app does not assert which physical
  buoy each letter is, since the course-board letter scheme is what the RC actually signals.

Source links are listed in-app on the **Tips** tab. Numbers were transcribed from those
published guides; verify against your boat's own calibration and the latest class guides.

## Run it locally

It's just files — open `index.html`, or serve the folder:

```bash
cd oh-jee-tactician
python3 -m http.server 8000     # then visit http://localhost:8000
```

## Host it (pick one — all free, ~2 minutes)

The app is fully static, so any static host works:

- **Netlify** — drag the `oh-jee-tactician` folder onto https://app.netlify.com/drop.
- **Vercel** — `vercel deploy` from this folder, or import the repo.
- **Cloudflare Pages** — connect the repo, build command *none*, output dir = this folder.
- **GitHub Pages** — push this folder to a repo, enable Pages on the branch root.

No API keys are needed — Open-Meteo is keyless and called straight from the browser.

## Files

```
index.html              app shell + bottom nav
css/styles.css          dark / night-vision styling
js/data.js              Quantum tune bands, ORC polar, J/88 tips, sources
js/geo.js               navigation + polar interpolation + per-leg routing math
js/weather.js           Open-Meteo wind/current/geocode fetch
js/app.js               UI controller, state, rendering
manifest.webmanifest    installable to home screen
```

## Notes & honest caveats

- **Current:** at the Can One venue the app uses NOAA's tidal-current prediction (the right
  source for a tidal Sound). Elsewhere it tries Open-Meteo's ocean current, which only
  resolves open coastal water — inland/estuary venues return none, so enter current by hand.
  Wind is available everywhere.
- The router optimizes each leg in isolation from the polar + a current triangle. It does
  **not** model wind shifts, persistent vs oscillating breeze, traffic, or right-of-way —
  it's a fast, honest "what's the geometry telling me" tool, not an autopilot. Sail your
  shifts.
- The 20 kt downwind polar row is a genuine planing spike in the ORC data; treat the
  light/heavy transition around 16 kt as a step, not a smooth ramp.

Sail fast. 🏁
