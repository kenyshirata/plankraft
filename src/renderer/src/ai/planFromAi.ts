/**
 * Converte uma variação gerada pela IA (retângulos de cômodos em metros) em
 * objetos do PlanKraft:
 *
 *  1. Paredes: todas as bordas dos retângulos, quebradas nos encontros; trechos
 *     compartilhados por 2 cômodos viram paredes internas (10 cm), trechos de
 *     um só cômodo viram externas (15 cm) — exceto os da varanda, que fica
 *     aberta. Trechos colineares são unidos.
 *  2. Portas/janelas: cada ponto vai para a parede mais próxima (portas
 *     preferem internas na dúvida; janelas, externas).
 *  3. Cômodos: área útil detectada pelo grafo de paredes (fallback: retângulo).
 *  4. Móveis: blocos da biblioteca, encaixados na parede mais próxima.
 *  5. Cotas automáticas nas paredes externas.
 * Tudo nas camadas certas, pelo papel (role) de cada camada.
 */
import type { AiVariantT } from '@shared/aiPlan'
import {
  findLayerByRole,
  newId,
  type BlockObject,
  type DoorObject,
  type Id,
  type PlanDocument,
  type PlanObject,
  type Point,
  type RoomObject,
  type WallObject,
  type WindowObject
} from '@shared/model'
import { distance, polygonArea } from '@renderer/lib/geometry'
import { clampOffset, nearestWall, OPENING_MARGIN } from '@renderer/lib/openings'
import { detectRoomAt, planarFaces } from '@renderer/lib/rooms'
import { snapBlockToWalls } from '@renderer/lib/blockGeometry'
import { BUILTIN_BY_ID } from '@renderer/blocks/builtin'
import { ROOM_COLORS, wallDimensionsFor } from '@renderer/store/actions'

const EXTERIOR = 15
const INTERIOR = 10
const GRID = 5 // cm

const snap = (m: number): number => Math.round((m * 100) / GRID) * GRID

interface Rect {
  x1: number
  y1: number
  x2: number
  y2: number
}

interface Edge {
  /** Coordenada fixa (y para horizontais, x para verticais). */
  at: number
  from: number
  to: number
  /** Borda de um ambiente aberto (varanda): só vira parede se for compartilhada. */
  open?: boolean
}

/** Une trechos de bordas na mesma reta, contando quantos cômodos cobrem cada pedaço. */
function wallsOnLines(edges: Edge[], horizontal: boolean): { a: Point; b: Point; thickness: number }[] {
  const out: { a: Point; b: Point; thickness: number }[] = []
  const lines = new Map<number, Edge[]>()
  for (const e of edges) lines.set(e.at, [...(lines.get(e.at) ?? []), e])
  for (const [at, list] of lines) {
    const cuts = [...new Set(list.flatMap((e) => [e.from, e.to]))].sort((p, q) => p - q)
    let run: { from: number; to: number; count: number } | null = null
    const flush = (): void => {
      if (!run) return
      const a = horizontal ? { x: run.from, y: at } : { x: at, y: run.from }
      const b = horizontal ? { x: run.to, y: at } : { x: at, y: run.to }
      out.push({ a, b, thickness: run.count >= 2 ? INTERIOR : EXTERIOR })
      run = null
    }
    for (let i = 0; i < cuts.length - 1; i++) {
      const from = cuts[i]
      const to = cuts[i + 1]
      const mid = (from + to) / 2
      const covering = list.filter((e) => e.from <= mid && e.to >= mid)
      const count = covering.length
      // Trecho externo que só pertence a uma varanda: fica aberto (sem parede).
      if (count === 0 || (count === 1 && covering[0].open)) {
        flush()
        continue
      }
      const kind = Math.min(count, 2)
      if (run && run.to === from && Math.min(run.count, 2) === kind) run.to = to
      else {
        flush()
        run = { from, to, count: kind }
      }
    }
    flush()
  }
  return out
}

export interface BuiltPlan {
  objects: PlanObject[]
  /** Área total dos cômodos (cm²). */
  area: number
  warnings: string[]
}

