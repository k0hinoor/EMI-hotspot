import { useMemo, useState } from 'react'
import { Activity, ArrowLeftRight, ChartLine, CircleSlash, Info, ScanLine } from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  Frame,
  FrameBody,
  FrameHeader,
  KeyValue,
  Metric,
  Segmented,
  Select,
} from '../components/ui'
import { SignalChart } from '../components/SignalChart'
import { CellHistogram, ScanCompareBars } from '../components/AnalysisCharts'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { formatNumber, gridGeometry, probeLabel, summariseScan } from '../lib/derive'

export function SignalAnalysis() {
  const { samples, settings, scans, measurements, activeProbeType, stats } = useApp()
  const [windowSeconds, setWindowSeconds] = useState(30)
  const [scanId, setScanId] = useState<string>('')

  const cfg = settings.acquisition
  const live = stats(windowSeconds)
  const selectedScan = scans.find((s) => s.scan_id === scanId) ?? null

  const scanSet = useMemo(() => {
    if (!selectedScan) return null
    const ms = measurementsForScan(measurements, selectedScan.scan_id)
    const geometry = gridGeometry(
      selectedScan.board_width_mm,
      selectedScan.board_height_mm,
      selectedScan.grid_spacing_mm,
    )
    return { measurements: ms, geometry, summary: summariseScan(ms, geometry.totalCells, cfg.unit) }
  }, [selectedScan, measurements, cfg.unit])

  const histogram = useMemo(() => {
    if (scanSet) {
      return scanSet.measurements
        .filter((m) => m.quality_status === 'VALID' || m.quality_status === 'UNSTABLE')
        .map((m) => m.signal_raw)
    }
    return samples.slice(-400).map((s) => s.signal_raw)
  }, [scanSet, samples])

  const compare = useMemo(
    () =>
      scans
        .map((scan) => {
          const ms = measurementsForScan(measurements, scan.scan_id)
          const geometry = gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm)
          return { scan, summary: summariseScan(ms, geometry.totalCells, cfg.unit) }
        })
        .filter((row) => row.summary.measuredCells > 0),
    [scans, measurements, cfg.unit],
  )

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 max-xl:h-auto xl:grid-cols-[minmax(0,1fr)_268px]">
      <div className="grid min-h-0 grid-rows-[minmax(0,1.25fr)_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none">
        <Frame className="min-h-[280px] xl:min-h-0">
          <FrameHeader
            title="Amplitude versus time"
            subtitle={`raw ${cfg.unit} · trailing ${windowSeconds} s · ${samples.length} frames buffered`}
            icon={<ChartLine size={12} />}
            right={
              <Segmented
                size="xs"
                value={String(windowSeconds)}
                onChange={(v) => setWindowSeconds(Number(v))}
                options={[
                  { value: '10', label: '10s' },
                  { value: '30', label: '30s' },
                  { value: '120', label: '2m' },
                  { value: '600', label: '10m' },
                ]}
              />
            }
          />
          <div className="min-h-0 flex-1 p-1">
            {samples.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <Activity size={20} className="mb-2 text-ink-dim/50" />
                <div className="text-[11px] font-medium text-ink-muted">No captured signal history</div>
                <p className="mt-1 max-w-xs text-[10px] leading-relaxed text-ink-dim">
                  This view reads the live frame buffer. Nothing is plotted until the detector sends frames.
                </p>
              </div>
            ) : (
              <ErrorBoundary label="Signal chart">
                <SignalChart
                  fill
                  samples={samples}
                  windowSeconds={windowSeconds}
                  unit={cfg.unit}
                  adcMax={cfg.adc_max}
                  baseline={live.baseline}
                  color={activeProbeType === 'E_FIELD' ? '#4cc2ff' : '#b98bff'}
                />
              </ErrorBoundary>
            )}
          </div>
        </Frame>

        <div className="grid min-h-0 grid-cols-1 gap-2.5 md:grid-cols-2">
          <Frame className="min-h-0">
            <FrameHeader
              title="Reading distribution"
              subtitle={scanSet ? `scan · ${selectedScan?.scan_name}` : 'live buffer · last 400 frames'}
              icon={<ScanLine size={12} />}
            />
            <div className="min-h-0 flex-1 p-1">
              {histogram.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[10px] text-ink-dim">No readings in this set.</div>
              ) : (
                <ErrorBoundary label="Distribution chart">
                  <CellHistogram values={histogram} unit={cfg.unit} adcMax={cfg.adc_max} fill />
                </ErrorBoundary>
              )}
            </div>
          </Frame>

          <Frame className="min-h-0">
            <FrameHeader
              title="Scan comparison"
              subtitle="separate axes per probe · never a shared scale"
              icon={<ArrowLeftRight size={12} />}
            />
            <div className="min-h-0 flex-1 p-1">
              {compare.length === 0 ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-[10px] leading-relaxed text-ink-dim">
                  Comparison appears once at least one scan holds measurements.
                </div>
              ) : (
                <ErrorBoundary label="Comparison chart">
                  <ScanCompareBars rows={compare.map((r) => ({ scan: r.scan, summary: r.summary }))} fill />
                </ErrorBoundary>
              )}
            </div>
          </Frame>
        </div>
      </div>

      <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none">
        <Frame className="shrink-0">
          <FrameHeader title="Live statistics" subtitle={`window ${windowSeconds} s`} icon={<Activity size={12} />} />
          <div className="p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Peak" value={formatNumber(live.window.max)} unit={cfg.unit} size="xs" />
              <Metric label="Average" value={formatNumber(live.window.mean, 1)} unit={cfg.unit} size="xs" />
              <Metric label="Minimum" value={formatNumber(live.window.min)} unit={cfg.unit} size="xs" />
              <Metric
                label="Spread"
                value={live.window.spreadPct !== null ? formatNumber(live.window.spreadPct, 1) : '—'}
                unit={live.window.spreadPct !== null ? '%' : undefined}
                size="xs"
                tone={live.window.spreadPct !== null && live.window.spreadPct > cfg.unstable_spread_pct ? 'warn' : 'default'}
              />
            </div>
            <div className="mt-2 border-t border-white/[0.06] pt-1">
              <KeyValue label="Frames in window" value={live.window.count} mono />
              <KeyValue
                label="Noise floor"
                value={live.baseline !== null ? `${formatNumber(live.baseline, 1)} ${cfg.unit}` : '—'}
                mono
              />
              <KeyValue label="Floor source" value={`first ${live.baselineSamples} frames`} />
              <KeyValue label="Instability limit" value={`${cfg.unstable_spread_pct}% pk-pk`} mono />
            </div>
          </div>
        </Frame>

        <Frame className="shrink-0">
          <FrameHeader title="Scan statistics" subtitle="selected scan" icon={<ScanLine size={12} />} />
          <div className="space-y-1.5 p-2.5">
            <Select value={scanId} onChange={(e) => setScanId(e.target.value)}>
              <option value="">Select a scan…</option>
              {scans.map((s) => (
                <option key={s.scan_id} value={s.scan_id}>
                  {s.is_demo ? '[DEMO] ' : ''}{s.scan_name} · {probeLabel(s.probe_type)}
                </option>
              ))}
            </Select>
            {!scanSet ? (
              <p className="text-[10px] text-ink-dim">Select a scan to summarize its measured cells.</p>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <Badge tone={selectedScan!.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>
                    {probeLabel(selectedScan!.probe_type)}
                  </Badge>
                  <Badge tone="neutral">{selectedScan!.status}</Badge>
                  <span className="ml-auto text-[9px] text-ink-dim">
                    {scanSet.summary.measuredCells}/{scanSet.summary.totalCells} cells
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Maximum" value={formatNumber(scanSet.summary.max?.signal_raw ?? null)} unit={cfg.unit} size="xs" />
                  <Metric label="Mean" value={formatNumber(scanSet.summary.mean, 1)} unit={cfg.unit} size="xs" />
                  <Metric label="Minimum" value={formatNumber(scanSet.summary.min?.signal_raw ?? null)} unit={cfg.unit} size="xs" />
                  <Metric label="Coverage" value={`${scanSet.summary.coveragePct.toFixed(0)}%`} size="xs" />
                </div>
                <div className="border-t border-white/[0.06] pt-1">
                  <KeyValue label="Valid" value={scanSet.summary.valid} mono />
                  <KeyValue label="Unstable" value={scanSet.summary.unstable} mono />
                  <KeyValue label="Saturated" value={scanSet.summary.saturated} mono />
                  <KeyValue label="Invalid" value={scanSet.summary.invalid} mono />
                </div>
              </>
            )}
          </div>
        </Frame>

        <Frame className="min-h-0">
          <FrameHeader title="Method limits" subtitle="what these numbers are not" icon={<Info size={12} />} />
          <FrameBody className="space-y-2 p-2.5">
            <div className="flex items-start gap-1.5">
              <CircleSlash size={11} className="mt-px shrink-0 text-ink-dim" />
              <div>
                <div className="text-[10.5px] font-medium text-ink-muted">No frequency-domain analysis</div>
                <p className="mt-0.5 text-[9.5px] leading-snug text-ink-dim">
                  A broadband amplitude detector cannot resolve frequency. Spectrum, dominant frequency and harmonic
                  analysis stay disabled until frequency-selective hardware exists.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-1.5 border-t border-white/[0.06] pt-2">
              <Info size={11} className="mt-px shrink-0 text-ink-dim" />
              <div>
                <div className="text-[10.5px] font-medium text-ink-muted">Relative counts, not field strength</div>
                <p className="mt-0.5 text-[9.5px] leading-snug text-ink-dim">
                  Probe geometry, height, orientation and distance all move the reading. Compare like-for-like scans only.
                </p>
              </div>
            </div>
          </FrameBody>
        </Frame>
      </div>
    </div>
  )
}
