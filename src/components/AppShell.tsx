import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  ChartLine,
  Crosshair,
  FileText,
  FlaskConical,
  Grid3x3,
  Menu,
  Plug,
  Radio,
  ScanLine,
  Settings as SettingsIcon,
  Table2,
  X,
} from 'lucide-react'
import { useApp } from '../store/app'
import { Badge, Button, StatusDot, cn, type Tone } from './ui'
import { relativeTime } from '../lib/derive'
import { ToastStack } from './Toasts'
import { ConnectDialog } from './ConnectDialog'

const NAV = [
  { to: '/', label: 'Live Scan', icon: Activity, group: 'Acquire' },
  { to: '/heatmap', label: 'Heatmap', icon: Grid3x3, group: 'Acquire' },
  { to: '/analysis', label: 'Signal Analysis', icon: ChartLine, group: 'Review' },
  { to: '/data-log', label: 'Data Log', icon: Table2, group: 'Review' },
  { to: '/reports', label: 'Reports', icon: FileText, group: 'Review' },
  { to: '/calibration', label: 'Calibration', icon: FlaskConical, group: 'Configure' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, group: 'Configure' },
] as const

export const PAGE_META: Record<string, { title: string; description: string }> = {
  '/': { title: 'Live Scan', description: 'Monitor the detector and capture readings at physical coordinates.' },
  '/heatmap': { title: 'Heatmap', description: 'Manual grid mapping of relative signal activity across a test area.' },
  '/analysis': { title: 'Signal Analysis', description: 'Distribution, stability and per-scan statistics.' },
  '/data-log': { title: 'Data Log', description: 'Every stored measurement with full provenance.' },
  '/reports': { title: 'Reports', description: 'Reproducible scan summaries as PDF or CSV.' },
  '/calibration': { title: 'Calibration', description: 'Probe profiles, baseline correction and calibration records.' },
  '/settings': { title: 'Settings', description: 'Hardware link, acquisition parameters and application data.' },
}

function deviceTone(state: string): Tone {
  if (state === 'CONNECTED') return 'ok'
  if (state === 'CONNECTING') return 'warn'
  if (state === 'ERROR') return 'danger'
  return 'neutral'
}

function DevicePill({ onClick }: { onClick: () => void }) {
  const { deviceState, session, samplesReceived, lastFrameAt, deviceProbe, signalState } = useApp()
  const tone = deviceTone(deviceState)
  const label =
    deviceState === 'CONNECTED'
      ? session.device_id ?? 'Device connected'
      : deviceState === 'CONNECTING'
        ? 'Connecting…'
        : deviceState === 'ERROR'
          ? 'Link error'
          : 'No device'

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-2.5 rounded-lg border border-line bg-panel px-2.5 py-1.5 text-left transition-colors hover:border-[#3a4359]"
    >
      <StatusDot tone={tone} pulse={deviceState === 'CONNECTED'} />
      <span className="min-w-0">
        <span className="block max-w-[180px] truncate text-[11.5px] leading-tight font-medium text-ink">{label}</span>
        <span className="block text-[10px] leading-tight text-ink-dim">
          {deviceState === 'CONNECTED'
            ? `${samplesReceived.toLocaleString('en-US')} frames · ${relativeTime(lastFrameAt)}`
            : 'Click to connect'}
        </span>
      </span>
      {deviceState === 'CONNECTED' ? (
        <span
          className={cn(
            'ml-1 rounded border px-1 py-0.5 font-mono text-[9.5px] tracking-wider uppercase',
            signalState === 'INVALID' || signalState === 'SATURATED'
              ? 'border-strong/40 text-strong'
              : signalState === 'STALE' || signalState === 'UNSTABLE'
                ? 'border-elevated/40 text-elevated'
                : 'border-line text-ink-dim',
          )}
        >
          {signalState}
        </span>
      ) : null}
      {deviceProbe ? (
        <span
          className={cn(
            'rounded border px-1 py-0.5 font-mono text-[9.5px] tracking-wider',
            deviceProbe === 'E_FIELD' ? 'border-efield/40 text-efield' : 'border-hfield/40 text-hfield',
          )}
        >
          {deviceProbe === 'E_FIELD' ? 'E' : 'H'}
        </span>
      ) : null}
    </button>
  )
}

