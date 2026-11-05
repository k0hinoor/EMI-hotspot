# EMI Hotspot Mapper — Dashboard

A hardware-assisted near-field EMI measurement dashboard built to the requirements in
[`prd.md`](./prd.md). It reads real frames from the detector over USB serial, records
measurements against physical grid coordinates, and renders them as a measured-only heatmap.

**There is no hidden mock data and no simulated signal path in this build.** Until a device
streams frames over the serial link every value in the interface is blank and labelled as such.
Synthetic values exist only behind an explicit, one-click **Demo Mode** (see below) that is
removable in the same click and stamps every record it creates as demo.

---

## Demo Mode — inspect every panel without hardware

Press **Demo data** in the topbar (or open any page and use the same control) to fill the whole
dashboard with a labelled synthetic session; press **Exit demo** to return to the empty,
hardware-only state. Demo Mode is unmistakable on purpose:

- a persistent `DEMO DATA` chip in the topbar and orange `DEMO` badges on every page that shows values;
- every reading carries `is_demo: true` and the device id `DEMO-000`; the stream can be paused/resumed;
- exported CSV gains an `is_demo` column plus a `demo_note` envelope line, and PDF reports print an
  orange demo banner and footnote;
- demo records are never persisted — a reload drops them, and *Exit demo* purges the synthetic scans,
  readings, frames and session identity in one action.

All synthetic values come from a single module, [`src/lib/demo.ts`](./src/lib/demo.ts), and are fed
through the **real** frame handler (`#HELLO` / `#DATA`), so heatmap, topology surface, quality donut,
statistics, log and reports exercise exactly the code paths the hardware uses.

## ESP32-CAM as the sensor head

The ESP32-CAM is the machine-vision source: it sees the board **and** reads the detector, then ships
both over one WebSocket so the dashboard never has to guess what was true when a frame was captured.

**Firmware** — [`firmware/emi_hotspot_esp32cam.ino`](./firmware/emi_hotspot_esp32cam.ino) (AI-Thinker
ESP32-CAM, OV2640). Per frame it sends a meta line then the JPEG:

```
#CAM {"seq":418,"fw":"esp32cam-1.1.0","signal_raw":1180,"signal_filtered":1152,
       "spread":64,"status":"VALID","probe":"E_FIELD","w":640,"h":480,"fps":12,"samples":32}
<binary JPEG>
```

The same text protocol is mirrored on USB serial (`#HELLO`, `#DATA`, …) for a machine without Wi-Fi.

> **ADC wiring note.** ADC2 (GPIO 13) shares silicon with the Wi-Fi radio, so its readings are
> unreliable while the camera and radio run. For trustworthy numbers feed the detector envelope into
> **GPIO 2 or GPIO 15 (ADC1)** and change `DETECTOR_PIN`. The sketch reports what it actually read —
> out-of-range and high-spread frames are labelled, never smoothed away.

**Dashboard side** — open **Machine Vision** (`4`), set the module host and press **Connect module**
(`ws://<host>:81/stream`). MJPEG (`http://<host>:81/stream`) is supported for the stock
CameraWebServer sketch, but it carries picture only — the reading still has to come over serial.

What the link reports, all measured from arriving frames:

| Panel | What it shows |
|-------|---------------|
| Module | link state, frames, delivered fps, resolution, frame size, **arrival median / p95 jitter**, dropped |
| Stream health | delivery-rate and frame-size sparklines, jitter, sample count |
| Viewfinder | the decoded JPEG, `frame #seq`, size, fps, kB — painted to canvas so a 12 fps stream doesn't flicker |
| 3D reconstruction | that frame used as the board texture, with the measured field draped over it |

A socket that opens but stops delivering is reported **STALLED** rather than left "live"; a decode
failure is shown as an error, never as a picture. Frames are buffered and replayed on a fixed cadence,
because Wi-Fi bursts two or three JPEGs at once — the *rate* is smoothed, the frames are untouched.

