/**
 * Converte o modelo 2D numa cena 3D (three.js), em METROS.
 *
 * Eixos: X do plano → X; Y do plano → Z; altura → Y (para cima).
 * Uma rotação r (graus) no plano vira rotation.y = −r (rad).
 *
 * - Paredes: caixas ao longo do eixo da parede (com as extensões de canto do
 *   2D), divididas em pedaços em volta das aberturas: porta = vão até 2,10 m
 *   com parede acima; janela = peitoril + vidro + parede acima. Sem CSG.
 * - Pisos: polígono de cada cômodo, na cor do cômodo.
 * - Móveis: cada forma fechada do símbolo vira um prisma (altura por tipo de
 *   móvel), dando um aspecto de maquete.
 * - Imagem de fundo (opcional): plano texturizado no chão.
 */
import * as THREE from 'three'
import type { BlockDef, BlockShape } from '@shared/blocks'
import type { BlockObject, DoorObject, Id, ImageObject, OpeningObject, PlanDocument, RoomObject, WallObject } from '@shared/model'
import { distance, normalize, perp, polygonArea, polygonCentroid, sub } from '@renderer/lib/geometry'
import { computeWallGeometry } from '@renderer/canvas/wallGeometry'
import { clampOffset, OPENING_MARGIN } from '@renderer/lib/openings'
import { instanceMatrix, transformShape } from '@renderer/lib/blockGeometry'

const M = 0.01 // cm → m
export const DOOR_HEIGHT = 2.1
export const WINDOW_SILL = 1.0
export const WINDOW_TOP = 2.1

export interface BoxPiece {
  position: [number, number, number]
  rotationY: number
  size: [number, number, number]
  kind: 'wall' | 'glass' | 'door'
  color: string
}

export interface FloorPiece {
  id: Id
  geometry: THREE.ShapeGeometry
  color: string
  name: string
  area: number
  center: [number, number]
}

export interface FurniturePiece {
  geometry: THREE.BufferGeometry
  color: string
}

export interface ImagePiece {
  id: Id
  image: HTMLImageElement
  width: number
  height: number
  center: [number, number]
  rotationY: number
  opacity: number
}

export interface Scene3D {
  boxes: BoxPiece[]
  floors: FloorPiece[]
  furniture: FurniturePiece[]
  images: ImagePiece[]
  /** Centro e raio aproximado (m) do conteúdo, para enquadrar a câmera. */
  center: [number, number]
  radius: number
  empty: boolean
}

export interface SceneOptions {
  wallHeight: number
  /** Corte: paredes limitadas a esta altura (vista "maquete aberta"). */
  cutHeight: number | null
  includeImages: boolean
  resolveBlock(id: string): BlockDef | undefined
  image(asset: string): HTMLImageElement | null
}

const WALL_COLOR = '#ece9e4'

// --------------------------------------------------------------- móveis: alturas e cores

interface FurnitureStyle {
  /** Altura da forma principal (maior área). */
  base: number
  /** Alturas por índice de forma (sobrepõe a regra padrão). */
  byIndex?: number[]
  /** Altura das formas secundárias (padrão: base + 3 cm). */
  detail?: number
  color: string
}

