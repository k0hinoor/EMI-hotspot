import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Move3d, RotateCcw, ScanSearch } from 'lucide-react'
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
 * 3D reconstruction of the board.
 *
 * Preference order for the texture — the same order the viewfinder uses, so the
 * two panels always agree on what the machine is looking at:
 *
 *   1. the last frame decoded from the **ESP32-CAM**
 *   2. the browser camera stream
 *   3. the demo board (Demo Mode only)
 *   4. no texture at all — a bare wireframe sized from the scan
 *
 * The projection, relief and camera are the same in every case, so the geometry
 * never depends on which camera happens to be attached.
 */
export function ReconstructionView({ className }: { className?: string }) {
  const scans = useApp((s) => s.scans)
  const measurements = useApp((s) => s.measurements)
  const activeScanId = useApp((s) => s.activeScanId)
  const unit = useApp((s) => s.settings.acquisition.unit)
  const cameraStream = useApp((s) => s.cameraStream)
  const esp32Frame = useApp((s) => s.esp32Frame)
  const esp32Link = useApp((s) => s.esp32Link)
  const demoMode = useApp((s) => s.demoMode)
  const overlay = useApp((s) => s.cameraOverlay)
  const cropMode = useApp((s) => s.cameraCrop)
  const setCameraOverlay = useApp((s) => s.setCameraOverlay)
  const setCameraCrop = useApp((s) => s.setCameraCrop)

  const wrap = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const demoCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const moduleImage = useRef<HTMLImageElement | null>(null)
  const [camera, setCamera] = useState<SceneCamera>(DEFAULT_CAMERA)
  const [size, setSize] = useState({ width: 640, height: 320 })
  const [textureReady, setTextureReady] = useState(0)
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)

  const scan = scans.find((s) => s.scan_id === activeScanId) ?? scans[0] ?? null
  const scanMeasurements = useMemo(
    () => (scan ? measurementsForScan(measurements, scan.scan_id) : []),
    [measurements, scan],
  )

  const esp32Live = Boolean(esp32Frame) && (esp32Link === 'STREAMING' || esp32Link === 'STALLED')
  const usbLive = Boolean(cameraStream)

  /* Geometry + coverage straight from the measured cells. */
  const coverage: CoverageGrid | null = useMemo(() => {
    if (!scan) return null
    // Denser resampling than the dashboard surface: this panel has the pixels.
    const surface = buildSurface(scan, scanMeasurements, 48)
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

  /* ----- measure the panel ----- */
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: Math.max(240, rect.width), height: Math.max(180, rect.height) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /* ----- decode the module's latest frame as the texture ----- */
  useEffect(() => {
    if (!esp32Live || !esp32Frame) return
    let cancelled = false
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      if (cancelled) return
      moduleImage.current = image
      setTextureReady((n) => n + 1)
    }
    image.src = esp32Frame.data_url
    return () => {
      cancelled = true
    }
  }, [esp32Frame, esp32Live])

  /* ----- browser camera element ----- */
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
  }, [usbLive, cameraStream])

  /* ----- demo texture ----- */
  useDemoFeedPainter(demoCanvasRef, demoMode && !esp32Live && !usbLive, {
    widthMm: scan?.board_width_mm ?? 60,
    heightMm: scan?.board_height_mm ?? 40,
  })

  /* ----- redraw: on any change, and on a steady tick while a texture is live ----- */
  useEffect(() => {
    if (!esp32Live && !usbLive && !demoMode) return
    const id = window.setInterval(() => setTextureReady((n) => (n + 1) % 100000), 140)
    return () => window.clearInterval(id)
  }, [esp32Live, usbLive, demoMode])

  const crop: BoardCrop = cropMode === 'BOARD' ? DEFAULT_CROP : { x: 0, y: 0, w: 1, h: 1 }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    // Supersample: this is the panel the operator judges quality on.
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    canvas.width = Math.round(size.width * dpr)
    canvas.height = Math.round(size.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    let texture: SceneTexture | null = null
    if (esp32Live && moduleImage.current) {
      texture = {
        image: moduleImage.current,
        width: moduleImage.current.naturalWidth || esp32Frame?.width || 640,
        height: moduleImage.current.naturalHeight || esp32Frame?.height || 480,
        crop,
        brightness: 1,
      }
    } else if (usbLive && videoRef.current && videoRef.current.videoWidth > 0) {
      texture = {
        image: videoRef.current,
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
        crop,
        brightness: 1,
      }
    } else if (!esp32Live && !usbLive && demoMode && demoCanvasRef.current) {
      texture = {
        image: demoCanvasRef.current,
        width: demoCanvasRef.current.width || 960,
        height: demoCanvasRef.current.height || 600,
        crop,
        brightness: 1,
      }
    }

    drawScene(ctx, size, camera, {
      widthMm: scan?.board_width_mm ?? 60,
      heightMm: scan?.board_height_mm ?? 40,
      coverage: overlay === 'SURFACE' ? coverage : null,
      role: overlay === 'SURFACE' ? 'overlay' : 'board',
      texture,
      unit,
      peak: overlay === 'SURFACE' ? peak : null,
      note: texture ? (demoMode && !esp32Live && !usbLive ? 'DEMO TEXTURE' : null) : 'NO CAMERA — scan geometry only',
      relief: 0.16,
    })
  }, [
    size,
    camera,
    scan,
    coverage,
    unit,
    peak,
    overlay,
    crop,
    esp32Live,
    usbLive,
    demoMode,
    esp32Frame,
    textureReady,
  ])

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
          className="inline-flex h-5 items-center gap-1 rounded-full border border-line bg-white/[0.03] px-2 text-[9.5px] text-ink-dim hover:text-ink"
          title="Reset the orbit"
        >
          <RotateCcw size={9} /> reset
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
            yaw: drag.current!.yaw + dx * 0.009,
            pitch: Math.max(0.24, Math.min(1.42, drag.current!.pitch + dy * 0.005)),
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
          setCamera((prev) => ({ ...prev, zoom: Math.max(0.65, Math.min(2.1, prev.zoom - e.deltaY * 0.0013)) }))
        }}
      >
        <canvas
          ref={canvasRef}
          className="block h-full w-full rounded-[7px]"
          style={{ width: '100%', height: '100%' }}
          aria-label="3D reconstruction of the board, textured with the ESP32-CAM frame"
        />
        <span className="pointer-events-none absolute top-2 right-2 inline-flex items-center gap-1 rounded border border-white/10 bg-black/55 px-1.5 py-[2px] text-[9px] text-ink-dim backdrop-blur">
          <Move3d size={9} /> drag to orbit · wheel to zoom
        </span>
        {esp32Live ? (
          <span className="pointer-events-none absolute bottom-2 left-2 rounded border border-white/10 bg-black/55 px-1.5 py-[2px] text-[9px] text-ink-dim backdrop-blur">
            texture · ESP32-CAM frame #{esp32Frame?.seq ?? '—'}
          </span>
        ) : null}
      </div>

      {/* Off-screen sources. Never displayed: they exist to feed the projection. */}
      <video ref={videoRef} muted playsInline className="hidden" aria-hidden />
      <canvas ref={demoCanvasRef} width={960} height={600} className="hidden" aria-hidden />
    </div>
  )
}
