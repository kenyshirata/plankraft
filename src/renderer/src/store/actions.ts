/**
 * Ações de edição reutilizadas pelo canvas, menu de contexto e painel de propriedades.
 */
import { findLayerByRole, newId, type Id, type PlanDocument, type Point, type RoomObject, type WallDimension } from '@shared/model'
import { polygonArea, polygonCentroid } from '@renderer/lib/geometry'
import { detectRoomAt } from '@renderer/lib/rooms'
import { addObjects, updateObject, wallsOf } from './docOps'
import { useEditorStore } from './editorStore'
import { toast } from './toastStore'

/** Cores suaves para cômodos (alternadas a cada novo cômodo). */
export const ROOM_COLORS = ['#7aa2ff', '#7fd1ae', '#f5b971', '#e59bd4', '#9fd4f0', '#c3b2ff', '#f29e9e', '#b8d98a']

export function nextRoomName(doc: PlanDocument): string {
  const n = doc.objects.filter((o) => o.type === 'room').length + 1
  return `Cômodo ${n}`
}

export function newRoom(doc: PlanDocument, layerId: Id, points: Point[]): RoomObject {
  const count = doc.objects.filter((o) => o.type === 'room').length
  return { id: newId(), type: 'room', layerId, name: nextRoomName(doc), points, color: ROOM_COLORS[count % ROOM_COLORS.length] }
}

export function flipDoorSide(id: Id): void {
  useEditorStore.getState().commit((d) => updateObject(d, id, 'door', (o) => ({ ...o, side: o.side === 1 ? -1 : 1 })))
}

export function toggleDoorHinge(id: Id): void {
  useEditorStore
    .getState()
    .commit((d) => updateObject(d, id, 'door', (o) => ({ ...o, hinge: o.hinge === 'start' ? 'end' : 'start' })))
}

/** Recalcula o polígono do cômodo a partir das paredes atuais (após mover paredes). */
export function refreshRoomFromWalls(id: Id): void {
  const { doc, commit } = useEditorStore.getState()
  const room = doc.objects.find((o): o is RoomObject => o.id === id && o.type === 'room')
  if (!room) return
  const visible = new Set(doc.layers.filter((l) => l.visible).map((l) => l.id))
  const detected = detectRoomAt(
    polygonCentroid(room.points),
    wallsOf(doc).filter((w) => visible.has(w.layerId))
  )
  if (!detected) {
    toast.warning('Não encontrei paredes fechando este cômodo.')
    return
  }
  commit((d) => updateObject(d, id, 'room', (r) => ({ ...r, points: detected.points })))
  toast.success(`Área atualizada: ${(polygonArea(detected.points) / 10000).toFixed(2).replace('.', ',')} m²`)
}

// ------------------------------------------------------------------- cotas

/** Cria cotas associadas para as paredes informadas (na camada "Cotas", se existir). */
export function wallDimensionsFor(doc: PlanDocument, walls: { id: Id; layerId: Id }[]): WallDimension[] {
  const layerId = findLayerByRole(doc, 'dimensions')?.id
  return walls.map((w) => ({ id: newId(), type: 'dimension', kind: 'wall', wallId: w.id, layerId: layerId ?? w.layerId, offset: null }))
}

/** "Gerar Cotas Automáticas": cria a cota de toda parede que ainda não tem uma. */
export function generateMissingDimensions(): number {
  const { doc, commit } = useEditorStore.getState()
  const dimensioned = new Set(
    doc.objects.filter((o): o is WallDimension => o.type === 'dimension' && o.kind === 'wall').map((d) => d.wallId)
  )
  const missing = wallsOf(doc).filter((w) => !dimensioned.has(w.id))
  if (missing.length === 0) {
    toast.info('Todas as paredes já têm cota.')
    return 0
  }
  commit((d) => addObjects(d, wallDimensionsFor(d, missing)))
  toast.success(`${missing.length} cota${missing.length > 1 ? 's criadas' : ' criada'}.`)
  return missing.length
}

/** Volta a cota para a posição automática (lado externo + escalonamento). */
export function resetDimensionOffset(id: Id): void {
  useEditorStore.getState().commit((d) => updateObject(d, id, 'dimension', (o) => ({ ...o, offset: null })))
}
