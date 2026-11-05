/**
 * Scene reconstruction for the camera view (PRD §13 companion view).
 *
 * The live camera frame is the *texture*: the board rectangle inside the frame
 * is projected into a 3D plane, and the measured EMI coverage is drawn on top of
 * it as a draped surface. Nothing here invents geometry — the board size comes
 * from the active scan, the heights come from captured readings, and when the
 * camera is closed the board is drawn as a bare wireframe with no texture.
 */

import { rampColor } from './derive'

export interface SceneCamera {
  /** Rotation of the board around its normal, radians. */
  yaw: number
  /** Camera elevation above the board plane, radians (small = edge-on). */
  pitch: number
  zoom: number
}

export const DEFAULT_CAMERA: SceneCamera = { yaw: -0.58, pitch: 0.94, zoom: 1 }

/** Region of the camera frame that holds the board, normalised 0..1. */
export interface BoardCrop {
  x: number
  y: number
  w: number
  h: number
}

export const DEFAULT_CROP: BoardCrop = { x: 0.1, y: 0.12, w: 0.8, h: 0.76 }

export interface CoverageGrid {
  cols: number
  rows: number
  values: number[]
  min: number
  max: number
  /** How many cells are directly measured. */
  measured: number
  interpolated: boolean
}

export type SurfaceRole = 'overlay' | 'board'

export interface SceneTexture {
  /** The frame (or its cropped board region) used as the board surface. */
  image: CanvasImageSource | null
  /** Natural pixel size of `image`, needed for the sub-rect maths. */
  width: number
  height: number
  crop: BoardCrop
  /** 0 = black, 1 = full brightness. */
  brightness: number
}

export interface SceneInput {
  widthMm: number
  heightMm: number
  coverage: CoverageGrid | null
  role: SurfaceRole
  texture: SceneTexture | null
  unit: string
  /** Peak reading, shown as a marker when present. */
  peak: { xMm: number; yMm: number; value: number } | null
  /** Caption drawn inside the canvas (e.g. "NO CAMERA"). */
  note?: string | null
}

interface Projector {
  project: (x: number, y: number, z: number) => { x: number; y: number; depth: number }
  /** Screen pixels per millimetre on the board plane. */
  scale: number
  /** Vertical exaggerations factor applied to normalised heights. */
  zScale: number
  centre: { x: number; y: number }
}

/**
 * Builds a projection that fits the board (plus its tallest peak) inside the
 * canvas. The board is centred on the origin, X across, Y into the scene, Z up.
 */
export function createProjector(
  cam: SceneCamera,
  size: { width: number; height: number },
  extent: { w: number; h: number },
  lift = 0,
): Projector {
  const cosY = Math.cos(cam.yaw)
  const sinY = Math.sin(cam.yaw)
  const cosP = Math.cos(cam.pitch)
  const sinP = Math.sin(cam.pitch)

  const raw = (x: number, y: number, z: number) => {
    const rx = x * cosY - y * sinY
    const ry = x * sinY + y * cosY
    return {
      x: rx,
      y: ry * sinP - z * cosP,
      depth: ry * cosP + z * sinP,
    }
  }

  // Fit using the board corners and the top of the lift, so the surface never
  // gets clipped when the user rotates the view.
  const hx = extent.w / 2
  const hy = extent.h / 2
  const samples = [
    raw(-hx, -hy, 0),
    raw(hx, -hy, 0),
    raw(hx, hy, 0),
    raw(-hx, hy, 0),
    raw(-hx, -hy, lift),
    raw(hx, -hy, lift),
    raw(hx, hy, lift),
    raw(-hx, hy, lift),
  ]
  const minX = Math.min(...samples.map((s) => s.x))
  const maxX = Math.max(...samples.map((s) => s.x))
  const minY = Math.min(...samples.map((s) => s.y))
  const maxY = Math.max(...samples.map((s) => s.y))
  const spanX = Math.max(1e-6, maxX - minX)
  const spanY = Math.max(1e-6, maxY - minY)
  const pad = 0.86
  const scale = Math.min((size.width * pad) / spanX, (size.height * pad) / spanY) * cam.zoom
  const centre = { x: size.width / 2, y: size.height / 2 }
  const offX = (minX + maxX) / 2
  const offY = (minY + maxY) / 2

  return {
    project: (x, y, z) => {
      const p = raw(x, y, z)
      return {
        x: centre.x + (p.x - offX) * scale,
        y: centre.y + (p.y - offY) * scale,
        depth: p.depth,
      }
    },
    scale,
    zScale: extent.w * 0.26,
    centre,
  }
}

/**
 * Draws one tile of the camera frame onto the board plane. The tile's source
 * rectangle (in image pixels) is mapped affinely onto the projected quad, which
 * is what gives the board its perspective.
 */
