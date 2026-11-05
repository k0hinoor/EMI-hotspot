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
  Frame,
  FrameBody,
  FrameFooter,
  FrameHeader,
  KeyValue,
  Notice,
  NumberInput,
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
    <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 max-xl:h-auto xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none">
        <Frame className="shrink-0">
          <FrameHeader
            title="Hardware link"
            subtitle="USB serial to the detector"
            icon={<Usb size={12} />}
            right={
              <Badge tone={deviceState === 'CONNECTED' ? 'ok' : deviceState === 'ERROR' ? 'danger' : 'neutral'} dot>
                {deviceState}
              </Badge>
            }
          />
          <div className="p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" variant="primary" icon={<Plug size={10} />} onClick={() => setConnectOpen(true)}>
                Open connection
              </Button>
              <Button size="sm" icon={<RefreshCw size={10} />} onClick={() => void refreshPorts()}>
                Rescan
              </Button>
              <span className="text-[9.5px] text-ink-dim">
                {ports.length} authorised port{ports.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              <Field label="Baud rate" hint="Must match firmware; needs a reconnect.">
                <Select value={String(settings.baud_rate)} onChange={(e) => updateSettings({ baud_rate: Number(e.target.value) })}>
                  {[9600, 19200, 38400, 57600, 115200, 230400].map((rate) => (
                    <option key={rate} value={rate}>
                      {rate.toLocaleString('en-US')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Transports">
                <div className="flex h-7 flex-wrap items-center gap-1">
                  <Badge tone={webSerialSupported ? 'ok' : 'danger'}>{webSerialSupported ? 'Web Serial ✓' : 'Web Serial ✗'}</Badge>
                  <Badge tone={bridgeSupported ? 'ok' : 'neutral'}>{bridgeSupported ? 'Bridge ✓' : 'Bridge —'}</Badge>
                </div>
              </Field>
            </div>
            <Divider className="my-1.5" />
            <div className="grid gap-x-5 sm:grid-cols-2">
              <KeyValue label="Device ID" value={session.device_id ?? '—'} mono />
              <KeyValue label="Firmware" value={session.firmware_version ?? '—'} mono />
              <KeyValue label="Protocol" value={session.protocol_version !== null ? `v${session.protocol_version}` : '—'} mono />
              <KeyValue label="Frames received" value={samplesReceived.toLocaleString('en-US')} mono />
              <KeyValue label="Frames rejected" value={framesRejected} mono />
              <KeyValue label="Last frame" value={relativeTime(session.last_message_at)} />
            </div>
            {!webSerialSupported && !bridgeSupported ? (
              <Notice tone="danger" title="No serial transport in this browser" icon={<CircleAlert size={11} />} className="mt-2">
                Use Chrome or Edge over https, or the packaged desktop build. Without a transport no reading can be
                acquired.
              </Notice>
            ) : null}
          </div>
        </Frame>

        <Frame className="shrink-0">
          <FrameHeader title="Acquisition" subtitle="rules that decide a valid reading" icon={<SlidersHorizontal size={12} />} />
          <div className="p-2.5">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Field label="ADC full scale" hint="outside 0…max is rejected">
                <NumberInput
                  value={cfg.adc_max}
                  onChange={(e) => updateAcquisition({ adc_max: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
              <Field label="Saturation at">
                <NumberInput
                  value={cfg.saturated_at}
                  onChange={(e) => updateAcquisition({ saturated_at: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Sample rate Hz">
                <NumberInput
                  value={cfg.sample_rate_hz}
                  onChange={(e) => updateAcquisition({ sample_rate_hz: Number(e.target.value) || 0 })}
                />
              </Field>
              <Field label="Unit label" hint="counts until calibrated">
                <TextInput value={cfg.unit} onChange={(e) => updateAcquisition({ unit: e.target.value })} />
              </Field>
              <Field label="Averaging">
                <NumberInput
                  min={1}
                  value={cfg.averaging_window}
                  onChange={(e) => updateAcquisition({ averaging_window: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
              <Field label="Stale after ms">
                <NumberInput
                  min={200}
                  step={100}
                  value={cfg.stale_after_ms}
                  onChange={(e) => updateAcquisition({ stale_after_ms: Math.max(200, Number(e.target.value) || 200) })}
                />
              </Field>
              <Field label="Unstable % pk-pk">
                <NumberInput
                  min={1}
                  value={cfg.unstable_spread_pct}
                  onChange={(e) => updateAcquisition({ unstable_spread_pct: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Field>
              <Field label="Min samples">
                <NumberInput
                  min={2}
                  value={cfg.stability_min_samples}
                  onChange={(e) => updateAcquisition({ stability_min_samples: Math.max(2, Number(e.target.value) || 2) })}
                />
              </Field>
            </div>
            <div className="mt-1.5 grid gap-x-5 sm:grid-cols-2">
              <Switch
                checked={settings.interpolation}
                onChange={(next) => updateSettings({ interpolation: next })}
                label="Default to interpolated heatmap"
                description="Derived surface; excluded from statistics."
              />
              <div className="flex items-end gap-2">
                <Field label="CSV delimiter" className="w-[120px]">
                  <Select
                    value={settings.export_defaults.csv_delimiter}
                    onChange={(e) =>
                      updateSettings({ export_defaults: { csv_delimiter: e.target.value === ';' ? ';' : ',' } })
                    }
                  >
                    <option value=",">Comma</option>
                    <option value=";">Semicolon</option>
                  </Select>
                </Field>
                <Button size="sm" variant="primary" icon={<Save size={10} />} onClick={() => void saveSettings()} className="mb-[1px]">
                  Save
                </Button>
              </div>
            </div>
          </div>
        </Frame>

        <Frame className="min-h-0">
          <FrameHeader title="Data & storage" subtitle="everything stays on this machine" icon={<Database size={12} />} />
          <FrameBody className="p-2.5">
            <div className="grid gap-x-5 sm:grid-cols-2">
              <KeyValue label="Scans" value={scans.length} mono />
              <KeyValue label="Measurements" value={measurements.length} mono />
              <KeyValue label="Reports" value={reports.length} mono />
              <KeyValue label="Store" value={storageOk ? 'IndexedDB · local' : 'unavailable'} />
            </div>
            {!storageOk ? (
              <Notice tone="danger" title="Local storage unavailable" icon={<CircleAlert size={11} />} className="mt-2">
                Records cannot be saved here. Nothing was written and the app will not claim a save.
              </Notice>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button size="sm" icon={<HardDriveDownload size={10} />} onClick={exportAll} disabled={measurements.length === 0}>
                Export archive
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={10} />}
                onClick={() => void wipeEverything()}
                disabled={scans.length === 0 && measurements.length === 0}
              >
                {confirmedClear ? 'Click again to delete all' : 'Delete all records'}
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
            <Divider className="my-2" />
            <div className="flex flex-wrap items-start gap-x-6 gap-y-1 text-[9.5px] leading-snug text-ink-dim">
              <span className="inline-flex items-center gap-1">
                <SettingsIcon size={9} /> v1.0.0 · protocol v1
              </span>
              <span>Last connect {formatDateTime(session.connected_at)}</span>
              <span>Relative near-field counts only — not a compliance instrument.</span>
            </div>
          </FrameBody>
        </Frame>
      </div>

      <div className="grid min-h-0 grid-rows-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none">
        <Frame className="min-h-[300px] xl:min-h-0">
          <FrameHeader title="Link log" subtitle="raw serial traffic, newest first" icon={<Terminal size={12} />} />
          <FrameBody noPad className="font-mono">
            {log.length === 0 ? (
              <div className="px-3 py-6 text-center font-sans text-[10px] text-ink-dim">No traffic recorded this session.</div>
            ) : (
              <div className="px-2 py-1">
                {log.map((entry) => (
                  <div key={entry.id} className="flex gap-1.5 py-[1px] text-[9.5px] leading-relaxed">
                    <span className="shrink-0 text-ink-dim">{entry.at.slice(11, 19)}</span>
                    <span
                      className={cn(
                        'w-7 shrink-0',
                        entry.direction === 'ERR'
                          ? 'text-strong'
                          : entry.direction === 'OUT'
                            ? 'text-efield'
                            : entry.direction === 'SYS'
                              ? 'text-teal'
                              : 'text-normal',
                      )}
                    >
                      {entry.direction}
                    </span>
                    <span className="min-w-0 flex-1 break-all text-ink-muted">{entry.text}</span>
                  </div>
                ))}
              </div>
            )}
          </FrameBody>
          <FrameFooter>
            <TextInput
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="#PING"
              className="h-6 font-mono text-[10.5px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && command.trim()) {
                  void sendCommand(command.trim())
                  setCommand('')
                }
              }}
            />
            <Button
              size="sm"
              disabled={deviceState !== 'CONNECTED' || !command.trim()}
              onClick={() => {
                void sendCommand(command.trim())
                setCommand('')
              }}
            >
              Send
            </Button>
          </FrameFooter>
        </Frame>

        <Frame className="min-h-0">
          <FrameHeader title="Wire protocol" subtitle="line-oriented JSON · protocol v1" icon={<Activity size={12} />} />
          <FrameBody className="p-2.5">
            <pre className="overflow-x-auto rounded-[6px] border border-line bg-black/25 px-2 py-1.5 font-mono text-[9px] leading-relaxed text-ink-muted">
{`#HELLO {"device_id":"EMI-001","firmware_version":"1.0.0",
         "protocol_version":1,"probe_type":"E_FIELD"}

#DATA  {"seq":184,"signal_raw":1842,"signal_filtered":1798,
        "sample_count":32,"status":"VALID"}

#PROBE {"probe_type":"H_FIELD"}      #INFO {"sample_rate_hz":20}`}
            </pre>
            <p className="mt-1.5 text-[9px] leading-snug text-ink-dim">
              Commands: <span className="font-mono">#IDENTIFY</span> · <span className="font-mono">#START</span> ·{' '}
              <span className="font-mono">#PAUSE</span> · <span className="font-mono">#STOP</span> ·{' '}
              <span className="font-mono">#PROBE</span> · <span className="font-mono">#ZERO</span>. Frames are validated
              before use; bad frames are rejected and counted here, never turned into readings.
            </p>
          </FrameBody>
        </Frame>
      </div>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
