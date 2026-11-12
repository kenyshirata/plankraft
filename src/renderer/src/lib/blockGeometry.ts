/**
 * Geometria de blocos: matriz da instância, cantos, encaixe em paredes e
 * conversão de objetos do desenho em formas de bloco ("Salvar como bloco").
 */
import type { BlockDef, BlockShape } from '@shared/blocks'
import type { BlockObject, PlanObject, Point, WallObject } from '@shared/model'
import { add, distance, mul, normalize, perp, projectOnSegment, sub } from './geometry'
import { openingGeometry } from './openings'

/** Matriz afim [a, b, c, d, e, f]: x' = a·x + c·y + e ; y' = b·x + d·y + f */
export type Matrix = [number, number, number, number, number, number]

export const apply = (m: Matrix, p: Point): Point => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] })

/** Local (cm do símbolo) → mundo, igual ao Group do Konva (x,y,rotation,scale,offset). */
export function instanceMatrix(o: Pick<BlockObject, 'position' | 'rotation' | 'scaleX' | 'scaleY' | 'flipX' | 'flipY'>, def: Pick<BlockDef, 'width' | 'height'>): Matrix {
  const t = (o.rotation * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const sx = o.scaleX * (o.flipX ? -1 : 1)
  const sy = o.scaleY * (o.flipY ? -1 : 1)
  const a = cos * sx
  const b = sin * sx
  const c = -sin * sy
  const d = cos * sy
  const cx = def.width / 2
  const cy = def.height / 2
  return [a, b, c, d, o.position.x - a * cx - c * cy, o.position.y - b * cx - d * cy]
}

export function blockCorners(o: BlockObject, def: BlockDef): Point[] {
  const m = instanceMatrix(o, def)
  return [
    { x: 0, y: 0 },
    { x: def.width, y: 0 },
    { x: def.width, y: def.height },
    { x: 0, y: def.height }
  ].map((p) => apply(m, p))
}

// ------------------------------------------------------------ encaixe em parede

/**
 * Se o bloco estiver perto de uma parede, gira-o para que o "fundo" (lado Y=0
 * do símbolo, ou Y=altura se espelhado na vertical) encoste na face da parede
 * e o posiciona colado a ela. Retorna null se nenhuma parede estiver perto.
 */
export function snapBlockToWalls(
  inst: Pick<BlockObject, 'position' | 'rotation' | 'scaleX' | 'scaleY' | 'flipX' | 'flipY'>,
  def: BlockDef,
  walls: WallObject[],
  maxGap: number
): { position: Point; rotation: number } | null {
  const depth = def.height * inst.scaleY
  let best: { position: Point; rotation: number; err: number } | null = null
  for (const w of walls) {
    const len = distance(w.a, w.b)
    if (len < 1) continue
    const pr = projectOnSegment(inst.position, w.a, w.b)
    if (pr.t < 0 || pr.t > len) continue
    const target = w.thickness / 2 + depth / 2
    // Folga entre o fundo do bloco e a face da parede (negativa = invadindo a parede).
    const gap = pr.dist - target
    // Gruda se estiver a até `maxGap` da parede, ou invadindo-a em até 60% da profundidade (é empurrado para fora).
    if (gap > maxGap || gap < -depth * 0.6) continue
    const err = Math.abs(gap)
    if (best && err >= best.err) continue
    const dir = normalize(sub(w.b, w.a))
    const n = mul(perp(dir), pr.side) // da parede para o bloco
    // "Fundo" do símbolo aponta para a parede: up_local = (0,-1) (ou (0,1) se espelhado).
    const rotation = inst.flipY ? (Math.atan2(n.x, -n.y) * 180) / Math.PI : (Math.atan2(-n.x, n.y) * 180) / Math.PI
    const along = add(w.a, mul(dir, pr.t))
    best = { position: add(along, mul(n, target)), rotation: Math.round((((rotation % 360) + 360) % 360) * 100) / 100, err }
  }
  return best && { position: best.position, rotation: best.rotation }
}

// ------------------------------------------------------- transformação de formas

const scaleOf = (m: Matrix): [number, number] => [Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])]
const rotOf = (m: Matrix): number => (Math.atan2(m[1], m[0]) * 180) / Math.PI

