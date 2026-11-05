import { cellCoordinate, gridGeometry, normalise, rampColor } from './derive'
import type { Measurement, Scan } from './types'

export interface HeatmapView {
  /** Cells that hold a direct measurement (latest per coordinate). */
  cells: (Measurement | null)[][]
  geometry: ReturnType<typeof gridGeometry>
  scaleMax: number
  scaleMin: number
}

/** Builds the grid view for a scan. Unmeasured cells stay null — never filled in. */
export function buildHeatmapView(scan: Scan, measurements: Measurement[], forcedMax?: number): HeatmapView {
  const geometry = gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm)
  const cells: (Measurement | null)[][] = Array.from({ length: geometry.rows }, () =>
    Array.from({ length: geometry.cols }, () => null),
  )

  const countable: number[] = []
  // Oldest first so the newest reading of a cell wins, and superseded readings
  // never occupy a cell — the displayed value must be the current measurement.
  const ordered = [...measurements].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
  for (const m of ordered) {
    if (m.acquisition_metadata.superseded_by) continue
    if (m.x_mm === null || m.y_mm === null) continue
    const col = Math.min(geometry.cols - 1, Math.max(0, Math.floor(m.x_mm / geometry.cellWidth)))
    // Stored Y is in board coordinates; convert to a row index for either origin.
    const rowFromTop =
      scan.origin === 'TOP_LEFT'
        ? Math.floor(m.y_mm / geometry.cellHeight)
        : Math.floor((scan.board_height_mm - m.y_mm) / geometry.cellHeight)
    const row = Math.min(geometry.rows - 1, Math.max(0, rowFromTop))
    cells[row][col] = m
    if (m.quality_status === 'VALID' || m.quality_status === 'UNSTABLE') countable.push(m.signal_raw)
  }

  const max = forcedMax ?? (countable.length ? Math.max(...countable) : 1)
  return { cells, geometry, scaleMax: max, scaleMin: 0 }
}

export function cellAtPoint(
  view: HeatmapView,
  px: number,
  py: number,
  plot: { x: number; y: number; w: number; h: number },
): { col: number; row: number } | null {
  if (px < plot.x || py < plot.y || px > plot.x + plot.w || py > plot.y + plot.h) return null
  const col = Math.floor(((px - plot.x) / plot.w) * view.geometry.cols)
  const row = Math.floor(((py - plot.y) / plot.h) * view.geometry.rows)
  if (col < 0 || row < 0 || col >= view.geometry.cols || row >= view.geometry.rows) return null
  return { col, row }
}

export function plotRect(width: number, height: number, scan: Scan) {
  const margin = { left: 44, right: 14, top: 14, bottom: 30 }
  const available = {
    w: Math.max(10, width - margin.left - margin.right),
    h: Math.max(10, height - margin.top - margin.bottom),
  }
  const boardAspect = scan.board_width_mm / scan.board_height_mm
  let w = available.w
  let h = w / boardAspect
  if (h > available.h) {
    h = available.h
    w = h * boardAspect
  }
  const x = margin.left + (available.w - w) / 2
  const y = margin.top + (available.h - h) / 2
  return { x, y, w, h, margin }
}

export interface DrawOptions {
  selected: { col: number; row: number } | null
  interpolate: boolean
  hovered?: { col: number; row: number } | null
  showAxis?: boolean
  fontFamily?: string
}

/** Inverse-distance-weighted estimate, drawn only as a clearly derived overlay. */
function interpolateAt(view: HeatmapView, col: number, row: number): number | null {
  const points: { c: number; r: number; v: number }[] = []
  view.cells.forEach((line, r) =>
    line.forEach((m, c) => {
      if (m && (m.quality_status === 'VALID' || m.quality_status === 'UNSTABLE')) points.push({ c, r, v: m.signal_raw })
    }),
  )
  if (points.length < 3) return null
  let wsum = 0
  let vsum = 0
  for (const p of points) {
    const d2 = (p.c - col) ** 2 + (p.r - row) ** 2
    if (d2 === 0) return p.v
    const w = 1 / d2
    wsum += w
    vsum += w * p.v
  }
  return wsum > 0 ? vsum / wsum : null
}

