/**
 * Reconhecimento de planta a partir de imagem (foto/escaneamento) por IA.
 *
 * A IA devolve, em PIXELS da imagem enviada: retângulos de cômodos, pontos de
 * portas/janelas e (se houver) uma medida escrita na planta para calibrar a
 * escala. O app converte isso para metros, "limpa" as coordenadas (bordas
 * quase iguais viram iguais) e reaproveita o mesmo montador da geração por IA
 * (paredes, aberturas, áreas e cotas), então o resultado é sempre consistente
 * e editável.
 */
import * as z from 'zod/v4'
import { ROOM_TYPES, type AiVariantT } from './aiPlan'

const RecRoom = z.object({
  name: z.string().describe('Nome do cômodo como aparece na planta (ou um nome plausível em português)'),
  type: z.enum(ROOM_TYPES),
  x: z.number().describe('Canto superior esquerdo, em pixels da imagem (X para a direita)'),
  y: z.number().describe('Canto superior esquerdo, em pixels da imagem (Y para baixo)'),
  width: z.number().describe('Largura em pixels'),
  height: z.number().describe('Altura em pixels')
})

const RecOpening = z.object({
  x: z.number().describe('Centro do vão, em pixels, sobre a parede'),
  y: z.number().describe('Centro do vão, em pixels, sobre a parede'),
  width: z.number().describe('Largura do vão em pixels')
})

const RecScale = z.object({
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
  meters: z.number().describe('Valor da medida escrita, em metros')
})

export const AiRecognition = z.object({
  rooms: z.array(RecRoom),
  doors: z.array(RecOpening),
  windows: z.array(RecOpening),
  scale: RecScale.nullable().describe('Uma cota escrita na planta (extremos em pixels e valor em metros), ou null se não houver'),
  notes: z.string().describe('Observações curtas sobre o que foi difícil de ler (ou vazio)')
})

export type AiRecognitionT = z.infer<typeof AiRecognition>

export const RECOGNIZE_SYSTEM_PROMPT = `Você lê plantas baixas residenciais (fotos, escaneamentos ou PDFs convertidos em imagem) e devolve a geometria em JSON.
Responda SOMENTE no formato JSON pedido.

Regras:
- Todas as coordenadas são em PIXELS da imagem que você recebeu: origem (0,0) no canto superior esquerdo, X para a direita, Y para baixo. O usuário informa a largura e a altura da imagem.
- Cada cômodo é um RETÂNGULO que cobre a área interna entre as paredes (x, y, width, height). Cômodo em L ou irregular: divida em retângulos que se encostam, com nomes como "Sala (1)" e "Sala (2)".
- Retângulos vizinhos compartilham exatamente a mesma coordenada de borda (a parede entre eles). Não deixe frestas nem sobreposições. Ignore terraços/áreas fora da edificação, textos, móveis, cotas e carimbos.
- Portas e janelas: o CENTRO do vão exatamente sobre a linha da parede e a largura do vão em pixels. Inclua a porta de entrada. Não invente aberturas que não estejam desenhadas.
- Escala: se houver uma cota escrita (ex.: "4,20" ao longo de uma parede), devolva os dois extremos dessa linha em pixels e o valor em metros em "scale". Prefira a cota mais longa e legível. Sem cotas legíveis: scale = null.
- Em "notes", diga em uma frase se algo estava ilegível, cortado ou ambíguo. Se tudo estiver claro, deixe vazio.
- Nomes em português do Brasil.`

// --------------------------------------------------------------- conversão

const SNAP_TOL = 0.14 // m: bordas mais próximas que isso viram a mesma
const GRID = 0.05

/** Agrupa valores próximos (1D) e devolve um mapa valor → valor "limpo". */
function clusterSnap(values: number[], tol: number): Map<number, number> {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const map = new Map<number, number>()
  let group: number[] = []
  const flush = (): void => {
    if (!group.length) return
    const mean = group.reduce((s, v) => s + v, 0) / group.length
    const clean = Math.round(mean / GRID) * GRID
    for (const g of group) map.set(g, clean)
    group = []
  }
  for (const v of sorted) {
    if (group.length && v - group[group.length - 1] > tol) flush()
    group.push(v)
  }
  flush()
  return map
}

export interface RecognizedPlan {
  variant: AiVariantT
  /** Área total dos retângulos (m²). */
  area: number
  warnings: string[]
}

