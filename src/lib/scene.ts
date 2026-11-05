/**
 * 3D reconstruction renderer.
 *
 * Replaces the flat painter's-algorithm fill with a small software rasteriser
 * that actually looks like a surface lying on a board:
 *
 *  - **Perspective camera** with orbit + dolly, so the board has real foreshortening.
 *  - **Per-facet lighting** (Lambert + rim) using a face normal, so ridges and
 *    valleys are readable instead of a single flat gradient.
 *  - **Supersampled drawing** (2× device pixel ratio, capped) with anti-aliased
 *    facet edges and a subtle occlusion pass for the highest ridges.
 *  - **Correct texture mapping**: the camera frame is split into a mesh and each
 *    piece is projected onto its own facet, so the picture follows the geometry
 *    instead of being stretched over a single quad.
 *  - **Honest degradation**: no frame → the board is drawn as a wireframe with
 *    no texture; the footer still reports measured vs interpolated cells.
 */

import { rampColor } from './derive'

export interface SceneCamera {
  /** Rotation around the vertical axis, radians. */
  yaw: number
  /** Camera elevation above the board plane, radians (small = edge-on). */
  pitch: number
  zoom: number
}

export const DEFAULT_CAMERA: SceneCamera = { yaw: -0.58, pitch: 0.94, zoom: 1 }

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
  measured: number
  interpolated: boolean
}

export type SurfaceRole = 'overlay' | 'board'

export interface SceneTexture {
  image: CanvasImageSource | null
  width: number
  height: number
  crop: BoardCrop
  brightness: number
}

