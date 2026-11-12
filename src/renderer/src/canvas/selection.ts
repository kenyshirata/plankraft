import type { Id, PlanObject, TextObject, WallObject } from '@shared/model'
import {
  pointInRect,
  polygonIntersectsRect,
  rectFromPoints,
  segmentIntersectsRect,
  type Rect
} from '@renderer/lib/geometry'
import { openingGeometry } from '@renderer/lib/openings'
import { measuredSegment } from '@renderer/lib/dimensions'
import { blockCorners } from '@renderer/lib/blockGeometry'
import { imageCorners } from '@renderer/lib/imageGeometry'
import type { BlockDef } from '@shared/blocks'

/** Caixa aproximada de um texto (sem rotação), em cm. */
export function textBounds(t: TextObject): Rect {
  const lines = t.text.split('\n')
  const longest = Math.max(1, ...lines.map((l) => l.length))
  return { x: t.position.x, y: t.position.y, width: longest * t.fontSize * 0.55, height: lines.length * t.fontSize * 1.2 }
}

const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height

/** Verdadeiro se o objeto toca o retângulo de seleção (estilo Figma: basta encostar). */
export function objectHitsRect(
  o: PlanObject,
  r: Rect,
  walls: Map<Id, WallObject>,
  resolve: (blockId: string) => BlockDef | undefined
): boolean {
  switch (o.type) {
    case 'wall':
      return segmentIntersectsRect(o.a, o.b, r)
    case 'room':
      return polygonIntersectsRect(o.points, r)
    case 'text':
      return rectsOverlap(textBounds(o), r)
    case 'dimension': {
      const seg = measuredSegment(o, walls)
      return seg ? segmentIntersectsRect(seg.a, seg.b, r) : false
    }
    case 'image':
      return polygonIntersectsRect(imageCorners(o), r)
    case 'block': {
      const def = resolve(o.blockId)
      return def ? polygonIntersectsRect(blockCorners(o, def), r) : pointInRect(o.position, r)
    }
    default: {
      const wall = walls.get(o.wallId)
      if (!wall) return false
      const g = openingGeometry(o, wall)
      return segmentIntersectsRect(g.start, g.end, r) || rectsOverlap(rectFromPoints(g.start, g.end), r)
    }
  }
}
