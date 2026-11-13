/**
 * Escadas paramétricas (reta, em L e em U).
 *
 * Os parâmetros ficam codificados no próprio id do bloco
 * (`builtin:stair~L~90~17~25~right`), então toda a infraestrutura de blocos
 * (inserir, mover, girar, espelhar, salvar, copiar) vale sem mudanças: trocar
 * a largura, o número de degraus etc. é só trocar o id da instância.
 *
 * Convenção do símbolo (coordenadas locais, cm, y para baixo): a subida começa
 * na base (y grande) e segue em direção a y = 0; `turn` espelha o desenho.
 * Todos os degraus são retângulos alinhados aos eixos.
 */
import type { BlockDef, BlockShape } from './blocks'

export type StairShape = 'straight' | 'L' | 'U'
export type StairTurn = 'left' | 'right'

export interface StairParams {
  shape: StairShape
  /** Largura do lance (cm). */
  width: number
  /** Número de degraus (espelhos) de piso a piso; o último "degrau" é o próprio piso de cima. */
  steps: number
  /** Profundidade do piso do degrau (cm). */
  tread: number
  /** Para onde curva (L e U). */
  turn: StairTurn
}

export const STAIR_ID_PREFIX = 'builtin:stair~'
export const STAIR_LIMITS = { width: [60, 300], steps: [3, 40], tread: [18, 40] } as const
const U_GAP = 8

export const DEFAULT_STAIR: StairParams = { shape: 'straight', width: 90, steps: 17, tread: 25, turn: 'right' }

/** Ids antigos (escada reta/larga em tamanho fixo) → parâmetros equivalentes. */
const LEGACY: Record<string, StairParams> = {
  'builtin:stair-straight': DEFAULT_STAIR,
  'builtin:stair-wide': { ...DEFAULT_STAIR, width: 120 }
}

const SHAPES: StairShape[] = ['straight', 'L', 'U']
const clamp = (v: number, [lo, hi]: readonly [number, number]): number => Math.min(hi, Math.max(lo, v))
const num = (n: number): string => String(Math.round(n * 10) / 10)

export function clampStair(p: StairParams): StairParams {
  const minSteps = p.shape === 'straight' ? 3 : 5
  return {
    shape: SHAPES.includes(p.shape) ? p.shape : 'straight',
    width: Math.round(clamp(p.width, STAIR_LIMITS.width)),
    steps: Math.round(Math.max(minSteps, clamp(p.steps, STAIR_LIMITS.steps))),
    tread: Math.round(clamp(p.tread, STAIR_LIMITS.tread) * 10) / 10,
    turn: p.turn === 'left' ? 'left' : 'right'
  }
}

export const stairId = (p: StairParams): string => {
  const c = clampStair(p)
  return `${STAIR_ID_PREFIX}${c.shape}~${num(c.width)}~${c.steps}~${num(c.tread)}~${c.turn}`
}

export function parseStairId(id: string): StairParams | null {
  const legacy = LEGACY[id]
  if (legacy) return legacy
  if (!id.startsWith(STAIR_ID_PREFIX)) return null
  const [shape, w, n, t, turn] = id.slice(STAIR_ID_PREFIX.length).split('~')
  if (!SHAPES.includes(shape as StairShape)) return null
  const width = Number(w)
  const steps = Number(n)
  const tread = Number(t)
  if (![width, steps, tread].every(Number.isFinite)) return null
  return clampStair({ shape: shape as StairShape, width, steps, tread, turn: turn === 'left' ? 'left' : 'right' })
}

export const isStairId = (id: string): boolean => id.startsWith('builtin:stair')

export interface StairTread {
  x: number
  y: number
  w: number
  h: number
  /** 1 = primeiro degrau; o patamar conta como um degrau. Altura = nível × (pé-direito ÷ degraus). */
  level: number
}

export interface StairLayout {
  width: number
  height: number
  treads: StairTread[]
  /** Contorno (polígono, pontos x,y achatados) — também é o furo na laje de cima. */
  footprint: number[]
  /** Caminho da subida (polilinha x,y achatada). */
  path: number[]
}

