import { useMemo, useState } from 'react'
import { CircleAlert, Download, FileDown, FileText, Info, Layers, ScanLine } from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  Button,
  EmptyState,
  KeyValue,
  Notice,
  Panel,
  PanelHeader,
  Select,
  Switch,
  TextInput,
  cn,
} from '../components/ui'
import { buildHeatmapView } from '../lib/heatmap'
import { cellCoordinate, formatDateTime, formatNumber, gridGeometry, probeLabel, summariseScan } from '../lib/derive'
import { downloadBlob, downloadText, measurementsToCsv, stamp } from '../lib/csv'
import { buildMeasurementRows, generateReport } from '../lib/pdf'

export function Reports() {
  const {
    scans,
    measurements,
    settings,
    session,
    reports,
    recordReport,
    notify,
    clearScanMeasurements,
  } = useApp()
  const [scanId, setScanId] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [includeInvalid, setIncludeInvalid] = useState(false)
  const [withInterpolation, setWithInterpolation] = useState(false)
  const [busy, setBusy] = useState(false)

  const scan = scans.find((s) => s.scan_id === (scanId || (scans[0]?.scan_id ?? ''))) ?? null
  const scanMeasurements = useMemo(() => (scan ? measurementsForScan(measurements, scan.scan_id) : []), [scan, measurements])

  const geometry = scan ? gridGeometry(scan.board_width_mm, scan.board_height_mm, scan.grid_spacing_mm) : null
  const summary = scan ? summariseScan(scanMeasurements, geometry?.totalCells ?? 0, settings.acquisition.unit) : null

  const preview = useMemo(() => {
    if (!scan) return null
    const view = buildHeatmapView(scan, scanMeasurements)
    const filled: { label: string; value: number }[] = []
    view.cells.forEach((row, r) =>
      row.forEach((m, c) => {
        if (!m) return
        filled.push({ label: cellCoordinate(view.geometry, c, r, scan.origin).label, value: m.signal_raw })
      }),
    )
    return filled.slice(0, 40)
  }, [scan, scanMeasurements])

  const handlePdf = async () => {
    if (!scan) return
    setBusy(true)
    try {
      const { report, pdf } = generateReport({
        scan,
        measurements: scanMeasurements,
        settings,
        deviceId: session.device_id,
        firmwareVersion: session.firmware_version,
        notes,
        includeInvalid,
        interpolation: withInterpolation,
      })
      const filename = `emi-report-${scan.scan_id}-${stamp()}.pdf`
      const blob = pdf.output('blob')
      const rowCount = buildMeasurementRows({
        scan,
        measurements: scanMeasurements,
        settings,
        deviceId: session.device_id,
        firmwareVersion: session.firmware_version,
        notes,
        includeInvalid,
        interpolation: withInterpolation,
      }).length
      downloadBlob(filename, blob)
      await recordReport({
        ...report,
        file_metadata: { filename, bytes: blob.size, measurements: rowCount },
      })
      notify('ok', 'PDF report generated', `${filename} · ${rowCount} rows`)
    } catch (err) {
      notify('error', 'Report generation failed', err instanceof Error ? err.message : 'Unknown error.')
    } finally {
      setBusy(false)
    }
  }

  const handleCsv = () => {
    if (!scan) return
    const rows = includeInvalid ? scanMeasurements : scanMeasurements.filter((m) => m.quality_status !== 'INVALID')
    if (rows.length === 0) {
      notify('warn', 'Nothing to export', 'This scan has no measurements yet.')
      return
    }
    downloadText(`emi-scan-${scan.scan_id}-${stamp()}.csv`, measurementsToCsv(rows, scans, settings.export_defaults.csv_delimiter))
    notify('ok', 'CSV exported', `${rows.length} measurements with metadata columns.`)
  }

  if (scans.length === 0) {
    return (
      <Panel className="px-4 py-4">
        <EmptyState icon={<FileText size={30} />} title="No scans to report">
          Reports are generated from real scans. Create a scan on the Heatmap page and capture measurements first.
        </EmptyState>
      </Panel>
    )
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Report configuration"
            subtitle="Reproducible summary of one scan"
            icon={<FileText size={13} />}
            right={
              scan ? <Badge tone={scan.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>{probeLabel(scan.probe_type)}</Badge> : null
            }
          />
          <div className="space-y-3 px-4 py-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Select value={scan?.scan_id ?? ''} onChange={(e) => setScanId(e.target.value)}>
                {scans.map((s) => (
                  <option key={s.scan_id} value={s.scan_id}>
                    {s.scan_name} · {s.scan_id} · {s.status}
                  </option>
                ))}
              </Select>
              <div className="flex gap-2">
                <Button variant="primary" icon={<FileDown size={13} />} disabled={busy || !summary || summary.measuredCells === 0} onClick={() => void handlePdf()}>
                  {busy ? 'Building…' : 'Generate PDF'}
                </Button>
                <Button icon={<Download size={13} />} disabled={scanMeasurements.length === 0} onClick={handleCsv}>
                  CSV
                </Button>
              </div>
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              <Switch
                checked={includeInvalid}
                onChange={setIncludeInvalid}
                label="Include invalid & superseded readings"
                description="When off, the report and CSV contain only countable readings."
              />
              <Switch
                checked={withInterpolation}
                onChange={setWithInterpolation}
                label="Include interpolated surface"
                description="Hatched overlay in the PDF heatmap; never counted as data."
              />
            </div>

            <div>
              <span className="label-caps mb-1.5 block">Report notes</span>
              <TextInput
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="DUT state, probe height, room conditions, operator…"
              />
            </div>

            {summary && summary.measuredCells === 0 ? (
              <Notice tone="warn" title="This scan has no measurements" icon={<CircleAlert size={13} />}>
                A report needs at least one captured reading. An empty report would only document the grid, not a
                measurement.
              </Notice>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Report contents" subtitle="What will be written into the PDF" icon={<ScanLine size={13} />} />
          <div className="grid gap-x-6 gap-y-0 px-4 py-2 sm:grid-cols-2">
            <KeyValue label="Scan" value={scan?.scan_name ?? '—'} />
            <KeyValue label="Scan ID" value={scan?.scan_id ?? '—'} mono />
            <KeyValue label="Test area" value={scan ? `${scan.board_width_mm} × ${scan.board_height_mm} mm` : '—'} />
            <KeyValue label="Grid" value={geometry ? `${geometry.cols} × ${geometry.rows} @ ${scan!.grid_spacing_mm} mm` : '—'} />
            <KeyValue label="Probe" value={scan ? `${probeLabel(scan.probe_type)} · ${scan.probe_id}` : '—'} />
            <KeyValue label="Profile" value={scan?.calibration_profile_id ?? 'none'} mono />
            <KeyValue label="Device" value={session.device_id ?? 'not recorded'} mono />
            <KeyValue label="Firmware" value={session.firmware_version ?? 'not recorded'} mono />
            <KeyValue label="Measured cells" value={summary ? `${summary.measuredCells} / ${summary.totalCells}` : '—'} />
            <KeyValue
              label="Valid / unstable"
              value={summary ? `${summary.valid} / ${summary.unstable}` : '—'}
            />
            <KeyValue label="Saturated / invalid" value={summary ? `${summary.saturated} / ${summary.invalid}` : '—'} />
            <KeyValue
              label="Maximum"
              value={summary?.max ? `${formatNumber(summary.max.signal_raw)} @ ${summary.max.x_mm}, ${summary.max.y_mm} mm` : '—'}
            />
            <KeyValue label="Mean (valid)" value={summary?.mean !== null && summary ? formatNumber(summary.mean, 1) : '—'} />
            <KeyValue label="Heatmap image" value={withInterpolation ? 'measured + interpolated' : 'measured cells'} />
            <KeyValue label="Measurement table" value={`${includeInvalid ? scanMeasurements.length : scanMeasurements.filter((m) => m.quality_status !== 'INVALID').length} rows`} />
            <KeyValue label="Limitations" value="included (page 3)" />
          </div>
        </Panel>

        {preview && preview.length > 0 ? (
          <Panel>
            <PanelHeader title="Measured cells preview" subtitle={`First ${preview.length} coordinates`} />
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {preview.map((cell) => (
                <span
                  key={cell.label}
                  className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-muted"
                >
                  {cell.label}
                  <span className="ml-1.5 text-ink">{cell.value}</span>
                </span>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>

      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Generated reports" subtitle="This machine only" icon={<Layers size={13} />} />
          {reports.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-dim">
              Report history appears after the first export.
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {reports.slice(0, 12).map((r) => {
                const s = scans.find((x) => x.scan_id === r.scan_id)
                return (
                  <li key={r.report_id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11.5px] text-ink">{s?.scan_name ?? r.scan_id}</span>
                      <Badge tone="neutral">{r.export_format}</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-[10px] text-ink-dim">
                      <span className="truncate font-mono">{r.file_metadata.filename || r.report_id}</span>
                      <span>{formatDateTime(r.created_at)}</span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-ink-dim">
                      {r.file_metadata.measurements} rows · {(r.file_metadata.bytes / 1024).toFixed(0)} kB
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Notice tone="neutral" title="Reports state their own limits" icon={<Info size={13} />}>
          Every PDF carries a limitations page: relative counts, manual positioning, no absolute field strength, and no
          frequency claim.
        </Notice>

        {scan && scanMeasurements.length > 0 ? (
          <Panel className="px-3 py-2.5">
            <div className="label-caps mb-1.5">Housekeeping</div>
            <p className="text-[10.5px] leading-relaxed text-ink-dim">
              Clearing measurements keeps the scan definition and its grid so it can be re-measured later.
            </p>
            <Button
              size="sm"
              variant="danger"
              className={cn('mt-2')}
              onClick={() => {
                if (window.confirm(`Clear ${scanMeasurements.length} measurements from ${scan.scan_name}?`)) {
                  void clearScanMeasurements(scan.scan_id)
                  notify('warn', 'Measurements cleared', 'Scan definition retained.')
                }
              }}
            >
              Clear scan measurements
            </Button>
          </Panel>
        ) : null}
      </div>
    </div>
  )
}