const STYLES: Record<string, FurnitureStyle> = {
  'builtin:sofa-3': { base: 0.42, byIndex: [0.42, 0.82, 0.62, 0.62], detail: 0.5, color: '#8ea3c4' },
  'builtin:sofa-2': { base: 0.42, byIndex: [0.42, 0.82, 0.62, 0.62], detail: 0.5, color: '#8ea3c4' },
  'builtin:armchair': { base: 0.42, byIndex: [0.42, 0.82, 0.62, 0.62], detail: 0.5, color: '#a3b48f' },
  'builtin:coffee-table': { base: 0.42, color: '#b8946b' },
  'builtin:tv-rack': { base: 0.5, color: '#9b7b5a' },
  'builtin:tv': { base: 1.1, byIndex: [1.15, 0.6, 0.5], color: '#2f3238' },
  'builtin:bed-single': { base: 0.48, byIndex: [0.48, 1.0], detail: 0.58, color: '#e9e2d4' },
  'builtin:bed-double': { base: 0.48, byIndex: [0.48, 1.0], detail: 0.58, color: '#e9e2d4' },
  'builtin:bed-queen': { base: 0.48, byIndex: [0.48, 1.0], detail: 0.58, color: '#e9e2d4' },
  'builtin:bed-king': { base: 0.48, byIndex: [0.48, 1.0], detail: 0.58, color: '#e9e2d4' },
  'builtin:wardrobe': { base: 2.1, color: '#b08d67' },
  'builtin:nightstand': { base: 0.55, color: '#b08d67' },
  'builtin:desk': { base: 0.75, detail: 0.45, color: '#b8946b' },
  'builtin:kitchen-sink': { base: 0.9, detail: 0.88, color: '#d9dde2' },
  'builtin:stove': { base: 0.9, detail: 0.91, color: '#c9ced4' },
  'builtin:fridge': { base: 1.8, color: '#e4e7ea' },
  'builtin:microwave': { base: 0.3, color: '#c9ced4' },
  'builtin:dining-4': { base: 0.75, detail: 0.45, color: '#b8946b' },
  'builtin:dining-6': { base: 0.75, detail: 0.45, color: '#b8946b' },
  'builtin:chair': { base: 0.45, byIndex: [0.45, 0.9], color: '#b8946b' },
  'builtin:toilet': { base: 0.75, byIndex: [0.75, 0.4, 0.41], color: '#f4f6f8' },
  'builtin:bath-sink': { base: 0.85, detail: 0.86, color: '#f4f6f8' },
  'builtin:shower': { base: 0.05, byIndex: [0.05, 2.0], color: '#cfe3ee' },
  'builtin:bathtub': { base: 0.55, detail: 0.56, color: '#f4f6f8' },
  'builtin:round-table': { base: 0.75, color: '#b8946b' },
  'builtin:garden-chair': { base: 0.45, byIndex: [0.45, 0.85], color: '#a3b48f' },
  'builtin:lounger': { base: 0.35, color: '#a3b48f' },
  'builtin:bbq': { base: 0.9, detail: 0.92, color: '#8d8f93' },
  'builtin:circle': { base: 0.5, color: '#d6d2cb' },
  'builtin:rectangle': { base: 0.5, color: '#d6d2cb' },
  'builtin:door-std': { base: 0, color: '#d6d2cb' },
  'builtin:north-arrow': { base: 0, color: '#d6d2cb' }
}
const DEFAULT_STYLE: FurnitureStyle = { base: 0.6, color: '#d9d3c9' }

// --------------------------------------------------------------- utilidades

/** Pontos (cm) de uma forma fechada, ou null se não for fechada. */
function closedShapePoints(s: BlockShape): { x: number; y: number }[] | null {
  switch (s.kind) {
    case 'rect':
      return [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y },
        { x: s.x + s.w, y: s.y + s.h },
        { x: s.x, y: s.y + s.h }
      ]
    case 'ellipse': {
      const r = ((s.rotation ?? 0) * Math.PI) / 180
      return Array.from({ length: 28 }, (_, i) => {
        const t = (i / 28) * Math.PI * 2
        const x = Math.cos(t) * s.rx
        const y = Math.sin(t) * s.ry
        return { x: s.cx + x * Math.cos(r) - y * Math.sin(r), y: s.cy + x * Math.sin(r) + y * Math.cos(r) }
      })
    }
    case 'poly': {
      if (!s.closed) return null
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i < s.points.length; i += 2) pts.push({ x: s.points[i], y: s.points[i + 1] })
      return pts
    }
    default:
      return null
  }
}

