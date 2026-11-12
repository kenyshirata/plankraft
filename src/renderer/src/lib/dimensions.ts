/**
 * Cotas: geometria e disposição (layout).
 *
 * Uma cota mede o segmento p1→p2 (eixo da parede, ou dois pontos livres) e é
 * desenhada numa linha paralela, deslocada `dist` cm na direção da normal `n`:
 *
 *        q1 ──────── 3,20 m ──────── q2      ← linha de cota (com "ticks" a 45°)
 *        │                            │      ← linhas de chamada
 *        p1 ========= parede ======== p2
 *
 * Regras automáticas (offset = null):
 *  - lado: o EXTERNO da edificação (descoberto pelo grafo planar de paredes);
 *    paredes internas/soltas usam o lado de cima/esquerda da tela;
 *  - distância: meia espessura + N px de tela (configurável);
 *  - escalonamento: se a linha colidir com outra cota paralela próxima, ela é
 *    afastada em degraus de STEP_PX até não colidir.
 */
import type { DimensionObject, Id, Point, WallObject } from '@shared/model'
import type { CornerAngleMode, DimensionStyle } from '@renderer/store/settingsStore'
import { add, distance, mul, normalize, perp, pointInPolygon, samePoint, sub } from './geometry'
import type { PlanarGraph } from './rooms'

const STEP_PX = 18
const MIN_GAP_PX = 14
const MAX_LEVELS = 6

export interface DimensionLayout {
  id: Id
  layerId: Id
  /** Pontos medidos. */
  p1: Point
  p2: Point
  /** Direção unitária p1→p2. */
  dir: Point
  /** Normal unitária apontando da medida para a linha de cota. */
  n: Point
  /** Distância (cm) da medida até a linha de cota. */
  dist: number
  /** Onde a linha de chamada começa (cm a partir da medida) — evita encostar na parede. */
  gap: number
  /** Comprimento medido (cm). */
  length: number
  auto: boolean
}

/** Normal "preferida" para leitura: aponta para cima ou, em segmentos verticais, para a esquerda. */
export function preferredSide(dir: Point): 1 | -1 {
  const n = perp(dir)
  return n.y > 0 || (Math.abs(n.y) < 1e-9 && n.x > 0) ? -1 : 1
}

/**
 * Lado externo de cada parede (+1 = lado da normal esquerda `perp(dir)`, -1 = oposto),
 * testando, em cada lado, se um ponto próximo está dentro de alguma face interna.
 */
export function exteriorSides(walls: WallObject[], graph: PlanarGraph): Map<Id, 1 | -1> {
  const inner = graph.faces.filter((f) => f.area > 0)
  const inside = (p: Point): boolean => inner.some((f) => pointInPolygon(p, f.poly))
  const result = new Map<Id, 1 | -1>()
  for (const w of walls) {
    const dir = normalize(sub(w.b, w.a))
    const L = perp(dir)
    const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }
    const probe = w.thickness / 2 + 10
    const inL = inside(add(mid, mul(L, probe)))
    const inR = inside(add(mid, mul(L, -probe)))
    result.set(w.id, inL && !inR ? -1 : inR && !inL ? 1 : preferredSide(dir))
  }
  return result
}

interface LayoutOptions {
  /** px por cm. */
  scale: number
  offsetPx: number
  style: DimensionStyle
}

/** Segmento medido por uma cota (null se a parede não existir). */
export function measuredSegment(d: DimensionObject, walls: Map<Id, WallObject>): { a: Point; b: Point; thickness: number } | null {
  if (d.kind === 'free') return { a: d.a, b: d.b, thickness: 0 }
  const w = walls.get(d.wallId)
  return w ? { a: w.a, b: w.b, thickness: w.thickness } : null
}

