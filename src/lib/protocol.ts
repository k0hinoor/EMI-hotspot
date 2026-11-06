import type { ProbeType, QualityStatus, Sample, SignalState } from './types'

/**
 * Line-oriented acquisition protocol shared with the firmware.
 *
 *   #HELLO {"device_id":"EMI-001","firmware_version":"1.0.0","protocol_version":1,"probe_type":"E_FIELD"}
 *   #PROBE {"probe_type":"H_FIELD"}
 *   #DATA  {"seq":184,"signal_raw":1842,"signal_filtered":1798,"sample_count":32,"status":"VALID"}
 *   #INFO  {"sample_rate_hz":20}
 *   #PING
 *   #ERR   {"code":"ADC_TIMEOUT","message":"ADC read timed out"}
 *
 * Either a `{"type": ...}` envelope or the `#TYPE` prefix is accepted. Every frame
 * is validated before it is allowed into the measurement pipeline — an invalid
 * frame never becomes a reading (PRD §9.3).
 */

export interface HelloFrame {
  kind: 'HELLO'
  device_id: string
  firmware_version: string | null
  protocol_version: number | null
  probe_type: ProbeType | null
  sample_rate_hz: number | null
}

export interface ProbeFrame {
  kind: 'PROBE'
  probe_type: ProbeType
}

export interface DataFrame {
  kind: 'DATA'
  seq: number | null
  signal_raw: number
  signal_filtered: number | null
  sample_count: number | null
  status: string | null
  probe_type: ProbeType | null
  timestamp: string | null
}

export interface InfoFrame {
  kind: 'INFO'
  sample_rate_hz: number | null
}

export interface PingFrame {
  kind: 'PING'
}

export interface ErrFrame {
  kind: 'ERR'
  code: string
  message: string
}

/**
 * A value lifted out of a device that speaks its own line format (a sensor
 * sketch, a vendor tool) instead of this protocol. The line that produced it is
 * kept verbatim so the operator can audit the mapping.
 */
export interface AdoptedFrame {
  kind: 'ADOPTED'
  /** Numeric value read out of the vendor line. */
  signal_raw: number
  /** Which text label the number was taken from, if any. */
  label: string | null
  /** Free-form status word found on the line, if any. */
  status: string | null
  /** The line exactly as received. */
  raw: string
}

export type Frame = HelloFrame | ProbeFrame | DataFrame | InfoFrame | PingFrame | ErrFrame | AdoptedFrame

export class ProtocolError extends Error {
  readonly raw: string
  constructor(message: string, raw: string) {
    super(message)
    this.name = 'ProtocolError'
    this.raw = raw
  }
}

export const PROTOCOL_VERSION = 1

const KNOWN_TYPES = new Set(['HELLO', 'PROBE', 'DATA', 'INFO', 'PING', 'ERR'])

export function parseProbeType(value: unknown): ProbeType | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toUpperCase().replace(/[-\s]/g, '_')
  if (v === 'E_FIELD' || v === 'EFIELD' || v === 'E') return 'E_FIELD'
  if (v === 'H_FIELD' || v === 'HFIELD' || v === 'H') return 'H_FIELD'
  return null
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return null
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

/** Extracts "#TYPE payload", "TYPE payload" or JSON with a type/kind field. */
function splitFrame(line: string): { type: string; payload: string } {
  const trimmed = line.trim()
  if (trimmed.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new ProtocolError('Malformed JSON frame', line)
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new ProtocolError('Frame is not a JSON object', line)
    }
    const obj = parsed as Record<string, unknown>
    const type = str(obj.type) ?? str(obj.kind) ?? str(obj.cmd)
    if (!type) throw new ProtocolError('JSON frame has no type field', line)
    return { type: type.toUpperCase(), payload: trimmed }
  }

  const withoutHash = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed
  const spaceAt = withoutHash.search(/[\s{]/)
  const type = (spaceAt === -1 ? withoutHash : withoutHash.slice(0, spaceAt)).toUpperCase()
  const payload = spaceAt === -1 ? '' : withoutHash.slice(spaceAt).trim()
  if (!KNOWN_TYPES.has(type)) throw new ProtocolError(`Unknown frame type "${type}"`, line)
  return { type, payload }
}

