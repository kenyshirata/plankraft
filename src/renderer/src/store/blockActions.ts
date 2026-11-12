/**
 * Ações de blocos: inserir instância, girar, espelhar, redimensionar,
 * "Salvar seleção como bloco" e "Redefinir símbolo" (atualiza todas as instâncias).
 */
import type { BlockDef } from '@shared/blocks'
import { findLayerByRole, newId, type BlockObject, type Id, type Point, type WallObject } from '@shared/model'
import { add } from '@renderer/lib/geometry'
import { normalizeShapes, objectsToShapes, snapBlockToWalls } from '@renderer/lib/blockGeometry'
import { addObjects, editableLayerIds, mapObjects, removeObjects, updateObject, wallsOf } from './docOps'
import { useEditorStore } from './editorStore'
import { resolveBlock, useLibraryStore, withEmbeddedBlock } from './libraryStore'
import { useSettingsStore } from './settingsStore'
import { toast } from './toastStore'

/** Distância (cm) dentro da qual o bloco "gruda" na parede. */
export const WALL_SNAP_CM = 30

const st = useEditorStore.getState

/** Camada para novos blocos: "Móveis" (se a troca automática estiver ligada) ou a ativa. */
function targetLayerId(): Id | null {
  const { doc, activeLayerId } = st()
  const furniture = findLayerByRole(doc, 'furniture')
  const id = useSettingsStore.getState().autoLayerByTool && furniture ? furniture.id : activeLayerId
  const layer = doc.layers.find((l) => l.id === id)
  if (!layer) return null
  if (layer.locked || !layer.visible) {
    toast.warning(`A camada “${layer.name}” está ${layer.locked ? 'bloqueada' : 'oculta'}.`)
    return null
  }
  return id
}

function visibleWalls(): WallObject[] {
  const { doc } = st()
  const visible = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id))
  return wallsOf(doc).filter((w) => visible.has(w.layerId))
}

/** Instância "fantasma" na posição dada, já encaixada na parede mais próxima (se houver). */
export function previewInstance(def: BlockDef, at: Point, rotation: number, snap = true): BlockObject {
  const inst: BlockObject = {
    id: 'preview',
    type: 'block',
    layerId: '',
    blockId: def.id,
    position: at,
    rotation,
    scaleX: 1,
    scaleY: 1,
    flipX: false,
    flipY: false,
    fill: null,
    stroke: null
  }
  const snapped = snap ? snapBlockToWalls(inst, def, visibleWalls(), WALL_SNAP_CM) : null
  return snapped ? { ...inst, ...snapped } : inst
}

/** Insere uma instância do bloco em `at` (cm). Retorna o id criado. */
export function insertBlock(blockId: string, at: Point, rotation = 0, snap = true): Id | null {
  const def = resolveBlock(blockId, st().doc)
  if (!def) {
    toast.error('Bloco não encontrado.')
    return null
  }
  const layerId = targetLayerId()
  if (!layerId) return null
  const inst: BlockObject = { ...previewInstance(def, at, rotation, snap), id: newId(), layerId }
  st().commit((d) => addObjects(withEmbeddedBlock(d, def), [inst]))
  st().select([inst.id])
  return inst.id
}

function selectedBlocks(): BlockObject[] {
  const { doc, selectedIds } = st()
  const editable = editableLayerIds(doc)
  return doc.objects.filter((o): o is BlockObject => o.type === 'block' && selectedIds.includes(o.id) && editable.has(o.layerId))
}

export function rotateSelectedBlocks(deg: number): boolean {
  const blocks = selectedBlocks()
  if (!blocks.length) return false
  st().commit((d) =>
    mapObjects(d, blocks.map((b) => b.id), (o) => (o.type === 'block' ? { ...o, rotation: (((o.rotation + deg) % 360) + 360) % 360 } : o))
  )
  return true
}

export function flipSelectedBlocks(axis: 'x' | 'y'): void {
  const blocks = selectedBlocks()
  if (!blocks.length) return
  st().commit((d) =>
    mapObjects(d, blocks.map((b) => b.id), (o) =>
      o.type === 'block' ? (axis === 'x' ? { ...o, flipX: !o.flipX } : { ...o, flipY: !o.flipY }) : o
    )
  )
}

export function patchBlock(id: Id, patch: Partial<BlockObject>): void {
  st().commit((d) => updateObject(d, id, 'block', (o) => ({ ...o, ...patch })))
}

/** Define o tamanho final (cm) de uma instância. */
export function setBlockSize(id: Id, width: number | null, height: number | null, keepRatio: boolean): void {
  const { doc } = st()
  const inst = doc.objects.find((o): o is BlockObject => o.id === id && o.type === 'block')
  const def = inst && resolveBlock(inst.blockId, doc)
  if (!inst || !def) return
  let sx = inst.scaleX
  let sy = inst.scaleY
  if (width !== null) {
    sx = Math.max(0.01, width / def.width)
    if (keepRatio) sy = sy * (sx / inst.scaleX)
  }
  if (height !== null) {
    sy = Math.max(0.01, height / def.height)
    if (keepRatio) sx = sx * (sy / inst.scaleY)
  }
  patchBlock(id, { scaleX: sx, scaleY: sy })
}

