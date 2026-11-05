import { useEffect, useRef, useState, type RefObject } from 'react'
import { CameraOff, Cpu, Loader2, ShieldAlert, Video } from 'lucide-react'
import { useApp } from '../store/app'
import { Badge, cn } from './ui'
import { sampleFrameRate } from '../lib/camera'
import { useDemoFeedPainter } from './useDemoFeed'

/**
 * The viewfinder.
 *
 * Exactly one source is shown at a time, and it is always labelled:
 *
 *  1. `ESP32`  — a decoded JPEG from the module (the normal case)
 *  2. `CAMERA` — a browser MediaStream, when no module is attached
 *  3. `DEMO`   — a painted board, only while Demo Mode is on
 *  4. nothing  — a black frame that states why there is no picture
 *
 * Frames are painted into a canvas rather than swapped into an `<img>`, so a
 * 12 fps module stream does not flicker or tear between decodes.
 */
export function CameraView({
  videoRef,
  demoCanvasRef,
  className,
}: {
  videoRef: RefObject<HTMLVideoElement | null>
  demoCanvasRef: RefObject<HTMLCanvasElement | null>
  className?: string
}) {
  const {
    cameraStatus,
    cameraError,
    cameraStream,
    cameraInfo,
    cameraFps,
    demoMode,
    esp32Frame,
    esp32Link,
    esp32Config,
    setCameraFps,
    startCamera,
    connectEsp32,
  } = useApp()

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [painted, setPainted] = useState<string | null>(null)
  const [decodeError, setDecodeError] = useState<string | null>(null)

  const esp32Live = Boolean(esp32Frame) && (esp32Link === 'STREAMING' || esp32Link === 'STALLED')
  const usbLive = cameraStatus === 'LIVE' && Boolean(cameraStream)
  const demoFeed = demoMode && !esp32Live && !usbLive
  const source: 'ESP32' | 'USB' | 'DEMO' | 'NONE' = esp32Live
    ? 'ESP32'
    : usbLive
      ? 'USB'
      : demoFeed
        ? 'DEMO'
        : 'NONE'
  const busy = cameraStatus === 'REQUESTING' || esp32Link === 'CONNECTING'

  useDemoFeedPainter(demoCanvasRef, demoFeed, { widthMm: 60, heightMm: 40 })

  /* ---- ESP32 frames: decode once, paint into the canvas ---- */
  useEffect(() => {
    if (!esp32Live || !esp32Frame) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (cancelled) return
      imageRef.current = image
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      if (canvas.width !== image.naturalWidth || canvas.height !== image.naturalHeight) {
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
      }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0)
      setDecodeError(null)
      setPainted(esp32Frame.frame_id)
    }
    image.onerror = () => {
      if (!cancelled) setDecodeError('A frame from the module could not be decoded.')
    }
    image.src = esp32Frame.data_url
    return () => {
      cancelled = true
    }
  }, [esp32Frame, esp32Live])

  /* ---- browser camera stream ---- */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (usbLive && cameraStream) {
      el.srcObject = cameraStream
      const played = el.play?.()
      if (played && typeof played.catch === 'function') played.catch(() => {})
    } else if (el.srcObject) {
      el.srcObject = null
    }
  }, [usbLive, cameraStream, videoRef])

  useEffect(() => {
    const el = videoRef.current
    if (!el || !usbLive) {
      setCameraFps(0)
      return
    }
    const stop = sampleFrameRate(el, (fps) => setCameraFps(Math.round(fps)))
    return stop
  }, [usbLive, cameraStream, setCameraFps, videoRef])

  const moduleSize =
    esp32Frame?.width && esp32Frame?.height ? `${esp32Frame.width}×${esp32Frame.height}` : null
  const usbSize = cameraInfo.width && cameraInfo.height ? `${cameraInfo.width}×${cameraInfo.height}` : null
  const fps = source === 'ESP32' ? esp32Frame?.fps ?? 0 : source === 'USB' ? cameraFps : 0
  const stalled = esp32Link === 'STALLED' && source === 'ESP32'

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-[8px] bg-black', className)}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={cn(
          'absolute inset-0 h-full w-full object-contain transition-opacity duration-200',
          source === 'USB' ? 'opacity-100' : 'opacity-0',
        )}
      />
      <canvas
        ref={canvasRef}
        className={cn(
          'absolute inset-0 h-full w-full object-contain transition-opacity duration-200',
          source === 'ESP32' ? 'opacity-100' : 'opacity-0',
        )}
        aria-label="Live frame from the ESP32-CAM"
      />
      <canvas
        ref={demoCanvasRef}
        width={960}
        height={600}
        className={cn(
          'absolute inset-0 h-full w-full object-contain transition-opacity duration-200',
          source === 'DEMO' ? 'opacity-100' : 'opacity-0',
        )}
      />

      {source === 'NONE' ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="absolute inset-0 opacity-50" aria-hidden>
            <div className="absolute inset-x-0 top-1/2 h-px bg-white/[0.06]" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-white/[0.06]" />
          </div>
          <span className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
            {busy ? (
              <Loader2 size={15} className="animate-spin text-ink-muted" />
            ) : cameraStatus === 'DENIED' ? (
              <ShieldAlert size={15} className="text-elevated" />
            ) : (
              <CameraOff size={15} className="text-ink-dim" />
            )}
          </span>
          <div className="relative text-[11.5px] font-medium text-ink-muted">
            {busy
              ? esp32Link === 'CONNECTING'
                ? 'Connecting to the module…'
                : 'Requesting camera…'
              : 'No picture'}
          </div>
          <p className="relative max-w-[320px] text-[10px] leading-relaxed text-ink-dim">
            {cameraError ??
              'The view stays black until the ESP32-CAM delivers a frame. Enter the module address or use a browser camera — nothing here is simulated.'}
          </p>
          <div className="relative mt-1 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void connectEsp32()}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-3 text-[10.5px] font-medium text-teal transition-colors hover:bg-teal/20"
            >
              <Cpu size={11} /> Connect module
            </button>
            <button
              type="button"
              onClick={() => void startCamera()}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-3 text-[10.5px] font-medium text-ink-muted transition-colors hover:text-ink"
            >
              <Video size={11} /> Use camera
            </button>
          </div>
          <p className="relative text-[9px] text-ink-dim/80">module at {esp32Config.host}</p>
        </div>
      ) : null}

      {source !== 'NONE' ? (
        <>
          <div className="pointer-events-none absolute inset-3" aria-hidden>
            <Corner className="top-0 left-0 border-t border-l" />
            <Corner className="top-0 right-0 border-t border-r" />
            <Corner className="bottom-0 left-0 border-b border-l" />
            <Corner className="bottom-0 right-0 border-b border-r" />
          </div>
          <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1.5">
            {source === 'ESP32' ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border bg-black/60 px-2 py-[3px] text-[9px] font-semibold tracking-[0.12em] backdrop-blur',
                  stalled ? 'border-elevated/60 text-elevated' : 'border-strong/55 text-strong',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    stalled ? 'bg-elevated' : 'animate-pulse-soft bg-strong',
                  )}
                />
                {stalled ? 'STALLED' : 'ESP32-CAM'}
              </span>
            ) : source === 'USB' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-strong/55 bg-black/60 px-2 py-[3px] text-[9px] font-semibold tracking-[0.12em] text-strong backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-strong" /> USB CAMERA
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-elevated/55 bg-black/60 px-2 py-[3px] text-[9px] font-semibold tracking-[0.12em] text-elevated backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-elevated" /> DEMO CAMERA
              </span>
            )}
            {source === 'ESP32' && esp32Frame ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-[3px] text-[9px] text-ink-muted backdrop-blur">
                frame #{esp32Frame.seq ?? '—'}
              </span>
            ) : null}
          </div>
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 text-[9.5px] text-ink-muted">
            <span className="rounded border border-white/10 bg-black/55 px-1.5 py-[2px] tabular backdrop-blur">
              {source === 'ESP32' ? (moduleSize ?? 'decoding') : source === 'USB' ? (usbSize ?? '—') : '960×600'}
            </span>
            <span className="rounded border border-white/10 bg-black/55 px-1.5 py-[2px] tabular backdrop-blur">
              {fps > 0 ? `${fps.toFixed(0)} fps` : source === 'DEMO' ? 'demo' : '— fps'}
            </span>
            {source === 'ESP32' && esp32Frame ? (
              <span className="rounded border border-white/10 bg-black/55 px-1.5 py-[2px] tabular backdrop-blur">
                {(esp32Frame.bytes / 1024).toFixed(1)} kB
              </span>
            ) : null}
          </div>
          {decodeError ? (
            <div className="absolute right-2.5 bottom-2.5">
              <Badge tone="danger">{decodeError}</Badge>
            </div>
          ) : null}
          {source === 'DEMO' ? (
            <div className="absolute right-2.5 bottom-2.5">
              <Badge tone="warn">synthetic feed</Badge>
            </div>
          ) : null}
        </>
      ) : null}

      {/* `painted` tracks the last decoded frame id; surfaced for diagnostics. */}
      <span className="sr-only" aria-live="off">
        {painted ? `frame ${painted} painted` : 'no frame painted'}
      </span>
    </div>
  )
}

function Corner({ className }: { className?: string }) {
  return <span className={cn('absolute h-4 w-4 border-teal/45', className)} />
}
