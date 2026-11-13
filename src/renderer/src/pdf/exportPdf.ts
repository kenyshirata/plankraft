/**
 * Exportação PDF VETORIAL (jsPDF), desenhando a partir do MODELO — não do canvas.
 *
 * Unidades: o PDF trabalha em mm. Em escala 1:N, 1 cm do desenho vira 10/N mm
 * no papel (`factor`). Espessuras de traço e textos de anotação (cotas,
 * rótulos) têm tamanho fixo no papel; textos do desenho escalam com ele.
 *
 * Ordem: as camadas são desenhadas na mesma ordem do documento (de trás para a
 * frente), e dentro de cada camada: imagem → cômodos → blocos → paredes →
 * aberturas → textos → cotas — igual ao canvas.
 */
import { GState, jsPDF } from 'jspdf'
import type { BlockDef, BlockShape } from '@shared/blocks'
import type {
  BlockObject,
  DimensionObject,
  Id,
  ImageObject,
  LengthUnit,
  OpeningObject,
  PlanDocument,
  PlanObject,
  Point,
  RoomObject,
  TextObject,
  WallObject
} from '@shared/model'
import { add, angleDeg, boundsOf, mul, normalize, perp, polygonArea, polygonCentroid, readableAngle, sub, type Rect } from '@renderer/lib/geometry'
import { formatArea, formatLength } from '@renderer/lib/format'
import { resolveMaterial } from '@shared/materials'
import { computeWallGeometry, extendedPoints } from '@renderer/canvas/wallGeometry'
import { openingGeometry } from '@renderer/lib/openings'
import { openingPrims } from '@renderer/lib/openingSymbols'
import { insetPolygon } from '@renderer/lib/geometry'
import { planarFaces } from '@renderer/lib/rooms'
import { cornerAngles, exteriorSides, layoutDimensions, measuredSegment } from '@renderer/lib/dimensions'
import { blockCorners, instanceMatrix, transformShape } from '@renderer/lib/blockGeometry'
import { imageCorners } from '@renderer/lib/imageGeometry'
import type { CornerAngleMode, DimensionStyle } from '@renderer/store/settingsStore'

// ------------------------------------------------------------------ opções

export type PaperSize = 'a4' | 'a3' | 'a2' | 'letter'
export type Orientation = 'portrait' | 'landscape'
export type PdfScale = 50 | 100 | 200 | 'fit'

export interface PdfOptions {
  paper: PaperSize
  orientation: Orientation
  scale: PdfScale
  includeDimensions: boolean
  includeBackground: boolean
  /** Camadas incluídas (ids). */
  layerIds: Id[]
  legend: boolean
  titleBlock: boolean
  projectName: string
  author: string
  date: string
  openAfter: boolean
}

export interface PdfContext {
  resolveBlock(id: string): BlockDef | undefined
  image(asset: string): HTMLImageElement | null
  unit: LengthUnit
  precision: number
  dimensionStyle: DimensionStyle
  dimensionOffset: number
  cornerAngles: CornerAngleMode
}

export const PAPER_MM: Record<PaperSize, [number, number]> = {
  a4: [210, 297],
  a3: [297, 420],
  a2: [420, 594],
  letter: [215.9, 279.4]
}
export const PAPER_LABEL: Record<PaperSize, string> = { a4: 'A4', a3: 'A3', a2: 'A2', letter: 'Carta' }

const MARGIN = 10
const TITLE_H = 20
const LEGEND_W = 58
const GAP = 4
/** "1 px de tela" no papel (mm): usado para converter distâncias de anotação (cotas). */
const PX_MM = 0.3
const PT_MM = 0.3528

const COLORS = {
  wall: '#2b2f36',
  ink: '#1d2026',
  dim: '#c2410c',
  blockStroke: '#545b68',
  frame: '#1d2026',
  muted: '#6b7280'
}

// ------------------------------------------------------------------ layout

export interface PdfLayout {
  pageW: number
  pageH: number
  /** Área do desenho (mm). */
  area: Rect
  /** mm de papel por cm do desenho. */
  factor: number
  /** Denominador da escala efetiva (1:N). */
  scaleDen: number
  /** Caixa do conteúdo (cm). */
  bounds: Rect
  /** O desenho cabe na área na escala escolhida? */
  fits: boolean
  contentMm: { w: number; h: number }
  legendArea: Rect | null
  titleArea: Rect | null
}

