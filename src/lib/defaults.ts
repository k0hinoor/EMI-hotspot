import type { AppSettings, Probe } from './types'

/**
 * Defaults follow the PRD: relative ADC counts, explicit averaging window,
 * explicit staleness rule. Nothing here implies absolute field strength.
 */
export const defaultSettings: AppSettings = {
  baud_rate: 115200,
  acquisition: {
    adc_max: 4095,
    unit: 'ADC counts',
    sample_rate_hz: 20,
    averaging_window: 32,
    stale_after_ms: 3000,
    saturated_at: 4090,
    unstable_spread_pct: 12,
    stability_min_samples: 10,
    graph_window_s: 30,
  },
  interpolation: false,
  export_defaults: { csv_delimiter: ',' },
}

export const defaultProbes: Probe[] = [
  {
    probe_id: 'probe-e01',
    probe_type: 'E_FIELD',
    label: 'Monopole E-field probe',
    connector_type: 'SMA / coax, common detector input',
    physical_dimensions: '≈20 mm exposed copper monopole',
    profile_id: 'cal-e01',
    created_at: new Date().toISOString(),
  },
  {
    probe_id: 'probe-h01',
    probe_type: 'H_FIELD',
    label: 'Loop H-field probe',
    connector_type: 'SMA / coax, common detector input',
    physical_dimensions: '≈10 mm copper loop (unshielded, first article)',
    profile_id: 'cal-h01',
    created_at: new Date().toISOString(),
  },
]

export function probeForType(probes: Probe[], type: 'E_FIELD' | 'H_FIELD'): Probe | undefined {
  return probes.find((p) => p.probe_type === type)
}
