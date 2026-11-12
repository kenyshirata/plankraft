import { hasClipboard, useEditorStore } from '@renderer/store/editorStore'
import {
  flipDoorSide,
  generateMissingDimensions,
  refreshRoomFromWalls,
  resetDimensionOffset,
  toggleDoorHinge
} from '@renderer/store/actions'
import { moveSelectionToLayer } from '@renderer/store/layerActions'
import { flipSelectedBlocks, rotateSelectedBlocks } from '@renderer/store/blockActions'
import { openBlockDialog } from './BlockDialog'
import { importBackgroundImage, setImageView, startCalibration, toggleBackgroundImages } from '@renderer/store/imageActions'
import type { MenuItem } from './ContextMenu'

/** Itens do menu de contexto do canvas, conforme a seleção atual. */
export function useContextMenuItems(): MenuItem[] {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const objects = useEditorStore((s) => s.doc.objects)
  const canUndo = useEditorStore((s) => s.past.length > 0)
  const canRedo = useEditorStore((s) => s.future.length > 0)
  const activeLayer = useEditorStore((s) => s.doc.layers.find((l) => l.id === s.activeLayerId))
  const st = useEditorStore.getState

  const selected = objects.filter((o) => selectedIds.includes(o.id))
  const single = selected.length === 1 ? selected[0] : undefined
  const items: MenuItem[] = []

  if (single?.type === 'door') {
    items.push(
      { label: 'Inverter lado de abertura', onSelect: () => flipDoorSide(single.id) },
      { label: 'Trocar lado da dobradiça', onSelect: () => toggleDoorHinge(single.id) },
      { separator: true }
    )
  }
  if (single?.type === 'room') {
    items.push(
      { label: 'Renomear cômodo', onSelect: () => st().setEditing({ type: 'room', id: single.id }) },
      { label: 'Atualizar área pelas paredes', onSelect: () => refreshRoomFromWalls(single.id) },
      { separator: true }
    )
  }
  if (single?.type === 'dimension' && single.offset !== null) {
    items.push({ label: 'Voltar cota à posição automática', onSelect: () => resetDimensionOffset(single.id) }, { separator: true })
  }
  if (selected.some((o) => o.type === 'block')) {
    items.push(
      { label: 'Girar 90°', shortcut: 'R', onSelect: () => rotateSelectedBlocks(90) },
      { label: 'Espelhar horizontalmente', onSelect: () => flipSelectedBlocks('x') },
      { label: 'Espelhar verticalmente', onSelect: () => flipSelectedBlocks('y') },
      { separator: true }
    )
  }
  if (single?.type === 'image') {
    items.push(
      { label: 'Definir escala…', onSelect: () => startCalibration(single.id) },
      { label: 'Bloquear imagem', onSelect: () => setImageView(single.id, { locked: true }) },
      { label: 'Ocultar imagem', shortcut: 'Ctrl+B', onSelect: () => setImageView(single.id, { hidden: true }) },
      { separator: true }
    )
  }
  if (single?.type === 'text') {
    items.push({ label: 'Editar texto', onSelect: () => st().setEditing({ type: 'text', id: single.id }) }, { separator: true })
  }

  if (selected.length > 0) {
    items.push(
      { label: 'Recortar', shortcut: 'Ctrl+X', onSelect: () => st().cutSelection() },
      { label: 'Copiar', shortcut: 'Ctrl+C', onSelect: () => st().copySelection() },
      { label: 'Duplicar', shortcut: 'Ctrl+D', onSelect: () => st().duplicateSelection() }
    )
    if (activeLayer && selected.some((o) => o.layerId !== activeLayer.id)) {
      items.push({
        label: `Mover para a camada “${activeLayer.name}”`,
        disabled: activeLayer.locked,
        onSelect: () => moveSelectionToLayer(activeLayer.id)
      })
    }
  }
  items.push({ label: 'Colar', shortcut: 'Ctrl+V', disabled: !hasClipboard(), onSelect: () => st().paste() })
  if (selected.length > 0) {
    items.push({ label: 'Salvar como bloco…', onSelect: () => openBlockDialog({ mode: 'create' }) })
  }
  if (selected.length > 0) {
    items.push({ separator: true }, { label: 'Excluir', shortcut: 'Del', danger: true, onSelect: () => st().deleteSelection() })
  }
  items.push(
    { separator: true },
    { label: 'Selecionar tudo', shortcut: 'Ctrl+A', onSelect: () => st().selectAll() },
    { label: 'Gerar cotas automáticas', onSelect: () => generateMissingDimensions() },
    ...(objects.some((o) => o.type === 'image')
      ? [
          { label: 'Mostrar/ocultar imagem de fundo', shortcut: 'Ctrl+B', onSelect: () => toggleBackgroundImages() },
          ...(objects.some((o) => o.type === 'image' && o.locked)
            ? [
                {
                  label: 'Desbloquear imagem de fundo',
                  onSelect: () => objects.forEach((o) => o.type === 'image' && o.locked && setImageView(o.id, { locked: false }))
                }
              ]
            : [])
        ]
      : [{ label: 'Importar imagem de fundo…', shortcut: 'Ctrl+I', onSelect: () => void importBackgroundImage() }]),
    { label: 'Desfazer', shortcut: 'Ctrl+Z', disabled: !canUndo, onSelect: () => st().undo() },
    { label: 'Refazer', shortcut: 'Ctrl+Y', disabled: !canRedo, onSelect: () => st().redo() },
    { label: 'Ajustar à tela', shortcut: 'Ctrl+0', onSelect: () => st().zoomToFit() }
  )
  return items
}
