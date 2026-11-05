import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  Bell,
  Beaker,
  ChartLine,
  CircleAlert,
  Crosshair,
  FlaskConical,
  Grid3x3,
  LayoutDashboard,
  Plug,
  ScanLine,
  Settings as SettingsIcon,
  Table2,
  FileText,
  Usb,
  Unplug,
} from 'lucide-react'
import { useApp } from '../store/app'
import { Badge, Button, StatusDot, cn } from './ui'
import { formatTime, relativeTime } from '../lib/derive'
import { ToastStack } from './Toasts'
import { ConnectDialog } from './ConnectDialog'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, key: '1' },
  { to: '/live', label: 'Live Scan', icon: Activity, key: '2' },
  { to: '/heatmap', label: 'Heatmaps', icon: Grid3x3, key: '3' },
  { to: '/analysis', label: 'Analytics', icon: ChartLine, key: '4' },
  { to: '/data-log', label: 'Data Log', icon: Table2, key: '5' },
  { to: '/reports', label: 'Reports', icon: FileText, key: '6' },
  { to: '/calibration', label: 'Calibration', icon: FlaskConical, key: '7' },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, key: '8' },
] as const

export const PAGE_META: Record<string, { title: string; hint: string }> = {
  '/': { title: 'Dashboard', hint: 'Session overview · live signal, topology and activity' },
  '/live': { title: 'Live Scan', hint: 'Monitor the detector · capture readings at coordinates' },
  '/heatmap': { title: 'Heatmaps', hint: 'Manual grid mapping of relative signal activity' },
  '/analysis': { title: 'Analytics', hint: 'Distribution, stability and per-scan statistics' },
  '/data-log': { title: 'Data Log', hint: 'Every stored measurement with full provenance' },
  '/reports': { title: 'Reports', hint: 'Reproducible scan summaries · PDF and CSV' },
  '/calibration': { title: 'Calibration', hint: 'Probe profiles · baseline correction' },
  '/settings': { title: 'Settings', hint: 'Hardware link · acquisition rules · local data' },
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const session = useApp((s) => s.session)
  const deviceState = useApp((s) => s.deviceState)
  const measurementCount = useApp((s) => s.measurements.length)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[68px] shrink-0 items-center gap-2.5 px-5">
        <div className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-gradient-to-br from-teal/30 to-violet/25 ring-1 ring-white/10">
          <ScanLine size={16} className="text-teal" strokeWidth={1.9} />
          <span className="absolute inset-0 rounded-[10px] shadow-[0_0_22px_-4px_rgba(53,229,197,0.55)]" />
        </div>
        <span className="text-[16px] font-semibold tracking-tight text-ink">EMI Scan</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-1">
        <div className="space-y-1">
          {NAV.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'group relative flex items-center gap-3 rounded-[10px] px-3 py-[9px] text-[12.5px] transition-all',
                    isActive
                      ? 'bg-gradient-to-r from-white/[0.10] to-white/[0.03] text-ink ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                      : 'text-ink-muted hover:bg-white/[0.04] hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <span className="absolute top-1/2 left-0 h-5 w-[2px] -translate-y-1/2 rounded-full bg-teal shadow-[0_0_10px_2px_rgba(53,229,197,0.6)]" />
                    ) : null}
                    <Icon
                      size={15}
                      strokeWidth={1.9}
                      className={isActive ? 'text-teal' : 'text-ink-dim group-hover:text-ink-muted'}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.to === '/data-log' && measurementCount > 0 ? (
                      <span className="tabular text-[9.5px] text-ink-dim">{measurementCount}</span>
                    ) : null}
                  </>
                )}
              </NavLink>
            )
          })}
        </div>
      </nav>

      <div className="shrink-0 px-3 pb-4">
        <div className="rounded-[12px] border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="flex items-center gap-2">
            <StatusDot tone={deviceState === 'CONNECTED' ? 'ok' : 'neutral'} pulse={deviceState === 'CONNECTED'} />
            <span className="text-[11px] font-medium text-ink">
              {deviceState === 'CONNECTED' ? (session.device_id ?? 'Detector') : 'No detector'}
            </span>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-ink-dim">
            {deviceState === 'CONNECTED'
              ? `Firmware ${session.firmware_version ?? 'n/a'}`
              : 'Readings stay blank until frames arrive.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function TopBar({ onConnect, onMenu }: { onConnect: () => void; onMenu: () => void }) {
  const {
    deviceState,
    session,
    samplesReceived,
    lastFrameAt,
    deviceProbe,
    signalState,
    acquiring,
    storageOk,
    demoMode,
    demoStreaming,
    enterDemoMode,
    exitDemoMode,
    toggleDemoStream,
  } = useApp()
  const connected = deviceState === 'CONNECTED'
  const meta = PAGE_META[useLocation().pathname] ?? PAGE_META['/']

  return (
    <div className="flex h-[68px] shrink-0 items-center gap-3 border-b border-white/[0.06] px-3 sm:px-5">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Open navigation"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-white/10 bg-white/[0.04] text-ink-muted xl:hidden"
      >
        <LayoutDashboard size={14} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-[15px] font-medium tracking-tight text-ink">{meta.title}</h1>
          {connected ? (
            <Badge tone={signalState === 'STABLE' ? 'ok' : signalState === 'UNKNOWN' ? 'neutral' : signalState === 'UNSTABLE' || signalState === 'STALE' ? 'warn' : 'danger'} dot>
              {signalState === 'UNKNOWN' ? 'WAITING' : signalState}
            </Badge>
          ) : (
            <Badge tone={deviceState === 'ERROR' ? 'danger' : 'neutral'} dot>
              {deviceState === 'ERROR' ? 'LINK ERROR' : 'OFFLINE'}
            </Badge>
          )}
          {deviceProbe ? (
            <Badge tone={deviceProbe === 'E_FIELD' ? 'efield' : 'hfield'}>
              {deviceProbe === 'E_FIELD' ? 'E' : 'H'}-FIELD
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[10.5px] text-ink-dim">{meta.hint}</p>
      </div>

      {/* Session clock, as in the reference */}
      <div className="hidden items-center gap-2 rounded-[10px] border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 lg:flex">
        <span className="tabular text-[11px] text-ink-muted">
          {connected ? `${samplesReceived.toLocaleString('en-US')} frames` : 'no session'}
        </span>
        <span className="h-3 w-px bg-white/10" />
        <span className="tabular text-[11px] text-ink-dim">
          {lastFrameAt ? formatTime(lastFrameAt) : '--:--:--'}
        </span>
        <Crosshair size={12} className="text-ink-dim" />
      </div>

      {/* Demo Mode control — always visible so its state is never ambiguous */}
      <div className="flex shrink-0 items-center gap-1.5">
        {demoMode ? (
          <>
            <span className="hidden items-center gap-1.5 rounded-full border border-elevated/45 bg-elevated/15 px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-elevated sm:inline-flex">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-elevated" />
              DEMO DATA
            </span>
            <Button size="sm" variant="ghost" onClick={toggleDemoStream} title="Pause or resume the synthetic stream">
              {demoStreaming ? 'Pause stream' : 'Resume stream'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                void exitDemoMode()
                window.location.hash = '#/'
              }}
            >
              Exit demo
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={<Beaker size={11} />}
            onClick={() => {
              void enterDemoMode()
              window.location.hash = '#/'
            }}
            title="Load clearly-labelled synthetic data to inspect the interface without hardware"
          >
            <span className="hidden sm:inline">Demo data</span>
            <span className="sm:hidden">Demo</span>
          </Button>
        )}
      </div>

      <div className="hidden items-center gap-1.5 md:flex">
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium',
            acquiring && connected
              ? 'border-strong/40 bg-strong/12 text-strong'
              : 'border-line bg-white/[0.04] text-ink-dim',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', acquiring && connected ? 'animate-pulse-soft bg-strong' : 'bg-ink-dim')} />
          {acquiring && connected ? 'REC' : 'IDLE'}
        </span>
        {!storageOk ? <Badge tone="danger">NO STORE</Badge> : null}
        <button
          type="button"
          onClick={onConnect}
          title={connected ? 'Connection details' : 'Connect the detector'}
          className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-ink-muted transition-colors hover:text-ink"
        >
          {connected ? <Usb size={14} /> : deviceState === 'ERROR' ? <CircleAlert size={14} className="text-strong" /> : <Unplug size={14} />}
        </button>
        <button
          type="button"
          onClick={onConnect}
          title="Notifications and link log"
          className="relative flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] text-ink-muted transition-colors hover:text-ink"
        >
          <Bell size={14} />
          {deviceProbe ? <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-teal" /> : null}
        </button>
      </div>

      <Button variant="primary" size="md" icon={<Plug size={12} />} onClick={onConnect} className="shrink-0">
        <span className="hidden sm:inline">{connected ? 'Connection' : 'Connect'}</span>
        <span className="sm:hidden">Link</span>
      </Button>

      <div className="hidden items-center gap-2 pl-1 xl:flex">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet/70 to-blue/60 text-[10px] font-semibold text-[#0a0b0d]">
          {(session.device_id ?? 'EM').slice(0, 2).toUpperCase()}
        </div>
        <span className="max-w-[110px] truncate text-[11px] text-ink-muted">{session.device_id ?? 'Operator'}</span>
      </div>
      <span className="hidden text-[10px] text-ink-dim xl:inline">{relativeTime(lastFrameAt)}</span>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const [connectOpen, setConnectOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const hydrate = useApp((s) => s.hydrate)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

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

  return (
    <div className="relative z-10 flex h-screen w-full overflow-hidden">
      <div className="absolute inset-0 -z-10 ambient-drift" aria-hidden />

      {/* Sidebar */}
      <aside className="hidden w-[212px] shrink-0 border-r border-white/[0.06] bg-[#080b12]/70 backdrop-blur-xl xl:block">
        <Sidebar />
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[236px] border-r border-line bg-[#080b12] backdrop-blur-xl">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onConnect={() => setConnectOpen(true)} onMenu={() => setDrawerOpen(true)} />

        <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-4 xl:overflow-hidden">
          {children}
        </main>
      </div>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
      <ToastStack />
    </div>
  )
}
