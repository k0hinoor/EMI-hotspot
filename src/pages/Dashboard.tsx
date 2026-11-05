import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowUpRight,
  CircleAlert,
  CircleDot,
  Grid3x3,
  Radar,
  ScanLine,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  Divider,
  Frame,
  FrameFooter,
  FrameHeader,
  KeyValue,
  cn,
} from '../components/ui'
import { Donut, MiniWave, type DonutSlice } from '../components/DataViz'
import { TopologyForScan } from '../components/TopologyCard'
import { TrendBars, SpectrumLine } from '../components/ChartKit'
import { ErrorBoundary } from '../components/ErrorBoundary'
import {
  formatNumber,
  gridGeometry,
  probeLabel,
  summariseScan,
} from '../lib/derive'

export function Dashboard() {
  const {
    samples,
    settings,
    scans,
    measurements,
    activeScanId,
    deviceState,
    signalState,
    stats,
  } = useApp()

  const cfg = settings.acquisition
  const connected = deviceState === 'CONNECTED'
  const live = stats(60)

  const scan = scans.find((s) => s.scan_id === activeScanId) ?? scans[0] ?? null
  const scanMeasurements = useMemo(
    () => (scan ? measurementsForScan(measurements, scan.scan_id) : []),
    [scan, measurements],
  )
  const geometry = scan ? gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm) : null
  const summary = scan ? summariseScan(scanMeasurements, geometry?.totalCells ?? 0, cfg.unit) : null

  const recent = samples.slice(-64)
  const wave = recent.map((s) => s.signal_raw)

  // Quality mix for the donut — real counts, zero until readings are captured.
  const slices: DonutSlice[] = [
    { label: 'Valid', value: summary?.valid ?? 0, color: '#35e5c5' },
    { label: 'Unstable', value: summary?.unstable ?? 0, color: '#f7a84b' },
    { label: 'Saturated', value: summary?.saturated ?? 0, color: '#ff6f8b' },
    { label: 'Invalid', value: summary?.invalid ?? 0, color: '#8b5cf6' },
  ]
  const totalReadings = slices.reduce((a, s) => a + s.value, 0)

  // Horizontal band profile: mean measurement per column (real, aggregated).
  const profile = useMemo(() => {
    if (!scan || !geometry || scanMeasurements.length === 0) return []
    const buckets = new Array(geometry.cols).fill(0).map(() => ({ sum: 0, n: 0 }))
    for (const m of scanMeasurements) {
      if (m.x_mm === null || m.quality_status === 'INVALID') continue
      const col = Math.min(geometry.cols - 1, Math.max(0, Math.floor(m.x_mm / geometry.cellWidth)))
      buckets[col].sum += m.signal_raw
      buckets[col].n += 1
    }
    return buckets.map((b, i) => ({ label: String(i + 1), value: b.n ? b.sum / b.n : 0, filled: b.n > 0 }))
  }, [scan, geometry, scanMeasurements])

  const captureTrend = useMemo(() => {
    // Readings captured per minute over the last 20 minutes.
    const now = Date.now()
    const buckets = new Array(20).fill(0)
    for (const m of measurements) {
      const ts = new Date(m.timestamp).getTime()
      const minutesAgo = Math.floor((now - ts) / 60000)
      if (minutesAgo >= 0 && minutesAgo < 20) buckets[19 - minutesAgo] += 1
    }
    return buckets.map((v, i) => ({ label: i === 19 ? 'now' : `-${19 - i}m`, value: v }))
  }, [measurements])

  const delta = useMemo(() => {
    if (wave.length < 12) return null
    const half = Math.floor(wave.length / 2)
    const first = wave.slice(0, half).reduce((a, b) => a + b, 0) / half
    const second = wave.slice(half).reduce((a, b) => a + b, 0) / (wave.length - half)
    if (first === 0) return null
    return ((second - first) / first) * 100
  }, [wave])

  const latest = samples.length ? samples[samples.length - 1] : null

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 max-xl:h-auto xl:grid-rows-[minmax(0,0.98fr)_minmax(0,0.72fr)] xl:grid-cols-[minmax(0,1.62fr)_minmax(0,0.98fr)_minmax(0,0.86fr)]">
      {/* ---------------- 3D topology ---------------- */}
      <Frame className="min-h-[300px] xl:min-h-0">
        <FrameHeader
          title="3D Topology & Surface Heatmap"
          subtitle={
            scan
              ? `${scan.scan_name} · ${scan.board_width_mm} × ${scan.board_height_mm} mm · ${scanMeasurements.length} measured cells`
              : 'no scan defined'
          }
          icon={<Radar size={14} />}
          right={
            scan ? (
              <>
                <Badge tone={scan.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>{probeLabel(scan.probe_type)}</Badge>
                <Link to="/heatmap" className="panel-link inline-flex items-center gap-0.5">
                  Open heatmap <ArrowUpRight size={10} />
                </Link>
              </>
            ) : null
          }
        />
        <div className="min-h-0 flex-1 px-2 pb-1">
          <ErrorBoundary label="3D topology">
            <TopologyForScan unit={cfg.unit} />
          </ErrorBoundary>
        </div>
        <FrameFooter className="justify-between">
          <span className="text-[10px] text-ink-dim">
            {summary && summary.measuredCells > 0 ? (
              <>
                <span className="text-ink-muted">{summary.measuredCells}</span> measured · rest interpolated for
                display
              </>
            ) : (
              'surface built from measured cells only'
            )}
          </span>
          <span className="flex items-center gap-2 text-[10px] text-ink-dim">
            <span className="h-1.5 w-16 rounded-full bg-gradient-to-r from-[#2653b0] via-[#35e5c5] to-[#ff5a6e]" />
            {formatNumber(summary?.min?.signal_raw ?? null)} – {formatNumber(summary?.max?.signal_raw ?? null)} {cfg.unit}
          </span>
        </FrameFooter>
      </Frame>

      {/* ---------------- energy / quality distribution ---------------- */}
      <Frame className="min-h-[260px] xl:min-h-0">
        <FrameHeader title="Reading Quality" subtitle="captured cells by verdict" icon={<CircleDot size={14} />} />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Donut
            slices={slices}
            size={172}
            thickness={13}
            centerValue={totalReadings > 0 ? String(totalReadings) : '—'}
            centerLabel={totalReadings > 0 ? 'readings' : 'no data'}
            centerHint={totalReadings === 0 ? 'Capture readings to populate' : undefined}
          />
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-x-3 gap-y-1.5 px-4 pb-3">
          {slices.map((slice) => (
            <div key={slice.label} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: slice.color, boxShadow: `0 0 8px ${slice.color}` }} />
              <span className="flex-1 truncate text-[10.5px] text-ink-muted">{slice.label}</span>
              <span className="tabular text-[10.5px] text-ink-dim">{slice.value}</span>
            </div>
          ))}
        </div>
      </Frame>

      {/* ---------------- anomalies / deltas ---------------- */}
      <Frame className="min-h-[240px] xl:min-h-0">
        <FrameHeader title="Signal Anomalies" subtitle="last minute vs previous" icon={<Activity size={14} />} />
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-4">
          <div>
            <div className="flex items-end justify-between gap-2">
              <span
                className={cn(
                  'tabular text-[26px] leading-none font-medium',
                  delta === null ? 'text-ink-dim' : delta >= 0 ? 'text-teal drop-shadow-[0_0_16px_rgba(53,229,197,0.4)]' : 'text-rose drop-shadow-[0_0_16px_rgba(255,111,139,0.4)]',
                )}
              >
                {delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}
              </span>
              <MiniWave values={wave} color={delta !== null && delta < 0 ? '#ff6f8b' : '#35e5c5'} height={32} />
            </div>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-ink-dim">
              {delta === null ? (
                'awaiting frames'
              ) : delta >= 0 ? (
                <>
                  <TrendingUp size={10} className="text-teal" /> signal rising
                </>
              ) : (
                <>
                  <TrendingDown size={10} className="text-rose" /> signal falling
                </>
              )}
            </div>
          </div>
          <Divider />
          <div className="space-y-0.5">
            <KeyValue label="Peak · 60 s" value={`${formatNumber(live.window.max)} ${cfg.unit}`} mono />
            <KeyValue label="Spread" value={live.window.spreadPct !== null ? `${formatNumber(live.window.spreadPct, 1)}%` : '—'} mono />
            <KeyValue label="Verdict" value={signalState === 'UNKNOWN' ? (connected ? 'waiting' : 'no device') : signalState} />
          </div>
        </div>
        <FrameFooter>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 text-[10px]',
              latest?.quality === 'SATURATED' || latest?.quality === 'INVALID' ? 'text-rose' : 'text-ink-dim',
            )}
          >
            <CircleAlert size={10} />
            {latest
              ? latest.quality === 'VALID'
                ? 'latest frame valid'
                : `latest frame ${latest.quality.toLowerCase()}`
              : 'no frame received'}
          </span>
        </FrameFooter>
      </Frame>

      {/* ---------------- spectrum-style line ---------------- */}
      <Frame className="min-h-[280px] xl:col-span-2 xl:min-h-0">
        <FrameHeader
          title="Signal Profile across the board"
          subtitle={
            profile.length > 0
              ? `mean ${cfg.unit} per grid column · ${scan?.scan_name}`
              : 'column profile · needs captured cells'
          }
          icon={<ScanLine size={14} />}
          right={<Badge tone="neutral">X axis · grid columns</Badge>}
        />
        <div className="min-h-0 flex-1 px-2 pb-2">
          {profile.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="text-[11.5px] font-medium text-ink-muted">No profile yet</div>
              <p className="mt-1 max-w-[280px] text-[10px] leading-relaxed text-ink-dim">
                This line charts the mean measured value in each vertical band of the board. It fills as cells are
                captured.
              </p>
            </div>
          ) : (
            <ErrorBoundary label="Profile chart">
              <SpectrumLine points={profile} unit={cfg.unit} />
            </ErrorBoundary>
          )}
        </div>
      </Frame>

      {/* ---------------- capture trend ---------------- */}
      <Frame className="min-h-[280px] xl:min-h-0">
        <FrameHeader
          title="Scanning Activity"
          subtitle="captured readings per minute"
          icon={<Grid3x3 size={14} />}
          right={
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_8px_2px_rgba(53,229,197,0.45)]" />
              <span className="text-[10px] text-ink-dim">{measurements.length} total</span>
            </span>
          }
        />
        <div className="min-h-0 flex-1 px-2 pb-2">
          <ErrorBoundary label="Activity chart">
            <TrendBars rows={captureTrend} />
          </ErrorBoundary>
        </div>
        <FrameFooter className="justify-between">
          <span className="flex items-center gap-1.5 text-[10px] text-ink-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-violet shadow-[0_0_8px_2px_rgba(167,139,250,0.45)]" />
            {summary ? `${summary.coveragePct.toFixed(0)}% coverage` : 'no scan'}
          </span>
          <span className="text-[10px] text-ink-dim">
            {live.window.count > 0 ? `${live.window.count} frames in 60 s` : 'no live frames'}
          </span>
        </FrameFooter>
      </Frame>
    </div>
  )
}
