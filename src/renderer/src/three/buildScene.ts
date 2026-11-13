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
import { WINDOW_HEIGHT_DEFAULT, WINDOW_SILL_DEFAULT } from '@shared/model'
import type { BlockObject, DoorObject, Id, ImageObject, OpeningObject, PlanDocument, RoomObject, WallObject, WindowObject } from '@shared/model'
import { distance, normalize, perp, pointInPolygon, polygonArea, polygonCentroid, sub } from '@renderer/lib/geometry'
import { computeWallGeometry } from '@renderer/canvas/wallGeometry'
import { clampOffset, OPENING_MARGIN } from '@renderer/lib/openings'
import { apply, instanceMatrix, transformShape } from '@renderer/lib/blockGeometry'
import { resolveMaterial } from '@shared/materials'

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
  /** Textura do acabamento (id de material), se houver. */
  texture?: string
}

export interface FloorPiece {
  id: Id
  geometry: THREE.BufferGeometry
  /** Laje (espessura sob o piso) dos andares acima do térreo. */
  slab?: THREE.BufferGeometry
  /** Altura (m) do piso do andar, para posicionar rótulos. */
  elevation: number
  /** Altura (m) do teto do cômodo; só o último andar recebe teto no passeio. */
  ceilingY: number
  topLevel: boolean
  color: string
  texture?: string
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
  /** Altura (m) do piso do andar. */
  y: number
  image: HTMLImageElement
  width: number
  height: number
  center: [number, number]
  rotationY: number
  opacity: number
}

/** Escada para o passeio: contorno (x, z em m), piso de partida e altura vencida. */
export interface StairPiece {
  quad: [number, number][]
  elevation: number
  height: number
}

export type RoofType = 'off' | 'flat' | 'gable' | 'hip'

export interface RoofPiece {
  geometry: THREE.BufferGeometry
  color: string
}

