import { useCallback, useEffect, useMemo, useState } from 'react'
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
  Plus,
  RefreshCw,
  Ruler,
  Trophy,
} from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  Frame,
  FrameBody,
  FrameFooter,
  FrameHeader,
  KeyValue,
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
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const onCanvasReady = useCallback((el: HTMLCanvasElement | null) => setCanvasEl(el), [])

  const scan = useMemo(() => scans.find((s) => s.scan_id === activeScanId) ?? scans[0] ?? null, [scans, activeScanId])

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
    return list.sort((a, b) => b.measurement.signal_raw - a.measurement.signal_raw).slice(0, 8)
  }, [scan, scanMeasurements])

  const latest = samples.length ? samples[samples.length - 1] : null
  const selected = scan && selectedCell ? cellCoordinate(geometry!, selectedCell.col, selectedCell.row, scan.origin) : null
  const selectedMeasurement = useMemo(() => {
    if (!scan || !selectedCell) return null
    return buildHeatmapView(scan, scanMeasurements).cells[selectedCell.row]?.[selectedCell.col] ?? null
  }, [scan, scanMeasurements, selectedCell])

  const canCapture =
    !!scan && !!selectedCell && deviceState === 'CONNECTED' && latest !== null && signalState !== 'STALE' && latest.quality !== 'INVALID'

  const capture = async () => {
    if (!scan || !selectedCell || !selected) return
    const result = await captureMeasurement({ scanId: scan.scan_id, x_mm: selected.x_mm, y_mm: selected.y_mm })
    if (result) notify('ok', `Cell ${selected.label} recorded`, `${formatNumber(result.signal_raw)} ${result.unit} · ${result.quality_status}`)
  }

  const exportCsv = () => {
    if (!scan) return
    downloadText(
      `emi-scan-${scan.scan_id}-${stamp()}.csv`,
      measurementsToCsv(scanMeasurements, scans, settings.export_defaults.csv_delimiter),
    )
    notify('ok', 'Heatmap data exported', `${scanMeasurements.length} measurements written to CSV.`)
  }

  const exportPng = () => {
    if (!canvasEl || !scan) return
    canvasEl.toBlob((blob) => {
      if (!blob) {
        notify('error', 'Image export failed', 'The canvas could not be encoded.')
        return
      }
      downloadBlob(`emi-heatmap-${scan.scan_id}-${stamp()}.png`, blob)
      notify('ok', 'Heatmap image exported', 'PNG of the measured grid as displayed.')
    }, 'image/png')
  }

  if (!scan) {
    return (
      <div className="h-full">
        <Frame className="h-full">
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <Grid3x3 size={26} className="text-ink-dim/60" />
            <div>
              <div className="text-[13px] font-medium text-ink-muted">No scan created</div>
              <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-ink-dim">
                Define the test area in millimetres and a probe spacing. The workspace stays empty until real
                measurements are captured at coordinates — no heatmap is drawn from assumed data.
              </p>
            </div>
            <Button variant="primary" size="md" icon={<Plus size={12} />} onClick={() => setSetupOpen(true)}>
              Create scan area
            </Button>
            <div className="mt-2 grid max-w-2xl gap-2 text-left sm:grid-cols-3">
              {[
                ['1 · Define area', 'Width, height and grid spacing in mm.'],
                ['2 · Position probe', 'Move to the selected cell; keep height and angle fixed.'],
                ['3 · Capture', 'Store the live frame against that coordinate.'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-[7px] border border-line-soft px-2.5 py-2">
                  <div className="text-[10.5px] font-medium text-ink">{title}</div>
                  <p className="mt-0.5 text-[9.5px] leading-snug text-ink-dim">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </Frame>
        <ScanSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 max-xl:h-auto xl:grid-cols-[214px_minmax(0,1fr)_252px]">
      {/* ---------------- left: scan selection + setup ---------------- */}
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2.5 max-xl:grid-rows-none">
        <Frame className="shrink-0">
          <FrameHeader
            title="Scan"
            subtitle={scan.scan_id}
            right={
              <>
                <Badge tone={scan.status === 'COMPLETED' ? 'ok' : scan.status === 'ACTIVE' ? 'accent' : 'warn'}>
                  {scan.status}
                </Badge>
                <Badge tone={scan.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>{probeLabel(scan.probe_type)}</Badge>
              </>
            }
          />
          <div className="space-y-1.5 p-2">
            <Select
              value={scan.scan_id}
              onChange={(e) => setActiveScan(e.target.value)}
              className="h-7 text-[11px]"
            >
              {scans.map((s) => (
                <option key={s.scan_id} value={s.scan_id}>
                  {s.scan_name} · {s.scan_id}
                </option>
              ))}
            </Select>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" icon={<Plus size={10} />} onClick={() => setSetupOpen(true)} className="flex-1">
                New
              </Button>
              {scan.status !== 'COMPLETED' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Check size={10} />}
                  onClick={() => void setScanStatus(scan.scan_id, 'COMPLETED')}
                  disabled={scanMeasurements.length === 0}
                  title={scanMeasurements.length === 0 ? 'Capture at least one measurement first' : 'Mark complete'}
                  className="flex-1"
                >
                  Complete
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<RefreshCw size={10} />}
                  onClick={() => void setScanStatus(scan.scan_id, 'ACTIVE')}
                  className="flex-1"
                >
                  Reopen
                </Button>
              )}
            </div>
          </div>
        </Frame>

        <Frame className="min-h-0">
          <FrameHeader title="Geometry" subtitle="from the scan definition" icon={<Ruler size={12} />} />
          <FrameBody className="p-2.5">
            <KeyValue label="Width" value={`${scan.board_width_mm} mm`} mono />
            <KeyValue label="Height" value={`${scan.board_height_mm} mm`} mono />
            <KeyValue label="Spacing" value={`${scan.grid_spacing_mm} mm`} mono />
            <KeyValue label="Cells" value={`${geometry!.cols} × ${geometry!.rows} = ${geometry!.totalCells}`} mono />
            <KeyValue label="Cell size" value={`${geometry!.cellWidth.toFixed(1)} × ${geometry!.cellHeight.toFixed(1)} mm`} mono />
            <KeyValue label="Origin" value={scan.origin === 'TOP_LEFT' ? 'top-left' : 'bottom-left'} />
            <KeyValue label="Probe" value={scan.probe_id} mono />
            <KeyValue label="Profile" value={scan.calibration_profile_id ?? 'none'} mono />
            <KeyValue label="Started" value={formatDateTime(scan.started_at)} mono />
            {scan.notes ? (
              <>
                <Divider className="my-1.5" />
                <div className="text-[9.5px] leading-snug text-ink-dim">{scan.notes}</div>
              </>
            ) : null}
          </FrameBody>
        </Frame>

        <Frame className="shrink-0">
          <FrameHeader title="Coverage" subtitle="direct measurements only" />
          <div className="p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="tabular text-[16px] text-ink">{summary!.measuredCells}</span>
              <span className="text-[9.5px] text-ink-dim">of {summary!.totalCells} cells</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full bg-efield/80 transition-[width]"
                style={{ width: `${Math.min(100, summary!.coveragePct)}%` }}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-2">
              <KeyValue label="Valid" value={summary!.valid} mono />
              <KeyValue label="Unstable" value={summary!.unstable} mono />
              <KeyValue label="Saturated" value={summary!.saturated} mono />
              <KeyValue label="Invalid" value={summary!.invalid} mono />
            </div>
            <Divider className="my-1.5" />
            <div className="flex items-center justify-between text-[9.5px] text-ink-dim">
              <span>live frame</span>
              <span className="flex items-center gap-1">
                <StatusDot tone={deviceState === 'CONNECTED' ? 'ok' : 'neutral'} pulse={deviceState === 'CONNECTED'} />
                <span className="tabular text-ink-muted">{latest ? formatNumber(latest.signal_raw) : '—'}</span>
                <span>{relativeTime(latest?.received_at ?? null)}</span>
              </span>
            </div>
          </div>
        </Frame>
      </div>

      {/* ---------------- centre: the mapping workspace ---------------- */}
      <Frame className="min-h-[380px] xl:min-h-0">
        <FrameHeader
          title="Mapping workspace"
          subtitle={
            summary && summary.measuredCells > 0
              ? `${summary.measuredCells} of ${summary.totalCells} measured · ${summary.coveragePct.toFixed(0)}% coverage`
              : 'no cells measured yet — the grid is empty'
          }
          icon={<Grid3x3 size={12} />}
          right={
            <>
              <Segmented
                size="xs"
                value={viewMode}
                onChange={(v) => {
                  setViewMode(v)
                  updateSettings({ interpolation: v === 'interpolated' })
                }}
                options={[
                  { value: 'measured', label: 'Measured' },
                  { value: 'interpolated', label: 'Interpolated' },
                ]}
              />
              <Badge tone="neutral">{scan.probe_type === 'E_FIELD' ? 'E' : 'H'}</Badge>
            </>
          }
        />
        <div className="min-h-0 flex-1 p-1.5">
          <HeatmapCanvas
            scan={scan}
            measurements={scanMeasurements}
            selected={selectedCell}
            interpolate={viewMode === 'interpolated'}
            onSelect={selectCell}
            fill
            onCanvasReady={onCanvasReady}
          />
        </div>
        <div className="shrink-0 border-t border-line-soft px-2.5 py-1.5">
          <div className="flex items-center gap-2">
            <span className="tabular text-[9px] text-ink-dim">0</span>
            <div className="h-1.5 flex-1 rounded-full" style={{ backgroundImage: rampGradientCss() }} />
            <span className="tabular text-[9px] text-ink-dim">
              {formatNumber(summary && summary.max ? summary.max.signal_raw : settings.acquisition.adc_max)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[9px] text-ink-dim">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-[1px] border border-line bg-canvas" /> unmeasured
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-[1px] border border-dashed border-elevated" /> unstable
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-[1px] border border-strong" /> saturated
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="text-[8px] leading-none text-strong">✕</span> invalid
            </span>
            {viewMode === 'interpolated' ? (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-[1px] bg-[repeating-linear-gradient(45deg,rgba(185,139,255,0.6),rgba(185,139,255,0.6)_1px,transparent_1px,transparent_3px)]" />
                interpolated (derived)
              </span>
            ) : null}
          </div>
        </div>
        {viewMode === 'interpolated' ? (
          <div className="shrink-0 border-t border-line-soft px-2.5 py-1">
            <span className="flex items-center gap-1 text-[9.5px] text-elevated">
              <Layers size={10} /> Hatched cells are estimated from neighbours — not measurements, excluded from
              statistics and exports.
            </span>
          </div>
        ) : null}
      </Frame>

      {/* ---------------- right: cell + ranking + actions ---------------- */}
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-2.5 max-xl:grid-rows-none">
        <Frame className="shrink-0">
          <FrameHeader
            title="Selected cell"
            subtitle={selected ? `${selected.label} · x ${selected.x_mm} · y ${selected.y_mm} mm` : 'click a cell'}
            icon={<Crosshair size={12} />}
            right={
              selectedCell ? (
                <Button size="xs" variant="ghost" onClick={() => selectCell(null)}>
                  clear
                </Button>
              ) : null
            }
          />
          <div className="space-y-2 p-2.5">
            {!selected || !selectedCell ? (
              <p className="text-[10px] leading-relaxed text-ink-dim">
                Select a cell, position the probe physically at that coordinate, then capture the live reading.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-1.5">
                  <CoordBox label="cell" value={selected.label} />
                  <CoordBox label={scan.origin === 'TOP_LEFT' ? 'y from top' : 'y from bottom'} value={`${selected.y_mm}`} />
                  <CoordBox label="x" value={`${selected.x_mm}`} />
                  <CoordBox
                    label="probe"
                    value={probeLabel(scan.probe_type)}
                    tone={scan.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}
                  />
                </div>

                {selectedMeasurement ? (
                  <div className="rounded-[6px] border border-line bg-canvas px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="label-caps">stored</span>
                      <Badge tone={qualityTone(selectedMeasurement.quality_status)}>
                        {selectedMeasurement.quality_status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="tabular text-[17px] text-ink">{formatNumber(selectedMeasurement.signal_raw)}</span>
                      <span className="text-[9px] text-ink-dim">{selectedMeasurement.unit}</span>
                    </div>
                    <div className="mt-1 space-y-0.5 text-[9px] text-ink-dim">
                      <div className="flex justify-between">
                        <span className="font-mono">{selectedMeasurement.measurement_id}</span>
                        <span>{formatTime(selectedMeasurement.timestamp)}</span>
                      </div>
                      {selectedMeasurement.signal_processed !== null ? (
                        <div className="flex justify-between">
                          <span>filtered</span>
                          <span className="tabular">{formatNumber(selectedMeasurement.signal_processed, 1)}</span>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void markInvalid(selectedMeasurement.measurement_id)}
                      disabled={selectedMeasurement.quality_status === 'INVALID'}
                      className="mt-1 inline-flex items-center gap-1 text-[9px] text-strong/80 hover:text-strong disabled:opacity-40"
                    >
                      <Ban size={9} /> mark invalid
                    </button>
                  </div>
                ) : (
                  <div className="rounded-[6px] border border-dashed border-line px-2 py-1.5 text-[9.5px] text-ink-dim">
                    No measurement stored at this coordinate.
                  </div>
                )}

                <Button
                  variant="primary"
                  size="md"
                  block
                  icon={<Crosshair size={12} />}
                  disabled={!canCapture}
                  onClick={() => void capture()}
                >
                  {selectedMeasurement ? 'Re-measure cell' : 'Capture measurement'}
                </Button>
                {!canCapture ? (
                  <p className="flex items-start gap-1 text-[9px] leading-snug text-ink-dim">
                    <CircleAlert size={9} className="mt-[2px] shrink-0" />
                    {deviceState !== 'CONNECTED'
                      ? 'No live link — connect the detector.'
                      : signalState === 'STALE'
                        ? 'Last frame is stale — wait for fresh data.'
                        : 'Latest frame is invalid — not capturable.'}
                  </p>
                ) : (
                  <div className="flex items-center justify-between text-[9.5px] text-ink-dim">
                    <span>live value</span>
                    <span className="tabular text-ink">
                      {formatNumber(latest!.signal_raw)} {settings.acquisition.unit}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        </Frame>

        <Frame className="min-h-0">
          <FrameHeader title="Hotspots" subtitle="valid readings, highest first" icon={<Trophy size={12} />} />
          <FrameBody noPad>
            {ranked.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] text-ink-dim">No valid measurements to rank.</div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {ranked.map((row, i) => (
                  <li key={row.measurement.measurement_id} className="flex items-center gap-2 px-2.5 py-[5px]">
                    <span className="tabular w-3 text-[9px] text-ink-dim">{i + 1}</span>
                    <span className="font-mono text-[10px] text-ink-muted">{row.label}</span>
                    <span className="truncate text-[9px] text-ink-dim">
                      {row.measurement.x_mm}, {row.measurement.y_mm}
                    </span>
                    <span className="tabular ml-auto text-[10.5px] text-ink">{formatNumber(row.measurement.signal_raw)}</span>
                  </li>
                ))}
              </ul>
            )}
          </FrameBody>
        </Frame>

        <Frame className="shrink-0">
          <div className="p-2.5">
            <Switch
              checked={viewMode === 'interpolated'}
              onChange={(next) => {
                setViewMode(next ? 'interpolated' : 'measured')
                updateSettings({ interpolation: next })
              }}
              label="Interpolation overlay"
              description="Visual aid only; never counted as measurement."
            />
            <Divider className="my-1.5" />
            <div className="grid grid-cols-2 gap-1.5">
              <Button size="sm" icon={<Download size={10} />} onClick={exportCsv} disabled={scanMeasurements.length === 0}>
                CSV
              </Button>
              <Button size="sm" icon={<ImageDown size={10} />} onClick={exportPng} disabled={!canvasEl}>
                PNG
              </Button>
            </div>
            <Button
              size="sm"
              variant="danger"
              block
              icon={<Eraser size={10} />}
              className="mt-1.5"
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
          <FrameFooter>
            <span className="truncate text-[9px] text-ink-dim">re-measure keeps history · marked invalid</span>
          </FrameFooter>
        </Frame>
      </div>

      <ScanSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />
    </div>
  )
}

function CoordBox({ label, value, tone }: { label: string; value: string; tone?: 'efield' | 'hfield' }) {
  return (
    <div className="rounded-[5px] border border-line bg-canvas px-1.5 py-1">
      <div className="text-[8.5px] tracking-[0.1em] text-ink-dim uppercase">{label}</div>
      <div
        className={cn(
          'mt-0.5 font-mono text-[11.5px]',
          tone === 'efield' ? 'text-efield' : tone === 'hfield' ? 'text-hfield' : 'text-ink',
        )}
      >
        {value}
      </div>
    </div>
  )
}
