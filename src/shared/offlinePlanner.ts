/**
 * Gerador PROCEDURAL de plantas (modo offline, sem IA e sem custo).
 *
 * Produz exatamente o mesmo formato que a IA (AiPlanResponseT), então todo o
 * resto do app (paredes, portas, áreas, móveis, cotas) é reaproveitado.
 *
 * Etapas:
 *  1. parseBrief(): lê o pedido em português — área, quartos, suítes,
 *     banheiros, cozinha americana, varanda, área de serviço, escritório,
 *     lavabo, garagem, studio.
 *  2. Programa de necessidades: lista de cômodos com área-alvo e largura mínima,
 *     escalada para bater com a área pedida.
 *  3. Layout em faixas: zona social na frente, corredor, zona íntima nos fundos.
 *     A profundidade de cada faixa é escolhida por busca (equilibrar larguras,
 *     evitar cômodos compridos demais); a faixa mais estreita é esticada para
 *     o contorno ficar retangular. Varanda e garagem ficam na frente.
 *  4. Portas, janelas e móveis por regras (porta de cada cômodo para o
 *     corredor, janelas nas fachadas, cama encostada na parede do fundo…).
 *  5. Variações: clássica, espelhada e "lote estreito" (transposta).
 */
import type { AiPlanResponseT, AiVariantT } from './aiPlan'

type RoomType = AiVariantT['rooms'][number]['type']
type Room = AiVariantT['rooms'][number]
type Opening = AiVariantT['doors'][number]
type Furniture = AiVariantT['furniture'][number]

// ------------------------------------------------------------------ 1. leitura

export interface Brief {
  area: number | null
  bedrooms: number
  suites: number
  bathrooms: number
  openKitchen: boolean
  balcony: boolean
  gourmet: boolean
  laundry: boolean
  office: boolean
  powderRoom: boolean
  garage: boolean
  studio: boolean
}

const NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6
}

const normalizeText = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/²/g, '2')

/** Número antes de uma palavra-chave: "3 quartos", "dois banheiros". */
function countBefore(text: string, words: string): number | null {
  const m = text.match(new RegExp(`(\\d+|um|uma|dois|duas|tres|quatro|cinco|seis)\\s+(?:${words})`))
  if (!m) return null
  return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBERS[m[1]]
}

export function parseBrief(prompt: string): Brief {
  const t = normalizeText(prompt)
  const areaMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(?:m2|m 2|metros quadrados|metros2|mts2)/)
  const area = areaMatch ? Number(areaMatch[1].replace(',', '.')) : null
  const studio = /\b(studio|estudio|kitnet|quitinete|loft)\b/.test(t)

  const suitesCount = countBefore(t, 'suites?') ?? (/\bsuite\b/.test(t) ? 1 : 0)
  let bedrooms = countBefore(t, 'quartos?|dormitorios?|dorms?') ?? (studio ? 0 : /\bquarto\b/.test(t) ? 1 : 2)
  // "3 quartos (1 suíte)" / "3 quartos sendo 1 suíte" → a suíte já está entre os quartos.
  const suiteIncluded = /quartos?\s*\(\s*\w+\s+suites?\s*\)|sendo\s+\w+\s+suites?|(?:uma|1)\s+delas?\s+suite/.test(t)
  if (!suiteIncluded) bedrooms += suitesCount
  const suites = Math.min(suitesCount, bedrooms)

  return {
    area: area && area >= 15 && area <= 1000 ? area : null,
    bedrooms: Math.min(bedrooms, 6),
    suites,
    bathrooms: Math.max(studio ? 1 : 1, Math.min(countBefore(t, 'banheiros?|wcs?') ?? 1, 4)),
    openKitchen: studio || /cozinha\s+(americana|integrada|aberta)|sala\s+e\s+cozinha\s+integrad|conceito aberto/.test(t),
    balcony: /varanda|sacada|terraco|alpendre|deck/.test(t),
    gourmet: /gourmet|churrasqueira/.test(t),
    laundry: /area de servico|lavanderia|servico/.test(t),
    office: /escritorio|home ?office|espaco de trabalho|estudos?\b/.test(t),
    powderRoom: /lavabo/.test(t),
    garage: /garagem|vaga|carro/.test(t),
    studio
  }
}

// ------------------------------------------------------- 2. programa de necessidades

interface Need {
  key: string
  name: string
  type: RoomType
  area: number
  minW: number
  /** Escala com a área pedida? */
  flex: boolean
  zone: 'front' | 'social' | 'private'
}

