import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

/* ------------------------------- primitives ------------------------------- */

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function Panel({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'div' | 'article' | 'aside'
}) {
  return <Tag className={cn('panel', className)}>{children}</Tag>
}

export function PanelHeader({
  title,
  subtitle,
  right,
  icon,
}: {
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon ? <span className="text-ink-dim">{icon}</span> : null}
          <h2 className="truncate text-[13px] font-medium tracking-tight text-ink">{title}</h2>
        </div>
        {subtitle ? <p className="mt-0.5 text-[11px] leading-relaxed text-ink-dim">{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('label-caps', className)}>{children}</span>
}

export function Metric({
  label,
  value,
  unit,
  hint,
  tone = 'default',
  size = 'md',
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  tone?: 'default' | 'accent' | 'dim' | 'warn' | 'danger' | 'ok'
  size?: 'sm' | 'md' | 'lg'
}) {
  const toneClass = {
    default: 'text-ink',
    accent: 'text-accent',
    dim: 'text-ink-dim',
    warn: 'text-elevated',
    danger: 'text-strong',
    ok: 'text-normal',
  }[tone]
  const sizeClass = { sm: 'text-[19px]', md: 'text-[26px]', lg: 'text-[40px]' }[size]
  return (
    <div className="min-w-0">
      <div className="label-caps">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cn('tabular leading-none font-medium tracking-tight', sizeClass, toneClass)}>{value}</span>
        {unit ? <span className="text-[11px] text-ink-dim">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-1.5 text-[11px] leading-snug text-ink-dim">{hint}</div> : null}
    </div>
  )
}

/* --------------------------------- buttons -------------------------------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  icon?: ReactNode
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, className, children, ...rest },
  ref,
) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap'
  const variants = {
    primary: 'border-accent/60 bg-accent text-white hover:bg-accent/90',
    secondary: 'border-line bg-panel-raised text-ink hover:border-line hover:bg-[#232a3b]',
    ghost: 'border-transparent bg-transparent text-ink-muted hover:bg-panel-raised hover:text-ink',
    danger: 'border-strong/45 bg-strong/12 text-strong hover:bg-strong/20',
  }
  const sizes = { sm: 'h-7 px-2.5 text-[11px]', md: 'h-9 px-3.5 text-[12.5px]' }
  return (
    <button
      ref={ref}
      className={cn(base, variants[variant], sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
})

/* --------------------------------- fields --------------------------------- */

const fieldClass =
  'h-9 w-full rounded-lg border border-line bg-canvas px-2.5 text-[12.5px] text-ink outline-none transition-colors placeholder:text-ink-dim/70 hover:border-[#343c52] focus:border-accent/70 focus:ring-2 focus:ring-accent/20 disabled:opacity-45'

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, 'tabular-none', className)} {...rest} />
}

export function NumberInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className={cn(fieldClass, 'font-mono text-[12px] tabular-nums', className)}
      {...rest}
    />
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldClass, 'cursor-pointer appearance-none pr-7', className)} {...rest}>
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
    <label className={cn('block', className)}>
      <span className="label-caps mb-1.5 block">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-[11px] leading-snug text-ink-dim">{hint}</span> : null}
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
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink">{label}</div>
        {description ? <div className="mt-0.5 text-[11px] leading-snug text-ink-dim">{description}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors',
          checked ? 'border-accent/60 bg-accent/80' : 'border-line bg-canvas',
          disabled && 'opacity-40',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-all',
            checked ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  )
}

/* --------------------------------- badges --------------------------------- */

const toneMap = {
  ok: 'border-normal/35 bg-normal/10 text-normal',
  warn: 'border-elevated/35 bg-elevated/10 text-elevated',
  danger: 'border-strong/35 bg-strong/10 text-strong',
  neutral: 'border-line bg-panel-raised text-ink-muted',
  accent: 'border-accent/35 bg-accent/10 text-accent',
  efield: 'border-efield/35 bg-efield/10 text-efield',
  hfield: 'border-hfield/35 bg-hfield/10 text-hfield',
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
        'inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide whitespace-nowrap',
        toneMap[tone],
        className,
      )}
    >
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
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
        'flex flex-col items-center justify-center rounded-[10px] border border-dashed border-line/80 px-6 text-center',
        compact ? 'py-8' : 'py-14',
      )}
    >
      {icon ? <div className="mb-3 text-ink-dim/70">{icon}</div> : null}
      <div className="text-[13px] font-medium text-ink-muted">{title}</div>
      {children ? <div className="mt-1.5 max-w-sm text-[11.5px] leading-relaxed text-ink-dim">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line-soft', className)} />
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
}: {
  options: { value: T; label: string; icon?: ReactNode; disabled?: boolean; title?: string }[]
  value: T | null
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-canvas p-0.5', className)}>
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
              'inline-flex items-center gap-1.5 rounded-[6px] font-medium transition-colors disabled:opacity-35',
              size === 'sm' ? 'h-6 px-2 text-[10.5px]' : 'h-7 px-2.5 text-[11.5px]',
              active ? 'bg-panel-raised text-ink shadow-[inset_0_0_0_1px_rgba(139,92,246,0.35)]' : 'text-ink-dim hover:text-ink-muted',
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

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-[11.5px] text-ink-dim">{label}</span>
      <span className={cn('text-right text-[11.5px] text-ink', mono && 'tabular')}>{value}</span>
    </div>
  )
}

export function Notice({
  tone = 'neutral',
  title,
  children,
  icon,
  action,
}: {
  tone?: Tone
  title: string
  children?: ReactNode
  icon?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={cn('rounded-[10px] border px-3 py-2.5', toneMap[tone])}>
      <div className="flex items-start gap-2">
        {icon ? <span className="mt-px shrink-0 opacity-80">{icon}</span> : null}
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium">{title}</div>
          {children ? <div className="mt-0.5 text-[11px] leading-relaxed opacity-80">{children}</div> : null}
        </div>
        {action}
      </div>
    </div>
  )
}
