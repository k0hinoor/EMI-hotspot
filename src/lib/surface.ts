import { cellCoordinate, normalise, rampColor } from './derive'
import type { Measurement, Scan } from './types'

export interface SurfaceModel {
  /** Resampled height map, row-major, `rows * cols` values in ADC counts. */
  values: number[]
  cols: number
  rows: number
  /** Grid extents in millimetres. */
  widthMm: number
  heightMm: number
  min: number
  max: number
  /** How many cells hold a direct measurement. */
  measured: number
  interpolated: boolean
}

/** Inverse-distance-weighted estimate from measured cells; null when nothing is known. */
function idw(
  points: { c: number; r: number; v: number }[],
  c: number,
  r: number,
): number | null {
  if (points.length === 0) return null
  let wsum = 0
  let vsum = 0
  for (const p of points) {
    const d2 = (p.c - c) ** 2 + (p.r - r) ** 2
    if (d2 === 0) return p.v
    const w = 1 / d2
    wsum += w
    vsum += w * p.v
  }
  return wsum > 0 ? vsum / wsum : null
}

/**
 * Builds the surface for the 3D view. Directly measured cells are used as-is;
 * everything between them is estimated (IDW) and the model reports how much of
 * it was inferred so the UI can label it honestly.
 */
export function buildSurface(scan: Scan, measurements: Measurement[], target = 46): SurfaceModel {
  const measured: { c: number; r: number; v: number }[] = []
  const gridCols = Math.max(1, Math.round(scan.board_width_mm / scan.grid_spacing_mm))
  const gridRows = Math.max(1, Math.round(scan.board_height_mm / scan.grid_spacing_mm))

  for (const m of measurements) {
    if (m.acquisition_metadata.superseded_by) continue
    if (m.x_mm === null || m.y_mm === null) continue
    if (m.quality_status === 'INVALID') continue
    const c = Math.min(gridCols - 1, Math.max(0, Math.floor(m.x_mm / scan.grid_spacing_mm)))
    const rowFromTop =
      scan.origin === 'TOP_LEFT'
        ? Math.floor(m.y_mm / scan.grid_spacing_mm)
        : Math.floor((scan.board_height_mm - m.y_mm) / scan.grid_spacing_mm)
    const r = Math.min(gridRows - 1, Math.max(0, rowFromTop))
    measured.push({ c, r, v: m.signal_raw })
  }

  const ratios = scan.board_width_mm / scan.board_height_mm
  const cols = Math.max(12, Math.round(ratios >= 1 ? target : target * Math.min(1, ratios + 0.35)))
  const rows = Math.max(12, Math.round(ratios >= 1 ? target * Math.min(1, 1 / ratios + 0.35) : target))

  const values: number[] = []
  let min = Infinity
  let max = -Infinity

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gc = (c / (cols - 1)) * (gridCols - 1)
      const gr = (r / (rows - 1)) * (gridRows - 1)
      const v = idw(measured, gc, gr) ?? 0
      values.push(v)
      if (v < min) min = v
      if (v > max) max = v
    }
  }

  if (!Number.isFinite(min)) {
    min = 0
    max = 0
  }

  return {
    values,
    cols,
    rows,
    widthMm: scan.board_width_mm,
    heightMm: scan.board_height_mm,
    min,
    max,
    measured: measured.length,
    interpolated: measured.length < gridCols * gridRows,
  }
}

export interface SurfaceCamera {
  /** Rotation around the vertical axis, radians. */
  yaw: number
  /** Tilt of the ground plane, radians. */
  pitch: number
  zoom: number
}

export interface SurfaceLabels {
  /** Unit shown next to the peak label. */
  unit: string
  /** Optional corner captions. */
  xLabel: string
  yLabel: string
}

/**
 * Renders an isometric-projected surface with a wireframe mesh, a ground grid
 * and axis captions — the topology view of the captured field.
 */