export interface Scene3D {
  roof: RoofPiece | null
  stairs: StairPiece[]
  /** Cotas (m) dos pisos dos andares. */
  levelElevations: number[]
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
  /** Telhado simples sobre o contorno do último andar (omitido na vista cortada). */
  roof?: RoofType
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
  'builtin:pillar-rect': { base: 2.7, color: '#cfcac2' },
  'builtin:pillar-round': { base: 2.7, color: '#cfcac2' },
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
function toShape(points: { x: number; y: number }[], holes: { x: number; y: number }[][] = []): THREE.Shape {
  const shape = new THREE.Shape()
  points.forEach((p, i) => (i === 0 ? shape.moveTo(p.x * M, -p.y * M) : shape.lineTo(p.x * M, -p.y * M)))
  shape.closePath()
  for (const h of holes) {
    const path = new THREE.Path()
    h.forEach((p, i) => (i === 0 ? path.moveTo(p.x * M, -p.y * M) : path.lineTo(p.x * M, -p.y * M)))
    path.closePath()
    shape.holes.push(path)
  }
  return shape
}

const STAIR_PREFIX = 'builtin:stair'
const SLAB = 0.15

/** Contorno (cm, no mundo) de uma escada: cantos TL, TR, BR, BL do símbolo. */
function stairQuad(b: BlockObject, def: BlockDef): { x: number; y: number }[] {
  const m = instanceMatrix(b, def)
  return [
    { x: 0, y: 0 },
    { x: def.width, y: 0 },
    { x: def.width, y: def.height },
    { x: 0, y: def.height }
  ].map((p) => apply(m, p))
}

const shapeArea = (pts: { x: number; y: number }[]): number => polygonArea(pts)

// --------------------------------------------------------------- construção

export function buildScene(doc: PlanDocument, opts: SceneOptions): Scene3D {
  const tint = new Map(doc.layers.map((l) => [l.id, l.color]))
  const boxes: BoxPiece[] = []
  const pts2d: { x: number; y: number }[] = []
  const floors: FloorPiece[] = []
  const furniture: FurniturePiece[] = []
  const images: ImagePiece[] = []
  const stairs: StairPiece[] = []
  let roofBase = 0
  let roofBox: { x0: number; z0: number; x1: number; z1: number } | null = null

  const levelObjects = (levelId: Id): PlanDocument['objects'] => {
    const ids = new Set(doc.layers.filter((l) => l.visible && l.levelId === levelId).map((l) => l.id))
    return doc.objects.filter((o) => ids.has(o.layerId))
  }

  // Escadas de cada andar (contorno no plano): fazem furo na laje do andar de cima.
  const stairsByLevel = new Map<Id, { x: number; y: number }[][]>()
  for (const level of doc.levels) {
    const quads: { x: number; y: number }[][] = []
    for (const b of levelObjects(level.id).filter((o): o is BlockObject => o.type === 'block')) {
      const def = opts.resolveBlock(b.blockId)
      if (def?.id.startsWith(STAIR_PREFIX)) quads.push(stairQuad(b, def))
    }
    stairsByLevel.set(level.id, quads)
  }

  doc.levels.forEach((level, li) => {
  const objects = levelObjects(level.id)
  const yOff = level.elevation * M
  const levelH = level.height * M
  const isTop = li === doc.levels.length - 1
  const walls = objects.filter((o): o is WallObject => o.type === 'wall')
  const openings = objects.filter((o): o is OpeningObject => o.type === 'door' || o.type === 'window')
  const geo = computeWallGeometry(walls)
  // Andares com outro por cima têm paredes até a laje; o último usa a altura configurada.
  const wallH = isTop ? Math.min(opts.wallHeight, levelH) : levelH
  const H = opts.cutHeight !== null ? Math.min(opts.cutHeight, wallH) : wallH
  if (isTop && walls.length) {
    roofBase = yOff + wallH
    const xsW = walls.flatMap((w) => [w.a.x, w.b.x])
    const zsW = walls.flatMap((w) => [w.a.y, w.b.y])
    const th = Math.max(...walls.map((w) => w.thickness)) / 2
    roofBox = { x0: (Math.min(...xsW) - th) * M, z0: (Math.min(...zsW) - th) * M, x1: (Math.max(...xsW) + th) * M, z1: (Math.max(...zsW) + th) * M }
  }

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
    const mat = resolveMaterial(w.material)
    const color = mat?.color ?? tint.get(w.layerId) ?? WALL_COLOR
    const texture = mat?.pattern ? mat.id : undefined
    // Posições ao longo do eixo (cm, a partir de w.a), incluindo as extensões de canto.
    const s0 = -distance(g.a, w.a)
    const s1 = len + distance(g.b, w.b)
    const at = (s: number): { x: number; y: number } => ({ x: w.a.x + dir.x * s, y: w.a.y + dir.y * s })
    const piece = (sa: number, sb: number, y0: number, y1: number, kind: BoxPiece['kind'] = 'wall', depth = t, c = color): void => {
      if (sb - sa < 0.5 || y1 - y0 < 0.005) return
      const mid = at((sa + sb) / 2)
      boxes.push({
        position: [mid.x * M, (y0 + y1) / 2 + yOff, mid.y * M],
        rotationY,
        size: [(sb - sa) * M, y1 - y0, depth],
        kind,
        color: c,
        texture: kind === 'wall' ? texture : undefined
      })
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
        const d = op.o as DoorObject
        const doorH = Math.min(DOOR_HEIGHT, H)
        const variant = d.variant ?? 'swing'
        /** Folha aberta a 90° (como no símbolo 2D): dobradiça em `hingeS`, comprimento `leafLen`. */
        const swingLeaf = (hingeAt: 'start' | 'end', leafLen: number): void => {
          const hingeS = hingeAt === 'start' ? op.from : op.to
          const face = (d.side * w.thickness) / 2
          const hinge = at(hingeS)
          const inward = hingeAt === 'start' ? 2 : -2 // 2 cm para dentro do vão
          const cx = hinge.x + nrm.x * (face + (d.side * leafLen) / 2) + dir.x * inward
          const cy = hinge.y + nrm.y * (face + (d.side * leafLen) / 2) + dir.y * inward
          boxes.push({
            position: [cx * M, doorH / 2 + yOff, cy * M],
            rotationY,
            size: [0.04, doorH - 0.01, leafLen * M],
            kind: 'door',
            color: '#c9a77c'
          })
        }
        /** Painel de correr: ocupa [sa, sb] ao longo do eixo, deslocado para um trilho. */
        const slider = (sa: number, sb: number, rail: number): void => {
          const mid = at((sa + sb) / 2)
          boxes.push({
            position: [(mid.x + nrm.x * rail) * M, doorH / 2 + yOff, (mid.y + nrm.y * rail) * M],
            rotationY,
            size: [(sb - sa) * M, doorH - 0.01, 0.04],
            kind: 'door',
            color: '#c9a77c'
          })
        }
        if (variant === 'swing') swingLeaf(d.hinge, op.width)
        else if (variant === 'double') {
          swingLeaf('start', op.width / 2)
          swingLeaf('end', op.width / 2)
        } else if (variant === 'sliding') {
          const mid = (op.from + op.to) / 2
          const over = op.width * 0.04
          slider(op.from, mid + over, w.thickness / 4)
          slider(mid - over, op.to, -w.thickness / 4)
        }
        // 'open' (vão livre): sem folha.
      } else {
        const win = op.o as WindowObject
        const sill = Math.min(((win.sill ?? WINDOW_SILL_DEFAULT) / 100), H)
        const top = Math.min(sill + (win.height ?? WINDOW_HEIGHT_DEFAULT) / 100, H)
        piece(op.from, op.to, 0, sill)
        if (top > sill) {
          if (win.variant === 'sliding') {
            const mid = (op.from + op.to) / 2
            const over = op.width * 0.05
            piece(op.from, mid + over, sill, top, 'glass', t * 0.2, '#9ec9e8')
            piece(mid - over, op.to, sill, top, 'glass', t * 0.2, '#b4d6ee')
          } else {
            piece(op.from, op.to, sill, top, 'glass', t * 0.3, '#9ec9e8')
          }
        }
        if (H > top) piece(op.from, op.to, top, H)
      }
      cursor = op.to
    }
    piece(cursor, s1, 0, H)
  }

  // ---- pisos (com furo para a escada que vem de baixo)
  const below = li > 0 ? (stairsByLevel.get(doc.levels[li - 1].id) ?? []) : []
  for (const r of objects.filter((o): o is RoomObject => o.type === 'room')) {
    const holes = below.filter((q) => pointInPolygon(polygonCentroid(q), r.points))
    const shape = toShape(r.points, holes)
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(0, yOff, 0)
    let slab: THREE.BufferGeometry | undefined
    if (li > 0) {
      slab = new THREE.ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false })
      slab.rotateX(-Math.PI / 2)
      slab.translate(0, yOff - SLAB, 0)
    }
    const c = polygonCentroid(r.points)
    pts2d.push(...r.points)
    const mat = resolveMaterial(r.material)
    floors.push({
      id: r.id,
      geometry,
      slab,
      elevation: yOff,
      ceilingY: yOff + wallH,
      topLevel: isTop,
      color: mat && !mat.pattern ? mat.color : r.color,
      texture: mat?.pattern ? mat.id : undefined,
      name: r.name,
      area: polygonArea(r.points) / 10000,
      center: [c.x * M, c.y * M] as [number, number]
    })
  }

  // ---- móveis
  for (const b of objects.filter((o): o is BlockObject => o.type === 'block')) {
    const def = opts.resolveBlock(b.blockId)
    if (!def) continue
    if (def.id.startsWith(STAIR_PREFIX)) {
      // Escada: degraus subindo até o piso do andar de cima.
      const [tl, tr, br, bl] = stairQuad(b, def)
      const n = Math.max(2, Math.round(levelH / 0.175))
      const lerp = (a: { x: number; y: number }, c: { x: number; y: number }, t: number): { x: number; y: number } => ({
        x: a.x + (c.x - a.x) * t,
        y: a.y + (c.y - a.y) * t
      })
      for (let i = 0; i < n; i++) {
        const quad = [lerp(bl, tl, i / n), lerp(br, tr, i / n), lerp(br, tr, (i + 1) / n), lerp(bl, tl, (i + 1) / n)]
        const g = new THREE.ExtrudeGeometry(toShape(quad), { depth: ((i + 1) * levelH) / n, bevelEnabled: false })
        g.rotateX(-Math.PI / 2)
        g.translate(0, yOff, 0)
        furniture.push({ geometry: g, color: b.fill ?? '#cdbfa8' })
      }
      pts2d.push(tl, tr, br, bl)
      stairs.push({ quad: [tl, tr, br, bl].map((q) => [q.x * M, q.y * M] as [number, number]), elevation: yOff, height: levelH })
      continue
    }
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
      // Pilares vão do piso ao teto do andar (acompanham o corte das paredes).
      const h = def.id.startsWith('builtin:pillar') ? H : (style.byIndex?.[f.i] ?? (f === largest ? style.base : (style.detail ?? style.base + 0.03)))
      if (h <= 0) continue
      const geometry = new THREE.ExtrudeGeometry(toShape(f.pts), { depth: h, bevelEnabled: false })
      geometry.rotateX(-Math.PI / 2)
      geometry.translate(0, yOff, 0)
      const ink = f.s.fill === 'ink'
      furniture.push({ geometry, color: ink ? (b.stroke ?? '#5b6070') : color })
      pts2d.push(...f.pts)
    }
  }

  // ---- imagens de fundo
  if (opts.includeImages) {
    for (const im of objects.filter((o): o is ImageObject => o.type === 'image' && !o.hidden)) {
      const el = opts.image(im.asset)
      if (!el) continue
      images.push({
        id: im.id,
        y: yOff,
        image: el,
        width: im.width * M,
        height: im.height * M,
        center: [im.position.x * M, im.position.y * M],
        rotationY: (-im.rotation * Math.PI) / 180,
        opacity: im.opacity
      })
    }
  }

  })

  // ---- enquadramento
  const xs = pts2d.map((p) => p.x * M)
  const zs = pts2d.map((p) => p.y * M)
  const empty = !pts2d.length
  const minX = empty ? -5 : Math.min(...xs)
  const maxX = empty ? 5 : Math.max(...xs)
  const minZ = empty ? -4 : Math.min(...zs)
  const maxZ = empty ? 4 : Math.max(...zs)
  return {
    roof: opts.roof && opts.roof !== 'off' && opts.cutHeight === null && roofBox ? buildRoof(opts.roof, roofBox, roofBase) : null,
    stairs,
    levelElevations: doc.levels.map((l) => l.elevation * M),
    boxes,
    floors,
    furniture,
    images,
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2],
    radius: Math.max(3, Math.hypot(maxX - minX, maxZ - minZ) / 2),
    empty
  }
}