function drawTextureTile(
  ctx: CanvasRenderingContext2D,
  texture: SceneTexture,
  proj: Projector,
  extent: { w: number; h: number },
  tile: { u0: number; v0: number; u1: number; v1: number },
) {
  const image = texture.image
  if (!image) return
  const px = (u: number) => -extent.w / 2 + u * extent.w
  const py = (v: number) => -extent.h / 2 + v * extent.h

  const a = proj.project(px(tile.u0), py(tile.v0), 0)
  const b = proj.project(px(tile.u1), py(tile.v0), 0)
  const c = proj.project(px(tile.u0), py(tile.v1), 0)
  const d = proj.project(px(tile.u1), py(tile.v1), 0)

  const sx = (texture.crop.x + tile.u0 * texture.crop.w) * texture.width
  const sy = (texture.crop.y + tile.v0 * texture.crop.h) * texture.height
  const sw = Math.max(1, (tile.u1 - tile.u0) * texture.crop.w * texture.width)
  const sh = Math.max(1, (tile.v1 - tile.v0) * texture.crop.h * texture.height)

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.lineTo(d.x, d.y)
  ctx.lineTo(c.x, c.y)
  ctx.closePath()
  ctx.clip()
  // Unit-square → parallelogram, so a 1×1 drawImage fills the quad exactly.
  ctx.transform(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y, a.x, a.y)
  ctx.globalAlpha = texture.brightness
  ctx.imageSmoothingQuality = 'high'
  try {
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, 1, 1)
  } catch {
    /* a frame that is not decodable yet is simply skipped */
  }
  ctx.restore()
}

