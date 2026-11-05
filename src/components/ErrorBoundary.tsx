import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from './ui'

interface Props {
  children: ReactNode
  /** Short label used in the message, e.g. "Signal chart". */
  label: string
}

interface State {
  error: Error | null
}

/**
 * Keeps one failing panel from blanking the dashboard. A chart that cannot render
 * must never be replaced by invented data — it says so plainly instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}] render failed`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex flex-col items-start gap-2 px-4 py-6">
        <div className="flex items-center gap-2 text-[12px] font-medium text-elevated">
          <TriangleAlert size={14} />
          {this.props.label} could not be drawn
        </div>
        <p className="max-w-md text-[11px] leading-relaxed text-ink-dim">
          {error.message || 'Unknown rendering error.'} No substitute values are shown — the panel stays empty until it
          can render real data.
        </p>
        <Button size="sm" variant="secondary" onClick={() => this.setState({ error: null })}>
          Retry
        </Button>
      </div>
    )
  }
}
