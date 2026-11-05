import type { Measurement, Scan } from './types'

/** RFC 4180 escaping. */
function cell(value: unknown, delimiter: string): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (text.includes(delimiter) || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export const MEASUREMENT_COLUMNS = [
  'measurement_id',
  'scan_id',
  'scan_name',
  'probe_id',
  'probe_type',
  'x_mm',
  'y_mm',
  'signal_raw',
  'signal_processed',
  'processed_source',
  'unit',
  'timestamp',
  'quality_status',
  'calibration_profile_id',
  'baseline_value',
  'gain_setting',
  'adc_max',
  'averaging_window',
  'sample_count',
  'device_id',
  'superseded_by',
] as const

export function measurementsToCsv(
  measurements: Measurement[],
  scans: Scan[],
  delimiter: ',' | ';' = ',',
): string {
  const scanName = new Map(scans.map((s) => [s.scan_id, s.scan_name]))
  const lines = [MEASUREMENT_COLUMNS.join(delimiter)]
  for (const m of measurements) {
    lines.push(
      [
        m.measurement_id,
        m.scan_id ?? '',
        m.scan_id ? (scanName.get(m.scan_id) ?? '') : '',
        m.probe_id,
        m.probe_type,
        m.x_mm ?? '',
        m.y_mm ?? '',
        m.signal_raw,
        m.signal_processed ?? '',
        m.acquisition_metadata.processed_source,
        m.unit,
        m.timestamp,
        m.quality_status,
        m.calibration_profile_id ?? '',
        m.acquisition_metadata.baseline_value ?? '',
        m.acquisition_metadata.gain_setting ?? '',
        m.acquisition_metadata.adc_max,
        m.acquisition_metadata.averaging_window ?? '',
        m.acquisition_metadata.sample_count ?? '',
        m.device_id ?? '',
        m.acquisition_metadata.superseded_by ?? '',
      ]
        .map((v) => cell(v, delimiter))
        .join(delimiter),
    )
  }
  return lines.join('\r\n')
}

/** Header block used for the JSON export so provenance travels with the data. */
export function buildExportEnvelope(measurements: Measurement[], scans: Scan[]) {
  return {
    exported_at: new Date().toISOString(),
    application: 'EMI Hotspot Mapper',
    application_version: '1.0.0',
    unit_note:
      'Signal values are relative ADC counts from the detector. They are not calibrated field-strength values.',
    scans,
    measurements,
  }
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  triggerDownload(filename, URL.createObjectURL(blob))
}

export function downloadBlob(filename: string, blob: Blob) {
  triggerDownload(filename, URL.createObjectURL(blob))
}

function triggerDownload(filename: string, url: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function stamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
}