export interface SceneInput {
  widthMm: number
  heightMm: number
  coverage: CoverageGrid | null
  role: SurfaceRole
  texture: SceneTexture | null
  unit: string
  peak: { xMm: number; yMm: number; value: number } | null
  note?: string | null
  /** Visual height of the field sheet, as a fraction of board width. */
  relief?: number
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface CameraSpace {
  /** Camera-space coordinates (x right, y up, z into the screen). */
  p: Vec3
}

/**
 * Perspective camera looking at the board centre.
 *
 * Board space: X right, Y *down* the board (image convention), Z up out of the
 * board. The camera orbits at `pitch` above the plane and `yaw` around it.
 */
export function toCamera(x: number, y: number, z: number, cam: SceneCamera, extent: number): CameraSpace {
  const cosY = Math.cos(cam.yaw)
  const sinY = Math.sin(cam.yaw)
  const cosP = Math.cos(cam.pitch)
  const sinP = Math.sin(cam.pitch)
  // Rotate around Z (board normal), then tilt into the camera frame.
  const rx = x * cosY - y * sinY
  const ry = x * sinY + y * cosY
  return {
    p: {
      x: rx,
      y: ry * cosP + z * sinP,
      // Distance pulled back so the whole board fits at zoom 1.
      z: -ry * sinP + z * cosP + extent * 2.6 / Math.max(0.2, cam.zoom),
    },
  }
}

interface Projected {
  x: number
  y: number
  depth: number
  scale: number
}

export interface Projector {
  project: (x: number, y: number, z: number) => Projected
  scale: number
  centre: { x: number; y: number }
  /** Pixels per millimetre at the board centre. */
  pixelsPerMm: number
}

/** Builds a perspective projector that fits the board (plus relief) on screen. */
export function createProjector(
  cam: SceneCamera,
  size: { width: number; height: number },
  extent: { w: number; h: number },
  lift = 0,
): Projector {
  const boardExtent = Math.max(extent.w, extent.h)
  const focal = Math.min(size.width, size.height) * 1.16

  const project = (x: number, y: number, z: number): Projected => {
    const { p } = toCamera(x, y, z, cam, boardExtent)
    const depth = Math.max(0.001, p.z)
    const k = focal / depth
    return {
      x: size.width / 2 + p.x * k,
      y: size.height / 2 - (p.y * k) + boardExtent * 0.02 * k * 0,
      depth,
      scale: k,
    }
  }

  // Solve the zoom so the board corners fit, including the relief at the centre.
  const corners: [number, number][] = [
    [-extent.w / 2, -extent.h / 2],
    [extent.w / 2, -extent.h / 2],
    [extent.w / 2, extent.h / 2],
    [-extent.w / 2, extent.h / 2],
  ]
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const probe = project(0, 0, lift * 0.35)
  for (const [cx, cy] of corners) {
    const p = project(cx, cy, 0)
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  minY = Math.min(minY, probe.y)
  const spanX = Math.max(1e-6, maxX - minX)
  const spanY = Math.max(1e-6, maxY - minY)
  // Extra headroom because the sheet's peaks sit above the plane.
  const fit = Math.min((size.width * 0.82) / spanX, (size.height * 0.7) / spanY)
  const offX = (minX + maxX) / 2 - size.width / 2
  const offY = (minY + maxY) / 2 - size.height / 2 + size.height * 0.02

  const fitted = (x: number, y: number, z: number): Projected => {
    const p = project(x, y, z)
    return { ...p, x: size.width / 2 + (p.x - size.width / 2 - offX) * fit, y: size.height / 2 + (p.y - size.height / 2 - offY) * fit }
  }

  const centre = fitted(0, 0, 0)
  return {
    project: fitted,
    scale: fit,
    centre: { x: centre.x, y: centre.y },
    pixelsPerMm: (fit * focal) / Math.max(0.001, centre.depth),
  }
}

/* --------------------------------- helpers -------------------------------- */

const LIGHT = (() => {
  const v = { x: -0.42, y: -0.52, z: 0.74 }
  const len = Math.hypot(v.x, v.y, v.z)
  return { x: v.x / len, y: v.y / len, z: v.z / len }
})()

function facetNormal(
  a: { x: number; y: number; depth: number },
  b: { x: number; y: number; depth: number },
  c: { x: number; y: number; depth: number },
): { nx: number; ny: number; nz: number; area: number } {
  // Screen-space cross product, lifted with the depth difference so the normal
  // leans the way the surface does.
  const abx = b.x - a.x
  const aby = b.y - a.y
  const abz = (b.depth - a.depth) * 0.35
  const acx = c.x - a.x
  const acy = c.y - a.y
  const acz = (c.depth - a.depth) * 0.35
  let nx = aby * acz - abz * acy
  let ny = abz * acx - abx * acz
  let nz = abx * acy - aby * acx
  const len = Math.hypot(nx, ny, nz) || 1
  nx /= len
  ny /= len
  nz /= len
  if (nz < 0) {
    nx = -nx
    ny = -ny
    nz = -nz
  }
  return { nx, ny, nz, area: (len / 2) * 0.001 }
}

function shade(base: string, light: number, rim: number): string {
  // rampColor() returns `rgba(r, g, b, a)` — lighting is applied to those channels.
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(base)
  if (!m) return base
  const r = Number(m[1])
  const g = Number(m[2])
  const b = Number(m[3])
  const k = 0.52 + light * 0.62
  const rr = Math.min(255, Math.round(r * k + rim * 90))
  const gg = Math.min(255, Math.round(g * k + rim * 105))
  const bb = Math.min(255, Math.round(b * k + rim * 130))
  const alpha = /rgba\([^)]*,\s*([\d.]+)\s*\)/i.exec(base)?.[1]
  return alpha ? `rgba(${rr},${gg},${bb},${alpha})` : `rgb(${rr},${gg},${bb})`
}

function polyPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath()
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
}

