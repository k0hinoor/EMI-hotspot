import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Check,
  CircleAlert,
  Crosshair,
  Download,
  Eraser,
  Grid3x3,
  ImageDown,
  Layers,
  Map as MapIcon,
  Plus,
  RefreshCw,
  Ruler,
  ScanLine,
  Trophy,
} from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  Button,
  EmptyState,
  KeyValue,
  Notice,
  Panel,
  PanelHeader,
  Segmented,
  Select,
  StatusDot,
  Switch,
  cn,
  type Tone,
} from '../components/ui'
import { HeatmapCanvas } from '../components/HeatmapCanvas'
import { ScanSetupDialog } from '../components/ScanSetupDialog'
import {
  cellCoordinate,
  formatDateTime,
  formatNumber,
  formatTime,
  gridGeometry,
  probeLabel,
  rampGradientCss,
  relativeTime,
  summariseScan,
} from '../lib/derive'
import { buildHeatmapView } from '../lib/heatmap'
import { downloadBlob, downloadText, measurementsToCsv, stamp } from '../lib/csv'
import type { Measurement, QualityStatus } from '../lib/types'

function qualityTone(q: QualityStatus): Tone {
  return q === 'VALID' ? 'ok' : q === 'UNSTABLE' ? 'warn' : 'danger'
}