export function drawSurface(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  model: SurfaceModel,
  camera: SurfaceCamera,
  labels: SurfaceLabels,
) {
  ctx.clearRect(0, 0, width, height)

  const font = 'JetBrains Mono Variable, ui-monospace, monospace'
  const { cols, rows, values, min, max } = model

  // World space: x/y in [-1, 1], z in [0, 1].
  const aspect = model.widthMm / model.heightMm
  const halfX = aspect >= 1 ? 1 : aspect
  const halfY = aspect >= 1 ? 1 / aspect : 1
  const heightScale = 0.42

  const cosY = Math.cos(camera.yaw)
  const sinY = Math.sin(camera.yaw)
  const cosP = Math.cos(camera.pitch)

  const cx = width / 2
  const cy = height * 0.56
  const scale = Math.min(width / (2.5 * halfX), height / (2.15 * halfY)) * camera.zoom

  const project = (gx: number, gy: number, gz: number) => {
    const wx = (gx / (cols - 1) - 0.5) * 2 * halfX
    const wy = (gy / (rows - 1) - 0.5) * 2 * halfY
    const wz = gz * heightScale
    const rx = wx * cosY - wy * sinY
    const ry = wx * sinY + wy * cosY
    return {
      x: cx + rx * scale,
      y: cy + ry * cosP * scale - wz * scale,
      depth: ry,
    }
  }

  const valueAt = (c: number, r: number) => values[r * cols + c]

  // --- ground grid + base plane -------------------------------------------
  const baseY = project(0, 0, 0)
  ctx.save()
  ctx.strokeStyle = 'rgba(148, 163, 200, 0.13)'
  ctx.lineWidth = 1
  const step = Math.max(1, Math.round(Math.max(cols, rows) / 8))
  for (let c = 0; c < cols; c += step) {
    const a = project(c, 0, 0)
    const b = project(c, rows - 1, 0)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  for (let r = 0; r < rows; r += step) {
    const a = project(0, r, 0)
    const b = project(cols - 1, r, 0)
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()
  void baseY

  // --- surface quads, painter's order ------------------------------------
  const quads: { depth: number; path: { x: number; y: number }[]; color: string }[] = []
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const z00 = normalise(valueAt(c, r), min, max)
      const z10 = normalise(valueAt(c + 1, r), min, max)
      const z01 = normalise(valueAt(c, r + 1), min, max)
      const z11 = normalise(valueAt(c + 1, r + 1), min, max)
      const p00 = project(c, r, z00)
      const p10 = project(c + 1, r, z10)
      const p01 = project(c, r + 1, z01)
      const p11 = project(c + 1, r + 1, z11)

      const avg = (z00 + z10 + z01 + z11) / 4
      // Cheap directional shading so ridges read as ridges.
      const slope = (z10 + z11) / 2 - (z00 + z01) / 2
      const light = Math.max(0.55, Math.min(1.18, 1 + slope * 1.5 - (1 - avg) * 0.12))
      quads.push({
        depth: (p00.depth + p11.depth) / 2,
        path: [p00, p10, p11, p01],
        color: rampColor(Math.min(1, avg * 1.06), light),
      })
    }
  }
  quads.sort((a, b) => a.depth - b.depth)

  for (const q of quads) {
    ctx.beginPath()
    ctx.moveTo(q.path[0].x, q.path[0].y)
    for (let i = 1; i < q.path.length; i++) ctx.lineTo(q.path[i].x, q.path[i].y)
    ctx.closePath()
    ctx.fillStyle = q.color
    ctx.fill()
  }

  // --- wireframe mesh -----------------------------------------------------
  ctx.save()
  ctx.strokeStyle = 'rgba(233, 238, 251, 0.16)'
  ctx.lineWidth = 0.6
  const meshStep = Math.max(1, Math.round(cols / 34))
  for (let r = 0; r < rows; r += meshStep) {
    ctx.beginPath()
    for (let c = 0; c < cols; c++) {
      const p = project(c, r, normalise(valueAt(c, r), min, max))
      if (c === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }
  for (let c = 0; c < cols; c += meshStep) {
    ctx.beginPath()
    for (let r = 0; r < rows; r++) {
      const p = project(c, r, normalise(valueAt(c, r), min, max))
      if (r === 0) ctx.moveTo(p.x, p.y)
      else ctx.lineTo(p.x, p.y)
    }
    ctx.stroke()
  }
  ctx.restore()

  // --- peak marker --------------------------------------------------------
  if (model.measured > 0 && max > min) {
    let peakC = 0
    let peakR = 0
    let peak = -Infinity
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const v = valueAt(c, r)
        if (v > peak) {
          peak = v
          peakC = c
          peakR = r
        }
      }
    }
    const p = project(peakC, peakR, 1)
    ctx.save()
    ctx.beginPath()
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 111, 139, 0.18)'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = '#ff6f8b'
    ctx.shadowColor = 'rgba(255,111,139,0.9)'
    ctx.shadowBlur = 14
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.font = `9.5px ${font}`
    ctx.fillStyle = 'rgba(233,238,251,0.85)'
    ctx.textAlign = 'left'
    ctx.fillText(`peak ${Math.round(peak)} ${labels.unit}`, p.x + 10, p.y - 8)
    ctx.restore()
  }

  // --- axis captions ------------------------------------------------------
  const cornerA = project(0, rows - 1, 0)
  const cornerB = project(cols - 1, rows - 1, 0)
  const cornerC = project(0, 0, 0)
  ctx.save()
  ctx.font = `9px ${font}`
  ctx.fillStyle = 'rgba(105, 114, 137, 0.95)'
  ctx.textAlign = 'center'
  ctx.fillText(`${labels.xLabel} · ${model.widthMm} mm`, (cornerA.x + cornerB.x) / 2, cornerA.y + 16)
  ctx.textAlign = 'right'
  ctx.fillText(`${labels.yLabel} · ${model.heightMm} mm`, cornerA.x - 4, (cornerA.y + cornerC.y) / 2)
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(105, 114, 137, 0.8)'
  ctx.fillText(`${Math.round(min)}–${Math.round(max)} ${labels.unit}`, 8, 12)
  ctx.restore()
}

/** Cell coordinates for the surface's peak, used by the side panels. */
export function peakCell(view: { cols: number; rows: number; values: number[] }) {
  let best = 0
  let bc = 0
  let br = 0
  view.values.forEach((v, i) => {
    if (v > best) {
      best = v
      bc = i % view.cols
      br = Math.floor(i / view.cols)
    }
  })
  return { col: bc, row: br, value: best }
}

export { cellCoordinate }
