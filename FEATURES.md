# V1.0 feature checklist → where it lives

Every item from the V1.0 checklist is implemented. Nothing here is fed by sample data: each
capability reads the live serial stream or records already captured from it.

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

Seven frames, switched from the top bar (or number keys `1`–`7`):

`1` Live Scan · `2` Heatmap · `3` Analysis · `4` Data Log · `5` Reports · `6` Calibration · `7` Settings

Each page fills the viewport: panels are fixed-height and scroll internally, so the dashboard never
turns into a long document. Deep links work (hash routes), and the status rail stays visible on
every frame.
