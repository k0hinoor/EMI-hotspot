import { jsPDF } from 'jspdf'
import { buildHeatmapView, drawHeatmap } from './heatmap'
import { formatDateTime, formatNumber, gridGeometry, probeLabel, summariseScan, uid } from './derive'
import type { AppSettings, Measurement, Report, Scan } from './types'

const INK = { r: 20, g: 24, b: 33 }
const MUTED = { r: 110, g: 118, b: 133 }

/** Renders the heatmap to an offscreen canvas so the PDF gets the real cell data. */
function renderHeatmapImage(scan: Scan, measurements: Measurement[], interpolation: boolean): string | null {
  const canvas = document.createElement('canvas')
  const width = 1100
  const height = 700
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  // Light background for print legibility; ramp is unchanged so cells read the same.
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  const view = buildHeatmapView(scan, measurements)
  drawHeatmap(ctx, width, height, scan, view, {
    selected: null,
    interpolate: interpolation,
    fontFamily: 'Helvetica, Arial, sans-serif',
  })
  return canvas.toDataURL('image/png')
}

export interface ReportInput {
  scan: Scan
  measurements: Measurement[]
  settings: AppSettings
  deviceId: string | null
  firmwareVersion: string | null
  notes: string
  includeInvalid: boolean
  interpolation: boolean
}

export function buildMeasurementRows(input: ReportInput) {
  const rows = input.measurements.filter(
    (m) => input.includeInvalid || (m.quality_status !== 'INVALID' && !m.acquisition_metadata.superseded_by),
  )
  return rows.sort((a, b) => (a.y_mm ?? 0) - (b.y_mm ?? 0) || (a.x_mm ?? 0) - (b.x_mm ?? 0))
}

