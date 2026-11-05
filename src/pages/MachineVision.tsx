import { useEffect, useRef, useState } from 'react'
import {
  Box,
  Camera,
  CameraOff,
  Crosshair,
  Download,
  Layers,
  Radio,
  RefreshCw,
  Trash2,
  Video,
} from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  Frame,
  FrameBody,
  FrameFooter,
  FrameHeader,
  KeyValue,
  Segmented,
  Select,
  StatusDot,
  cn,
} from '../components/ui'
import { CameraView } from '../components/CameraView'
import { ReconstructionView } from '../components/ReconstructionView'
import { formatDateTime, formatNumber, formatTime, probeLabel, summariseScan, gridGeometry } from '../lib/derive'
import { cameraSupported } from '../lib/camera'

export function MachineVision() {
  const {
    cameraStatus,
    cameraError,
    cameraDevices,
    cameraDeviceId,
    cameraIsDemo,
    cameraStream,
    cameraInfo,
    cameraFps,
    cameraCaptures,
    cameraOverlay,
    cameraNotice,
    demoMode,
    deviceState,
    signalState,
    scans,
    measurements,
    activeScanId,
    settings,
    startCamera,
    stopCamera,
    selectCamera,
    refreshCameras,
    captureFrameNow,
    deleteCapture,
    clearCaptures,
    setCameraOverlay,
    notify,
  } = useApp()

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const demoRef = useRef<HTMLCanvasElement | null>(null)
  const [linkNote, setLinkNote] = useState<string | null>(null)

  const live = cameraStatus === 'LIVE' && Boolean(cameraStream)
  const demoFeed = demoMode && !live
  const supported = cameraSupported()

  const scan = scans.find((s) => s.scan_id === activeScanId) ?? scans[0] ?? null
  const scanMeasurements = scan ? measurementsForScan(measurements, scan.scan_id) : []
  const geometry = scan ? gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm) : null
  const summary = scan ? summariseScan(scanMeasurements, geometry?.totalCells ?? 0, settings.acquisition.unit) : null

  /* Enumerate once on mount — this is a real device query, not a guess. */
  useEffect(() => {
    void refreshCameras()
  }, [refreshCameras])

  const grab = () => {
    const source = live ? videoRef.current : demoFeed ? demoRef.current : null
    if (!source) {
      notify('warn', 'No picture to capture', 'Start the camera first — nothing is generated without it.')
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
    const blob = new Blob([buffer], { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `emi-machine-${at.replace(/[:.]/g, '-')}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const cameraTone = live ? 'ok' : demoFeed ? 'warn' : cameraStatus === 'DENIED' ? 'danger' : 'neutral'

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 max-xl:h-auto xl:grid-rows-[minmax(0,1.55fr)_minmax(0,0.62fr)] xl:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)_270px]">
      {/* ---------------- live camera ---------------- */}
      <Frame className="min-h-[300px] xl:min-h-0">
        <FrameHeader
          title="Machine view · camera"
          subtitle={
            live
              ? `${cameraInfo.width ?? '?'}×${cameraInfo.height ?? '?'} · ${cameraFps || Math.round(cameraInfo.frameRate ?? 0)} fps measured`
              : demoFeed
                ? 'demo feed — painted by the demo module, not a camera'
                : 'no picture — the camera is the only source'
          }
          icon={<Camera size={13} />}
          right={
            <>
              <Badge tone={cameraTone} dot>
                {live ? 'LIVE' : demoFeed ? 'DEMO FEED' : cameraStatus === 'REQUESTING' ? 'OPENING' : 'OFF'}
              </Badge>
              {cameraIsDemo ? <Badge tone="warn">synthetic</Badge> : null}
            </>
          }
        />
        <div className="min-h-0 flex-1 px-1.5 pb-1.5">
          <CameraView videoRef={videoRef} demoCanvasRef={demoRef} />
        </div>
        <FrameFooter className="justify-between">
          <div className="flex items-center gap-1.5">
            {live ? (
              <>
                <Button size="xs" variant="secondary" icon={<Camera size={10} />} onClick={grab}>
                  Capture frame
                </Button>
                <Button size="xs" variant="ghost" icon={<CameraOff size={10} />} onClick={stopCamera}>
                  Stop camera
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<RefreshCw size={10} />}
                  onClick={() => void startCamera(cameraDeviceId)}
                  title="Re-open the stream"
                >
                  Restart
                </Button>
              </>
            ) : (
              <Button
                size="xs"
                variant="primary"
                icon={<Video size={10} />}
                onClick={() => void startCamera()}
                disabled={!supported}
              >
                Start camera
              </Button>
            )}
            {cameraDevices.length > 1 ? (
              <Select
                value={cameraDeviceId ?? ''}
                onChange={(e) => selectCamera(e.target.value || null)}
                className="h-6 max-w-[150px] text-[10px]"
              >
                {cameraDevices.map((d, i) => (
                  <option key={d.deviceId || i} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
          <span className="flex items-center gap-1.5 text-[9.5px] text-ink-dim">
            <StatusDot tone={live ? 'ok' : 'neutral'} pulse={live} />
            {demoFeed ? 'demo camera' : live ? 'device streaming' : cameraDevices.length === 0 ? 'no video input' : `${cameraDevices.length} input(s)`}
          </span>
        </FrameFooter>
      </Frame>

      {/* ---------------- 3D reconstruction ---------------- */}
      <Frame className="min-h-[280px] xl:min-h-0">
        <FrameHeader
          title="3D reconstruction"
          subtitle={
            scan
              ? `${scan.is_demo ? 'DEMO · ' : ''}${scan.board_width_mm} × ${scan.board_height_mm} mm · frame as texture`
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
              ? `${summary?.measuredCells ?? 0} measured cells draped over the frame`
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
      </Frame>

      {/* ---------------- right rail ---------------- */}
      <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none xl:row-span-2">
        <Frame className="shrink-0">
          <FrameHeader title="Camera" subtitle="browser video input" icon={<Radio size={12} />} />
          <FrameBody className="p-2.5">
            {!supported ? (
              <p className="text-[9.5px] leading-relaxed text-elevated">
                This browser exposes no video capture API. Use Chromium on https or localhost.
              </p>
            ) : null}
            <KeyValue label="State" value={live ? 'streaming' : demoFeed ? 'demo feed' : cameraStatus.toLowerCase()} />
            <KeyValue label="Resolution" value={cameraInfo.width ? `${cameraInfo.width} × ${cameraInfo.height}` : '—'} mono />
            <KeyValue label="Delivered" value={live ? `${cameraFps || Math.round(cameraInfo.frameRate ?? 0)} fps` : '—'} mono />
            <KeyValue label="Device" value={cameraInfo.deviceId === 'DEMO-CAM-01' ? 'demo-cam-01' : (cameraDeviceId || 'default')} mono />
            <KeyValue label="Frames kept" value={`${cameraCaptures.length} / 12`} mono />
            {cameraError ? (
              <>
                <Divider className="my-1.5" />
                <p className="text-[9px] leading-snug text-elevated">{cameraError}</p>
              </>
            ) : null}
            {cameraNotice && !cameraError ? (
              <>
                <Divider className="my-1.5" />
                <p className="text-[9px] leading-snug text-ink-dim">{cameraNotice}</p>
              </>
            ) : null}
            <Divider className="my-1.5" />
            <Button
              size="xs"
              variant="ghost"
              icon={<RefreshCw size={9} />}
              block
              onClick={() => {
                void refreshCameras()
                setLinkNote(`${cameraDevices.length} video input(s) reported by the browser.`)
              }}
            >
              Rescan devices
            </Button>
            {linkNote ? <p className="mt-1 text-[9px] text-ink-dim">{linkNote}</p> : null}
          </FrameBody>
        </Frame>

        <Frame className="shrink-0">
          <FrameHeader title="Machine link" subtitle="what the view is showing" />
          <div className="space-y-0.5 p-2.5">
            <KeyValue
              label="Detector"
              value={deviceState === 'CONNECTED' ? (signalState === 'UNKNOWN' ? 'connected' : signalState.toLowerCase()) : 'offline'}
            />
            <KeyValue label="Probe" value={scan ? probeLabel(scan.probe_type) : '—'} />
            <KeyValue label="Scan" value={scan ? scan.scan_name : 'none'} />
            <KeyValue label="Readings" value={String(scanMeasurements.length)} mono />
            <KeyValue
              label="Peak"
              value={summary?.max ? `${formatNumber(summary.max.signal_raw)} ${settings.acquisition.unit}` : '—'}
              mono
            />
            <KeyValue label="Last frame" value={formatTime(scanMeasurements[0]?.timestamp ?? null)} mono />
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
                    <img src={capture.data_url} alt={`Captured frame ${formatDateTime(capture.at)}`} className="block aspect-video w-full object-cover" />
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

      {/* ---------------- bottom strip: alignment + honest notes ---------------- */}
      <Frame className="min-h-[180px] xl:col-span-2 xl:min-h-0">
        <FrameHeader
          title="View alignment"
          subtitle="how the frame is mapped onto the board"
          icon={<Crosshair size={13} />}
          right={
            <Segmented
              size="xs"
              value={cameraOverlay}
              onChange={(v) => setCameraOverlay(v)}
              options={[
                { value: 'SURFACE', label: 'Field overlay' },
                { value: 'OFF', label: 'Board only' },
              ]}
            />
          }
        />
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 px-3 pb-2 max-lg:grid-cols-1">
          {[
            {
              title: '1 · Frame',
              body: live
                ? 'The live stream is sampled into the projection. Rotate the view to check the board sits square in frame.'
                : demoFeed
                  ? 'Demo Mode paints a synthetic board. Same projection code runs, but the picture is not a camera.'
                  : 'No stream open. The board below is drawn from the scan geometry alone — nothing is invented.',
            },
            {
              title: '2 · Texture',
              body: 'The board rectangle of the frame becomes the texture of a plane sized by the scan (mm). “Board crop” uses the centred region, “full frame” uses all of it.',
            },
            {
              title: '3 · Field',
              body: 'Measured cells are interpolated (IDW) into a sheet and draped over that plane. Only measured cells are data; the rest is marked as derived in every export.',
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
              ? 'Demo Mode is on — the camera picture and the field both come from the demo module.'
              : 'Camera picture is real. Field values come only from captured measurements.'}
          </span>
          <span className="text-[9.5px] text-ink-dim">frames never leave this browser</span>
        </FrameFooter>
      </Frame>

    </div>
  )
}