function program(b: Brief, seed = 0): Need[] {
  const needs: Need[] = []
  const add = (n: Omit<Need, 'key'>): void => {
    needs.push({ ...n, key: `${n.type}-${needs.length}` })
  }
  if (b.studio) {
    add({ name: 'Estúdio', type: 'sala_cozinha', area: 22, minW: 3.6, flex: true, zone: 'social' })
    add({ name: 'Banheiro', type: 'banheiro', area: 3.6, minW: 1.5, flex: false, zone: 'social' })
    if (b.office) add({ name: 'Trabalho', type: 'escritorio', area: 5, minW: 2.0, flex: true, zone: 'social' })
    if (b.balcony) add({ name: 'Varanda', type: 'varanda', area: 4.5, minW: 2.4, flex: false, zone: 'front' })
    return needs
  }
  if (b.openKitchen) add({ name: 'Sala e cozinha', type: 'sala_cozinha', area: 24, minW: 3.8, flex: true, zone: 'social' })
  else {
    add({ name: 'Sala', type: 'sala', area: 16, minW: 3.2, flex: true, zone: 'social' })
    add({ name: 'Cozinha', type: 'cozinha', area: 8.5, minW: 2.4, flex: true, zone: 'social' })
  }
  if (b.laundry) add({ name: 'Área de serviço', type: 'area_servico', area: 4, minW: 1.6, flex: false, zone: 'social' })
  if (b.garage) add({ name: 'Garagem', type: 'garagem', area: 15, minW: 2.8, flex: false, zone: 'social' })

  // Zona íntima: suítes (com banheiro), quartos intercalados com banheiros sociais.
  const privStart = needs.length
  const socialBaths = Math.max(b.bedrooms - b.suites > 0 || b.suites === 0 ? 1 : 0, b.bathrooms - b.suites)
  let quarto = 1
  for (let i = 0; i < b.suites; i++) {
    add({ name: b.suites > 1 ? `Suíte ${i + 1}` : 'Suíte', type: 'suite', area: 13, minW: 3.0, flex: true, zone: 'private' })
    add({ name: b.suites > 1 ? `Banho suíte ${i + 1}` : 'Banho suíte', type: 'banheiro', area: 3.8, minW: 1.5, flex: false, zone: 'private' })
  }
  const plain = b.bedrooms - b.suites
  let bathsLeft = socialBaths
  for (let i = 0; i < plain; i++) {
    add({ name: plain > 1 ? `Quarto ${quarto++}` : 'Quarto', type: 'quarto', area: 10, minW: 2.7, flex: true, zone: 'private' })
    // Um banheiro social logo após o 1º quarto (fica central entre os quartos).
    if (i === 0 && bathsLeft > 0) {
      add({ name: 'Banheiro', type: 'banheiro', area: 4.2, minW: 1.6, flex: false, zone: 'private' })
      bathsLeft--
    }
  }
  for (let i = 0; i < bathsLeft; i++) add({ name: `Banheiro ${i + 2}`, type: 'banheiro', area: 4, minW: 1.6, flex: false, zone: 'private' })
  if (b.powderRoom) add({ name: 'Lavabo', type: 'lavabo', area: 2.4, minW: 1.3, flex: false, zone: 'private' })
  if (b.office) add({ name: 'Escritório', type: 'escritorio', area: 7.5, minW: 2.4, flex: true, zone: 'private' })
  if (b.balcony || b.gourmet) {
    add({ name: b.gourmet ? 'Varanda gourmet' : 'Varanda', type: 'varanda', area: b.gourmet ? 10 : 6, minW: 2.5, flex: true, zone: 'front' })
  }
  // "Gerar novamente": a semente gira a ordem dos grupos da zona íntima
  // (suíte+banho, quarto+banheiro, …) — cada grupo continua junto.
  if (seed > 0) {
    const priv = needs.slice(privStart).filter((n) => n.zone === 'private')
    const groups: Need[][] = []
    for (const n of priv) {
      const glued = n.name.startsWith('Banho suíte') || (n.type === 'banheiro' && groups.length && groups[groups.length - 1].length === 1)
      if (glued && groups.length) groups[groups.length - 1].push(n)
      else groups.push([n])
    }
    const k = seed % Math.max(1, groups.length)
    const rotated = [...groups.slice(k), ...groups.slice(0, k)].flat()
    const others = needs.filter((n) => n.zone !== 'private')
    return [...others, ...rotated]
  }
  return needs
}