## Trace stability

The live trace looked unstable for three real reasons, and each is handled explicitly in
`conditionSeries()` (`src/lib/derive.ts`):

1. **ADC quantisation noise** → a 5-frame **median** rejects isolated outliers; a genuine hotspot
   plateau survives untouched.
2. **Drop-outs / spikes** → gated out of the estimate and shown as a gap, never averaged into a value.
3. **Saturation clipping** → saturated frames are **held out** of the estimate and counted in the
   tooltip, because a clipped reading is not a quiet one.

`Live Scan` (`2`) exposes **Smoothed / Median / Raw**. In every mode the raw frames stay visible behind
the conditioned line, and the stability readout (`stability 2.4%`) is computed from the raw frames, so
drawing cannot flatter the number. Statistics elsewhere keep using raw values only.

## Machine Vision — camera + 3D reconstruction

The **Machine Vision** frame (key `4`) puts the machine itself on screen:

- **Live camera** — the real browser `MediaDevices` stream of your webcam / PCB camera.
  Nothing is simulated. With no camera (or permission refused) the viewfinder stays **black** and
  states the reason — *no camera detected*, *permission refused*, *in use by another app* — with a
  **Use camera** button. It never shows a placeholder picture.
- **3D reconstruction** — the module frame is used as the **texture** of a board plane sized from the
  active scan (mm). Measured EMI readings are interpolated into a **lit sheet** and draped over it.
  The renderer (`src/lib/scene.ts`) is a small software rasteriser: perspective camera, per-facet
  Lambert + rim lighting, depth-sorted facets with seam-free edges, 2.5× supersampling, and a textured
  board mesh so the picture follows the geometry instead of being stretched over one quad.
  Drag to orbit, wheel to zoom, and switch the overlay off to inspect the DUT alone.
- **Provenance** — resolution, delivered fps, device id and capture count come from the track itself.
  Captured stills stay in memory for the session (never persisted), exportable as PNG.

Camera access needs a secure origin (`https` or `localhost`) and explicit permission. In **Demo Mode**
the camera is *not* opened: the panel shows a clearly stamped `DEMO CAMERA FEED` painted by
`src/lib/demo.ts`, so a synthetic picture can never be mistaken for your bench.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle
```

Web Serial (the default transport) requires a Chromium-based browser on a secure origin
(`https://` or `localhost`). The packaged desktop build uses the native serial bridge instead —
see *Desktop packaging* below.

## Connect the hardware

1. **Flash the firmware.** [`firmware/emi_hotspot_serial.ino`](./firmware/emi_hotspot_serial.ino)
   is a reference sketch for an Arduino-class board. Detector output → `A0`, USB → the laptop.
2. **Fit a probe.** E-field monopole or H-field loop on the shared detector input, and set the
   probe type on the device (or via `#PROBE`).
3. **Open the link.** In the dashboard press **Connect device** → pick the port → **Connect**.

The board identifies itself and then streams one frame per line:

```
#HELLO {"device_id":"EMI-001","firmware_version":"1.0.0","protocol_version":1,"probe_type":"E_FIELD","sample_rate_hz":20}
#PROBE {"probe_type":"H_FIELD"}
#DATA  {"seq":184,"signal_raw":1842,"signal_filtered":1798,"sample_count":32,"status":"VALID","probe_type":"E_FIELD"}
#INFO  {"sample_rate_hz":20}
#ERR   {"code":"ADC_TIMEOUT","message":"ADC read timed out"}
```

`type`/`kind` JSON envelopes are also accepted instead of the `#TYPE` prefix. Frames are parsed
and validated in [`src/lib/protocol.ts`](./src/lib/protocol.ts); anything malformed, out of ADC
range, or missing a signal value is rejected and counted in the link log rather than turned into
a reading. Downgoing commands: `#IDENTIFY`, `#START`, `#PAUSE`, `#STOP`, `#PROBE <TYPE>`, `#ZERO`,
`#PING`.

