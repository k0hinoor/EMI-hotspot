import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Ban,
  CircleAlert,
  Crosshair,
  Grid3x3,
  Pause,
  Play,
  Plug,
  RotateCcw,
  Square,
  TriangleAlert,
  Usb,
  Zap,
} from 'lucide-react'
import { useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  Field,
  Metric,
  NumberInput,
  Notice,
  Panel,
  PanelHeader,
  Select,
  Segmented,
  StatusDot,
  cn,
  type Tone,
} from '../components/ui'
import { ProbeSelector } from '../components/ProbeSelector'
import { SignalChart } from '../components/SignalChart'
import { ConnectDialog } from '../components/ConnectDialog'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { formatNumber, formatTime, probeColor, probeLabel, relativeTime } from '../lib/derive'
import type { QualityStatus, SignalState } from '../lib/types'

function signalTone(state: SignalState): Tone {
  switch (state) {
    case 'STABLE':
      return 'ok'
    case 'UNKNOWN':
      return 'neutral'
    case 'UNSTABLE':
      return 'warn'
    case 'STALE':
      return 'warn'
    case 'SATURATED':
      return 'danger'
    case 'INVALID':
      return 'danger'
  }
}

function qualityTone(q: QualityStatus): Tone {
  return q === 'VALID' ? 'ok' : q === 'UNSTABLE' ? 'warn' : q === 'SATURATED' ? 'danger' : 'danger'
}