// ------------------------------------------------------------------ 3. layout

const CORRIDOR = 1.1
const r05 = (v: number): number => Math.round(v * 20) / 20

interface Row {
  needs: Need[]
  depth: number
  widths: number[]
}

/** Larguras de uma faixa com profundidade d (respeitando mínimos). */
const rowWidths = (needs: Need[], d: number, scale: number): number[] =>
  needs.map((n) => Math.max(n.minW, ((n.flex ? n.area * scale : n.area) / d)))

/** Escolhe as profundidades da faixa social e da íntima que deixam a casa mais equilibrada. */
function chooseRows(social: Need[], priv: Need[], scale: number): { a: Row; c: Row | null } {
  let best: { cost: number; a: Row; c: Row | null } | null = null
  for (let da = 3.0; da <= 6.01; da += 0.1) {
    const wa = rowWidths(social, da, scale)
    const sumA = wa.reduce((s, w) => s + w, 0)
    const dcs = priv.length ? Array.from({ length: 19 }, (_, i) => 2.8 + i * 0.1) : [0]
    for (const dc of dcs) {
      const wc = priv.length ? rowWidths(priv, dc, scale) : []
      const sumC = wc.reduce((s, w) => s + w, 0)
      const ratio = (w: number, d: number): number => Math.max(w / d, d / w)
      let cost = priv.length ? Math.abs(sumA - sumC) * 1.5 : 0
      wa.forEach((w) => (cost += Math.max(0, ratio(w, da) - 1.9) * 3))
      wc.forEach((w, i) => (cost += Math.max(0, ratio(w, dc) - (priv[i].type === 'banheiro' || priv[i].type === 'lavabo' ? 2.4 : 1.8)) * 3))
      // Casa muito alongada é ruim (prefere proporção entre 1:1 e 1:1,8).
      const W = Math.max(sumA, sumC)
      const D = da + (priv.length ? CORRIDOR + dc : 0)
      cost += Math.max(0, ratio(W, D) - 1.8) * 4
      if (!best || cost < best.cost) {
        best = { cost, a: { needs: social, depth: da, widths: wa }, c: priv.length ? { needs: priv, depth: dc, widths: wc } : null }
      }
    }
  }
  return best!
}

/** Estica as larguras para a soma dar `total` (só cômodos flexíveis, se houver). */
function stretch(row: Row, total: number): void {
  const sum = row.widths.reduce((s, w) => s + w, 0)
  if (sum >= total - 1e-6) return
  const flexIdx = row.needs.map((n, i) => (n.flex ? i : -1)).filter((i) => i >= 0)
  const idx = flexIdx.length ? flexIdx : row.widths.map((_, i) => i)
  const flexSum = idx.reduce((s, i) => s + row.widths[i], 0)
  const k = (total - sum + flexSum) / flexSum
  idx.forEach((i) => (row.widths[i] *= k))
}

/** Posiciona uma faixa a partir de x0, arredondando as bordas no grid de 5 cm. */
function placeRow(row: Row, x0: number, y: number): Room[] {
  const rooms: Room[] = []
  let acc = x0
  row.needs.forEach((n, i) => {
    const xa = r05(acc)
    acc += row.widths[i]
    const xb = r05(acc)
    rooms.push({ name: n.name, type: n.type, x: xa, y: r05(y), width: r05(xb - xa), depth: r05(row.depth) })
  })
  return rooms
}

interface Layout {
  rooms: Room[]
  /** y da faixa social, do corredor e da íntima; largura total. */
  ySocial: number
  yCorridor: number | null
  yPrivate: number | null
  width: number
  depth: number
}

