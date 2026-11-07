import type { Measurement, ProbeType, QualityStatus } from './types'

/** Statistics helpers. Every derived number states its own window and denominator. */

export interface WindowStats {
  count: number
  min: number | null
  max: number | null
  mean: number | null
  peakToPeak: number | null
  spreadPct: number | null
  /**
   * True when the mean is too small for a ratio to mean anything. Dividing by a
   * mean of ~0 turns a handful of ADC counts into "1,316% spread", which reads as
   * a violent signal when the input is simply idle.
   */
  ratioUndefined?: boolean
}

/** Below this mean, percentages are noise amplification rather than information. */
export const RATIO_FLOOR = 25

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
    spreadPct: mean >= RATIO_FLOOR ? ((max - min) / mean) * 100 : null,
    ratioUndefined: mean < RATIO_FLOOR,
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

/* -------------------------------------------------------------------------- */
/*  Signal conditioning                                                        */
/* -------------------------------------------------------------------------- */

export type ConditioningMode = 'OFF' | 'MEDIAN' | 'SMOOTH'

export interface ConditioningOptions {
  /** 'OFF' draws the frames exactly as they arrived. */
  mode: ConditioningMode
  /** Median kernel in frames; odd values 3..9 are used. */
  medianWindow?: number
  /** Exponential smoothing factor 0..1 (higher = smoother). */
  smoothing?: number
  adcMax?: number
  /** Raw values at or above this are held out of the estimate. */
  saturatedAt?: number
  /** Spike gate: a frame this far (in counts) from the running median is held. */
  spikeGate?: number
}

export interface ConditionedPoint {
  at: number
  raw: number
  /** Conditioned value; null where the frame is held out (invalid/saturated). */
  value: number | null
  held: boolean
}

/**
 * Conditions a frame series for *display only*.
 *
 * Three things make the raw trace look unstable and all three are real effects:
 * ADC quantisation noise, the odd drop-out frame from the Wi-Fi/ADC interaction,
 * and saturation clipping. So the conditioning is explicit:
 *
 *  - `MEDIAN` rejects isolated spikes and drop-outs (a genuine hotspot plateau
 *    survives a 5-frame median untouched).
 *  - `SMOOTH` runs an EMA on top of the median series.
 *  - Saturated / invalid frames are *held out* of the estimate and marked, never
 *    averaged into it — a clipped reading is not a quiet one.
 *
 * Statistics elsewhere in the app keep using the raw frames; this only changes
 * what the chart draws, and the chart labels the mode it is showing.
 */
export function conditionSeries(
  points: { at: number; raw: number; valid?: boolean }[],
  options: ConditioningOptions,
): ConditionedPoint[] {
  const window = Math.max(1, Math.min(9, Math.round(options.medianWindow ?? 5)) | 1)
  const alpha = Math.min(0.95, Math.max(0.05, options.smoothing ?? 0.35))
  const saturatedAt = options.saturatedAt ?? Number.POSITIVE_INFINITY
  const gate = options.spikeGate ?? 0

  const gateFlags = points.map((p) => {
    if (p.valid === false) return true
    if (p.raw <= 0) return true
    if (p.raw >= saturatedAt) return true
    return false
  })

  // Median over the two-sided window, skipping held frames.
  const medianised = points.map((_point, index) => {
    if (gateFlags[index]) return null
    const half = (window - 1) / 2
    const neighbourhood: number[] = []
    for (let i = index - half; i <= index + half; i++) {
      if (i < 0 || i >= points.length) continue
      if (gateFlags[i]) continue
      neighbourhood.push(points[i].raw)
    }
    if (neighbourhood.length === 0) return null
    neighbourhood.sort((a, b) => a - b)
    const mid = Math.floor(neighbourhood.length / 2)
    return neighbourhood.length % 2 ? neighbourhood[mid] : (neighbourhood[mid - 1] + neighbourhood[mid]) / 2
  })

  // Spike gate relative to the running median, when requested.
  const kept = medianised.map((value, index) => {
    if (value === null) return null
    if (gate <= 0) return value
    const windowVals = medianised
      .slice(Math.max(0, index - 4), Math.min(medianised.length, index + 5))
      .filter((v): v is number => v !== null)
    if (windowVals.length < 3) return value
    const local = windowVals.reduce((a, b) => a + b, 0) / windowVals.length
    return Math.abs(value - local) > gate ? null : value
  })

  // EMA, only where a conditioned value exists.
  let ema: number | null = null
  return points.map((point, index) => {
    const value = kept[index]
    if (value === null) {
      return { at: point.at, raw: point.raw, value: ema, held: true }
    }
    if (options.mode === 'OFF') return { at: point.at, raw: point.raw, value: point.raw, held: false }
    ema = ema === null ? value : ema + alpha * (value - ema)
    return { at: point.at, raw: point.raw, value: options.mode === 'MEDIAN' ? value : ema, held: false }
  })
}

/**
 * Frame-to-frame stability of a series, as a percentage of the mean. This is the
 * number that says whether the trace looks calm — it is computed from the raw
 * frames, so it cannot be improved by drawing differently.
 */
export function stabilityIndex(values: number[]): { mean: number; meanAbsDelta: number; pct: number } {
  if (values.length < 2) return { mean: values[0] ?? 0, meanAbsDelta: 0, pct: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  let sum = 0
  for (let i = 1; i < values.length; i++) sum += Math.abs(values[i] - values[i - 1])
  const meanAbsDelta = sum / (values.length - 1)
  return { mean, meanAbsDelta, pct: mean > 0 ? (meanAbsDelta / mean) * 100 : 0 }
}

/** Reading gap statistics — how evenly frames arrive (jitter in ms). */
export function arrivalJitter(times: number[]): { median: number; p95: number; worst: number } {
  const gaps: number[] = []
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1]
    if (gap > 0) gaps.push(gap)
  }
  if (gaps.length === 0) return { median: 0, p95: 0, worst: 0 }
  const sorted = [...gaps].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
  return { median: at(0.5), p95: at(0.95), worst: sorted[sorted.length - 1] }
}
