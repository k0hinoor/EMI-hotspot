import { create } from 'zustand'
import {
  createTransport,
  DesktopSerialTransport,
  WebSerialTransport,
  type SerialPortInfo,
  type Transport,
} from '../lib/serial'
import {
  evaluateStability,
  makeSample,
  parseFrame,
  ProtocolError,
  validateDataFrame,
  type AcquisitionLike,
  type DataFrame,
} from '../lib/protocol'
import { defaultProbes, defaultSettings } from '../lib/defaults'
import {
  buildDemoScan,
  DEMO_CAMERA_DEVICE,
  DEMO_DEVICE_ID,
  demoFieldAt,
  DEMO_HELLO,
  demoTick,
  EARTH_FIELD,
  H_FIELD,
  type DemoStreamState,
} from '../lib/demo'
import {
  captureCanvasFrame,
  captureFrame as captureFrameFromVideo,
  captureImageFrame,
  describeCameraError,
  describeTrack,
  listCameras,
  openCamera,
  stopStream,
  type CameraDevice,
  type CameraStatus,
  type TrackInfo,
} from '../lib/camera'
import {
  ESP32_DEFAULT,
  Esp32WebSocketClient,
  FrameRateMeter,
  StallWatchdog,
  bytesToDataUrl,
  consumeMjpeg,
  esp32Url,
  jpegSize,
  validateEsp32Config,
  type Esp32Config,
} from '../lib/esp32cam'
import { storage } from '../lib/storage'
import { uid } from '../lib/derive'
import type {
  AppSettings,
  Esp32Frame,
  Esp32LinkState,
  FrameCapture,
  CalibrationProfile,
  DeviceRecord,
  DeviceState,
  LogEntry,
  Measurement,
  Probe,
  ProbeType,
  QualityStatus,
  Report,
  Sample,
  Scan,
  SessionInfo,
  SignalState,
} from '../lib/types'

const GRAPH_CAPACITY = 900
const MAX_LOG_LINES = 250

export const STORAGE_KEYS = {
  settings: 'emi.settings.v1',
  probes: 'emi.probes.v1',
  profiles: 'emi.calibrations.v1',
  scans: 'emi.scans.v1',
  measurements: 'emi.measurements.v1',
  reports: 'emi.reports.v1',
  sessions: 'emi.device-sessions.v1',
  esp32: 'emi.esp32.v1',
} as const

export interface Toast {
  id: string
  tone: 'ok' | 'warn' | 'error' | 'info'
  title: string
  detail?: string
}

export interface MeasurementStats {
  last: number | null
  window: {
    count: number
    min: number | null
    max: number | null
    mean: number | null
    spreadPct: number | null
  }
  baseline: number | null
  baselineSamples: number
}

interface AppState {
  /* ---------- persistence ---------- */
  hydrated: boolean
  storageOk: boolean

  /* ---------- device link ---------- */
  deviceState: DeviceState
  deviceError: string | null
  transportKind: 'WEB_SERIAL' | 'SERIAL_BRIDGE' | null
  webSerialSupported: boolean
  bridgeSupported: boolean
  ports: SerialPortInfo[]
  portsLoading: boolean
  selectedPortId: string | null
  session: SessionInfo
  devices: DeviceRecord[]

  /* ---------- acquisition ---------- */
  samples: Sample[]
  /** Raw values in the current averaging window (newest last). */
  windowValues: number[]
  signalState: SignalState
  signalNote: string | null
  lastFrameAt: string | null
  samplesReceived: number
  framesRejected: number
  acquiring: boolean
  deviceProbe: ProbeType | null
  graphPaused: boolean
  log: LogEntry[]

  /* ---------- catalogues ---------- */
  probes: Probe[]
  profiles: CalibrationProfile[]
  activeProbeType: ProbeType
  settings: AppSettings

  /* ---------- scans & records ---------- */
  scans: Scan[]
  measurements: Measurement[]
  reports: Report[]

  /* ---------- ui ---------- */
  toasts: Toast[]
  selectedCell: { col: number; row: number } | null
  activeScanId: string | null

  /* ---------- ESP32-CAM link (the machine-vision source) ---------- */
  esp32Config: Esp32Config
  esp32Link: Esp32LinkState
  esp32Error: string | null
  /** The last frame the module delivered, already decoded. */
  esp32Frame: Esp32Frame | null
  /** Frame history for the rate/jitter panels — memory only. */
  esp32History: { at: string; bytes: number; fps: number; signal_raw: number | null }[]
  esp32Frames: number
  esp32Dropped: number
  /** Camera settings the module reported in its meta line. */
  esp32Meta: Record<string, string | number | boolean>

  /* ---------- machine vision (camera) ---------- */
  cameraStatus: CameraStatus
  cameraError: string | null
  cameraDevices: CameraDevice[]
  cameraDeviceId: string | null
  /** True when the live stream comes from the synthetic demo canvas. */
  cameraIsDemo: boolean
  cameraStream: MediaStream | null
  cameraInfo: TrackInfo
  cameraFps: number
  /** Grabbed stills for the current session (memory only). */
  cameraCaptures: FrameCapture[]
  cameraOverlay: 'SURFACE' | 'OFF'
  cameraCrop: 'BOARD' | 'FULL'
  cameraNotice: string | null

  /* ---------- demo mode (PRD §12.7) ---------- */
  demoMode: boolean
  demoStreaming: boolean
  enterDemoMode: () => Promise<void>
  exitDemoMode: () => Promise<void>
  toggleDemoStream: () => void

  /* ---------- ESP32-CAM actions ---------- */
  updateEsp32Config: (patch: Partial<Esp32Config>) => void
  connectEsp32: () => Promise<void>
  disconnectEsp32: () => void
  /** 'DEMO' draws the synthetic board through the same frame pipeline. */
  esp32IngestDemoFrame: (jpeg: Uint8Array, meta: Record<string, string | number | boolean>) => void

  /* ---------- camera actions ---------- */
  refreshCameras: () => Promise<void>
  startCamera: (deviceId?: string | null) => Promise<void>
  /** Attaches an already-open stream (camera or the demo canvas feed). */
  attachCameraStream: (stream: MediaStream, source: 'CAMERA' | 'DEMO') => void
  stopCamera: () => void
  selectCamera: (deviceId: string | null) => void
  captureFrameNow: (source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement) => FrameCapture | null
  captureEsp32FrameNow: () => FrameCapture | null
  deleteCapture: (id: string) => void
  clearCaptures: () => void
  setCameraOverlay: (mode: 'SURFACE' | 'OFF') => void
  setCameraCrop: (mode: 'BOARD' | 'FULL') => void
  setCameraFps: (fps: number) => void
  setCameraNotice: (notice: string | null) => void