export function drawHeatmap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scan: Scan,
  view: HeatmapView,
  options: DrawOptions,
): { x: number; y: number; w: number; h: number } {
  const { cols, rows } = view.geometry
  const plot = plotRect(width, height, scan)
  const { x, y, w, h } = plot
  const cw = w / cols
  const ch = h / rows
  const font = options.fontFamily ?? 'JetBrains Mono Variable, ui-monospace, monospace'

  ctx.clearRect(0, 0, width, height)

  // Board background: unmeasured area is visibly empty, not a fabricated heatmap.
  ctx.fillStyle = '#0B0E17'
  ctx.fillRect(x, y, w, h)

  // Derived (interpolated) surface, drawn first and visually distinguished.
  if (options.interpolate) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (view.cells[r][c]) continue
        const v = interpolateAt(view, c, r)
        if (v === null) continue
        ctx.globalAlpha = 0.22
        ctx.fillStyle = rampColor(normalise(v, view.scaleMin, view.scaleMax))
        ctx.fillRect(x + c * cw, y + r * ch, cw, ch)
        ctx.globalAlpha = 1
        // Diagonal hatch marks the region as derived.
        ctx.strokeStyle = 'rgba(255,255,255,0.055)'
        ctx.lineWidth = 1
        ctx.beginPath()
        const step = 7
        for (let o = -ch; o < cw; o += step) {
          ctx.moveTo(x + c * cw + o, y + (r + 1) * ch)
          ctx.lineTo(x + c * cw + o + ch, y + r * ch)
        }
        ctx.stroke()
      }
    }
  }

  // Measured cells.
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const m = view.cells[r][c]
      const cx = x + c * cw
      const cy = y + r * ch
      const pad = Math.min(1.2, cw * 0.06)
      if (!m) {
        // Vacuum: faint pin dot so cells read as coordinates, not data.
        ctx.fillStyle = 'rgba(255,255,255,0.045)'
        ctx.beginPath()
        ctx.arc(cx + cw / 2, cy + ch / 2, Math.max(1, Math.min(2.2, cw * 0.08)), 0, Math.PI * 2)
        ctx.fill()
        continue
      }

      const invalid = m.quality_status === 'INVALID'
      const t = normalise(m.signal_raw, view.scaleMin, view.scaleMax)
      if (invalid) {
        ctx.fillStyle = '#171C2A'
      } else {
        ctx.fillStyle = rampColor(t, m.quality_status === 'UNSTABLE' ? 0.72 : 0.95)
      }
      ctx.fillRect(cx + pad, cy + pad, cw - pad * 2, ch - pad * 2)

      // Non-colour status encoding (PRD §5.2).
      if (invalid) {
        ctx.strokeStyle = 'rgba(239,68,68,0.55)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx + pad + 2, cy + pad + 2)
        ctx.lineTo(cx + cw - pad - 2, cy + ch - pad - 2)
        ctx.moveTo(cx + cw - pad - 2, cy + pad + 2)
        ctx.lineTo(cx + pad + 2, cy + ch - pad - 2)
        ctx.stroke()
      } else if (m.quality_status === 'SATURATED') {
        ctx.strokeStyle = '#EF4444'
        ctx.lineWidth = 1.4
        ctx.strokeRect(cx + pad + 0.7, cy + pad + 0.7, cw - pad * 2 - 1.4, ch - pad * 2 - 1.4)
      } else if (m.quality_status === 'UNSTABLE') {
        ctx.strokeStyle = 'rgba(249,115,22,0.8)'
        ctx.setLineDash([2.5, 2.5])
        ctx.lineWidth = 1
        ctx.strokeRect(cx + pad + 0.5, cy + pad + 0.5, cw - pad * 2 - 1, ch - pad * 2 - 1)
        ctx.setLineDash([])
      }
    }
  }

  // Grid lines on top for legibility.
  ctx.strokeStyle = 'rgba(41,47,64,0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let c = 1; c < cols; c++) {
    ctx.moveTo(Math.round(x + c * cw) + 0.5, y)
    ctx.lineTo(Math.round(x + c * cw) + 0.5, y + h)
  }
  for (let r = 1; r < rows; r++) {
    ctx.moveTo(x, Math.round(y + r * ch) + 0.5)
    ctx.lineTo(x + w, Math.round(y + r * ch) + 0.5)
  }
  ctx.stroke()
  ctx.strokeStyle = '#333B50'
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  // Selection + hover.
  if (options.hovered) {
    const { col, row } = options.hovered
    if (col >= 0 && row >= 0 && col < cols && row < rows) {
      ctx.strokeStyle = 'rgba(231,234,243,0.28)'
      ctx.lineWidth = 1
      ctx.strokeRect(x + col * cw + 0.5, y + row * ch + 0.5, cw - 1, ch - 1)
    }
  }
  if (options.selected) {
    const { col, row } = options.selected
    if (col >= 0 && row >= 0 && col < cols && row < rows) {
      const sx = x + col * cw
      const sy = y + row * ch
      ctx.fillStyle = 'rgba(139,92,246,0.14)'
      ctx.fillRect(sx, sy, cw, ch)
      ctx.strokeStyle = '#A78BFA'
      ctx.lineWidth = 1.6
      ctx.strokeRect(sx + 0.5, sy + 0.5, cw - 1, ch - 1)
    }
  }

  // Axes: X in mm along the bottom, Y in mm along the left.
  if (options.showAxis !== false) {
    ctx.fillStyle = '#6B7285'
    ctx.font = `9.5px ${font}`
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    const xTicks = Math.min(8, cols)
    for (let i = 0; i <= xTicks; i++) {
      const value = (scan.board_width_mm * i) / xTicks
      const px = x + (w * i) / xTicks
      ctx.fillText(String(Math.round(value * 10) / 10), px, y + h + 7)
      ctx.strokeStyle = 'rgba(41,47,64,1)'
      ctx.beginPath()
      ctx.moveTo(Math.round(px) + 0.5, y + h)
      ctx.lineTo(Math.round(px) + 0.5, y + h + 3)
      ctx.stroke()
    }
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    const yTicks = Math.min(8, rows)
    for (let i = 0; i <= yTicks; i++) {
      const px = y + (h * i) / yTicks
      const fraction = i / yTicks
      const value =
        scan.origin === 'TOP_LEFT'
          ? scan.board_height_mm * fraction
          : scan.board_height_mm * (1 - fraction)
      ctx.fillText(String(Math.round(value)), x - 7, px)
      ctx.beginPath()
      ctx.moveTo(x - 3, Math.round(px) + 0.5)
      ctx.lineTo(x, Math.round(px) + 0.5)
      ctx.stroke()
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = '#6B7285'
    ctx.font = `9px ${font}`
    ctx.fillText('Y mm', x - 34, y - 4)
    ctx.textAlign = 'right'
    ctx.fillText('X mm', x + w, y + h + 18)
  }

  // Cell size hint
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(107,114,133,0.9)'
  ctx.font = `9px ${font}`
  ctx.fillText(`${cols} × ${rows} cells @ ${scan.grid_spacing_mm} mm`, x + 1, y - 4)

  return { x, y, w, h }
}

export function describeCell(
  view: HeatmapView,
  scan: Scan,
  cell: { col: number; row: number },
): { address: ReturnType<typeof cellCoordinate>; measurement: Measurement | null } {
  return {
    address: cellCoordinate(view.geometry, cell.col, cell.row, scan.origin),
    measurement: view.cells[cell.row]?.[cell.col] ?? null,
  }
}