// --------------------------------------------------------------- telhado

const ROOF_OVERHANG = 0.4
const ROOF_COLOR = '#b5543a'

/** Telhado simples (plano, duas ou quatro águas) sobre a caixa das paredes do último andar. */
function buildRoof(type: Exclude<RoofType, 'off'>, box: { x0: number; z0: number; x1: number; z1: number }, base: number): RoofPiece {
  const x0 = box.x0 - ROOF_OVERHANG
  const x1 = box.x1 + ROOF_OVERHANG
  const z0 = box.z0 - ROOF_OVERHANG
  const z1 = box.z1 + ROOF_OVERHANG
  const w = x1 - x0
  const d = z1 - z0
  const pos: number[] = []
  const tri = (a: number[], b: number[], c: number[]): void => void pos.push(...a, ...b, ...c)
  const quad = (a: number[], b: number[], c: number[], e: number[]): void => {
    tri(a, b, c)
    tri(a, c, e)
  }
  if (type === 'flat') {
    const t = 0.15
    const g = new THREE.BoxGeometry(w, t, d)
    g.translate((x0 + x1) / 2, base + t / 2, (z0 + z1) / 2)
    return { geometry: g, color: '#a9a49b' }
  }
  const alongX = w >= d // cumeeira ao longo do lado maior
  const span = Math.min(w, d)
  const rise = Math.min(2.4, span * 0.22)
  const y0 = base
  const yr = base + rise
  if (alongX) {
    const zc = (z0 + z1) / 2
    // hip: a cumeeira encurta `span/2` em cada ponta; gable: vai de ponta a ponta
    const inset = type === 'hip' ? Math.min(span / 2, w / 2) : 0
    const r0 = [x0 + inset, yr, zc]
    const r1 = [x1 - inset, yr, zc]
    quad([x0, y0, z0], [x1, y0, z0], r1, r0)
    quad([x0, y0, z1], r0, r1, [x1, y0, z1])
    if (type === 'hip') {
      tri([x0, y0, z0], r0, [x0, y0, z1])
      tri([x1, y0, z0], [x1, y0, z1], r1)
    } else {
      tri([x0, y0, z0], [x0, y0, z1], r0)
      tri([x1, y0, z0], r1, [x1, y0, z1])
    }
  } else {
    const xc = (x0 + x1) / 2
    const inset = type === 'hip' ? Math.min(span / 2, d / 2) : 0
    const r0 = [xc, yr, z0 + inset]
    const r1 = [xc, yr, z1 - inset]
    quad([x0, y0, z0], r0, r1, [x0, y0, z1])
    quad([x1, y0, z0], [x1, y0, z1], r1, r0)
    if (type === 'hip') {
      tri([x0, y0, z0], [x1, y0, z0], r0)
      tri([x0, y0, z1], r1, [x1, y0, z1])
    } else {
      tri([x0, y0, z0], [x1, y0, z0], r0)
      tri([x0, y0, z1], r1, [x1, y0, z1])
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  return { geometry: g, color: ROOF_COLOR }
}
