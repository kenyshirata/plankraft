/** Ações de andares (pavimentos): criar, duplicar, renomear, excluir, altura. */
import { createDefaultLayers, createLevel, DEFAULT_LEVEL_HEIGHT, type Id, type Level, type PlanDocument } from '@shared/model'
import { addObjects, cloneObjects, removeObjects } from './docOps'
import { useEditorStore } from './editorStore'
import { confirmDialog } from './dialogStore'
import { toast } from './toastStore'

const st = (): ReturnType<typeof useEditorStore.getState> => useEditorStore.getState()

/** Recalcula as cotas dos andares: cada um começa onde o de baixo termina. */
export function restack(levels: Level[]): Level[] {
  let z = 0
  return levels.map((l) => {
    const out = l.elevation === z ? l : { ...l, elevation: z }
    z += l.height
    return out
  })
}

export const levelLabel = (index: number): string => (index === 0 ? 'Térreo' : `${index}º andar`)

/** Novo andar vazio acima do último; passa a ser o andar ativo. */
export function addLevel(): Id {
  const { doc, commit } = st()
  const level = createLevel(levelLabel(doc.levels.length), 0, DEFAULT_LEVEL_HEIGHT)
  commit((d) => ({ ...d, levels: restack([...d.levels, level]), layers: [...d.layers, ...createDefaultLayers(level.id)] }))
  st().setActiveLevel(level.id)
  return level.id
}

/** Copia as paredes, cômodos e móveis do andar para um novo andar no topo. */
export function duplicateLevel(id: Id): Id | null {
  const { doc, commit } = st()
  const src = doc.levels.find((l) => l.id === id)
  if (!src) return null
  const level = createLevel(levelLabel(doc.levels.length), 0, src.height)
  const srcLayers = doc.layers.filter((l) => l.levelId === id)
  const layerMap = new Map(srcLayers.map((l) => [l.id, crypto.randomUUID()]))
  const newLayers = srcLayers.map((l) => ({ ...l, id: layerMap.get(l.id)!, levelId: level.id }))
  const srcObjects = doc.objects.filter((o) => layerMap.has(o.layerId))
  const copies = cloneObjects(srcObjects, { x: 0, y: 0 }).map((o) => ({ ...o, layerId: layerMap.get(o.layerId)! }))
  commit((d) => addObjects({ ...d, levels: restack([...d.levels, level]), layers: [...d.layers, ...newLayers] }, copies))
  st().setActiveLevel(level.id)
  toast.success(`${level.name} criado a partir de “${src.name}”.`)
  return level.id
}

export function renameLevel(id: Id, name: string): void {
  const clean = name.trim().slice(0, 40)
  const lv = st().doc.levels.find((l) => l.id === id)
  if (!lv || !clean || clean === lv.name) return
  st().commit((d) => ({ ...d, levels: d.levels.map((l) => (l.id === id ? { ...l, name: clean } : l)) }))
}

/** Altura de piso a piso (cm); reposiciona os andares acima. */
export function setLevelHeight(id: Id, height: number): void {
  const h = Math.min(600, Math.max(200, Math.round(height)))
  const lv = st().doc.levels.find((l) => l.id === id)
  if (!lv || lv.height === h) return
  st().commit((d) => ({ ...d, levels: restack(d.levels.map((l) => (l.id === id ? { ...l, height: h } : l))) }))
}

export async function deleteLevel(id: Id): Promise<void> {
  const { doc } = st()
  const lv = doc.levels.find((l) => l.id === id)
  if (!lv) return
  if (doc.levels.length <= 1) {
    toast.warning('O projeto precisa ter pelo menos um andar.')
    return
  }
  const layerIds = new Set(doc.layers.filter((l) => l.levelId === id).map((l) => l.id))
  const count = doc.objects.filter((o) => layerIds.has(o.layerId)).length
  const ok = await confirmDialog(
    `Excluir “${lv.name}”?`,
    count ? `O andar tem ${count} objeto${count > 1 ? 's' : ''}, que serão excluídos junto (dá para desfazer com Ctrl+Z).` : 'O andar está vazio.',
    'Excluir',
    true
  )
  if (!ok) return
  const idx = doc.levels.findIndex((l) => l.id === id)
  const fallback = doc.levels[idx - 1] ?? doc.levels[idx + 1]
  st().commit((d: PlanDocument) => {
    const removed = removeObjects(d, d.objects.filter((o) => layerIds.has(o.layerId)).map((o) => o.id))
    return { ...removed, levels: restack(d.levels.filter((l) => l.id !== id)), layers: d.layers.filter((l) => !layerIds.has(l.id)) }
  })
  if (st().activeLevelId === id) st().setActiveLevel(fallback.id)
}
