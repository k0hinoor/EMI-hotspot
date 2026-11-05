import { useState } from 'react'
import {
  Activity,
  CircleAlert,
  Database,
  HardDriveDownload,
  Plug,
  RefreshCw,
  Save,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Usb,
} from 'lucide-react'
import { useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  Field,
  KeyValue,
  Notice,
  NumberInput,
  Panel,
  PanelHeader,
  Select,
  Switch,
  TextInput,
  cn,
} from '../components/ui'
import { ConnectDialog } from '../components/ConnectDialog'
import { formatDateTime, relativeTime } from '../lib/derive'
import { buildExportEnvelope, downloadText, stamp } from '../lib/csv'

export function Settings() {
  const {
    settings,
    updateSettings,
    updateAcquisition,
    saveSettings,
    webSerialSupported,
    bridgeSupported,
    ports,
    refreshPorts,
    deviceState,
    session,
    log,
    sendCommand,
    measurements,
    scans,
    reports,
    clearScanMeasurements,
    deleteScan,
    notify,
    samplesReceived,
    framesRejected,
    storageOk,
  } = useApp()

  const [connectOpen, setConnectOpen] = useState(false)
  const [command, setCommand] = useState('')
  const [confirmedClear, setConfirmedClear] = useState(false)

  const cfg = settings.acquisition

  const exportAll = () => {
    const envelope = buildExportEnvelope(measurements, scans)
    downloadText(
      `emi-archive-${stamp()}.json`,
      JSON.stringify({ ...envelope, settings, probes: useApp.getState().probes, reports }, null, 2),
      'application/json',
    )
    notify('ok', 'Archive exported', `${measurements.length} measurements, ${scans.length} scans.`)
  }

  const wipeEverything = async () => {
    if (!confirmedClear) {
      setConfirmedClear(true)
      return
    }
    for (const scan of scans) await deleteScan(scan.scan_id)
    setConfirmedClear(false)
    notify('warn', 'Local records deleted', 'All scans and measurements were removed from this machine.')
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <Panel>
          <PanelHeader
            title="Hardware link"
            subtitle="USB serial to the detector"
            icon={<Usb size={13} />}
            right={<Badge tone={deviceState === 'CONNECTED' ? 'ok' : deviceState === 'ERROR' ? 'danger' : 'neutral'} dot>{deviceState}</Badge>}
          />
          <div className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="primary" icon={<Plug size={12} />} onClick={() => setConnectOpen(true)}>
                Open connection
              </Button>
              <Button size="sm" icon={<RefreshCw size={12} />} onClick={() => void refreshPorts()}>
                Rescan ports
              </Button>
              <span className="text-[10.5px] text-ink-dim">
                {ports.length} authorised port{ports.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Field label="Baud rate" hint="Must match the firmware. Changing it needs a reconnect.">
                <Select
                  value={String(settings.baud_rate)}
                  onChange={(e) => updateSettings({ baud_rate: Number(e.target.value) })}
                >
                  {[9600, 19200, 38400, 57600, 115200, 230400].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate.toLocaleString('en-US')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Transport availability">
                <div className="flex h-9 flex-wrap items-center gap-1.5">
                  <Badge tone={webSerialSupported ? 'ok' : 'danger'}>Web Serial {webSerialSupported ? 'available' : 'missing'}</Badge>
                  <Badge tone={bridgeSupported ? 'ok' : 'neutral'}>Desktop bridge {bridgeSupported ? 'available' : 'missing'}</Badge>
                </div>
              </Field>
            </div>

            <Divider className="my-2" />
            <div className="grid gap-x-6 sm:grid-cols-2">
              <KeyValue label="Device ID" value={session.device_id ?? '—'} mono />
              <KeyValue label="Firmware" value={session.firmware_version ?? '—'} mono />
              <KeyValue label="Protocol" value={session.protocol_version !== null ? `v${session.protocol_version}` : '—'} mono />
              <KeyValue label="Frames received" value={samplesReceived.toLocaleString('en-US')} mono />
              <KeyValue label="Frames rejected" value={framesRejected} mono />
              <KeyValue label="Last frame" value={relativeTime(session.last_message_at)} />
            </div>

            {!webSerialSupported && !bridgeSupported ? (
              <Notice tone="danger" title="No serial transport in this browser" icon={<CircleAlert size={13} />}>
                Use Chrome or Edge over https, or run the packaged desktop build. Without a transport the dashboard cannot
                receive readings and will keep every value blank.
              </Notice>
            ) : null}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Acquisition" subtitle="Rules that decide what counts as a valid reading" icon={<SlidersHorizontal size={13} />} />
          <div className="space-y-2.5 px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="ADC full scale" hint="Values outside 0…full scale are rejected.">
                <NumberInput value={cfg.adc_max} onChange={(e) => updateAcquisition({ adc_max: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Unit label" hint="Keep it honest: counts, not volts, until calibrated.">
                <TextInput value={cfg.unit} onChange={(e) => updateAcquisition({ unit: e.target.value })} />
              </Field>
              <Field label="Saturation at (counts)">
                <NumberInput value={cfg.saturated_at} onChange={(e) => updateAcquisition({ saturated_at: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Sample rate (Hz)" hint="Reported by firmware where available.">
                <NumberInput value={cfg.sample_rate_hz} onChange={(e) => updateAcquisition({ sample_rate_hz: Number(e.target.value) || 0 })} />
              </Field>
              <Field label="Averaging window (frames)">
                <NumberInput min={1} value={cfg.averaging_window} onChange={(e) => updateAcquisition({ averaging_window: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Stale after (ms)">
                <NumberInput min={200} step={100} value={cfg.stale_after_ms} onChange={(e) => updateAcquisition({ stale_after_ms: Math.max(200, Number(e.target.value) || 200) })} />
              </Field>
              <Field label="Instability limit (% pk-pk)">
                <NumberInput min={1} value={cfg.unstable_spread_pct} onChange={(e) => updateAcquisition({ unstable_spread_pct: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="Min samples for verdict">
                <NumberInput min={2} value={cfg.stability_min_samples} onChange={(e) => updateAcquisition({ stability_min_samples: Math.max(2, Number(e.target.value) || 2) })} />
              </Field>
            </div>
            <Divider />
            <Switch
              checked={settings.interpolation}
              onChange={(next) => updateSettings({ interpolation: next })}
              label="Default to interpolated heatmap view"
              description="Derived surface is hatched and excluded from statistics."
            />
            <div className="flex items-center justify-between">
              <Field label="CSV delimiter" className="w-[180px]">
                <Select
                  value={settings.export_defaults.csv_delimiter}
                  onChange={(e) =>
                    updateSettings({ export_defaults: { csv_delimiter: e.target.value === ';' ? ';' : ',' } })
                  }
                >
                  <option value=",">Comma (,)</option>
                  <option value=";">Semicolon (;)</option>
                </Select>
              </Field>
              <Button variant="primary" size="sm" icon={<Save size={12} />} onClick={() => void saveSettings()} className="mt-4">
                Save settings
              </Button>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Data & storage" subtitle="Everything stays on this machine" icon={<Database size={13} />} />
          <div className="px-4 py-3">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <KeyValue label="Scans" value={scans.length} mono />
              <KeyValue label="Measurements" value={measurements.length} mono />
              <KeyValue label="Reports" value={reports.length} mono />
              <KeyValue label="Store" value={storageOk ? 'IndexedDB (local)' : 'unavailable'} />
            </div>
            {!storageOk ? (
              <Notice tone="danger" title="Local storage unavailable" icon={<CircleAlert size={13} />}>
                Records cannot be saved in this context. Nothing has been written and the app will say so rather than
                claim a save.
              </Notice>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" icon={<HardDriveDownload size={12} />} onClick={exportAll} disabled={measurements.length === 0}>
                Export archive (JSON)
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={12} />}
                onClick={() => void wipeEverything()}
                disabled={scans.length === 0 && measurements.length === 0}
              >
                {confirmedClear ? 'Click again to delete everything' : 'Delete all records'}
              </Button>
              {scans.length > 0 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    for (const s of scans) void clearScanMeasurements(s.scan_id)
                    notify('warn', 'Measurements cleared', 'Scan definitions were kept.')
                  }}
                >
                  Clear measurements only
                </Button>
              ) : null}
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-4">
        <Panel>
          <PanelHeader title="Link log" subtitle="Raw serial traffic, newest first" icon={<Terminal size={13} />} />
          <div className="max-h-[280px] overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-relaxed">
            {log.length === 0 ? (
              <div className="py-6 text-center text-ink-dim">No traffic recorded this session.</div>
            ) : (
              log.map((entry) => (
                <div key={entry.id} className="flex gap-2 py-0.5">
                  <span className="shrink-0 text-ink-dim">{entry.at.slice(11, 19)}</span>
                  <span
                    className={cn(
                      'w-8 shrink-0',
                      entry.direction === 'ERR'
                        ? 'text-strong'
                        : entry.direction === 'OUT'
                          ? 'text-efield'
                          : entry.direction === 'SYS'
                            ? 'text-accent'
                            : 'text-normal',
                    )}
                  >
                    {entry.direction}
                  </span>
                  <span className="min-w-0 flex-1 break-all text-ink-muted">{entry.text}</span>
                </div>
              ))
            )}
          </div>
          <div className="border-t border-line-soft px-3 py-2">
            <div className="flex gap-2">
              <TextInput
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="#PING"
                className="h-8 font-mono text-[11.5px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && command.trim()) {
                    void sendCommand(command.trim())
                    setCommand('')
                  }
                }}
              />
              <Button
                size="md"
                disabled={deviceState !== 'CONNECTED' || !command.trim()}
                onClick={() => {
                  void sendCommand(command.trim())
                  setCommand('')
                }}
              >
                Send
              </Button>
            </div>
            <p className="mt-1.5 text-[10px] text-ink-dim">
              Commands: <span className="font-mono">#IDENTIFY</span>, <span className="font-mono">#START</span>,{' '}
              <span className="font-mono">#PAUSE</span>, <span className="font-mono">#STOP</span>,{' '}
              <span className="font-mono">#PROBE E_FIELD|H_FIELD</span>, <span className="font-mono">#ZERO</span>
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Wire protocol" subtitle="Line-oriented JSON, one frame per line" icon={<Activity size={13} />} />
          <div className="px-4 py-3">
            <pre className="overflow-x-auto rounded-lg border border-line bg-canvas px-3 py-2.5 font-mono text-[10.5px] leading-relaxed text-ink-muted">
{`#HELLO {"device_id":"EMI-001","firmware_version":"1.0.0",
         "protocol_version":1,"probe_type":"E_FIELD"}

#PROBE {"probe_type":"H_FIELD"}

#DATA  {"seq":184,"signal_raw":1842,
        "signal_filtered":1798,"sample_count":32,
        "status":"VALID"}

#INFO  {"sample_rate_hz":20}
#ERR   {"code":"ADC_TIMEOUT","message":"..."}`}
            </pre>
            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-dim">
              Frames are validated before use. Missing fields, unknown types and out-of-range raw values are rejected and
              counted in the link log instead of being turned into readings.
            </p>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="About" subtitle="Build and application identity" icon={<SettingsIcon size={13} />} />
          <div className="px-4 py-2.5">
            <KeyValue label="Application" value="EMI Hotspot Mapper" />
            <KeyValue label="Version" value="1.0.0 (prototype)" mono />
            <KeyValue label="Protocol" value="v1" mono />
            <KeyValue label="Platform" value={bridgeSupported ? 'Desktop (native serial)' : 'Web (Web Serial)'} />
            <KeyValue label="Last connect" value={formatDateTime(session.connected_at)} />
            <Divider className="my-2" />
            <p className="text-[10px] leading-relaxed text-ink-dim">
              Relative near-field measurements only. Not a certified compliance instrument, not a calibrated
              field-strength meter, and not a spectrum analyzer. Manual probe positioning governs spatial accuracy.
            </p>
          </div>
        </Panel>
      </div>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
