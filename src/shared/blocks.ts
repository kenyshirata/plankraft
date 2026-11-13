/**
 * Blocos (símbolos reutilizáveis): definição vetorial + validação.
 *
 * Um BlockDef descreve o símbolo em coordenadas LOCAIS (cm), dentro da caixa
 * 0..width × 0..height. Convenção: a "frente" do móvel aponta para +Y (baixo) e
 * o "fundo" (encosto, cabeceira, caixa acoplada…) fica em Y=0 — é esse lado que
 * encosta na parede no encaixe automático.
 *
 * Instâncias (BlockObject, em model.ts) só referenciam o símbolo por `blockId`
 * e guardam posição/rotação/escala/espelhamento/cores → redefinir o símbolo
 * atualiza todas as instâncias.
 */

export type BlockFill = 'none' | 'fill' | 'ink'

interface ShapeBase {
  /** 'fill' = cor de preenchimento da instância; 'ink' = cor do traço (sólido); 'none' = vazado. */
  fill?: BlockFill
  /** Traço tracejado. */
  dash?: boolean
  /** Multiplicador da espessura do traço (padrão 1). 0 = sem traço. */
  weight?: number
}

export type BlockShape =
  | (ShapeBase & { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number })
  | (ShapeBase & { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotation?: number })
  | (ShapeBase & { kind: 'poly'; points: number[]; closed?: boolean })
  | (ShapeBase & { kind: 'arc'; cx: number; cy: number; r: number; start: number; end: number })
  | (ShapeBase & { kind: 'text'; x: number; y: number; text: string; size: number; rotation?: number; align?: 'left' | 'center' })

/** Modelo 3D (glTF binário, .glb) embutido no bloco, para aparecer em volume na maquete. */
export interface BlockModel {
  /** Conteúdo do .glb em base64. */
  data: string
  /** Tamanho original do modelo (m): largura (X), altura (Y) e profundidade (Z). */
  size: [number, number, number]
}

/** Limite do .glb por bloco (bytes) e prefixo base64 do cabeçalho "glTF". */
export const MAX_MODEL_BYTES = 3 * 1024 * 1024
export const GLB_B64_PREFIX = 'Z2xURg'

export interface BlockDef {
  /** 'builtin:…' para símbolos de fábrica; uuid para personalizados. */
  id: string
  name: string
  category: string
  /** Emoji opcional exibido na biblioteca (blocos personalizados). */
  icon?: string
  width: number
  height: number
  shapes: BlockShape[]
  /** Modelo 3D opcional (o símbolo 2D continua sendo a planta do móvel). */
  model?: BlockModel
  builtin?: boolean
  /** Data de criação/alteração (personalizados). */
  updatedAt?: string
}

/** Arquivo da biblioteca pessoal (userData/block-library.json). */
export interface BlockLibraryFile {
  version: 1
  blocks: BlockDef[]
  /** Ids favoritados (inclui símbolos de fábrica). */
  favorites: string[]
}

export const MAX_LIBRARY_BLOCKS = 500
export const MAX_SHAPES_PER_BLOCK = 5000

// ------------------------------------------------------------------ validação

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const FILLS: BlockFill[] = ['none', 'fill', 'ink']

function normalizeShape(v: unknown): BlockShape | null {
  if (!isRec(v)) return null
  const base: ShapeBase = {
    fill: FILLS.includes(v.fill as BlockFill) ? (v.fill as BlockFill) : undefined,
    dash: v.dash === true ? true : undefined,
    weight: fin(v.weight) ? Math.max(0, Math.min(10, v.weight)) : undefined
  }
  switch (v.kind) {
    case 'rect':
      return fin(v.x) && fin(v.y) && fin(v.w) && fin(v.h)
        ? { ...base, kind: 'rect', x: v.x, y: v.y, w: v.w, h: v.h, r: fin(v.r) ? v.r : undefined }
        : null
    case 'ellipse':
      return fin(v.cx) && fin(v.cy) && fin(v.rx) && fin(v.ry)
        ? { ...base, kind: 'ellipse', cx: v.cx, cy: v.cy, rx: v.rx, ry: v.ry, rotation: fin(v.rotation) ? v.rotation : undefined }
        : null
    case 'poly':
      return Array.isArray(v.points) && v.points.length >= 4 && v.points.length % 2 === 0 && v.points.every(fin)
        ? { ...base, kind: 'poly', points: v.points as number[], closed: v.closed === true ? true : undefined }
        : null
    case 'arc':
      return fin(v.cx) && fin(v.cy) && fin(v.r) && fin(v.start) && fin(v.end)
        ? { ...base, kind: 'arc', cx: v.cx, cy: v.cy, r: v.r, start: v.start, end: v.end }
        : null
    case 'text':
      return fin(v.x) && fin(v.y) && fin(v.size) && typeof v.text === 'string'
        ? {
            ...base,
            kind: 'text',
            x: v.x,
            y: v.y,
            size: v.size,
            text: v.text.slice(0, 500),
            rotation: fin(v.rotation) ? v.rotation : undefined,
            align: v.align === 'center' ? 'center' : undefined
          }
        : null
    default:
      return null
  }
}

/** Valida um BlockDef vindo de arquivo (biblioteca ou projeto). null se inválido. */
export function normalizeBlockDef(v: unknown): BlockDef | null {
  if (!isRec(v) || typeof v.id !== 'string' || !fin(v.width) || !fin(v.height) || !Array.isArray(v.shapes)) return null
  if (v.width <= 0 || v.height <= 0) return null
  const shapes = v.shapes.slice(0, MAX_SHAPES_PER_BLOCK).map(normalizeShape).filter((s): s is BlockShape => s !== null)
  return {
    id: v.id.slice(0, 100),
    name: typeof v.name === 'string' && v.name.trim() ? v.name.slice(0, 80) : 'Bloco',
    category: typeof v.category === 'string' && v.category.trim() ? v.category.slice(0, 40) : 'Meus blocos',
    icon: typeof v.icon === 'string' ? v.icon.slice(0, 8) : undefined,
    width: v.width,
    height: v.height,
    shapes,
    model: normalizeModel(v.model),
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : undefined
  }
}

function normalizeModel(v: unknown): BlockModel | undefined {
  if (!isRec(v) || typeof v.data !== 'string' || !Array.isArray(v.size) || v.size.length !== 3) return undefined
  if (!v.data.startsWith(GLB_B64_PREFIX) || v.data.length > Math.ceil((MAX_MODEL_BYTES * 4) / 3) + 8) return undefined
  const size = v.size as unknown[]
  if (!size.every((n) => fin(n) && n > 0 && n < 10000)) return undefined
  return { data: v.data, size: [size[0], size[1], size[2]] as [number, number, number] }
}

export function normalizeLibraryFile(v: unknown): BlockLibraryFile {
  const rec = isRec(v) ? v : {}
  const blocks = Array.isArray(rec.blocks)
    ? rec.blocks
        .slice(0, MAX_LIBRARY_BLOCKS)
        .map(normalizeBlockDef)
        .filter((b): b is BlockDef => b !== null && !b.id.startsWith('builtin:'))
    : []
  const favorites = Array.isArray(rec.favorites) ? rec.favorites.filter((f): f is string => typeof f === 'string').slice(0, 1000) : []
  return { version: 1, blocks, favorites }
}
