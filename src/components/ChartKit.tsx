import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkPointComponent, MarkLineComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, MarkPointComponent, MarkLineComponent, CanvasRenderer])

const AXIS = {
  color: '#697289',
  fontSize: 9.5,
  fontFamily: 'JetBrains Mono Variable, monospace',
}

const TOOLTIP = {
  backgroundColor: 'rgba(11,14,22,0.96)',
  borderColor: 'rgba(255,255,255,0.12)',
  borderWidth: 1,
  padding: [7, 10] as [number, number],
  textStyle: { color: '#e9eefb', fontSize: 10.5, fontFamily: 'JetBrains Mono Variable, monospace' },
  extraCssText: 'backdrop-filter: blur(12px); border-radius: 10px; box-shadow: 0 12px 32px -12px rgba(0,0,0,0.9);',
}

function useChart(option: unknown, deps: unknown[]) {
  const holder = useRef<HTMLDivElement | null>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!holder.current) return
    const instance = echarts.init(holder.current, undefined, { renderer: 'canvas' })
    chart.current = instance
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(holder.current)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option as never, { notMerge: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return <div ref={holder} style={{ height: '100%', width: '100%' }} />
}

export interface ProfilePoint {
  label: string
  value: number
  filled: boolean
}

/**
 * Column profile line with glowing node markers and a peak marker — the
 * spectrum-chart silhouette from the reference, drawn from aggregated
 * measurements only.
 */
export function SpectrumLine({ points, unit }: { points: ProfilePoint[]; unit: string }) {
  const option = useMemo(() => {
    const values = points.map((p) => (p.filled ? +p.value.toFixed(1) : null))
    const filled = points.filter((p) => p.filled)
    const peakIndex = filled.length
      ? points.reduce((best, p, i) => (p.filled && p.value > points[best].value ? i : best), points.findIndex((p) => p.filled))
      : -1

    return {
      animationDuration: 400,
      grid: { left: 40, right: 16, top: 18, bottom: 26 },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(53,229,197,0.35)' } },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number; value: number | null }[]
          const p = list[0]
          if (!p || p.value === null) return ''
          return `<div style="font-size:9.5px;color:#697289">column ${points[p.dataIndex]?.label}</div><div>${p.value} ${unit}</div>`
        },
      },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.label),
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.09)' } },
        axisTick: { show: false },
        axisLabel: { ...AXIS, interval: Math.max(0, Math.floor(points.length / 8) - 1) },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLabel: AXIS,
      },
      series: [
        {
          type: 'line',
          data: values,
          smooth: 0.35,
          connectNulls: false,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 4,
          itemStyle: { color: '#f6de54', borderColor: 'rgba(5,6,10,0.9)', borderWidth: 1 },
          lineStyle: { width: 1.8, color: '#f6de54', shadowColor: 'rgba(246,222,84,0.4)', shadowBlur: 12 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(246,222,84,0.20)' },
                { offset: 1, color: 'rgba(246,222,84,0)' },
              ],
            },
          },
          markPoint:
            peakIndex >= 0
              ? {
                  symbol: 'circle',
                  symbolSize: 12,
                  itemStyle: { color: '#ff6f8b', shadowColor: 'rgba(255,111,139,0.9)', shadowBlur: 16 },
                  label: { show: false },
                  data: [{ coord: [peakIndex, values[peakIndex] ?? 0] }],
                }
              : undefined,
          markLine:
            peakIndex >= 0
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: 'rgba(255,111,139,0.45)', width: 1, type: [4, 4] },
                  label: { show: false },
                  data: [{ xAxis: peakIndex }],
                }
              : undefined,
        },
      ],
    }
  }, [points, unit])

  return useChart(option, [option])
}

/** Gradient bar series used for capture activity and scan comparisons. */
export function TrendBars({
  rows,
  colorFrom = '#6aa8ff',
  colorTo = '#35e5c5',
}: {
  rows: { label: string; value: number }[]
  colorFrom?: string
  colorTo?: string
}) {
  const option = useMemo(
    () => ({
      animationDuration: 400,
      grid: { left: 32, right: 10, top: 14, bottom: 24 },
      tooltip: {
        ...TOOLTIP,
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(53,229,197,0.06)' } },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number; value: number }[]
          const p = list[0]
          if (!p) return ''
          return `<div style="font-size:9.5px;color:#697289">${rows[p.dataIndex]?.label}</div><div>${p.value} readings</div>`
        },
      },
      xAxis: {
        type: 'category',
        data: rows.map((r) => r.label),
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.09)' } },
        axisTick: { show: false },
        axisLabel: { ...AXIS, interval: Math.max(0, Math.floor(rows.length / 7) - 1) },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLabel: AXIS,
      },
      series: [
        {
          type: 'bar',
          data: rows.map((r) => r.value),
          barMaxWidth: 18,
          itemStyle: {
            borderRadius: [4, 4, 2, 2],
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colorTo },
                { offset: 1, color: colorFrom },
              ],
            },
            shadowColor: `${colorTo}55`,
            shadowBlur: 10,
          },
        },
      ],
    }),
    [rows, colorFrom, colorTo],
  )

  return useChart(option, [option])
}