export function stairLayout(raw: StairParams): StairLayout {
  const p = clampStair(raw)
  const { width: w, tread } = p
  const T = p.steps - 1 // degraus com piso (o último nível é o piso de cima)
  const treads: StairTread[] = []
  let W = w
  let H = 0
  let footprint: number[] = []
  let path: number[] = []

  if (p.shape === 'straight') {
    H = T * tread
    for (let k = 1; k <= T; k++) treads.push({ x: 0, y: H - k * tread, w, h: tread, level: k })
    footprint = [0, 0, W, 0, W, H, 0, H]
    path = [w / 2, H - 12, w / 2, 12]
  } else {
    const n1 = Math.floor((T - 1) / 2)
    const n2 = T - 1 - n1
    if (p.shape === 'L') {
      W = w + n2 * tread
      H = n1 * tread + w
      for (let k = 1; k <= n1; k++) treads.push({ x: 0, y: H - k * tread, w, h: tread, level: k })
      treads.push({ x: 0, y: 0, w, h: w, level: n1 + 1 })
      for (let j = 1; j <= n2; j++) treads.push({ x: w + (j - 1) * tread, y: 0, w: tread, h: w, level: n1 + 1 + j })
      footprint = [0, 0, W, 0, W, w, w, w, w, H, 0, H]
      path = [w / 2, H - 12, w / 2, w / 2, W - 12, w / 2]
    } else {
      W = 2 * w + U_GAP
      // No U o primeiro lance leva o degrau a mais (assim ele chega ao patamar, que fica no topo).
      const m1 = Math.ceil((T - 1) / 2)
      const m2 = T - 1 - m1
      H = w + m1 * tread
      for (let k = 1; k <= m1; k++) treads.push({ x: 0, y: H - k * tread, w, h: tread, level: k })
      treads.push({ x: 0, y: 0, w: W, h: w, level: m1 + 1 })
      for (let j = 1; j <= m2; j++) treads.push({ x: w + U_GAP, y: w + (j - 1) * tread, w, h: tread, level: m1 + 1 + j })
      footprint = [0, 0, W, 0, W, H, 0, H]
      path = [w / 2, H - 12, w / 2, w / 2, W - w / 2, w / 2, W - w / 2, w + m2 * tread - 12]
    }
  }

  if (p.turn === 'left' && p.shape !== 'straight') {
    const mx = (x: number): number => W - x
    for (const t of treads) t.x = mx(t.x + t.w)
    footprint = footprint.map((v, i) => (i % 2 === 0 ? mx(v) : v))
    path = path.map((v, i) => (i % 2 === 0 ? mx(v) : v))
  }
  return { width: W, height: H, treads, footprint, path }
}

const NAMES: Record<StairShape, string> = { straight: 'Escada reta', L: 'Escada em L', U: 'Escada em U' }
const defCache = new Map<string, BlockDef>()

/** Símbolo 2D da escada: contorno, degraus, seta de subida e "SOBE". */
export function stairDef(raw: StairParams): BlockDef {
  const p = clampStair(raw)
  const id = stairId(p)
  const hit = defCache.get(id)
  if (hit) return hit
  const lay = stairLayout(p)
  const shapes: BlockShape[] = [{ kind: 'poly', points: lay.footprint, closed: true, fill: 'fill' }]
  for (const t of lay.treads) shapes.push({ kind: 'rect', x: t.x, y: t.y, w: t.w, h: t.h, fill: 'none', weight: 0.5 })
  const pts = lay.path
  shapes.push({ kind: 'poly', points: pts, closed: false, fill: 'none', weight: 1 })
  // Ponta da seta no último segmento.
  const n = pts.length
  const [x1, y1, x2, y2] = [pts[n - 4], pts[n - 3], pts[n - 2], pts[n - 1]]
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const head = 10
  shapes.push({
    kind: 'poly',
    points: [x2 - ux * head - uy * head * 0.6, y2 - uy * head + ux * head * 0.6, x2, y2, x2 - ux * head + uy * head * 0.6, y2 - uy * head - ux * head * 0.6],
    closed: false,
    fill: 'none',
    weight: 1
  })
  shapes.push({ kind: 'text', x: pts[0], y: pts[1] - 24, text: 'SOBE', size: 11, align: 'center', fill: 'ink' })
  const def: BlockDef = { id, name: NAMES[p.shape], category: 'Escada', width: lay.width, height: lay.height, shapes, builtin: true }
  defCache.set(id, def)
  return def
}

/** Definição para um id de escada (paramétrico ou antigo); undefined se não for escada. */
export function stairDefFromId(id: string): BlockDef | undefined {
  const p = parseStairId(id)
  if (!p) return undefined
  const def = stairDef(p)
  // Ids antigos mantêm o próprio id (instâncias já salvas).
  return def.id === id ? def : { ...def, id }
}
