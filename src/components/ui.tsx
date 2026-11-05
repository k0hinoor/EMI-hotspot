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
  divider = true,
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
        'flex shrink-0 items-center justify-between gap-3 px-3 py-2',
        divider && 'border-b border-line-soft',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {icon ? <span className="text-ink-dim">{icon}</span> : null}
          <h2 className="truncate text-[11.5px] font-medium tracking-tight text-ink">{title}</h2>
        </div>
        {subtitle ? <p className="mt-0.5 truncate text-[10px] leading-tight text-ink-dim">{subtitle}</p> : null}
      </div>
      {right ? <div className="flex shrink-0 items-center gap-1.5">{right}</div> : null}
    </div>
  )
}

/** Legacy aliases: a Panel is a Frame; keep older call sites readable. */
export const Panel = Frame
export const PanelHeader = FrameHeader

export function FrameBody({ children, className, noPad }: { children: ReactNode; className?: string; noPad?: boolean }) {
  return <div className={cn('frame-body', !noPad && 'p-3', className)}>{children}</div>
}

/** Footer strip for a frame — fixed, never scrolls away. */
export function FrameFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2 border-t border-line-soft px-3 py-2', className)}>
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
    accent: 'text-accent',
    dim: 'text-ink-dim',
    warn: 'text-elevated',
    danger: 'text-strong',
    ok: 'text-normal',
    e: 'text-efield',
    h: 'text-hfield',
  }[tone]
  const sizeClass = { xs: 'text-[15px]', sm: 'text-[18px]', md: 'text-[23px]', lg: 'text-[36px]' }[size]
  return (
    <div className={cn('min-w-0', className)}>
      <div className="label-caps truncate">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn('tabular leading-none font-medium', sizeClass, toneClass)}>{value}</span>
        {unit ? <span className="truncate text-[9.5px] text-ink-dim">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1 truncate text-[9.5px] leading-tight text-ink-dim">{hint}</div> : null}
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
    'inline-flex items-center justify-center gap-1.5 rounded-[7px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 whitespace-nowrap'
  const variants = {
    primary: 'border-transparent bg-accent text-accent-ink hover:bg-[#f0ece3]',
    secondary: 'border-line bg-panel-raised text-ink hover:border-[#31353c] hover:bg-[#1c2026]',
    ghost: 'border-transparent bg-transparent text-ink-muted hover:bg-panel-raised hover:text-ink',
    danger: 'border-strong/35 bg-strong/10 text-strong hover:bg-strong/16',
  }
  const sizes = { xs: 'h-6 px-2 text-[10px]', sm: 'h-7 px-2.5 text-[11px]', md: 'h-8 px-3 text-[11.5px]' }
  return (
    <button ref={ref} className={cn(base, variants[variant], sizes[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
    </button>
  )
})

const fieldClass =
  'h-7 w-full rounded-[6px] border border-line bg-canvas px-2 text-[11.5px] text-ink outline-none transition-colors placeholder:text-ink-dim/70 hover:border-[#31353c] focus:border-accent/45 disabled:opacity-40'

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
          checked ? 'border-accent/40 bg-accent/85' : 'border-line bg-canvas',
          disabled && 'opacity-40',
        )}
      >
        <span
          className={cn(
            'absolute top-[3px] h-2.5 w-2.5 rounded-full transition-all',
            checked ? 'left-[15px] bg-accent-ink' : 'left-[3px] bg-ink-dim',
          )}
        />
      </button>
    </div>
  )
}

/* ---------------------------------- badges -------------------------------- */

const toneMap = {
  ok: 'border-normal/30 bg-normal/8 text-normal',
  warn: 'border-elevated/30 bg-elevated/8 text-elevated',
  danger: 'border-strong/30 bg-strong/8 text-strong',
  neutral: 'border-line bg-panel-raised text-ink-muted',
  accent: 'border-accent/25 bg-accent/8 text-accent',
  efield: 'border-efield/30 bg-efield/8 text-efield',
  hfield: 'border-hfield/30 bg-hfield/8 text-hfield',
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
        'inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-[1px] text-[9.5px] font-medium tracking-wide whitespace-nowrap',
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
    ok: 'bg-normal',
    warn: 'bg-elevated',
    danger: 'bg-strong',
    neutral: 'bg-ink-dim',
    accent: 'bg-accent',
    efield: 'bg-efield',
    hfield: 'bg-hfield',
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
        'flex flex-col items-center justify-center rounded-[8px] border border-dashed border-line/70 px-4 text-center',
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
    <div className={cn('inline-flex shrink-0 rounded-[6px] border border-line bg-canvas p-0.5', className)}>
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
              'inline-flex items-center gap-1 rounded-[4px] font-medium transition-colors disabled:opacity-30',
              size === 'xs' ? 'h-5 px-1.5 text-[9.5px]' : 'h-6 px-2 text-[10.5px]',
              active ? 'bg-panel-raised text-ink' : 'text-ink-dim hover:text-ink-muted',
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
