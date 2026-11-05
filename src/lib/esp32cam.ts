/**
 * ESP32-CAM link (PRD §9.4).
 *
 * The ESP32-CAM is the machine-vision source: it captures the board, ships the
 * picture, and reports the detector reading that was live at that moment. This
 * module talks to the real module over the network — there is no simulated
 * stream. Two transports are supported because that is what the module can
 * serve:
 *
 *  - `websocket`  — `ws(s)://<host>/stream`. The sketch sends a JSON meta line
 *                   (`#CAM {...}`) followed by a binary JPEG for every frame.
 *                   Lowest latency, keeps meta and picture in lock-step.
 *  - `mjpeg`      — `http://<host>:81/stream`, the stock CameraWebServer
 *                   multipart stream. Picture only; meta falls back to the
 *                   serial link.
 *
 * Everything reported to the UI (resolution, fps, bytes, staleness) is measured
 * from the frames that actually arrived.
 */

import type { Esp32LinkState } from './types'

export type Esp32Mode = 'websocket' | 'mjpeg'

export interface Esp32Config {
  /** Host or IP of the module, e.g. `192.168.4.1` or `emi-cam.local`. */
  host: string
  /** WebSocket port (ignored in mjpeg mode, which uses the stream path). */
  port: number
  mode: Esp32Mode
  /** Path for the chosen transport. */
  path: string
  /** Frames per second the sketch is asked to serve (meta only). */
  targetFps: number
  /** Resolution the sketch is asked to serve (meta only). */
  resolution: string
  /** A stream that delivers nothing for this long is reported STALLED. */
  stall_after_ms: number
}

export const ESP32_DEFAULT: Esp32Config = {
  host: '192.168.4.1',
  port: 81,
  mode: 'websocket',
  path: '/stream',
  targetFps: 12,
  resolution: 'VGA',
  stall_after_ms: 3000,
}

export interface Esp32Handlers {
  /** A decoded frame, with the module's meta line merged in. */
  onFrame: (frame: { dataUrl: string; width: number; height: number; bytes: number; seq: number | null; meta: Record<string, string | number | boolean> }) => void
  onState: (state: Esp32LinkState, detail: { message?: string; fps?: number; resolution?: string }) => void
  onLog: (text: string, direction: 'IN' | 'SYS' | 'ERR') => void
}

/** Builds the URL actually dialled, so the operator can see and copy it. */
export function esp32Url(config: Esp32Config): string {
  const host = config.host.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  const path = config.path.startsWith('/') ? config.path : `/${config.path}`
  if (config.mode === 'mjpeg') return `http://${host}:${config.port}${path}`
  return `ws://${host}:${config.port}${path}`
}

/** Validates operator input before a socket is opened. */
export function validateEsp32Config(config: Esp32Config): string | null {
  if (!config.host.trim()) return 'Enter the module host or IP address.'
  if (/[\s/]/.test(config.host.trim())) return 'Host must be a hostname or IP without spaces or paths.'
  if (!Number.isFinite(config.port) || config.port < 1 || config.port > 65535) return 'Port must be between 1 and 65535.'
  if (!config.path.trim()) return 'Enter the stream path the sketch serves.'
  return null
}

/** Sniffs a JPEG inside a buffer (SOI … EOI) so both transports share the decoder. */
export function findJpeg(buffer: Uint8Array, from = 0): { start: number; end: number } | null {
  let start = -1
  for (let i = from; i < buffer.length - 1; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8) {
      start = i
      break
    }
  }
  if (start === -1) return null
  for (let i = start + 2; i < buffer.length - 1; i++) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd9) return { start, end: i + 2 }
  }
  return null
}

export function bytesToDataUrl(bytes: Uint8Array, mime = 'image/jpeg'): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

/** Decodes a JPEG's intrinsic size from its SOF marker — no Image() round-trip. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2
  while (i < bytes.length - 9) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    // SOF0..SOF15 except DHT/JPG/DAC carry the frame dimensions.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      return { width, height }
    }
    if (length <= 0) return null
    i += 2 + length
  }
  return null
}

/**
 * Parses the `#CAM {...}` meta line the sketch emits ahead of each JPEG. Unknown
 * keys are kept — the dashboard shows what the module actually reported.
 */
export function parseCamMeta(text: string): { meta: Record<string, string | number | boolean>; seq: number | null } | null {
  const trimmed = text.trim()
  const at = trimmed.indexOf('{')
  if (at === -1) return null
  try {
    const parsed = JSON.parse(trimmed.slice(at)) as Record<string, unknown>
    const meta: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') meta[key] = value
    }
    const seq = typeof parsed.seq === 'number' ? parsed.seq : null
    return { meta, seq }
  } catch {
    return null
  }
}