/** Objetos que entram no PDF conforme as opções. */
export function includedObjects(doc: PlanDocument, opts: PdfOptions): PlanObject[] {
  const layers = new Set(opts.layerIds)
  return doc.objects.filter((o) => {
    if (!layers.has(o.layerId)) return false
    if (o.type === 'dimension' && !opts.includeDimensions) return false
    if (o.type === 'image' && (!opts.includeBackground || o.hidden)) return false
    return true
  })
}

function objectBounds(objects: PlanObject[], walls: Map<Id, WallObject>, ctx: PdfContext): Rect | null {
  const pts: Point[] = []
  for (const o of objects) {
    switch (o.type) {
      case 'wall': {
        const n = mul(perp(normalize(sub(o.b, o.a))), o.thickness / 2)
        pts.push(add(o.a, n), sub(o.a, n), add(o.b, n), sub(o.b, n))
        break
      }
      case 'room':
        pts.push(...o.points)
        break
      case 'text':
        pts.push(o.position, add(o.position, { x: o.text.length * o.fontSize * 0.55, y: o.fontSize * 1.2 * o.text.split('\n').length }))
        break
      case 'block': {
        const def = ctx.resolveBlock(o.blockId)
        if (def) pts.push(...blockCorners(o, def))
        break
      }
      case 'image':
        pts.push(...imageCorners(o))
        break
      case 'dimension': {
        const seg = measuredSegment(o, walls)
        if (seg) pts.push(seg.a, seg.b)
        break
      }
      default: {
        const w = walls.get(o.wallId)
        if (w) pts.push(w.a, w.b)
      }
    }
  }
  return boundsOf(pts)
}

export function computeLayout(doc: PlanDocument, opts: PdfOptions, ctx: PdfContext): PdfLayout {
  const [a, b] = PAPER_MM[opts.paper]
  const pageW = opts.orientation === 'portrait' ? a : b
  const pageH = opts.orientation === 'portrait' ? b : a
  const objects = includedObjects(doc, opts)
  const walls = new Map(doc.objects.filter((o): o is WallObject => o.type === 'wall').map((w) => [w.id, w]))
  const hasRooms = opts.legend && objects.some((o) => o.type === 'room')

  const inner: Rect = { x: MARGIN, y: MARGIN, width: pageW - 2 * MARGIN, height: pageH - 2 * MARGIN }
  const titleArea = opts.titleBlock ? { x: inner.x, y: inner.y + inner.height - TITLE_H, width: inner.width, height: TITLE_H } : null
  const bottom = titleArea ? titleArea.y - GAP : inner.y + inner.height
  const legendArea = hasRooms ? { x: inner.x + inner.width - LEGEND_W, y: inner.y, width: LEGEND_W, height: bottom - inner.y } : null
  const area: Rect = {
    x: inner.x,
    y: inner.y,
    width: (legendArea ? legendArea.x - GAP : inner.x + inner.width) - inner.x,
    height: bottom - inner.y
  }

  const bounds = objectBounds(objects, walls, ctx) ?? { x: 0, y: 0, width: 100, height: 100 }
  // Folga para cotas/rótulos que ficam fora das paredes.
  const pad = opts.includeDimensions ? 14 : 5
  let factor: number
  if (opts.scale === 'fit') {
    factor = Math.min((area.width - 2 * pad) / Math.max(bounds.width, 1), (area.height - 2 * pad) / Math.max(bounds.height, 1))
  } else {
    factor = 10 / opts.scale
  }
  const contentMm = { w: bounds.width * factor + 2 * pad, h: bounds.height * factor + 2 * pad }
  return {
    pageW,
    pageH,
    area,
    factor,
    scaleDen: 10 / factor,
    bounds,
    fits: contentMm.w <= area.width + 0.5 && contentMm.h <= area.height + 0.5,
    contentMm,
    legendArea,
    titleArea
  }
}

// ------------------------------------------------------------------ desenho