  /* ---------- actions ---------- */
  hydrate: () => Promise<void>
  refreshPorts: () => Promise<void>
  selectPort: (id: string) => void
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  clearDeviceError: () => void
  sendCommand: (text: string) => Promise<void>
  startAcquisition: () => void
  pauseAcquisition: () => void
  stopAcquisition: () => void
  resetSession: () => void
  setGraphPaused: (paused: boolean) => void
  setActiveProbeType: (type: ProbeType) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  updateAcquisition: (patch: Partial<AppSettings['acquisition']>) => void
  saveSettings: () => Promise<void>
  createScan: (input: Omit<Scan, 'scan_id' | 'started_at' | 'completed_at' | 'status'>) => Promise<Scan | null>
  setScanStatus: (scanId: string, status: Scan['status']) => Promise<void>
  setActiveScan: (scanId: string | null) => void
  selectCell: (cell: { col: number; row: number } | null) => void
  captureMeasurement: (input: {
    scanId: string | null
    x_mm: number | null
    y_mm: number | null
  }) => Promise<Measurement | null>
  deleteMeasurements: (ids: string[]) => Promise<void>
  markInvalid: (id: string) => Promise<void>
  clearScanMeasurements: (scanId: string) => Promise<void>
  deleteScan: (scanId: string) => Promise<void>
  saveProbe: (probe: Probe) => Promise<void>
  saveProfile: (profile: CalibrationProfile) => Promise<void>
  recordReport: (report: Report) => Promise<void>
  notify: (tone: Toast['tone'], title: string, detail?: string) => void
  dismissToast: (id: string) => void
  stats: (windowSeconds?: number) => MeasurementStats
}

let transport: Transport | null = null
/** The open camera stream, kept outside the store so a re-render never clones it. */
let cameraStreamHandle: MediaStream | null = null
/** Live ESP32-CAM client (WebSocket) and MJPEG abort handle. */
let esp32Client: Esp32WebSocketClient | null = null
let esp32Abort: AbortController | null = null
let esp32Meter = new FrameRateMeter(3)
let esp32Watchdog: StallWatchdog | null = null
let demoTimer: number | null = null
let demoState: DemoStreamState = { seq: 1, phase: 0 }
let staleTimer: number | null = null
let persistTimer: number | null = null

const emptySession: SessionInfo = {
  device_id: null,
  firmware_version: null,
  protocol_version: null,
  transport: null,
  last_message_at: null,
  connected_at: null,
}

/**
 * Emits synthetic frames through the very same parse → validate → store path the
 * serial link uses, so Demo Mode exercises production code rather than bypassing
 * it. Every frame is still flagged demo by the scan it belongs to.
 */
function startDemoStream() {
  if (typeof window === 'undefined') return
  stopDemoStream()
  demoState = { seq: 1, phase: 0 }
  const feed = (line: string) => {
    const handler = demoLineHandler
    if (handler) handler(line)
  }
  feed(DEMO_HELLO)
  demoTimer = window.setInterval(() => {
    const state = useApp.getState()
    if (!state.demoMode || !state.demoStreaming) return
    const { line, next } = demoTick(EARTH_FIELD, demoState)
    demoState = next
    feed(line)
  }, 420)
}

/** Releases the open camera stream (camera LEDs go out). */
function stopCameraHandle() {
  if (!cameraStreamHandle) return
  stopStream(cameraStreamHandle)
  cameraStreamHandle = null
}

function stopDemoStream() {
  if (demoTimer !== null && typeof window !== 'undefined') window.clearInterval(demoTimer)
  demoTimer = null
}

let demoLineHandler: ((line: string) => void) | null = null

function pushLog(log: LogEntry[], entry: Omit<LogEntry, 'id' | 'at'>): LogEntry[] {
  const next = [{ ...entry, id: uid('log'), at: new Date().toISOString() }, ...log]
  return next.slice(0, MAX_LOG_LINES)
}

