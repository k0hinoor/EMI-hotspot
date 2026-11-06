import { useEffect } from 'react'
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  Plug,
  RefreshCw,
  Terminal,
  TriangleAlert,
  Unplug,
  Usb,
  X,
} from 'lucide-react'
import { useApp } from '../store/app'
import { Badge, Button, Divider, Field, Notice, Select, StatusDot, cn } from './ui'
import { formatDateTime, relativeTime } from '../lib/derive'

export function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    deviceState,
    deviceError,
    webSerialSupported,
    bridgeSupported,
    ports,
    portsLoading,
    selectedPortId,
    session,
    settings,
    lastFrameAt,
    samplesReceived,
    framesRejected,
    refreshPorts,
    selectPort,
    connect,
    disconnect,
    clearDeviceError,
    log,
  } = useApp()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const supported = webSerialSupported || bridgeSupported
  const connected = deviceState === 'CONNECTED'
  const recentLog = log.slice(0, 8)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4 sm:items-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-[560px] rounded-[16px] border border-white/10 bg-[#0b0e16]/95 shadow-[0_32px_90px_-30px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-4 py-3">
          <div>
            <div className="flex items-center gap-2">
              <Usb size={15} className="text-teal" />
              <h2 className="text-[14px] font-medium text-ink">Device connection</h2>
              <Badge tone={connected ? 'ok' : deviceState === 'ERROR' ? 'danger' : 'neutral'} dot>
                {deviceState}
              </Badge>
            </div>
            <p className="mt-1 text-[10.5px] text-ink-dim">
              USB serial link to the detector. Values shown in the dashboard come only from frames this link delivers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-dim hover:bg-white/[0.06] hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-4 px-4 py-3">
          {!supported ? (
            <Notice
              tone="danger"
              title="No serial transport in this browser"
              icon={<CircleAlert size={14} />}
            >
              Web Serial needs a Chromium-based browser (Chrome or Edge) on a secure origin, or the packaged desktop
              build with its native serial bridge. This environment exposes neither, so no port can be opened and no
              measurement can be acquired.
            </Notice>
          ) : null}

          {deviceError ? (
            <Notice
              tone="danger"
              title="Link error"
              icon={<TriangleAlert size={14} />}
              action={
                <button
                  type="button"
                  onClick={clearDeviceError}
                  className="shrink-0 rounded p-0.5 text-strong/80 hover:text-strong"
                  aria-label="Dismiss error"
                >
                  <X size={12} />
                </button>
              }
            >
              {deviceError}
            </Notice>
          ) : null}

          {!connected ? (
            <ol className="grid gap-1.5 rounded-[10px] border border-white/[0.07] bg-black/30 px-3 py-2.5">
              {[
                [
                  'Flash the firmware',
                  'Upload firmware/emi_hotspot_esp32cam/ (ESP32-CAM) or firmware/emi_hotspot_serial/ (Arduino) — one JSON frame per line at 115200 baud.',
                ],
                ['Fit the probe', 'Connect the E-field or H-field probe to the detector input and match the probe type on the device.'],
                ['Open the link', 'Plug the board into this machine, close any serial monitor holding the port, then press Connect and pick it.'],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-2.5">
                  <span className="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line font-mono text-[9px] text-ink-dim">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11.5px] text-ink-muted">{title}</div>
                    <div className="text-[10.5px] leading-snug text-ink-dim">{body}</div>
                  </div>
                </li>
              ))}
            </ol>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Serial port">
              <div className="flex gap-2">
                <Select
                  value={selectedPortId ?? ''}
                  onChange={(e) => selectPort(e.target.value)}
                  disabled={connected || !supported || ports.length === 0}
                  className="flex-1"
                >
                  {ports.length === 0 ? (
                    <option value="">{portsLoading ? 'Scanning…' : 'No authorised port'}</option>
                  ) : (
                    ports.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))
                  )}
                </Select>
                <Button
                  size="md"
                  variant="secondary"
                  onClick={() => void refreshPorts()}
                  disabled={portsLoading || !supported}
                  aria-label="Refresh ports"
                  icon={<RefreshCw size={13} className={cn(portsLoading && 'animate-spin')} />}
                />
              </div>
            </Field>
            <Field label="Baud rate">
              <div className="flex h-9 items-center rounded-lg border border-line bg-black/25 px-2.5 font-mono text-[12px] text-ink-muted">
                {settings.baud_rate.toLocaleString('en-US')} · 8N1
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            {connected ? (
              <Button variant="danger" icon={<Unplug size={13} />} onClick={() => void disconnect()}>
                Disconnect
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={
                  deviceState === 'CONNECTING' ? (
                    <LoaderCircle size={13} className="animate-spin" />
                  ) : (
                    <Plug size={13} />
                  )
                }
                disabled={!supported || deviceState === 'CONNECTING' || (bridgeSupported && !webSerialSupported && !selectedPortId)}
                onClick={() => void connect()}
              >
                {deviceState === 'CONNECTING' ? 'Opening port…' : 'Connect'}
              </Button>
            )}
            {!connected && webSerialSupported ? (
              <span className="self-center text-[10.5px] text-ink-dim">
                {ports.length === 0
                  ? 'No port authorised yet — press Connect and pick your ESP32.'
                  : 'The browser will ask you to pick a port — that permission is the connection.'}
              </span>
            ) : null}
          </div>

          <Divider />

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px] sm:grid-cols-4">
            <Readback label="Device ID" value={session.device_id ?? '—'} />
            <Readback label="Firmware" value={session.firmware_version ?? '—'} />
            <Readback label="Protocol" value={session.protocol_version !== null ? `v${session.protocol_version}` : '—'} />
            <Readback label="Transport" value={session.transport ?? '—'} />
            <Readback label="Frames" value={samplesReceived.toLocaleString('en-US')} />
            <Readback label="Rejected" value={String(framesRejected)} />
            <Readback label="Last frame" value={relativeTime(lastFrameAt)} />
            <Readback label="Opened" value={session.connected_at ? formatDateTime(session.connected_at) : '—'} />
          </div>

          <div className="rounded-[10px] border border-white/[0.07] bg-black/30">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <Terminal size={12} className="text-ink-dim" />
              <span className="text-[11px] font-medium text-ink-muted">Link log</span>
              <span className="ml-auto text-[10px] text-ink-dim">newest first · raw frames</span>
            </div>
            <div className="max-h-[132px] overflow-y-auto px-3 py-2 font-mono text-[10.5px] leading-relaxed">
              {recentLog.length === 0 ? (
                <div className="py-3 text-center text-ink-dim">No traffic yet.</div>
              ) : (
                recentLog.map((entry) => (
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
                              ? 'text-teal'
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
          </div>

          <div className="flex items-start gap-2 text-[10.5px] leading-relaxed text-ink-dim">
            <CircleCheck size={12} className="mt-0.5 shrink-0 text-ink-dim" />
            <p>
              Without a connected device every reading field stays empty — the dashboard never substitutes generated
              values for hardware frames. Wire format:{' '}
              <span className="font-mono text-ink-muted">#HELLO{'{"device_id":"EMI-001"}'}</span> then{' '}
              <span className="font-mono text-ink-muted">#DATA{'{"signal_raw":1842}'}</span>.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-2.5">
          <div className="flex items-center gap-2 text-[10.5px] text-ink-dim">
            <StatusDot tone={connected ? 'ok' : 'neutral'} />
            {connected ? 'Streaming' : 'Link idle'}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}

function Readback({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="label-caps !text-[9px]">{label}</div>
      <div className="truncate font-mono text-[11.5px] text-ink">{value}</div>
    </div>
  )
}
