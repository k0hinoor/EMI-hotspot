import { useEffect, useMemo, useRef } from 'react'
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { normalise, rampColor, probeColor, type ScanSummary } from '../lib/derive'
import type { Scan } from '../lib/types'

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const axisLabel = {
  color: '#6c727b',
  fontSize: 9.5,
  fontFamily: 'JetBrains Mono Variable, monospace',
}

const tooltipBase = {
  backgroundColor: '#14161a',
  borderColor: '#2a2d33',
  borderWidth: 1,
  padding: [6, 9] as [number, number],
  textStyle: { color: '#e9eaec', fontSize: 10.5, fontFamily: 'JetBrains Mono Variable, monospace' },
}

function useChart(option: unknown, height: number, deps: unknown[], fill?: boolean) {
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

  return <div ref={holder} style={fill ? { height: '100%', width: '100%' } : { height }} className="w-full" />
}

/** Histogram of reading values, coloured with the same ramp as the heatmap. */
export function CellHistogram({ values, unit, adcMax, fill }: { values: number[]; unit: string; adcMax: number; fill?: boolean }) {
  const option = useMemo(() => {
    const binCount = Math.min(24, Math.max(6, Math.round(Math.sqrt(values.length))))
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(max - min, 1)
    const bins = Array.from({ length: binCount }, () => 0)
    for (const v of values) {
      const idx = Math.min(binCount - 1, Math.floor(((v - min) / span) * binCount))
      bins[idx] += 1
    }
    const step = span / binCount
    const categories = bins.map((_, i) => Math.round(min + step * (i + 0.5)))
    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 44, right: 14, top: 14, bottom: 26 },
      tooltip: {
        ...tooltipBase,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number; value: number }[]
          const p = list[0]
          if (!p) return ''
          return `<div style="font-size:10px;color:#9ba1aa">≈ ${categories[p.dataIndex]} ${unit}</div><div>${p.value} readings</div>`
        },
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: '#24272d' } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel, interval: Math.max(0, Math.floor(binCount / 6) - 1) },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#191c21' } },
        axisLabel,
      },
      series: [
        {
          type: 'bar',
          data: bins.map((count, i) => ({
            value: count,
            itemStyle: { color: rampColor(normalise(categories[i], 0, adcMax), 0.85), borderRadius: [2, 2, 0, 0] },
          })),
          barCategoryGap: '18%',
        },
      ],
    }
  }, [values, unit, adcMax])

  return useChart(option, 220, [option], fill)
}

/** Grouped comparison. Each probe type keeps its own axis — never a shared scale. */
export function ScanCompareBars({ rows, fill }: { rows: { scan: Scan; summary: ScanSummary }[]; fill?: boolean }) {
  const option = useMemo(() => {
    const names = rows.map((r) => r.scan.scan_name)
    const maxes = rows.map((r) => (r.summary.max ? r.summary.max.signal_raw : null))
    const means = rows.map((r) => r.summary.mean)
    const hasE = rows.some((r) => r.scan.probe_type === 'E_FIELD')
    const hasH = rows.some((r) => r.scan.probe_type === 'H_FIELD')

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: { left: 48, right: hasE && hasH ? 48 : 16, top: 22, bottom: 30 },
      tooltip: {
        ...tooltipBase,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = params as { dataIndex: number; seriesName: string; value: number | null; marker: string }[]
          const scan = rows[list[0]?.dataIndex ?? 0]
          if (!scan) return ''
          const head = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:3px"><span style="width:6px;height:6px;border-radius:2px;background:${probeColor(scan.scan.probe_type)}"></span>${scan.scan.scan_name}</div>`
          const body = list
            .filter((p) => p.value !== null)
            .map((p) => `<div style="display:flex;gap:10px;justify-content:space-between"><span>${p.seriesName}</span><span>${Math.round(p.value as number)}</span></div>`)
            .join('')
          const meta = `<div style="font-size:9.5px;color:#6c727b;margin-top:3px">${scan.scan.probe_type === 'E_FIELD' ? 'E-field' : 'H-field'} · ${scan.summary.measuredCells} cells · ${scan.summary.coveragePct.toFixed(0)}% coverage</div>`
          return head + body + meta
        },
      },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: '#9ba1aa', fontSize: 9.5 },
      },
      xAxis: {
        type: 'category',
        data: names,
        axisLine: { lineStyle: { color: '#24272d' } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel, width: 90, overflow: 'truncate', interval: 0 },
      },
      yAxis: [
        {
          type: 'value',
          name: 'E-field',
          nameTextStyle: { color: '#4cc2ff', fontSize: 8.5, align: 'left' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#191c21' } },
          axisLabel: { ...axisLabel, color: hasE ? '#6c727b' : '#33373d' },
        },
        {
          type: 'value',
          name: 'H-field',
          show: hasH,
          position: 'right',
          nameTextStyle: { color: '#b98bff', fontSize: 8.5, align: 'right' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { ...axisLabel, color: hasH ? '#6c727b' : '#33373d' },
        },
      ],
      series: [
        {
          name: 'E max',
          type: 'bar',
          barMaxWidth: 20,
          data: rows.map((r, i) => ({
            value: r.scan.probe_type === 'E_FIELD' ? maxes[i] : null,
            itemStyle: { color: '#4cc2ff', borderRadius: [1, 1, 0, 0] },
          })),
        },
        {
          name: 'E mean',
          type: 'bar',
          barMaxWidth: 20,
          data: rows.map((r, i) => ({
            value: r.scan.probe_type === 'E_FIELD' ? means[i] : null,
            itemStyle: { color: 'rgba(76,194,255,0.3)', borderRadius: [1, 1, 0, 0] },
          })),
        },
        {
          name: 'H max',
          type: 'bar',
          yAxisIndex: 1,
          barMaxWidth: 20,
          data: rows.map((r, i) => ({
            value: r.scan.probe_type === 'H_FIELD' ? maxes[i] : null,
            itemStyle: { color: '#b98bff', borderRadius: [1, 1, 0, 0] },
          })),
        },
        {
          name: 'H mean',
          type: 'bar',
          yAxisIndex: 1,
          barMaxWidth: 20,
          data: rows.map((r, i) => ({
            value: r.scan.probe_type === 'H_FIELD' ? means[i] : null,
            itemStyle: { color: 'rgba(185,139,255,0.3)', borderRadius: [1, 1, 0, 0] },
          })),
        },
      ],
    }
  }, [rows])

  return useChart(option, 260, [option], fill)
}
