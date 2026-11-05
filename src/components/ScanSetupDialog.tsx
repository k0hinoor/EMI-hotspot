import { useMemo, useState } from 'react'
import { Grid3x3, X } from 'lucide-react'
import { useApp } from '../store/app'
import { Badge, Button, Divider, Field, NumberInput, Select, TextInput, cn } from './ui'
import { gridGeometry } from '../lib/derive'
import type { ProbeType, Scan } from '../lib/types'

export function ScanSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createScan, probes, profiles, activeProbeType } = useApp()
  const [name, setName] = useState('')
  const [width, setWidth] = useState('100')
  const [height, setHeight] = useState('80')
  const [spacing, setSpacing] = useState('10')
  const [probeType, setProbeType] = useState<ProbeType>(activeProbeType)
  const [origin, setOrigin] = useState<Scan['origin']>('TOP_LEFT')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const geometry = useMemo(() => {
    const w = Number(width)
    const h = Number(height)
    const s = Number(spacing)
    if (!(w > 0) || !(h > 0) || !(s > 0)) return null
    return gridGeometry(w, h, s)
  }, [width, height, spacing])

  const probe = probes.find((p) => p.probe_type === probeType)
  const activeProfile =
    profiles.find((p) => p.probe_id === probe?.probe_id) ?? null

  if (!open) return null

  const valid = geometry !== null && name.trim().length > 0 && Number(width) <= 2000 && Number(height) <= 2000

  const submit = async () => {
    if (!geometry || !valid) return
    setSaving(true)
    await createScan({
      scan_name: name.trim(),
      board_width_mm: Number(width),
      board_height_mm: Number(height),
      grid_spacing_mm: Number(spacing),
      probe_id: probe?.probe_id ?? `probe-${probeType.toLowerCase()}`,
      probe_type: probeType,
      notes: notes.trim(),
      origin,
      calibration_profile_id: activeProfile?.profile_id ?? null,
    })
    setSaving(false)
    setName('')
    setNotes('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/65 p-4 sm:items-center">
      <div className="absolute inset-0" onClick={onClose} aria-hidden />
      <div className="relative z-10 w-full max-w-[520px] rounded-[14px] border border-line bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Grid3x3 size={15} className="text-accent" />
              <h2 className="text-[13.5px] font-medium text-ink">New scan</h2>
            </div>
            <p className="mt-1 text-[11px] text-ink-dim">
              Define the physical test area. The grid is generated in millimetres and every cell is a probe position.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-dim hover:bg-panel-raised hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <Field label="Scan name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Buck converter — top side" />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <Field label="Width (mm)">
              <NumberInput min={1} value={width} onChange={(e) => setWidth(e.target.value)} />
            </Field>
            <Field label="Height (mm)">
              <NumberInput min={1} value={height} onChange={(e) => setHeight(e.target.value)} />
            </Field>
            <Field label="Spacing (mm)">
              <NumberInput min={1} value={spacing} onChange={(e) => setSpacing(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Probe">
              <Select value={probeType} onChange={(e) => setProbeType(e.target.value as ProbeType)}>
                <option value="E_FIELD">E-field (electric)</option>
                <option value="H_FIELD">H-field (magnetic)</option>
              </Select>
            </Field>
            <Field label="Coordinate origin">
              <Select value={origin} onChange={(e) => setOrigin(e.target.value as Scan['origin'])}>
                <option value="TOP_LEFT">Top-left of board</option>
                <option value="BOTTOM_LEFT">Bottom-left of board</option>
              </Select>
            </Field>
          </div>

          <Field label="Notes (optional)">
            <TextInput
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Probe height, orientation, DUT state…"
            />
          </Field>

          <Divider />

          <div className="rounded-[10px] border border-line bg-canvas px-3 py-3">
            <div className="flex items-center justify-between">
              <span className="label-caps">Generated grid</span>
              {geometry ? (
                <Badge tone={geometry.totalCells > 2000 ? 'warn' : 'neutral'}>
                  {geometry.totalCells.toLocaleString('en-US')} cells
                </Badge>
              ) : (
                <Badge tone="danger">invalid</Badge>
              )}
            </div>
            {geometry ? (
              <>
                <div className="mt-2 flex items-baseline gap-4">
                  <span className="tabular text-[18px] text-ink">
                    {geometry.cols}
                    <span className="mx-1 text-[11px] text-ink-dim">×</span>
                    {geometry.rows}
                  </span>
                  <span className="text-[11px] text-ink-dim">
                    columns × rows · cell {geometry.cellWidth.toFixed(1)} × {geometry.cellHeight.toFixed(1)} mm
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10.5px] text-ink-dim">
                  <span>Coverage 0 of {geometry.totalCells}</span>
                  <span className="truncate">{probe?.label ?? 'Probe not registered'}</span>
                  <span>{activeProfile ? `Profile ${activeProfile.label}` : 'No calibration profile'}</span>
                </div>
                {geometry.totalCells > 2000 ? (
                  <p className="mt-2 text-[10.5px] text-elevated">
                    More than 2000 cells — manual scanning will be slow. Consider a larger spacing.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-[10.5px] text-ink-dim">Enter positive width, height and spacing.</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-5 py-3">
          <span className="text-[10.5px] text-ink-dim">Measurements are captured cell by cell from live frames.</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={!valid || saving} onClick={() => void submit()} className={cn(saving && 'opacity-70')}>
              {saving ? 'Creating…' : 'Create scan'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
