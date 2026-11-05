import type { Measurement, ProbeType, QualityStatus } from './types'

/** Statistics helpers. Every derived number states its own window and denominator. */

export interface WindowStats {
  count: number
  min: number | null
  max: number | null
  mean: number | null
  peakToPeak: number | null
  spreadPct: number | null
}

export function stats(values: number[]): WindowStats {
  if (values.length === 0) {
    return { count: 0, min: null, max: null, mean: null, peakToPeak: null, spreadPct: null }
  }
  let min = Infinity
  let max = -Infinity
  let sum = 0
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  const mean = sum / values.length
  return {
    count: values.length,
    min,
    max,
    mean,
    peakToPeak: max - min,
    spreadPct: mean > 0 ? ((max - min) / mean) * 100 : null,
  }
}

export function isCountable(q: QualityStatus): boolean {
  return q === 'VALID' || q === 'UNSTABLE'
}

export interface ScanSummary {
  measuredCells: number
  totalCells: number
  valid: number
  unstable: number
  saturated: number
  invalid: number
  missing: number
  max: Measurement | null
  min: Measurement | null
  mean: number | null
  unit: string
  coveragePct: number
}

/** Aggregate of a scan. Invalid readings are excluded from valid statistics. */
export function summariseScan(measurements: Measurement[], totalCells: number, unit: string): ScanSummary {
  const valid = measurements.filter((m) => m.quality_status === 'VALID')
  const unstable = measurements.filter((m) => m.quality_status === 'UNSTABLE')
  const saturated = measurements.filter((m) => m.quality_status === 'SATURATED')
  const invalid = measurements.filter((m) => m.quality_status === 'INVALID')
  const countable = [...valid, ...unstable].sort((a, b) => a.signal_raw - b.signal_raw)
  const measuredCells = measurements.length
  const mean = countable.length
    ? countable.reduce((a, m) => a + m.signal_raw, 0) / countable.length
    : null

  return {
    measuredCells,
    totalCells,
    valid: valid.length,
    unstable: unstable.length,
    saturated: saturated.length,
    invalid: invalid.length,
    missing: Math.max(totalCells - measuredCells, 0),
    max: countable.length ? countable[countable.length - 1] : null,
    min: countable.length ? countable[0] : null,
    mean,
    unit,
    coveragePct: totalCells > 0 ? (measuredCells / totalCells) * 100 : 0,
  }
}

export interface GridGeometry {
  cols: number
  rows: number
  /** Cell dimensions in mm. */
  cellWidth: number
  cellHeight: number
  totalCells: number
}

/**
 * Grid geometry for a scan area. Cell centres are spaced by grid_spacing_mm and
 * the outer cells are bounded by the board edges (PRD §7.2 scan setup).
 */
export function gridGeometry(boardWidth: number, boardHeight: number, spacing: number): GridGeometry {
  const cols = Math.max(1, Math.ceil(boardWidth / spacing - 1e-9))
  const rows = Math.max(1, Math.ceil(boardHeight / spacing - 1e-9))
  return {
    cols,
    rows,
    cellWidth: boardWidth / cols,
    cellHeight: boardHeight / rows,
    totalCells: cols * rows,
  }
}

export interface CellAddress {
  col: number
  row: number
  x_mm: number
  y_mm: number
  label: string
}

/** Converts a cell address to a millimetre coordinate (cell centre). */
export function cellCoordinate(
  geometry: GridGeometry,
  col: number,
  row: number,
  origin: 'TOP_LEFT' | 'BOTTOM_LEFT',
): CellAddress {
  const x_mm = +(geometry.cellWidth * (col + 0.5)).toFixed(1)
  const yFromTop = geometry.cellHeight * (row + 0.5)
  const y_mm = +(origin === 'TOP_LEFT' ? yFromTop : geometry.cellHeight * geometry.rows - yFromTop).toFixed(1)
  const column = columnLabel(col)
  const rowNumber = origin === 'TOP_LEFT' ? row + 1 : geometry.rows - row
  return { col, row, x_mm, y_mm, label: `${column}${rowNumber}` }
}

export function columnLabel(index: number): string {
  let label = ''
  let n = index
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/** Colour ramp shared by heatmap, legend and report (PRD §7.2 rendering). */
const RAMP: [number, [number, number, number]][] = [
  [0, [26, 42, 92]],
  [0.18, [38, 88, 176]],
  [0.38, [53, 229, 197]],
  [0.56, [122, 226, 120]],
  [0.74, [246, 222, 84]],
  [0.88, [247, 168, 75]],
  [1, [255, 90, 110]],
]

export function rampColor(t: number, alpha = 1, light = 1): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0))
  for (let i = 1; i < RAMP.length; i++) {
    const [stop, to] = RAMP[i]
    const [prevStop, from] = RAMP[i - 1]
    if (clamped <= stop) {
      const f = stop === prevStop ? 0 : (clamped - prevStop) / (stop - prevStop)
      const rgb = from.map((c, idx) =>
        Math.round(Math.min(255, Math.max(0, (c + (to[idx] - c) * f) * light))),
      )
      return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
    }
  }
  const last = RAMP[RAMP.length - 1][1]
  return `rgba(${Math.min(255, last[0] * light)}, ${Math.min(255, last[1] * light)}, ${Math.min(255, last[2] * light)}, ${alpha})`
}

export function rampGradientCss(): string {
  return `linear-gradient(90deg, ${RAMP.map(([stop, c]) => `rgba(${c[0]},${c[1]},${c[2]},1) ${stop * 100}%`).join(', ')})`
}

export function normalise(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  if (max <= min) return 0.5
  return (value - min) / (max - min)
}

export function probeColor(type: ProbeType): string {
  return type === 'E_FIELD' ? '#4cc2ff' : '#b98bff'
}

export function probeLabel(type: ProbeType): string {
  return type === 'E_FIELD' ? 'E-field' : 'H-field'
}

export function probeFullLabel(type: ProbeType): string {
  return type === 'E_FIELD' ? 'E-field · electric' : 'H-field · magnetic'
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('en-GB', { hour12: false })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toLocaleDateString('en-GB')} ${d.toLocaleTimeString('en-GB', { hour12: false })}`
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return 'never'
  if (ms < 1000) return 'just now'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

export function uid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  const stamp = Date.now().toString(36).toUpperCase().slice(-5)
  return `${prefix}-${stamp}${rand}`
}