/**
 * Converte a leitura da IA (pixels) em uma variação em metros.
 * `metersPerPx`: escala efetiva, em relação à imagem ENVIADA à IA.
 * As coordenadas ficam relativas ao canto superior esquerdo da imagem.
 */
export function recognitionToVariant(rec: AiRecognitionT, metersPerPx: number): RecognizedPlan {
  const warnings: string[] = []
  const finite = (n: number): boolean => Number.isFinite(n)
  const rooms = rec.rooms.filter((r) => [r.x, r.y, r.width, r.height].every(finite) && r.width > 0 && r.height > 0)
  if (rooms.length < rec.rooms.length) warnings.push('Alguns cômodos inválidos foram ignorados.')

  // px → m, bordas limpas
  const xs = clusterSnap(
    rooms.flatMap((r) => [r.x * metersPerPx, (r.x + r.width) * metersPerPx]),
    SNAP_TOL
  )
  const ys = clusterSnap(
    rooms.flatMap((r) => [r.y * metersPerPx, (r.y + r.height) * metersPerPx]),
    SNAP_TOL
  )
  const snapped = rooms
    .map((r) => {
      const x1 = xs.get(r.x * metersPerPx)!
      const x2 = xs.get((r.x + r.width) * metersPerPx)!
      const y1 = ys.get(r.y * metersPerPx)!
      const y2 = ys.get((r.y + r.height) * metersPerPx)!
      return { r, x: x1, y: y1, width: x2 - x1, depth: y2 - y1 }
    })
    .filter((s) => s.width >= 0.5 && s.depth >= 0.5)
  if (snapped.length < rooms.length) warnings.push('Cômodos menores que 0,5 m foram ignorados.')

  // Segmentos das bordas, para encostar portas/janelas na parede mais próxima.
  const segs: { x1: number; y1: number; x2: number; y2: number }[] = snapped.flatMap((s) => [
    { x1: s.x, y1: s.y, x2: s.x + s.width, y2: s.y },
    { x1: s.x, y1: s.y + s.depth, x2: s.x + s.width, y2: s.y + s.depth },
    { x1: s.x, y1: s.y, x2: s.x, y2: s.y + s.depth },
    { x1: s.x + s.width, y1: s.y, x2: s.x + s.width, y2: s.y + s.depth }
  ])
  const toWall = (o: { x: number; y: number; width: number }, min: number, max: number): AiVariantT['doors'][number] => {
    const px = o.x * metersPerPx
    const py = o.y * metersPerPx
    let best = { x: px, y: py, d: Infinity }
    for (const s of segs) {
      const cx = Math.max(Math.min(s.x1, s.x2), Math.min(Math.max(s.x1, s.x2), px))
      const cy = Math.max(Math.min(s.y1, s.y2), Math.min(Math.max(s.y1, s.y2), py))
      const d = Math.hypot(px - cx, py - cy)
      if (d < best.d) best = { x: cx, y: cy, d }
    }
    const near = best.d <= 0.6
    return { x: near ? best.x : px, y: near ? best.y : py, width: Math.min(max, Math.max(min, o.width * metersPerPx)) }
  }

  const variant: AiVariantT = {
    title: 'Planta reconhecida',
    summary: 'Cômodos, portas e janelas lidos da imagem.',
    rooms: snapped.map((s) => ({ name: s.r.name.trim() || 'Cômodo', type: s.r.type, x: s.x, y: s.y, width: s.width, depth: s.depth })),
    doors: rec.doors.filter((o) => finite(o.x) && finite(o.y) && finite(o.width)).map((o) => toWall(o, 0.6, 1.2)),
    windows: rec.windows.filter((o) => finite(o.x) && finite(o.y) && finite(o.width)).map((o) => toWall(o, 0.5, 3)),
    furniture: []
  }
  const area = variant.rooms.reduce((s, r) => s + r.width * r.depth, 0)
  if (!variant.rooms.length) warnings.push('Nenhum cômodo foi reconhecido.')
  return { variant, area, warnings }
}

/** Metros por pixel (da imagem enviada) a partir da cota lida pela IA, ou null se inutilizável. */
export function metersPerPxFromScale(scale: AiRecognitionT['scale']): number | null {
  if (!scale) return null
  const px = Math.hypot(scale.x2 - scale.x1, scale.y2 - scale.y1)
  if (!Number.isFinite(px) || px < 20 || !Number.isFinite(scale.meters) || scale.meters <= 0.2 || scale.meters > 60) return null
  return scale.meters / px
}