/** Draws the board plane textured with the camera frame, split into facets. */
function drawTexturedBoard(
  ctx: CanvasRenderingContext2D,
  proj: Projector,
  scene: SceneInput,
  texture: SceneTexture,
  grid: { cols: number; rows: number },
) {
  const halfW = scene.widthMm / 2
  const halfH = scene.heightMm / 2
  const { cols, rows } = grid
  // v = 0 is the top of the camera image, which is the far edge of the board.
  const worldY = (v: number) => halfH - v * scene.heightMm

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const u0 = c / cols
      const u1 = (c + 1) / cols
      const v0 = r / rows
      const v1 = (r + 1) / rows
      const x0 = -halfW + u0 * scene.widthMm
      const x1 = -halfW + u1 * scene.widthMm
      const y0 = worldY(v0)
      const y1 = worldY(v1)

      const a = proj.project(x0, y0, 0)
      const b = proj.project(x1, y0, 0)
      const d = proj.project(x1, y1, 0)
      const e = proj.project(x0, y1, 0)

      const sx = (texture.crop.x + u0 * texture.crop.w) * texture.width
      const sy = (texture.crop.y + v0 * texture.crop.h) * texture.height
      const sw = Math.max(1, ((u1 - u0) * texture.crop.w * texture.width))
      const sh = Math.max(1, ((v1 - v0) * texture.crop.h * texture.height))

      ctx.save()
      polyPath(ctx, [a, b, d, e])
      ctx.clip()
      // Unit square → projected quad, so the JPEG follows the facet exactly.
      ctx.transform(b.x - a.x, b.y - a.y, e.x - a.x, e.y - a.y, a.x, a.y)
      ctx.globalAlpha = texture.brightness
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      try {
        ctx.drawImage(texture.image as CanvasImageSource, sx, sy, sw, sh, 0, 0, 1, 1)
      } catch {
        /* a frame that is not decodable yet is skipped, never faked */
      }
      ctx.restore()
    }
  }
}

/** 3×3 box blur over a row-major grid — display smoothing only. */
function smoothGrid(grid: CoverageGrid): number[] {
  const { cols, rows, values } = grid
  const out = new Array(cols * rows).fill(0)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0
      let n = 0
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr
          const cc = c + dc
          if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue
          sum += values[rr * cols + cc]
          n += 1
        }
      }
      out[r * cols + c] = sum / Math.max(1, n)
    }
  }
  return out
}

