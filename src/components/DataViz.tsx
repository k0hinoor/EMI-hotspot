import { useEffect, useMemo, useRef } from 'react'
import { cn } from './ui'

/* ------------------------------- sparkline -------------------------------- */

/**
 * Tiny trend line for KPI cards. Draws only the samples handed to it — with an
 * empty array it renders a flat idle baseline, never invented movement.
 */
export function Sparkline({
  values,
  color = '#35e5c5',
  height = 30,
  filled = true,
  className,
}: {
  values: number[]
  color?: string
  height?: number
  filled?: boolean
  className?: string
}) {
  const width = 96
  const path = useMemo(() => {
    if (values.length === 0) return { line: `M0 ${height - 3} L${width} ${height - 3}`, area: '' }
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const step = values.length > 1 ? width / (values.length - 1) : width
    const points = values.map((v, i) => {
      const x = i * step
      const y = height - 3 - ((v - min) / span) * (height - 8)
      return [x, y] as const
    })
    const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ')
    const area = `${line} L${width} ${height} L0 ${height} Z`
    return { line, area }
  }, [values, height])

  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, [])

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('h-auto w-[96px] overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {filled && values.length > 0 ? <path d={path.area} fill={`url(#${id})`} /> : null}
      <path
        d={path.line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}
      />
    </svg>
  )
}

/* --------------------------------- donut ---------------------------------- */

export interface DonutSlice {
  label: string
  value: number
  color: string
}

/**
 * Ring chart with rounded segments and a glowing track, as in the reference.
 * With no data it shows an empty track and a "no data" centre rather than a
 * decorative ring.
 */
export function Donut({
  slices,
  size = 176,
  thickness = 12,
  centerLabel,
  centerValue,
  centerHint,
}: {
  slices: DonutSlice[]
  size?: number
  thickness?: number
  centerLabel?: string
  centerValue?: string
  centerHint?: string
}) {
  const total = slices.reduce((a, s) => a + s.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? 0.028 : 0

  let offset = 0

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {total > 0
          ? slices
              .filter((s) => s.value > 0)
              .map((slice) => {
                const fraction = slice.value / total
                const length = Math.max(0, (fraction - gap) * circumference)
                const dash = `${length} ${circumference - length}`
                const element = (
                  <circle
                    key={slice.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset * circumference}
                    style={{ filter: `drop-shadow(0 0 6px ${slice.color}88)` }}
                  />
                )
                offset += fraction
                return element
              })
          : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {centerValue ? (
          <span className="tabular text-[24px] leading-none font-medium text-ink">{centerValue}</span>
        ) : null}
        {centerLabel ? <span className="mt-1 text-[9.5px] tracking-[0.12em] text-ink-dim uppercase">{centerLabel}</span> : null}
        {centerHint ? <span className="mt-1.5 max-w-[92px] text-center text-[9.5px] leading-snug text-ink-dim">{centerHint}</span> : null}
      </div>
    </div>
  )
}

/* ------------------------------ wave canvas ------------------------------- */

/**
 * Compact filled-area waveform used in KPI cards. Renders the supplied samples
 * verbatim; an empty array draws nothing but the baseline.
 */
export function MiniWave({
  values,
  color,
  height = 34,
  className,
}: {
  values: number[]
  color: string
  height?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const parent = canvas.parentElement
    const width = Math.max(60, parent?.clientWidth ?? 120)
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    if (values.length < 2) {
      ctx.strokeStyle = 'rgba(148,163,200,0.22)'
      ctx.setLineDash([3, 4])
      ctx.beginPath()
      ctx.moveTo(0, height - 2)
      ctx.lineTo(width, height - 2)
      ctx.stroke()
      return
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const step = width / (values.length - 1)
    const yFor = (v: number) => height - 3 - ((v - min) / span) * (height - 8)

    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, `${color}55`)
    gradient.addColorStop(1, `${color}00`)

    ctx.beginPath()
    ctx.moveTo(0, height)
    values.forEach((v, i) => ctx.lineTo(i * step, yFor(v)))
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()

    ctx.beginPath()
    values.forEach((v, i) => {
      const x = i * step
      const y = yFor(v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.shadowColor = `${color}aa`
    ctx.shadowBlur = 8
    ctx.stroke()
  }, [values, color, height])

  return (
    <div className={cn('w-full', className)}>
      <canvas ref={ref} className="block" />
    </div>
  )
}