### Windows desktop

The dashboard talks to the native shell through an optional `window.__EMI_SERIAL__` bridge
(`listPorts`, `connect`, `write`, `disconnect`, plus `onLine`/`onClose`/`onError`). Provide that
object from the Tauri/Rust side and the same UI runs against native COM ports with no changes.
If neither Web Serial nor the bridge exists the app says so and disables capture.

## What the pages do

| Page | Purpose |
| --- | --- |
| **Dashboard** | Session overview: 3D surface topology (drag to orbit), reading-quality donut, signal-anomaly deltas with sparklines, per-column signal profile, capture-activity bars. |
| **Live Scan** | Raw and firmware-filtered readings, signal-vs-time plot, peak/average/baseline over a stated window, stability verdict, capture with coordinate. |
| **Heatmap** | Millimetre grid from board dimensions and spacing, cell selection with coordinate, capture / re-measure, measured-only rendering, optional hatched interpolation overlay, hotspot ranking, coverage, CSV + PNG export. |
| **Signal Analysis** | Amplitude history, reading distribution, live and per-scan statistics, E/H comparison on separate axes. Frequency analysis is explicitly unavailable. |
| **Data Log** | Every stored measurement with full provenance, search and filters (scan, probe, quality, date range), detail panel, CSV export, delete. |
| **Reports** | Real PDF generation (jsPDF): scan identity, summary statistics, measured heatmap image, measurement table, calibration context, limitations page. Also CSV. |
| **Calibration** | Per-probe identity, baseline/gain profiles, live baseline check, profile history. |
| **Settings** | Link control, acquisition rules (ADC full scale, saturation, staleness, instability), storage, raw link log, protocol reference. |

## Measurement honesty rules

These are enforced in code, not just labelled in the UI:

- **Nothing is invented.** Capture is refused when no frame exists, when the last frame is stale,
  or when the device flagged it invalid.
- **Quality is never silently upgraded.** Values at/above the saturation count are stored as
  `SATURATED`; out-of-range values and frames without a probe identity are `INVALID`. Invalid and
  saturated readings are excluded from valid statistics.
- **Spatial truth.** Unmeasured cells stay visibly empty; the heatmap never fills them in.
  Interpolation is a hatched overlay, marked derived, excluded from statistics and exports.
- **Re-measurement keeps history.** The superseded reading stays in the data log, is marked
  invalid and links to the reading that replaced it.
- **Units stay relative.** Defaults are ADC counts with an explicit full-scale and saturation
  threshold. Baseline correction is labelled separately from calibration, and absolute
  field-strength claims are not made anywhere.
- **Provenance travels.** Every measurement stores probe, scan, coordinate, timestamp, quality,
  device, firmware protocol, ADC settings and calibration profile; all of it appears in CSV/PDF.

## Layout

```
src/
  lib/
    types.ts      data model (PRD §11)
    protocol.ts   frame parsing + validation + stability classification
    serial.ts     Web Serial / native bridge transports
    heatmap.ts    grid view model + canvas renderer
    surface.ts    3D topology model (IDW) + isometric canvas renderer
    derive.ts     statistics, grid maths, colour ramp, formatting
    csv.ts        CSV/JSON export
    pdf.ts        PDF report generator
    storage.ts    IndexedDB keyed store
  store/app.ts    application state, capture pipeline, persistence
  components/     sidebar shell, glass cards, charts, heatmap + topology canvases, dialogs
  pages/          the seven navigation sections
firmware/         reference detector sketch
```

State and records persist locally in IndexedDB. `Settings → Data & storage` exports a full JSON
archive, and the same page can clear records with confirmation.

## Scope limits (by design)

Not a compliance instrument, not a calibrated field-strength meter, not a spectrum analyzer.
Manual probe positioning governs spatial accuracy, and E-field and H-field readings are never
combined on a common scale.