/** Persistent recording + scan status (PRD §6). */
function StatusStrip() {
  const acquiring = useApp((s) => s.acquiring)
  const deviceState = useApp((s) => s.deviceState)
  const scan = useApp((s) => s.scans.find((x) => x.scan_id === s.activeScanId) ?? null)

  const recording = acquiring && deviceState === 'CONNECTED'

  return (
    <div className="hidden items-center gap-2 md:flex">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide',
          recording ? 'border-strong/35 bg-strong/10 text-strong' : 'border-line bg-panel-raised text-ink-dim',
        )}
        title={recording ? 'Frames are being accepted and can be captured' : 'Not recording'}
      >
        <span className={cn('h-1.5 w-1.5 rounded-full', recording ? 'animate-pulse-soft bg-strong' : 'bg-ink-dim')} />
        {recording ? 'REC' : 'IDLE'}
      </span>
      {scan ? (
        <NavLink
          to="/heatmap"
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-1.5 py-0.5 text-[10px] text-ink-muted hover:border-[#3a4359] hover:text-ink"
          title={`Active scan: ${scan.scan_name}`}
        >
          <Grid3x3 size={10} className="text-accent" />
          <span className="max-w-[120px] truncate">{scan.scan_name}</span>
          <span className="font-mono text-[9px] tracking-wider text-ink-dim">{scan.status}</span>
        </NavLink>
      ) : null}
    </div>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  // Separate primitive selectors: zustand v5 compares snapshots by identity.
  const scanCount = useApp((s) => s.scans.length)
  const measurementCount = useApp((s) => s.measurements.length)
  const groups = ['Acquire', 'Review', 'Configure'] as const

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-[7px] border border-accent/40 bg-accent/12">
          <ScanLine size={15} className="text-accent" strokeWidth={1.9} />
        </div>
        <div className="leading-tight">
          <div className="text-[12.5px] font-semibold tracking-tight text-ink">EMI Hotspot Mapper</div>
          <div className="label-caps mt-0.5 !text-[9px] !tracking-[0.14em]">Near-field scanner</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.map((group) => (
          <div key={group} className="mt-3 first:mt-1">
            <div className="label-caps px-2.5 pb-1.5 !text-[9px]">{group}</div>
            <div className="space-y-0.5">
              {NAV.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] transition-colors',
                        isActive
                          ? 'bg-panel text-ink shadow-[inset_0_0_0_1px_rgba(139,92,246,0.28)]'
                          : 'text-ink-muted hover:bg-panel/60 hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          size={15}
                          strokeWidth={1.9}
                          className={isActive ? 'text-accent' : 'text-ink-dim group-hover:text-ink-muted'}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.to === '/data-log' && measurementCount > 0 ? (
                          <span className="tabular text-[10px] text-ink-dim">{measurementCount}</span>
                        ) : null}
                        {item.to === '/heatmap' && scanCount > 0 ? (
                          <span className="tabular text-[10px] text-ink-dim">{scanCount}</span>
                        ) : null}
                      </>
                    )}
                  </NavLink>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-line-soft px-3 py-3">
        <div className="flex items-center justify-between text-[10px] text-ink-dim">
          <span className="inline-flex items-center gap-1.5">
            <Radio size={11} /> v1.0.0 · protocol v1
          </span>
          <Badge tone="neutral">LOCAL</Badge>
        </div>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const { deviceState, hydrate, hydrated, storageOk } = useApp()

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  const meta = PAGE_META[location.pathname] ?? { title: 'EMI Hotspot Mapper', description: '' }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex min-h-screen w-full max-w-[1680px]">
        <aside className="hidden w-[228px] shrink-0 border-r border-line-soft lg:block">
          <div className="sticky top-0 h-screen">
            <Sidebar />
          </div>
        </aside>

        {drawerOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[248px] border-r border-line-soft shadow-2xl">
              <Sidebar onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-line-soft bg-canvas/92 backdrop-blur">
            <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setDrawerOpen(true)}
                aria-label="Open navigation"
                icon={<Menu size={15} />}
              />
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-[14px] font-medium tracking-tight text-ink">{meta.title}</h1>
                <p className="hidden truncate text-[11px] text-ink-dim sm:block">{meta.description}</p>
              </div>

              {!hydrated ? (
                <span className="text-[11px] text-ink-dim">Restoring local data…</span>
              ) : !storageOk ? (
                <Badge tone="danger" dot>
                  Storage unavailable
                </Badge>
              ) : null}

              <StatusStrip />
              <DevicePill onClick={() => setConnectOpen(true)} />
              <Button
                variant="primary"
                size="sm"
                icon={<Plug size={13} />}
                onClick={() => setConnectOpen(true)}
                className="hidden sm:inline-flex"
              >
                {deviceState === 'CONNECTED' ? 'Connection' : 'Connect device'}
              </Button>
            </div>
          </header>

          <main className="flex-1 px-4 py-4 sm:px-6 sm:py-5">{children}</main>

          <footer className="border-t border-line-soft px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-ink-dim">
              <span className="inline-flex items-center gap-1.5">
                <Crosshair size={11} /> Relative near-field measurement — not a calibrated field-strength instrument.
              </span>
              <span className="hidden sm:inline">·</span>
              <span>Manual probe positioning; coordinates supplied by the operator.</span>
            </div>
          </footer>
        </div>
      </div>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
      <ToastStack />
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
          className="fixed top-3 right-3 z-50 rounded-lg border border-line bg-panel p-1.5 text-ink-muted lg:hidden"
        >
          <X size={15} />
        </button>
      ) : null}
    </div>
  )
}