// ------------------------------------------------------------ blocos do usuário

export interface BlockMeta {
  name: string
  category: string
  icon?: string
}

/** Formas da seleção atual (coordenadas normalizadas) — ou null com aviso. */
function shapesFromSelection(): { shapes: BlockDef['shapes']; width: number; height: number; origin: Point; ids: Id[] } | null {
  const { doc, selectedIds } = st()
  const editable = editableLayerIds(doc)
  const objects = doc.objects.filter((o) => selectedIds.includes(o.id) && editable.has(o.layerId))
  if (!objects.length) {
    toast.warning('Selecione os objetos que formarão o bloco.')
    return null
  }
  const walls = new Map(wallsOf(doc).map((w) => [w.id, w]))
  const { shapes, skipped } = objectsToShapes(objects, walls, (id) => resolveBlock(id, doc))
  if (!shapes.length) {
    toast.warning('A seleção não tem formas que possam virar bloco (cotas são ignoradas).')
    return null
  }
  if (skipped) toast.info(`${skipped} objeto(s) ignorado(s) (cotas não entram em blocos).`)
  return { ...normalizeShapes(shapes), ids: objects.map((o) => o.id) }
}

/** "Salvar seleção como bloco": cria o símbolo na biblioteca pessoal (e, opcionalmente, troca a seleção por uma instância). */
export function createBlockFromSelection(meta: BlockMeta, replaceSelection: boolean): BlockDef | null {
  const res = shapesFromSelection()
  if (!res) return null
  const def: BlockDef = {
    id: newId(),
    name: meta.name.trim() || 'Meu bloco',
    category: meta.category.trim() || 'Meus blocos',
    icon: meta.icon || undefined,
    width: res.width,
    height: res.height,
    shapes: res.shapes,
    updatedAt: new Date().toISOString()
  }
  useLibraryStore.getState().upsertBlock(def)
  if (replaceSelection) {
    const layerId = targetLayerId() ?? st().activeLayerId
    const inst: BlockObject = {
      id: newId(),
      type: 'block',
      layerId,
      blockId: def.id,
      position: add(res.origin, { x: def.width / 2, y: def.height / 2 }),
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      flipX: false,
      flipY: false,
      fill: null,
      stroke: null
    }
    st().commit((d) => addObjects(withEmbeddedBlock(removeObjects(d, res.ids), def), [inst]))
    st().select([inst.id])
  }
  toast.success(`Bloco “${def.name}” salvo na sua biblioteca.`)
  return def
}

/**
 * Redefine o símbolo com a seleção atual: TODAS as instâncias (neste projeto e
 * em projetos futuros) passam a usar o novo desenho.
 */
export function redefineBlockFromSelection(blockId: string): void {
  const { doc } = st()
  const current = resolveBlock(blockId, doc)
  if (!current || current.builtin) {
    toast.warning('Só blocos personalizados podem ser redefinidos.')
    return
  }
  const res = shapesFromSelection()
  if (!res) return
  const def: BlockDef = { ...current, width: res.width, height: res.height, shapes: res.shapes, updatedAt: new Date().toISOString() }
  if (useLibraryStore.getState().blocks.some((b) => b.id === blockId)) useLibraryStore.getState().upsertBlock(def)
  const used = doc.objects.filter((o) => o.type === 'block' && o.blockId === blockId).length
  st().commit((d) => withEmbeddedBlock(d, def))
  toast.success(`“${def.name}” redefinido${used ? ` — ${used} instância(s) atualizada(s)` : ''}.`)
}

/** Altera nome/categoria/ícone de um bloco personalizado (biblioteca e projeto). */
export function updateBlockMeta(blockId: string, meta: BlockMeta): void {
  const { doc } = st()
  const current = resolveBlock(blockId, doc)
  if (!current || current.builtin) return
  const def: BlockDef = {
    ...current,
    name: meta.name.trim() || current.name,
    category: meta.category.trim() || current.category,
    icon: meta.icon || undefined,
    updatedAt: new Date().toISOString()
  }
  if (useLibraryStore.getState().blocks.some((b) => b.id === blockId)) useLibraryStore.getState().upsertBlock(def)
  if (doc.blocks.some((b) => b.id === blockId)) st().commit((d) => withEmbeddedBlock(d, def))
}

/** Copia para a biblioteca pessoal um bloco que só existe no projeto aberto. */
export function addProjectBlockToLibrary(blockId: string): void {
  const def = st().doc.blocks.find((b) => b.id === blockId)
  if (!def) return
  useLibraryStore.getState().upsertBlock(def)
  toast.success(`“${def.name}” adicionado à sua biblioteca.`)
}
