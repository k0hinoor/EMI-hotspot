import { useMemo, useState } from 'react'
import { CircleAlert, Download, FileDown, FileText, Info, Layers } from 'lucide-react'
import { measurementsForScan, useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  Frame,
  FrameBody,
  FrameFooter,
  FrameHeader,
  KeyValue,
  Notice,
  Select,
  Switch,
  TextInput,
} from '../components/ui'
import { buildHeatmapView } from '../lib/heatmap'
import { cellCoordinate, formatDateTime, formatNumber, gridGeometry, probeLabel, summariseScan } from '../lib/derive'
import { downloadBlob, downloadText, measurementsToCsv, stamp } from '../lib/csv'
import { buildMeasurementRows, generateReport } from '../lib/pdf'

export function Reports() {
  const { scans, measurements, settings, session, reports, recordReport, notify, clearScanMeasurements } = useApp()
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
    if (!scan) return []
    const view = buildHeatmapView(scan, scanMeasurements)
    const filled: { label: string; value: number }[] = []
    view.cells.forEach((row, r) =>
      row.forEach((m, c) => {
        if (m) filled.push({ label: cellCoordinate(view.geometry, c, r, scan.origin).label, value: m.signal_raw })
      }),
    )
    return filled.slice(0, 24)
  }, [scan, scanMeasurements])

  const handlePdf = async () => {
    if (!scan) return
    setBusy(true)
    try {
      const input = {
        scan,
        measurements: scanMeasurements,
        settings,
        deviceId: session.device_id,
        firmwareVersion: session.firmware_version,
        notes,
        includeInvalid,
        interpolation: withInterpolation,
      }
      const { report, pdf } = generateReport(input)
      const filename = `emi-report-${scan.scan_id}-${stamp()}.pdf`
      const blob = pdf.output('blob')
      const rowCount = buildMeasurementRows(input).length
      downloadBlob(filename, blob)
      await recordReport({ ...report, file_metadata: { filename, bytes: blob.size, measurements: rowCount } })
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
      <Frame className="h-full">
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <FileText size={24} className="mb-2 text-ink-dim/50" />
          <div className="text-[12px] font-medium text-ink-muted">No scans to report</div>
          <p className="mt-1 max-w-sm text-[10.5px] leading-relaxed text-ink-dim">
            Reports are generated from real scans. Create a scan on the Heatmap page and capture measurements first.
          </p>
        </div>
      </Frame>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 max-xl:h-auto xl:grid-cols-[minmax(0,1fr)_262px]">
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none">
        <Frame className="shrink-0">
          <FrameHeader
            title="Report configuration"
            subtitle="reproducible summary of one scan"
            icon={<FileText size={12} />}
            right={scan ? <Badge tone={scan.probe_type === 'E_FIELD' ? 'efield' : 'hfield'}>{probeLabel(scan.probe_type)}</Badge> : null}
          />
          <div className="grid gap-2 p-2.5 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-2">
              <Select value={scan?.scan_id ?? ''} onChange={(e) => setScanId(e.target.value)}>
                {scans.map((s) => (
                  <option key={s.scan_id} value={s.scan_id}>
                    {s.scan_name} · {s.scan_id} · {s.status}
                  </option>
                ))}
              </Select>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Switch
                  checked={includeInvalid}
                  onChange={setIncludeInvalid}
                  label="Include invalid rows"
                  description="Off: countable readings only."
                />
                <Switch
                  checked={withInterpolation}
                  onChange={setWithInterpolation}
                  label="Interpolated heatmap"
                  description="Hatched overlay; never data."
                />
              </div>
              <TextInput
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Report notes · DUT state, probe height, operator…"
              />
            </div>
            <div className="flex shrink-0 flex-row gap-1.5 md:flex-col">
              <Button
                variant="primary"
                size="md"
                icon={<FileDown size={12} />}
                disabled={busy || !summary || summary.measuredCells === 0}
                onClick={() => void handlePdf()}
              >
                {busy ? 'Building…' : 'Generate PDF'}
              </Button>
              <Button size="md" icon={<Download size={12} />} disabled={scanMeasurements.length === 0} onClick={handleCsv}>
                CSV
              </Button>
            </div>
          </div>
          {summary && summary.measuredCells === 0 ? (
            <div className="px-2.5 pb-2.5">
              <Notice tone="warn" title="This scan has no measurements" icon={<CircleAlert size={11} />}>
                A report needs at least one captured reading — an empty report would document the grid, not a measurement.
              </Notice>
            </div>
          ) : null}
        </Frame>

        <Frame className="min-h-[300px] xl:min-h-0">
          <FrameHeader title="Report contents" subtitle="what the PDF will contain" icon={<Layers size={12} />} />
          <FrameBody className="p-2.5">
            <div className="grid gap-x-5 sm:grid-cols-2">
              <div>
                <KeyValue label="Scan" value={scan?.scan_name ?? '—'} />
                <KeyValue label="Scan ID" value={scan?.scan_id ?? '—'} mono />
                <KeyValue label="Test area" value={scan ? `${scan.board_width_mm} × ${scan.board_height_mm} mm` : '—'} />
                <KeyValue
                  label="Grid"
                  value={geometry && scan ? `${geometry.cols} × ${geometry.rows} @ ${scan.grid_spacing_mm} mm` : '—'}
                />
                <KeyValue label="Probe" value={scan ? `${probeLabel(scan.probe_type)} · ${scan.probe_id}` : '—'} />
                <KeyValue label="Profile" value={scan?.calibration_profile_id ?? 'none'} mono />
                <KeyValue label="Device" value={session.device_id ?? 'not recorded'} mono />
                <KeyValue label="Firmware" value={session.firmware_version ?? 'not recorded'} mono />
              </div>
              <div>
                <KeyValue label="Measured cells" value={summary ? `${summary.measuredCells} / ${summary.totalCells}` : '—'} />
                <KeyValue label="Valid / unstable" value={summary ? `${summary.valid} / ${summary.unstable}` : '—'} />
                <KeyValue label="Saturated / invalid" value={summary ? `${summary.saturated} / ${summary.invalid}` : '—'} />
                <KeyValue
                  label="Maximum"
                  value={summary?.max ? `${formatNumber(summary.max.signal_raw)} @ ${summary.max.x_mm}, ${summary.max.y_mm}` : '—'}
                />
                <KeyValue label="Mean (valid)" value={summary && summary.mean !== null ? formatNumber(summary.mean, 1) : '—'} />
                <KeyValue label="Heatmap" value={withInterpolation ? 'measured + interpolated' : 'measured cells'} />
                <KeyValue
                  label="Table rows"
                  value={
                    includeInvalid
                      ? scanMeasurements.length
                      : scanMeasurements.filter((m) => m.quality_status !== 'INVALID').length
                  }
                />
                <KeyValue label="Limitations" value="included page" />
              </div>
            </div>
            {preview.length > 0 ? (
              <>
                <Divider className="my-2" />
                <div className="label-caps mb-1">measured cells preview</div>
                <div className="flex flex-wrap gap-1">
                  {preview.map((cell) => (
                    <span
                      key={cell.label}
                      className="rounded-[4px] border border-line bg-canvas px-1 py-[1px] font-mono text-[9.5px] text-ink-muted"
                    >
                      {cell.label}
                      <span className="ml-1 text-ink">{cell.value}</span>
                    </span>
                  ))}
                </div>
              </>
            ) : null}
          </FrameBody>
        </Frame>
      </div>

      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-2.5">
        <Frame className="min-h-0">
          <FrameHeader title="Generated reports" subtitle="this machine only" icon={<Layers size={12} />} />
          <FrameBody noPad>
            {reports.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] leading-relaxed text-ink-dim">
                Report history appears after the first export.
              </div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {reports.map((r) => {
                  const s = scans.find((x) => x.scan_id === r.scan_id)
                  return (
                    <li key={r.report_id} className="px-2.5 py-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[10.5px] text-ink">{s?.scan_name ?? r.scan_id}</span>
                        <Badge tone="neutral">{r.export_format}</Badge>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-ink-dim">
                        <span className="truncate font-mono">{r.file_metadata.filename || r.report_id}</span>
                        <span className="shrink-0">{formatDateTime(r.created_at)}</span>
                      </div>
                      <div className="text-[9px] text-ink-dim">
                        {r.file_metadata.measurements} rows · {(r.file_metadata.bytes / 1024).toFixed(0)} kB
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </FrameBody>
          <FrameFooter>
            <Info size={10} className="shrink-0 text-ink-dim" />
            <span className="text-[9px] leading-snug text-ink-dim">
              Every PDF carries a limitations page: relative counts, manual positioning, no frequency claim.
            </span>
          </FrameFooter>
        </Frame>

        {scan && scanMeasurements.length > 0 ? (
          <Frame className="shrink-0">
            <div className="p-2.5">
              <div className="label-caps mb-1">housekeeping</div>
              <p className="text-[9.5px] leading-snug text-ink-dim">
                Clearing measurements keeps the scan definition and grid so it can be re-measured later.
              </p>
              <Button
                size="sm"
                variant="danger"
                block
                className="mt-1.5"
                onClick={() => {
                  if (window.confirm(`Clear ${scanMeasurements.length} measurements from ${scan.scan_name}?`)) {
                    void clearScanMeasurements(scan.scan_id)
                    notify('warn', 'Measurements cleared', 'Scan definition retained.')
                  }
                }}
              >
                Clear scan measurements
              </Button>
            </div>
          </Frame>
        ) : null}
      </div>
    </div>
  )
}
