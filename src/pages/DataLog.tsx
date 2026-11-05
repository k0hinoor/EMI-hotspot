import { useMemo, useState } from 'react'
import { Ban, Download, Filter, Search, Table2, Trash2, X } from 'lucide-react'
import { useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  Frame,
  FrameBody,
  FrameFooter,
  FrameHeader,
  KeyValue,
  Select,
  TextInput,
  cn,
  type Tone,
} from '../components/ui'
import { downloadText, measurementsToCsv, stamp } from '../lib/csv'
import { formatDateTime, formatNumber, probeLabel } from '../lib/derive'
import type { Measurement, ProbeType, QualityStatus } from '../lib/types'

function qualityTone(q: QualityStatus): Tone {
  return q === 'VALID' ? 'ok' : q === 'UNSTABLE' ? 'warn' : 'danger'
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
  const filteredActive = query || probeFilter !== 'ALL' || qualityFilter !== 'ALL' || scanFilter !== 'ALL' || from || to

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : null
    return measurements
      .filter((m) => {
        if (probeFilter !== 'ALL' && m.probe_type !== probeFilter) return false
        if (qualityFilter !== 'ALL' && m.quality_status !== qualityFilter) return false
        if (scanFilter !== 'ALL' && m.scan_id !== scanFilter) return false
        const ts = new Date(m.timestamp).getTime()
        if (fromTs !== null && ts < fromTs) return false
        if (toTs !== null && ts > toTs) return false
        if (!q) return true
        return [m.measurement_id, m.scan_id ?? '', m.scan_id ? (scanName.get(m.scan_id) ?? '') : '', m.probe_id, m.probe_type]
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
      .sort((a, b) => {
        if (sort === 'signal') return b.signal_raw - a.signal_raw
        if (sort === 'coordinate') {
          const ax = a.x_mm ?? -1
          const bx = b.x_mm ?? -1
          return ax !== bx ? ax - bx : (a.y_mm ?? -1) - (b.y_mm ?? -1)
        }
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      })
  }, [measurements, query, probeFilter, qualityFilter, scanFilter, sort, from, to, scanName])

  const allSelected = filtered.length > 0 && selected.length === filtered.length
  const resetFilters = () => {
    setFrom('')
    setTo('')
    setQuery('')
    setProbeFilter('ALL')
    setQualityFilter('ALL')
    setScanFilter('ALL')
  }

  const exportRows = () => {
    const rows = selected.length > 0 ? filtered.filter((m) => selected.includes(m.measurement_id)) : filtered
    if (rows.length === 0) return
    downloadText(`emi-measurements-${stamp()}.csv`, measurementsToCsv(rows, scans, settings.export_defaults.csv_delimiter))
    notify('ok', 'CSV exported', `${rows.length} measurements with provenance columns.`)
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 max-xl:h-auto xl:grid-cols-[minmax(0,1fr)_262px]">
      <Frame className="min-h-[420px] xl:min-h-0">
        <FrameHeader
          title="Measurement log"
          subtitle={`${filtered.length} of ${measurements.length} records · every row carries its provenance`}
          icon={<Table2 size={12} />}
          right={
            <>
              <Button size="sm" icon={<Download size={10} />} onClick={exportRows} disabled={filtered.length === 0}>
                {selected.length > 0 ? `Export ${selected.length}` : 'Export CSV'}
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={10} />}
                onClick={() => {
                  if (selected.length === 0) return
                  if (!window.confirm(`Delete ${selected.length} measurement(s)? This cannot be undone.`)) return
                  void deleteMeasurements(selected)
                  notify('warn', 'Measurements deleted', `${selected.length} record(s) removed.`)
                  setSelected([])
                }}
                disabled={selected.length === 0}
              >
                Delete
              </Button>
            </>
          }
        />

        {/* Filter bar */}
        <div className="shrink-0 space-y-1.5 border-b border-white/[0.06] px-2 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative min-w-[150px] flex-1">
              <Search size={11} className="absolute top-1/2 left-2 -translate-y-1/2 text-ink-dim" />
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Reading ID, scan name or scan ID"
                className="pl-7 text-[11px]"
              />
            </div>
            <Select className="h-7 w-auto text-[10.5px]" value={scanFilter} onChange={(e) => setScanFilter(e.target.value)}>
              <option value="ALL">All scans</option>
              {scans.map((s) => (
                <option key={s.scan_id} value={s.scan_id}>
                  {s.scan_name}
                </option>
              ))}
            </Select>
            <Select
              className="h-7 w-auto text-[10.5px]"
              value={probeFilter}
              onChange={(e) => setProbeFilter(e.target.value as typeof probeFilter)}
            >
              <option value="ALL">Any probe</option>
              <option value="E_FIELD">E-field</option>
              <option value="H_FIELD">H-field</option>
            </Select>
            <Select
              className="h-7 w-auto text-[10.5px]"
              value={qualityFilter}
              onChange={(e) => setQualityFilter(e.target.value as typeof qualityFilter)}
            >
              <option value="ALL">Any quality</option>
              <option value="VALID">Valid</option>
              <option value="UNSTABLE">Unstable</option>
              <option value="SATURATED">Saturated</option>
              <option value="INVALID">Invalid</option>
            </Select>
            <Select className="h-7 w-auto text-[10.5px]" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="timestamp">Newest</option>
              <option value="signal">Highest</option>
              <option value="coordinate">By cell</option>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter size={10} className="text-ink-dim" />
            <span className="label-caps">date</span>
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-6 w-[118px] px-1.5 text-[10px]" />
            <span className="text-[9.5px] text-ink-dim">→</span>
            <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-6 w-[118px] px-1.5 text-[10px]" />
            {filteredActive ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 text-[9.5px] text-teal hover:underline"
              >
                <X size={9} /> reset
              </button>
            ) : null}
            {selected.length > 0 ? <span className="text-[9.5px] text-ink-muted">{selected.length} selected</span> : null}
          </div>
        </div>

        <FrameBody noPad>
          {measurements.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <Table2 size={22} className="mb-2 text-ink-dim/50" />
              <div className="text-[11.5px] font-medium text-ink-muted">No measurements recorded</div>
              <p className="mt-1 max-w-sm text-[10.5px] leading-relaxed text-ink-dim">
                Rows appear the moment a reading is captured on Live Scan or the Heatmap. There is no seeded or sample
                data in this build.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[10.5px] text-ink-dim">
              No records match these filters.
            </div>
          ) : (
            <table className="w-full border-collapse text-[10.5px]">
              <thead className="sticky top-0 z-10 bg-white/[0.03]">
                <tr className="border-b border-white/[0.06] text-left">
                  <th className="w-6 px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? [] : filtered.map((m) => m.measurement_id))}
                      aria-label="Select all"
                      className="h-2.5 w-2.5 accent-accent"
                    />
                  </th>
                  {['Reading', 'Scan', 'Probe', 'X / Y', 'Signal', 'Quality', 'Timestamp'].map((h) => (
                    <th key={h} className="label-caps px-1.5 py-1.5 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr
                    key={m.measurement_id}
                    onClick={() => setDetail(m)}
                    className={cn(
                      'cursor-pointer border-b border-white/[0.06]/50 transition-colors hover:bg-white/[0.06]/60',
                      detail?.measurement_id === m.measurement_id && 'bg-white/[0.06]',
                    )}
                  >
                    <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.includes(m.measurement_id)}
                        onChange={() =>
                          setSelected((s) =>
                            s.includes(m.measurement_id) ? s.filter((x) => x !== m.measurement_id) : [...s, m.measurement_id],
                          )
                        }
                        aria-label={`Select ${m.measurement_id}`}
                        className="h-2.5 w-2.5 accent-accent"
                      />
                    </td>
                    <td className="px-1.5 py-1 font-mono text-[9.5px] text-ink-muted">{m.measurement_id}</td>
                    <td className="max-w-[130px] truncate px-1.5 py-1 text-ink-muted">
                      {m.scan_id ? (scanName.get(m.scan_id) ?? m.scan_id) : <span className="text-ink-dim">unassigned</span>}
                    </td>
                    <td className={cn('px-1.5 py-1', m.probe_type === 'E_FIELD' ? 'text-efield' : 'text-hfield')}>
                      {probeLabel(m.probe_type)}
                    </td>
                    <td className="tabular px-1.5 py-1 text-ink-muted">{m.x_mm !== null ? `${m.x_mm} / ${m.y_mm}` : '—'}</td>
                    <td className="tabular px-1.5 py-1 text-ink">{formatNumber(m.signal_raw)}</td>
                    <td className="px-1.5 py-1">
                      <Badge tone={qualityTone(m.quality_status)}>{m.quality_status}</Badge>
                    </td>
                    <td className="tabular px-1.5 py-1 text-[9.5px] text-ink-dim">{formatDateTime(m.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </FrameBody>
        <FrameFooter className="justify-between">
          <span className="text-[9px] text-ink-dim">
            {filtered.length} of {measurements.length} rows · exports include every matching row
          </span>
          <span className="text-[9px] text-ink-dim">quality codes: valid · unstable · saturated · invalid</span>
        </FrameFooter>
      </Frame>

      <Frame className="min-h-0">
        <FrameHeader title="Reading detail" subtitle={detail ? detail.measurement_id : 'select a row'} />
        <FrameBody className="p-2.5">
          {!detail ? (
            <div className="space-y-2">
              <p className="text-[10px] leading-relaxed text-ink-dim">
                Every reading carries its probe, scan, coordinate, timestamp, quality and acquisition settings.
              </p>
              <Divider />
              <div className="space-y-1">
                <QualityRow tone="ok" label="VALID" text="within range and stable at capture" />
                <QualityRow tone="warn" label="UNSTABLE" text="peak-to-peak spread above limit" />
                <QualityRow tone="danger" label="SATURATED" text="at or above saturation count" />
                <QualityRow tone="danger" label="INVALID" text="excluded from valid statistics" />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1">
                <Badge tone={qualityTone(detail.quality_status)}>{detail.quality_status}</Badge>
                <Badge tone={detail.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>{probeLabel(detail.probe_type)}</Badge>
                {detail.acquisition_metadata.superseded_by ? <Badge tone="warn">SUPERSEDED</Badge> : null}
              </div>
              <div>
                <KeyValue label="Reading" value={detail.measurement_id} mono />
                <KeyValue label="Scan" value={detail.scan_id ?? 'unassigned'} mono />
                <KeyValue label="Probe" value={detail.probe_id} mono />
                <KeyValue label="Coordinate" value={detail.x_mm !== null ? `${detail.x_mm}, ${detail.y_mm} mm` : 'not mapped'} mono />
                <KeyValue label="Raw signal" value={`${formatNumber(detail.signal_raw)} ${detail.unit}`} mono />
                <KeyValue
                  label="Processed"
                  value={
                    detail.signal_processed !== null
                      ? `${formatNumber(detail.signal_processed, 1)} · ${detail.acquisition_metadata.processed_source.toLowerCase()}`
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
              </div>
              {detail.acquisition_metadata.superseded_by ? (
                <div className="rounded-[5px] border border-elevated/25 bg-elevated/6 px-2 py-1 text-[9.5px] leading-snug text-elevated">
                  Replaced by {detail.acquisition_metadata.superseded_by} when the cell was re-measured.
                </div>
              ) : null}
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  icon={<Ban size={10} />}
                  disabled={detail.quality_status === 'INVALID'}
                  onClick={() => {
                    void markInvalid(detail.measurement_id)
                    setDetail({ ...detail, quality_status: 'INVALID' })
                    notify('warn', 'Marked invalid', `${detail.measurement_id} excluded from valid statistics.`)
                  }}
                >
                  Invalid
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={10} />}
                  onClick={() => {
                    if (!window.confirm(`Delete ${detail.measurement_id}?`)) return
                    void deleteMeasurements([detail.measurement_id])
                    setSelected((s) => s.filter((id) => id !== detail.measurement_id))
                    setDetail(null)
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          )}
        </FrameBody>
      </Frame>
    </div>
  )
}

function QualityRow({ tone, label, text }: { tone: Tone; label: string; text: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <Badge tone={tone}>{label}</Badge>
      <span className="mt-[1px] text-[9.5px] leading-snug text-ink-dim">{text}</span>
    </div>
  )
}
