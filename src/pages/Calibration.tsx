import { useMemo, useState } from 'react'
import { CircleAlert, FlaskConical, Info, Plus, Ruler, Save, Waves, Zap } from 'lucide-react'
import { useApp } from '../store/app'
import {
  Badge,
  Button,
  Divider,
  Field,
  KeyValue,
  Notice,
  NumberInput,
  Panel,
  PanelHeader,
  TextInput,
  cn,
} from '../components/ui'
import { formatDateTime, formatNumber, probeLabel, uid } from '../lib/derive'
import type { CalibrationProfile, Probe, ProbeType } from '../lib/types'

export function Calibration() {
  const { probes, profiles, settings, samples, stats, saveProbe, saveProfile, notify, deviceProbe } = useApp()
  const [probeType, setProbeType] = useState<ProbeType>(deviceProbe ?? 'E_FIELD')

  const probe = probes.find((p) => p.probe_type === probeType)
  const profile = useMemo(
    () => profiles.find((p) => p.probe_id === probe?.probe_id) ?? null,
    [profiles, probe],
  )

  const [probeDraft, setProbeDraft] = useState<Probe | null>(null)
  const [profileDraft, setProfileDraft] = useState<CalibrationProfile | null>(null)

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
      notify('error', 'Profile needs a label', 'Name the baseline profile so it can be referenced by scans.')
      return
    }
    await saveProfile({ ...activeProfile, probe_id: activeProbe.probe_id, probe_type: probeType })
    await saveProbe({ ...activeProbe, profile_id: activeProfile.profile_id })
    setProfileDraft(null)
    notify('ok', 'Calibration profile saved', `${activeProfile.label} is now the active profile for ${probeLabel(probeType)}.`)
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

  const icon = probeType === 'E_FIELD' ? Zap : Waves
  const Icon = icon

  return (
    <div className="space-y-4">
      <Panel className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
            {(['E_FIELD', 'H_FIELD'] as ProbeType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setProbeType(type)
                  setProbeDraft(null)
                  setProfileDraft(null)
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-[11.5px] font-medium transition-colors',
                  probeType === type
                    ? type === 'E_FIELD'
                      ? 'bg-efield/12 text-efield shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]'
                      : 'bg-hfield/12 text-hfield shadow-[inset_0_0_0_1px_rgba(192,132,252,0.35)]'
                    : 'text-ink-dim hover:text-ink-muted',
                )}
              >
                {type === 'E_FIELD' ? <Zap size={12} /> : <Waves size={12} />}
                {probeLabel(type)}
              </button>
            ))}
          </div>
          {deviceProbe ? (
            <span className="text-[10.5px] text-ink-dim">
              Device reports <span className="text-ink-muted">{probeLabel(deviceProbe)}</span>
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" icon={<Plus size={12} />} onClick={newProfile} disabled={!activeProbe}>
              New baseline profile
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Probe profile"
            subtitle="Physical identity of the probe in use"
            icon={<Icon size={13} />}
            right={<Badge tone={probeType === 'E_FIELD' ? 'efield' : 'hfield'}>{probeLabel(probeType)}</Badge>}
          />
          {!activeProbe ? (
            <div className="px-4 py-6 text-center text-[11px] text-ink-dim">No probe registered for this field type.</div>
          ) : (
            <div className="space-y-2.5 px-4 py-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Probe ID">
                  <TextInput
                    value={activeProbe.probe_id}
                    onChange={(e) => setProbeDraft({ ...activeProbe, probe_id: e.target.value })}
                    className="font-mono text-[11.5px]"
                  />
                </Field>
                <Field label="Label">
                  <TextInput
                    value={activeProbe.label}
                    onChange={(e) => setProbeDraft({ ...activeProbe, label: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Connector">
                <TextInput
                  value={activeProbe.connector_type}
                  onChange={(e) => setProbeDraft({ ...activeProbe, connector_type: e.target.value })}
                />
              </Field>
              <Field label="Physical dimensions" hint="Used for documentation only — not a calibration input.">
                <TextInput
                  value={activeProbe.physical_dimensions}
                  onChange={(e) => setProbeDraft({ ...activeProbe, physical_dimensions: e.target.value })}
                />
              </Field>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10.5px] text-ink-dim">
                  Registered {formatDateTime(activeProbe.created_at)}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Save size={12} />}
                  disabled={!probeDraft}
                  onClick={() => void saveProbeDraft()}
                >
                  Save probe
                </Button>
              </div>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Baseline & gain"
            subtitle="Baseline correction is not absolute calibration"
            icon={<FlaskConical size={13} />}
            right={activeProfile ? <Badge tone="accent">ACTIVE</Badge> : <Badge tone="warn">NONE</Badge>}
          />
          {!activeProfile ? (
            <div className="px-4 py-6 text-center text-[11px] leading-relaxed text-ink-dim">
              No baseline profile for this probe. Create one to record a noise-floor value and reference method with
              every measurement.
            </div>
          ) : (
            <div className="space-y-2.5 px-4 py-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Profile label">
                  <TextInput
                    value={activeProfile.label}
                    onChange={(e) => setProfileDraft({ ...activeProfile, label: e.target.value })}
                  />
                </Field>
                <Field label="Profile ID">
                  <div className="flex h-9 items-center rounded-lg border border-line bg-canvas px-2.5 font-mono text-[11px] text-ink-dim">
                    {activeProfile.profile_id}
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label={`Baseline (${settings.acquisition.unit})`}
                  hint={suggestion !== null ? `Live mean now: ${formatNumber(suggestion, 1)}` : 'No live frames to average'}
                >
                  <NumberInput
                    value={activeProfile.baseline_value}
                    onChange={(e) => setProfileDraft({ ...activeProfile, baseline_value: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Gain setting" hint="Detector gain, if the hardware supports it.">
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
                  placeholder="Conditions, reference source, operator initials…"
                />
              </Field>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10.5px] text-ink-dim">
                  {activeProfile.label === profile?.label
                    ? `Recorded ${formatDateTime(activeProfile.calibration_date)}`
                    : 'Unsaved changes'}
                </span>
                <div className="flex gap-2">
                  {suggestion !== null ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setProfileDraft({ ...activeProfile, baseline_value: Math.round(suggestion) })
                      }
                    >
                      Use live baseline
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Save size={12} />}
                    disabled={!profileDraft}
                    onClick={() => void saveProfileDraft()}
                  >
                    Save profile
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader title="Calibration history" subtitle={`${probeLabel(probeType)} probe profiles`} icon={<Ruler size={13} />} />
          {history.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] text-ink-dim">No profiles recorded for this probe yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[11.5px]">
                <thead>
                  <tr className="border-b border-line-soft">
                    {['Profile', 'Baseline', 'Gain', 'Method', 'Date'].map((h) => (
                      <th key={h} className="label-caps px-3 py-2 text-left !text-[9px]">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr
                      key={h.profile_id}
                      className={cn(
                        'border-b border-line-soft/60 transition-colors hover:bg-panel-raised/50',
                        h.profile_id === activeProfile?.profile_id && 'bg-panel-raised/40',
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="text-ink">{h.label}</div>
                        <div className="font-mono text-[9.5px] text-ink-dim">{h.profile_id}</div>
                      </td>
                      <td className="tabular px-3 py-2 text-ink-muted">
                        {formatNumber(h.baseline_value)} <span className="text-[9.5px] text-ink-dim">{settings.acquisition.unit}</span>
                      </td>
                      <td className="tabular px-3 py-2 text-ink-muted">{h.gain_setting}</td>
                      <td className="max-w-[160px] truncate px-3 py-2 text-[10.5px] text-ink-dim">{h.reference_method}</td>
                      <td className="tabular px-3 py-2 text-[10.5px] text-ink-dim">{formatDateTime(h.calibration_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel className="px-3 py-3">
            <div className="label-caps mb-1.5">Live check</div>
            <div className="space-y-0.5">
              <KeyValue
                label="Current mean (10 s)"
                value={live.window.mean !== null ? `${formatNumber(live.window.mean, 1)} ${settings.acquisition.unit}` : 'no frames'}
                mono
              />
              <KeyValue
                label="Relative to baseline"
                value={
                  live.window.mean !== null && activeProfile
                    ? `${formatNumber(live.window.mean - activeProfile.baseline_value, 1)} ${settings.acquisition.unit}`
                    : '—'
                }
                mono
              />
              <KeyValue label="Frames used" value={live.window.count} mono />
              <KeyValue label="Instability" value={live.window.spreadPct !== null ? `${formatNumber(live.window.spreadPct, 1)}% pk-pk` : '—'} mono />
            </div>
            <Divider className="my-2" />
            <p className="text-[10px] leading-relaxed text-ink-dim">
              Holding the probe in open space away from the DUT gives the noise-floor reference. Record that value as
              the baseline so relative readings have context.
            </p>
          </Panel>

          <Notice tone="warn" title="Baseline ≠ absolute calibration" icon={<CircleAlert size={13} />}>
            Baseline and gain adjustments shift relative readings. Claiming field strength in V/m or A/m requires a
            reference instrument, defined geometry, characterised frequency response and a documented procedure.
          </Notice>

          <Notice tone="neutral" title="Probe selectivity must be verified" icon={<Info size={13} />}>
            The monopole and loop geometries favour E and H coupling respectively, but both respond to both fields. Do
            not treat probe type as proof of field type.
          </Notice>
        </div>
      </div>
    </div>
  )
}