export function HeatmapPage() {
  const {
    scans,
    measurements,
    activeScanId,
    selectedCell,
    setActiveScan,
    selectCell,
    captureMeasurement,
    markInvalid,
    clearScanMeasurements,
    setScanStatus,
    setActiveProbeType,
    settings,
    updateSettings,
    deviceState,
    signalState,
    samples,
    notify,
  } = useApp()

  const [setupOpen, setSetupOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'measured' | 'interpolated'>(
    settings.interpolation ? 'interpolated' : 'measured',
  )
  const [capturing, setCapturing] = useState(false)
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)

  const scan = useMemo(
    () => scans.find((s) => s.scan_id === activeScanId) ?? scans[0] ?? null,
    [scans, activeScanId],
  )

  useEffect(() => {
    if (scan && scan.scan_id !== activeScanId) setActiveScan(scan.scan_id)
  }, [scan, activeScanId, setActiveScan])

  useEffect(() => {
    if (scan) setActiveProbeType(scan.probe_type)
  }, [scan, setActiveProbeType])

  const scanMeasurements = useMemo(
    () => (scan ? measurementsForScan(measurements, scan.scan_id) : []),
    [measurements, scan],
  )

  const geometry = scan ? gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm) : null
  const summary = scan ? summariseScan(scanMeasurements, geometry?.totalCells ?? 0, settings.acquisition.unit) : null

  const ranked = useMemo(() => {
    if (!scan) return []
    const view = buildHeatmapView(scan, scanMeasurements)
    const list: { measurement: Measurement; label: string }[] = []
    view.cells.forEach((row, r) =>
      row.forEach((m, c) => {
        if (!m) return
        if (m.quality_status !== 'VALID' && m.quality_status !== 'UNSTABLE') return
        list.push({ measurement: m, label: cellCoordinate(view.geometry, c, r, scan.origin).label })
      }),
    )
    return list.sort((a, b) => b.measurement.signal_raw - a.measurement.signal_raw).slice(0, 6)
  }, [scan, scanMeasurements])

  const latest = samples.length ? samples[samples.length - 1] : null
  const selected = scan && selectedCell ? cellCoordinate(geometry!, selectedCell.col, selectedCell.row, scan.origin) : null
  const selectedMeasurement = useMemo(() => {
    if (!scan || !selectedCell) return null
    const view = buildHeatmapView(scan, scanMeasurements)
    return view.cells[selectedCell.row]?.[selectedCell.col] ?? null
  }, [scan, scanMeasurements, selectedCell])

  const canCapture =
    !!scan && !!selectedCell && deviceState === 'CONNECTED' && latest !== null && signalState !== 'STALE' && latest.quality !== 'INVALID'

  const capture = async () => {
    if (!scan || !selectedCell || !selected) return
    setCapturing(true)
    const result = await captureMeasurement({
      scanId: scan.scan_id,
      x_mm: selected.x_mm,
      y_mm: selected.y_mm,
    })
    setCapturing(false)
    if (result) notify('ok', `Cell ${selected.label} recorded`, `${formatNumber(result.signal_raw)} ${result.unit} · ${result.quality_status}`)
  }

  if (!scan) {
    return (
      <div className="grid gap-4">
        <Panel className="px-4 py-4">
          <EmptyState
            icon={<Grid3x3 size={30} />}
            title="No scan created"
            action={
              <Button variant="primary" icon={<Plus size={13} />} onClick={() => setSetupOpen(true)}>
                Create scan area
              </Button>
            }
          >
            Define the test area in millimetres and a grid spacing. The workspace stays empty until real measurements
            are captured at coordinates — no heatmap is drawn from assumed data.
          </EmptyState>
        </Panel>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['1 · Define area', 'Board width and height in mm, plus the grid spacing you can reliably probe.'],
            ['2 · Position probe', 'Move the physical probe to the selected cell, keep height and orientation constant.'],
            ['3 · Capture', 'Store the live reading against that coordinate; unmeasured cells stay visibly empty.'],
          ].map(([title, body]) => (
            <Panel key={title} className="px-4 py-3.5">
              <div className="text-[12px] font-medium text-ink">{title}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">{body}</p>
            </Panel>
          ))}
        </div>
        <ScanSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
      </div>
    )
  }

  const exportPng = () => {
    if (!canvasEl) return
    canvasEl.toBlob((blob) => {
      if (!blob) {
        notify('error', 'Image export failed', 'The canvas could not be encoded.')
        return
      }
      downloadBlob(`emi-heatmap-${scan.scan_id}-${stamp()}.png`, blob)
      notify('ok', 'Heatmap image exported', 'PNG of the measured grid as displayed.')
    }, 'image/png')
  }

  const exportCsv = () => {
    const csv = measurementsToCsv(scanMeasurements, scans, settings.export_defaults.csv_delimiter)
    downloadText(`emi-scan-${scan.scan_id}-${stamp()}.csv`, csv)
    notify('ok', 'Heatmap data exported', `${scanMeasurements.length} measurements written to CSV.`)
  }

  return (
    <div className="space-y-4">
      {/* Scan toolbar */}
      <Panel className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            className="h-8 w-auto min-w-[210px] max-w-[300px] text-[11.5px]"
            value={scan.scan_id}
            onChange={(e) => setActiveScan(e.target.value)}
          >
            {scans.map((s) => (
              <option key={s.scan_id} value={s.scan_id}>
                {s.scan_name} · {s.scan_id}
              </option>
            ))}
          </Select>
          <Badge tone={scan.status === 'COMPLETED' ? 'ok' : scan.status === 'ACTIVE' ? 'accent' : 'warn'}>
            {scan.status}
          </Badge>
          <Badge tone={scan.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>
            {probeLabel(scan.probe_type)}
          </Badge>
          <span className="hidden items-center gap-1.5 font-mono text-[10.5px] text-ink-dim sm:inline-flex">
            <Ruler size={11} />
            {scan.board_width_mm} × {scan.board_height_mm} mm · {scan.grid_spacing_mm} mm grid · {geometry!.cols}×{geometry!.rows}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={() => setSetupOpen(true)}>
              New scan
            </Button>
            {scan.status !== 'COMPLETED' ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Check size={12} />}
                onClick={() => void setScanStatus(scan.scan_id, 'COMPLETED')}
                disabled={scanMeasurements.length === 0}
                title={scanMeasurements.length === 0 ? 'Capture at least one measurement first' : 'Mark scan complete'}
              >
                Complete
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                icon={<RefreshCw size={12} />}
                onClick={() => void setScanStatus(scan.scan_id, 'ACTIVE')}
              >
                Reopen
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Mapping workspace"
              subtitle={
                summary && summary.measuredCells > 0
                  ? `${summary.measuredCells} of ${summary.totalCells} cells measured · ${summary.coveragePct.toFixed(0)}% coverage`
                  : 'No cells measured yet — the grid is empty'
              }
              icon={<MapIcon size={13} />}
              right={
                <Segmented
                  size="sm"
                  value={viewMode}
                  onChange={(v) => {
                    setViewMode(v)
                    updateSettings({ interpolation: v === 'interpolated' })
                  }}
                  options={[
                    { value: 'measured', label: 'Measured only' },
                    { value: 'interpolated', label: 'Interpolated' },
                  ]}
                />
              }
            />
            <div className="px-3 py-3">
              <HeatmapCanvas
                scan={scan}
                measurements={scanMeasurements}
                selected={selectedCell}
                interpolate={viewMode === 'interpolated'}
                onSelect={selectCell}
                height={470}
                onCanvasReady={setCanvasEl}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-4 py-2.5">
              <div className="flex min-w-[220px] flex-1 items-center gap-2">
                <span className="tabular text-[9.5px] text-ink-dim">0</span>
                <div className="h-2 flex-1 rounded-full" style={{ backgroundImage: rampGradientCss() }} />
                <span className="tabular text-[9.5px] text-ink-dim">
                  {formatNumber(summary && summary.max ? summary.max.signal_raw : settings.acquisition.adc_max)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-ink-dim">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] border border-line bg-canvas" /> unmeasured
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] border border-dashed border-elevated" /> unstable
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] border border-strong" /> saturated
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-strong/20 text-[8px] leading-none text-strong">✕</span> invalid
                </span>
                {viewMode === 'interpolated' ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-[2px] bg-[repeating-linear-gradient(45deg,rgba(139,92,246,0.5),rgba(139,92,246,0.5)_1px,transparent_1px,transparent_3px)]" />{' '}
                    interpolated (derived)
                  </span>
                ) : null}
              </div>
            </div>
          </Panel>

          {viewMode === 'interpolated' ? (
            <Notice tone="warn" title="Interpolated view is a visualisation aid" icon={<Layers size={13} />}>
              Hatched cells are estimated from neighbouring measurements — they are not measurements and are excluded
              from statistics and exports.
            </Notice>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Panel>
              <PanelHeader title="Hotspot ranking" subtitle="Valid readings, highest first" icon={<Trophy size={13} />} />
              {ranked.length === 0 ? (
                <div className="px-4 py-5 text-center text-[11px] text-ink-dim">No valid measurements to rank.</div>
              ) : (
                <ul className="divide-y divide-line-soft">
                  {ranked.map((row, i) => (
                    <li key={row.measurement.measurement_id} className="flex items-center gap-3 px-4 py-2">
                      <span className="tabular w-4 text-[10px] text-ink-dim">{i + 1}</span>
                      <span className="font-mono text-[11px] text-ink-muted">{row.label}</span>
                      <span className="text-[10px] text-ink-dim">
                        {row.measurement.x_mm}, {row.measurement.y_mm} mm
                      </span>
                      <span className="tabular ml-auto text-[12px] text-ink">
                        {formatNumber(row.measurement.signal_raw)}
                        <span className="ml-1 text-[9.5px] text-ink-dim">{row.measurement.unit}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelHeader title="Coverage" subtitle="Direct measurements only" icon={<ScanLine size={13} />} />
              <div className="space-y-2.5 px-4 py-3">
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[11px] text-ink-dim">Measured cells</span>
                    <span className="tabular text-[12px] text-ink">
                      {summary!.measuredCells}
                      <span className="text-ink-dim"> / {summary!.totalCells}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div
                      className="h-full rounded-full bg-accent/80 transition-[width]"
                      style={{ width: `${Math.min(100, summary!.coveragePct)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
                  <KeyValue label="Valid" value={summary!.valid} />
                  <KeyValue label="Unstable" value={summary!.unstable} />
                  <KeyValue label="Saturated" value={summary!.saturated} />
                  <KeyValue label="Invalid" value={summary!.invalid} />
                  <KeyValue label="Missing" value={summary!.missing} />
                  <KeyValue label="Coverage" value={`${summary!.coveragePct.toFixed(0)}%`} />
                </div>
              </div>
            </Panel>
          </div>
        </div>

        {/* Right rail: coordinate + capture */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Selected cell"
              subtitle={selected ? `${selected.label} · x ${selected.x_mm} mm, y ${selected.y_mm} mm` : 'Click a grid cell to select it'}
              icon={<Crosshair size={13} />}
              right={
                selectedCell ? (
                  <Button size="sm" variant="ghost" onClick={() => selectCell(null)}>
                    Clear
                  </Button>
                ) : null
              }
            />
            {!selected || !selectedCell ? (
              <div className="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-dim">
                Select a cell in the grid, position the probe physically at that coordinate, then capture the live
                reading.
              </div>
            ) : (
              <div className="space-y-3 px-3 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <CoordBox label="Cell" value={selected.label} />
                  <CoordBox label={scan.origin === 'TOP_LEFT' ? 'Y from top' : 'Y from bottom'} value={`${selected.y_mm} mm`} />
                  <CoordBox label="X" value={`${selected.x_mm} mm`} />
                  <CoordBox label="Probe" value={probeLabel(scan.probe_type)} tone={scan.probe_type === 'E_FIELD' ? 'efield' : 'hfield'} />
                </div>

                {selectedMeasurement ? (
                  <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <span className="label-caps">Stored reading</span>
                      <Badge tone={qualityTone(selectedMeasurement.quality_status)}>
                        {selectedMeasurement.quality_status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="tabular text-[20px] text-ink">{formatNumber(selectedMeasurement.signal_raw)}</span>
                      <span className="text-[10px] text-ink-dim">{selectedMeasurement.unit}</span>
                      {selectedMeasurement.signal_processed !== null ? (
                        <span className="ml-auto text-[10px] text-ink-dim">
                          filtered {formatNumber(selectedMeasurement.signal_processed)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 space-y-0.5 text-[10px] text-ink-dim">
                      <div className="flex justify-between">
                        <span>{selectedMeasurement.measurement_id}</span>
                        <span>{formatTime(selectedMeasurement.timestamp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="truncate">{selectedMeasurement.probe_id}</span>
                        <span>{selectedMeasurement.calibration_profile_id ?? 'no profile'}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void markInvalid(selectedMeasurement.measurement_id)}
                      className="mt-2 inline-flex items-center gap-1 text-[10px] text-strong/80 hover:text-strong"
                      disabled={selectedMeasurement.quality_status === 'INVALID'}
                    >
                      <Ban size={10} /> Mark invalid
                    </button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-line px-2.5 py-2 text-[10.5px] text-ink-dim">
                    No measurement stored at this coordinate.
                  </div>
                )}

                <Button
                  variant="primary"
                  block
                  icon={<Crosshair size={13} />}
                  disabled={!canCapture || capturing}
                  onClick={() => void capture()}
                >
                  {selectedMeasurement ? 'Re-measure this cell' : 'Capture measurement'}
                </Button>
                {!canCapture ? (
                  <p className="flex items-start gap-1.5 text-[10.5px] leading-relaxed text-ink-dim">
                    <CircleAlert size={11} className="mt-0.5 shrink-0" />
                    {deviceState !== 'CONNECTED'
                      ? 'No live link — connect the detector to capture.'
                      : signalState === 'STALE'
                        ? 'Last frame is stale — wait for fresh data.'
                        : 'Latest frame is invalid — not capturable.'}
                  </p>
                ) : (
                  <div className="flex items-center justify-between text-[10.5px] text-ink-dim">
                    <span>Live value</span>
                    <span className="tabular text-ink">
                      {formatNumber(latest!.signal_raw)} {settings.acquisition.unit}
                    </span>
                  </div>
                )}
                {selectedMeasurement ? (
                  <p className="text-[10px] leading-relaxed text-ink-dim">
                    Re-measuring supersedes the stored reading: it is kept in the log, marked invalid and linked to its
                    replacement.
                  </p>
                ) : null}
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Scan details" subtitle={`Started ${formatDateTime(scan.started_at)}`} icon={<Ruler size={13} />} />
            <div className="px-4 py-2.5">
              <KeyValue label="Scan ID" value={<span className="font-mono text-[10.5px]">{scan.scan_id}</span>} />
              <KeyValue label="Probe" value={<span className="font-mono text-[10.5px]">{scan.probe_id}</span>} />
              <KeyValue
                label="Profile"
                value={<span className="font-mono text-[10.5px]">{scan.calibration_profile_id ?? 'none'}</span>}
              />
              <KeyValue label="Cell size" value={`${geometry!.cellWidth.toFixed(1)} × ${geometry!.cellHeight.toFixed(1)} mm`} />
              <KeyValue
                label="Max measured"
                value={
                  summary!.max
                    ? `${formatNumber(summary!.max.signal_raw)} @ ${summary!.max.x_mm}, ${summary!.max.y_mm} mm`
                    : '—'
                }
              />
              <KeyValue label="Mean (valid)" value={summary!.mean !== null ? formatNumber(summary!.mean, 1) : '—'} />
              {scan.notes ? (
                <div className="mt-1.5 border-t border-line-soft pt-1.5 text-[10.5px] leading-relaxed text-ink-dim">
                  {scan.notes}
                </div>
              ) : null}
            </div>
            <div className="border-t border-line-soft px-3 py-2.5">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[11px] text-ink-muted">Show interpolated surface</span>
                <StatusDot tone={viewMode === 'interpolated' ? 'accent' : 'neutral'} />
              </div>
              <Switch
                checked={viewMode === 'interpolated'}
                onChange={(next) => {
                  setViewMode(next ? 'interpolated' : 'measured')
                  updateSettings({ interpolation: next })
                }}
                label="Interpolation overlay"
                description="Visual aid only; never counted as measurement."
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button size="sm" icon={<Download size={12} />} onClick={exportCsv}>
                  Export CSV
                </Button>
                <Button size="sm" icon={<ImageDown size={12} />} onClick={exportPng} disabled={!canvasEl}>
                  Export PNG
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Eraser size={12} />}
                  className="col-span-2"
                  disabled={scanMeasurements.length === 0}
                  onClick={() => {
                    if (window.confirm(`Delete all ${scanMeasurements.length} measurements in ${scan.scan_name}?`)) {
                      void clearScanMeasurements(scan.scan_id)
                      notify('warn', 'Scan measurements cleared', 'The scan definition is unchanged.')
                    }
                  }}
                >
                  Clear cells
                </Button>
              </div>
            </div>
          </Panel>

          <Panel className="border-dashed px-3 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] text-ink-muted">Live frame</div>
                <div className="mt-0.5 text-[10px] text-ink-dim">{relativeTime(latest?.received_at ?? null)}</div>
              </div>
              <div className="text-right">
                <div className="tabular text-[13px] text-ink">
                  {latest ? formatNumber(latest.signal_raw) : '—'}
                  <span className="ml-1 text-[9.5px] text-ink-dim">{settings.acquisition.unit}</span>
                </div>
                <Badge tone={deviceState === 'CONNECTED' ? (signalState === 'STABLE' ? 'ok' : signalState === 'UNKNOWN' ? 'neutral' : 'warn') : 'neutral'}>
                  {deviceState === 'CONNECTED' ? signalState : 'NO LINK'}
                </Badge>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <ScanSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  )
}

function CoordBox({ label, value, tone }: { label: string; value: string; tone?: 'efield' | 'hfield' }) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
      <div className="label-caps !text-[9px]">{label}</div>
      <div
        className={cn(
          'mt-0.5 font-mono text-[12.5px]',
          tone === 'efield' ? 'text-efield' : tone === 'hfield' ? 'text-hfield' : 'text-ink',
        )}
      >
        {value}
      </div>
    </div>
  )
}
