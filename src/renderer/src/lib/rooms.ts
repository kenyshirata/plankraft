/**
 * Grafo planar das paredes + detecção automática de cômodos.
 *
 * `planarFaces(walls)`:
 *  1. Quebra os eixos das paredes em todas as interseções (inclui encontros em T).
 *  2. Funde vértices próximos e monta um grafo não direcionado.
 *  3. Remove "pontas soltas" (vértices de grau 1) repetidamente.
 *  4. Percorre as faces: em cada vértice segue para a aresta vizinha na ordem
 *     angular — cada aresta direcionada pertence a exatamente uma face.
 *     Com a regra usada, faces INTERNAS têm área com sinal positiva e a face
 *     externa (contorno do conjunto) tem área negativa.
 *
 * `detectRoomAt(ponto)`: menor face que contém o ponto, com recuo (inset) de
 * espessura/2 em cada aresta → polígono de ÁREA ÚTIL.
 */
import type { Point, WallObject } from '@shared/model'
import { distance, lineIntersection, normalize, pointInPolygon, signedArea, sub } from './geometry'

const MERGE_EPS = 1 // cm

interface Edge {
  u: number
  v: number
  thickness: number
}

export interface PlanarFace {
  ring: number[]
  poly: Point[]
  /** Área com sinal (cm²). > 0 = face interna. */
  area: number
}

export interface PlanarGraph {
  nodes: Point[]
  faces: PlanarFace[]
  thicknessOf(a: number, b: number): number
}

export function planarFaces(walls: WallObject[]): PlanarGraph {
  const nodes: Point[] = []
  const thick = new Map<string, number>()
  const empty: PlanarGraph = { nodes, faces: [], thicknessOf: () => 15 }
  if (walls.length < 3) return empty

  // 1) Parâmetros de corte de cada parede.
  const cuts: number[][] = walls.map(() => [0, 1])
  for (let i = 0; i < walls.length; i++) {
    const wi = walls[i]
    const di = sub(wi.b, wi.a)
    const li = distance(wi.a, wi.b)
    if (li === 0) continue
    for (let j = i + 1; j < walls.length; j++) {
      const wj = walls[j]
      const dj = sub(wj.b, wj.a)
      const lj = distance(wj.a, wj.b)
      if (lj === 0) continue
      const den = di.x * dj.y - di.y * dj.x
      if (Math.abs(den) < 1e-9) continue // paralelas/colineares
      const t = ((wj.a.x - wi.a.x) * dj.y - (wj.a.y - wi.a.y) * dj.x) / den
      const s = ((wj.a.x - wi.a.x) * di.y - (wj.a.y - wi.a.y) * di.x) / den
      const ei = MERGE_EPS / li
      const ej = MERGE_EPS / lj
      if (t >= -ei && t <= 1 + ei && s >= -ej && s <= 1 + ej) {
        cuts[i].push(Math.min(1, Math.max(0, t)))
        cuts[j].push(Math.min(1, Math.max(0, s)))
      }
    }
  }

  // 2) Vértices fundidos + arestas.
  const nodeOf = (p: Point): number => {
    const found = nodes.findIndex((n) => distance(n, p) <= MERGE_EPS)
    if (found >= 0) return found
    nodes.push(p)
    return nodes.length - 1
  }
  const edgeMap = new Map<string, Edge>()
  walls.forEach((w, i) => {
    const ts = [...new Set(cuts[i].map((t) => Math.round(t * 1e6) / 1e6))].sort((x, y) => x - y)
    let prev = nodeOf(w.a)
    for (let k = 1; k < ts.length; k++) {
      const p = { x: w.a.x + (w.b.x - w.a.x) * ts[k], y: w.a.y + (w.b.y - w.a.y) * ts[k] }
      const cur = nodeOf(p)
      if (cur !== prev) {
        const key = prev < cur ? `${prev}-${cur}` : `${cur}-${prev}`
        const existing = edgeMap.get(key)
        if (!existing || existing.thickness < w.thickness) edgeMap.set(key, { u: prev, v: cur, thickness: w.thickness })
      }
      prev = cur
    }
  })

  // 3) Remove pontas soltas.
  let edges = [...edgeMap.values()]
  for (;;) {
    const degree = new Map<number, number>()
    for (const e of edges) {
      degree.set(e.u, (degree.get(e.u) ?? 0) + 1)
      degree.set(e.v, (degree.get(e.v) ?? 0) + 1)
    }
    const next = edges.filter((e) => degree.get(e.u)! > 1 && degree.get(e.v)! > 1)
    if (next.length === edges.length) break
    edges = next
  }
  if (edges.length < 3) return empty

  // Adjacência ordenada por ângulo + espessura por aresta.
  const adj = new Map<number, number[]>()
  for (const e of edges) {
    adj.set(e.u, [...(adj.get(e.u) ?? []), e.v])
    adj.set(e.v, [...(adj.get(e.v) ?? []), e.u])
    thick.set(`${e.u}-${e.v}`, e.thickness)
    thick.set(`${e.v}-${e.u}`, e.thickness)
  }
  const angle = (from: number, to: number): number =>
    Math.atan2(nodes[to].y - nodes[from].y, nodes[to].x - nodes[from].x)
  for (const [n, list] of adj) list.sort((p, q) => angle(n, p) - angle(n, q))

  // 4) Faces.
  const faces: PlanarFace[] = []
  const visited = new Set<string>()
  for (const e of edges) {
    for (const [s, t] of [
      [e.u, e.v],
      [e.v, e.u]
    ]) {
      if (visited.has(`${s}-${t}`)) continue
      const ring: number[] = []
      let u = s
      let v = t
      let guard = 0
      while (!visited.has(`${u}-${v}`) && guard++ < 10000) {
        visited.add(`${u}-${v}`)
        ring.push(u)
        const list = adj.get(v)!
        const idx = list.indexOf(u)
        const w = list[(idx - 1 + list.length) % list.length]
        u = v
        v = w
      }
      if (ring.length < 3) continue
      const poly = ring.map((i) => nodes[i])
      faces.push({ ring, poly, area: signedArea(poly) })
    }
  }

  return { nodes, faces, thicknessOf: (a, b) => thick.get(`${a}-${b}`) ?? 15 }
}