/** PDF com uma folha por andar que tenha conteúdo selecionado (mesma escala e enquadramento em todas). */
export function buildPdf(doc: PlanDocument, opts: PdfOptions, ctx: PdfContext): jsPDF {
  const L = computeLayout(doc, opts, ctx)
  const orientation = L.pageW > L.pageH ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ unit: 'mm', format: [L.pageW, L.pageH], orientation, compress: true })
  pdf.setProperties({ title: opts.projectName || doc.name, author: opts.author, creator: 'PlanKraft' })
  pdf.setFont('helvetica', 'normal')
  pdf.setLineJoin('round')
  pdf.setLineCap('round')

  const pages = doc.levels
    .map((level) => ({
      level,
      layerIds: opts.layerIds.filter((id) => doc.layers.find((l) => l.id === id)?.levelId === level.id)
    }))
    .filter((p) => doc.objects.some((o) => p.layerIds.includes(o.layerId)))
  const list = pages.length ? pages : [{ level: doc.levels[0], layerIds: opts.layerIds }]
  list.forEach((p, i) => {
    if (i > 0) pdf.addPage([L.pageW, L.pageH], orientation)
    drawPdfPage(pdf, L, doc, { ...opts, layerIds: p.layerIds }, ctx, doc.levels.length > 1 ? p.level.name : null)
  })
  return pdf
}

