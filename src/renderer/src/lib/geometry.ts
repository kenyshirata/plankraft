/**
 * Utilitários de geometria 2D (puros, sem dependência de React/Konva).
 * Todas as coordenadas em unidades de mundo (cm).
 */
import type { Point } from '@shared/model'

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
export const mul = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k })
export const length = (a: Point): number => Math.hypot(a.x, a.y)
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y
export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)
export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
/** Vetor perpendicular (rotação de +90° no sistema com Y para baixo). */
export const perp = (a: Point): Point => ({ x: -a.y, y: a.x })

export function normalize(a: Point): Point {
  const l = length(a)
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}

/** Ângulo do segmento a→b em graus, no intervalo (-180, 180]. */
export const angleDeg = (a: Point, b: Point): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI

export const samePoint = (a: Point, b: Point, eps = 0.5): boolean => distance(a, b) <= eps

/** Distância de um ponto a um segmento. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a)
  const len2 = ab.x * ab.x + ab.y * ab.y
  if (len2 === 0) return distance(p, a)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / len2))
  return distance(p, { x: a.x + ab.x * t, y: a.y + ab.y * t })
}

export function snapToGrid(p: Point, step: number): Point {
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }
}

/**
 * Trava o ponto `p` ao ângulo múltiplo de `stepDeg` mais próximo, a partir de `origin`
 * (usado com Shift: 0°, 45°, 90°...). Se `lengthStep` for informado, o comprimento
 * também é arredondado (para combinar com o grid).
 */
export function lockToAngle(origin: Point, p: Point, stepDeg: number, lengthStep?: number): Point {
  let d = distance(origin, p)
  if (lengthStep) d = Math.round(d / lengthStep) * lengthStep
  const ang = (Math.round(angleDeg(origin, p) / stepDeg) * stepDeg * Math.PI) / 180
  return { x: origin.x + Math.cos(ang) * d, y: origin.y + Math.sin(ang) * d }
}

/**
 * Converte um ângulo (graus) numa rotação de texto sempre legível: o texto nunca
 * fica de cabeça para baixo. Resultado em [-90, 90). Paredes verticais produzem
 * -90° (texto lido de baixo para cima, convenção de desenho técnico).
 */
export function readableAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360
  if (a >= 90 && a < 270) return a - 180
  if (a >= 270) return a - 360
  return a
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Retângulo normalizado (largura/altura positivas) a partir de dois cantos. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

export const pointInRect = (p: Point, r: Rect): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
}

export function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = cross(q1, q2, p1)
  const d2 = cross(q1, q2, p2)
  const d3 = cross(p1, p2, q1)
  const d4 = cross(p1, p2, q2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

/** Verdadeiro se o segmento toca o retângulo (seleção por área estilo Figma). */
export function segmentIntersectsRect(a: Point, b: Point, r: Rect): boolean {
  if (pointInRect(a, r) || pointInRect(b, r)) return true
  const tl = { x: r.x, y: r.y }
  const tr = { x: r.x + r.width, y: r.y }
  const br = { x: r.x + r.width, y: r.y + r.height }
  const bl = { x: r.x, y: r.y + r.height }
  return (
    segmentsIntersect(a, b, tl, tr) ||
    segmentsIntersect(a, b, tr, br) ||
    segmentsIntersect(a, b, br, bl) ||
    segmentsIntersect(a, b, bl, tl)
  )
}

/**
 * Projeta `p` na reta do segmento a→b.
 * `t` = posição ao longo do segmento em cm (a partir de `a`, não limitada);
 * `dist` = distância perpendicular; `side` = +1 se p está à esquerda de a→b.
 */
export function projectOnSegment(p: Point, a: Point, b: Point): { t: number; dist: number; side: 1 | -1 } {
  const len = distance(a, b)
  if (len === 0) return { t: 0, dist: distance(p, a), side: 1 }
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }
  const rel = sub(p, a)
  const t = rel.x * dir.x + rel.y * dir.y
  const c = dir.x * rel.y - dir.y * rel.x // produto vetorial
  return { t, dist: Math.abs(c), side: c >= 0 ? 1 : -1 }
}

/** Área com sinal (fórmula do laço). Positiva = sentido horário na tela (Y para baixo). */
export function signedArea(points: Point[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    s += p.x * q.y - q.x * p.y
  }
  return s / 2
}

export const polygonArea = (points: Point[]): number => Math.abs(signedArea(points))

export function polygonPerimeter(points: Point[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) s += distance(points[i], points[(i + 1) % points.length])
  return s
}

/** Centroide de área do polígono (cai para a média dos vértices se degenerado). */
export function polygonCentroid(points: Point[]): Point {
  const a = signedArea(points)
  if (Math.abs(a) < 1e-6) {
    const n = points.length || 1
    return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

/** Ponto dentro de polígono (ray casting). */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Interseção de duas retas infinitas (p1 + t·d1, p2 + s·d2); null se paralelas. */
export function lineIntersection(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const den = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t }
}

/** Polígono toca o retângulo (vértice dentro, aresta cruzando, ou retângulo dentro do polígono). */
export function polygonIntersectsRect(poly: Point[], r: Rect): boolean {
  for (let i = 0; i < poly.length; i++) {
    if (segmentIntersectsRect(poly[i], poly[(i + 1) % poly.length], r)) return true
  }
  return pointInPolygon({ x: r.x, y: r.y }, poly)
}

/** Caixa envolvente de uma lista de pontos (null se vazia). */
export function boundsOf(points: Point[]): Rect | null {
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