/** Gera os objetos da variação, deslocados por `origin` (cm). */
export function buildPlanFromVariant(v: AiVariantT, doc: PlanDocument, origin: Point = { x: 0, y: 0 }): BuiltPlan {
  const warnings: string[] = []
  const layer = (role: Parameters<typeof findLayerByRole>[1]): Id =>
    (findLayerByRole(doc, role) ?? doc.layers[doc.layers.length - 1]).id

  // 1) Retângulos válidos (cm, no grid)
  const rects = v.rooms
    .map((r) => ({
      room: r,
      rect: {
        x1: origin.x + snap(r.x),
        y1: origin.y + snap(r.y),
        x2: origin.x + snap(r.x + r.width),
        y2: origin.y + snap(r.y + r.depth)
      } as Rect
    }))
    .filter(({ rect }) => rect.x2 - rect.x1 >= 50 && rect.y2 - rect.y1 >= 50)
  if (rects.length < v.rooms.length) warnings.push('Alguns cômodos muito pequenos foram ignorados.')

  // 2) Paredes
  const isOpen = (t: string): boolean => t === 'varanda'
  const hEdges: Edge[] = rects.flatMap(({ room, rect: r }) => [
    { at: r.y1, from: r.x1, to: r.x2, open: isOpen(room.type) },
    { at: r.y2, from: r.x1, to: r.x2, open: isOpen(room.type) }
  ])
  const vEdges: Edge[] = rects.flatMap(({ room, rect: r }) => [
    { at: r.x1, from: r.y1, to: r.y2, open: isOpen(room.type) },
    { at: r.x2, from: r.y1, to: r.y2, open: isOpen(room.type) }
  ])
  const wallLayer = layer('walls')
  const walls: WallObject[] = [...wallsOnLines(hEdges, true), ...wallsOnLines(vEdges, false)].map((w) => ({
    id: newId(),
    type: 'wall',
    layerId: wallLayer,
    ...w
  }))

  // 3) Portas e janelas
  const openingsLayer = layer('openings')
  const openings: (DoorObject | WindowObject)[] = []
  const place = (o: { x: number; y: number; width: number }, kind: 'door' | 'window'): void => {
    const p = { x: origin.x + o.x * 100, y: origin.y + o.y * 100 }
    const preferred = walls.filter((w) => (kind === 'window' ? w.thickness === EXTERIOR : true))
    const hit = nearestWall(p, preferred, 40) ?? nearestWall(p, walls, 40)
    if (!hit) {
      warnings.push(`Uma ${kind === 'door' ? 'porta' : 'janela'} fora das paredes foi ignorada.`)
      return
    }
    const len = distance(hit.wall.a, hit.wall.b)
    const width = Math.max(kind === 'door' ? 60 : 40, Math.min(snap(o.width), len - 2 * OPENING_MARGIN))
    if (len < width + 2 * OPENING_MARGIN) return
    const base = { id: newId(), layerId: openingsLayer, wallId: hit.wall.id, offset: clampOffset(hit.t, width, len), width }
    openings.push(kind === 'door' ? { ...base, type: 'door', side: hit.side, hinge: 'start' } : { ...base, type: 'window' })
  }
  v.doors.forEach((d) => place(d, 'door'))
  v.windows.forEach((w) => place(w, 'window'))

  // 4) Cômodos (área útil pelo grafo de paredes)
  const graph = planarFaces(walls)
  const roomLayer = layer('rooms')
  const rooms: RoomObject[] = rects.map(({ room, rect }, i) => {
    const center = { x: (rect.x1 + rect.x2) / 2, y: (rect.y1 + rect.y2) / 2 }
    const detected = detectRoomAt(center, walls, graph)
    const points = detected?.points ?? [
      { x: rect.x1, y: rect.y1 },
      { x: rect.x2, y: rect.y1 },
      { x: rect.x2, y: rect.y2 },
      { x: rect.x1, y: rect.y2 }
    ]
    return { id: newId(), type: 'room', layerId: roomLayer, name: room.name, points, color: ROOM_COLORS[i % ROOM_COLORS.length] }
  })

  // 5) Móveis (encaixados na parede mais próxima)
  const furnitureLayer = layer('furniture')
  const blocks: BlockObject[] = []
  for (const f of v.furniture) {
    const def = BUILTIN_BY_ID.get(f.block)
    if (!def) continue
    const inst: BlockObject = {
      id: newId(),
      type: 'block',
      layerId: furnitureLayer,
      blockId: def.id,
      position: { x: origin.x + f.x * 100, y: origin.y + f.y * 100 },
      rotation: (((Math.round(f.rotation / 90) * 90) % 360) + 360) % 360,
      scaleX: 1,
      scaleY: 1,
      flipX: false,
      flipY: false,
      fill: null,
      stroke: null
    }
    const snapped = snapBlockToWalls(inst, def, walls, 35)
    blocks.push(snapped ? { ...inst, ...snapped } : inst)
  }

  // 6) Cotas automáticas nas paredes EXTERNAS (as internas atravessariam os cômodos;
  //    o usuário pode criá-las com "Gerar cotas automáticas").
  const dims = wallDimensionsFor(doc, walls.filter((w) => w.thickness === EXTERIOR))

  return {
    objects: [...walls, ...openings, ...rooms, ...blocks, ...dims],
    area: rooms.reduce((s, r) => s + polygonArea(r.points), 0),
    warnings
  }
}

/** Área bruta (m²) e contagem de cômodos de uma variação — para os cartões de resultado. */
export function variantStats(v: AiVariantT): { area: number; rooms: number } {
  return { area: v.rooms.reduce((s, r) => s + r.width * r.depth, 0), rooms: v.rooms.length }
}