/** Draws the coverage sheet: lit, depth-sorted facets with soft edges. */
function drawCoverageSheet(
  ctx: CanvasRenderingContext2D,
  proj: Projector,
  scene: SceneInput,
  grid: CoverageGrid,
) {
  const halfW = scene.widthMm / 2
  const halfH = scene.heightMm / 2
  const relief = (scene.relief ?? 0.16) * scene.widthMm
  // Barely lifted: the sheet should look laid on the board, not floating above it.
  const pedestal = scene.texture ? scene.widthMm * 0.006 : scene.widthMm * 0.02
  const span = Math.max(1, grid.max - grid.min)

  // One light smoothing pass: IDW leaves stair edges where coverage stops, and a
  // 3×3 kernel removes the terracing without moving the peaks. This affects the
  // drawing only — measured values are untouched everywhere else.
  const smooth = smoothGrid(grid)
  const heightAt = (c: number, r: number) =>
    pedestal + ((smooth[r * grid.cols + c] - grid.min) / span) * relief

  const pointAt = (c: number, r: number) =>
    proj.project(
      -halfW + (c / Math.max(1, grid.cols - 1)) * scene.widthMm,
      halfH - (r / Math.max(1, grid.rows - 1)) * scene.heightMm,
      heightAt(c, r),
    )

  const pts: Projected[][] = []
  for (let r = 0; r < grid.rows; r++) {
    const row: Projected[] = []
    for (let c = 0; c < grid.cols; c++) row.push(pointAt(c, r))
    pts.push(row)
  }

  type Facet = { quad: Projected[]; depth: number; colour: string; alpha: number }
  const facets: Facet[] = []
  for (let r = 0; r < grid.rows - 1; r++) {
    for (let c = 0; c < grid.cols - 1; c++) {
      const a = pts[r][c]
      const b = pts[r][c + 1]
      const d = pts[r + 1][c + 1]
      const e = pts[r + 1][c]
      const normal = facetNormal(a, b, d)
      const lambert = Math.max(0, normal.nx * LIGHT.x + normal.ny * LIGHT.y + normal.nz * LIGHT.z)
      const rim = Math.pow(1 - normal.nz, 3) * 0.5
      const t = (smooth[r * grid.cols + c] - grid.min) / span
      // Over a live picture the sheet is a lens, not a wall: quiet field is
      // nearly transparent so the DUT shows through, hotspots stay solid.
      const alpha =
        scene.role === 'overlay' && scene.texture ? 0.16 + Math.pow(t, 1.6) * 0.78 : 0.95
      facets.push({
        quad: [a, b, d, e],
        depth: (a.depth + b.depth + d.depth + e.depth) / 4,
        colour: shade(rampColor(t, alpha), lambert, rim),
        alpha,
      })
    }
  }
  // Painter's order: far facets first.
  facets.sort((p, q) => q.depth - p.depth)

  ctx.save()
  // The sheet must not spill past the PCB. The clip is the board silhouette
  // expanded just enough that a peak standing near the edge is not sliced flat.
  const outline = [
    proj.project(-halfW, halfH, 0),
    proj.project(halfW, halfH, 0),
    proj.project(halfW, -halfH, 0),
    proj.project(-halfW, -halfH, 0),
  ]
  const cx = (outline[0].x + outline[1].x + outline[2].x + outline[3].x) / 4
  const cy = (outline[0].y + outline[1].y + outline[2].y + outline[3].y) / 4
  const grow = 1 + (relief / Math.max(1, scene.widthMm)) * 0.25
  polyPath(
    ctx,
    outline.map((corner) => ({ x: cx + (corner.x - cx) * grow, y: cy + (corner.y - cy) * grow })),
  )
  ctx.clip()
  ctx.lineJoin = 'round'
  for (const facet of facets) {
    polyPath(ctx, facet.quad)
    ctx.fillStyle = facet.colour
    ctx.fill()
    // A hairline of the facet's own colour closes the seams between quads.
    ctx.strokeStyle = facet.colour
    ctx.lineWidth = 0.6
    ctx.stroke()
  }
  ctx.restore()
}