/** Rolling delivery rate, measured rather than assumed. */
export class FrameRateMeter {
  private stamps: number[] = []
  /** Seconds of history used for the estimate. */
  private windowSeconds: number

  constructor(windowSeconds = 3) {
    this.windowSeconds = windowSeconds
  }

  mark(at = Date.now()): void {
    this.stamps.push(at)
    const cutoff = at - this.windowSeconds * 1000
    while (this.stamps.length > 0 && this.stamps[0] < cutoff) this.stamps.shift()
  }

  get fps(): number {
    if (this.stamps.length < 2) return 0
    const span = (this.stamps[this.stamps.length - 1] - this.stamps[0]) / 1000
    if (span <= 0) return this.stamps.length - 1
    return (this.stamps.length - 1) / span
  }

  get count(): number {
    return this.stamps.length
  }
}

/* ------------------------------------------------------------------ *
 * WebSocket transport: meta line + binary JPEG per frame
 * ------------------------------------------------------------------ */

export class Esp32WebSocketClient {
  private socket: WebSocket | null = null
  private meter = new FrameRateMeter(3)
  private busy = false
  private config: Esp32Config
  private handlers: Esp32Handlers
  /** Buffers bursts so the viewfinder runs at a constant cadence. */
  private clock: SteadyFrameClock

  constructor(config: Esp32Config, handlers: Esp32Handlers) {
    this.config = config
    this.handlers = handlers
    this.clock = new SteadyFrameClock((jpeg) => this.emit(jpeg))
    this.clock.setRate(config.targetFps)
  }

  connect(): void {
    const url = esp32Url(this.config)
    this.handlers.onState('CONNECTING', { message: `Opening ${url}` })
    this.handlers.onLog(`Opening ${url}`, 'SYS')
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'The module URL could not be opened.')
      return
    }
    socket.binaryType = 'arraybuffer'
    this.socket = socket

    socket.onopen = () => {
      // A socket being open is not the same as frames arriving: stay CONNECTING
      // until the first decoded frame, so the badge never claims more than it has.
      this.handlers.onState('CONNECTING', { message: 'Socket open — waiting for the first frame' })
      this.handlers.onLog(`Socket open to ${url}`, 'IN')
      // Ask the sketch for the acquisition it advertises.
      try {
        socket.send(JSON.stringify({ cmd: 'config', fps: this.config.targetFps, resolution: this.config.resolution }))
      } catch {
        /* an older sketch simply ignores the request */
      }
    }

    socket.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        const meta = parseCamMeta(event.data)
        if (meta) {
          this.pendingMeta = meta
          const fps = Number(meta.meta.fps)
          if (Number.isFinite(fps) && fps > 0) this.clock.setRate(fps)
        }
        return
      }
      this.busy = true
      try {
        let bytes: Uint8Array
        if (event.data instanceof ArrayBuffer) bytes = new Uint8Array(event.data)
        else if (event.data instanceof Blob) bytes = new Uint8Array(await event.data.arrayBuffer())
        else return
        const jpeg = findJpeg(bytes)
        if (!jpeg) return
        const slice = bytes.subarray(jpeg.start, jpeg.end)
        // Copy out of the socket buffer: the clock holds it past this callback.
        this.clock.push(new Uint8Array(slice))
      } finally {
        this.busy = false
      }
    }

    socket.onerror = () => {
      this.fail(`Could not reach ${url}. Check the module is powered, on the same network, and the host/port are right.`)
    }

    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      this.handlers.onState('IDLE', { message: event.reason || 'socket closed' })
      this.handlers.onLog(`Socket closed${event.reason ? `: ${event.reason}` : ''}`, 'SYS')
    }
  }

  private pendingMeta: { meta: Record<string, string | number | boolean>; seq: number | null } | null = null

  private emit(jpeg: Uint8Array): void {
    const size = jpegSize(jpeg)
    const meta = this.pendingMeta
    this.pendingMeta = null
    this.meter.mark()
    this.handlers.onFrame({
      dataUrl: bytesToDataUrl(jpeg),
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      bytes: jpeg.length,
      seq: meta?.seq ?? (meta?.meta?.seq as number | undefined) ?? null,
      meta: meta?.meta ?? {},
    })
    this.handlers.onState('STREAMING', { fps: this.meter.fps })
  }

  private fail(message: string): void {
    this.handlers.onState('ERROR', { message })
    this.handlers.onLog(message, 'ERR')
    this.close()
  }

  get fps(): number {
    return this.meter.fps
  }

  /** Frames the burst buffer had to discard to stay in real time. */
  get dropped(): number {
    return this.clock.droppedFrames
  }

  get backlog(): number {
    return this.clock.pending
  }

  get inFlight(): boolean {
    return this.busy
  }

  close(): void {
    this.clock.stop()
    const socket = this.socket
    this.socket = null
    try {
      socket?.close()
    } catch {
      /* already closed */
    }
  }
}