export function generateReport(input: ReportInput): { report: Report; pdf: jsPDF } {
  const { scan, settings, notes, includeInvalid } = input
  const geometry = gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm)
  const summary = summariseScan(input.measurements, geometry.totalCells, settings.acquisition.unit)
  const rows = buildMeasurementRows(input)

  const reportId = uid('RPT')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 44
  let y = 0

  const text = (value: string, x: number, yy: number, size = 9, color = INK, style: 'normal' | 'bold' = 'normal') => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    doc.setTextColor(color.r, color.g, color.b)
    doc.text(value, x, yy)
  }

  const rule = (yy: number) => {
    doc.setDrawColor(220, 223, 230)
    doc.setLineWidth(0.6)
    doc.line(margin, yy, pageWidth - margin, yy)
  }

  // Header
  doc.setFillColor(INK.r, INK.g, INK.b)
  doc.rect(0, 0, pageWidth, 74, 'F')
  text('EMI Hotspot Mapper', margin, 32, 15, { r: 255, g: 255, b: 255 }, 'bold')
  text('Near-field scan report · relative measurement', margin, 49, 8.5, { r: 168, g: 176, b: 196 })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(168, 176, 196)
  doc.text(`Generated ${formatDateTime(new Date().toISOString())}`, pageWidth - margin, 32, { align: 'right' })
  doc.text(`Report ${reportId}`, pageWidth - margin, 49, { align: 'right' })
  y = 100

  // Scan identity
  text(scan.scan_name, margin, y, 16, INK, 'bold')
  y += 16
  text(`${scan.scan_id} · ${scan.status} · probe ${probeLabel(scan.probe_type)} (${scan.probe_id})`, margin, y, 8.5, MUTED)
  y += 18
  rule(y)
  y += 16

  const colWidth = (pageWidth - margin * 2) / 3
  const facts: [string, string][] = [
    ['Test area', `${scan.board_width_mm} × ${scan.board_height_mm} mm`],
    ['Grid spacing', `${scan.grid_spacing_mm} mm`],
    ['Grid cells', `${geometry.cols} × ${geometry.rows} = ${geometry.totalCells}`],
    ['Origin', scan.origin === 'TOP_LEFT' ? 'Top-left' : 'Bottom-left'],
    ['Started', formatDateTime(scan.started_at)],
    ['Completed', scan.completed_at ? formatDateTime(scan.completed_at) : 'not completed'],
    ['Device ID', input.deviceId ?? 'not recorded'],
    ['Firmware', input.firmwareVersion ?? 'not recorded'],
    ['Unit', settings.acquisition.unit],
  ]

  facts.forEach((fact, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = margin + col * colWidth
    const yy = y + row * 30
    text(fact[0].toUpperCase(), x, yy, 6.8, MUTED)
    text(fact[1], x, yy + 12, 9, INK)
  })
  y += Math.ceil(facts.length / 3) * 30 + 6
  rule(y)
  y += 18

  // Summary statistics
  text('Measurement summary', margin, y, 11, INK, 'bold')
  y += 14
  const stats: [string, string][] = [
    ['Measured cells', `${summary.measuredCells} of ${summary.totalCells} (${summary.coveragePct.toFixed(0)}%)`],
    ['Valid', String(summary.valid)],
    ['Unstable', String(summary.unstable)],
    ['Saturated', String(summary.saturated)],
    ['Invalid', String(summary.invalid)],
    ['Missing cells', String(summary.missing)],
    [
      'Maximum',
      summary.max
        ? `${formatNumber(summary.max.signal_raw)} ${summary.max.unit} at (${summary.max.x_mm}, ${summary.max.y_mm}) mm`
        : '—',
    ],
    ['Average (valid + unstable)', summary.mean !== null ? `${formatNumber(summary.mean, 1)} ${settings.acquisition.unit}` : '—'],
    ['Average method', 'arithmetic mean of countable readings'],
  ]
  stats.forEach((stat, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = margin + col * ((pageWidth - margin * 2) / 2)
    const yy = y + row * 20
    text(stat[0], x, yy, 8.5, MUTED)
    text(stat[1], x + 150, yy, 8.5, INK, 'bold')
  })
  y += Math.ceil(stats.length / 2) * 20 + 6

  // Heatmap
  text('Measured heatmap', margin, y, 11, INK, 'bold')
  y += 8
  const image = renderHeatmapImage(scan, input.measurements, input.interpolation)
  const imgWidth = pageWidth - margin * 2
  const imgHeight = (imgWidth * 700) / 1100
  if (image) {
    doc.addImage(image, 'PNG', margin, y + 4, imgWidth, imgHeight)
  }
  y += imgHeight + 12

  // Legend
  const legendWidth = 180
  doc.setFillColor(17, 26, 40)
  for (let i = 0; i < legendWidth; i++) {
    const t = i / legendWidth
    const stopsArr: [number, [number, number, number]][] = [
      [0, [26, 42, 92]],
      [0.18, [38, 88, 176]],
      [0.38, [53, 229, 197]],
      [0.56, [122, 226, 120]],
      [0.74, [246, 222, 84]],
      [0.88, [247, 168, 75]],
      [1, [255, 90, 110]],
    ]
    let rgb = stopsArr[0][1]
    for (let s = 1; s < stopsArr.length; s++) {
      if (t <= stopsArr[s][0]) {
        const [p0, c0] = stopsArr[s - 1]
        const [p1, c1] = stopsArr[s]
        const f = (t - p0) / (p1 - p0)
        rgb = c0.map((c, k) => Math.round(c + (c1[k] - c) * f)) as [number, number, number]
        break
      }
    }
    doc.setFillColor(rgb[0], rgb[1], rgb[2])
    doc.rect(margin + i, y, 1, 7, 'F')
  }
  text('0', margin, y + 17, 7.5, MUTED)
  text(`${summary.max ? formatNumber(summary.max.signal_raw) : '—'} ${settings.acquisition.unit}`.trim(), margin + legendWidth, y + 17, 7.5, MUTED)
  text('Unmeasured cells are blank · hatched cells (if any) are interpolated, not measured', margin + legendWidth + 24, y + 17, 7, MUTED)
  y += 32

  if (notes.trim()) {
    text('Notes', margin, y, 10, INK, 'bold')
    y += 12
    const lines = doc.splitTextToSize(notes.trim(), pageWidth - margin * 2) as string[]
    lines.forEach((line) => {
      text(line, margin, y, 8.5, INK)
      y += 11
    })
    y += 6
  }

  // Measurement table on a new page
  doc.addPage()
  y = 52
  text('Measurement table', margin, y, 12, INK, 'bold')
  y += 6
  text(
    `${rows.length} rows${includeInvalid ? '' : ' (invalid and superseded readings excluded)'} · click-through IDs match the Data Log`,
    margin,
    y + 8,
    7.5,
    MUTED,
  )
  y += 22
  rule(y)
  y += 11

  const cols: { key: string; width: number }[] = [
    { key: 'ID', width: 70 },
    { key: 'X', width: 34 },
    { key: 'Y', width: 34 },
    { key: 'Raw', width: 40 },
    { key: 'Filtered', width: 46 },
    { key: 'Unit', width: 62 },
    { key: 'Probe', width: 44 },
    { key: 'Quality', width: 56 },
    { key: 'Timestamp', width: 108 },
    { key: 'Profile', width: 60 },
  ]

  const headerRow = () => {
    let x = margin
    cols.forEach((col) => {
      text(col.key.toUpperCase(), x, y, 6.6, MUTED)
      x += col.width
    })
    y += 4
    rule(y)
    y += 9
  }

  headerRow()

  for (const m of rows) {
    if (y > pageHeight - 48) {
      doc.addPage()
      y = 52
      headerRow()
    }
    const values = [
      m.measurement_id,
      m.x_mm !== null ? String(m.x_mm) : '—',
      m.y_mm !== null ? String(m.y_mm) : '—',
      String(m.signal_raw),
      m.signal_processed !== null ? String(m.signal_processed) : '—',
      m.unit,
      m.probe_type === 'E_FIELD' ? 'E' : 'H',
      m.quality_status,
      formatDateTime(m.timestamp),
      m.calibration_profile_id ?? 'none',
    ]
    let x = margin
    values.forEach((value, i) => {
      const color =
        i === 7 && (m.quality_status === 'INVALID' || m.quality_status === 'SATURATED')
          ? { r: 180, g: 35, b: 35 }
          : i === 7 && m.quality_status === 'UNSTABLE'
            ? { r: 176, g: 98, b: 10 }
            : INK
      text(value, x, y, 7.4, color)
      x += cols[i].width
    })
    y += 11
  }

  // Limitations footer
  doc.addPage()
  y = 60
  text('Measurement limitations', margin, y, 12, INK, 'bold')
  y += 18
  const limitations = [
    'The values in this report are relative detector counts. They are not calibrated field-strength values and must not be used as compliance evidence.',
    'Absolute field strength requires a suitable reference instrument, defined geometry, characterised frequency response and a documented calibration procedure.',
    'Probe response depends on geometry, orientation, height above the board, distance and frequency. Readings are only comparable between scans taken with the same probe and the same placement discipline.',
    'E-field and H-field readings are different measurement types and are never combined on a common scale.',
    'Coordinates are supplied manually by the operator. Positional accuracy is limited by manual probe placement.',
    'Interpolated areas, where shown, are a visualisation aid and are not measurement data.',
    'A broadband amplitude detector cannot resolve frequency components; no spectral content is claimed.',
  ]
  limitations.forEach((line) => {
    const wrapped = doc.splitTextToSize(`• ${line}`, pageWidth - margin * 2) as string[]
    wrapped.forEach((w) => {
      text(w, margin, y, 8.5, INK)
      y += 12
    })
    y += 4
  })

  y += 10
  rule(y)
  y += 14
  text(
    `Calibration/baseline: ${settings.acquisition.unit} · ADC full scale ${settings.acquisition.adc_max} · averaging window ${settings.acquisition.averaging_window} samples · saturation threshold ${settings.acquisition.saturated_at}`,
    margin,
    y,
    7.5,
    MUTED,
  )
  y += 11
  text(
    `Saturation and stability rules: values ≥ ${settings.acquisition.saturated_at} counts are flagged saturated; peak-to-peak spread > ${settings.acquisition.unstable_spread_pct}% over ${settings.acquisition.averaging_window} frames is flagged unstable.`,
    margin,
    y,
    7.5,
    MUTED,
  )

  const report: Report = {
    report_id: reportId,
    scan_id: scan.scan_id,
    created_at: new Date().toISOString(),
    export_format: 'PDF',
    file_metadata: { filename: '', bytes: 0, measurements: rows.length },
    notes: notes.trim(),
  }

  doc.setProperties({
    title: `EMI scan report — ${scan.scan_name}`,
    subject: 'Relative near-field EMI scan summary',
    author: 'EMI Hotspot Mapper',
    creator: 'EMI Hotspot Mapper 1.0.0',
  })

  return { report, pdf: doc }
}