function payloadObject(payload: string, raw: string): Record<string, unknown> {
  if (!payload) return {}
  if (!payload.startsWith('{')) throw new ProtocolError('Expected a JSON payload', raw)
  try {
    const parsed = JSON.parse(payload)
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    return parsed as Record<string, unknown>
  } catch {
    throw new ProtocolError('Malformed JSON payload', raw)
  }
}

export function parseFrame(line: string): Frame {
  const raw = line.trim()
  if (!raw) throw new ProtocolError('Empty frame', line)
  const { type, payload } = splitFrame(raw)
  const obj = payloadObject(payload, raw)

  switch (type) {
    case 'HELLO': {
      const deviceId = str(obj.device_id) ?? str(obj.deviceId) ?? str(obj.id)
      if (!deviceId) throw new ProtocolError('HELLO frame is missing device_id', raw)
      return {
        kind: 'HELLO',
        device_id: deviceId,
        firmware_version: str(obj.firmware_version) ?? str(obj.firmware) ?? str(obj.fw),
        protocol_version: num(obj.protocol_version) ?? num(obj.protocol),
        probe_type: parseProbeType(obj.probe_type),
        sample_rate_hz: num(obj.sample_rate_hz) ?? num(obj.rate_hz),
      }
    }
    case 'PROBE': {
      const probeType = parseProbeType(obj.probe_type)
      if (!probeType) throw new ProtocolError('PROBE frame has an unrecognised probe_type', raw)
      return { kind: 'PROBE', probe_type: probeType }
    }
    case 'DATA': {
      const signalRaw = num(obj.signal_raw) ?? num(obj.raw) ?? num(obj.value) ?? num(obj.signal)
      if (signalRaw === null) throw new ProtocolError('DATA frame is missing a numeric signal_raw', raw)
      return {
        kind: 'DATA',
        seq: num(obj.seq),
        signal_raw: signalRaw,
        signal_filtered: num(obj.signal_filtered) ?? num(obj.filtered),
        sample_count: num(obj.sample_count) ?? num(obj.samples),
        status: str(obj.status),
        probe_type: parseProbeType(obj.probe_type),
        timestamp: str(obj.timestamp) ?? str(obj.ts),
      }
    }
    case 'INFO':
      return { kind: 'INFO', sample_rate_hz: num(obj.sample_rate_hz) ?? num(obj.rate_hz) }
    case 'PING':
      return { kind: 'PING' }
    case 'ERR':
      return {
        kind: 'ERR',
        code: str(obj.code) ?? 'DEVICE_ERROR',
        message: str(obj.message) ?? 'The device reported an error.',
      }
    default:
      throw new ProtocolError(`Unknown frame type "${type}"`, raw)
  }
}

/** Splits a chunk of serial text into complete lines, keeping any trailing partial. */
export function splitLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const combined = buffer + chunk.replace(/\r/g, '')
  const parts = combined.split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts.map((p) => p.trim()).filter(Boolean), rest }
}

/**
 * Pulls a number out of a line that is not protocol-shaped.
 *
 * Only explicit `key: value` / `key=value` pairs or labelled numbers are taken —
 * never the first bare integer in the line, which would happily match a version
 * string or a timestamp. Returns null when the line carries no usable value.
 */
export function adoptNumber(line: string): { value: number; label: string | null } | null {
  const text = line.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim()
  if (!text) return null

  // `Label: 123` / `Label = 123` / `"label":123`
  const pairs = [...text.matchAll(/([A-Za-z][A-Za-z0-9 _./%-]{1,24})\s*[:=]\s*(-?\d+(?:\.\d+)?)/g)]
  const words = pairs.filter((m) => !/^(version|ver|v|id|seq|baud|fps|rate|date|time|ts|port)$/i.test(m[1].trim()))
  if (words.length > 0) {
    const pick = words[0]
    return { value: Number(pick[2]), label: pick[1].trim() }
  }

  // `1234 ppm` / `1234 units`
  const unitNumber = /(-?\d+(?:\.\d+)?)\s*(ppm|ppb|mv|db|dbm|a|ma|v|units?|cnts?|raw)\b/i.exec(text)
  if (unitNumber) return { value: Number(unitNumber[1]), label: unitNumber[2] }

  return null
}

