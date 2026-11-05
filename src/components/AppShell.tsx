import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  ChartLine,
  CircleAlert,
  FlaskConical,
  Grid3x3,
  Plug,
  ScanLine,
  Settings as SettingsIcon,
  Table2,
  FileText,
  Unplug,
  Usb,
} from 'lucide-react'
import { useApp } from '../store/app'
import { Badge, Button, StatusDot, cn, type Tone } from './ui'
import { relativeTime } from '../lib/derive'
import { ToastStack } from './Toasts'
import { ConnectDialog } from './ConnectDialog'

export const NAV = [
  { to: '/', label: 'Live Scan', icon: Activity, key: '1' },
  { to: '/heatmap', label: 'Heatmap', icon: Grid3x3, key: '2' },
  { to: '/analysis', label: 'Analysis', icon: ChartLine, key: '3' },
  { to: '/data-log', label: 'Data Log', icon: Table2, key: '4' },
  { to: '/reports', label: 'Reports', icon: FileText, key: '5' },
  { to: '/calibration', label: 'Calibration', icon: FlaskConical, key: '6' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, key: '7' },
] as const

export const PAGE_META: Record<string, { title: string; hint: string }> = {
  '/': { title: 'Live Scan', hint: 'Monitor the detector · capture readings at coordinates' },
  '/heatmap': { title: 'Heatmap', hint: 'Manual grid mapping of relative signal activity' },
  '/analysis': { title: 'Signal Analysis', hint: 'Distribution, stability and per-scan statistics' },
  '/data-log': { title: 'Data Log', hint: 'Every stored measurement with full provenance' },
  '/reports': { title: 'Reports', hint: 'Reproducible scan summaries · PDF and CSV' },
  '/calibration': { title: 'Calibration', hint: 'Probe profiles · baseline correction' },
  '/settings': { title: 'Settings', hint: 'Hardware link · acquisition rules · local data' },
}

function deviceTone(state: string): Tone {
  if (state === 'CONNECTED') return 'ok'
  if (state === 'CONNECTING') return 'warn'
  if (state === 'ERROR') return 'danger'
  return 'neutral'
}

function SignalChip() {
  const signalState = useApp((s) => s.signalState)
  const connected = useApp((s) => s.deviceState === 'CONNECTED')
  if (!connected) return null
  const tone: Tone =
    signalState === 'STABLE'
      ? 'ok'
      : signalState === 'UNKNOWN'
        ? 'neutral'
        : signalState === 'UNSTABLE' || signalState === 'STALE'
          ? 'warn'
          : 'danger'
  return <Badge tone={tone}>{signalState === 'UNKNOWN' ? 'WAITING' : signalState}</Badge>
}

