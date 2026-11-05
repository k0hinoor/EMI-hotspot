import { useMemo, useState } from 'react'
import { CircleAlert, FlaskConical, Info, Plus, Ruler, Save, Waves, Zap } from 'lucide-react'
import { useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  Field,
  Frame,
  FrameBody,
  FrameFooter,
  FrameHeader,
  KeyValue,
  Notice,
  NumberInput,
  TextInput,
  cn,
} from '../components/ui'
import { formatDateTime, formatNumber, probeLabel, uid } from '../lib/derive'
import type { CalibrationProfile, Probe, ProbeType } from '../lib/types'

export function Calibration() {
  const { probes, profiles, settings, samples, stats, saveProbe, saveProfile, notify, deviceProbe } = useApp()
  const [probeType, setProbeType] = useState<ProbeType>(deviceProbe ?? 'E_FIELD')
  const [probeDraft, setProbeDraft] = useState<Probe | null>(null)
  const [profileDraft, setProfileDraft] = useState<CalibrationProfile | null>(null)

  const probe = probes.find((p) => p.probe_type === probeType)
  const profile = useMemo(() => profiles.find((p) => p.probe_id === probe?.probe_id) ?? null, [profiles, probe])

  const activeProbe = probeDraft && probeDraft.probe_type === probeType ? probeDraft : probe
  const activeProfile = profileDraft && profileDraft.probe_type === probeType ? profileDraft : profile

  const live = stats(10)
  const suggestion = useMemo(() => {
    const recent = samples.slice(-settings.acquisition.averaging_window).map((s) => s.signal_raw)
    if (recent.length < 5) return null
    return recent.reduce((a, b) => a + b, 0) / recent.length
  }, [samples, settings.acquisition.averaging_window])

  const history = profiles
    .filter((p) => p.probe_id === activeProbe?.probe_id)
    .sort((a, b) => new Date(b.calibration_date).getTime() - new Date(a.calibration_date).getTime())

  const Icon = probeType === 'E_FIELD' ? Zap : Waves

  const saveProbeDraft = async () => {
    if (!activeProbe) return
    if (!activeProbe.label.trim()) {
      notify('error', 'Probe needs a label', 'Give the probe a name so measurements can be traced to it.')
      return
    }
    await saveProbe({ ...activeProbe, profile_id: activeProfile?.profile_id ?? activeProbe.profile_id })
    setProbeDraft(null)
    notify('ok', 'Probe saved', 'Profile metadata stored locally.')
  }

  const saveProfileDraft = async () => {
    if (!activeProfile || !activeProbe) return
    if (!activeProfile.label.trim()) {
      notify('error', 'Profile needs a label', 'Name the baseline profile so scans can reference it.')
      return
    }
    await saveProfile({ ...activeProfile, probe_id: activeProbe.probe_id, probe_type: probeType })
    await saveProbe({ ...activeProbe, profile_id: activeProfile.profile_id })
    setProfileDraft(null)
    notify('ok', 'Calibration profile saved', `${activeProfile.label} is now active for ${probeLabel(probeType)}.`)
  }

  const newProfile = () => {
    if (!activeProbe) return
    setProfileDraft({
      profile_id: uid('CAL'),
      probe_id: activeProbe.probe_id,
      probe_type: probeType,
      label: `${probeLabel(probeType)} baseline ${new Date().toISOString().slice(0, 10)}`,
      baseline_value: suggestion !== null ? Math.round(suggestion) : 0,
      gain_setting: activeProfile?.gain_setting ?? 1,
      reference_method: 'Open-space baseline, probe away from DUT',
      calibration_date: new Date().toISOString(),
      notes: '',
    })
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-2.5 max-xl:h-auto xl:grid-cols-[236px_minmax(0,1fr)_minmax(0,1fr)]">
      {/* left rail: probe switch + live check + caveat */}
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none">
        <Frame className="shrink-0">
          <FrameHeader title="Probe" subtitle="identity recorded per reading" icon={<Icon size={12} />} />
          <div className="space-y-1.5 p-2.5">
            <div className="grid grid-cols-2 gap-1">
              {(['E_FIELD', 'H_FIELD'] as ProbeType[]).map((type) => {
                const active = probeType === type
                const TypeIcon = type === 'E_FIELD' ? Zap : Waves
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setProbeType(type)
                      setProbeDraft(null)
                      setProfileDraft(null)
                    }}
                    className={cn(
                      'flex items-center gap-1.5 rounded-[6px] border px-2 py-1.5 text-[10.5px] font-medium transition-colors',
                      active
                        ? type === 'E_FIELD'
                          ? 'border-efield/40 bg-efield/8 text-efield'
                          : 'border-hfield/40 bg-hfield/8 text-hfield'
                        : 'border-line bg-black/25 text-ink-dim hover:text-ink-muted',
                    )}
                  >
                    <TypeIcon size={11} />
                    {probeLabel(type)}
                  </button>
                )
              })}
            </div>
            <KeyValue label="Device reports" value={deviceProbe ? probeLabel(deviceProbe) : '—'} />
            <KeyValue label="Active profile" value={activeProfile?.profile_id ?? 'none'} mono />
          </div>
        </Frame>

        <Frame className="min-h-0">
          <FrameHeader title="Live check" subtitle="10 s window" />
          <FrameBody className="p-2.5">
            <KeyValue
              label="Current mean"
              value={live.window.mean !== null ? `${formatNumber(live.window.mean, 1)} ${settings.acquisition.unit}` : 'no frames'}
              mono
            />
            <KeyValue
              label="Above baseline"
              value={
                live.window.mean !== null && activeProfile
                  ? `${formatNumber(live.window.mean - activeProfile.baseline_value, 1)}`
                  : '—'
              }
              mono
            />
            <KeyValue label="Frames used" value={live.window.count} mono />
            <KeyValue
              label="Instability"
              value={live.window.spreadPct !== null ? `${formatNumber(live.window.spreadPct, 1)}% pk-pk` : '—'}
              mono
            />
            <Divider className="my-1.5" />
            <p className="text-[9.5px] leading-snug text-ink-dim">
              Holding the probe in open space away from the DUT gives the noise-floor reference. Record it as the
              baseline so relative readings have context.
            </p>
            <div className="mt-2 space-y-1.5">
              <Notice tone="warn" title="Baseline ≠ calibration" icon={<CircleAlert size={11} />}>
                Claiming V/m or A/m needs a reference instrument, defined geometry and a documented procedure.
              </Notice>
              <Notice tone="neutral" title="Verify probe selectivity" icon={<Info size={11} />}>
                Monopole and loop favour E and H coupling, but both respond to both fields.
              </Notice>
            </div>
          </FrameBody>
        </Frame>
      </div>

      {/* probe profile */}
      <Frame className="min-h-[360px] xl:min-h-0">
        <FrameHeader
          title="Probe profile"
          subtitle="physical identity"
          icon={<Icon size={12} />}
          right={<Badge tone={probeType === 'E_FIELD' ? 'efield' : 'hfield'}>{probeLabel(probeType)}</Badge>}
        />
        <FrameBody className="space-y-2 p-2.5">
          {!activeProbe ? (
            <div className="py-6 text-center text-[10.5px] text-ink-dim">No probe registered for this field type.</div>
          ) : (
            <>
              <Field label="Probe ID">
                <TextInput
                  value={activeProbe.probe_id}
                  onChange={(e) => setProbeDraft({ ...activeProbe, probe_id: e.target.value })}
                  className="font-mono text-[10.5px]"
                />
              </Field>
              <Field label="Label">
                <TextInput value={activeProbe.label} onChange={(e) => setProbeDraft({ ...activeProbe, label: e.target.value })} />
              </Field>
              <Field label="Connector">
                <TextInput
                  value={activeProbe.connector_type}
                  onChange={(e) => setProbeDraft({ ...activeProbe, connector_type: e.target.value })}
                />
              </Field>
              <Field label="Physical dimensions" hint="Documentation only — not a calibration input.">
                <TextInput
                  value={activeProbe.physical_dimensions}
                  onChange={(e) => setProbeDraft({ ...activeProbe, physical_dimensions: e.target.value })}
                />
              </Field>
              <div className="pt-1 text-[9px] text-ink-dim">registered {formatDateTime(activeProbe.created_at)}</div>
            </>
          )}
        </FrameBody>
        <FrameFooter className="justify-between">
          <span className="text-[9px] text-ink-dim">{probeDraft ? 'unsaved changes' : 'saved'}</span>
          <Button size="sm" variant="primary" icon={<Save size={10} />} disabled={!probeDraft} onClick={() => void saveProbeDraft()}>
            Save probe
          </Button>
        </FrameFooter>
      </Frame>

      {/* baseline + history */}
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2.5 max-xl:grid-rows-none">
        <Frame className="shrink-0">
          <FrameHeader
            title="Baseline & gain"
            subtitle="correction, not calibration"
            icon={<FlaskConical size={12} />}
            right={
              <>
                <Badge tone={activeProfile ? 'accent' : 'warn'}>{activeProfile ? 'ACTIVE' : 'NONE'}</Badge>
                <Button size="xs" variant="ghost" icon={<Plus size={9} />} onClick={newProfile} disabled={!activeProbe}>
                  new
                </Button>
              </>
            }
          />
          {!activeProfile ? (
            <div className="px-2.5 py-5 text-center text-[10px] leading-relaxed text-ink-dim">
              No baseline profile for this probe. Create one to record a noise-floor value and reference method with
              every measurement.
            </div>
          ) : (
            <>
              <div className="space-y-2 p-2.5">
                <Field label="Profile label">
                  <TextInput value={activeProfile.label} onChange={(e) => setProfileDraft({ ...activeProfile, label: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-1.5">
                  <Field
                    label={`Baseline · ${settings.acquisition.unit}`}
                    hint={suggestion !== null ? `live mean ${formatNumber(suggestion, 1)}` : 'no live frames'}
                  >
                    <NumberInput
                      value={activeProfile.baseline_value}
                      onChange={(e) => setProfileDraft({ ...activeProfile, baseline_value: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Gain" hint="if supported by hardware">
                    <NumberInput
                      step="0.1"
                      value={activeProfile.gain_setting}
                      onChange={(e) => setProfileDraft({ ...activeProfile, gain_setting: Number(e.target.value) })}
                    />
                  </Field>
                </div>
                <Field label="Reference method">
                  <TextInput
                    value={activeProfile.reference_method}
                    onChange={(e) => setProfileDraft({ ...activeProfile, reference_method: e.target.value })}
                  />
                </Field>
                <Field label="Operator notes">
                  <TextInput
                    value={activeProfile.notes}
                    onChange={(e) => setProfileDraft({ ...activeProfile, notes: e.target.value })}
                    placeholder="Conditions, reference source, initials…"
                  />
                </Field>
              </div>
              <FrameFooter className="justify-between">
                {suggestion !== null ? (
                  <Button
                    size="sm"
                    onClick={() => setProfileDraft({ ...activeProfile, baseline_value: Math.round(suggestion) })}
                    title="Copy the current live mean into the baseline"
                  >
                    Use live
                  </Button>
                ) : (
                  <span />
                )}
                <Button size="sm" variant="primary" icon={<Save size={10} />} disabled={!profileDraft} onClick={() => void saveProfileDraft()}>
                  Save profile
                </Button>
              </FrameFooter>
            </>
          )}
        </Frame>

        <Frame className="min-h-0">
          <FrameHeader title="Calibration history" subtitle={`${probeLabel(probeType)} profiles`} icon={<Ruler size={12} />} />
          <FrameBody noPad>
            {history.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] text-ink-dim">No profiles recorded for this probe yet.</div>
            ) : (
              <ul className="divide-y divide-line-soft">
                {history.map((h) => (
                  <li
                    key={h.profile_id}
                    className={cn('px-2.5 py-1.5', h.profile_id === activeProfile?.profile_id && 'bg-white/[0.06]/50')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10.5px] text-ink">{h.label}</span>
                      <span className="tabular shrink-0 text-[9.5px] text-ink-dim">
                        {formatNumber(h.baseline_value)} · g{h.gain_setting}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[9px] text-ink-dim">
                      <span className="truncate font-mono">{h.profile_id}</span>
                      <span className="shrink-0">{formatDateTime(h.calibration_date)}</span>
                    </div>
                    <div className="truncate text-[9px] text-ink-dim">{h.reference_method}</div>
                  </li>
                ))}
              </ul>
            )}
          </FrameBody>
        </Frame>
      </div>
    </div>
  )
}
