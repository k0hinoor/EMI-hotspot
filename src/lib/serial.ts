/**
 * Serial transport layer (PRD §9.1 steps 4–5).
 *
 * Two real transports, no simulated source:
 *  - Web Serial (browser, secure context, Chromium-based)
 *  - Native serial bridge (the packaged desktop shell exposes `__EMI_SERIAL__`
 *    with `listPorts()`, `connect(id, baud)`, `write(text)` and a `read` event)
 *
 * When neither is present the app reports DISCONNECTED and shows what is missing.
 */

export interface SerialPortInfo {
  id: string
  label: string
  detail?: string
}

export interface TransportHandlers {
  onLine: (line: string) => void
  onClosed: (reason: string) => void
  onError: (message: string) => void
}

export interface Transport {
  readonly kind: 'WEB_SERIAL' | 'SERIAL_BRIDGE'
  readonly label: string
  listPorts(): Promise<SerialPortInfo[]>
  /** Opens the port. `portId` is ignored by Web Serial (the chooser decides). */
  connect(portId: string | null, baudRate: number, handlers: TransportHandlers): Promise<void>
  write(text: string): Promise<void>
  disconnect(): Promise<void>
}

/* ------------------------------------------------------------------ *
 * Web Serial
 * ------------------------------------------------------------------ */

interface WebSerialPort {
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
  open(options: { baudRate: number; dataBits?: number; stopBits?: number; parity?: string; bufferSize?: number }): Promise<void>
  close(): Promise<void>
  forget?(): Promise<void>
  getInfo(): { usbVendorId?: number; usbProductId?: number }
}

interface WebSerialNavigator extends Navigator {
  serial?: {
    requestPort(options?: unknown): Promise<WebSerialPort>
    getPorts(): Promise<WebSerialPort[]>
  }
}

export class WebSerialTransport implements Transport {
  readonly kind = 'WEB_SERIAL' as const
  readonly label = 'Web Serial'
  private port: WebSerialPort | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private keepReading = false

  static supported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as WebSerialNavigator).serial
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    const serial = (navigator as WebSerialNavigator).serial
    if (!serial) return []
    const ports = await serial.getPorts()
    return ports.map((p, i) => {
      const info = p.getInfo()
      const vid = info.usbVendorId?.toString(16).padStart(4, '0') ?? '----'
      const pid = info.usbProductId?.toString(16).padStart(4, '0') ?? '----'
      return { id: `web-${i}`, label: `USB serial device ${vid}:${pid}`, detail: 'Previously authorised in this browser' }
    })
  }

  async connect(_portId: string | null, baudRate: number, handlers: TransportHandlers): Promise<void> {
    const serial = (navigator as WebSerialNavigator).serial
    if (!serial) throw new Error('This browser does not expose the Web Serial API.')
    // requestPort must run inside the user gesture that triggered connect().
    const port = await serial.requestPort({})
    await port.open({ baudRate, dataBits: 8, stopBits: 1, parity: 'none', bufferSize: 4096 })
    this.port = port
    this.keepReading = true
    void this.readLoop(handlers)
  }

  private async readLoop(handlers: TransportHandlers) {
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      while (this.keepReading && this.port?.readable) {
        this.reader = this.port.readable.getReader()
        while (this.keepReading) {
          const { value, done } = await this.reader.read()
          if (done) break
          if (!value) continue
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.replace(/\r/g, '').trim()
            if (line) handlers.onLine(line)
          }
        }
      }
      handlers.onClosed('The serial stream ended.')
    } catch (err) {
      handlers.onError(err instanceof Error ? err.message : 'Serial read failed.')
    } finally {
      try {
        this.reader?.releaseLock()
      } catch {
        /* lock already released */
      }
      this.reader = null
    }
  }

  async write(text: string): Promise<void> {
    if (!this.port?.writable) throw new Error('Serial port is not writable.')
    const writer = this.port.writable.getWriter()
    try {
      await writer.write(new TextEncoder().encode(text))
    } finally {
      writer.releaseLock()
    }
  }

  async disconnect(): Promise<void> {
    this.keepReading = false
    try {
      await this.reader?.cancel()
    } catch {
      /* stream already closed */
    }
    try {
      await this.port?.close()
    } catch {
      /* port already closed */
    }
    this.port = null
  }
}

/* ------------------------------------------------------------------ *
 * Native desktop serial bridge
 * ------------------------------------------------------------------ */

interface BridgeApi {
  listPorts(): Promise<{ path: string; manufacturer?: string; product?: string }[]>
  connect(path: string, baudRate: number): Promise<{ ok: boolean; error?: string }>
  write(text: string): Promise<{ ok: boolean; error?: string }>
  disconnect(): Promise<{ ok: boolean }>
  onLine(cb: (line: string) => void): () => void
  onClose(cb: (reason: string) => void): () => void
  onError(cb: (message: string) => void): () => void
}

function bridge(): BridgeApi | null {
  const w = window as unknown as { __EMI_SERIAL__?: BridgeApi }
  return w.__EMI_SERIAL__ ?? null
}

export class DesktopSerialTransport implements Transport {
  readonly kind = 'SERIAL_BRIDGE' as const
  readonly label = 'Desktop serial bridge'
  private unsubscribers: (() => void)[] = []

  static supported(): boolean {
    return bridge() !== null
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    const api = bridge()
    if (!api) return []
    const ports = await api.listPorts()
    return ports.map((p) => ({
      id: p.path,
      label: p.path,
      detail: [p.manufacturer, p.product].filter(Boolean).join(' · ') || undefined,
    }))
  }

  async connect(portId: string | null, baudRate: number, handlers: TransportHandlers): Promise<void> {
    const api = bridge()
    if (!api) throw new Error('The desktop serial bridge is not available.')
    if (!portId) throw new Error('Select a serial port before connecting.')
    const res = await api.connect(portId, baudRate)
    if (!res.ok) throw new Error(res.error ?? 'The desktop bridge refused the connection.')
    this.unsubscribers = [
      api.onLine(handlers.onLine),
      api.onClose(handlers.onClosed),
      api.onError(handlers.onError),
    ]
  }

  async write(text: string): Promise<void> {
    const api = bridge()
    if (!api) throw new Error('The desktop serial bridge is not available.')
    const res = await api.write(text)
    if (!res.ok) throw new Error(res.error ?? 'Write to the serial port failed.')
  }

  async disconnect(): Promise<void> {
    for (const off of this.unsubscribers) off()
    this.unsubscribers = []
    await bridge()?.disconnect()
  }
}

export function createTransport(): Transport | null {
  if (DesktopSerialTransport.supported()) return new DesktopSerialTransport()
  if (WebSerialTransport.supported()) return new WebSerialTransport()
  return null
}
