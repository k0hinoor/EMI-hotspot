import { useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { buildSurface, drawSurface, type SurfaceCamera } from '../lib/surface'
import { measurementsForScan, useApp } from '../store/app'
import { cn } from './ui'
import type { Measurement, Scan } from '../lib/types'

const DEFAULTS: SurfaceCamera = { yaw: -0.62, pitch: 0.92, zoom: 1 }

/**
 * 3D topology of the measured field. Direct measurements drive the mesh; the
 * space between them is interpolated (IDW) and the badge states how much of the
 * surface is inferred, so the render is never mistaken for raw data.
 */
export function TopologySurface({
  scan,
  measurements,
  unit,
  height,
  className,
}: {
  scan: Scan
  measurements: Measurement[]
  unit: string
  height?: string
  className?: string
}) {
  const wrap = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [camera, setCamera] = useState<SurfaceCamera>(DEFAULTS)
  const [size, setSize] = useState({ width: 640, height: 260 })
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null)

  const model = useMemo(() => buildSurface(scan, measurements), [scan, measurements])

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: Math.max(220, rect.width), height: Math.max(150, rect.height) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
    drawSurface(ctx, size.width, size.height, model, camera, {
      unit,
      xLabel: 'X',
      yLabel: 'Y',
    })
  }, [model, camera, size, unit])

  return (
    <div
      ref={wrap}
      className={cn('relative h-full w-full cursor-grab active:cursor-grabbing', className)}
      style={height ? { height } : undefined}
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
          pitch: Math.max(0.35, Math.min(1.25, drag.current!.pitch + dy * 0.005)),
        }))
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerLeave={() => {
        drag.current = null
      }}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="3D topology of measured signal" />
      <button
        type="button"
        onClick={() => setCamera(DEFAULTS)}
        className="absolute right-2 bottom-2 flex h-6 items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2 text-[9px] text-ink-dim backdrop-blur transition-colors hover:text-ink"
        title="Reset view"
      >
        <RotateCcw size={9} /> reset view
      </button>
    </div>
  )
}

/** Convenience wrapper that resolves the active scan from the store. */
export function TopologyForScan({ unit, className }: { unit: string; className?: string }) {
  const scans = useApp((s) => s.scans)
  const measurements = useApp((s) => s.measurements)
  const activeScanId = useApp((s) => s.activeScanId)
  const scan = scans.find((s) => s.scan_id === activeScanId) ?? scans[0] ?? null

  if (!scan) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center px-6 text-center', className)}>
        <div className="text-[11.5px] font-medium text-ink-muted">No scan to map</div>
        <p className="mt-1 max-w-[240px] text-[10px] leading-relaxed text-ink-dim">
          Create a scan and capture readings — the surface is built from measured cells only.
        </p>
      </div>
    )
  }

  const ms = measurementsForScan(measurements, scan.scan_id)
  if (ms.length === 0) {
    return (
      <div className={cn('flex h-full flex-col items-center justify-center px-6 text-center', className)}>
        <div className="text-[11.5px] font-medium text-ink-muted">Surface is empty</div>
        <p className="mt-1 max-w-[260px] text-[10px] leading-relaxed text-ink-dim">
          {scan.scan_name} has no captured readings yet. The topology appears once cells hold real measurements.
        </p>
      </div>
    )
  }

  return <TopologySurface scan={scan} measurements={ms} unit={unit} className={className} />
}
