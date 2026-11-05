import { useMemo, useState } from 'react'
import { Ban, Download, Filter, Search, Table2, Trash2, X } from 'lucide-react'
import { useApp } from '../store/app'
import {
  Badge,
  Button,
  EmptyState,
  KeyValue,
  Panel,
  PanelHeader,
  Select,
  TextInput,
  cn,
  type Tone,
} from '../components/ui'
import { downloadText, measurementsToCsv, stamp } from '../lib/csv'
import { formatDateTime, formatNumber, probeLabel } from '../lib/derive'
import type { Measurement, ProbeType, QualityStatus } from '../lib/types'

function qualityTone(q: QualityStatus): Tone {
  return q === 'VALID' ? 'ok' : q === 'UNSTABLE' ? 'warn' : q === 'SATURATED' ? 'danger' : 'danger'
}

type SortKey = 'timestamp' | 'signal' | 'coordinate'

export function DataLog() {
  const { measurements, scans, settings, deleteMeasurements, markInvalid, notify } = useApp()
  const [query, setQuery] = useState('')
  const [probeFilter, setProbeFilter] = useState<'ALL' | ProbeType>('ALL')
  const [qualityFilter, setQualityFilter] = useState<'ALL' | QualityStatus>('ALL')
  const [scanFilter, setScanFilter] = useState('ALL')
  const [sort, setSort] = useState<SortKey>('timestamp')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<Measurement | null>(null)

  const scanName = useMemo(() => new Map(scans.map((s) => [s.scan_id, s.scan_name])), [scans])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : null
    const rows = measurements.filter((m) => {
      if (probeFilter !== 'ALL' && m.probe_type !== probeFilter) return false
      if (qualityFilter !== 'ALL' && m.quality_status !== qualityFilter) return false
      if (scanFilter !== 'ALL' && m.scan_id !== scanFilter) return false
      const ts = new Date(m.timestamp).getTime()
      if (fromTs !== null && ts < fromTs) return false
      if (toTs !== null && ts > toTs) return false
      if (!q) return true
      const haystack = [
        m.measurement_id,
        m.scan_id ?? '',
        m.scan_id ? (scanName.get(m.scan_id) ?? '') : '',
        m.probe_id,
        m.probe_type,
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
    return rows.sort((a, b) => {
      if (sort === 'signal') return b.signal_raw - a.signal_raw
      if (sort === 'coordinate') {
        const ax = a.x_mm ?? -1
        const bx = b.x_mm ?? -1
        if (ax !== bx) return ax - bx
        return (a.y_mm ?? -1) - (b.y_mm ?? -1)
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    })
  }, [measurements, query, probeFilter, qualityFilter, scanFilter, sort, from, to, scanName])

  const allSelected = filtered.length > 0 && selected.length === filtered.length

  const toggleAll = () => setSelected(allSelected ? [] : filtered.map((m) => m.measurement_id))
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const exportRows = () => {
    const rows = selected.length > 0 ? filtered.filter((m) => selected.includes(m.measurement_id)) : filtered
    if (rows.length === 0) return
    const csv = measurementsToCsv(rows, scans, settings.export_defaults.csv_delimiter)
    downloadText(`emi-measurements-${stamp()}.csv`, csv)
    notify('ok', 'CSV exported', `${rows.length} measurements with provenance columns.`)
  }

  const removeSelected = () => {
    if (selected.length === 0) return
    if (!window.confirm(`Delete ${selected.length} measurement(s)? This cannot be undone.`)) return
    void deleteMeasurements(selected)
    setSelected([])
    notify('warn', 'Measurements deleted', `${selected.length} record(s) removed from local storage.`)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2.5">
            <div className="relative min-w-[190px] flex-1">
              <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-dim" />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search reading ID, scan name or scan ID"
                className="h-8 pl-8 text-[11.5px]"
              />
            </div>
            <Select className="h-8 w-auto text-[11px]" value={scanFilter} onChange={(e) => setScanFilter(e.target.value)}>
              <option value="ALL">All scans</option>
              {scans.map((s) => (
                <option key={s.scan_id} value={s.scan_id}>
                  {s.scan_name}
                </option>
              ))}
            </Select>
            <Select
              className="h-8 w-auto text-[11px]"
              value={probeFilter}
              onChange={(e) => setProbeFilter(e.target.value as typeof probeFilter)}
            >
              <option value="ALL">Any probe</option>
              <option value="E_FIELD">E-field</option>
              <option value="H_FIELD">H-field</option>
            </Select>
            <Select
              className="h-8 w-auto text-[11px]"
              value={qualityFilter}
              onChange={(e) => setQualityFilter(e.target.value as typeof qualityFilter)}
            >
              <option value="ALL">Any quality</option>
              <option value="VALID">Valid</option>
              <option value="UNSTABLE">Unstable</option>
              <option value="SATURATED">Saturated</option>
              <option value="INVALID">Invalid</option>
            </Select>
            <Select className="h-8 w-auto text-[11px]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="timestamp">Newest first</option>
              <option value="signal">Highest signal</option>
              <option value="coordinate">By coordinate</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
            <Filter size={12} className="text-ink-dim" />
            <span className="label-caps !text-[9px]">Date range</span>
            <TextInput
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-7 w-[132px] px-2 text-[11px]"
            />
            <span className="text-[10.5px] text-ink-dim">to</span>
            <TextInput
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-7 w-[132px] px-2 text-[11px]"
            />
            {(from || to || query || probeFilter !== 'ALL' || qualityFilter !== 'ALL' || scanFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setFrom('')
                  setTo('')
                  setQuery('')
                  setProbeFilter('ALL')
                  setQualityFilter('ALL')
                  setScanFilter('ALL')
                }}
                className="inline-flex items-center gap-1 text-[10.5px] text-accent hover:underline"
              >
                <X size={10} /> reset
              </button>
            )}
            <span className="ml-auto tabular text-[10.5px] text-ink-dim">
              {filtered.length} of {measurements.length} records
            </span>
            <Button size="sm" icon={<Download size={12} />} onClick={exportRows} disabled={filtered.length === 0}>
              {selected.length > 0 ? `Export ${selected.length}` : 'Export CSV'}
            </Button>
            <Button size="sm" variant="danger" icon={<Trash2 size={12} />} onClick={removeSelected} disabled={selected.length === 0}>
              Delete
            </Button>
          </div>

          {measurements.length === 0 ? (
            <div className="px-4 py-4">
              <EmptyState icon={<Table2 size={28} />} title="No measurements recorded" compact>
                Readings appear here the moment one is captured on Live Scan or the Heatmap. There is no seeded or
                sample data in this build.
              </EmptyState>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-[11px] text-ink-dim">No records match these filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[11.5px]">
                <thead>
                  <tr className="border-b border-line-soft text-left">
                    <th className="w-8 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Select all"
                        className="h-3 w-3 accent-accent"
                      />
                    </th>
                    {['Reading', 'Scan', 'Probe', 'X / Y (mm)', 'Signal', 'Quality', 'Timestamp'].map((h) => (
                      <th key={h} className="label-caps px-2 py-2 !text-[9px] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 400).map((m) => (
                    <tr
                      key={m.measurement_id}
                      onClick={() => setDetail(m)}
                      className={cn(
                        'cursor-pointer border-b border-line-soft/60 transition-colors hover:bg-panel-raised/60',
                        detail?.measurement_id === m.measurement_id && 'bg-panel-raised',
                      )}
                    >
                      <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.includes(m.measurement_id)}
                          onChange={() => toggle(m.measurement_id)}
                          aria-label={`Select ${m.measurement_id}`}
                          className="h-3 w-3 accent-accent"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-[10.5px] text-ink-muted">{m.measurement_id}</td>
                      <td className="max-w-[150px] truncate px-2 py-1.5 text-ink-muted">
                        {m.scan_id ? (scanName.get(m.scan_id) ?? m.scan_id) : <span className="text-ink-dim">unassigned</span>}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={m.probe_type === 'E_FIELD' ? 'text-efield' : 'text-hfield'}>
                          {probeLabel(m.probe_type)}
                        </span>
                      </td>
                      <td className="tabular px-2 py-1.5 text-ink-muted">
                        {m.x_mm !== null ? `${m.x_mm} / ${m.y_mm}` : '—'}
                      </td>
                      <td className="tabular px-2 py-1.5 text-ink">
                        {formatNumber(m.signal_raw)}
                        <span className="ml-1 text-[9.5px] text-ink-dim">{m.unit}</span>
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge tone={qualityTone(m.quality_status)}>{m.quality_status}</Badge>
                      </td>
                      <td className="tabular px-2 py-1.5 text-[10.5px] text-ink-dim">{formatDateTime(m.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 400 ? (
                <div className="px-3 py-2 text-[10.5px] text-ink-dim">
                  Showing the first 400 of {filtered.length} records — narrow the filters to inspect the rest. Exports
                  always include every matching row.
                </div>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Reading detail"
            subtitle={detail ? detail.measurement_id : 'Select a row to inspect provenance'}
          />
          {!detail ? (
            <div className="px-4 py-8 text-center text-[11px] leading-relaxed text-ink-dim">
              Every reading carries its probe, scan, coordinate, timestamp, quality and acquisition settings.
            </div>
          ) : (
            <div className="px-4 py-3">
              <div className="mb-2 flex items-center gap-2">
                <Badge tone={qualityTone(detail.quality_status)}>{detail.quality_status}</Badge>
                <Badge tone={detail.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>{probeLabel(detail.probe_type)}</Badge>
                {detail.acquisition_metadata.superseded_by ? <Badge tone="warn">SUPERSEDED</Badge> : null}
              </div>
              <KeyValue label="Reading ID" value={<span className="font-mono text-[10.5px]">{detail.measurement_id}</span>} />
              <KeyValue label="Scan" value={detail.scan_id ?? 'unassigned'} mono />
              <KeyValue label="Probe ID" value={detail.probe_id} mono />
              <KeyValue label="Coordinate" value={detail.x_mm !== null ? `${detail.x_mm}, ${detail.y_mm} mm` : 'not mapped'} />
              <KeyValue label="Raw signal" value={`${formatNumber(detail.signal_raw)} ${detail.unit}`} mono />
              <KeyValue
                label="Processed"
                value={
                  detail.signal_processed !== null
                    ? `${formatNumber(detail.signal_processed, 1)} (${detail.acquisition_metadata.processed_source.toLowerCase()})`
                    : '—'
                }
                mono
              />
              <KeyValue label="Timestamp" value={formatDateTime(detail.timestamp)} mono />
              <KeyValue label="Device" value={detail.device_id ?? '—'} mono />
              <KeyValue label="Profile" value={detail.calibration_profile_id ?? 'none'} mono />
              <KeyValue
                label="Baseline / gain"
                value={`${detail.acquisition_metadata.baseline_value ?? '—'} / ${detail.acquisition_metadata.gain_setting ?? '—'}`}
                mono
              />
              <KeyValue label="ADC full scale" value={detail.acquisition_metadata.adc_max} mono />
              <KeyValue label="Averaging" value={detail.acquisition_metadata.averaging_window ?? '—'} mono />
              <KeyValue label="Firmware state" value={detail.acquisition_metadata.firmware_signal_state ?? '—'} />
              {detail.acquisition_metadata.superseded_by ? (
                <div className="mt-2 rounded-md border border-elevated/30 bg-elevated/8 px-2 py-1.5 text-[10.5px] text-elevated">
                  Replaced by {detail.acquisition_metadata.superseded_by} when the cell was re-measured.
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Ban size={11} />}
                  disabled={detail.quality_status === 'INVALID'}
                  onClick={() => {
                    void markInvalid(detail.measurement_id)
                    setDetail({ ...detail, quality_status: 'INVALID' })
                    notify('warn', 'Marked invalid', `${detail.measurement_id} excluded from valid statistics.`)
                  }}
                >
                  Mark invalid
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={11} />}
                  onClick={() => {
                    if (!window.confirm(`Delete ${detail.measurement_id}?`)) return
                    void deleteMeasurements([detail.measurement_id])
                    setDetail(null)
                    setSelected((s) => s.filter((id) => id !== detail.measurement_id))
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </Panel>

        <Panel className="px-3 py-2.5">
          <div className="label-caps mb-1.5">Quality codes</div>
          <div className="space-y-1.5 text-[10.5px] leading-relaxed text-ink-dim">
            <div className="flex gap-2">
              <Badge tone="ok">VALID</Badge>
              <span>Within range and stable at capture.</span>
            </div>
            <div className="flex gap-2">
              <Badge tone="warn">UNSTABLE</Badge>
              <span>Peak-to-peak spread exceeded the limit.</span>
            </div>
            <div className="flex gap-2">
              <Badge tone="danger">SATURATED</Badge>
              <span>At or above the saturation count.</span>
            </div>
            <div className="flex gap-2">
              <Badge tone="danger">INVALID</Badge>
              <span>Excluded from valid statistics.</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  )
}