/** Status vocabulary a vendor line might use, mapped onto this app's verdicts. */
export function adoptStatus(line: string): string | null {
  const found = /\b(VALID|OK|GOOD|NORMAL|UNSTABLE|NOISY|WARN(?:ING)?|SATURATED|CLIPPED|OVERLOAD|INVALID|ERROR|FAULT|CRITICAL)\b/i.exec(line)
  return found ? found[1].toUpperCase() : null
}

export function classifyStatus(status: string | null): QualityStatus | null {
  if (!status) return null
  const s = status.trim().toUpperCase()
  if (s === 'VALID' || s === 'OK' || s === 'GOOD' || s === 'STABLE') return 'VALID'
  if (s === 'UNSTABLE' || s === 'NOISY') return 'UNSTABLE'
  if (s === 'SATURATED' || s === 'CLIPPED' || s === 'OVERLOAD' || s === 'OVER_RANGE') return 'SATURATED'
  if (s === 'INVALID' || s === 'ERROR' || s === 'FAULT') return 'INVALID'
  return null
}

export interface ValidationConfig {
  adcMax: number
  saturatedAt: number
}

/**
 * Validates a parsed DATA frame against acquisition settings and classifies it.
 * Saturated / out-of-range frames are never silently accepted (PRD §7.1).
 */
export function validateDataFrame(
  frame: DataFrame,
  cfg: ValidationConfig,
  firmwareProbe: ProbeType | null,
): { quality: QualityStatus; note: string | null } {
  const firmware = classifyStatus(frame.status)
  const probe = frame.probe_type ?? firmwareProbe
  const outOfRange = frame.signal_raw < 0 || frame.signal_raw > cfg.adcMax

  if (firmware === 'INVALID' || outOfRange) {
    return {
      quality: 'INVALID',
      note: outOfRange ? `raw value outside 0–${cfg.adcMax} counts` : 'device reported INVALID',
    }
  }
  if (firmware === 'SATURATED' || frame.signal_raw >= cfg.saturatedAt) {
    return { quality: 'SATURATED', note: `raw value at or above ${cfg.saturatedAt} counts` }
  }
  if (!probe) {
    // A reading that cannot be attributed to a probe cannot be attributed to a
    // measurement type either, so it stays unvalidated.
    return { quality: 'INVALID', note: 'probe type unknown — select a probe on the device' }
  }
  if (firmware === 'UNSTABLE') return { quality: 'UNSTABLE', note: 'device reported UNSTABLE' }
  return { quality: 'VALID', note: null }
}

/** Settings keys used by validation, expressed in the store's snake_case shape. */
export interface AcquisitionLike {
  adc_max: number
  saturated_at: number
  unstable_spread_pct: number
  stability_min_samples: number
}

export interface StabilityStats {
  state: SignalState
  spreadPct: number | null
}

/**
 * Derives a stability verdict from a short window of recent raw samples.
 * The window length is the configured averaging window.
 */
export function evaluateStability(
  values: number[],
  base: QualityStatus | null,
  cfg: { unstableSpreadPct: number; stabilityMinSamples: number },
): StabilityStats {
  if (base === 'INVALID') return { state: 'INVALID', spreadPct: null }
  if (base === 'SATURATED') return { state: 'SATURATED', spreadPct: null }
  if (values.length < cfg.stabilityMinSamples) return { state: 'UNKNOWN', spreadPct: null }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const spreadPct = mean > 0 ? ((max - min) / mean) * 100 : max > 0 ? 100 : 0
  if (spreadPct > cfg.unstableSpreadPct) return { state: 'UNSTABLE', spreadPct }
  return { state: 'STABLE', spreadPct }
}

export function makeSample(
  frame: DataFrame,
  quality: QualityStatus,
  state: SignalState,
  session: { device_id: string | null; firmware_version: string | null; protocol_version: number | null },
  receivedAt: string,
): Sample {
  return {
    seq: frame.seq,
    signal_raw: frame.signal_raw,
    signal_filtered: frame.signal_filtered,
    sample_count: frame.sample_count,
    probe_type: frame.probe_type,
    quality,
    signal_state: state,
    received_at: frame.timestamp ?? receivedAt,
    device_id: session.device_id,
    firmware_version: session.firmware_version,
    protocol_version: session.protocol_version,
  }
}
