import { useEffect, type RefObject } from 'react'
import { Camera, CameraOff, Loader2, ShieldAlert, Video } from 'lucide-react'
import { useApp } from '../store/app'
import { Badge, cn } from './ui'
import { sampleFrameRate } from '../lib/camera'
import { useDemoFeedPainter } from './useDemoFeed'

/**
 * The camera viewfinder.
 *
 * Renders exactly one source at a time: the real MediaStream from the store, the
 * demo canvas feed, or — when neither exists — a black frame that states *why*
 * there is no picture. The element refs are owned by the page so the
 * reconstruction panel can sample the same texture.
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
    setCameraFps,
    startCamera,
    cameraDevices,
  } = useApp()

  const live = cameraStatus === 'LIVE' && Boolean(cameraStream)
  const demoFeed = demoMode && !live
  const busy = cameraStatus === 'REQUESTING'
  const board = { widthMm: 60, heightMm: 40 }
  useDemoFeedPainter(demoCanvasRef, demoFeed, board)

  /* Attach / detach the real stream. Kept here so the <video> is never orphaned. */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (live && cameraStream) {
      el.srcObject = cameraStream
      const played = el.play?.()
      if (played && typeof played.catch === 'function') played.catch(() => {})
    } else if (el.srcObject) {
      el.srcObject = null
    }
  }, [live, cameraStream, videoRef])

  /* Measured delivery rate — reported, never assumed. */
  useEffect(() => {
    const el = videoRef.current
    if (!el || !live) {
      setCameraFps(0)
      return
    }
    const stop = sampleFrameRate(el, (fps) => setCameraFps(Math.round(fps)))
    return stop
  }, [live, cameraStream, setCameraFps, videoRef])

  const resolution =
    cameraInfo.width && cameraInfo.height ? `${cameraInfo.width}×${cameraInfo.height}` : null

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-[8px] bg-black', className)}>
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={cn(
          'absolute inset-0 h-full w-full object-contain transition-opacity duration-300',
          live ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Demo feed: a painted canvas, stamped DEMO CAMERA by the renderer. */}
      <canvas
        ref={demoCanvasRef}
        width={960}
        height={600}
        className={cn(
          'absolute inset-0 h-full w-full object-contain transition-opacity duration-300',
          demoFeed ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* No picture: state the reason rather than showing an empty rectangle. */}
      {!live && !demoFeed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="absolute inset-0 opacity-[0.5]" aria-hidden>
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
              ? 'Requesting camera…'
              : cameraStatus === 'DENIED'
                ? 'Camera permission refused'
                : cameraStatus === 'NO_DEVICE'
                  ? 'No camera detected'
                  : cameraStatus === 'BUSY'
                    ? 'Camera is in use'
                    : 'Camera is off'}
          </div>
          <p className="relative max-w-[300px] text-[10px] leading-relaxed text-ink-dim">
            {cameraError ??
              'Point the camera at the machine or PCB. No picture is simulated here — the view stays black until a real camera delivers frames.'}
          </p>
          <button
            type="button"
            onClick={() => void startCamera()}
            className="relative mt-1 inline-flex h-7 items-center gap-1.5 rounded-full border border-teal/40 bg-teal/10 px-3 text-[10.5px] font-medium text-teal transition-colors hover:bg-teal/20"
          >
            <Video size={11} /> {busy ? 'Opening…' : 'Use camera'}
          </button>
          {cameraDevices.length > 1 ? (
            <p className="relative text-[9.5px] text-ink-dim/80">{cameraDevices.length} cameras available</p>
          ) : null}
        </div>
      ) : null}

      {/* HUD */}
      {live || demoFeed ? (
        <>
          <div className="pointer-events-none absolute inset-3" aria-hidden>
            <Corner className="top-0 left-0 border-t border-l" />
            <Corner className="top-0 right-0 border-t border-r" />
            <Corner className="bottom-0 left-0 border-b border-l" />
            <Corner className="bottom-0 right-0 border-b border-r" />
          </div>
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            {demoFeed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-elevated/50 bg-black/55 px-2 py-[3px] text-[9px] font-semibold tracking-[0.14em] text-elevated backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-elevated" /> DEMO CAMERA
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-strong/50 bg-black/55 px-2 py-[3px] text-[9px] font-semibold tracking-[0.14em] text-strong backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-strong" /> LIVE
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/55 px-2 py-[3px] text-[9px] text-ink-muted backdrop-blur">
              <Camera size={9} /> {cameraInfo.deviceId === 'DEMO-CAM-01' ? 'demo-cam-01' : 'video input'}
            </span>
          </div>
          <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 text-[9.5px] text-ink-muted">
            <span className="rounded border border-white/10 bg-black/55 px-1.5 py-[2px] backdrop-blur">
              {demoFeed ? '960×600' : (resolution ?? '—')}
            </span>
            <span className="rounded border border-white/10 bg-black/55 px-1.5 py-[2px] tabular backdrop-blur">
              {demoFeed ? 'demo' : `${cameraFps || Math.round(cameraInfo.frameRate ?? 0)} fps`}
            </span>
          </div>
        </>
      ) : null}

      {demoFeed ? (
        <div className="absolute right-2.5 bottom-2.5">
          <Badge tone="warn">synthetic feed</Badge>
        </div>
      ) : null}
    </div>
  )
}

function Corner({ className }: { className?: string }) {
  return <span className={cn('absolute h-4 w-4 border-teal/45', className)} />
}