function layout(needs: Need[], scale: number, mirror: boolean, seed = 0): Layout {
  const front = needs.filter((n) => n.zone === 'front')
  let social = needs.filter((n) => n.zone === 'social')
  // Sementes ímpares: sala no meio da fachada (cozinha de um lado, serviço/garagem do outro).
  if (seed % 2 === 1 && social.length >= 3) {
    const [first, ...rest] = social
    social = [rest[0], first, ...rest.slice(1)]
  }
  let priv = needs.filter((n) => n.zone === 'private')
  if (mirror) {
    social = [...social].reverse()
    priv = [...priv].reverse()
  }
  const { a, c } = chooseRows(social, priv, scale)
  const W = Math.max(a.widths.reduce((s, w) => s + w, 0), c ? c.widths.reduce((s, w) => s + w, 0) : 0)
  stretch(a, W)
  if (c) stretch(c, W)

  const frontDepth = front.length ? 2.0 : 0
  const ySocial = frontDepth
  const rooms: Room[] = []

  const socialRooms = placeRow(a, 0, ySocial)
  rooms.push(...socialRooms)

  // Varanda na frente da sala (mesma largura da sala, sem passar da casa).
  if (front.length) {
    const sala = socialRooms.find((r) => r.type === 'sala' || r.type === 'sala_cozinha') ?? socialRooms[0]
    const v = front[0]
    // Largura pela área pedida, sem passar da sala (varanda fica "na frente" dela).
    const width = r05(Math.min(sala.width, Math.max(v.minW, (v.area * scale) / frontDepth)))
    const x = r05(sala.x + (sala.width - width) / 2)
    rooms.push({ name: v.name, type: 'varanda', x, y: 0, width, depth: frontDepth })
  }

  let yCorridor: number | null = null
  let yPrivate: number | null = null
  if (c) {
    yCorridor = r05(ySocial + a.depth)
    rooms.push({ name: 'Circulação', type: 'circulacao', x: 0, y: yCorridor, width: r05(W), depth: CORRIDOR })
    yPrivate = r05(yCorridor + CORRIDOR)
    rooms.push(...placeRow(c, 0, yPrivate))
  }
  const depth = (yPrivate !== null && c ? yPrivate + c.depth : ySocial + a.depth)
  return { rooms, ySocial, yCorridor, yPrivate, width: r05(W), depth: r05(depth) }
}

// ---------------------------------------------------- 4. aberturas e móveis

