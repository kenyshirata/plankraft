/**
 * Serialização do projeto (.plankraft) e normalização defensiva na leitura.
 * Arquivos podem vir de versões antigas ou editados à mão: tudo é validado e
 * campos ausentes recebem valores padrão; objetos inválidos são descartados.
 */
import {
  createDefaultLayers,
  createLevel,
  type DoorVariant,
  type WindowVariant,
  DEFAULT_LEVEL_HEIGHT,
  hostWallId,
  newId,
  type Layer,
  type Level,
  type PlanDocument,
  type PlanObject,
  type Point,
  type ProjectFile
} from './model'
import { normalizeBlockDef, type BlockDef } from './blocks'

export function serializeProject(doc: PlanDocument): string {
  // Só embute definições de blocos que algum objeto ainda usa.
  const used = new Set(doc.objects.filter((o) => o.type === 'block').map((o) => (o as { blockId: string }).blockId))
  const pruned = { ...doc, blocks: doc.blocks.filter((b) => used.has(b.id)) }
  const file: ProjectFile = { format: 'plankraft', version: 1, savedAt: new Date().toISOString(), document: pruned }
  return JSON.stringify(file, null, 2)
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback)
const point = (v: unknown): Point | null =>
  isRec(v) && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y)
    ? { x: v.x, y: v.y }
    : null

function normalizeLayer(v: unknown): Layer | null {
  if (!isRec(v)) return null
  return {
    id: str(v.id, newId()),
    name: str(v.name, 'Camada'),
    levelId: typeof v.levelId === 'string' ? v.levelId : undefined,
    visible: v.visible !== false,
    locked: v.locked === true,
    opacity: Math.min(1, Math.max(0, num(v.opacity, 1))),
    color: typeof v.color === 'string' ? v.color : null,
    role: typeof v.role === 'string' ? (v.role as Layer['role']) : undefined
  }
}

function normalizeObject(v: unknown, layerIds: Set<string>, fallbackLayer: string): PlanObject | null {
  if (!isRec(v)) return null
  const id = str(v.id, newId())
  const layerId = typeof v.layerId === 'string' && layerIds.has(v.layerId) ? v.layerId : fallbackLayer
  switch (v.type) {
    case 'wall': {
      const a = point(v.a)
      const b = point(v.b)
      return a && b
        ? { id, layerId, type: 'wall', a, b, thickness: Math.max(1, num(v.thickness, 15)), ...(typeof v.material === 'string' ? { material: v.material } : {}) }
        : null
    }
    case 'door':
    case 'window': {
      if (typeof v.wallId !== 'string') return null
      const base = { id, layerId, wallId: v.wallId, offset: num(v.offset, 0), width: Math.max(10, num(v.width, 80)) }
      const dv = ['double', 'sliding', 'open'].includes(v.variant as string) ? (v.variant as DoorVariant) : undefined
      const wv = ['sliding', 'tilt', 'fixed'].includes(v.variant as string) ? (v.variant as WindowVariant) : undefined
      return v.type === 'door'
        ? { ...base, type: 'door', side: v.side === -1 ? -1 : 1, hinge: v.hinge === 'end' ? 'end' : 'start', ...(dv ? { variant: dv } : {}) }
        : {
            ...base,
            type: 'window',
            ...(wv ? { variant: wv } : {}),
            ...(typeof v.sill === 'number' && Number.isFinite(v.sill) ? { sill: Math.min(250, Math.max(0, v.sill)) } : {}),
            ...(typeof v.height === 'number' && Number.isFinite(v.height) ? { height: Math.min(250, Math.max(20, v.height)) } : {})
          }
    }
    case 'room': {
      const pts = Array.isArray(v.points) ? v.points.map(point).filter((p): p is Point => p !== null) : []
      return pts.length >= 3
        ? {
            id,
            layerId,
            type: 'room',
            name: str(v.name, 'Cômodo'),
            points: pts,
            color: str(v.color, '#7aa2ff'),
            ...(typeof v.material === 'string' ? { material: v.material } : {})
          }
        : null
    }
    case 'text': {
      const position = point(v.position)
      return position
        ? {
            id,
            layerId,
            type: 'text',
            position,
            text: str(v.text, ''),
            fontSize: Math.max(1, num(v.fontSize, 25)),
            rotation: num(v.rotation, 0),
            color: typeof v.color === 'string' ? v.color : null
          }
        : null
    }
    case 'dimension': {
      const offset = typeof v.offset === 'number' && Number.isFinite(v.offset) ? v.offset : null
      if (v.kind === 'wall' && typeof v.wallId === 'string') {
        return { id, layerId, type: 'dimension', kind: 'wall', wallId: v.wallId, offset }
      }
      const a = point(v.a)
      const b = point(v.b)
      return a && b ? { id, layerId, type: 'dimension', kind: 'free', a, b, offset } : null
    }
    case 'block': {
      const position = point(v.position)
      if (!position || typeof v.blockId !== 'string') return null
      const scale = (x: unknown): number => Math.min(100, Math.max(0.01, Math.abs(num(x, 1))))
      return {
        id,
        layerId,
        type: 'block',
        blockId: v.blockId,
        position,
        rotation: num(v.rotation, 0),
        scaleX: scale(v.scaleX),
        scaleY: scale(v.scaleY),
        flipX: v.flipX === true,
        flipY: v.flipY === true,
        fill: typeof v.fill === 'string' ? v.fill : null,
        stroke: typeof v.stroke === 'string' ? v.stroke : null
      }
    }
    case 'image': {
      const position = point(v.position)
      if (!position || typeof v.asset !== 'string' || !/^[a-zA-Z0-9-]{8,64}\.(png|jpg|jpeg)$/.test(v.asset)) return null
      return {
        id,
        layerId,
        type: 'image',
        asset: v.asset,
        name: str(v.name, v.asset).slice(0, 200),
        position,
        width: Math.max(1, num(v.width, 1000)),
        height: Math.max(1, num(v.height, 1000)),
        rotation: num(v.rotation, 0),
        pixelWidth: Math.max(1, num(v.pixelWidth, 1)),
        pixelHeight: Math.max(1, num(v.pixelHeight, 1)),
        opacity: Math.min(1, Math.max(0, num(v.opacity, 0.6))),
        hidden: v.hidden === true,
        locked: v.locked === true
      }
    }
    default:
      return null // tipo desconhecido (ex.: de uma versão futura) → ignorado
  }
}