export function layoutDimensions(
  dims: DimensionObject[],
  walls: Map<Id, WallObject>,
  sides: Map<Id, 1 | -1>,
  opts: LayoutOptions
): DimensionLayout[] {
  const hair = 1 / opts.scale
  const out: DimensionLayout[] = []
  const pending: { base: Omit<DimensionLayout, 'dist'>; dist0: number }[] = []

  for (const d of dims) {
    const seg = measuredSegment(d, walls)
    if (!seg) continue
    const length = distance(seg.a, seg.b)
    if (length < 1e-6) continue
    const dir = normalize(sub(seg.b, seg.a))
    const L = perp(dir)
    const faceGap = seg.thickness / 2 + 2 * hair

    if (d.offset !== null) {
      // Posição definida pelo usuário (arrastando a cota).
      const side = d.offset >= 0 ? 1 : -1
      out.push({
        id: d.id,
        layerId: d.layerId,
        p1: seg.a,
        p2: seg.b,
        dir,
        n: mul(L, side),
        dist: Math.abs(d.offset),
        gap: Math.min(faceGap, Math.abs(d.offset)),
        length,
        auto: false
      })
      continue
    }

    const side = d.kind === 'wall' ? (sides.get(d.wallId) ?? preferredSide(dir)) : preferredSide(dir)
    const base = { id: d.id, layerId: d.layerId, p1: seg.a, p2: seg.b, dir, n: mul(L, side), gap: faceGap, length, auto: true }
    if (opts.style === 'linear') {
      out.push({ ...base, dist: 0, gap: 0 }) // sobre o eixo da parede, sem escalonar
    } else {
      pending.push({ base, dist0: seg.thickness / 2 + opts.offsetPx * hair })
    }
  }

  // Escalonamento: maiores primeiro (ficam mais perto da parede), depois as menores.
  pending.sort((x, y) => y.base.length - x.base.length)
  const placed: DimensionLayout[] = [...out]
  for (const { base, dist0 } of pending) {
    let level = 0
    let candidate: DimensionLayout = { ...base, dist: dist0 }
    while (level < MAX_LEVELS && placed.some((o) => collides(candidate, o, hair))) {
      level++
      candidate = { ...base, dist: dist0 + level * STEP_PX * hair }
    }
    placed.push(candidate)
  }
  return placed
}

/** Duas linhas de cota paralelas, próximas e com sobreposição ao longo da direção. */
function collides(a: DimensionLayout, b: DimensionLayout, hair: number): boolean {
  const cross = a.dir.x * b.dir.y - a.dir.y * b.dir.x
  if (Math.abs(cross) > 0.03) return false
  const qa = add(a.p1, mul(a.n, a.dist))
  const qb1 = add(b.p1, mul(b.n, b.dist))
  const qb2 = add(b.p2, mul(b.n, b.dist))
  const rel = sub(qb1, qa)
  const perpDist = Math.abs(a.dir.x * rel.y - a.dir.y * rel.x)
  if (perpDist > MIN_GAP_PX * hair) return false
  const t1 = rel.x * a.dir.x + rel.y * a.dir.y
  const rel2 = sub(qb2, qa)
  const t2 = rel2.x * a.dir.x + rel2.y * a.dir.y
  const lo = Math.max(0, Math.min(t1, t2))
  const hi = Math.min(a.length, Math.max(t1, t2))
  return hi - lo > 4 * hair
}

// ----------------------------------------------------------------- ângulos

export interface CornerAngle {
  at: Point
  /** Direções unitárias do canto para cada parede. */
  d1: Point
  d2: Point
  degrees: number
}

/** Ângulos entre pares de paredes que se encontram pelas extremidades (cantos em L/V). */
export function cornerAngles(walls: WallObject[], mode: CornerAngleMode): CornerAngle[] {
  if (mode === 'off') return []
  const groups: { at: Point; dirs: Point[] }[] = []
  for (const w of walls) {
    for (const [p, other] of [
      [w.a, w.b],
      [w.b, w.a]
    ] as const) {
      const g = groups.find((x) => samePoint(x.at, p, 1))
      const dir = normalize(sub(other, p))
      if (g) g.dirs.push(dir)
      else groups.push({ at: p, dirs: [dir] })
    }
  }
  const result: CornerAngle[] = []
  for (const g of groups) {
    if (g.dirs.length !== 2) continue
    const [d1, d2] = g.dirs
    const degrees = (Math.acos(Math.max(-1, Math.min(1, d1.x * d2.x + d1.y * d2.y))) * 180) / Math.PI
    if (degrees > 179.5 || degrees < 0.5) continue
    if (mode === 'non-right' && Math.abs(degrees - 90) < 0.5) continue
    result.push({ at: g.at, d1, d2, degrees })
  }
  return result
}
