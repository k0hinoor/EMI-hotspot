# V1.0 feature checklist → where it lives

Every item from the V1.0 checklist is implemented. Nothing here is fed by hidden sample data: each
capability reads the live serial stream or records already captured from it. Synthetic values are
available only through the explicit **Demo Mode** documented at the end of this file.

| # | Feature | Where | How to see it |
|---|---------|-------|---------------|
| 1 | Live Scan and signal monitoring | `src/pages/LiveScan.tsx` (frame 1) | Raw reading, filtered value, frame counter, stale detection, Start/Pause/Stop/Reset |
| 2 | E-field / H-field probe selector | `src/components/ProbeSelector.tsx` | Two-button identity switch; device-reported type is shown beside it and mirrored into every reading |
| 3 | Manual grid-based Heatmap | `src/pages/Heatmap.tsx` + `src/lib/heatmap.ts` | Board size + spacing → cell grid; measured-only canvas; unmeasured cells stay empty |
| 4 | Signal vs Time graph | `src/components/SignalChart.tsx` | ECharts plot of received frames only, 10 s–5 m window, freeze control |
| 5 | Peak, Average and Noise Floor | `LiveScan` readout band, `SignalAnalysis` live statistics | All three over a stated window, with the frame count that produced them |
| 6 | Hotspot ranking and coordinates | `Heatmap` → "Hotspots" frame | Valid readings sorted high→low with cell label and mm coordinates |
| 7 | Data Log and measurement history | `src/pages/DataLog.tsx` | Search, scan/probe/quality/date filters, provenance detail pane, CSV export, delete |
| 8 | Scan Reports and CSV/PDF export | `src/pages/Reports.tsx` + `src/lib/pdf.ts` | Real jsPDF report (heatmap image, table, limitations page) and CSV with provenance columns |
| 9 | Probe Calibration | `src/pages/Calibration.tsx` | Per-probe identity, baseline/gain profiles, live baseline check, profile history |
| 10 | Hardware Settings and connection status | `src/pages/Settings.tsx` + header rail | Port, baud, transport availability, acquisition rules, raw link log, persistent status |
| 11 | E/H comparison | `SignalAnalysis` → "Scan comparison" | Grouped bars, separate axes per probe type — never a shared scale |
| 12 | (implicit) Connection prompt / no fabricated readings | Header rail, `ConnectDialog`, empty states | With no device every value field stays blank and labelled |

## Navigation — page by page, never one long scroll

Eight frames in the sidebar (or number keys `1`–`8`):

`1` Dashboard · `2` Live Scan · `3` Heatmaps · `4` Analytics · `5` Data Log · `6` Reports · `7` Calibration · `8` Settings

**Dashboard** is the overview frame: 3D topology surface, reading-quality donut, animated signal
anomaly deltas, per-column signal profile and capture-activity bars. Every panel is fed by the live
frame buffer or stored measurements — with no device it shows labelled empty states instead of
placeholder data.

Each page fills the viewport: panels are fixed-height and scroll internally, so the dashboard never
turns into a long document. Deep links work (hash routes), and the status rail stays visible on
every frame.

## Demo Mode (inspection without hardware)

`src/lib/demo.ts` is the only module that generates synthetic values; `src/store/app.ts` streams them
through the real `handleFrame` path as `#HELLO`/`#DATA` lines from device `DEMO-000`.

| Control | Effect |
|---------|--------|
| Topbar **Demo data** | Loads two scans (60 × 40 mm @ 4 mm, E and H probes), ~220 readings, a quality mix and superseding readings, then starts a live-looking stream |
| Topbar **Pause / Resume** | Halts or restarts the synthetic frame feed |
| Topbar **Exit demo** | Purges demo scans, readings, frames, probe and session identity; returns to the blank hardware state |

Every demo reading has `is_demo: true` and is badged `DEMO` on Dashboard, Live Scan, Heatmap,
Analytics, Data Log and Reports. CSV export adds an `is_demo` column and a `demo_note` line; PDF
reports print an orange banner and footnote. Demo records are never written to storage, so a reload
returns to the hardware-only state.
