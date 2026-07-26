# Integration & Test Log — River Watch

This log records the checks run across the whole system: dataset →
dashboard → sensing node → local warning, and back.

## 1. End-to-end flow with real data

| Step | Action | Expected | Result |
|---|---|---|---|
| 1 | Open `index.html` via a local server | List of 40 readings loads, sorted newest first | ✅ Pass |
| 2 | Type `Anaikatti` in search | List narrows live, no button press needed | ✅ Pass |
| 3 | Set Status filter to `danger` | Only R008, R009, R010 (Anaikatti) remain | ✅ Pass |
| 4 | Check the count line | Reads "Showing 3 of 40 readings" | ✅ Pass |
| 5 | Click reading R010 | Detail panel opens, derived figure appears at top | ✅ Pass |

## 2. Normal, extreme, and faulty case log

| Case | Reading ID | Input | System behaviour | Result |
|---|---|---|---|---|
| **Normal** | R001 | `water_level_m: 1.80`, Anaikatti Bridge | Status `normal`, green gauge fill, no local alarm | ✅ Pass |
| **Extreme (real, not faulty)** | R010 | `water_level_m: 3.85` — genuine danger-level rise | Status `danger`, red gauge, derived figure shows "Already at danger level" | ✅ Pass |
| **Faulty — missing value** | R024 | `water_level_m: null` (Vellalur Check-dam, sensor dropout) | Table shows "—" with a flag; detail view reports "Missing — sensor dropout" instead of crashing or showing `NaN` | ✅ Pass |
| **Faulty — implausible spike** | R025 | `water_level_m: 9.40` — beyond the 6 m gauge ceiling | Status `fault`; detail view reports "implausible, rejected"; excluded from the rate-of-rise calculation so it can't fake a trend | ✅ Pass |
| **Faulty — stuck sensor** | R035–R038 | Sengal Pump House repeats `2.40` for 4 straight readings while rain is clearly ongoing | Status `fault` from the point it plateaus; `reliableHistory()` drops these from the trend so the projection isn't dragged flat | ✅ Pass |

Firmware-side equivalents of the same three cases were exercised in the
Wokwi simulator by editing `wokwi-hc-sr04`'s `distance` attribute:
setting it to `0` (echo saturates → implausible level) and freezing it
at a fixed value both correctly triggered the `plausible == false` /
smoothing paths in `sensing_node.ino` instead of updating the LEDs on
a single bad sample.

## 3. Offline behaviour (no network coverage)

| Step | Action | Expected | Result |
|---|---|---|---|
| 1 | In Wokwi, leave the ESP32 running with no Wi-Fi code active at all | LED/buzzer warning still switches with water level | ✅ Pass — the local warning in `updateLocalWarning()` reads only the on-device smoothed value; it has no network call in its path |
| 2 | Push the simulated level past 3.5 m | Red LED and buzzer activate immediately, independent of the dashboard | ✅ Pass |
| 3 | Disconnect `index.html` from `data/readings.json` (rename the file) | Dashboard shows the error state with a Retry button, not a blank screen | ✅ Pass |

## 4. Manual check of the derived figure

Station: **Anaikatti Bridge** (DEV-01), reliable readings only (all 10 are numeric and non-faulty):

- First reliable reading: R001, 1.80 m at `2026-07-20T06:05`
- Last reliable reading: R010, 3.85 m at `2026-07-21T18:05`
- Elapsed time: 36 hours
  The dashboard's `renderDerivedFigure()` computed **+0.06 m/hr**, which
matches the hand calculation to the displayed precision. Because the
last reading (3.85 m) is already above the 3.5 m danger threshold, the
panel correctly shows "Already at danger level" rather than a
projected time, which was also checked by hand against the threshold
table.

Running average check: (1.80+1.95+2.10+2.30+2.55+2.80+3.05+3.35+3.62+3.85) / 10
= 25.37 / 10 = **2.54 m**, matching the panel's "Running average 2.54 m" line.

## 5. Loading / empty / error states

| State | How triggered | Behaviour |
|---|---|---|
| Loading | On first page load, before `fetch` resolves | Table shows a centred "Loading…" row; result count reads "Loading readings…" |
| Empty | Search for a location/device that matches nothing (e.g. `zzz`) | "No readings match this search and filter combination" with a Clear button |
| Error | `data/readings.json` missing, renamed, or malformed | Error banner with the underlying message and a Retry button; table body is cleared instead of left showing stale rows |

## What's not finished

- The firmware emits readings over Serial in the dashboard's JSON
  shape, but there is no live Wi-Fi/HTTP push from the ESP32 into
  `data/readings.json` yet — the two are integrated by schema, not by
  a live network link. A serial-to-file bridge script would be the
  next step.
- Only one station (Anaikatti Bridge) has a wired Wokwi circuit;
  the other three stations exist only in the sample dataset.
