/**
 * Símbolos 2D de portas e janelas como primitivas geométricas (cm, no mundo).
 * Usado pelo canvas (Konva) e pelo PDF, para que os dois desenhem igual.
 */
import type { DoorVariant, WindowVariant } from '@shared/model'
import { add, mul, sub } from './geometry'
import type { OpeningGeometry } from './openings'

type P = { x: number; y: number }

export type SymbolPrim =
  | { kind: 'line'; pts: P[]; closed?: boolean; weight: 'heavy' | 'normal' | 'thin'; dash?: boolean }
  | { kind: 'arc'; center: P; r: number; from: number; delta: number; dash?: boolean }

export interface SymbolSpec {
  type: 'door' | 'window'
  variant?: DoorVariant | WindowVariant
  side?: 1 | -1
  hinge?: 'start' | 'end'
}

export const DOOR_VARIANTS: { value: DoorVariant; label: string }[] = [
  { value: 'swing', label: 'De abrir' },
  { value: 'double', label: 'Dupla (2 folhas)' },
  { value: 'sliding', label: 'De correr' },
  { value: 'open', label: 'Vão livre' }
]

export const WINDOW_VARIANTS: { value: WindowVariant; label: string }[] = [
  { value: 'casement', label: 'De abrir' },
  { value: 'sliding', label: 'De correr' },
  { value: 'tilt', label: 'Basculante' },
  { value: 'fixed', label: 'Fixa' }
]

const seg = (a: P, b: P, weight: 'heavy' | 'normal' | 'thin' = 'normal', dash = false): SymbolPrim => ({ kind: 'line', pts: [a, b], weight, dash })

function arcFrom(center: P, from: P, to: P, r: number, dash = true): SymbolPrim {
  const a0 = Math.atan2(from.y - center.y, from.x - center.x)
  let delta = Math.atan2(to.y - center.y, to.x - center.x) - a0
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  return { kind: 'arc', center, r, from: a0, delta, dash }
}

/** Folha de porta de abrir: dobradiça, ponta da folha (90°) e arco até o batente livre. */
function swingLeaf(g: OpeningGeometry, hingeAt: 'start' | 'end', side: 1 | -1, width: number): SymbolPrim[] {
  const face = mul(g.normal, (side * g.thickness) / 2)
  const hingePt = add(hingeAt === 'start' ? g.start : g.end, face)
  const freePt = add(hingeAt === 'start' ? add(g.start, mul(g.dir, width)) : sub(g.end, mul(g.dir, width)), face)
  const leafEnd = add(hingePt, mul(g.normal, side * width))
  return [seg(hingePt, leafEnd, 'heavy'), arcFrom(hingePt, leafEnd, freePt, width)]
}

function doorPrims(s: SymbolSpec, g: OpeningGeometry): SymbolPrim[] {
  const variant = (s.variant as DoorVariant | undefined) ?? 'swing'
  const side = s.side ?? 1
  switch (variant) {
    case 'open':
      return []
    case 'double': {
      // Duas folhas, cada uma com metade do vão e dobradiça em um extremo.
      const half = g.width / 2
      return [...swingLeaf(g, 'start', side, half), ...swingLeaf(g, 'end', side, half)]
    }
    case 'sliding': {
      // Dois painéis sobrepostos, em trilhos de lados opostos, e uma seta indicando o deslizamento.
      const t = mul(g.normal, g.thickness / 4)
      const over = mul(g.dir, g.width * 0.04)
      const mid = g.center
      const tail = add(add(mid, mul(g.normal, g.thickness)), mul(g.dir, -g.width * 0.15))
      const tip = add(tail, mul(g.dir, g.width * 0.3))
      return [
        seg(add(g.start, t), add(add(mid, over), t), 'heavy'),
        seg(sub(sub(mid, over), t), sub(g.end, t), 'heavy'),
        seg(tail, tip, 'thin'),
        seg(tip, add(sub(tip, mul(g.dir, g.width * 0.05)), mul(g.normal, g.width * 0.03)), 'thin'),
        seg(tip, sub(sub(tip, mul(g.dir, g.width * 0.05)), mul(g.normal, g.width * 0.03)), 'thin')
      ]
    }
    default:
      return swingLeaf(g, s.hinge ?? 'start', side, g.width)
  }
}

function windowPrims(s: SymbolSpec, g: OpeningGeometry): SymbolPrim[] {
  const variant = (s.variant as WindowVariant | undefined) ?? 'casement'
  const hj = mul(g.normal, g.thickness / 2)
  const frame: SymbolPrim = { kind: 'line', pts: [add(g.start, hj), add(g.end, hj), sub(g.end, hj), sub(g.start, hj)], closed: true, weight: 'normal' }
  const glass = mul(g.normal, Math.min(g.thickness / 6, 3))
  const glassLine = (o: P, from = g.start, to = g.end): SymbolPrim => seg(add(from, o), add(to, o))
  switch (variant) {
    case 'fixed':
      return [frame, glassLine({ x: 0, y: 0 })]
    case 'sliding': {
      // Duas folhas sobrepostas (cada uma com sua linha de vidro em trilhos diferentes).
      const mid = g.center
      const over = mul(g.dir, g.width * 0.05)
      return [
        frame,
        seg(add(g.start, glass), add(add(mid, over), glass)),
        seg(sub(sub(mid, over), glass), sub(g.end, glass)),
        seg(add(g.start, mul(glass, -1)), sub(g.end, mul(glass, -1)), 'thin')
      ]
    }
    case 'tilt': {
      // Basculante: duas linhas de vidro + triângulo tracejado indicando o giro.
      const apex = add(g.center, mul(g.normal, g.thickness * 0.9))
      return [
        frame,
        glassLine(glass),
        glassLine(mul(glass, -1)),
        seg(add(g.start, hj), apex, 'thin', true),
        seg(add(g.end, hj), apex, 'thin', true)
      ]
    }
    default:
      return [frame, glassLine(glass), glassLine(mul(glass, -1))]
  }
}

/** Primitivas do símbolo (sem o recorte da parede e os batentes, que são comuns). */
export function openingPrims(s: SymbolSpec, g: OpeningGeometry): SymbolPrim[] {
  return s.type === 'window' ? windowPrims(s, g) : doorPrims(s, g)
}
