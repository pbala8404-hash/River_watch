# River Watch — Flood Early-Warning System

**SIH 2026 Internal Practical Assessment** · Ganesh Bala P · Reg 411724106013 · PSVPEC ECE, Year III

## The problem, in two lines

A riverside block's water level is currently read by eye off a marked
pillar and phoned in, so warnings arrive late and no record exists to
learn from. River Watch replaces that with a sensing node that reads
the level continuously, warns locally even with no network, and feeds
a control-room dashboard that shows current levels and their trend.

## How to run it

**Dashboard**
1. You need a local server (the page `fetch`es `data/readings.json`,
   which browsers block over a bare `file://` path).
2. From the project folder: `python3 -m http.server 8000`
3. Open `http://localhost:8000` in a browser.
4. Search, filter, and click any row to open its detail panel.

**Firmware (Wokwi simulation)**
1. Go to [wokwi.com](https://wokwi.com), start a new ESP32 project.
2. Paste in `firmware/sensing_node.ino` and `firmware/diagram.json`.
3. Run the simulation. Drag the `wokwi-hc-sr04` sensor's `distance`
   slider to raise/lower the simulated water level and watch the
   LEDs/buzzer and the Serial Monitor JSON output respond.

## Field meanings (`data/readings.json`)

| Field | Meaning | Values |
|---|---|---|
| `reading_id` | Unique ID for one reading | `R001`–`R040` |
| `location` | Monitoring point name | One of 4 stations: Anaikatti Bridge, Periyar Colony Bund, Sengal Pump House, Vellalur Check-dam |
| `water_level_m` | Water height above the pillar's zero mark, in metres | `0.0`–`6.0` typically; `null` on sensor dropout; occasionally a spike beyond range that is flagged, not trusted |
| `status` | System's read on the reading | `normal` (< 2.5 m), `warning` (2.5–3.49 m), `danger` (≥ 3.5 m), `fault` (rejected as implausible or stuck), `unknown` (value missing) |
| `recorded_at` | Timestamp the reading was taken, ISO 8601 with IST offset | e.g. `2026-07-20T06:05:00+05:30` |
| `device_id` | Which physical node took the reading | `DEV-01`–`DEV-04`, one per station |

The dataset includes three awkward cases on purpose: a missing value
(`R024`), an implausible spike (`R025`, 9.40 m against a 6 m gauge
ceiling), and a stuck sensor (`R035`–`R038`, frozen at 2.40 m while the
station is visibly still rising). These are what the search/filter and
the trend calculation both have to survive.

## How the derived figure is calculated

Opening a reading's detail view shows, at the top, either a **rate of
rise** or a **projected time to the 3.5 m danger threshold** for that
station — the number the control room would actually act on.

1. Take every reading at that station, sorted by time.
2. Drop any reading flagged `fault` or `unknown` — a stuck or
   implausible value would otherwise fake a flat trend or a false
   spike.
3. `rate (m/hr) = (last reliable level − first reliable level) ÷ hours between them`
4. If the station is already ≥ 3.5 m: show "Already at danger level."
5. If rising: `hours to danger = (3.5 − last level) ÷ rate`, shown as
   the projected time.
6. If flat or falling: show "Steady or falling."

A running average of the reliable readings is shown underneath as
supporting context. This was checked by hand for Anaikatti Bridge in
`docs/test_log.md` §4 and matched the dashboard's output.

## What's not finished

- No live network link from the Wokwi firmware into
  `data/readings.json` — they're integrated by sharing the same field
  names and value ranges, not by a running data pipeline. A serial
  bridge script is the natural next step.
- Only Anaikatti Bridge has a wired-up Wokwi circuit; the other three
  stations exist only in the sample dataset, not as simulated nodes.
- No persistence layer — refreshing the dashboard always reloads the
  static `data/readings.json` rather than any readings a real node
  would append over time.

## Repository structure

```
index.html              Main screen + detail panel (Tasks 2 & 3)
style.css
app.js
data/readings.json       40-record sample dataset (Task 1)
firmware/sensing_node.ino  ESP32 sensing node (Task 4)
firmware/diagram.json, wokwi.toml
docs/test_log.md          Integration & test log (Task 5)
```
