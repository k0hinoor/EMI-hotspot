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
  Field,
  Frame,
  FrameBody,
  FrameFooter,
  FrameHeader,
  KeyValue,
  Metric,
  Notice,
  NumberInput,
  Segmented,
  Select,
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
    case 'STALE':
      return 'warn'
    default:
      return 'danger'
  }
}

function qualityTone(q: QualityStatus): Tone {
  return q === 'VALID' ? 'ok' : q === 'UNSTABLE' ? 'warn' : 'danger'
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
  const probeType = deviceProbe ?? activeProbeType

  const activeScans = useMemo(
    () => scans.filter((s) => s.status === 'ACTIVE' || s.status === 'PAUSED' || s.status === 'COMPLETED'),
    [scans],
  )

  const canCapture = connected && latest !== null && signalState !== 'STALE' && latest.quality !== 'INVALID'

  const handleCapture = async () => {
    const x = coordinate.x.trim() === '' ? null : Number(coordinate.x)
    const y = coordinate.y.trim() === '' ? null : Number(coordinate.y)
    if ((x !== null && !Number.isFinite(x)) || (y !== null && !Number.isFinite(y))) return
    const measurement = await captureMeasurement({ scanId: captureScanId || null, x_mm: x, y_mm: y })
    if (measurement) {
      setLastCaptured({ raw: measurement.signal_raw, at: measurement.timestamp, quality: measurement.quality_status })
    }
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 max-xl:h-auto max-xl:grid-rows-none">
      {!connected ? (
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-dashed border-line bg-panel px-3 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-line bg-canvas">
            <Usb size={12} className="text-ink-dim" />
          </span>
          <span className="text-[11.5px] font-medium text-ink">No detector connected</span>
          {deviceState === 'ERROR' ? <Badge tone="danger">LINK ERROR</Badge> : null}
          <span className="min-w-0 flex-1 truncate text-[10.5px] text-ink-dim">
            Readings stay blank until the board streams frames over USB serial. Flash{' '}
            <span className="font-mono text-ink-muted">firmware/emi_hotspot_serial.ino</span>, plug it in, then open the
            link.
          </span>
          <Button variant="primary" size="md" icon={<Plug size={12} />} onClick={() => setConnectOpen(true)}>
            Connect device
          </Button>
        </div>
      ) : signalState === 'STALE' ? (
        <Notice tone="warn" title={`Data is stale · last frame ${relativeTime(lastFrameAt)}`} icon={<TriangleAlert size={13} />}>
          The link is open but the device stopped sending. The values below are the last received frame, not a live
          reading.
        </Notice>
      ) : null}

      {/* Row 1 — readout band */}
      <Frame className="shrink-0">
        <div className="grid grid-cols-2 divide-line-soft md:grid-cols-3 lg:grid-cols-6 lg:divide-x">
          <div className="col-span-2 border-b border-line-soft px-3 py-2.5 md:col-span-1 lg:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <span className="label-caps">Raw signal</span>
              <Badge tone={signalTone(signalState)} dot={signalState !== 'UNKNOWN'}>
                {signalState !== 'UNKNOWN' ? signalState : latest ? 'SETTLING' : 'NO DATA'}
              </Badge>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className={cn(
                  'tabular text-[32px] leading-none font-medium',
                  latest === null ? 'text-ink-dim/40' : 'text-ink',
                )}
              >
                {latest ? formatNumber(latest.signal_raw) : '—'}
              </span>
              <span className="text-[9.5px] text-ink-dim">{cfg.unit}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[9.5px] text-ink-dim">
              <span className={cn('h-1.5 w-1.5 rounded-full', probeType === 'E_FIELD' ? 'bg-efield' : 'bg-hfield')} />
              {probeLabel(probeType)}
              {latest?.sample_count ? ` · ${latest.sample_count} samples` : ''}
            </div>
          </div>

          <Metric
            className="border-b border-line-soft px-3 py-2.5 lg:border-b-0"
            label="Filtered"
            size="sm"
            value={latest?.signal_filtered != null ? formatNumber(latest.signal_filtered) : '—'}
            unit={latest?.signal_filtered != null ? cfg.unit : undefined}
            hint={latest?.signal_filtered != null ? 'reported by firmware' : 'not reported'}
          />
          <Metric
            className="border-b border-line-soft px-3 py-2.5 lg:border-b-0"
            label={`Peak · ${windowSeconds}s`}
            size="sm"
            value={formatNumber(live.window.max)}
            unit={live.window.max !== null ? cfg.unit : undefined}
            hint={`${live.window.count} frames`}
          />
          <Metric
            className="border-b border-line-soft px-3 py-2.5 lg:border-b-0"
            label={`Average · ${windowSeconds}s`}
            size="sm"
            value={formatNumber(live.window.mean, 1)}
            unit={live.window.mean !== null ? cfg.unit : undefined}
            hint={live.window.min !== null ? `min ${formatNumber(live.window.min)}` : 'awaiting frames'}
          />
          <Metric
            className="border-b border-line-soft px-3 py-2.5 lg:border-b-0"
            label="Spread"
            size="sm"
            value={live.window.spreadPct !== null ? formatNumber(live.window.spreadPct, 1) : '—'}
            unit={live.window.spreadPct !== null ? '%' : undefined}
            hint={`pk-pk · limit ${cfg.unstable_spread_pct}%`}
            tone={live.window.spreadPct !== null && live.window.spreadPct > cfg.unstable_spread_pct ? 'warn' : 'default'}
          />
          <Metric
            className="px-3 py-2.5"
            label="Noise floor"
            size="sm"
            value={formatNumber(live.baseline, 1)}
            unit={live.baseline !== null ? cfg.unit : undefined}
            hint={`first ${live.baselineSamples} frames`}
          />
        </div>
        {signalNote ? (
          <div className="flex items-center gap-1.5 border-t border-line-soft px-3 py-1 text-[10px] text-elevated">
            <CircleAlert size={11} /> {signalNote}
          </div>
        ) : null}
      </Frame>

      {/* Row 2 — plot + controls */}
      <div className="grid min-h-0 grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_296px]">
        <Frame className="min-h-[300px] xl:min-h-0">
          <FrameHeader
            title="Signal versus time"
            subtitle={`Raw ${cfg.unit} · trailing ${windowSeconds} s · ${graphPaused ? 'plot frozen' : 'live'}`}
            icon={<Activity size={12} />}
            right={
              <>
                <Segmented
                  size="xs"
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
                  size="xs"
                  variant="ghost"
                  icon={graphPaused ? <Play size={10} /> : <Pause size={10} />}
                  onClick={() => setGraphPaused(!graphPaused)}
                >
                  {graphPaused ? 'Resume' : 'Freeze'}
                </Button>
              </>
            }
          />
          <div className="min-h-0 flex-1 px-1 py-1">
            {samples.length === 0 ? (
              <div className="flex h-full items-center justify-center px-4">
                <div className="max-w-sm text-center">
                  <Activity size={22} className="mx-auto mb-2 text-ink-dim/50" />
                  <div className="text-[11.5px] font-medium text-ink-muted">No frames received</div>
                  <p className="mt-1 text-[10.5px] leading-relaxed text-ink-dim">
                    The plot fills from frames arriving on the serial link. It is never pre-populated.
                  </p>
                  {!connected ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Plug size={11} />}
                      onClick={() => setConnectOpen(true)}
                      className="mt-2"
                    >
                      Open connection
                    </Button>
                  ) : null}
                </div>
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
                  color={probeColor(probeType)}
                />
              </ErrorBoundary>
            )}
          </div>
          <FrameFooter className="justify-between">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={acquiring ? 'secondary' : 'primary'}
                icon={<Play size={10} />}
                disabled={!connected || acquiring}
                onClick={startAcquisition}
              >
                Start
              </Button>
              <Button size="sm" icon={<Pause size={10} />} disabled={!connected || !acquiring} onClick={pauseAcquisition}>
                Pause
              </Button>
              <Button size="sm" icon={<Square size={9} />} disabled={!connected} onClick={stopAcquisition}>
                Stop
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<RotateCcw size={10} />}
                onClick={resetSession}
                disabled={samples.length === 0}
              >
                Reset
              </Button>
            </div>
            <div className="flex items-center gap-1.5 text-[9.5px] text-ink-dim">
              <StatusDot tone={acquiring ? 'ok' : 'neutral'} pulse={acquiring} />
              {acquiring ? 'running' : connected ? 'paused' : 'idle'}
              <span className="text-ink-dim/50">·</span>
              <span className="tabular">{samples.length} in buffer</span>
            </div>
          </FrameFooter>
        </Frame>

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none">
          <Frame className="shrink-0">
            <FrameHeader title="Probe" subtitle="recorded with every reading" icon={<Zap size={12} />} />
            <div className="px-2.5 py-2">
              <ProbeSelector />
              <div className="mt-1.5 flex items-center justify-between text-[9.5px] text-ink-dim">
                <span>
                  device reports{' '}
                  <span className="text-ink-muted">{deviceProbe ? probeLabel(deviceProbe) : connected ? 'n/a' : '—'}</span>
                </span>
                <span>
                  selected <span className="text-ink-muted">{probeLabel(activeProbeType)}</span>
                </span>
              </div>
            </div>
          </Frame>

          <Frame className="min-h-[420px] xl:min-h-0">
            <FrameHeader
              title="Capture"
              subtitle="one reading · coordinate + provenance"
              icon={<Crosshair size={12} />}
            />
            <FrameBody className="space-y-2 p-2.5">
              <div className="rounded-[6px] border border-line bg-canvas px-2 py-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="label-caps">value to store</span>
                  <span className="tabular text-[13px] text-ink">
                    {canCapture && latest ? formatNumber(latest.signal_raw) : '—'}
                    <span className="ml-1 text-[9px] text-ink-dim">{cfg.unit}</span>
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[9.5px] text-ink-dim">
                  <span>{latest ? `frame ${formatTime(latest.received_at)}` : 'no frame'}</span>
                  {latest ? <Badge tone={qualityTone(latest.quality)}>{latest.quality}</Badge> : null}
                </div>
              </div>

              <Field label="Scan">
                <Select value={captureScanId} onChange={(e) => setCaptureScanId(e.target.value)}>
                  <option value="">Unassigned reading</option>
                  {activeScans.map((s) => (
                    <option key={s.scan_id} value={s.scan_id}>
                      {s.scan_name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-1.5">
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

              <Button variant="primary" size="md" block icon={<Crosshair size={12} />} disabled={!canCapture} onClick={() => void handleCapture()}>
                Capture reading
              </Button>

              {!connected ? (
                <p className="text-[9.5px] leading-relaxed text-ink-dim">
                  Disabled without a live link — there is nothing real to store.
                </p>
              ) : latest?.quality === 'INVALID' ? (
                <p className="flex items-center gap-1 text-[9.5px] text-strong">
                  <Ban size={10} /> Device flagged this reading invalid.
                </p>
              ) : (
                <p className="text-[9.5px] leading-relaxed text-ink-dim">
                  Stores raw value, quality, probe, timestamp, device and acquisition settings.
                </p>
              )}

              {lastCaptured ? (
                <div className="rounded-[6px] border border-normal/25 bg-normal/6 px-2 py-1.5 text-[9.5px] text-ink-muted">
                  Stored <span className="tabular text-ink">{formatNumber(lastCaptured.raw)}</span> at{' '}
                  {formatTime(lastCaptured.at)} · {lastCaptured.quality}
                  <Link to="/data-log" className="ml-1 text-accent underline-offset-2 hover:underline">
                    log
                  </Link>
                </div>
              ) : null}

              <div className="rounded-[6px] border border-line-soft px-2 py-1.5">
                <KeyValue label="Last frame" value={relativeTime(lastFrameAt)} mono />
                <KeyValue
                  label="Session frames"
                  value={
                    <>
                      {samplesReceived.toLocaleString('en-US')}
                      {framesRejected > 0 ? <span className="ml-1 text-elevated">· {framesRejected} rejected</span> : null}
                    </>
                  }
                  mono
                />
                <KeyValue label="Device" value={session.device_id ?? '—'} mono />
              </div>

              <div className="rounded-[6px] border border-line-soft px-2 py-1.5">
                <div className="label-caps mb-1">acquisition window</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <Field label="Averaging">
                    <NumberInput
                      min={1}
                      max={500}
                      value={cfg.averaging_window}
                      onChange={(e) => updateAcquisition({ averaging_window: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </Field>
                  <Field label="Stale (ms)">
                    <NumberInput
                      min={200}
                      step={100}
                      value={cfg.stale_after_ms}
                      onChange={(e) => updateAcquisition({ stale_after_ms: Math.max(200, Number(e.target.value) || 200) })}
                    />
                  </Field>
                </div>
              </div>
            </FrameBody>
            <FrameFooter>
              <Grid3x3 size={11} className="shrink-0 text-ink-dim" />
              <span className="truncate text-[9.5px] text-ink-dim">Mapping a board? Capture per cell on</span>
              <Link to="/heatmap" className="text-[9.5px] text-accent hover:underline">
                Heatmap
              </Link>
            </FrameFooter>
          </Frame>
        </div>
      </div>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