function drawPdfPage(pdf: jsPDF, L: PdfLayout, doc: PlanDocument, opts: PdfOptions, ctx: PdfContext, levelName: string | null): void {
  const cx = L.bounds.x + L.bounds.width / 2
  const cy = L.bounds.y + L.bounds.height / 2
  const ax = L.area.x + L.area.width / 2
  const ay = L.area.y + L.area.height / 2
  /** Mundo (cm) → papel (mm). */
  const P = (p: Point): Point => ({ x: ax + (p.x - cx) * L.factor, y: ay + (p.y - cy) * L.factor })

  const objects = includedObjects(doc, opts)
  const allWalls = doc.objects.filter((o): o is WallObject => o.type === 'wall')
  const wallsById = new Map(allWalls.map((w) => [w.id, w]))
  const includedWalls = objects.filter((o): o is WallObject => o.type === 'wall')
  const wallGeo = computeWallGeometry(includedWalls)

  // ---- primitivas
  const path = (pts: Point[], closed: boolean): void => {
    if (pts.length < 2) return
    const q = pts.map(P)
    pdf.moveTo(q[0].x, q[0].y)
    for (let i = 1; i < q.length; i++) pdf.lineTo(q[i].x, q[i].y)
    if (closed) pdf.close()
  }
  const strokePath = (pts: Point[], closed: boolean, color: string, width: number, dash?: number[]): void => {
    pdf.setDrawColor(color)
    pdf.setLineWidth(width)
    pdf.setLineDashPattern(dash ?? [], 0)
    path(pts, closed)
    pdf.stroke()
    if (dash) pdf.setLineDashPattern([], 0)
  }
  const fillPath = (pts: Point[], color: string, stroke?: { color: string; width: number }): void => {
    pdf.setFillColor(color)
    if (stroke) {
      pdf.setDrawColor(stroke.color)
      pdf.setLineWidth(stroke.width)
    }
    path(pts, true)
    if (stroke) pdf.fillStroke()
    else pdf.fill()
  }
  const withOpacity = (opacity: number, draw: () => void): void => {
    if (opacity >= 0.999) return draw()
    pdf.saveGraphicsState()
    pdf.setGState(new GState({ opacity, 'stroke-opacity': opacity }))
    draw()
    pdf.restoreGraphicsState()
  }
  const arcPoints = (c: Point, r: number, a0: number, delta: number, steps = 24): Point[] =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = a0 + (delta * i) / steps
      return { x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }
    })

  /**
   * Texto centrado em `c` (papel, mm), girado `deg` graus no sentido horário da tela.
   * Centralização feita à mão (o alinhamento do jsPDF não considera rotação).
   */
  const textCentered = (s: string, c: Point, sizePt: number, color: string, deg = 0, bold = false): void => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(sizePt)
    pdf.setTextColor(color)
    const w = pdf.getTextWidth(s)
    const t = (deg * Math.PI) / 180
    const dir = { x: Math.cos(t), y: Math.sin(t) }
    const down = { x: -Math.sin(t), y: Math.cos(t) }
    const capH = sizePt * PT_MM * 0.35
    const start = add(sub(c, mul(dir, w / 2)), mul(down, capH))
    pdf.text(s, start.x, start.y, { angle: -deg })
  }

  // ---- moldura da folha
  pdf.setDrawColor(COLORS.frame)
  pdf.setLineWidth(0.4)
  pdf.rect(MARGIN, MARGIN, L.pageW - 2 * MARGIN, L.pageH - 2 * MARGIN)

  // ---- desenho, recortado à área
  pdf.saveGraphicsState()
  pdf.rect(L.area.x, L.area.y, L.area.width, L.area.height, null)
  pdf.clip()
  pdf.discardPath()

  const sides = exteriorSides(includedWalls, planarFaces(includedWalls))
  const factorPx = L.factor / PX_MM // "px por cm" equivalente no papel

  for (const layer of doc.layers) {
    if (!opts.layerIds.includes(layer.id)) continue
    const objs = objects.filter((o) => o.layerId === layer.id)
    if (!objs.length && !(layer.role === 'dimensions' && opts.includeDimensions)) continue
    withOpacity(layer.opacity, () => {
      // Imagens de fundo (rasterizadas na resolução adequada; o resto é vetorial)
      for (const o of objs) if (o.type === 'image') drawImage(o)
      // Cômodos
      for (const o of objs) if (o.type === 'room') drawRoomFill(o)
      // Blocos
      for (const o of objs) if (o.type === 'block') drawBlock(o, layer.color)
      // Paredes
      for (const o of objs) {
        if (o.type !== 'wall') continue
        const g = wallGeo.get(o.id)
        if (!g) continue
        const [x1, y1, x2, y2] = extendedPoints(g, 0)
        const n = mul(perp(g.dir), o.thickness / 2)
        const a = { x: x1, y: y1 }
        const b = { x: x2, y: y2 }
        fillPath([add(a, n), add(b, n), sub(b, n), sub(a, n)], resolveMaterial(o.material)?.color ?? layer.color ?? COLORS.wall)
      }
      // Aberturas
      for (const o of objs) if (o.type === 'door' || o.type === 'window') drawOpening(o, layer.color)
      // Rótulos dos cômodos (por cima das paredes/móveis)
      for (const o of objs) if (o.type === 'room') drawRoomLabel(o)
      // Textos
      for (const o of objs) if (o.type === 'text') drawText(o, layer.color)
      // Cotas
      const dims = objs.filter((o): o is DimensionObject => o.type === 'dimension')
      if (dims.length) {
        const layouts = layoutDimensions(dims, wallsById, sides, { scale: factorPx, offsetPx: ctx.dimensionOffset, style: ctx.dimensionStyle })
        for (const d of layouts) drawDimension(d, layer.color)
      }
      if (layer.role === 'dimensions' && opts.includeDimensions) {
        for (const c of cornerAngles(includedWalls, ctx.cornerAngles)) {
          const r = 16 * PX_MM / L.factor // 16 "px" no papel, em cm
          const a0 = Math.atan2(c.d1.y, c.d1.x)
          let delta = Math.atan2(c.d2.y, c.d2.x) - a0
          while (delta > Math.PI) delta -= 2 * Math.PI
          while (delta < -Math.PI) delta += 2 * Math.PI
          strokePath(arcPoints(c.at, r, a0, delta), false, COLORS.dim, 0.13)
          const label = add(c.at, mul(normalize(add(c.d1, c.d2)), r + (12 * PX_MM) / L.factor))
          textCentered(`${Math.round(c.degrees * 10) / 10}°`.replace('.', ','), P(label), 6, COLORS.dim)
        }
      }
    })
  }
  pdf.restoreGraphicsState()

  if (L.legendArea) drawLegend(L.legendArea)
  if (L.titleArea) drawTitleBlock(L.titleArea)
  return

  // ================================================================ objetos

  function drawImage(o: ImageObject): void {
    const img = ctx.image(o.asset)
    if (!img) return
    const corners = imageCorners(o)
    const bb = boundsOf(corners)!
    // Resolução: até ~200 dpi no papel e nunca acima da original.
    const mmW = bb.width * L.factor
    const mmH = bb.height * L.factor
    const nativePxPerCm = img.naturalWidth / o.width
    const pxPerCm = Math.min(nativePxPerCm, (200 / 25.4) * L.factor, 4000 / Math.max(bb.width, bb.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bb.width * pxPerCm))
    canvas.height = Math.max(1, Math.round(bb.height * pxPerCm))
    const c2d = canvas.getContext('2d')
    if (!c2d) return
    c2d.fillStyle = '#ffffff'
    c2d.fillRect(0, 0, canvas.width, canvas.height)
    c2d.translate((o.position.x - bb.x) * pxPerCm, (o.position.y - bb.y) * pxPerCm)
    c2d.rotate((o.rotation * Math.PI) / 180)
    c2d.globalAlpha = o.opacity
    c2d.drawImage(img, (-o.width / 2) * pxPerCm, (-o.height / 2) * pxPerCm, o.width * pxPerCm, o.height * pxPerCm)
    const tl = P({ x: bb.x, y: bb.y })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', tl.x, tl.y, mmW, mmH, undefined, 'FAST')
  }

  function drawRoomFill(o: RoomObject): void {
    const mat = resolveMaterial(o.material)
    withOpacity(o.zone === 'lot' ? 0.25 : mat ? 0.6 : o.zone === 'pool' ? 0.7 : 0.2, () => fillPath(o.points, mat?.color ?? o.color))
    if (o.zone === 'lot') {
      strokePath(o.points, true, COLORS.ink, 0.35, [3, 0.8, 0.6, 0.8])
      if (o.setback) strokePath(insetPolygon(o.points, o.setback), true, COLORS.dim, 0.2, [1.6, 1])
    }
  }

  function drawRoomLabel(o: RoomObject): void {
    const c = P(polygonCentroid(o.points))
    textCentered(o.name, { x: c.x, y: c.y - 1.6 }, 7.5, COLORS.ink, 0, true)
    textCentered(formatArea(polygonArea(o.points), ctx.unit, ctx.precision), { x: c.x, y: c.y + 1.8 }, 6.5, COLORS.muted)
  }

  function drawOpening(o: OpeningObject, tint: string | null): void {
    const wall = wallsById.get(o.wallId)
    if (!wall) return
    const g = openingGeometry(o, wall)
    const h = mul(g.normal, g.thickness / 2 + 0.6 / L.factor)
    // Vão branco recortando a parede
    fillPath([add(g.start, h), add(g.end, h), sub(g.end, h), sub(g.start, h)], '#ffffff')
    const hj = mul(g.normal, g.thickness / 2)
    const ink = tint ?? COLORS.ink
    strokePath([add(g.start, hj), sub(g.start, hj)], false, COLORS.wall, 0.25)
    strokePath([add(g.end, hj), sub(g.end, hj)], false, COLORS.wall, 0.25)
    for (const pr of openingPrims({ type: o.type, variant: o.variant, side: o.type === 'door' ? o.side : undefined, hinge: o.type === 'door' ? o.hinge : undefined }, g)) {
      if (pr.kind === 'line') {
        const w = pr.weight === 'heavy' ? 0.25 : pr.weight === 'thin' ? 0.12 : 0.16
        strokePath(pr.pts, !!pr.closed, ink, w, pr.dash ? [0.8, 0.6] : undefined)
      } else {
        strokePath(arcPoints(pr.center, pr.r, pr.from, pr.delta), false, ink, 0.13, [0.8, 0.6])
      }
    }
  }

  function drawText(o: TextObject, tint: string | null): void {
    const sizeMm = o.fontSize * L.factor
    const sizePt = sizeMm / PT_MM
    if (sizePt < 2) return
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(sizePt)
    pdf.setTextColor(o.color ?? tint ?? COLORS.ink)
    const t = (o.rotation * Math.PI) / 180
    const down = { x: -Math.sin(t), y: Math.cos(t) }
    const origin = P(o.position)
    o.text.split('\n').forEach((line, i) => {
      const base = add(origin, mul(down, sizeMm * (0.85 + i * 1.2)))
      pdf.text(line, base.x, base.y, { angle: -o.rotation })
    })
  }

  function drawBlock(o: BlockObject, tint: string | null): void {
    const def = ctx.resolveBlock(o.blockId)
    if (!def) return
    const m = instanceMatrix(o, def)
    const ink = o.stroke ?? tint ?? COLORS.blockStroke
    const fill = o.fill ?? '#ffffff'
    for (const s0 of def.shapes) drawBlockShape(transformShape(s0, m), ink, fill)
  }

  function drawBlockShape(s: BlockShape, ink: string, fillColor: string): void {
    const weight = s.weight ?? 1
    const lw = 0.18 * weight
    const dash = s.dash ? [0.9, 0.6] : undefined
    const fill = s.fill === 'fill' ? fillColor : s.fill === 'ink' ? ink : null
    let pts: Point[] | null = null
    let closed = true
    switch (s.kind) {
      case 'rect':
        pts = [
          { x: s.x, y: s.y },
          { x: s.x + s.w, y: s.y },
          { x: s.x + s.w, y: s.y + s.h },
          { x: s.x, y: s.y + s.h }
        ]
        break
      case 'ellipse': {
        const r = ((s.rotation ?? 0) * Math.PI) / 180
        pts = Array.from({ length: 40 }, (_, i) => {
          const t = (i / 40) * Math.PI * 2
          const x = Math.cos(t) * s.rx
          const y = Math.sin(t) * s.ry
          return { x: s.cx + x * Math.cos(r) - y * Math.sin(r), y: s.cy + x * Math.sin(r) + y * Math.cos(r) }
        })
        break
      }
      case 'poly':
        pts = []
        for (let i = 0; i < s.points.length; i += 2) pts.push({ x: s.points[i], y: s.points[i + 1] })
        closed = !!s.closed
        break
      case 'arc':
        pts = arcPoints({ x: s.cx, y: s.cy }, s.r, (s.start * Math.PI) / 180, ((s.end - s.start) * Math.PI) / 180)
        closed = false
        break
      case 'text': {
        const sizePt = (s.size * L.factor) / PT_MM
        if (sizePt < 2) return
        const w = s.text.length * s.size * 0.6
        const c = P({ x: s.x + (s.align === 'center' ? 0 : w / 2), y: s.y + s.size * 0.6 })
        textCentered(s.text, c, sizePt, ink, s.rotation ?? 0, true)
        return
      }
    }
    if (!pts) return
    if (fill && closed) {
      if (weight > 0) fillPath(pts, fill, { color: ink, width: lw })
      else fillPath(pts, fill)
      return
    }
    if (weight > 0) strokePath(pts, closed, ink, lw, dash)
  }

  function drawDimension(d: ReturnType<typeof layoutDimensions>[number], tint: string | null): void {
    const color = tint ?? COLORS.dim
    const px = PX_MM / L.factor // 1 "px" de papel, em cm
    const q1 = add(d.p1, mul(d.n, d.dist))
    const q2 = add(d.p2, mul(d.n, d.dist))
    if (d.dist - d.gap > px) {
      for (const [p, q] of [
        [d.p1, q1],
        [d.p2, q2]
      ]) {
        strokePath([add(p, mul(d.n, d.gap)), add(q, mul(d.n, 4 * px))], false, color, 0.1)
      }
    }
    const over = mul(d.dir, 4 * px)
    strokePath([sub(q1, over), add(q2, over)], false, color, 0.13)
    const slash = mul(normalize(add(d.dir, d.n)), 5 * px)
    strokePath([sub(q1, slash), add(q1, slash)], false, color, 0.25)
    strokePath([sub(q2, slash), add(q2, slash)], false, color, 0.25)
    const mid = { x: (q1.x + q2.x) / 2, y: (q1.y + q2.y) / 2 }
    const textAt = d.dist === 0 ? mid : add(mid, mul(d.n, 7 * px))
    const label = formatLength(d.length, ctx.unit, ctx.precision)
    if (d.dist === 0) {
      // Estilo linear (sobre a parede): fundo branco atrás do texto para legibilidade.
      pdf.setFontSize(6.5)
      const w = pdf.getTextWidth(label) + 1
      const t = (readableAngle(angleDeg(d.p1, d.p2)) * Math.PI) / 180
      const dir = { x: Math.cos(t), y: Math.sin(t) }
      const nrm = { x: -Math.sin(t), y: Math.cos(t) }
      const c = P(textAt)
      const hw = mul(dir, w / 2)
      const hh = mul(nrm, 1.4)
      pdf.setFillColor('#ffffff')
      const box = [add(add(c, hw), hh), add(sub(c, hw), hh), sub(sub(c, hw), hh), sub(add(c, hw), hh)]
      pdf.moveTo(box[0].x, box[0].y)
      box.slice(1).forEach((b) => pdf.lineTo(b.x, b.y))
      pdf.close()
      pdf.fill()
    }
    textCentered(label, P(textAt), 6.5, color, readableAngle(angleDeg(d.p1, d.p2)), true)
  }

  // ================================================================ anotações

  function drawLegend(r: Rect): void {
    const rooms = objects.filter((o): o is RoomObject => o.type === 'room' && o.zone !== 'lot')
    pdf.setDrawColor(COLORS.frame)
    pdf.setLineWidth(0.25)
    pdf.rect(r.x, r.y, r.width, r.height)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.setTextColor(COLORS.ink)
    pdf.text('QUADRO DE ÁREAS', r.x + 3, r.y + 6)
    pdf.setLineWidth(0.15)
    pdf.line(r.x, r.y + 8.5, r.x + r.width, r.y + 8.5)
    let y = r.y + 14
    const row = 5.2
    pdf.setFontSize(7.5)
    for (const room of rooms) {
      if (y > r.y + r.height - 12) {
        pdf.setFont('helvetica', 'normal')
        pdf.text(`… e mais ${rooms.length - rooms.indexOf(room)} cômodo(s)`, r.x + 3, y)
        break
      }
      const area = polygonArea(room.points)
      pdf.setFillColor(room.color)
      pdf.rect(r.x + 3, y - 2.6, 2.8, 2.8, 'F')
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(COLORS.ink)
      const name = room.name.length > 26 ? `${room.name.slice(0, 25)}…` : room.name
      pdf.text(name, r.x + 7.5, y)
      pdf.text(formatArea(area, ctx.unit, ctx.precision), r.x + r.width - 3, y, { align: 'right' })
      y += row
    }
    const total = rooms.reduce((s, room) => s + polygonArea(room.points), 0)
    pdf.setLineWidth(0.15)
    pdf.line(r.x, r.y + r.height - 8, r.x + r.width, r.y + r.height - 8)
    pdf.setFont('helvetica', 'bold')
    pdf.text('Área total', r.x + 3, r.y + r.height - 3)
    pdf.text(formatArea(total, ctx.unit, ctx.precision), r.x + r.width - 3, r.y + r.height - 3, { align: 'right' })
  }

  function drawTitleBlock(r: Rect): void {
    pdf.setDrawColor(COLORS.frame)
    pdf.setLineWidth(0.3)
    pdf.rect(r.x, r.y, r.width, r.height)
    const scaleText = opts.scale === 'fit' ? `1:${Math.round(L.scaleDen)} (ajustada)` : `1:${opts.scale}`
    const cells: [string, string, number][] = [
      ['PROJETO', `${opts.projectName || doc.name}${levelName ? ` — ${levelName}` : ''}`, 0.4],
      ['AUTOR', opts.author || '—', 0.22],
      ['DATA', opts.date || '—', 0.13],
      ['ESCALA', scaleText, 0.13],
      ['FOLHA', `${PAPER_LABEL[opts.paper]} ${opts.orientation === 'landscape' ? 'paisagem' : 'retrato'}`, 0.12]
    ]
    let x = r.x
    cells.forEach(([label, value, frac], i) => {
      const w = r.width * frac
      if (i > 0) pdf.line(x, r.y, x, r.y + r.height)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6)
      pdf.setTextColor(COLORS.muted)
      pdf.text(label, x + 2.5, r.y + 5)
      pdf.setFont('helvetica', i === 0 ? 'bold' : 'normal')
      pdf.setFontSize(i === 0 ? 12 : 9)
      pdf.setTextColor(COLORS.ink)
      const maxW = w - 5
      let v = value
      while (v.length > 3 && pdf.getTextWidth(v) > maxW) v = `${v.slice(0, -2)}…`
      pdf.text(v, x + 2.5, r.y + 13.5)
      x += w
    })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(5.5)
    pdf.setTextColor(COLORS.muted)
    pdf.text('Gerado com PlanKraft', r.x + r.width - 2, r.y + r.height - 1.8, { align: 'right' })
  }
}
