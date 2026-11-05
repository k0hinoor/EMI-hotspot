/**
 * Live camera capture (machine / PCB view).
 *
 * Everything here talks to the browser's real MediaDevices API — there is no
 * simulated video path. When no camera is granted the helpers report why, and
 * the UI renders a black viewfinder with that reason instead of a picture.
 * The demo feed is produced by `demo.ts` and pushed through `startCanvasCapture`
 * so the same capture/frame code runs either way.
 */

export type CameraStatus =
  /** Nothing requested yet. */
  | 'IDLE'
  /** Permission prompt is open / device is warming up. */
  | 'REQUESTING'
  /** Frames are arriving. */
  | 'LIVE'
  /** The user (or policy) refused camera access. */
  | 'DENIED'
  /** No camera attached to this machine. */
  | 'NO_DEVICE'
  /** Device busy / in use by another application. */
  | 'BUSY'
  /** Any other failure. */
  | 'ERROR'

export interface CameraDevice {
  deviceId: string
  /** Blank until permission has been granted once. */
  label: string
}

export interface TrackInfo {
  width: number | null
  height: number | null
  frameRate: number | null
  deviceId: string | null
  facingMode: string | null
  /** True when this is the demo canvas feed rather than a camera. */
  synthetic: boolean
}

export interface CapturedFrame {
  dataUrl: string
  width: number
  height: number
  at: string
}

export function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

export function enumerateSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.enumerateDevices === 'function'
  )
}

/** Cameras currently attached. Labels stay blank until one grant has happened. */
export async function listCameras(): Promise<CameraDevice[]> {
  if (!enumerateSupported()) return []
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }))
  } catch {
    return []
  }
}

/** Human-readable reason for a rejected `getUserMedia`. */
export function describeCameraError(error: unknown): { status: CameraStatus; message: string } {
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        status: 'DENIED',
        message:
          'Camera access was refused. Allow camera permission for this origin in the browser, then try again.',
      }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return {
        status: 'NO_DEVICE',
        message: 'No camera matched. Attach a camera (or the microscope/PCB camera) and try again.',
      }
    case 'NotReadableError':
    case 'TrackStartError':
      return {
        status: 'BUSY',
        message: 'The camera is in use by another application. Close it there and retry.',
      }
    default:
      return {
        status: 'ERROR',
        message: error instanceof Error ? error.message : 'The camera could not be started.',
      }
  }
}

/**
 * Opens a camera. `deviceId` is optional — with an empty value the browser
 * picks the default video input.
 */
export async function openCamera(deviceId?: string | null): Promise<MediaStream> {
  if (!cameraSupported()) {
    const error = new Error(
      'This browser does not expose a video capture API. Use a Chromium browser on a secure origin (https or localhost).',
    )
    error.name = 'NotSupportedError'
    throw error
  }
  const video: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
  }
  if (deviceId) video.deviceId = { exact: deviceId }
  return navigator.mediaDevices.getUserMedia({ video, audio: false })
}

/** Stops every track so the camera LED goes out and the device is released. */
export function stopStream(stream: MediaStream | null): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* already ended */
    }
  }
}

export function describeTrack(stream: MediaStream | null, synthetic = false): TrackInfo {
  const track = stream?.getVideoTracks()[0]
  if (!track) {
    return { width: null, height: null, frameRate: null, deviceId: null, facingMode: null, synthetic }
  }
  const settings = track.getSettings?.() ?? {}
  return {
    width: settings.width ?? null,
    height: settings.height ?? null,
    frameRate: settings.frameRate ?? null,
    deviceId: settings.deviceId ?? null,
    facingMode: settings.facingMode ?? null,
    synthetic,
  }
}

/**
 * Grabs the current video frame as a PNG data URL. Returns null when the
 * element has no usable frame yet — a black viewfinder is never presented as
 * if it were a capture.
 */
export function captureFrame(video: HTMLVideoElement, maxWidth = 1280): CapturedFrame | null {
  const width = video.videoWidth
  const height = video.videoHeight
  if (!width || !height) return null
  const scale = Math.min(1, maxWidth / width)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h, at: new Date().toISOString() }
}

/** Grabs a canvas (the demo feed) as a PNG data URL. */
export function captureCanvasFrame(canvas: HTMLCanvasElement, maxWidth = 1280): CapturedFrame | null {
  if (!canvas.width || !canvas.height) return null
  const scale = Math.min(1, maxWidth / canvas.width)
  const w = Math.max(1, Math.round(canvas.width * scale))
  const h = Math.max(1, Math.round(canvas.height * scale))
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(canvas, 0, 0, w, h)
  return { dataUrl: out.toDataURL('image/png'), width: w, height: h, at: new Date().toISOString() }
}

/**
 * Wraps a canvas as a MediaStream (used by the demo feed). Returns null where
 * `captureStream` is unavailable so callers can fall back to plain rendering.
 */
export function streamFromCanvas(canvas: HTMLCanvasElement, fps = 24): MediaStream | null {
  const factory = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream
  if (typeof factory !== 'function') return null
  try {
    const stream = factory.call(canvas, fps)
    return stream
  } catch {
    return null
  }
}

/** Estimated delivered frame rate, sampled from `requestVideoFrameCallback`. */
export function sampleFrameRate(
  video: HTMLVideoElement,
  onSample: (fps: number) => void,
  seconds = 2,
): () => void {
  const timed = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number) => void) => number
    cancelVideoFrameCallback?: (handle: number) => void
  }
  if (typeof timed.requestVideoFrameCallback !== 'function') return () => {}
  let frames = 0
  let started = 0
  let handle = 0
  let cancelled = false
  const tick = (now: number) => {
    if (cancelled) return
    if (!started) started = now
    frames += 1
    const elapsed = (now - started) / 1000
    if (elapsed >= seconds) {
      onSample(frames / elapsed)
      frames = 0
      started = now
    }
    handle = timed.requestVideoFrameCallback!(tick)
  }
  handle = timed.requestVideoFrameCallback(tick)
  return () => {
    cancelled = true
    timed.cancelVideoFrameCallback?.(handle)
  }
}
