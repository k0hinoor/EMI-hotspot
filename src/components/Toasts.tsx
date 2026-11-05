import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { useApp } from '../store/app'
import { cn } from './ui'

const toneStyles = {
  ok: { icon: CircleCheck, ring: 'border-normal/40', text: 'text-normal' },
  warn: { icon: TriangleAlert, ring: 'border-elevated/40', text: 'text-elevated' },
  error: { icon: CircleAlert, ring: 'border-strong/40', text: 'text-strong' },
  info: { icon: Info, ring: 'border-line', text: 'text-ink-muted' },
} as const

export function ToastStack() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismissToast)
  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[300px] flex-col gap-2">
      {toasts.map((toast) => {
        const style = toneStyles[toast.tone]
        const Icon = style.icon
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-[12px] border bg-[#0b0e16]/95 px-3 py-2.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl',
              style.ring,
            )}
          >
            <Icon size={15} className={cn('mt-px shrink-0', style.text)} />
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] font-medium text-ink">{toast.title}</div>
              {toast.detail ? <div className="mt-0.5 text-[10px] leading-snug text-ink-dim">{toast.detail}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
              className="shrink-0 rounded p-0.5 text-ink-dim hover:text-ink"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
