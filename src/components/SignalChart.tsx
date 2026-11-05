import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent, AxisPointerComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { Sample } from '../lib/types'

echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, AxisPointerComponent, CanvasRenderer])

export interface SignalChartProps {
  samples: Sample[]
  /** Trailing window in seconds. Samples older than this are not drawn. */
  windowSeconds: number
  unit: string
  adcMax: number
  /** Horizontal reference line, e.g. a recorded baseline. */
  baseline?: number | null
  height?: number
  /** Fill the parent box instead of using a fixed height. */
  fill?: boolean
  color?: string
}

/**
 * Raw signal versus time. Only frames actually received from the device are drawn;
 * there is no synthesised series and no smoothing that could imply extra samples.
 */
export function SignalChart({
  samples,
  windowSeconds,
  unit,
  adcMax,
  baseline,
  height = 240,
  fill,
  color = '#4cc2ff',
}: SignalChartProps) {
  const holder = useRef<HTMLDivElement | null>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!holder.current) return
    const instance = echarts.init(holder.current, undefined, { renderer: 'canvas' })
    chart.current = instance
    const resize = () => instance.resize()
    const observer = new ResizeObserver(resize)
    observer.observe(holder.current)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    const instance = chart.current
    if (!instance) return
    const cutoff = Date.now() - windowSeconds * 1000
    const visible = samples.filter((s) => new Date(s.received_at).getTime() >= cutoff)
    const data = visible.map((s) => [new Date(s.received_at).getTime(), s.signal_raw])
    const filtered = visible
      .filter((s) => s.signal_filtered !== null)
      .map((s) => [new Date(s.received_at).getTime(), s.signal_filtered as number])

    const hasFiltered = filtered.length > 0

    instance.setOption(
      {
        animation: false,
        backgroundColor: 'transparent',
        grid: { left: 46, right: hasFiltered ? 16 : 16, top: 16, bottom: 22 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#14161a',
          borderColor: '#2a2d33',
          borderWidth: 1,
          padding: [6, 9],
          textStyle: { color: '#e9eaec', fontSize: 10.5, fontFamily: 'JetBrains Mono Variable, monospace' },
          axisPointer: { type: 'line', lineStyle: { color: '#31353c' } },
          formatter: (params: unknown) => {
            const list = params as { value: [number, number]; seriesName: string; color: string }[]
            if (!list.length) return ''
            const time = new Date(list[0].value[0]).toLocaleTimeString('en-GB', { hour12: false })
            const rows = list
              .map((p) => `<div style="display:flex;gap:8px;justify-content:space-between"><span>${p.seriesName}</span><span>${p.value[1]} ${unit}</span></div>`)
              .join('')
            return `<div style="font-size:10px;color:#98A0B3;margin-bottom:3px">${time}</div>${rows}`
          },
        },
        xAxis: {
          type: 'time',
          min: cutoff,
          max: Date.now(),
          axisLine: { lineStyle: { color: '#24272d' } },
          axisTick: { show: false },
          splitLine: { show: true, lineStyle: { color: '#191c21', type: 'solid' } },
          axisLabel: {
            color: '#6c727b',
            fontSize: 10,
            fontFamily: 'JetBrains Mono Variable, monospace',
            formatter: (v: number) => new Date(v).toLocaleTimeString('en-GB', { hour12: false }),
          },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: Math.ceil(adcMax * 1.02),
          splitNumber: 4,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#191c21' } },
          axisLabel: {
            color: '#6c727b',
            fontSize: 10,
            fontFamily: 'JetBrains Mono Variable, monospace',
          },
        },
        series: [
          {
            name: 'Raw',
            type: 'line',
            showSymbol: false,
            data,
            lineStyle: { width: 1.4, color },
            itemStyle: { color },
            areaStyle: {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${color}2e` },
                  { offset: 1, color: `${color}00` },
                ],
              },
            },
            markLine:
              baseline !== undefined && baseline !== null
                ? {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { color: '#6c727b', width: 1, type: [3, 3], opacity: 0.9 },
                    label: {
                      formatter: 'noise floor',
                      color: '#9ba1aa',
                      fontSize: 9,
                      position: 'insideEndTop',
                    },
                    data: [{ yAxis: +baseline.toFixed(1) }],
                  }
                : undefined,
          },
          ...(hasFiltered
            ? [
                {
                  name: 'Filtered (firmware)',
                  type: 'line' as const,
                  showSymbol: false,
                  data: filtered,
                  lineStyle: { width: 1, color: '#e9eaec', opacity: 0.5 },
                  itemStyle: { color: '#e9eaec' },
                },
              ]
            : []),
        ],
      },
      { notMerge: false },
    )
  }, [samples, windowSeconds, unit, adcMax, baseline, color])

  return <div ref={holder} style={fill ? { height: '100%', width: '100%' } : { height }} className="w-full" />
}