/** Shape no plano XY local com (x, −y) — depois de rotateX(−π/2) fica no chão com Z = y do plano. */
function toShape(points: { x: number; y: number }[]): THREE.Shape {
  const shape = new THREE.Shape()
  points.forEach((p, i) => (i === 0 ? shape.moveTo(p.x * M, -p.y * M) : shape.lineTo(p.x * M, -p.y * M)))
  shape.closePath()
  return shape
}

const shapeArea = (pts: { x: number; y: number }[]): number => polygonArea(pts)

// --------------------------------------------------------------- construção

export function buildScene(doc: PlanDocument, opts: SceneOptions): Scene3D {
  const visible = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id))
  const tint = new Map(doc.layers.map((l) => [l.id, l.color]))
  const objects = doc.objects.filter((o) => visible.has(o.layerId))
  const walls = objects.filter((o): o is WallObject => o.type === 'wall')
  const openings = objects.filter((o): o is OpeningObject => o.type === 'door' || o.type === 'window')
  const geo = computeWallGeometry(walls)
  const H = opts.cutHeight !== null ? Math.min(opts.cutHeight, opts.wallHeight) : opts.wallHeight
  const boxes: BoxPiece[] = []
  const pts2d: { x: number; y: number }[] = []

  // ---- paredes + aberturas
  for (const w of walls) {
    const g = geo.get(w.id)
    if (!g) continue
    const len = distance(w.a, w.b)
    if (len < 1) continue
    const dir = normalize(sub(w.b, w.a))
    const nrm = perp(dir)
    const rotationY = -Math.atan2(dir.y, dir.x)
    const t = w.thickness * M
    const color = tint.get(w.layerId) ?? WALL_COLOR
    // Posições ao longo do eixo (cm, a partir de w.a), incluindo as extensões de canto.
    const s0 = -distance(g.a, w.a)
    const s1 = len + distance(g.b, w.b)
    const at = (s: number): { x: number; y: number } => ({ x: w.a.x + dir.x * s, y: w.a.y + dir.y * s })
    const piece = (sa: number, sb: number, y0: number, y1: number, kind: BoxPiece['kind'] = 'wall', depth = t, c = color): void => {
      if (sb - sa < 0.5 || y1 - y0 < 0.005) return
      const mid = at((sa + sb) / 2)
      boxes.push({ position: [mid.x * M, (y0 + y1) / 2, mid.y * M], rotationY, size: [(sb - sa) * M, y1 - y0, depth], kind, color: c })
    }
    pts2d.push(g.a, g.b)

    const ops = openings
      .filter((o) => o.wallId === w.id)
      .map((o) => {
        const width = Math.min(o.width, Math.max(1, len - 2 * OPENING_MARGIN))
        const c = clampOffset(o.offset, width, len)
        return { o, from: c - width / 2, to: c + width / 2, width }
      })
      .sort((p, q) => p.from - q.from)

    let cursor = s0
    for (const op of ops) {
      if (op.from < cursor) continue // aberturas sobrepostas: ignora a segunda
      piece(cursor, op.from, 0, H)
      if (op.o.type === 'door') {
        if (H > DOOR_HEIGHT) piece(op.from, op.to, DOOR_HEIGHT, H)
        // Folha da porta aberta a 90° (como no símbolo 2D).
        const d = op.o as DoorObject
        const hingeS = d.hinge === 'start' ? op.from : op.to
        const face = (d.side * w.thickness) / 2
        const hinge = at(hingeS)
        const leafLen = op.width
        const inward = d.hinge === 'start' ? 2 : -2 // 2 cm para dentro do vão
        const cx = hinge.x + nrm.x * (face + (d.side * leafLen) / 2) + dir.x * inward
        const cy = hinge.y + nrm.y * (face + (d.side * leafLen) / 2) + dir.y * inward
        boxes.push({
          position: [cx * M, Math.min(DOOR_HEIGHT, H) / 2, cy * M],
          rotationY,
          size: [0.04, Math.min(DOOR_HEIGHT, H) - 0.01, leafLen * M],
          kind: 'door',
          color: '#c9a77c'
        })
      } else {
        const sill = Math.min(WINDOW_SILL, H)
        piece(op.from, op.to, 0, sill)
        if (H > sill) piece(op.from, op.to, sill, Math.min(WINDOW_TOP, H), 'glass', t * 0.3, '#9ec9e8')
        if (H > WINDOW_TOP) piece(op.from, op.to, WINDOW_TOP, H)
      }
      cursor = op.to
    }
    piece(cursor, s1, 0, H)
  }

  // ---- pisos
  const floors: FloorPiece[] = objects
    .filter((o): o is RoomObject => o.type === 'room')
    .map((r) => {
      const geometry = new THREE.ShapeGeometry(toShape(r.points))
      geometry.rotateX(-Math.PI / 2)
      const c = polygonCentroid(r.points)
      pts2d.push(...r.points)
      return { id: r.id, geometry, color: r.color, name: r.name, area: polygonArea(r.points) / 10000, center: [c.x * M, c.y * M] as [number, number] }
    })

  // ---- móveis
  const furniture: FurniturePiece[] = []
  for (const b of objects.filter((o): o is BlockObject => o.type === 'block')) {
    const def = opts.resolveBlock(b.blockId)
    if (!def) continue
    const style = STYLES[def.id] ?? DEFAULT_STYLE
    if (style.base <= 0) continue
    const color = b.fill ?? tint.get(b.layerId) ?? style.color
    const m = instanceMatrix(b, def)
    const shapes = def.shapes.map((s) => transformShape(s, m))
    const filled = shapes
      .map((s, i) => ({ s, i, pts: s.fill && s.fill !== 'none' ? closedShapePoints(s) : null }))
      .filter((x): x is { s: BlockShape; i: number; pts: { x: number; y: number }[] } => !!x.pts && x.pts.length >= 3)
    if (!filled.length) continue
    const largest = filled.reduce((a, x) => (shapeArea(x.pts) > shapeArea(a.pts) ? x : a), filled[0])
    for (const f of filled) {
      const h = style.byIndex?.[f.i] ?? (f === largest ? style.base : (style.detail ?? style.base + 0.03))
      if (h <= 0) continue
      const geometry = new THREE.ExtrudeGeometry(toShape(f.pts), { depth: h, bevelEnabled: false })
      geometry.rotateX(-Math.PI / 2)
      const ink = f.s.fill === 'ink'
      furniture.push({ geometry, color: ink ? (b.stroke ?? '#5b6070') : color })
      pts2d.push(...f.pts)
    }
  }

  // ---- imagens de fundo
  const images: ImagePiece[] = []
  if (opts.includeImages) {
    for (const im of objects.filter((o): o is ImageObject => o.type === 'image' && !o.hidden)) {
      const el = opts.image(im.asset)
      if (!el) continue
      images.push({
        id: im.id,
        image: el,
        width: im.width * M,
        height: im.height * M,
        center: [im.position.x * M, im.position.y * M],
        rotationY: (-im.rotation * Math.PI) / 180,
        opacity: im.opacity
      })
    }
  }

  // ---- enquadramento
  const xs = pts2d.map((p) => p.x * M)
  const zs = pts2d.map((p) => p.y * M)
  const empty = !pts2d.length
  const minX = empty ? -5 : Math.min(...xs)
  const maxX = empty ? 5 : Math.max(...xs)
  const minZ = empty ? -4 : Math.min(...zs)
  const maxZ = empty ? 4 : Math.max(...zs)
  return {
    boxes,
    floors,
    furniture,
    images,
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2],
    radius: Math.max(3, Math.hypot(maxX - minX, maxZ - minZ) / 2),
    empty
  }
}