/**
 * Plays frames back in order at the rate they were captured.
 *
 * The module's own stream is bursty — the Wi-Fi stack delivers two or three
 * JPEGs at once after a stall, which makes the viewfinder jitter. Buffering the
 * frames and releasing them on a fixed cadence (measured from the module's meta
 * line, defaulting to the configured target) gives a steady picture without
 * inventing a single frame: every JPEG shown arrived from the ESP32-CAM.
 */
export class SteadyFrameClock {
  private queue: Uint8Array[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private intervalMs = 83
  private maxQueue = 6
  private onFrame: (jpeg: Uint8Array) => void
  private dropped = 0

  constructor(onFrame: (jpeg: Uint8Array) => void) {
    this.onFrame = onFrame
  }

  setRate(fps: number): void {
    if (!Number.isFinite(fps) || fps <= 0) return
    this.intervalMs = Math.min(1000, Math.max(20, Math.round(1000 / fps)))
  }

  push(jpeg: Uint8Array): void {
    this.queue.push(jpeg)
    // Backlog is a lag problem, not a data problem: drop the oldest, count it.
    while (this.queue.length > this.maxQueue) {
      this.queue.shift()
      this.dropped += 1
    }
    if (this.timer === null) {
      this.timer = setInterval(() => {
        const next = this.queue.shift()
        if (next) this.onFrame(next)
      }, this.intervalMs)
    }
  }

  get pending(): number {
    return this.queue.length
  }

  get droppedFrames(): number {
    return this.dropped
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.queue = []
  }
}

/* ------------------------------------------------------------------ *
 * MJPEG transport: stock CameraWebServer multipart stream
 * ------------------------------------------------------------------ */

/**
 * Reads a `multipart/x-mixed-replace` stream and hands back each JPEG. Works with
 * the ESP32 CameraWebServer example without changing its firmware.
 */
export async function consumeMjpeg(
  url: string,
  onFrame: (jpeg: Uint8Array) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error(`Module answered HTTP ${response.status} for ${url}`)
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('multipart') && !type.includes('image/jpeg')) {
    throw new Error(`Unexpected content-type "${type || 'unknown'}" — is this the /stream endpoint?`)
  }
  if (!response.body) throw new Error('The module returned no stream body.')

  const reader = response.body.getReader()
  let buffer = new Uint8Array(0)
  while (!signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    const merged = new Uint8Array(buffer.length + value.length)
    merged.set(buffer, 0)
    merged.set(value, buffer.length)
    buffer = merged
    // Drain every complete JPEG currently in the buffer.
    for (;;) {
      const jpeg = findJpeg(buffer)
      if (!jpeg) {
        // Keep the tail bounded: a stream that never yields a JPEG is junk.
        if (buffer.length > 2_000_000) buffer = buffer.subarray(buffer.length - 64)
        break
      }
      onFrame(buffer.subarray(jpeg.start, jpeg.end))
      buffer = buffer.subarray(jpeg.end)
    }
  }
}

/* ------------------------------------------------------------------ *
 * Stall watchdog
 * ------------------------------------------------------------------ */

/**
 * Reports a link as STALLED when frames stop arriving. The module keeps the
 * socket open while its Wi-Fi stack hiccups, so "connected" alone is not
 * evidence that anything is being delivered.
 */
export class StallWatchdog {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastAt = 0
  private thresholdMs: number
  private onStall: (silentMs: number) => void
  private stalled = false

  constructor(thresholdMs: number, onStall: (silentMs: number) => void) {
    this.thresholdMs = thresholdMs
    this.onStall = onStall
  }

  start(): void {
    this.lastAt = Date.now()
    this.stalled = false
    if (this.timer !== null) clearInterval(this.timer)
    const tick = Math.max(250, Math.round(this.thresholdMs / 2))
    this.timer = setInterval(() => {
      const silent = Date.now() - this.lastAt
      if (!this.stalled && silent > this.thresholdMs) {
        this.stalled = true
        this.onStall(silent)
      }
    }, tick)
  }

  /** Call on every delivered frame; also clears a previous stall. */
  beat(): void {
    this.lastAt = Date.now()
    this.stalled = false
  }

  get isStalled(): boolean {
    return this.stalled
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }
}