export function LiveScan() {
  const {
    deviceState,
    session,
    samples,
    signalState,
    signalNote,
    lastFrameAt,
    acquiring,
    activeProbeType,
    deviceProbe,
    settings,
    stats,
    scans,
    activeScanId,
    startAcquisition,
    pauseAcquisition,
    stopAcquisition,
    resetSession,
    graphPaused,
    setGraphPaused,
    updateAcquisition,
    captureMeasurement,
    deviceProbe: deviceProbeType,
    samplesReceived,
    framesRejected,
  } = useApp()

  const [connectOpen, setConnectOpen] = useState(false)
  const [windowSeconds, setWindowSeconds] = useState(30)
  const [captureScanId, setCaptureScanId] = useState<string>(activeScanId ?? '')
  const [coordinate, setCoordinate] = useState<{ x: string; y: string }>({ x: '', y: '' })
  const [lastCaptured, setLastCaptured] = useState<{ raw: number; at: string; quality: QualityStatus } | null>(null)

  const cfg = settings.acquisition
  const connected = deviceState === 'CONNECTED'
  const live = stats(windowSeconds)
  const latest = samples.length ? samples[samples.length - 1] : null

  const activeScans = useMemo(
    () => scans.filter((s) => s.status === 'ACTIVE' || s.status === 'PAUSED' || s.status === 'COMPLETED'),
    [scans],
  )

  const probeType = deviceProbeType ?? activeProbeType

  const canCapture = connected && latest !== null && signalState !== 'STALE' && latest.quality !== 'INVALID'

  const handleCapture = async () => {
    const x = coordinate.x.trim() === '' ? null : Number(coordinate.x)
    const y = coordinate.y.trim() === '' ? null : Number(coordinate.y)
    if ((x !== null && !Number.isFinite(x)) || (y !== null && !Number.isFinite(y))) return
    const measurement = await captureMeasurement({
      scanId: captureScanId || null,
      x_mm: x,
      y_mm: y,
    })
    if (measurement) {
      setLastCaptured({ raw: measurement.signal_raw, at: measurement.timestamp, quality: measurement.quality_status })
    }
  }

  return (
    <div className="space-y-4">
      {!connected ? (
        <Panel className="border-dashed px-4 py-3.5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-canvas">
              <Usb size={16} className="text-ink-dim" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-ink">
                No detector connected{' '}
                {deviceState === 'ERROR' ? <Badge tone="danger">LINK ERROR</Badge> : null}
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">
                Live values stay blank until the detector streams frames over USB serial. Connect the board, the probe
                and this machine, then open the link.
              </p>
            </div>
            <Button variant="primary" size="md" icon={<Plug size={13} />} onClick={() => setConnectOpen(true)}>
              Connect device
            </Button>
          </div>
        </Panel>
      ) : null}

      {signalState === 'STALE' && connected ? (
        <Notice tone="warn" title="Data is stale" icon={<TriangleAlert size={14} />}>
          Last frame {relativeTime(lastFrameAt)} — the link is open but the device stopped sending. Values below are
          the last received frame, not a live reading.
        </Notice>
      ) : null}

      {/* Readout band */}
      <Panel>
        <div className="grid grid-cols-2 divide-line-soft sm:grid-cols-3 lg:grid-cols-6 lg:divide-x">
          <div className="col-span-2 border-b border-line-soft px-4 py-4 sm:col-span-1 lg:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="label-caps">Raw signal</span>
              <Badge tone={signalTone(signalState)} dot={signalState !== 'UNKNOWN'}>
                {signalState !== 'UNKNOWN'
                  ? signalState
                  : latest
                    ? 'STABILISING'
                    : 'NO DATA'}
              </Badge>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span
                className={cn(
                  'tabular text-[38px] leading-none font-medium tracking-tight',
                  latest === null ? 'text-ink-dim/50' : 'text-ink',
                )}
              >
                {latest ? formatNumber(latest.signal_raw) : '—'}
              </span>
              <span className="text-[11px] text-ink-dim">{cfg.unit}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10.5px] text-ink-dim">
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  probeType === 'E_FIELD' ? 'bg-efield' : 'bg-hfield',
                )}
              />
              {probeLabel(probeType)} probe
              {latest?.sample_count ? ` · ${latest.sample_count} samples` : ''}
            </div>
          </div>

          <div className="border-b border-line-soft px-4 py-4 lg:border-b-0">
            <Metric
              label="Filtered"
              value={latest?.signal_filtered !== null && latest?.signal_filtered !== undefined ? formatNumber(latest.signal_filtered) : '—'}
              unit={latest?.signal_filtered !== null && latest?.signal_filtered !== undefined ? cfg.unit : undefined}
              hint={latest?.signal_filtered !== null && latest?.signal_filtered !== undefined ? 'reported by firmware' : 'not reported by firmware'}
            />
          </div>
          <div className="border-b border-line-soft px-4 py-4 lg:border-b-0">
            <Metric
              label={`Peak · ${windowSeconds}s`}
              value={formatNumber(live.window.max)}
              unit={live.window.max !== null ? cfg.unit : undefined}
              hint={`${live.window.count} frames in window`}
            />
          </div>
          <div className="border-b border-line-soft px-4 py-4 lg:border-b-0">
            <Metric
              label={`Average · ${windowSeconds}s`}
              value={formatNumber(live.window.mean, live.window.mean !== null ? 0 : 0)}
              unit={live.window.mean !== null ? cfg.unit : undefined}
              hint={live.window.min !== null ? `min ${formatNumber(live.window.min)}` : 'awaiting frames'}
            />
          </div>
          <div className="border-b border-line-soft px-4 py-4 lg:border-b-0">
            <Metric
              label="Spread"
              value={live.window.spreadPct !== null ? formatNumber(live.window.spreadPct, 1) : '—'}
              unit={live.window.spreadPct !== null ? '%' : undefined}
              hint={`peak-to-peak · limit ${cfg.unstable_spread_pct}%`}
              tone={live.window.spreadPct !== null && live.window.spreadPct > cfg.unstable_spread_pct ? 'warn' : 'default'}
            />
          </div>
          <div className="px-4 py-4">
            <Metric
              label="Baseline"
              value={formatNumber(live.baseline, 0)}
              unit={live.baseline !== null ? cfg.unit : undefined}
              hint={`first ${live.baselineSamples} frames of window`}
            />
          </div>
        </div>
        {signalNote ? (
          <div className="flex items-center gap-2 border-t border-line-soft px-4 py-2 text-[11px] text-elevated">
            <CircleAlert size={12} /> {signalNote}
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Chart */}
        <Panel className="min-w-0">
          <PanelHeader
            title="Signal versus time"
            subtitle={`Raw ${cfg.unit} · trailing ${windowSeconds} s · ${graphPaused ? 'update paused' : 'live'}`}
            icon={<Activity size={13} />}
            right={
              <div className="flex items-center gap-2">
                <Segmented
                  size="sm"
                  value={String(windowSeconds)}
                  onChange={(v) => setWindowSeconds(Number(v))}
                  options={[
                    { value: '10', label: '10s' },
                    { value: '30', label: '30s' },
                    { value: '60', label: '60s' },
                    { value: '300', label: '5m' },
                  ]}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  icon={graphPaused ? <Play size={12} /> : <Pause size={12} />}
                  onClick={() => setGraphPaused(!graphPaused)}
                  title="Freeze the plot while frames keep streaming"
                >
                  {graphPaused ? 'Resume' : 'Freeze'}
                </Button>
              </div>
            }
          />
          {samples.length === 0 ? (
            <div className="px-4 py-4">
              <EmptyState
                icon={<Activity size={26} />}
                title="No frames received"
                compact
                action={
                  !connected ? (
                    <Button variant="secondary" size="sm" icon={<Plug size={12} />} onClick={() => setConnectOpen(true)}>
                      Open connection
                    </Button>
                  ) : undefined
                }
              >
                The plot fills from frames arriving on the serial link. It is never pre-populated with generated data.
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
                  color={probeColor(probeType)}
                  height={286}
                />
              </ErrorBoundary>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={acquiring ? 'secondary' : 'primary'}
                icon={<Play size={12} />}
                disabled={!connected || acquiring}
                onClick={startAcquisition}
              >
                Start
              </Button>
              <Button size="sm" icon={<Pause size={12} />} disabled={!connected || !acquiring} onClick={pauseAcquisition}>
                Pause
              </Button>
              <Button size="sm" icon={<Square size={11} />} disabled={!connected} onClick={stopAcquisition}>
                Stop
              </Button>
              <Button size="sm" variant="ghost" icon={<RotateCcw size={12} />} onClick={resetSession} disabled={samples.length === 0}>
                Reset session
              </Button>
            </div>
            <div className="flex items-center gap-2 text-[10.5px] text-ink-dim">
              <StatusDot tone={acquiring ? 'ok' : 'neutral'} pulse={acquiring} />
              {acquiring ? 'Acquisition running' : connected ? 'Acquisition paused' : 'Idle'}
              <span className="text-ink-dim/60">·</span>
              <span className="tabular">{samples.length} held in memory</span>
            </div>
          </div>
        </Panel>

        {/* Right column */}
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Probe" subtitle="Identity is recorded with every reading" icon={<Zap size={13} />} />
            <div className="px-3 py-3">
              <ProbeSelector />
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-dim">Device reports</span>
                  <span className="text-ink-muted">
                    {deviceProbe ? probeLabel(deviceProbe) : connected ? 'not reported' : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink-dim">Selected in app</span>
                  <span className="text-ink-muted">{probeLabel(activeProbeType)}</span>
                </div>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Capture measurement"
              subtitle="One reading, with coordinate and provenance"
              icon={<Crosshair size={13} />}
            />
            <div className="space-y-3 px-3 py-3">
              <div className="rounded-lg border border-line bg-canvas px-2.5 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="label-caps">Value to store</span>
                  <span className="tabular text-[15px] text-ink">
                    {canCapture && latest ? formatNumber(latest.signal_raw) : '—'}
                    <span className="ml-1 text-[10px] text-ink-dim">{cfg.unit}</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10.5px] text-ink-dim">
                  <span>{latest ? `frame ${formatTime(latest.received_at)}` : 'no frame'}</span>
                  {latest ? <Badge tone={qualityTone(latest.quality)}>{latest.quality}</Badge> : null}
                </div>
              </div>

              <Field label="Scan">
                <Select value={captureScanId} onChange={(e) => setCaptureScanId(e.target.value)}>
                  <option value="">Unassigned reading</option>
                  {activeScans.map((s) => (
                    <option key={s.scan_id} value={s.scan_id}>
                      {s.scan_name} · {s.scan_id}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="X (mm)">
                  <NumberInput
                    placeholder="—"
                    step="0.5"
                    value={coordinate.x}
                    onChange={(e) => setCoordinate({ ...coordinate, x: e.target.value })}
                  />
                </Field>
                <Field label="Y (mm)">
                  <NumberInput
                    placeholder="—"
                    step="0.5"
                    value={coordinate.y}
                    onChange={(e) => setCoordinate({ ...coordinate, y: e.target.value })}
                  />
                </Field>
              </div>

              <Button
                variant="primary"
                block
                icon={<Crosshair size={13} />}
                disabled={!canCapture}
                onClick={() => void handleCapture()}
              >
                Capture reading
              </Button>
              {!connected ? (
                <p className="text-[10.5px] leading-relaxed text-ink-dim">
                  Capture is disabled without a live link — there is nothing real to store.
                </p>
              ) : latest?.quality === 'INVALID' ? (
                <p className="flex items-center gap-1.5 text-[10.5px] text-strong">
                  <Ban size={11} /> Device flagged this reading invalid.
                </p>
              ) : (
                <p className="text-[10.5px] leading-relaxed text-ink-dim">
                  Stores raw value, quality, probe, timestamp, device and acquisition settings.
                </p>
              )}

              {lastCaptured ? (
                <div className="rounded-lg border border-normal/25 bg-normal/6 px-2.5 py-2 text-[10.5px] text-ink-muted">
                  Stored <span className="tabular text-ink">{formatNumber(lastCaptured.raw)}</span> {cfg.unit} at{' '}
                  {formatTime(lastCaptured.at)} · {lastCaptured.quality}
                  <Link to="/data-log" className="ml-1 text-accent hover:underline">
                    view log
                  </Link>
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Acquisition window" subtitle="Statistics above use these settings" icon={<Activity size={13} />} />
            <div className="grid grid-cols-2 gap-2 px-3 py-3">
              <Field label="Averaging">
                <NumberInput
                  min={1}
                  max={500}
                  value={cfg.averaging_window}
                  onChange={(e) => updateAcquisition({ averaging_window: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
              <Field label="Stale after (ms)">
                <NumberInput
                  min={200}
                  step={100}
                  value={cfg.stale_after_ms}
                  onChange={(e) => updateAcquisition({ stale_after_ms: Math.max(200, Number(e.target.value) || 200) })}
                />
              </Field>
            </div>
            <Divider />
            <div className="px-3 py-2.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-ink-dim">Last frame</span>
                <span className="tabular text-ink-muted">{relativeTime(lastFrameAt)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-ink-dim">Session frames</span>
                <span className="tabular text-ink-muted">
                  {samplesReceived.toLocaleString('en-US')}
                  {framesRejected > 0 ? (
                    <span className="ml-1.5 text-elevated">· {framesRejected} rejected</span>
                  ) : null}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-ink-dim">Device</span>
                <span className="font-mono text-[10.5px] text-ink-muted">{session.device_id ?? '—'}</span>
              </div>
            </div>
          </Panel>

          <Panel className="border-dashed">
            <div className="flex items-start gap-2.5 px-3 py-3">
              <Grid3x3 size={14} className="mt-0.5 shrink-0 text-ink-dim" />
              <div className="min-w-0">
                <div className="text-[11.5px] text-ink-muted">Mapping a board?</div>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-ink-dim">
                  Create a grid scan and capture per-cell readings on the Heatmap page.
                </p>
                <Link
                  to="/heatmap"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                >
                  Open Heatmap →
                </Link>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
