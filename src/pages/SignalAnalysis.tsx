import { useMemo, useState } from 'react'
import { Activity, ArrowLeftRight, ChartLine, CircleSlash, Info, ScanLine } from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  EmptyState,
  KeyValue,
  Metric,
  Notice,
  Panel,
  PanelHeader,
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
    return {
      measurements: ms,
      geometry,
      summary: summariseScan(ms, geometry.totalCells, cfg.unit),
    }
  }, [selectedScan, measurements, cfg.unit])

  const histogram = useMemo(() => {
    const values = scanSet
      ? scanSet.measurements
          .filter((m) => m.quality_status === 'VALID' || m.quality_status === 'UNSTABLE')
          .map((m) => m.signal_raw)
      : samples.slice(-400).map((s) => s.signal_raw)
    return values
  }, [scanSet, samples])

  const compare = useMemo(() => {
    return scans
      .map((scan) => {
        const ms = measurementsForScan(measurements, scan.scan_id)
        const geometry = gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm)
        const s = summariseScan(ms, geometry.totalCells, cfg.unit)
        return { scan, summary: s }
      })
      .filter((row) => row.summary.measuredCells > 0)
  }, [scans, measurements, cfg.unit])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader
              title="Amplitude versus time"
              subtitle={`Raw ${cfg.unit} · trailing ${windowSeconds} s · ${samples.length} frames buffered`}
              icon={<ChartLine size={13} />}
              right={
                <Segmented
                  size="sm"
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
            {samples.length === 0 ? (
              <div className="px-4 py-4">
                <EmptyState icon={<Activity size={26} />} title="No captured signal history" compact>
                  The analysis view reads the live frame buffer. Nothing is plotted until the detector sends frames.
                </EmptyState>
              </div>
            ) : (
              <div className="px-1.5 pt-2 pb-1">
                <ErrorBoundary label="Signal chart">
                <SignalChart
                  samples={samples}
                  windowSeconds={windowSeconds}
                  unit={cfg.unit}
                  adcMax={cfg.adc_max}
                  baseline={live.baseline}
                  color={activeProbeType === 'E_FIELD' ? '#38bdf8' : '#c084fc'}
                  height={264}
                />
                </ErrorBoundary>
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Reading distribution"
              subtitle={scanSet ? `Scan ${selectedScan?.scan_name}` : 'Live buffer (last 400 frames)'}
              icon={<ScanLine size={13} />}
            />
            {histogram.length === 0 ? (
              <div className="px-4 py-8 text-center text-[11px] text-ink-dim">No readings in this set.</div>
            ) : (
              <div className="px-3 py-3">
                <ErrorBoundary label="Distribution chart">
                  <CellHistogram values={histogram} unit={cfg.unit} adcMax={cfg.adc_max} />
                </ErrorBoundary>
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Live statistics" subtitle={`Window ${windowSeconds} s`} icon={<Activity size={13} />} />
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Peak" value={formatNumber(live.window.max)} unit={cfg.unit} size="sm" />
                <Metric label="Average" value={formatNumber(live.window.mean, 1)} unit={cfg.unit} size="sm" />
                <Metric label="Minimum" value={formatNumber(live.window.min)} unit={cfg.unit} size="sm" />
                <Metric
                  label="Spread"
                  value={live.window.spreadPct !== null ? formatNumber(live.window.spreadPct, 1) : '—'}
                  unit={live.window.spreadPct !== null ? '%' : undefined}
                  size="sm"
                  tone={live.window.spreadPct !== null && live.window.spreadPct > cfg.unstable_spread_pct ? 'warn' : 'default'}
                />
              </div>
              <div className="mt-3 border-t border-line-soft pt-2">
                <KeyValue label="Frames in window" value={live.window.count} mono />
                <KeyValue
                  label="Baseline estimate"
                  value={live.baseline !== null ? `${formatNumber(live.baseline, 1)} ${cfg.unit}` : '—'}
                  mono
                />
                <KeyValue label="Baseline source" value={`first ${live.baselineSamples} frames`} />
                <KeyValue label="Instability limit" value={`${cfg.unstable_spread_pct}% pk-pk`} mono />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Scan statistics" subtitle="Selected scan" icon={<ScanLine size={13} />} />
            <div className="space-y-3 px-3 py-3">
              <Select value={scanId} onChange={(e) => setScanId(e.target.value)}>
                <option value="">Select a scan…</option>
                {scans.map((s) => (
                  <option key={s.scan_id} value={s.scan_id}>
                    {s.scan_name} · {probeLabel(s.probe_type)}
                  </option>
                ))}
              </Select>
              {!scanSet ? (
                <p className="text-[11px] text-ink-dim">Select a scan to summarize its measured cells.</p>
              ) : (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone={selectedScan!.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>
                      {probeLabel(selectedScan!.probe_type)}
                    </Badge>
                    <Badge tone="neutral">{selectedScan!.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Metric label="Maximum" value={formatNumber(scanSet.summary.max?.signal_raw ?? null)} unit={cfg.unit} size="sm" />
                    <Metric label="Mean (valid)" value={formatNumber(scanSet.summary.mean, 1)} unit={cfg.unit} size="sm" />
                    <Metric label="Minimum" value={formatNumber(scanSet.summary.min?.signal_raw ?? null)} unit={cfg.unit} size="sm" />
                    <Metric
                      label="Measured"
                      value={`${scanSet.summary.measuredCells}/${scanSet.summary.totalCells}`}
                      size="sm"
                    />
                  </div>
                  <div className="mt-3 border-t border-line-soft pt-2">
                    <KeyValue label="Valid" value={scanSet.summary.valid} mono />
                    <KeyValue label="Unstable" value={scanSet.summary.unstable} mono />
                    <KeyValue label="Saturated" value={scanSet.summary.saturated} mono />
                    <KeyValue label="Invalid" value={scanSet.summary.invalid} mono />
                    <KeyValue label="Mean method" value="arithmetic mean of valid + unstable" />
                  </div>
                </div>
              )}
            </div>
          </Panel>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Scan comparison"
          subtitle="Separate axes per probe type — E and H readings are not on a common scale"
          icon={<ArrowLeftRight size={13} />}
        />
        {compare.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-ink-dim">
            No scans with measurements yet. Comparison becomes available once at least one scan holds readings.
          </div>
        ) : (
          <div className="px-3 py-3">
            <ErrorBoundary label="Comparison chart">
              <ScanCompareBars rows={compare.map((r) => ({ scan: r.scan, summary: r.summary }))} />
            </ErrorBoundary>
          </div>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Notice tone="neutral" title="Frequency-domain analysis unavailable" icon={<CircleSlash size={13} />}>
          A broadband amplitude detector cannot resolve frequency components. Spectrum, dominant frequency and harmonic
          analysis stay disabled until frequency-selective acquisition hardware exists.
        </Notice>
        <Notice tone="neutral" title="What these numbers are" icon={<Info size={13} />}>
          Values are relative detector counts, not calibrated field strength. Probe geometry, height, orientation and
          distance all affect the reading, so compare like-for-like scans only.
        </Notice>
      </div>
    </div>
  )
}