/** Converte o conteúdo bruto de um arquivo em PlanDocument válido (ou lança erro amigável). */
export function parseProject(raw: unknown, fallbackName: string): PlanDocument {
  const data = isRec(raw) && raw.format === 'plankraft' && isRec(raw.document) ? raw.document : raw
  if (!isRec(data) || !Array.isArray(data.objects)) {
    throw new Error('O arquivo não parece ser um projeto PlanKraft válido.')
  }
  // Andares: arquivos antigos (sem andares) viram um único "Térreo".
  let levels: Level[] = Array.isArray(data.levels)
    ? data.levels.flatMap((v): Level[] =>
        isRec(v)
          ? [
              {
                id: str(v.id, newId()),
                name: str(v.name, 'Andar'),
                elevation: num(v.elevation, 0),
                height: Math.max(100, num(v.height, DEFAULT_LEVEL_HEIGHT))
              }
            ]
          : []
      )
    : []
  if (levels.length === 0) levels = [createLevel('Térreo', 0)]
  const firstLevel = levels[0].id
  const levelIds = new Set(levels.map((l) => l.id))
  let layers = Array.isArray(data.layers) ? data.layers.map(normalizeLayer).filter((l): l is Layer => l !== null) : []
  if (layers.length === 0) layers = createDefaultLayers(firstLevel)
  layers = layers.map((l) => (l.levelId && levelIds.has(l.levelId) ? l : { ...l, levelId: firstLevel }))
  // Todo andar precisa ter camadas próprias.
  for (const lv of levels) {
    if (!layers.some((l) => l.levelId === lv.id)) layers = [...layers, ...createDefaultLayers(lv.id)]
  }
  const layerIds = new Set(layers.map((l) => l.id))
  const fallbackLayer = (layers.find((l) => l.role === 'walls') ?? layers[layers.length - 1]).id

  let objects = data.objects
    .map((o) => normalizeObject(o, layerIds, fallbackLayer))
    .filter((o): o is PlanObject => o !== null)
  // Aberturas/cotas cuja parede não existe mais são descartadas.
  const wallIds = new Set(objects.filter((o) => o.type === 'wall').map((o) => o.id))
  objects = objects.filter((o) => {
    const host = hostWallId(o)
    return host === null || wallIds.has(host)
  })

  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    id: str(data.id, newId()),
    name: str(data.name, fallbackName),
    createdAt: str(data.createdAt, now),
    updatedAt: str(data.updatedAt, now),
    levels,
    layers,
    objects,
    blocks: Array.isArray(data.blocks)
      ? data.blocks.map(normalizeBlockDef).filter((b): b is BlockDef => b !== null && !b.id.startsWith('builtin:'))
      : []
  }
}