export const useApp = create<AppState>()((set, get) => {
  /** Debounced write-through so a burst of samples does not thrash IndexedDB. */
  function persistSoon() {
    if (persistTimer !== null) window.clearTimeout(persistTimer)
    persistTimer = window.setTimeout(() => {
      persistTimer = null
      const { measurements, scans, reports, probes, profiles, settings, devices } = get()
      void Promise.all([
        storage.set(STORAGE_KEYS.measurements, measurements),
        storage.set(STORAGE_KEYS.scans, scans),
        storage.set(STORAGE_KEYS.reports, reports),
        storage.set(STORAGE_KEYS.probes, probes),
        storage.set(STORAGE_KEYS.profiles, profiles),
        storage.set(STORAGE_KEYS.settings, settings),
        storage.set(STORAGE_KEYS.sessions, devices),
      ]).catch(() => {
        set((s) => ({
          storageOk: false,
          log: pushLog(s.log, { direction: 'ERR', text: 'Local database write failed.' }),
        }))
      })
    }, 350)
  }

  function armStaleTimer() {
    if (staleTimer !== null) window.clearTimeout(staleTimer)
    const ms = get().settings.acquisition.stale_after_ms
    staleTimer = window.setTimeout(() => {
      staleTimer = null
      const state = get()
      if (state.deviceState !== 'CONNECTED' || !state.lastFrameAt) return
      if (Date.now() - new Date(state.lastFrameAt).getTime() >= ms - 50) {
        set({ signalState: 'STALE', signalNote: `No frame received for ${Math.round(ms / 1000)} s` })
      }
    }, ms)
  }

  /**
   * Records one ESP32-CAM frame: picture, size, arrival rate and the detector
   * reading that was live when it landed. Nothing here estimates anything — the
   * fields come from the module's meta line or are left null.
   */
  function ingestEsp32Frame(frame: {
    dataUrl: string
    width: number
    height: number
    bytes: number
    seq: number | null
    meta: Record<string, string | number | boolean>
  }) {
    // Every frame — module or demo — is timed here, so the delivery rate the UI
    // shows is measured from frames that actually arrived.
    esp32Meter.mark()
    const state = useApp.getState()
    const at = new Date().toISOString()
    const latest = state.samples.length ? state.samples[state.samples.length - 1] : null
    const metaSignal = Number(frame.meta.signal_raw)
    const record: Esp32Frame = {
      frame_id: uid('CAM'),
      data_url: frame.dataUrl,
      width: frame.width || Number(frame.meta.w ?? 0),
      height: frame.height || Number(frame.meta.h ?? 0),
      at,
      seq: frame.seq ?? (Number.isFinite(Number(frame.meta.seq)) ? Number(frame.meta.seq) : null),
      bytes: frame.bytes,
      fps: esp32Meter.fps,
      signal_raw: Number.isFinite(metaSignal) ? metaSignal : (latest?.signal_raw ?? null),
      meta: frame.meta,
      is_demo: state.demoMode || undefined,
    }

    esp32Watchdog?.beat()
    useApp.setState((s) => ({
      esp32Frame: record,
      esp32Meta: frame.meta,
      esp32Frames: esp32Meter.count,
      esp32Dropped: esp32Client?.dropped ?? s.esp32Dropped,
      // Only a frame from the module itself can promote the link to STREAMING;
      // demo frames never claim a live hardware link.
      esp32Link: s.demoMode || frame.meta.fw === 'demo-esp32cam' ? s.esp32Link : 'STREAMING',
      esp32Error: null,
      // Keep a short history for the rate/jitter strip (memory only).
      esp32History: [
        ...s.esp32History.slice(-119),
        { at, bytes: frame.bytes, fps: esp32Meter.fps, signal_raw: record.signal_raw },
      ],
    }))
  }

  function handleFrame(line: string) {
    const state = get()
    set({ lastFrameAt: new Date().toISOString() })
    armStaleTimer()

    let frame
    try {
      frame = parseFrame(line)
    } catch (err) {
      const message = err instanceof ProtocolError ? err.message : 'Unparseable frame'
      set((s) => ({
        framesRejected: s.framesRejected + 1,
        log: pushLog(s.log, { direction: 'ERR', text: `Rejected: ${message}`, bytes: line.length }),
      }))
      return
    }

    switch (frame.kind) {
      case 'HELLO': {
        if (frame.device_id === DEMO_DEVICE_ID) {
          set((s) => ({
            session: {
              ...s.session,
              device_id: DEMO_DEVICE_ID,
              firmware_version: frame.firmware_version,
              protocol_version: frame.protocol_version,
              transport: null,
              last_message_at: new Date().toISOString(),
            },
            deviceProbe: frame.probe_type ?? s.deviceProbe,
            settings: s.settings,
            log: pushLog(s.log, { direction: 'IN', text: 'HELLO (demo source) — synthetic frames', bytes: line.length }),
          }))
          return
        }
        set((s) => {
          const devices = [
            {
              device_id: frame.device_id,
              firmware_version: frame.firmware_version,
              protocol_version: frame.protocol_version,
              last_connected_at: new Date().toISOString(),
              device_metadata: {},
            },
            ...s.devices.filter((d) => d.device_id !== frame.device_id),
          ].slice(0, 20)
          return {
            session: {
              ...s.session,
              device_id: frame.device_id,
              firmware_version: frame.firmware_version,
              protocol_version: frame.protocol_version,
              last_message_at: new Date().toISOString(),
            },
            devices,
            deviceState: 'CONNECTED' as DeviceState,
            deviceError: null,
            deviceProbe: frame.probe_type ?? s.deviceProbe,
            settings: frame.sample_rate_hz
              ? { ...s.settings, acquisition: { ...s.settings.acquisition, sample_rate_hz: frame.sample_rate_hz } }
              : s.settings,
            log: pushLog(s.log, {
              direction: 'IN',
              text: `HELLO device=${frame.device_id} fw=${frame.firmware_version ?? 'n/a'} protocol=${frame.protocol_version ?? 'n/a'}`,
              bytes: line.length,
            }),
          }
        })
        persistSoon()
        if (frame.protocol_version !== null && frame.protocol_version !== 1) {
          get().notify(
            'warn',
            `Firmware protocol v${frame.protocol_version}`,
            'This dashboard speaks protocol v1. Check frame parsing in Settings → Link log.',
          )
        }
        return
      }
      case 'PROBE': {
        set((s) => ({
          deviceProbe: frame.probe_type,
          activeProbeType: frame.probe_type,
          log: pushLog(s.log, {
            direction: 'IN',
            text: `PROBE probe_type=${frame.probe_type}`,
            bytes: line.length,
          }),
        }))
        return
      }
      case 'INFO': {
        set((s) => ({
          settings: frame.sample_rate_hz
            ? { ...s.settings, acquisition: { ...s.settings.acquisition, sample_rate_hz: frame.sample_rate_hz } }
            : s.settings,
          log: pushLog(s.log, { direction: 'IN', text: `INFO ${line}`, bytes: line.length }),
        }))
        return
      }
      case 'ERR': {
        set((s) => ({
          log: pushLog(s.log, { direction: 'ERR', text: `${frame.code}: ${frame.message}`, bytes: line.length }),
        }))
        get().notify('error', `Device error · ${frame.code}`, frame.message)
        return
      }
      case 'PING': {
        set((s) => ({ log: pushLog(s.log, { direction: 'IN', text: 'PING', bytes: line.length }) }))
        return
      }
      case 'DATA': {
        applyDataFrame(frame, line, state.probes.length ? state : state)
        return
      }
    }
  }

  function applyDataFrame(frame: DataFrame, line: string, _stateSnapshot: AppState) {
    const state = get()
    const cfg = state.settings.acquisition
    const limits: AcquisitionLike = {
      adc_max: cfg.adc_max,
      saturated_at: cfg.saturated_at,
      unstable_spread_pct: cfg.unstable_spread_pct,
      stability_min_samples: cfg.stability_min_samples,
    }
    const probeType = frame.probe_type ?? state.deviceProbe ?? (state.activeProbeType as ProbeType)
    const { quality, note } = validateDataFrame(
      frame,
      { adcMax: cfg.adc_max, saturatedAt: cfg.saturated_at },
      probeType,
    )

    const windowValues = [...state.windowValues, frame.signal_raw].slice(-cfg.averaging_window)
    const stability = evaluateStability(windowValues, quality, {
      unstableSpreadPct: limits.unstable_spread_pct,
      stabilityMinSamples: limits.stability_min_samples,
    })
    const signalState: SignalState =
      quality === 'INVALID' ? 'INVALID' : quality === 'SATURATED' ? 'SATURATED' : stability.state

    const receivedAt = new Date().toISOString()
    const sample = makeSample(
      { ...frame, probe_type: probeType },
      quality,
      signalState,
      state.session,
      receivedAt,
    )

    const samples = state.graphPaused
      ? state.samples
      : [...state.samples, sample].slice(-GRAPH_CAPACITY)

    set({
      samples,
      windowValues,
      signalState,
      signalNote: note,
      session: { ...state.session, last_message_at: receivedAt },
      samplesReceived: state.samplesReceived + 1,
      log: pushLog(state.log, {
        direction: 'IN',
        text: `DATA raw=${frame.signal_raw}${frame.signal_filtered !== null ? ` filtered=${frame.signal_filtered}` : ''} → ${quality}`,
        bytes: line.length,
      }),
    })
  }

  function attachTransport(t: Transport) {
    transport = t
  }

  // Demo frames reuse the serial frame handler (parse → validate → classify).
  demoLineHandler = handleFrame

  // Expose for the demo builder so timestamps stream realistically.
  void demoFieldAt

  return {
    hydrated: false,
    storageOk: true,

    deviceState: 'DISCONNECTED',
    deviceError: null,
    transportKind: null,
    webSerialSupported: WebSerialTransport.supported(),
    bridgeSupported: DesktopSerialTransport.supported(),
    ports: [],
    portsLoading: false,
    selectedPortId: null,
    session: emptySession,
    devices: [],

    samples: [],
    windowValues: [],
    signalState: 'UNKNOWN',
    signalNote: null,
    lastFrameAt: null,
    samplesReceived: 0,
    framesRejected: 0,
    acquiring: false,
    deviceProbe: null,
    graphPaused: false,
    log: [],

    probes: defaultProbes,
    profiles: [],
    activeProbeType: 'E_FIELD',
    settings: defaultSettings,

    scans: [],
    measurements: [],
    reports: [],

    toasts: [],
    selectedCell: null,
    activeScanId: null,

    esp32Config: { ...ESP32_DEFAULT },
    esp32Link: 'IDLE',
    esp32Error: null,
    esp32Frame: null,
    esp32History: [],
    esp32Frames: 0,
    esp32Dropped: 0,
    esp32Meta: {},

    cameraStatus: 'IDLE',
    cameraError: null,
    cameraDevices: [],
    cameraDeviceId: null,
    cameraIsDemo: false,
    cameraStream: null,
    cameraInfo: {
      width: null,
      height: null,
      frameRate: null,
      deviceId: null,
      facingMode: null,
      synthetic: false,
    },
    cameraFps: 0,
    cameraCaptures: [],
    cameraOverlay: 'SURFACE',
    cameraCrop: 'BOARD',
    cameraNotice: null,

    demoMode: false,
    demoStreaming: false,

    async hydrate() {
      const available = await storage.isAvailable()
      const [settings, probes, profiles, scans, measurements, reports, devices, esp32] = await Promise.all([
        storage.get<AppSettings>(STORAGE_KEYS.settings),
        storage.get<Probe[]>(STORAGE_KEYS.probes),
        storage.get<CalibrationProfile[]>(STORAGE_KEYS.profiles),
        storage.get<Scan[]>(STORAGE_KEYS.scans),
        storage.get<Measurement[]>(STORAGE_KEYS.measurements),
        storage.get<Report[]>(STORAGE_KEYS.reports),
        storage.get<DeviceRecord[]>(STORAGE_KEYS.sessions),
        storage.get<Esp32Config>(STORAGE_KEYS.esp32),
      ])

      const activeScan = (scans ?? []).find((s) => s.status === 'ACTIVE' || s.status === 'PAUSED') ?? null

      set({
        hydrated: true,
        storageOk: available,
        settings: settings
          ? { ...defaultSettings, ...settings, acquisition: { ...defaultSettings.acquisition, ...settings.acquisition } }
          : defaultSettings,
        probes: probes && probes.length ? probes : defaultProbes,
        profiles: profiles ?? [],
        scans: (scans ?? []).filter((x) => !x.is_demo),
        measurements: (measurements ?? []).filter((x) => !x.is_demo),
        reports: reports ?? [],
        devices: devices ?? [],
        activeScanId: activeScan?.scan_id ?? null,
        esp32Config: esp32 ? { ...ESP32_DEFAULT, ...esp32 } : ESP32_DEFAULT,
      })

      if (!available) {
        set((s) => ({
          log: pushLog(s.log, { direction: 'ERR', text: 'Local database unavailable — records will not persist.' }),
        }))
      }
      await get().refreshPorts()
    },

    async refreshPorts() {
      const t = createTransport()
      if (!t) {
        set({ ports: [], transportKind: null })
        return
      }
      attachTransport(t)
      set({ transportKind: t.kind, portsLoading: true })
      try {
        const ports = await t.listPorts()
        set((s) => ({
          ports,
          portsLoading: false,
          selectedPortId: s.selectedPortId ?? ports[0]?.id ?? null,
        }))
      } catch (err) {
        set({
          portsLoading: false,
          deviceError: err instanceof Error ? err.message : 'Could not enumerate serial ports.',
        })
      }
    },

    selectPort(id) {
      set({ selectedPortId: id })
    },

    async connect() {
      if (get().deviceState === 'CONNECTED' || get().deviceState === 'CONNECTING') return
      const t = transport ?? createTransport()
      if (!t) {
        set({ deviceState: 'ERROR', deviceError: 'No serial transport is available in this environment.' })
        return
      }
      attachTransport(t)
      set((s) => ({
        deviceState: 'CONNECTING',
        deviceError: null,
        transportKind: t.kind,
        log: pushLog(s.log, { direction: 'SYS', text: `Opening ${t.label} at ${s.settings.baud_rate} baud` }),
      }))

      try {
        await t.connect(get().selectedPortId, get().settings.baud_rate, {
          onLine: (line) => handleFrame(line),
          onClosed: (reason) => {
            set((s) => ({
              deviceState: 'DISCONNECTED',
              acquiring: false,
              session: { ...s.session, transport: null },
              signalState: 'UNKNOWN',
              log: pushLog(s.log, { direction: 'SYS', text: `Link closed: ${reason}` }),
            }))
          },
          onError: (message) => {
            set((s) => ({
              deviceState: 'ERROR',
              deviceError: message,
              log: pushLog(s.log, { direction: 'ERR', text: message }),
            }))
          },
        })

        set((s) => ({
          deviceState: 'CONNECTED',
          session: {
            ...s.session,
            transport: t.kind,
            connected_at: new Date().toISOString(),
          },
          acquiring: true,
          log: pushLog(s.log, { direction: 'SYS', text: 'Port open — waiting for first frame.' }),
        }))
        armStaleTimer()
        // Ask the device to identify itself if the firmware supports it.
        try {
          await t.write('#IDENTIFY\n')
          set((s) => ({ log: pushLog(s.log, { direction: 'OUT', text: '#IDENTIFY' }) }))
        } catch {
          /* write support is optional; frames may stream automatically */
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed.'
        const cancelled = /no port selected|cancel/i.test(message)
        set((s) => ({
          deviceState: cancelled ? 'DISCONNECTED' : 'ERROR',
          deviceError: cancelled ? null : message,
          log: pushLog(s.log, { direction: 'ERR', text: message }),
        }))
      }
    },

    async disconnect() {
      try {
        await transport?.disconnect()
      } catch {
        /* ignore teardown errors */
      }
      if (staleTimer !== null) window.clearTimeout(staleTimer)
      staleTimer = null
      set((s) => ({
        deviceState: 'DISCONNECTED',
        acquiring: false,
        deviceError: null,
        signalState: 'UNKNOWN',
        signalNote: null,
        windowValues: [],
        session: { ...s.session, transport: null, last_message_at: null },
        log: pushLog(s.log, { direction: 'SYS', text: 'Disconnected.' }),
      }))
    },

    clearDeviceError() {
      set({ deviceError: null })
    },

    async sendCommand(text) {
      const t = transport
      const payload = text.endsWith('\n') ? text : `${text}\n`
      set((s) => ({ log: pushLog(s.log, { direction: 'OUT', text: payload.trim() }) }))
      if (!t) {
        set((s) => ({ log: pushLog(s.log, { direction: 'ERR', text: 'Not connected — command not sent.' }) }))
        return
      }
      try {
        await t.write(payload)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Write failed.'
        set((s) => ({ log: pushLog(s.log, { direction: 'ERR', text: message }) }))
        get().notify('error', 'Command not sent', message)
      }
    },

    startAcquisition() {
      set({ acquiring: true })
      void get().sendCommand('#START')
    },
    pauseAcquisition() {
      set({ acquiring: false })
      void get().sendCommand('#PAUSE')
    },
    stopAcquisition() {
      set({ acquiring: false })
      void get().sendCommand('#STOP')
    },
    resetSession() {
      set({ samples: [], windowValues: [], samplesReceived: 0, framesRejected: 0, signalState: 'UNKNOWN', signalNote: null })
    },
    setGraphPaused(paused) {
      set({ graphPaused: paused })
    },
    setActiveProbeType(type) {
      set({ activeProbeType: type })
    },

    updateSettings(patch) {
      set((s) => ({ settings: { ...s.settings, ...patch } }))
      void storage.set(STORAGE_KEYS.settings, get().settings)
    },
    updateAcquisition(patch) {
      set((s) => ({ settings: { ...s.settings, acquisition: { ...s.settings.acquisition, ...patch } } }))
      void storage.set(STORAGE_KEYS.settings, get().settings)
    },
    async saveSettings() {
      try {
        await storage.set(STORAGE_KEYS.settings, get().settings)
        get().notify('ok', 'Settings saved', 'Stored locally on this machine.')
      } catch {
        set({ storageOk: false })
        get().notify('error', 'Settings not saved', 'The local database rejected the write.')
      }
    },

    async createScan(input) {
      const scan: Scan = {
        ...input,
        scan_id: uid('SCAN'),
        started_at: new Date().toISOString(),
        completed_at: null,
        status: 'ACTIVE',
      }
      set((s) => ({ scans: [scan, ...s.scans], activeScanId: scan.scan_id, selectedCell: null }))
      persistSoon()
      get().notify('ok', `Scan ${scan.scan_id} created`, `${scan.board_width_mm} × ${scan.board_height_mm} mm · ${scan.grid_spacing_mm} mm grid`)
      return scan
    },

    async setScanStatus(scanId, status) {
      set((s) => ({
        scans: s.scans.map((scan) =>
          scan.scan_id === scanId
            ? {
                ...scan,
                status,
                completed_at: status === 'COMPLETED' ? new Date().toISOString() : null,
              }
            : scan,
        ),
      }))
      persistSoon()
    },

    setActiveScan(scanId) {
      set({ activeScanId: scanId, selectedCell: null })
    },
    selectCell(cell) {
      set({ selectedCell: cell })
    },

    async captureMeasurement({ scanId, x_mm, y_mm }) {
      const state = get()
      const last = state.samples[state.samples.length - 1]
      if (!last) {
        get().notify('warn', 'Nothing to capture', 'No frame has been received from the device yet.')
        return null
      }
      if (state.signalState === 'STALE') {
        get().notify('warn', 'Reading is stale', 'The last frame is older than the staleness limit. Not captured.')
        return null
      }
      if (last.quality === 'INVALID') {
        get().notify('error', 'Reading is invalid', 'The device flagged this reading as invalid — it was not captured.')
        return null
      }

      const cfg = state.settings.acquisition
      const scan = state.scans.find((s) => s.scan_id === scanId) ?? null
      const probeType = scan?.probe_type ?? state.deviceProbe ?? state.activeProbeType
      const probe = state.probes.find((p) => p.probe_type === probeType)
      const profile = state.profiles.find((p) => p.probe_id === probe?.probe_id) ?? null

      const windowMean =
        state.windowValues.length > 0
          ? state.windowValues.reduce((a, b) => a + b, 0) / state.windowValues.length
          : null

      const measurement: Measurement = {
        measurement_id: uid('RD'),
        scan_id: scanId,
        probe_id: probe?.probe_id ?? `probe-${probeType === 'E_FIELD' ? 'e' : 'h'}-unregistered`,
        probe_type: probeType,
        x_mm,
        y_mm,
        signal_raw: last.signal_raw,
        signal_processed: last.signal_filtered ?? (windowMean !== null ? +windowMean.toFixed(1) : null),
        unit: cfg.unit,
        timestamp: last.received_at,
        quality_status: last.quality,
        calibration_profile_id: profile?.profile_id ?? scan?.calibration_profile_id ?? null,
        acquisition_metadata: {
          probe_type: probeType,
          sample_count: last.sample_count,
          adc_max: cfg.adc_max,
          averaging_window: cfg.averaging_window,
          firmware_signal_state: last.signal_state,
          baseline_value: profile?.baseline_value ?? null,
          gain_setting: profile?.gain_setting ?? null,
          processed_source: last.signal_filtered !== null ? 'FIRMWARE' : windowMean !== null ? 'COMPUTED' : 'NONE',
          superseded_by: null,
        },
        device_id: state.session.device_id,
        is_demo: state.demoMode || undefined,
      }

      // Re-measuring a cell keeps history: the reading it replaces stays in the log,
      // is marked invalid and points at the reading that superseded it, so the
      // replacement policy is explicit (PRD §7.2).
      const supersededIds =
        scanId && x_mm !== null && y_mm !== null
          ? state.measurements
              .filter((m) => m.scan_id === scanId && inSameCell(m, x_mm, y_mm))
              .map((m) => m.measurement_id)
          : []

      set((s) => ({
        measurements: [
          measurement,
          ...s.measurements.map((m) =>
            supersededIds.includes(m.measurement_id)
              ? {
                  ...m,
                  quality_status: 'INVALID' as QualityStatus,
                  acquisition_metadata: { ...m.acquisition_metadata, superseded_by: measurement.measurement_id },
                }
              : m,
          ),
        ],
      }))
      persistSoon()
      return measurement
    },

    async deleteMeasurements(ids) {
      const set_ = new Set(ids)
      set((s) => ({ measurements: s.measurements.filter((m) => !set_.has(m.measurement_id)) }))
      persistSoon()
    },

    async markInvalid(id) {
      set((s) => ({
        measurements: s.measurements.map((m) =>
          m.measurement_id === id ? { ...m, quality_status: 'INVALID' as QualityStatus } : m,
        ),
      }))
      persistSoon()
    },

    async clearScanMeasurements(scanId) {
      set((s) => ({ measurements: s.measurements.filter((m) => m.scan_id !== scanId) }))
      persistSoon()
    },

    async deleteScan(scanId) {
      set((s) => ({
        scans: s.scans.filter((scan) => scan.scan_id !== scanId),
        measurements: s.measurements.filter((m) => m.scan_id !== scanId),
        activeScanId: s.activeScanId === scanId ? null : s.activeScanId,
      }))
      persistSoon()
    },

    async saveProbe(probe) {
      set((s) => ({
        probes: s.probes.some((p) => p.probe_id === probe.probe_id)
          ? s.probes.map((p) => (p.probe_id === probe.probe_id ? probe : p))
          : [...s.probes, probe],
      }))
      persistSoon()
    },

    async saveProfile(profile) {
      set((s) => ({
        profiles: s.profiles.some((p) => p.profile_id === profile.profile_id)
          ? s.profiles.map((p) => (p.profile_id === profile.profile_id ? profile : p))
          : [profile, ...s.profiles],
      }))
      persistSoon()
    },

    async recordReport(report) {
      set((s) => ({ reports: [report, ...s.reports].slice(0, 60) }))
      persistSoon()
    },

    /**
     * Demo Mode: builds clearly-labelled synthetic scans so the interface can be
     * inspected without hardware. Records carry `is_demo` and the DEMO flag is
     * surfaced in the header, the scan picker and every export.
     */
    async enterDemoMode() {
      const cfg = get().settings.acquisition
      const probes = get().probes
      const eProbe = probes.find((p) => p.probe_type === 'E_FIELD')
      const hProbe = probes.find((p) => p.probe_type === 'H_FIELD')
      const created = [
        buildDemoScan(EARTH_FIELD, eProbe ?? { probe_id: 'probe-e01', probe_type: 'E_FIELD', label: 'E' }, 0, {
          adcMax: cfg.adc_max,
          saturatedAt: cfg.saturated_at,
          unit: cfg.unit,
        }),
        buildDemoScan(H_FIELD, hProbe ?? { probe_id: 'probe-h01', probe_type: 'H_FIELD', label: 'H' }, 1, {
          adcMax: cfg.adc_max,
          saturatedAt: cfg.saturated_at,
          unit: cfg.unit,
        }),
      ]

      const demoScans = created.map((c) => ({ ...c.scan, is_demo: true }))
      const demoMeasurements = created.flatMap((c) =>
        c.measurements.map((m) => ({ ...m, is_demo: true })),
      )

      set((s) => ({
        demoMode: true,
        demoStreaming: true,
        scans: [...demoScans, ...s.scans.filter((x) => !x.is_demo)],
        measurements: [...demoMeasurements, ...s.measurements.filter((x) => !x.is_demo)],
        activeScanId: demoScans[0].scan_id,
        activeProbeType: demoScans[0].probe_type,
        samples: [],
        windowValues: [],
        samplesReceived: 0,
        signalState: 'UNKNOWN',
        signalNote: null,
        log: pushLog(s.log, {
          direction: 'SYS',
          text: `DEMO MODE — ${demoMeasurements.length} synthetic readings loaded (device ${DEMO_DEVICE_ID}). Not hardware data.`,
        }),
      }))
      startDemoStream()
      // A real camera stream is hardware: release it so the demo feed is the only
      // thing on screen and no live picture is mistaken for demo content.
      if (get().cameraStatus === 'LIVE' && !get().cameraIsDemo) get().stopCamera()
      set({ cameraNotice: 'Demo Mode — camera feed is synthetic.' })
      get().notify('warn', 'Demo Mode enabled', 'Values are synthetic. Nothing here came from the detector.')
    },

    async exitDemoMode() {
      stopDemoStream()
      if (get().cameraIsDemo) get().stopCamera()
      set((s) => ({
        demoMode: false,
        demoStreaming: false,
        cameraCaptures: s.cameraCaptures.filter((c) => !c.is_demo),
        cameraNotice: null,
        esp32Frame: s.esp32Frame?.is_demo ? null : s.esp32Frame,
        esp32History: s.esp32History.filter(() => false),
        esp32Meta: s.esp32Frame?.is_demo ? {} : s.esp32Meta,
        esp32Frames: s.esp32Frame?.is_demo ? 0 : s.esp32Frames,
        scans: s.scans.filter((x) => !x.is_demo),
        measurements: s.measurements.filter((x) => !x.is_demo),
        activeScanId: s.scans.find((x) => !x.is_demo)?.scan_id ?? null,
        samples: [],
        windowValues: [],
        signalState: 'UNKNOWN',
        signalNote: null,
        samplesReceived: 0,
        framesRejected: 0,
        deviceProbe: null,
        session: {
          device_id: null,
          firmware_version: null,
          protocol_version: null,
          transport: null,
          last_message_at: null,
          connected_at: null,
        },
        log: pushLog(s.log, { direction: 'SYS', text: 'DEMO MODE off — demo scans removed, hardware state restored.' }),
      }))
      persistSoon()
      get().notify('ok', 'Demo Mode disabled', 'Synthetic scans removed. Live values will come from the detector only.')
    },

    toggleDemoStream() {
      const next = !get().demoStreaming
      set({ demoStreaming: next })
      if (next) startDemoStream()
      else stopDemoStream()
    },

    /* ---------------------------- camera ---------------------------- */

    async refreshCameras() {
      const devices = await listCameras()
      set({ cameraDevices: devices })
      // An empty list after a successful enumeration genuinely means no camera.
      if (devices.length === 0 && get().cameraStatus === 'IDLE') {
        set({
          cameraStatus: 'NO_DEVICE',
          cameraError: 'No camera detected. Attach a camera and select “Rescan”.',
        })
      }
    },

    async startCamera(deviceId) {
      const target = deviceId ?? get().cameraDeviceId
      set({ cameraStatus: 'REQUESTING', cameraError: null, cameraNotice: null })
      try {
        const stream = await openCamera(target)
        get().attachCameraStream(stream, 'CAMERA')
        // Labels are only readable after a grant, so enumerate again.
        void get().refreshCameras()
      } catch (error) {
        const { status, message } = describeCameraError(error)
        stopCameraHandle()
        set((s) => ({
          cameraStatus: status,
          cameraError: message,
          cameraStream: null,
          cameraIsDemo: false,
          cameraFps: 0,
          cameraInfo: { ...s.cameraInfo, synthetic: false },
          log: pushLog(s.log, { direction: 'ERR', text: `Camera: ${message}` }),
        }))
      }
    },

    attachCameraStream(stream, source) {
      stopCameraHandle()
      cameraStreamHandle = stream
      const track = stream.getVideoTracks()[0]
      const settings = track?.getSettings?.() ?? {}
      set((s) => ({
        cameraStream: stream,
        cameraIsDemo: source === 'DEMO',
        cameraStatus: 'LIVE',
        cameraError: null,
        cameraDeviceId: source === 'DEMO' ? DEMO_CAMERA_DEVICE : (settings.deviceId ?? s.cameraDeviceId),
        cameraInfo: describeTrack(stream, source === 'DEMO'),
        cameraFps: 0,
        log: pushLog(s.log, {
          direction: source === 'DEMO' ? 'SYS' : 'IN',
          text:
            source === 'DEMO'
              ? 'Camera: demo feed attached (synthetic machine view — not a real camera).'
              : `Camera: stream open ${settings.width ?? '?'}×${settings.height ?? '?'} @ ${Math.round(settings.frameRate ?? 0)} fps`,
        }),
      }))
      // If the operator unplugs the camera, say so instead of freezing silently.
      track?.addEventListener?.('ended', () => {
        if (cameraStreamHandle !== stream) return
        stopCameraHandle()
        set({
          cameraStatus: 'NO_DEVICE',
          cameraError: 'The camera stream ended. The device was unplugged or released.',
          cameraStream: null,
          cameraIsDemo: false,
          cameraFps: 0,
        })
      })
    },

    stopCamera() {
      stopCameraHandle()
      set((s) => ({
        cameraStream: null,
        esp32Config: { ...ESP32_DEFAULT },
    esp32Link: 'IDLE',
    esp32Error: null,
    esp32Frame: null,
    esp32History: [],
    esp32Frames: 0,
    esp32Dropped: 0,
    esp32Meta: {},

    cameraStatus: 'IDLE',
        cameraIsDemo: false,
        cameraFps: 0,
        cameraNotice: null,
        cameraInfo: { ...s.cameraInfo, synthetic: false },
        log: pushLog(s.log, { direction: 'SYS', text: 'Camera: stream released.' }),
      }))
    },

    selectCamera(deviceId) {
      set({ cameraDeviceId: deviceId })
      void get().startCamera(deviceId)
    },

    captureFrameNow(source) {
      const frame =
        source instanceof HTMLVideoElement
          ? captureFrameFromVideo(source)
          : source instanceof HTMLImageElement
            ? captureImageFrame(source)
            : captureCanvasFrame(source)
      if (!frame) {
        get().notify('warn', 'No frame to grab', 'The camera has not delivered a picture yet.')
        return null
      }
      const state = get()
      const capture: FrameCapture = {
        capture_id: uid('CAP'),
        // Copy explicitly: the store must never alias a getter from the element.
        data_url: String(frame.dataUrl ?? ''),
        width: frame.width,
        height: frame.height,
        at: frame.at,
        source: state.cameraIsDemo ? DEMO_CAMERA_DEVICE : (state.cameraInfo.deviceId ?? 'camera'),
        is_demo: state.cameraIsDemo || undefined,
      }
      set((s) => ({
        cameraCaptures: [capture, ...s.cameraCaptures].slice(0, 12),
        log: pushLog(s.log, {
          direction: 'SYS',
          text: `Camera: frame captured ${frame.width}×${frame.height}${state.cameraIsDemo ? ' (demo feed)' : ''}`,
        }),
      }))
      return capture
    },

    /** Keeps the module frame that is on screen as a still (session only). */
    captureEsp32FrameNow() {
      const state = get()
      const frame = state.esp32Frame
      if (!frame) {
        get().notify('warn', 'No module frame', 'The ESP32-CAM has not delivered a picture yet.')
        return null
      }
      const capture: FrameCapture = {
        capture_id: uid('CAP'),
        data_url: frame.data_url,
        width: frame.width,
        height: frame.height,
        at: frame.at,
        source: state.demoMode ? DEMO_CAMERA_DEVICE : (state.esp32Config.host || 'esp32-cam'),
        is_demo: state.demoMode || undefined,
      }
      set((s) => ({
        cameraCaptures: [capture, ...s.cameraCaptures].slice(0, 12),
        log: pushLog(s.log, {
          direction: 'SYS',
          text: `ESP32-CAM: frame #${frame.seq ?? '—'} kept as a still (${frame.width}×${frame.height})`,
        }),
      }))
      return capture
    },

    deleteCapture(id) {
      set((s) => ({ cameraCaptures: s.cameraCaptures.filter((c) => c.capture_id !== id) }))
    },

    clearCaptures() {
      set({ cameraCaptures: [] })
    },

    setCameraOverlay(mode) {
      set({ cameraOverlay: mode })
    },

    setCameraCrop(mode) {
      set({ cameraCrop: mode })
    },

    setCameraFps(fps) {
      set({ cameraFps: fps })
    },

    setCameraNotice(notice) {
      set({ cameraNotice: notice })
    },

    /* -------------------------- ESP32-CAM link -------------------------- */

    updateEsp32Config(patch) {
      set((s) => ({ esp32Config: { ...s.esp32Config, ...patch } }))
      void storage.set(STORAGE_KEYS.esp32, get().esp32Config)
    },

    async connectEsp32() {
      const config = get().esp32Config
      const invalid = validateEsp32Config(config)
      if (invalid) {
        set({ esp32Link: 'ERROR', esp32Error: invalid })
        get().notify('error', 'ESP32-CAM not opened', invalid)
        return
      }
      get().disconnectEsp32()
      esp32Meter = new FrameRateMeter(3)
      esp32Abort = new AbortController()
      set((s) => ({
        esp32Link: 'CONNECTING',
        esp32Error: null,
        esp32Frames: 0,
        esp32Dropped: 0,
        esp32History: [],
        log: pushLog(s.log, { direction: 'SYS', text: `ESP32-CAM: opening ${esp32Url(config)}` }),
      }))

      // The client reports CONNECTING while the socket is dialled; STREAMING is
      // only set once a decoded frame actually arrives.
      if (config.mode === 'websocket') {
        const client = new Esp32WebSocketClient(config, {
          onFrame: (frame) => ingestEsp32Frame(frame),
          onState: (state, detail) => {
            set({
              esp32Link: state,
              esp32Error: state === 'ERROR' ? (detail.message ?? 'The module could not be reached.') : null,
              esp32Frames: esp32Meter.count,
            })
            if (state === 'ERROR') {
              get().notify('error', 'ESP32-CAM unreachable', detail.message ?? 'Check the module and its address.')
            }
          },
          onLog: (text, direction) =>
            set((s) => ({ log: pushLog(s.log, { direction, text: `ESP32-CAM: ${text}` }) })),
        })
        esp32Client = client
        client.connect()
      } else {
        // MJPEG: picture only; readings keep arriving on the serial link.
        const url = esp32Url(config)
        void consumeMjpeg(
          url,
          (jpeg) => {
            const size = jpegSize(jpeg)
            esp32Meter.mark()
            ingestEsp32Frame({
              dataUrl: bytesToDataUrl(jpeg),
              width: size?.width ?? 0,
              height: size?.height ?? 0,
              bytes: jpeg.length,
              seq: null,
              meta: { source: 'mjpeg' },
            })
            set({ esp32Link: 'STREAMING', esp32Error: null, esp32Frames: esp32Meter.count })
          },
          esp32Abort.signal,
        ).catch((error: unknown) => {
          if (esp32Abort?.signal.aborted) return
          const message = error instanceof Error ? error.message : 'The stream could not be read.'
          set((s) => ({
            esp32Link: 'ERROR',
            esp32Error: message,
            log: pushLog(s.log, { direction: 'ERR', text: `ESP32-CAM: ${message}` }),
          }))
          get().notify('error', 'ESP32-CAM stream failed', message)
        })
      }

      // A link that stops delivering is reported as STALLED, not left "live".
      esp32Watchdog?.stop()
      esp32Watchdog = new StallWatchdog(config.stall_after_ms, (silentMs) => {
        set((s) => ({
          esp32Link: 'STALLED',
          log: pushLog(s.log, {
            direction: 'ERR',
            text: `ESP32-CAM: no frame for ${(silentMs / 1000).toFixed(1)} s`,
          }),
        }))
      })
      esp32Watchdog.start()
    },

    disconnectEsp32() {
      esp32Client?.close()
      esp32Client = null
      esp32Abort?.abort()
      esp32Abort = null
      esp32Watchdog?.stop()
      esp32Watchdog = null
      if (get().esp32Link !== 'IDLE') {
        set((s) => ({
          esp32Link: 'IDLE',
          esp32Error: null,
          log: pushLog(s.log, { direction: 'SYS', text: 'ESP32-CAM: link closed.' }),
        }))
      }
    },

    /**
     * Accepts one frame from the module (or the demo generator) and records it
     * with the detector reading that was live at that instant.
     */
    esp32IngestDemoFrame(jpeg, meta) {
      const size = jpegSize(jpeg)
      ingestEsp32Frame({
        dataUrl: bytesToDataUrl(jpeg),
        width: size?.width ?? Number(meta.w ?? 0),
        height: size?.height ?? Number(meta.h ?? 0),
        bytes: jpeg.length,
        seq: typeof meta.seq === 'number' ? meta.seq : null,
        meta,
      })
    },

    notify(tone, title, detail) {
      const toast: Toast = { id: uid('t'), tone, title, detail }
      set((s) => ({ toasts: [...s.toasts, toast].slice(-4) }))
      window.setTimeout(() => get().dismissToast(toast.id), tone === 'error' ? 7000 : 4500)
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    },

    stats(windowSeconds) {
      const state = get()
      const cfg = state.settings.acquisition
      const seconds = windowSeconds ?? cfg.graph_window_s
      const cutoff = Date.now() - seconds * 1000
      const inWindow = state.samples.filter((s) => new Date(s.received_at).getTime() >= cutoff)
      const values = inWindow.map((s) => s.signal_raw)
      const baselineSamples = Math.min(values.length, cfg.averaging_window)
      const baseline =
        baselineSamples > 0
          ? values.slice(0, baselineSamples).reduce((a, b) => a + b, 0) / baselineSamples
          : null
      let min: number | null = null
      let max: number | null = null
      let sum = 0
      for (const v of values) {
        if (min === null || v < min) min = v
        if (max === null || v > max) max = v
        sum += v
      }
      const mean = values.length ? sum / values.length : null
      return {
        last: state.samples.length ? state.samples[state.samples.length - 1].signal_raw : null,
        window: {
          count: values.length,
          min,
          max,
          mean,
          spreadPct: mean && mean > 0 && min !== null && max !== null ? ((max - min) / mean) * 100 : null,
        },
        baseline,
        baselineSamples,
      }
    },
  }
})

/** True when a stored measurement already occupies a cell (0.5 mm tolerance). */
function inSameCell(m: Measurement, x: number | null, y: number | null): boolean {
  // A superseded reading no longer occupies the cell.
  if (m.acquisition_metadata.superseded_by) return false
  if (m.x_mm === null || m.y_mm === null || x === null || y === null) return false
  return Math.abs(m.x_mm - x) < 0.5 && Math.abs(m.y_mm - y) < 0.5
}

/** Latest non-superseded measurement per cell for a scan. */
export function measurementsForScan(measurements: Measurement[], scanId: string): Measurement[] {
  return measurements.filter((m) => m.scan_id === scanId && !m.acquisition_metadata.superseded_by)
}

export function useConnected(): boolean {
  return useApp((s) => s.deviceState === 'CONNECTED')
}