/** Renders the reconstructed scene: board texture, coverage surface, peak pin. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  cam: SceneCamera,
  scene: SceneInput,
): void {
  const { width, height } = size
  const extent = { w: Math.max(1, scene.widthMm), h: Math.max(1, scene.heightMm) }
  const lift = scene.coverage ? extent.w * 0.26 : 0
  const proj = createProjector(cam, size, extent, lift)

  const board = { x0: -extent.w / 2, y0: -extent.h / 2, x1: extent.w / 2, y1: extent.h / 2 }

  ctx.save()
  ctx.clearRect(0, 0, width, height)

  // ---- backdrop -----------------------------------------------------------
  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#080b12')
  bg.addColorStop(1, '#05060a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // ---- board shadow -------------------------------------------------------
  const cornerTL = proj.project(board.x0, board.y0, 0)
  const cornerTR = proj.project(board.x1, board.y0, 0)
  const cornerBR = proj.project(board.x1, board.y1, 0)
  const cornerBL = proj.project(board.x0, board.y1, 0)

  // ---- texture ------------------------------------------------------------
  if (scene.texture?.image) {
    const tiles = 8
    for (let i = 0; i < tiles; i++) {
      for (let j = 0; j < tiles; j++) {
        drawTextureTile(ctx, scene.texture, proj, extent, {
          u0: i / tiles,
          v0: j / tiles,
          u1: (i + 1) / tiles,
          v1: (j + 1) / tiles,
        })
      }
    }
    // The projection transform is restored by each tile.
  } else {
    ctx.beginPath()
    ctx.moveTo(cornerTL.x, cornerTL.y)
    ctx.lineTo(cornerTR.x, cornerTR.y)
    ctx.lineTo(cornerBR.x, cornerBR.y)
    ctx.lineTo(cornerBL.x, cornerBL.y)
    ctx.closePath()
    ctx.fillStyle = 'rgba(12, 16, 26, 0.92)'
    ctx.fill()
  }

  // ---- board grid ---------------------------------------------------------
  ctx.save()
  ctx.strokeStyle = scene.texture?.image ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 0.7
  const divisions = 8
  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions
    const x = board.x0 + t * extent.w
    const y = board.y0 + t * extent.h
    const vLineA = proj.project(x, board.y0, 0)
    const vLineB = proj.project(x, board.y1, 0)
    const hLineA = proj.project(board.x0, y, 0)
    const hLineB = proj.project(board.x1, y, 0)
    ctx.beginPath()
    ctx.moveTo(vLineA.x, vLineA.y)
    ctx.lineTo(vLineB.x, vLineB.y)
    ctx.moveTo(hLineA.x, hLineA.y)
    ctx.lineTo(hLineB.x, hLineB.y)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(53,229,197,0.55)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(cornerTL.x, cornerTL.y)
  ctx.lineTo(cornerTR.x, cornerTR.y)
  ctx.lineTo(cornerBR.x, cornerBR.y)
  ctx.lineTo(cornerBL.x, cornerBL.y)
  ctx.closePath()
  ctx.stroke()
  ctx.restore()

  // ---- coverage surface ---------------------------------------------------
  const grid = scene.coverage
  if (grid && grid.values.length === grid.cols * grid.rows && grid.cols > 1 && grid.rows > 1) {
    const span = Math.max(1, grid.max - grid.min)
    // Drape on the board plane, or lift the sheet slightly above it so the
    // texture stays readable underneath.
    // A small pedestal keeps the sheet above the board texture so the DUT stays
    // visible under the translucent surface.
    const base = extent.w * 0.05
    const heightAt = (c: number, r: number) => base + ((grid.values[r * grid.cols + c] - grid.min) / span) * lift
    const colourAt = (c: number, r: number, alpha: number) => {
      const v = grid.values[r * grid.cols + c]
      return rampColor((v - grid.min) / span, alpha)
    }
    const pointAt = (c: number, r: number) =>
      proj.project(
        board.x0 + (c / (grid.cols - 1)) * extent.w,
        board.y0 + (r / (grid.rows - 1)) * extent.h,
        heightAt(c, r),
      )

    // Painter's order: far rows first so nearer facets overlap correctly.
    const rowDepth = new Array(grid.rows).fill(0).map((_, r) => pointAt(0, r).depth)
    const order = new Array(grid.rows).fill(0).map((_, r) => r)
    order.sort((a, b) => rowDepth[b] - rowDepth[a])

    ctx.save()
    ctx.globalAlpha = scene.role === 'overlay' ? 0.72 : 0.94
    for (const r of order) {
      for (let c = 0; c < grid.cols - 1; c++) {
        const a = pointAt(c, r)
        const b = pointAt(c + 1, r)
        const d = pointAt(c + 1, Math.min(grid.rows - 1, r + 1))
        const e = pointAt(c, Math.min(grid.rows - 1, r + 1))
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.lineTo(d.x, d.y)
        ctx.lineTo(e.x, e.y)
        ctx.closePath()
        ctx.fillStyle = colourAt(c, r, 1)
        ctx.fill()
      }
    }
    ctx.restore()

    // Wireframe on top for the mesh read.
    ctx.save()
    ctx.globalAlpha = 0.22
    ctx.strokeStyle = 'rgba(4, 8, 14, 0.9)'
    ctx.lineWidth = 0.5
    for (let r = 0; r < grid.rows; r += 2) {
      ctx.beginPath()
      for (let c = 0; c < grid.cols; c++) {
        const p = pointAt(c, r)
        if (c === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }
    for (let c = 0; c < grid.cols; c += 2) {
      ctx.beginPath()
      for (let r = 0; r < grid.rows; r++) {
        const p = pointAt(c, r)
        if (r === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      }
      ctx.stroke()
    }
    ctx.restore()
  }

  // ---- peak pin -----------------------------------------------------------
  if (scene.peak && grid) {
    const span = Math.max(1, grid.max - grid.min)
    const base = extent.w * 0.05
    const h = base + ((scene.peak.value - grid.min) / span) * lift
    const top = proj.project(scene.peak.xMm - extent.w / 2, scene.peak.yMm - extent.h / 2, h)
    const foot = proj.project(scene.peak.xMm - extent.w / 2, scene.peak.yMm - extent.h / 2, 0)
    ctx.save()
    ctx.strokeStyle = 'rgba(255,111,139,0.85)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(foot.x, foot.y)
    ctx.lineTo(top.x, top.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(top.x, top.y, 3.2, 0, Math.PI * 2)
    ctx.fillStyle = '#ff6f8b'
    ctx.fill()
    ctx.beginPath()
    ctx.arc(top.x, top.y, 7, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,111,139,0.35)'
    ctx.stroke()

    const label = `${Math.round(scene.peak.value)} ${scene.unit}`
    ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif'
    const padX = 5
    const tw = ctx.measureText(label).width
    const bx = Math.min(width - tw - padX * 2 - 2, Math.max(2, top.x + 9))
    const by = Math.max(2, top.y - 18)
    ctx.fillStyle = 'rgba(8, 11, 18, 0.86)'
    ctx.strokeStyle = 'rgba(255,111,139,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, tw + padX * 2, 14, 3)
    else ctx.rect(bx, by, tw + padX * 2, 14)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffb3c1'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + padX, by + 7.5)
    ctx.restore()
  }

  // ---- captions -----------------------------------------------------------
  ctx.save()
  ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
  ctx.fillStyle = 'rgba(105, 114, 137, 0.95)'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`${scene.widthMm} × ${scene.heightMm} mm board`, 10, height - 10)
  if (scene.note) {
    ctx.textAlign = 'right'
    ctx.fillStyle = 'rgba(247, 168, 75, 0.95)'
    ctx.fillText(scene.note, width - 10, height - 10)
  }
  ctx.restore()

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.restore()
}

/** Board coordinates in millimetres → normalised position inside the board. */
export function boardNormalised(xMm: number, yMm: number, widthMm: number, heightMm: number) {
  return { u: xMm / widthMm, v: yMm / heightMm }
}