export interface DetectedRoom {
  /** Polígono de área útil (inset). */
  points: Point[]
  /** Polígono pelo eixo das paredes. */
  centerline: Point[]
}

export function detectRoomAt(click: Point, walls: WallObject[], graph = planarFaces(walls)): DetectedRoom | null {
  const { nodes, thicknessOf } = graph
  // 5) Menor face que contém o clique.
  let best: PlanarFace | null = null
  for (const f of graph.faces) {
    const area = Math.abs(f.area)
    if (area > 1 && pointInPolygon(click, f.poly) && (!best || area < Math.abs(best.area))) best = f
  }
  if (!best) return null

  // Simplifica vértices colineares com mesma espessura.
  let ring = best.ring
  for (let changed = true; changed && ring.length > 3; ) {
    changed = false
    for (let i = 0; i < ring.length; i++) {
      const p = ring[(i - 1 + ring.length) % ring.length]
      const c = ring[i]
      const n = ring[(i + 1) % ring.length]
      const d1 = normalize(sub(nodes[c], nodes[p]))
      const d2 = normalize(sub(nodes[n], nodes[c]))
      const collinear = Math.abs(d1.x * d2.y - d1.y * d2.x) < 1e-6 && d1.x * d2.x + d1.y * d2.y > 0
      if (collinear && thicknessOf(p, c) === thicknessOf(c, n)) {
        ring = ring.filter((_, k) => k !== i)
        changed = true
        break
      }
    }
  }

  const centerline = ring.map((i) => nodes[i])
  return { centerline, points: insetPolygon(ring, nodes, thicknessOf) ?? centerline }
}

/** Recua cada aresta para dentro em espessura/2. Retorna null se o resultado degenerar. */
function insetPolygon(ring: number[], nodes: Point[], thicknessOf: (a: number, b: number) => number): Point[] | null {
  const pts = ring.map((i) => nodes[i])
  const s = signedArea(pts)
  const n = pts.length
  const lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n]
    const d = normalize(sub(q, p))
    // Interior fica à "esquerda" (-dy, dx) quando a área com sinal é positiva.
    const inward = s > 0 ? { x: -d.y, y: d.x } : { x: d.y, y: -d.x }
    const off = thicknessOf(ring[i], ring[(i + 1) % n]) / 2
    return { p: { x: p.x + inward.x * off, y: p.y + inward.y * off }, d }
  })
  const out = lines.map((cur, i) => {
    const prev = lines[(i - 1 + n) % n]
    return lineIntersection(prev.p, prev.d, cur.p, cur.d) ?? cur.p
  })
  const s2 = signedArea(out)
  if (Math.sign(s2) !== Math.sign(s) || Math.abs(s2) >= Math.abs(s)) return null
  return out
}
