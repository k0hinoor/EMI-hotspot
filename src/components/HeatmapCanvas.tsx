import { useEffect, useRef, useState } from 'react'
import { buildHeatmapView, cellAtPoint, drawHeatmap, plotRect, type HeatmapView } from '../lib/heatmap'
import type { Measurement, Scan } from '../lib/types'

export function HeatmapCanvas({
  scan,
  measurements,
  selected,
  interpolate,
  onSelect,
  scaleMax,
  height = 460,
  onCanvasReady,
}: {
  scan: Scan
  measurements: Measurement[]
  selected: { col: number; row: number } | null
  interpolate: boolean
  onSelect: (cell: { col: number; row: number } | null) => void
  scaleMax?: number
  height?: number
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ width: 720, height })
  const [hovered, setHovered] = useState<{ col: number; row: number } | null>(null)
  const viewRef = useRef<HeatmapView | null>(null)

  useEffect(() => {
    onCanvasReady?.(canvasRef.current)
    return () => onCanvasReady?.(null)
  }, [onCanvasReady])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect()
      setSize({ width: Math.max(320, rect.width), height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [height])

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

    const view = buildHeatmapView(scan, measurements, scaleMax)
    viewRef.current = view
    drawHeatmap(ctx, size.width, size.height, scan, view, {
      selected,
      interpolate,
      hovered,
    })
  }, [scan, measurements, selected, interpolate, size, hovered, scaleMax])

  const toCell = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    const view = viewRef.current
    if (!view) return null
    const plot = plotRect(size.width, size.height, scan)
    return cellAtPoint(view, px, py, plot)
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        className="block w-full cursor-crosshair rounded-[8px]"
        style={{ height }}
        onMouseMove={(e) => setHovered(toCell(e))}
        onMouseLeave={() => setHovered(null)}
        onClick={(e) => {
          const cell = toCell(e)
          if (!cell) return
          if (selected && selected.col === cell.col && selected.row === cell.row) onSelect(null)
          else onSelect(cell)
        }}
        role="img"
        aria-label={`Heatmap of ${scan.scan_name}, ${scan.board_width_mm} by ${scan.board_height_mm} millimetres`}
      />
    </div>
  )
}
