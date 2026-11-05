import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity,
  Box,
  Camera,
  CameraOff,
  Cpu,
  Crosshair,
  Download,
  Gauge,
  Layers,
  Link2,
  Plug,
  Radio,
  RefreshCw,
  Trash2,
  Video,
  Waves,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  Field,
  Frame,
  FrameBody,
  FrameFooter,
  FrameHeader,
  KeyValue,
  NumberInput,
  Segmented,
  Select,
  StatusDot,
  TextInput,
  cn,
} from '../components/ui'
import { CameraView } from '../components/CameraView'
import { ReconstructionView } from '../components/ReconstructionView'
import { Sparkline } from '../components/DataViz'
import {
  arrivalJitter,
  formatDateTime,
  formatNumber,
  formatTime,
  gridGeometry,
  probeLabel,
  summariseScan,
} from '../lib/derive'
import { cameraSupported } from '../lib/camera'
import { esp32Url } from '../lib/esp32cam'
import { useDemoModuleFeed } from '../components/useDemoFeed'

export function MachineVision() {
  const {
    esp32Config,
    esp32Link,
    esp32Error,
    esp32Frame,
    esp32History,
    esp32Frames,
    esp32Dropped,
    esp32Meta,
    updateEsp32Config,
    connectEsp32,
    disconnectEsp32,
    cameraStatus,
    cameraDevices,
    cameraDeviceId,
    cameraInfo,
    cameraCaptures,
    cameraOverlay,
    demoMode,
    deviceState,
    signalState,
    samples,
    scans,
    measurements,
    activeScanId,
    settings,
    startCamera,
    stopCamera,
    selectCamera,
    refreshCameras,
    captureFrameNow,
  captureEsp32FrameNow,
    deleteCapture,
    clearCaptures,
    setCameraOverlay,
    notify,
  } = useApp()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const demoRef = useRef<HTMLCanvasElement | null>(null)
  const [showConfig, setShowConfig] = useState(false)

  const esp32Live = esp32Link === 'STREAMING' || esp32Link === 'STALLED'
  const usbLive = cameraStatus === 'LIVE'
  const supported = cameraSupported()

  const scan = scans.find((s) => s.scan_id === activeScanId) ?? scans[0] ?? null
  const scanMeasurements = scan ? measurementsForScan(measurements, scan.scan_id) : []
  const geometry = scan ? gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm) : null
  const summary = scan ? summariseScan(scanMeasurements, geometry?.totalCells ?? 0, settings.acquisition.unit) : null

  const arrival = useMemo(
    () => arrivalJitter(esp32History.map((h) => new Date(h.at).getTime())),
    [esp32History],
  )
  const byteSeries = esp32History.slice(-48).map((h) => h.bytes)
  const fpsSeries = esp32History.slice(-48).map((h) => Math.round(h.fps * 10) / 10)

  const demoModuleRef = useRef<HTMLCanvasElement | null>(null)
  const demoModuleOn = demoMode && !esp32Live && !usbLive
  useDemoModuleFeed(demoModuleRef, demoModuleOn, {
    widthMm: scan?.board_width_mm ?? 60,
    heightMm: scan?.board_height_mm ?? 40,
  })

  useEffect(() => {
    void refreshCameras()
  }, [refreshCameras])

  /** Grab the frame currently on screen — module frame first, then USB, then demo. */
  const grab = () => {
    if (esp32Frame && (esp32Live || demoMode)) {
      const capture = captureEsp32FrameNow()
      if (capture) notify('ok', 'Frame kept', `${capture.width}×${capture.height} · session only.`)
      return
    }
    const source = usbLive ? videoRef.current : demoMode ? demoRef.current : null
    if (!source) {
      notify('warn', 'No picture to capture', 'Connect the ESP32-CAM or a camera first — nothing is generated without it.')
      return
    }
    const capture = captureFrameNow(source)
    if (capture) notify('ok', 'Frame captured', `${capture.width}×${capture.height} · kept in this session only.`)
  }

  const exportCapture = (dataUrl: string, at: string) => {
    const bytes = dataUrl.split(',')[1] ?? ''
    const binary = atob(bytes)
    const buffer = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `emi-machine-${at.replace(/[:.]/g, '-')}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const linkTone = esp32Link === 'STREAMING' ? 'ok' : esp32Link === 'STALLED' ? 'warn' : esp32Link === 'ERROR' ? 'danger' : 'neutral'

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 max-xl:h-auto xl:grid-rows-[minmax(0,1.5fr)_minmax(0,0.72fr)] xl:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)_284px]">
      {/* ---------------- live picture ---------------- */}
      <Frame className="min-h-[300px] xl:min-h-0">
        <FrameHeader
          title="Machine view"
          subtitle={
            esp32Live && esp32Frame
              ? `ESP32-CAM · ${esp32Frame.width}×${esp32Frame.height} · ${esp32Frame.fps.toFixed(1)} fps delivered · frame #${esp32Frame.seq ?? '—'}`
              : usbLive
                ? `USB camera · ${cameraInfo.width ?? '?'}×${cameraInfo.height ?? '?'}`
                : demoMode
                  ? 'demo feed — painted by the demo module, not a camera'
                  : 'no picture — the module is the only source'
          }
          icon={<Camera size={13} />}
          right={
            <>
              <Badge tone={linkTone} dot>
                {esp32Link === 'STREAMING'
                  ? 'ESP32 LIVE'
                  : esp32Link === 'STALLED'
                    ? 'STALLED'
                    : esp32Link === 'CONNECTING'
                      ? 'CONNECTING'
                      : esp32Link === 'ERROR'
                        ? 'LINK ERROR'
                        : usbLive
                          ? 'USB LIVE'
                          : 'OFF'}
              </Badge>
              {esp32Dropped > 0 ? <Badge tone="warn">{esp32Dropped} dropped</Badge> : null}
            </>
          }
        />
        <div className="min-h-0 flex-1 px-1.5 pb-1.5">
          <CameraView videoRef={videoRef} demoCanvasRef={demoRef} />
        </div>
        <FrameFooter className="justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {esp32Live ? (
              <>
                <Button size="xs" variant="secondary" icon={<Camera size={10} />} onClick={grab}>
                  Capture frame
                </Button>
                <Button size="xs" variant="ghost" icon={<Link2 size={10} />} onClick={disconnectEsp32}>
                  Disconnect
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<RefreshCw size={10} />}
                  onClick={() => void connectEsp32()}
                  title="Reconnect to the module"
                >
                  Reconnect
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="xs"
                  variant="primary"
                  icon={<Cpu size={10} />}
                  onClick={() => void connectEsp32()}
                  disabled={esp32Link === 'CONNECTING'}
                >
                  {esp32Link === 'CONNECTING' ? 'Connecting…' : 'Connect module'}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<Video size={10} />}
                  onClick={() => void startCamera()}
                  disabled={!supported}
                  title="Use a camera attached to this computer instead"
                >
                  USB camera
                </Button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowConfig((v) => !v)}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-line bg-white/[0.03] px-2 text-[9.5px] text-ink-dim transition-colors hover:text-ink"
            >
              <Wifi size={9} /> {esp32Config.host}
            </button>
          </div>
          <span className="flex items-center gap-1.5 text-[9.5px] text-ink-dim">
            <StatusDot tone={esp32Link === 'STREAMING' ? 'ok' : 'neutral'} pulse={esp32Link === 'STREAMING'} />
            {esp32Live ? `${esp32Frames} frames` : usbLive ? 'device streaming' : 'idle'}
          </span>
        </FrameFooter>

        {showConfig ? (
          <div className="shrink-0 border-t border-white/[0.06] px-3 py-2">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Field label="Module host">
                <TextInput
                  value={esp32Config.host}
                  onChange={(e) => updateEsp32Config({ host: e.target.value })}
                  placeholder="192.168.4.1"
                  className="h-7 text-[10.5px]"
                />
              </Field>
              <Field label="Port">
                <NumberInput
                  value={esp32Config.port}
                  onChange={(e) => updateEsp32Config({ port: Number(e.target.value) })}
                  className="h-7 text-[10.5px]"
                />
              </Field>
              <Field label="Transport">
                <Segmented
                  size="xs"
                  value={esp32Config.mode}
                  onChange={(mode) => updateEsp32Config({ mode })}
                  options={[
                    { value: 'websocket', label: 'WebSocket' },
                    { value: 'mjpeg', label: 'MJPEG' },
                  ]}
                />
              </Field>
              <Field label="Stream path">
                <TextInput
                  value={esp32Config.path}
                  onChange={(e) => updateEsp32Config({ path: e.target.value })}
                  placeholder="/stream"
                  className="h-7 text-[10.5px]"
                />
              </Field>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[9px] text-ink-dim">
              <span className="tabular">{esp32Url(esp32Config)}</span>
              <span className="text-ink-dim/60">WebSocket carries the detector reading with each frame; MJPEG is picture only.</span>
            </div>
          </div>
        ) : null}
      </Frame>

      {/* ---------------- 3D reconstruction ---------------- */}
      <Frame className="min-h-[280px] xl:min-h-0">
        <FrameHeader
          title="3D reconstruction"
          subtitle={
            scan
              ? `${scan.is_demo ? 'DEMO · ' : ''}${scan.board_width_mm} × ${scan.board_height_mm} mm · module frame as texture`
              : 'board geometry from the scan'
          }
          icon={<Box size={13} />}
          right={<Badge tone="neutral">{cameraOverlay === 'SURFACE' ? 'field overlay' : 'board only'}</Badge>}
        />
        <div className="min-h-0 flex-1 px-1.5 pb-1.5">
          <ReconstructionView />
        </div>
        <FrameFooter className="justify-between">
          <span className="flex items-center gap-1.5 text-[10px] text-ink-dim">
            <Layers size={10} />
            {scanMeasurements.length > 0
              ? `${summary?.measuredCells ?? 0} measured cells draped over the board`
              : 'no readings yet — board shown as a wireframe'}
          </span>
          <button
            type="button"
            onClick={() => setCameraOverlay(cameraOverlay === 'SURFACE' ? 'OFF' : 'SURFACE')}
            className="text-[9.5px] text-ink-dim transition-colors hover:text-teal"
          >
            {cameraOverlay === 'SURFACE' ? 'hide field' : 'show field'}
          </button>
        </FrameFooter>
        {/* Off-screen surface for the demo module feed. */}
        <canvas ref={demoModuleRef} width={640} height={480} className="hidden" aria-hidden />
      </Frame>

      {/* ---------------- right rail ---------------- */}
      <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none xl:row-span-2">
        <Frame className="shrink-0">
          <FrameHeader title="Module" subtitle="ESP32-CAM link" icon={<Radio size={12} />} />
          <FrameBody className="p-2.5">
            <KeyValue
              label="Link"
              value={
                esp32Link === 'STREAMING'
                  ? 'streaming'
                  : esp32Link === 'STALLED'
                    ? 'stalled'
                    : esp32Link.toLowerCase()
              }
            />
            <KeyValue label="Frames" value={esp32Frames.toLocaleString('en-US')} mono />
            <KeyValue
              label="Delivered"
              value={esp32Live && esp32Frame ? `${esp32Frame.fps.toFixed(1)} fps` : '—'}
              mono
            />
            <KeyValue
              label="Resolution"
              value={esp32Frame?.width ? `${esp32Frame.width} × ${esp32Frame.height}` : '—'}
              mono
            />
            <KeyValue
              label="Frame size"
              value={esp32Frame ? `${(esp32Frame.bytes / 1024).toFixed(1)} kB` : '—'}
              mono
            />
            <KeyValue
              label="Arrival"
              value={arrival.median > 0 ? `${Math.round(arrival.median)} ms median` : '—'}
              mono
            />
            <KeyValue
              label="Jitter p95"
              value={arrival.p95 > 0 ? `${Math.round(arrival.p95)} ms` : '—'}
              mono
            />
            <KeyValue label="Dropped" value={String(esp32Dropped)} mono />
            <Divider className="my-1.5" />
            <div className="flex items-center gap-1.5">
              <span className={cn('flex items-center gap-1 text-[9.5px]', esp32Live ? 'text-green' : 'text-ink-dim')}>
                {esp32Live ? <Wifi size={9} /> : <WifiOff size={9} />}
                {esp32Url(esp32Config)}
              </span>
            </div>
            {esp32Error ? (
              <>
                <Divider className="my-1.5" />
                <p className="text-[9px] leading-snug text-elevated">{esp32Error}</p>
              </>
            ) : null}
            {Object.keys(esp32Meta).length > 0 ? (
              <>
                <Divider className="my-1.5" />
                <div className="space-y-0.5">
                  {Object.entries(esp32Meta)
                    .filter(([key]) => !['seq', 'bytes', 'uptime_ms'].includes(key))
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <KeyValue key={key} label={key} value={String(value)} mono />
                    ))}
                </div>
              </>
            ) : null}
          </FrameBody>
        </Frame>

        <Frame className="shrink-0">
          <FrameHeader title="Stream health" subtitle="measured from arriving frames" icon={<Gauge size={12} />} />
          <div className="space-y-2 p-2.5">
            <div>
              <div className="flex items-center justify-between text-[9.5px] text-ink-dim">
                <span>delivery rate</span>
                <span className="tabular text-ink-muted">
                  {esp32Frame ? `${esp32Frame.fps.toFixed(1)} fps` : '—'}
                </span>
              </div>
              <Sparkline values={fpsSeries} color="#35e5c5" height={26} />
            </div>
            <div>
              <div className="flex items-center justify-between text-[9.5px] text-ink-dim">
                <span>frame size</span>
                <span className="tabular text-ink-muted">
                  {esp32Frame ? `${(esp32Frame.bytes / 1024).toFixed(1)} kB` : '—'}
                </span>
              </div>
              <Sparkline values={byteSeries} color="#6aa8ff" height={26} />
            </div>
            <div className="flex items-center justify-between gap-2 text-[9px] text-ink-dim">
              <span className="flex items-center gap-1">
                <Waves size={9} /> jitter p95 {arrival.p95 > 0 ? `${Math.round(arrival.p95)} ms` : '—'}
              </span>
              <span className="flex items-center gap-1">
                <Activity size={9} /> {esp32History.length} samples
              </span>
            </div>
          </div>
        </Frame>

        <Frame className="min-h-0">
          <FrameHeader
            title="Captured frames"
            subtitle="session only · not stored"
            icon={<Camera size={12} />}
            right={
              cameraCaptures.length > 0 ? (
                <Button size="xs" variant="ghost" icon={<Trash2 size={9} />} onClick={clearCaptures}>
                  all
                </Button>
              ) : null
            }
          />
          <FrameBody className="p-1.5">
            {cameraCaptures.length === 0 ? (
              <EmptyState compact title="No frames captured" icon={<Camera size={16} />}>
                Grab stills of the board while scanning; they stay in memory for this session.
              </EmptyState>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {cameraCaptures.map((capture) => (
                  <div
                    key={capture.capture_id}
                    className="group relative overflow-hidden rounded-[6px] border border-line bg-black/40"
                  >
                    <img
                      src={capture.data_url}
                      alt={`Captured frame ${formatDateTime(capture.at)}`}
                      className="block aspect-video w-full object-cover"
                    />
                    <div className="flex items-center justify-between px-1 py-0.5 text-[8.5px] text-ink-dim">
                      <span className="tabular">{formatTime(capture.at)}</span>
                      <span className="flex items-center gap-1">
                        {capture.is_demo ? <span className="text-elevated">DEMO</span> : null}
                        <button
                          type="button"
                          title="Download PNG"
                          onClick={() => exportCapture(capture.data_url, capture.at)}
                          className="text-ink-dim hover:text-teal"
                        >
                          <Download size={9} />
                        </button>
                        <button
                          type="button"
                          title="Discard"
                          onClick={() => deleteCapture(capture.capture_id)}
                          className="text-ink-dim hover:text-strong"
                        >
                          <Trash2 size={9} />
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FrameBody>
        </Frame>
      </div>

      {/* ---------------- bottom: operator camera + alignment notes ---------------- */}
      <Frame className="min-h-[190px] xl:col-span-2 xl:min-h-0">
        <FrameHeader
          title="Operator camera"
          subtitle="browser video input · fallback when no module is attached"
          icon={<Video size={13} />}
          right={
            <>
              {usbLive ? (
                <>
                  <Button size="xs" variant="ghost" icon={<CameraOff size={10} />} onClick={stopCamera}>
                    Stop
                  </Button>
                  <Badge tone="ok" dot>
                    LIVE
                  </Badge>
                </>
              ) : (
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<Plug size={10} />}
                  onClick={() => void startCamera()}
                  disabled={!supported || esp32Live}
                  title={esp32Live ? 'The module is supplying the picture' : 'Open a camera attached to this computer'}
                >
                  Use camera
                </Button>
              )}
              {cameraDevices.length > 1 ? (
                <Select
                  value={cameraDeviceId ?? ''}
                  onChange={(e) => selectCamera(e.target.value || null)}
                  className="h-6 max-w-[130px] text-[10px]"
                >
                  {cameraDevices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              ) : null}
            </>
          }
        />
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 px-3 pb-2 max-lg:grid-cols-1">
          {[
            {
              title: '1 · Module',
              body: esp32Live
                ? 'The ESP32-CAM streams JPEG frames and the detector reading that was live for each one. Arrival rate and jitter above are measured from those frames.'
                : 'Enter the module address and press Connect. Frames are bursty on Wi-Fi, so the viewfinder buffers a few and plays them at a constant cadence — no frame is invented.',
            },
            {
              title: '2 · Texture',
              body: 'The board rectangle of the frame becomes the texture of the scan-sized plane. “Board crop” uses the centred region, “full frame” uses all of it.',
            },
            {
              title: '3 · Field',
              body: 'Measured cells are interpolated (IDW) into a lit surface and draped over the board. Only measured cells are data; interpolation is derived and excluded from exports.',
            },
          ].map((step) => (
            <div key={step.title} className="rounded-[7px] border border-white/[0.06] bg-white/[0.015] px-2.5 py-2">
              <div className="text-[10.5px] font-medium text-ink">{step.title}</div>
              <p className="mt-1 text-[9.5px] leading-relaxed text-ink-dim">{step.body}</p>
            </div>
          ))}
        </div>
        <FrameFooter className="justify-between">
          <span className={cn('flex items-center gap-1.5 text-[9.5px]', demoMode ? 'text-elevated' : 'text-ink-dim')}>
            {demoMode
              ? 'Demo Mode is on — the picture and the field both come from the demo module.'
              : 'Module picture is real. Field values come only from captured measurements.'}
          </span>
          <span className="flex items-center gap-1.5 text-[9.5px] text-ink-dim">
            <Crosshair size={9} />
            {deviceState === 'CONNECTED'
              ? `detector ${signalState.toLowerCase()} · ${samples.length} frames buffered`
              : 'detector offline'}
            {' · '}
            {scan ? probeLabel(scan.probe_type) : 'no probe'} ·{' '}
            {summary?.max ? `peak ${formatNumber(summary.max.signal_raw)} ${settings.acquisition.unit}` : 'no peak yet'}
          </span>
        </FrameFooter>
      </Frame>
    </div>
  )
}