/** Aplica a matriz a uma forma (retângulos girados viram polígonos; arcos viram polilinhas). */
export function transformShape(s: BlockShape, m: Matrix): BlockShape {
  const style = { fill: s.fill, dash: s.dash, weight: s.weight }
  switch (s.kind) {
    case 'rect': {
      if (Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9) {
        const p1 = apply(m, { x: s.x, y: s.y })
        const p2 = apply(m, { x: s.x + s.w, y: s.y + s.h })
        const [kx, ky] = scaleOf(m)
        return { ...style, kind: 'rect', x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y), r: s.r ? s.r * Math.min(kx, ky) : undefined }
      }
      const pts = [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y },
        { x: s.x + s.w, y: s.y + s.h },
        { x: s.x, y: s.y + s.h }
      ].flatMap((p) => {
        const q = apply(m, p)
        return [q.x, q.y]
      })
      return { ...style, kind: 'poly', points: pts, closed: true }
    }
    case 'ellipse': {
      const c = apply(m, { x: s.cx, y: s.cy })
      const [kx, ky] = scaleOf(m)
      return { ...style, kind: 'ellipse', cx: c.x, cy: c.y, rx: s.rx * kx, ry: s.ry * ky, rotation: (s.rotation ?? 0) + rotOf(m) }
    }
    case 'poly': {
      const pts: number[] = []
      for (let i = 0; i < s.points.length; i += 2) {
        const q = apply(m, { x: s.points[i], y: s.points[i + 1] })
        pts.push(q.x, q.y)
      }
      return { ...style, kind: 'poly', points: pts, closed: s.closed }
    }
    case 'arc': {
      const pts: number[] = []
      const steps = 24
      for (let i = 0; i <= steps; i++) {
        const ang = ((s.start + ((s.end - s.start) * i) / steps) * Math.PI) / 180
        const q = apply(m, { x: s.cx + Math.cos(ang) * s.r, y: s.cy + Math.sin(ang) * s.r })
        pts.push(q.x, q.y)
      }
      return { ...style, kind: 'poly', points: pts, closed: false, fill: 'none' }
    }
    case 'text': {
      const p = apply(m, { x: s.x, y: s.y })
      return { ...s, x: p.x, y: p.y, size: s.size * scaleOf(m)[1], rotation: (s.rotation ?? 0) + rotOf(m) }
    }
  }
}

function shapePoints(s: BlockShape): Point[] {
  switch (s.kind) {
    case 'rect':
      return [
        { x: s.x, y: s.y },
        { x: s.x + s.w, y: s.y + s.h }
      ]
    case 'ellipse': {
      const r = Math.max(s.rx, s.ry)
      return [
        { x: s.cx - r, y: s.cy - r },
        { x: s.cx + r, y: s.cy + r }
      ]
    }
    case 'poly': {
      const out: Point[] = []
      for (let i = 0; i < s.points.length; i += 2) out.push({ x: s.points[i], y: s.points[i + 1] })
      return out
    }
    case 'arc':
      return [
        { x: s.cx - s.r, y: s.cy - s.r },
        { x: s.cx + s.r, y: s.cy + s.r }
      ]
    case 'text':
      return [
        { x: s.x - (s.align === 'center' ? (s.text.length * s.size * 0.6) / 2 : 0), y: s.y },
        { x: s.x + s.text.length * s.size * 0.6, y: s.y + s.size * 1.2 }
      ]
  }
}

const translate = (dx: number, dy: number): Matrix => [1, 0, 0, 1, dx, dy]

// --------------------------------------------------- objetos → formas de bloco