function openingsAndFurniture(L: Layout, b: Brief): { doors: Opening[]; windows: Opening[]; furniture: Furniture[] } {
  const doors: Opening[] = []
  const windows: Opening[] = []
  const furniture: Furniture[] = []
  const rooms = L.rooms
  const corridor = rooms.find((r) => r.type === 'circulacao')
  const varanda = rooms.find((r) => r.type === 'varanda')
  const social = rooms.filter((r) => r.y === L.ySocial && r.type !== 'varanda' && r.type !== 'circulacao')
  const priv = L.yPrivate !== null ? rooms.filter((r) => r.y === L.yPrivate) : []
  const sala = social.find((r) => r.type === 'sala' || r.type === 'sala_cozinha') ?? social[0]
  const fur = (block: string, x: number, y: number, rotation: number): void => {
    furniture.push({ block, x: r05(x), y: r05(y), rotation })
  }
  const right = (r: Room): number => r.x + r.width
  const bottom = (r: Room): number => r.y + r.depth

  // Entrada: na frente da sala (pela varanda, se houver), perto do canto.
  const entryX = sala.x + Math.min(1.0, sala.width / 2)
  doors.push({ x: entryX, y: sala.y, width: 0.9 })

  // Portas da faixa social para o corredor (ou entre vizinhos quando não há corredor).
  social.forEach((r, i) => {
    if (r === sala) {
      if (corridor) doors.push({ x: right(r) - Math.min(1.0, r.width / 2), y: bottom(r), width: 0.9 })
      return
    }
    const neighbor = social[i - 1] === sala || social[i + 1] === sala ? sala : null
    if (r.type === 'cozinha' && neighbor) {
      // Cozinha ligada à sala pela parede comum.
      const sharedX = social[i - 1] === sala ? r.x : right(r)
      doors.push({ x: sharedX, y: r.y + r.depth / 2, width: 0.8 })
    } else if (r.type === 'area_servico') {
      const prev = social[i - 1] ?? social[i + 1]
      const sharedX = social[i - 1] ? r.x : right(r)
      if (prev) doors.push({ x: sharedX, y: r.y + r.depth / 2, width: 0.7 })
    } else if (r.type === 'garagem') {
      const prev = social[i - 1] ?? social[i + 1]
      const sharedX = social[i - 1] ? r.x : right(r)
      if (prev) doors.push({ x: sharedX, y: r.y + r.depth - 0.8, width: 0.8 })
    } else if (corridor) {
      doors.push({ x: r.x + r.width / 2, y: bottom(r), width: 0.8 })
    } else {
      // Studio: banheiro abre para o ambiente principal.
      const sharedX = social[i - 1] ? r.x : right(r)
      doors.push({ x: sharedX, y: r.y + r.depth - Math.min(0.7, r.depth / 2), width: 0.7 })
    }
  })

  // Faixa íntima: cada cômodo abre para o corredor; banho da suíte abre para a suíte.
  priv.forEach((r, i) => {
    const isSuiteBath = r.name.startsWith('Banho suíte')
    if (isSuiteBath) {
      const suite = priv[i - 1]?.type === 'suite' ? priv[i - 1] : priv[i + 1]?.type === 'suite' ? priv[i + 1] : null
      if (suite) {
        const sharedX = suite.x < r.x ? r.x : right(r)
        doors.push({ x: sharedX, y: r.y + Math.min(0.75, r.depth / 2), width: 0.7 })
        return
      }
    }
    const w = r.type === 'banheiro' || r.type === 'lavabo' ? 0.7 : 0.8
    doors.push({ x: r.x + Math.min(Math.max(0.65, w / 2 + 0.3), r.width / 2), y: r.y, width: w })
  })

  // Janelas nas fachadas.
  const isBath = (r: Room): boolean => r.type === 'banheiro' || r.type === 'lavabo'
  for (const r of social) {
    if (r.type === 'garagem') continue
    const front = !varanda || right(varanda) <= r.x || varanda.x >= right(r)
    if (front) {
      // Janela da sala longe da porta de entrada.
      const cx = r === sala ? r.x + r.width * 0.68 : r.x + r.width / 2
      windows.push({ x: cx, y: r.y, width: isBath(r) ? 0.6 : Math.min(1.6, r.width * 0.5) })
    }
  }
  for (const r of priv) {
    windows.push({ x: r.x + r.width / 2, y: bottom(r), width: isBath(r) ? 0.6 : Math.min(1.5, r.width * 0.5) })
  }
  // Laterais: primeiro e último cômodo de cada faixa ganham janela lateral (exceto banheiros).
  for (const row of [social, priv]) {
    if (!row.length) continue
    const first = row[0]
    const last = row[row.length - 1]
    if (!isBath(first) && first.type !== 'garagem') windows.push({ x: 0, y: first.y + first.depth / 2, width: Math.min(1.4, first.depth * 0.4) })
    if (!isBath(last) && last !== first && last.type !== 'garagem') windows.push({ x: L.width, y: last.y + last.depth / 2, width: Math.min(1.4, last.depth * 0.4) })
  }

  // Móveis (rotação 0 = encosto/cabeceira para −Y).
  for (const r of rooms) {
    const cx = r.x + r.width / 2
    switch (r.type) {
      case 'sala':
        fur(r.width >= 3.4 ? 'builtin:sofa-3' : 'builtin:sofa-2', cx, bottom(r) - 0.5, 180)
        fur('builtin:coffee-table', cx, bottom(r) - 1.45, 0)
        fur('builtin:tv-rack', r.x + r.width * 0.68, r.y + 0.25, 0)
        break
      case 'sala_cozinha': {
        const living = r.x + r.width * 0.32
        fur(r.width >= 5 ? 'builtin:sofa-3' : 'builtin:sofa-2', living, bottom(r) - 0.5, 180)
        fur('builtin:coffee-table', living, bottom(r) - 1.45, 0)
        fur('builtin:kitchen-sink', r.x + r.width - 1.0, r.y + 0.3, 0)
        fur('builtin:stove', r.x + r.width - 1.95, r.y + 0.3, 0)
        fur('builtin:fridge', r.x + r.width - 0.4, r.y + 1.3, 90)
        if (r.depth >= 4 && r.width >= 5.5) fur('builtin:dining-4', r.x + r.width * 0.72, r.y + r.depth * 0.62, 90)
        break
      }
      case 'cozinha':
        fur('builtin:kitchen-sink', cx + 0.3, r.y + 0.3, 0)
        fur('builtin:stove', cx - 0.65, r.y + 0.3, 0)
        fur('builtin:fridge', right(r) - 0.4, r.y + r.depth - 0.8, 90)
        if (r.width >= 3 && r.depth >= 3.8) fur('builtin:dining-4', cx - 0.3, r.y + r.depth * 0.6, 90)
        break
      case 'quarto':
        fur(r.width >= 3.0 ? 'builtin:bed-double' : 'builtin:bed-single', cx, bottom(r) - 1.0, 180)
        if (r.width >= 3.0) fur('builtin:nightstand', cx - 0.95, bottom(r) - 0.25, 180)
        if (r.depth >= 3.2 && r.width >= 2.8) fur('builtin:wardrobe', r.x + 0.3, r.y + r.depth / 2 + 0.2, 270)
        break
      case 'suite':
        fur(r.width >= 3.4 ? 'builtin:bed-queen' : 'builtin:bed-double', cx, bottom(r) - 1.05, 180)
        fur('builtin:nightstand', cx - 1.05, bottom(r) - 0.25, 180)
        fur('builtin:nightstand', cx + 1.05, bottom(r) - 0.25, 180)
        if (r.depth >= 3.2) fur('builtin:wardrobe', r.x + 0.3, r.y + r.depth / 2 + 0.1, 270)
        break
      case 'banheiro':
        fur('builtin:toilet', r.x + 0.35, bottom(r) - 0.35, 180)
        fur('builtin:bath-sink', right(r) - 0.35, r.y + r.depth / 2 + 0.2, 90)
        if (r.depth >= 2.4) fur('builtin:shower', r.x + Math.min(0.5, r.width / 2), r.y + r.depth / 2 - 0.25, 270)
        break
      case 'lavabo':
        fur('builtin:toilet', cx, bottom(r) - 0.35, 180)
        fur('builtin:bath-sink', cx, r.y + 0.6, 0)
        break
      case 'escritorio':
        fur('builtin:desk', cx, bottom(r) - 0.35, 180)
        break
      case 'varanda':
        if (b.gourmet) fur('builtin:bbq', r.x + 0.6, r.y + r.depth / 2, 270)
        fur('builtin:round-table', r.x + r.width * 0.62, r.y + r.depth / 2, 0)
        break
    }
  }
  return { doors, windows, furniture }
}

