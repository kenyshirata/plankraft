import type { Id, Point, WallObject } from '@shared/model'
import { add, distanceToSegment, mul, normalize, sub } from '@renderer/lib/geometry'

export interface WallRenderGeometry {
  a: Point
  b: Point
  dir: Point
}

const JOIN_EPS = 0.5 // cm

/**
 * Calcula os pontos de desenho de cada parede.
 *
 * As paredes são desenhadas como linhas grossas com "butt cap". Para que cantos
 * (L) e encontros (T) fiquem fechados, a extremidade que toca outra parede é
 * estendida em espessura/2. Extremidades livres não são estendidas, de modo que
 * o comprimento visível bate com a cota (medida no eixo).
 *
 * O(n²) — suficiente para plantas residenciais (centenas de paredes). Se
 * necessário, trocar por um índice espacial (grid hash) no futuro.
 */
export function computeWallGeometry(walls: WallObject[]): Map<Id, WallRenderGeometry> {
  const result = new Map<Id, WallRenderGeometry>()
  for (const w of walls) {
    const dir = normalize(sub(w.b, w.a))
    const touches = (p: Point): boolean =>
      walls.some((o) => o.id !== w.id && distanceToSegment(p, o.a, o.b) <= JOIN_EPS)
    const ext = w.thickness / 2
    result.set(w.id, {
      a: touches(w.a) ? sub(w.a, mul(dir, ext)) : w.a,
      b: touches(w.b) ? add(w.b, mul(dir, ext)) : w.b,
      dir
    })
  }
  return result
}

/** Retorna [x1, y1, x2, y2] estendido em `extra` nas duas pontas (para o contorno). */
export function extendedPoints(g: WallRenderGeometry, extra: number): number[] {
  const a = sub(g.a, mul(g.dir, extra))
  const b = add(g.b, mul(g.dir, extra))
  return [a.x, a.y, b.x, b.y]
}
