import { Zap, Waves } from 'lucide-react'
import { useApp } from '../store/app'
import { cn } from './ui'
import type { ProbeType } from '../lib/types'

/**
 * Probe identity selector (PRD §7.1). When the device reports a probe type the
 * selector mirrors it and offers a command to switch on the device instead.
 */
export function ProbeSelector({ compact }: { compact?: boolean }) {
  const { activeProbeType, setActiveProbeType, deviceProbe, deviceState, sendCommand } = useApp()
  const locked = deviceState === 'CONNECTED' && deviceProbe !== null

  const options: { type: ProbeType; label: string; sub: string; icon: typeof Zap; color: string }[] = [
    { type: 'E_FIELD', label: 'E-field', sub: 'Monopole · electric', icon: Zap, color: 'efield' },
    { type: 'H_FIELD', label: 'H-field', sub: 'Loop · magnetic', icon: Waves, color: 'hfield' },
  ]

  return (
    <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2')}>
      {options.map((opt) => {
        const active = activeProbeType === opt.type
        const Icon = opt.icon
        return (
          <button
            key={opt.type}
            type="button"
            onClick={() => {
              setActiveProbeType(opt.type)
              if (deviceState === 'CONNECTED') void sendCommand(`#PROBE ${opt.type}`)
            }}
            className={cn(
              'group relative flex items-start gap-2 rounded-[7px] border px-2 py-1.5 text-left transition-colors',
              active
                ? opt.type === 'E_FIELD'
                  ? 'border-efield/50 bg-efield/12 shadow-[0_0_24px_-12px_rgba(106,168,255,0.8)]'
                  : 'border-hfield/50 bg-hfield/12 shadow-[0_0_24px_-12px_rgba(167,139,250,0.8)]'
                : 'border-line bg-black/25 hover:border-white/20',
            )}
            aria-pressed={active}
          >
            <Icon
              size={13}
              strokeWidth={1.9}
              className={cn(
                'mt-0.5 shrink-0',
                active ? (opt.type === 'E_FIELD' ? 'text-efield' : 'text-hfield') : 'text-ink-dim',
              )}
            />
            <span className="min-w-0">
              <span className={cn('block text-[11px] font-medium', active ? 'text-ink' : 'text-ink-muted')}>
                {opt.label}
              </span>
              <span className="block text-[9px] leading-tight text-ink-dim">{opt.sub}</span>
            </span>
            {locked && deviceProbe === opt.type ? (
              <span className="absolute top-2 right-2 rounded border border-line px-1 font-mono text-[8.5px] tracking-wider text-ink-dim">
                DEVICE
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