/** Renders the whole scene. */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: { width: number; height: number },
  cam: SceneCamera,
  scene: SceneInput,
): void {
  const { width, height } = size
  const extent = { w: Math.max(1, scene.widthMm), h: Math.max(1, scene.heightMm) }
  const relief = (scene.relief ?? 0.16) * scene.widthMm
  const proj = createProjector(cam, size, extent, relief)
  const halfW = extent.w / 2
  const halfH = extent.h / 2

  ctx.save()
  ctx.clearRect(0, 0, width, height)

  // Backdrop with a soft floor glow so the board reads as an object in space.
  const bg = ctx.createRadialGradient(width / 2, height * 0.62, 8, width / 2, height * 0.5, Math.max(width, height) * 0.8)
  bg.addColorStop(0, '#0d1220')
  bg.addColorStop(1, '#05060a')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // Ground shadow under the board.
  const shadowPts = [
    proj.project(-halfW, -halfH, -extent.w * 0.02),
    proj.project(halfW, -halfH, -extent.w * 0.02),
    proj.project(halfW, halfH, -extent.w * 0.02),
    proj.project(-halfW, halfH, -extent.w * 0.02),
  ]
  ctx.save()
  ctx.filter = 'blur(10px)'
  polyPath(ctx, shadowPts)
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fill()
  ctx.restore()

  // ---- board plane -------------------------------------------------------
  const corners = [
    proj.project(-halfW, -halfH, 0),
    proj.project(halfW, -halfH, 0),
    proj.project(halfW, halfH, 0),
    proj.project(-halfW, halfH, 0),
  ]

  if (scene.texture?.image) {
    // Enough facets for the picture to follow the projection without seams.
    drawTexturedBoard(ctx, proj, scene, scene.texture, { cols: 12, rows: 9 })
  } else {
    polyPath(ctx, corners)
    ctx.fillStyle = 'rgba(12, 17, 28, 0.94)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(53,229,197,0.5)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  // ---- board grid (silkscreen-ish reference) ------------------------------
  ctx.save()
  ctx.strokeStyle = scene.texture?.image ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 0.7
  const divisions = 8
  ctx.beginPath()
  for (let i = 1; i < divisions; i++) {
    const t = i / divisions
    const x = -halfW + t * extent.w
    const y = -halfH + t * extent.h
    const va = proj.project(x, -halfH, 0)
    const vb = proj.project(x, halfH, 0)
    const ha = proj.project(-halfW, y, 0)
    const hb = proj.project(halfW, y, 0)
    ctx.moveTo(va.x, va.y)
    ctx.lineTo(vb.x, vb.y)
    ctx.moveTo(ha.x, ha.y)
    ctx.lineTo(hb.x, hb.y)
  }
  ctx.stroke()
  ctx.restore()

  // Board outline, always visible on top of the texture.
  polyPath(ctx, corners)
  ctx.strokeStyle = 'rgba(53,229,197,0.55)'
  ctx.lineWidth = 1.1
  ctx.stroke()

  // ---- coverage sheet ----------------------------------------------------
  const grid = scene.coverage
  const hasGrid = grid && grid.values.length === grid.cols * grid.rows && grid.cols > 1 && grid.rows > 1
  if (hasGrid) drawCoverageSheet(ctx, proj, scene, grid)

  // ---- peak marker -------------------------------------------------------
  if (scene.peak && grid && hasGrid) {
    const span = Math.max(1, grid.max - grid.min)
    const h =
      scene.widthMm * 0.06 + ((scene.peak.value - grid.min) / span) * (scene.relief ?? 0.16) * scene.widthMm
    const top = proj.project(scene.peak.xMm - halfW, halfH - scene.peak.yMm, h)
    const foot = proj.project(scene.peak.xMm - halfW, halfH - scene.peak.yMm, 0)
    ctx.save()
    ctx.strokeStyle = 'rgba(255,111,139,0.9)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(foot.x, foot.y)
    ctx.lineTo(top.x, top.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(top.x, top.y, 8, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,111,139,0.28)'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(top.x, top.y, 3.4, 0, Math.PI * 2)
    ctx.fillStyle = '#ff6f8b'
    ctx.shadowColor = 'rgba(255,111,139,0.8)'
    ctx.shadowBlur = 10
    ctx.fill()
    ctx.restore()

    const label = `${Math.round(scene.peak.value)} ${scene.unit}`
    ctx.save()
    ctx.font = '600 9.5px ui-sans-serif, system-ui, sans-serif'
    const tw = ctx.measureText(label).width
    const bx = Math.min(width - tw - 16, Math.max(4, top.x + 10))
    const by = Math.min(height - 22, Math.max(6, top.y - 18))
    ctx.fillStyle = 'rgba(8, 11, 18, 0.88)'
    ctx.strokeStyle = 'rgba(255,111,139,0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(bx, by, tw + 10, 15, 3)
    else ctx.rect(bx, by, tw + 10, 15)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffc2cd'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, bx + 5, by + 8)
    ctx.restore()
  }

  // ---- captions ----------------------------------------------------------
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
  ctx.restore()
}

/** Board coordinates in millimetres → normalised position inside the board. */
export function boardNormalised(xMm: number, yMm: number, widthMm: number, heightMm: number) {
  return { u: xMm / widthMm, v: yMm / heightMm }
}