/**
 * Converte objetos do desenho em formas vetoriais, em coordenadas de mundo.
 * Cotas são ignoradas (dependem da escala/zoom). Retorna também quantos objetos
 * foram ignorados.
 */
export function objectsToShapes(
  objects: PlanObject[],
  walls: Map<string, WallObject>,
  resolve: (id: string) => BlockDef | undefined
): { shapes: BlockShape[]; skipped: number } {
  const shapes: BlockShape[] = []
  let skipped = 0
  for (const o of objects) {
    switch (o.type) {
      case 'wall': {
        const n = mul(perp(normalize(sub(o.b, o.a))), o.thickness / 2)
        const pts = [add(o.a, n), add(o.b, n), sub(o.b, n), sub(o.a, n)].flatMap((p) => [p.x, p.y])
        shapes.push({ kind: 'poly', points: pts, closed: true, fill: 'ink', weight: 0 })
        break
      }
      case 'room':
        shapes.push({ kind: 'poly', points: o.points.flatMap((p) => [p.x, p.y]), closed: true, fill: 'fill', weight: 0.6, dash: true })
        break
      case 'text':
        shapes.push({ kind: 'text', x: o.position.x, y: o.position.y, text: o.text, size: o.fontSize, rotation: o.rotation || undefined, fill: 'ink' })
        break
      case 'door':
      case 'window': {
        const wall = walls.get(o.wallId)
        if (!wall) {
          skipped++
          break
        }
        const g = openingGeometry(o, wall)
        const h = mul(g.normal, g.thickness / 2)
        if (o.type === 'window') {
          const pts = [add(g.start, h), add(g.end, h), sub(g.end, h), sub(g.start, h)].flatMap((p) => [p.x, p.y])
          shapes.push({ kind: 'poly', points: pts, closed: true, fill: 'none' }, { kind: 'poly', points: [g.start.x, g.start.y, g.end.x, g.end.y], fill: 'none' })
        } else {
          const face = mul(g.normal, (o.side * g.thickness) / 2)
          const hinge = add(o.hinge === 'start' ? g.start : g.end, face)
          const free = add(o.hinge === 'start' ? g.end : g.start, face)
          const leaf = add(hinge, mul(g.normal, o.side * g.width))
          shapes.push({ kind: 'poly', points: [hinge.x, hinge.y, leaf.x, leaf.y], fill: 'none', weight: 1.4 })
          const a0 = Math.atan2(leaf.y - hinge.y, leaf.x - hinge.x)
          let delta = Math.atan2(free.y - hinge.y, free.x - hinge.x) - a0
          while (delta > Math.PI) delta -= 2 * Math.PI
          while (delta < -Math.PI) delta += 2 * Math.PI
          shapes.push({ kind: 'arc', cx: hinge.x, cy: hinge.y, r: g.width, start: (a0 * 180) / Math.PI, end: ((a0 + delta) * 180) / Math.PI, fill: 'none', dash: true, weight: 0.7 })
        }
        break
      }
      case 'block': {
        const def = resolve(o.blockId)
        if (!def) {
          skipped++
          break
        }
        const m = instanceMatrix(o, def)
        for (const s of def.shapes) shapes.push(transformShape(s, m))
        break
      }
      default:
        skipped++ // cotas
    }
  }
  return { shapes, skipped }
}

/** Normaliza as formas para a caixa 0..w × 0..h e devolve as dimensões. */
export function normalizeShapes(shapes: BlockShape[]): { shapes: BlockShape[]; width: number; height: number; origin: Point } {
  const pts = shapes.flatMap(shapePoints)
  const minX = Math.min(...pts.map((p) => p.x))
  const minY = Math.min(...pts.map((p) => p.y))
  const maxX = Math.max(...pts.map((p) => p.x))
  const maxY = Math.max(...pts.map((p) => p.y))
  const m = translate(-minX, -minY)
  return {
    shapes: shapes.map((s) => transformShape(s, m)),
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    origin: { x: minX, y: minY }
  }
}
