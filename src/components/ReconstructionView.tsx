import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, RotateCcw, ScanSearch } from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  drawScene,
  DEFAULT_CAMERA,
  DEFAULT_CROP,
  type BoardCrop,
  type CoverageGrid,
  type SceneCamera,
  type SceneTexture,
} from '../lib/scene'
import { buildSurface, peakCell } from '../lib/surface'
import { cn } from './ui'
import { useDemoFeedPainter } from './useDemoFeed'

/**
 * Reconstruction panel: the same board, projected in 3D.
 *
 * The camera frame is the texture of the board plane; captured EMI readings are
 * draped over it as a surface. With no camera the board is a bare wireframe — the
 * geometry comes from the scan, so nothing fabricated is ever shown.
 */
export function ReconstructionView({ className }: { className?: string }) {
  const scans = useApp((s) => s.scans)
  const measurements = useApp((s) => s.measurements)
  const activeScanId = useApp((s) => s.activeScanId)
  const unit = useApp((s) => s.settings.acquisition.unit)
  const cameraStream = useApp((s) => s.cameraStream)
  const cameraIsDemo = useApp((s) => s.cameraIsDemo)
  const demoMode = useApp((s) => s.demoMode)
  const overlay = useApp((s) => s.cameraOverlay)
  const cropMode = useApp((s) => s.cameraCrop)
  const setCameraOverlay = useApp((s) => s.setCameraOverlay)
  const setCameraCrop = useApp((s) => s.setCameraCrop)

  const wrap = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const demoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [camera, setCamera] = useState<SceneCamera>(DEFAULT_CAMERA)
  const [size, setSize] = useState({ width: 640, height: 300 })
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)
  /** Redraw driver: the texture is a video, so the projection needs a tick. */
  const [tick, setTick] = useState(0)

  const scan = scans.find((s) => s.scan_id === activeScanId) ?? scans[0] ?? null
  const scanMeasurements = useMemo(
    () => (scan ? measurementsForScan(measurements, scan.scan_id) : []),
    [measurements, scan],
  )

  /* Geometry + coverage straight from the measured cells. */
  const coverage: CoverageGrid | null = useMemo(() => {
    if (!scan) return null
    const surface = buildSurface(scan, scanMeasurements, 40)
    if (surface.measured === 0) return null
    return {
      cols: surface.cols,
      rows: surface.rows,
      values: surface.values,
      min: surface.min,
      max: surface.max,
      measured: surface.measured,
      interpolated: surface.interpolated,
    }
  }, [scan, scanMeasurements])

  const peak = useMemo(() => {
    if (!scan || !coverage) return null
    const cell = peakCell(coverage)
    return {
      xMm: (cell.col / Math.max(1, coverage.cols - 1)) * scan.board_width_mm,
      yMm: (cell.row / Math.max(1, coverage.rows - 1)) * scan.board_height_mm,
      value: cell.value,
    }
  }, [scan, coverage])

  /* ----- source elements: geometry never changes when the camera does ----- */
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: Math.max(220, rect.width), height: Math.max(160, rect.height) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /* Mirror the live camera into this panel's own hidden <video>. */
  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (cameraStream) {
      el.srcObject = cameraStream
      const played = el.play?.()
      if (played && typeof played.catch === 'function') played.catch(() => {})
    } else if (el.srcObject) {
      el.srcObject = null
    }
  }, [cameraStream])

  /* Demo feed: the same painted frame, so the projection has a texture. */
  useDemoFeedPainter(demoCanvasRef, demoMode && !cameraStream, {
    widthMm: scan?.board_width_mm ?? 60,
    heightMm: scan?.board_height_mm ?? 40,
  })

  const crop: BoardCrop = cropMode === 'BOARD' ? DEFAULT_CROP : { x: 0, y: 0, w: 1, h: 1 }
  const hasCamera = Boolean(cameraStream) || demoMode

  useEffect(() => {
    if (!cameraStream && !demoMode) return
    const id = window.setInterval(() => setTick((t) => (t + 1) % 1000), 120)
    return () => window.clearInterval(id)
  }, [cameraStream, demoMode])

  /* Copy the source into an offscreen canvas so drawImage is always synchronous. */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size.width * dpr
    canvas.height = size.height * dpr
    canvas.style.width = `${size.width}px`
    canvas.style.height = `${size.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let source: SceneTexture | null = null
    if (cameraStream && videoRef.current && videoRef.current.videoWidth > 0) {
      source = {
        image: videoRef.current,
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
        crop,
        brightness: 0.82,
      }
    } else if (!cameraStream && demoMode && demoCanvasRef.current) {
      source = {
        image: demoCanvasRef.current,
        width: demoCanvasRef.current.width,
        height: demoCanvasRef.current.height,
        crop,
        brightness: 0.82,
      }
    }

    drawScene(
      ctx,
      size,
      camera,
      {
        widthMm: scan?.board_width_mm ?? 60,
        heightMm: scan?.board_height_mm ?? 40,
        coverage,
        role: overlay === 'SURFACE' ? 'overlay' : 'board',
        texture: source,
        unit,
        peak,
        note: !hasCamera
          ? 'NO CAMERA — frame from scan geometry'
          : cameraIsDemo
            ? 'DEMO TEXTURE'
            : null,
      },
    )
  }, [size, camera, scan, coverage, unit, peak, overlay, crop, hasCamera, cameraStream, demoMode, cameraIsDemo, tick])

  return (
    <div className={cn('relative flex h-full min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-1.5 px-1 pb-1">
        <button
          type="button"
          onClick={() => setCameraOverlay(overlay === 'SURFACE' ? 'OFF' : 'SURFACE')}
          className={cn(
            'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[9.5px] transition-colors',
            overlay === 'SURFACE'
              ? 'border-teal/45 bg-teal/12 text-teal'
              : 'border-line bg-white/[0.03] text-ink-dim hover:text-ink-muted',
          )}
          title="Drape the measured coverage over the board"
        >
          <ScanSearch size={9} /> field overlay
        </button>
        <button
          type="button"
          onClick={() => setCameraCrop(cropMode === 'BOARD' ? 'FULL' : 'BOARD')}
          className="inline-flex h-5 items-center gap-1 rounded-full border border-line bg-white/[0.03] px-2 text-[9.5px] text-ink-dim transition-colors hover:text-ink-muted"
          title="Use the whole camera frame or just the board region as texture"
        >
          <Box size={9} /> {cropMode === 'BOARD' ? 'board crop' : 'full frame'}
        </button>
        <span className="ml-auto flex items-center gap-1.5 text-[9.5px] text-ink-dim">
          <span className="h-1.5 w-12 rounded-full bg-gradient-to-r from-[#2653b0] via-[#35e5c5] to-[#ff5a6e]" />
          {coverage ? `${Math.round(coverage.min)}–${Math.round(coverage.max)} ${unit}` : 'no surface'}
        </span>
        <button
          type="button"
          onClick={() => setCamera(DEFAULT_CAMERA)}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-white/[0.03] text-ink-dim hover:text-ink"
          title="Reset view"
        >
          <RotateCcw size={9} />
        </button>
      </div>

      <div
        ref={wrap}
        className="relative min-h-0 flex-1 cursor-grab rounded-[8px] border border-white/[0.07] active:cursor-grabbing"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, yaw: camera.yaw, pitch: camera.pitch }
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const dx = e.clientX - drag.current.x
          const dy = e.clientY - drag.current.y
          setCamera((prev) => ({
            ...prev,
            yaw: drag.current!.yaw + dx * 0.008,
            pitch: Math.max(0.28, Math.min(1.35, drag.current!.pitch + dy * 0.005)),
          }))
        }}
        onPointerUp={() => {
          drag.current = null
        }}
        onPointerLeave={() => {
          drag.current = null
        }}
        onWheel={(e) => {
          e.preventDefault()
          setCamera((prev) => ({ ...prev, zoom: Math.max(0.6, Math.min(2, prev.zoom - e.deltaY * 0.0012)) }))
        }}
      >
        <canvas ref={canvasRef} className="block h-full w-full rounded-[7px]" aria-label="3D reconstruction of the board from the camera frame" />
        <span className="pointer-events-none absolute top-2 right-2 rounded border border-white/10 bg-black/50 px-1.5 py-[2px] text-[9px] text-ink-dim backdrop-blur">
          drag to orbit · wheel to zoom
        </span>
      </div>

      {/* Off-screen sources. Never displayed: they exist to feed the projection. */}
      <video ref={videoRef} muted playsInline className="hidden" aria-hidden />
      <canvas ref={demoCanvasRef} width={960} height={600} className="hidden" aria-hidden />
    </div>
  )
}

