/**
 * Operações de camada usadas pelo painel de Camadas e menus.
 * Operações estruturais e de conteúdo (criar, renomear, cor, duplicar, excluir,
 * reordenar, mover objetos) passam por commit() e podem ser desfeitas.
 */
import { newId, type Id, type Layer } from '@shared/model'
import { duplicateLayer as dupLayerOp, editableLayerIds, insertLayer, mapObjects, moveLayer, patchLayer, removeLayer } from './docOps'
import { askDialog } from './dialogStore'
import { useEditorStore } from './editorStore'
import { toast } from './toastStore'

/** Paleta sugerida para cor de destaque (tint) de camadas. */
export const LAYER_COLORS = ['#4f6bff', '#16a34a', '#e11d48', '#f59e0b', '#0ea5e9', '#9333ea', '#64748b', '#c2410c']

const st = useEditorStore.getState

/** Gera "Camada N" sem repetir nomes existentes. */
function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  for (let i = 2; ; i++) {
    const name = `${base} ${i}`
    if (!existing.includes(name)) return name
  }
}

/** Cria uma camada acima da ativa, torna-a ativa e devolve o id (para entrar em modo de renomear). */
export function createLayer(): Id {
  const { doc, activeLayerId, commit, setActiveLayer } = st()
  const layer: Layer = {
    id: newId(),
    name: uniqueName('Nova camada', doc.layers.map((l) => l.name)),
    visible: true,
    locked: false,
    opacity: 1,
    color: null
  }
  commit((d) => insertLayer(d, layer, activeLayerId))
  setActiveLayer(layer.id)
  return layer.id
}

export function renameLayer(id: Id, name: string): void {
  const clean = name.trim().slice(0, 60)
  const layer = st().doc.layers.find((l) => l.id === id)
  if (!layer || !clean || clean === layer.name) return
  st().commit((d) => patchLayer(d, id, { name: clean }))
}

export function setLayerColor(id: Id, color: string | null): void {
  st().commit((d) => patchLayer(d, id, { color }))
}

export function duplicateLayer(id: Id): void {
  const { doc, commit, setActiveLayer } = st()
  const src = doc.layers.find((l) => l.id === id)
  if (!src) return
  const copy: Layer = {
    ...src,
    id: newId(),
    role: undefined, // o papel semântico é único por documento
    locked: false,
    name: uniqueName(`${src.name} (cópia)`, doc.layers.map((l) => l.name))
  }
  commit((d) => dupLayerOp(d, id, copy))
  setActiveLayer(copy.id)
  const n = doc.objects.filter((o) => o.layerId === id).length
  toast.success(n ? `Camada duplicada com ${n} objeto${n > 1 ? 's' : ''}.` : 'Camada duplicada.')
}

/** Exclui a camada, perguntando o que fazer com os objetos quando houver algum. */
export async function deleteLayer(id: Id): Promise<void> {
  const { doc } = st()
  const layer = doc.layers.find((l) => l.id === id)
  if (!layer) return
  if (doc.layers.length <= 1) {
    toast.warning('O projeto precisa ter pelo menos uma camada.')
    return
  }
  const count = doc.objects.filter((o) => o.layerId === id).length
  // Destino sugerido para os objetos: a camada logo abaixo (ou acima, se for a última).
  const idx = doc.layers.findIndex((l) => l.id === id)
  const target = doc.layers[idx - 1] ?? doc.layers[idx + 1]

  let moveTo: Id | undefined
  if (count > 0) {
    const choice = await askDialog({
      title: `Excluir a camada “${layer.name}”?`,
      message: `Esta camada contém ${count} objeto${count > 1 ? 's' : ''}. Você pode movê-lo${count > 1 ? 's' : ''} para “${target.name}” ou excluir tudo.`,
      actions: [
        { label: 'Cancelar', value: 'cancel' },
        { label: 'Excluir tudo', value: 'delete', variant: 'danger' },
        { label: `Mover para “${target.name}”`, value: 'move', variant: 'primary' }
      ]
    })
    if (choice !== 'move' && choice !== 'delete') return
    if (choice === 'move') moveTo = target.id
  }

  const s = st()
  s.commit((d) => removeLayer(d, id, moveTo))
  const after = st()
  useEditorStore.setState({
    activeLayerId: after.activeLayerId === id ? target.id : after.activeLayerId,
    selectedIds: after.selectedIds.filter((sid) => after.doc.objects.some((o) => o.id === sid))
  })
  toast.info(`Camada “${layer.name}” excluída.`)
}

export function reorderLayer(id: Id, targetId: Id, place: 'front' | 'back'): void {
  st().commit((d) => moveLayer(d, id, targetId, place))
}

/** Sobe/desce uma posição (para frente = +1). */
export function nudgeLayer(id: Id, direction: 1 | -1): void {
  const layers = st().doc.layers
  const i = layers.findIndex((l) => l.id === id)
  const neighbor = layers[i + direction]
  if (neighbor) reorderLayer(id, neighbor.id, direction === 1 ? 'front' : 'back')
}

/** Seleciona todos os objetos (editáveis) da camada. */
export function selectLayerObjects(id: Id): void {
  const { doc, select, setTool, tool } = st()
  const layer = doc.layers.find((l) => l.id === id)
  if (!layer) return
  if (!editableLayerIds(doc).has(id)) {
    toast.warning(`A camada “${layer.name}” está ${layer.locked ? 'bloqueada' : 'oculta'}.`)
    return
  }
  const ids = doc.objects.filter((o) => o.layerId === id).map((o) => o.id)
  if (tool !== 'select') setTool('select')
  select(ids)
}

/** Move os objetos selecionados (editáveis) para outra camada. */
export function moveSelectionToLayer(layerId: Id): void {
  const { doc, selectedIds, commit } = st()
  const target = doc.layers.find((l) => l.id === layerId)
  if (!target) return
  if (target.locked) {
    toast.warning(`A camada “${target.name}” está bloqueada.`)
    return
  }
  const editable = editableLayerIds(doc)
  const ids = doc.objects.filter((o) => selectedIds.includes(o.id) && editable.has(o.layerId) && o.layerId !== layerId).map((o) => o.id)
  if (ids.length === 0) return
  commit((d) => mapObjects(d, ids, (o) => ({ ...o, layerId })))
  toast.success(`${ids.length} objeto${ids.length > 1 ? 's movidos' : ' movido'} para “${target.name}”.`)
}
