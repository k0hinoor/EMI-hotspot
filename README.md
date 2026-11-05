# EMI Hotspot Mapper — Dashboard

A hardware-assisted near-field EMI measurement dashboard built to the requirements in
[`prd.md`](./prd.md). It reads real frames from the detector over USB serial, records
measurements against physical grid coordinates, and renders them as a measured-only heatmap.

**There is no demo data, no sample data and no simulated signal path in this build.**
Until a device streams frames over the serial link every value in the interface is blank and
labelled as such.

---

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
