import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/* ---------------------------------- frames -------------------------------- */

/**
 * A fixed-height pane. Content scrolls inside `.frame-body` so the page itself
 * never scrolls — the dashboard behaves like an instrument, not a document.
 */
export function Frame({
  children,
  className,
  span,
}: {
  children: ReactNode
  className?: string
  /** Grid placement classes applied by the parent page. */
  span?: string
}) {
  return <section className={cn('frame', span, className)}>{children}</section>
}

export function FrameHeader({
  title,
  subtitle,
  right,
  icon,
  divider = false,
}: {
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  icon?: ReactNode
  divider?: boolean
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-start justify-between gap-3 px-4 pt-3.5 pb-2',
        divider && 'border-b border-white/[0.06]',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon ? <span className="text-teal/80">{icon}</span> : null}
          <h2 className="card-title truncate">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 truncate text-[10.5px] leading-tight text-ink-dim">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
    </div>
  )
}

/** Legacy aliases: a Panel is a Frame; keep older call sites readable. */
export const Panel = Frame
export const PanelHeader = FrameHeader

export function FrameBody({ children, className, noPad }: { children: ReactNode; className?: string; noPad?: boolean }) {
  return <div className={cn('frame-body', !noPad && 'px-4 pb-3.5', className)}>{children}</div>
}

/** Footer strip for a frame — fixed, never scrolls away. */
export function FrameFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2 border-t border-white/[0.06] px-4 py-2.5', className)}>
      {children}
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('label-caps', className)}>{children}</span>
}

/* --------------------------------- metrics -------------------------------- */

export function Metric({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  size = 'md',
  className,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  tone?: 'default' | 'accent' | 'dim' | 'warn' | 'danger' | 'ok' | 'e' | 'h'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}) {
  const toneClass = {
    default: 'text-ink',
    accent: 'text-teal',
    dim: 'text-ink-dim',
    warn: 'text-elevated',
    danger: 'text-strong',
    ok: 'text-green',
    e: 'text-efield',
    h: 'text-hfield',
  }[tone]
  const glow = {
    default: '',
    accent: 'drop-shadow-[0_0_14px_rgba(53,229,197,0.45)]',
    dim: '',
    warn: 'drop-shadow-[0_0_14px_rgba(247,168,75,0.4)]',
    danger: 'drop-shadow-[0_0_14px_rgba(255,111,139,0.4)]',
    ok: 'drop-shadow-[0_0_14px_rgba(61,220,151,0.4)]',
    e: 'drop-shadow-[0_0_14px_rgba(106,168,255,0.4)]',
    h: 'drop-shadow-[0_0_14px_rgba(167,139,250,0.4)]',
  }[tone]
  const sizeClass = { xs: 'text-[16px]', sm: 'text-[20px]', md: 'text-[26px]', lg: 'text-[40px]' }[size]
  return (
    <div className={cn('min-w-0', className)}>
      <div className="label-caps truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn('tabular leading-none font-medium tracking-tight', sizeClass, toneClass, glow)}>{value}</span>
        {unit ? <span className="truncate text-[10px] text-ink-dim">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1.5 truncate text-[10px] leading-tight text-ink-dim">{hint}</div> : null}
    </div>
  )
}

/* --------------------------------- controls ------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'xs' | 'sm' | 'md'
  icon?: ReactNode
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon, block, className, children, ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-[9px] border font-medium transition-all disabled:cursor-not-allowed disabled:opacity-35 whitespace-nowrap'
  const variants = {
    primary:
      'border-teal/50 bg-teal/15 text-teal hover:bg-teal/25 shadow-[0_0_20px_-8px_rgba(53,229,197,0.7)]',
    secondary: 'border-line bg-white/[0.04] text-ink hover:border-white/20 hover:bg-white/[0.07]',
    ghost: 'border-transparent bg-transparent text-ink-muted hover:bg-white/[0.05] hover:text-ink',
    danger: 'border-strong/40 bg-strong/12 text-strong hover:bg-strong/20',
  }
  const sizes = { xs: 'h-6 px-2 text-[10px]', sm: 'h-7 px-2.5 text-[11px]', md: 'h-8 px-3.5 text-[11.5px]' }
  return (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </button>
  )
})

const fieldClass =
  'h-7 w-full rounded-[8px] border border-line bg-[#080b12]/80 px-2.5 text-[11.5px] text-ink outline-none transition-colors placeholder:text-ink-dim/70 hover:border-white/15 focus:border-teal/50 disabled:opacity-40'

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...rest} />
}

export function NumberInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="number" inputMode="decimal" className={cn(fieldClass, 'tabular text-[11px]', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, 'cursor-pointer appearance-none pr-6', className)} {...rest}>
      {children}
    </select>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('block min-w-0', className)}>
      <span className="label-caps mb-1 block truncate">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[9.5px] leading-tight text-ink-dim">{hint}</span> : null}
    </label>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[11.5px] leading-tight text-ink">{label}</div>
        {description ? <div className="mt-0.5 text-[9.5px] leading-tight text-ink-dim">{description}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-4 w-7 shrink-0 rounded-full border transition-colors',
          checked ? 'border-teal/50 bg-teal/85' : 'border-line bg-black/25',
          disabled && 'opacity-40',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] h-2.5 w-2.5 rounded-full transition-all',
            checked ? 'left-[15px] bg-teal-ink' : 'left-[3px] bg-ink-dim',
          )}
        />
      </button>
    </div>
  )
}

/* ---------------------------------- badges -------------------------------- */

const toneMap = {
  ok: 'border-normal/35 bg-normal/12 text-normal',
  warn: 'border-elevated/35 bg-elevated/12 text-elevated',
  danger: 'border-strong/35 bg-strong/12 text-strong',
  neutral: 'border-line bg-white/[0.05] text-ink-muted',
  accent: 'border-teal/30 bg-teal/10 text-teal',
  efield: 'border-efield/35 bg-efield/12 text-efield',
  hfield: 'border-hfield/35 bg-hfield/12 text-hfield',
} as const

export type Tone = keyof typeof toneMap

export function Badge({
  children,
  tone = 'neutral',
  dot,
  className,
}: {
  children: ReactNode
  tone?: Tone
  dot?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[9.5px] font-medium tracking-wide whitespace-nowrap',
        toneMap[tone],
        className,
      )}
    >
      {dot ? <span className="h-1 w-1 rounded-full bg-current" /> : null}
      {children}
    </span>
  )
}