// ---------------------------------------------------------------- 5. variações

/** Transpõe a planta (x↔y): vira o layout "em profundidade" para lotes estreitos. */
function transpose(v: AiVariantT): AiVariantT {
  return {
    ...v,
    rooms: v.rooms.map((r) => ({ ...r, x: r.y, y: r.x, width: r.depth, depth: r.width })),
    doors: v.doors.map((d) => ({ ...d, x: d.y, y: d.x })),
    windows: v.windows.map((w) => ({ ...w, x: w.y, y: w.x })),
    furniture: v.furniture.map((f) => ({ ...f, x: f.y, y: f.x, rotation: (((270 - f.rotation) % 360) + 360) % 360 }))
  }
}

function buildVariant(needs: Need[], b: Brief, mirror: boolean, title: string, summary: string, seed: number): AiVariantT {
  // Ajusta a escala dos cômodos flexíveis para a área total bater com o pedido.
  let scale = 1
  let L = layout(needs, scale, mirror, seed)
  if (b.area) {
    for (let i = 0; i < 4; i++) {
      const total = L.rooms.reduce((s, r) => s + r.width * r.depth, 0)
      scale = Math.max(0.6, Math.min(2.2, scale * (b.area / total)))
      L = layout(needs, scale, mirror, seed)
    }
  }
  const { doors, windows, furniture } = openingsAndFurniture(L, b)
  return { title, summary, rooms: L.rooms, doors, windows, furniture }
}

/**
 * Gera 2–3 variações a partir de uma descrição em português. Instantâneo e
 * determinístico para cada `seed`; seeds diferentes ("Gerar novamente")
 * rearranjam quartos e fachada.
 */
export function generateOfflinePlan(prompt: string, seed = 0): AiPlanResponseT {
  const b = parseBrief(prompt)
  const needs = program(b, seed)
  const classic = buildVariant(
    needs,
    b,
    false,
    'Clássica',
    b.studio
      ? 'Ambiente único integrado com banheiro ao lado.'
      : 'Área social na frente, corredor central e quartos voltados para os fundos.',
    seed
  )
  const mirrored = buildVariant(
    needs,
    b,
    true,
    'Espelhada',
    b.studio
      ? 'Mesma ideia com o banheiro do outro lado.'
      : 'Mesma lógica com a cozinha e a suíte do lado oposto — útil quando o acesso ou a vista estão do outro lado do lote.',
    seed
  )
  const variants = [classic, mirrored]
  if (!b.studio) {
    variants.push({
      ...transpose(classic),
      title: 'Lote estreito',
      summary: 'Ambientes enfileirados da frente para os fundos, com corredor lateral — bom para terrenos estreitos e compridos.'
    })
  }
  return { variants }
}
