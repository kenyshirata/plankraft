/**
 * Geometria de portas e janelas hospedadas em paredes.
 */
import type { OpeningObject, Point, WallObject } from '@shared/model'
import { add, distance, mul, normalize, perp, projectOnSegment, sub } from './geometry'

/** Folga mínima (cm) entre a abertura e as pontas da parede. */
export const OPENING_MARGIN = 5

export interface OpeningGeometry {
  /** Centro do vão no eixo da parede. */
  center: Point
  /** Direção unitária da parede (a→b). */
  dir: Point
  /** Normal unitária à esquerda de a→b. */
  normal: Point
  /** Extremidades do vão no eixo (lado de `a` e lado de `b`). */
  start: Point
  end: Point
  width: number
  thickness: number
  /** Ângulo da parede em graus. */
  angle: number
}

/** Limita o centro da abertura para que ela caiba inteira na parede. */
export function clampOffset(offset: number, width: number, wallLength: number): number {
  const min = width / 2 + OPENING_MARGIN
  const max = wallLength - width / 2 - OPENING_MARGIN
  return min > max ? wallLength / 2 : Math.min(max, Math.max(min, offset))
}

export function openingGeometry(o: Pick<OpeningObject, 'offset' | 'width'>, wall: WallObject): OpeningGeometry {
  const len = distance(wall.a, wall.b)
  const dir = normalize(sub(wall.b, wall.a))
  const width = Math.min(o.width, Math.max(1, len - 2 * OPENING_MARGIN))
  const center = add(wall.a, mul(dir, clampOffset(o.offset, width, len)))
  return {
    center,
    dir,
    normal: perp(dir),
    start: sub(center, mul(dir, width / 2)),
    end: add(center, mul(dir, width / 2)),
    width,
    thickness: wall.thickness,
    angle: (Math.atan2(dir.y, dir.x) * 180) / Math.PI
  }
}

/** Cantos do retângulo do vão (para hit-test e para "recortar" a parede). */
export function openingRectPoints(g: OpeningGeometry, extraThickness = 0): number[] {
  const h = g.thickness / 2 + extraThickness
  const n = mul(g.normal, h)
  const pts = [add(g.start, n), add(g.end, n), sub(g.end, n), sub(g.start, n)]
  return pts.flatMap((p) => [p.x, p.y])
}

export interface WallHit {
  wall: WallObject
  /** Posição ao longo da parede (cm, a partir de `a`). */
  t: number
  side: 1 | -1
  dist: number
}

/** Parede mais próxima do ponto (dentro de `maxDist` além da meia espessura). */
export function nearestWall(p: Point, walls: WallObject[], maxDist: number): WallHit | null {
  let best: WallHit | null = null
  for (const wall of walls) {
    const len = distance(wall.a, wall.b)
    const pr = projectOnSegment(p, wall.a, wall.b)
    if (pr.t < 0 || pr.t > len) continue
    const limit = wall.thickness / 2 + maxDist
    if (pr.dist <= limit && (!best || pr.dist < best.dist)) best = { wall, t: pr.t, side: pr.side, dist: pr.dist }
  }
  return best
}