function Rail({ onConnect }: { onConnect: () => void }) {
  const {
    deviceState,
    session,
    samplesReceived,
    lastFrameAt,
    deviceProbe,
    acquiring,
    storageOk,
    measurements,
    activeScanId,
    scans,
    settings,
  } = useApp()
  const activeScan = scans.find((s) => s.scan_id === activeScanId) ?? null
  const connected = deviceState === 'CONNECTED'
  const tone = deviceTone(deviceState)
  const unit = settings.acquisition.unit

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={onConnect}
        className={cn(
          'flex h-8 items-center gap-2 rounded-[7px] border px-2 transition-colors',
          connected
            ? 'border-normal/25 bg-normal/6 hover:bg-normal/10'
            : deviceState === 'ERROR'
              ? 'border-strong/30 bg-strong/6 hover:bg-strong/10'
              : 'border-line bg-panel hover:bg-panel-raised',
        )}
        title={connected ? 'Connection details' : 'Connect the detector'}
      >
        {connected ? (
          <Usb size={12} className="text-normal" />
        ) : deviceState === 'ERROR' ? (
          <CircleAlert size={12} className="text-strong" />
        ) : (
          <Unplug size={12} className="text-ink-dim" />
        )}
        <span className="text-left leading-none">
          <span className="block text-[10.5px] font-medium text-ink">
            {connected ? (session.device_id ?? 'Detector') : deviceState === 'ERROR' ? 'Link error' : 'No device'}
          </span>
          <span className="mt-[3px] block text-[9px] leading-none text-ink-dim">
            {connected
              ? `${samplesReceived.toLocaleString('en-US')} frames · ${relativeTime(lastFrameAt)}`
              : 'click to connect'}
          </span>
        </span>
        <StatusDot tone={tone} pulse={connected} />
      </button>

      <div className="hidden items-center gap-1.5 lg:flex">
        <SignalChip />
        {deviceProbe ? (
          <Badge tone={deviceProbe === 'E_FIELD' ? 'efield' : 'hfield'}>
            {deviceProbe === 'E_FIELD' ? 'E' : 'H'}-FIELD
          </Badge>
        ) : null}
        <Badge tone={acquiring && connected ? 'danger' : 'neutral'} dot>
          {acquiring && connected ? 'REC' : 'IDLE'}
        </Badge>
      </div>

      {activeScan ? (
        <NavLink
          to="/heatmap"
          className="hidden h-8 items-center gap-1.5 rounded-[7px] border border-line bg-panel px-2 text-[10px] text-ink-muted hover:border-[#31353c] hover:text-ink md:flex"
          title="Open the active scan"
        >
          <Grid3x3 size={11} className="text-ink-dim" />
          <span className="max-w-[130px] truncate">{activeScan.scan_name}</span>
          <span className="font-mono text-[9px] tracking-wide text-ink-dim">{activeScan.status}</span>
        </NavLink>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="hidden items-center gap-1 text-[9.5px] text-ink-dim xl:flex">
          {measurements.length.toLocaleString('en-US')} readings · {unit}
        </span>
        {!storageOk ? <Badge tone="danger">NO STORE</Badge> : null}
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [connectOpen, setConnectOpen] = useState(false)
  const hydrate = useApp((s) => s.hydrate)
  const hydrated = useApp((s) => s.hydrated)
  const deviceState = useApp((s) => s.deviceState)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Number keys switch frames; keeps the "go anywhere" feel without a long page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      const match = NAV.find((item) => item.key === event.key)
      if (match) {
        event.preventDefault()
        window.location.hash = `#${match.to}`
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const meta = PAGE_META[location.pathname] ?? PAGE_META['/']

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-canvas">
      {/* Chrome: identity + frame switcher + live rail */}
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="flex h-11 items-center gap-3 overflow-x-auto px-2.5">
          <div className="flex shrink-0 items-center gap-2 pr-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-[6px] border border-line bg-panel">
              <ScanLine size={13} className="text-accent" strokeWidth={1.8} />
            </div>
            <div className="leading-none">
              <div className="text-[11.5px] font-semibold tracking-tight text-ink">EMI Hotspot Mapper</div>
              <div className="mt-[3px] text-[8.5px] tracking-[0.13em] text-ink-dim uppercase">near-field scanner</div>
            </div>
          </div>

          <div className="mx-1 h-5 w-px shrink-0 bg-line-soft" />

          <nav className="flex shrink-0 items-center gap-0.5">
            {NAV.map((item) => {
              const Icon = item.icon
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={`${item.label} · press ${item.key}`}
                  className={({ isActive }) =>
                    cn(
                      'flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[11px] transition-colors',
                      isActive
                        ? 'bg-panel-raised text-ink shadow-[inset_0_0_0_1px_rgba(230,226,217,0.10)]'
                        : 'text-ink-dim hover:bg-panel/70 hover:text-ink-muted',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={12} strokeWidth={1.9} className={isActive ? 'text-accent' : undefined} />
                      <span className="hidden xl:inline">{item.label}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </nav>

          <div className="mx-1 hidden h-5 w-px shrink-0 bg-line-soft md:block" />

          <Rail onConnect={() => setConnectOpen(true)} />

          <Button
            variant={deviceState === 'CONNECTED' ? 'secondary' : 'primary'}
            size="md"
            icon={<Plug size={12} />}
            onClick={() => setConnectOpen(true)}
            className="shrink-0"
          >
            <span className="hidden sm:inline">{deviceState === 'CONNECTED' ? 'Connection' : 'Connect'}</span>
            <span className="sm:hidden">Link</span>
          </Button>
        </div>

        {/* Second line: where you are + what it is */}
        <div className="flex h-7 items-center gap-2 border-t border-line-soft px-3">
          <span className="text-[11px] font-medium text-ink">{meta.title}</span>
          <span className="text-[10px] text-ink-dim">·</span>
          <span className="truncate text-[10px] text-ink-dim">{meta.hint}</span>
          {!hydrated ? <span className="ml-auto text-[9.5px] text-ink-dim">restoring local data…</span> : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2 sm:p-2.5 xl:overflow-hidden">{children}</main>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
      <ToastStack />
    </div>
  )
}