export function StatusDot({ tone = 'neutral', pulse }: { tone?: Tone; pulse?: boolean }) {
  const color = {
    ok: 'bg-normal shadow-[0_0_8px_2px_rgba(61,220,151,0.45)]',
    warn: 'bg-elevated shadow-[0_0_8px_2px_rgba(247,168,75,0.4)]',
    danger: 'bg-strong shadow-[0_0_8px_2px_rgba(255,111,139,0.4)]',
    neutral: 'bg-ink-dim',
    accent: 'bg-teal shadow-[0_0_8px_2px_rgba(53,229,197,0.45)]',
    efield: 'bg-efield shadow-[0_0_8px_2px_rgba(106,168,255,0.45)]',
    hfield: 'bg-hfield shadow-[0_0_8px_2px_rgba(167,139,250,0.45)]',
  }[tone]
  return <span className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', color, pulse && 'animate-pulse-soft')} />
}

/* ---------------------------------- misc ---------------------------------- */

export function EmptyState({
  icon,
  title,
  children,
  action,
  compact,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[10px] border border-dashed border-white/10 bg-white/[0.015] px-4 text-center',
        compact ? 'py-5' : 'py-10',
      )}
    >
      {icon ? <div className="mb-2 text-ink-dim/60">{icon}</div> : null}
      <div className="text-[11.5px] font-medium text-ink-muted">{title}</div>
      {children ? <div className="mt-1 max-w-sm text-[10.5px] leading-relaxed text-ink-dim">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full shrink-0 bg-line-soft', className)} />
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
}: {
  options: { value: T; label: string; icon?: ReactNode; disabled?: boolean; title?: string }[]
  value: T | null
  onChange: (v: T) => void
  size?: 'xs' | 'sm'
  className?: string
}) {
  return (
    <div className={cn('inline-flex shrink-0 rounded-full border border-line bg-[#080b12]/80 p-0.5', className)}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full font-medium transition-colors disabled:opacity-30',
              size === 'xs' ? 'h-5 px-2 text-[9.5px]' : 'h-6 px-2.5 text-[10.5px]',
              active ? 'bg-white/[0.10] text-ink shadow-[0_0_16px_-6px_rgba(53,229,197,0.8)]' : 'text-ink-dim hover:text-ink-muted',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function KeyValue({
  label,
  value,
  mono,
  className,
}: {
  label: string
  value: ReactNode
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-[3px]', className)}>
      <span className="shrink-0 text-[10.5px] text-ink-dim">{label}</span>
      <span className={cn('truncate text-right text-[10.5px] text-ink-muted', mono && 'tabular')}>{value}</span>
    </div>
  )
}

export function Notice({
  tone = 'neutral',
  title,
  children,
  icon,
  action,
  className,
}: {
  tone?: Tone
  title: string
  children?: ReactNode
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('rounded-[7px] border px-2.5 py-2', toneMap[tone], className)}>
      <div className="flex items-start gap-1.5">
        {icon ? <span className="mt-px shrink-0 opacity-75">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-medium leading-tight">{title}</div>
          {children ? <div className="mt-0.5 text-[10px] leading-snug opacity-80">{children}</div> : null}
        </div>
        {action}
      </div>
    </div>
  )
}
