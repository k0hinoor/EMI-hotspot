/**
 * Data model — mirrors PRD §11.
 *
 * Every field that exists here exists for provenance: a reading must be traceable
 * to probe, scan, coordinate, timestamp and acquisition settings.
 */

export type ProbeType = 'E_FIELD' | 'H_FIELD'

/** Quality of an individual captured measurement (PRD §12.4). */
export type QualityStatus = 'VALID' | 'UNSTABLE' | 'SATURATED' | 'INVALID'

/** Lifecycle of a hardware reading, derived from the latest frame. */
export type SignalState = 'UNKNOWN' | 'STABLE' | 'UNSTABLE' | 'SATURATED' | 'STALE' | 'INVALID'

/** Device connection state (PRD §12.1). */
export type DeviceState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR'

/** Scan lifecycle (PRD §12.3). */
export type ScanStatus = 'IDLE' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED'

export type Transport = 'WEB_SERIAL' | 'WEB_USB' | 'SERIAL_BRIDGE'

/** PRD §11.1 */
export interface DeviceRecord {
  device_id: string
  firmware_version: string | null
  protocol_version: number | null
  last_connected_at: string
  device_metadata: Record<string, string | number | boolean>
}

/** PRD §11.2 */
export interface Probe {
  probe_id: string
  probe_type: ProbeType
  label: string
  connector_type: string
  /** Free-form physical dimensions, e.g. 20 mm monopole / 10 mm loop. */
  physical_dimensions: string
  profile_id: string | null
  created_at: string
}

/** PRD §11.5 */
export interface CalibrationProfile {
  profile_id: string
  probe_id: string
  probe_type: ProbeType
  label: string
  /** Baseline / noise floor in the acquisition unit. */
  baseline_value: number
  gain_setting: number
  /** Baseline correction is NOT absolute field-strength calibration (PRD §7.6). */
  reference_method: string
  calibration_date: string
  notes: string
}

/** PRD §11.3 */
export interface Scan {
  scan_id: string
  scan_name: string
  board_width_mm: number
  board_height_mm: number
  grid_spacing_mm: number
  probe_id: string
  probe_type: ProbeType
  started_at: string
  completed_at: string | null
  status: ScanStatus
  notes: string
  origin: 'TOP_LEFT' | 'BOTTOM_LEFT'
  calibration_profile_id: string | null
  /** True only for records produced by Demo Mode (PRD §12.7). */
  is_demo?: boolean
}

/** PRD §11.4 */
export interface Measurement {
  measurement_id: string
  scan_id: string | null
  probe_id: string
  probe_type: ProbeType
  x_mm: number | null
  y_mm: number | null
  signal_raw: number
  signal_processed: number | null
  unit: string
  timestamp: string
  quality_status: QualityStatus
  calibration_profile_id: string | null
  acquisition_metadata: AcquisitionMetadata
  device_id: string | null
  /** True only for records produced by Demo Mode (PRD §12.7). */
  is_demo?: boolean
}

export interface AcquisitionMetadata {
  probe_type: ProbeType
  sample_count: number | null
  /** Acquisition settings in force at capture time. */
  adc_max: number
  averaging_window: number | null
  /** Present only when the firmware reported it. */
  firmware_signal_state: string | null
  /** Where signal_processed came from — firmware or a computed average. */
  processed_source: 'FIRMWARE' | 'COMPUTED' | 'NONE'
  /** Set when a re-measurement replaced this reading in the same cell. */
  superseded_by: string | null
  baseline_value: number | null
  gain_setting: number | null
}

/** PRD §11.6 */
export interface Report {
  report_id: string
  scan_id: string
  created_at: string
  export_format: 'PDF' | 'CSV' | 'JSON'
  file_metadata: { filename: string; bytes: number; measurements: number }
  notes: string
}

/** One parsed frame from the device, as received. */
export interface Sample {
  seq: number | null
  signal_raw: number
  signal_filtered: number | null
  sample_count: number | null
  probe_type: ProbeType | null
  quality: QualityStatus
  signal_state: SignalState
  received_at: string
  device_id: string | null
  firmware_version: string | null
  protocol_version: number | null
}

export interface LogEntry {
  id: string
  at: string
  direction: 'IN' | 'OUT' | 'SYS' | 'ERR'
  text: string
  bytes?: number
}

export interface AcquisitionSettings {
  /** Full-scale ADC count used to validate raw values. */
  adc_max: number
  unit: string
  sample_rate_hz: number
  averaging_window: number
  stale_after_ms: number
  /** Raw values at or above this are flagged SATURATED. */
  saturated_at: number
  /** Peak-to-peak spread (%) above this is flagged UNSTABLE. */
  unstable_spread_pct: number
  /** Minimum samples before a stability verdict is issued. */
  stability_min_samples: number
  graph_window_s: number
}

export interface AppSettings {
  baud_rate: number
  acquisition: AcquisitionSettings
  /** Show interpolated surface on the heatmap (clearly marked as derived). */
  interpolation: boolean
  export_defaults: { csv_delimiter: ',' | ';' }
}

export interface SessionInfo {
  device_id: string | null
  firmware_version: string | null
  protocol_version: number | null
  transport: Transport | null
  last_message_at: string | null
  connected_at: string | null
}
