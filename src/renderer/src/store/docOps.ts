/**
 * Operações puras e imutáveis sobre o PlanDocument.
 * Mantê-las fora do store facilita testes e reuso (ex.: importação da IA).
 */
import {
  hostWallId,
  isOpening,
  newId,
  type Id,
  type Layer,
  type PlanDocument,
  type PlanObject,
  type Point,
  type WallObject
} from '@shared/model'
import { add } from '@renderer/lib/geometry'
import { imageCorners } from '@renderer/lib/imageGeometry'

export function addObjects(doc: PlanDocument, objects: PlanObject[]): PlanDocument {
  if (objects.length === 0) return doc
  return { ...doc, objects: [...doc.objects, ...objects] }
}

/** Remove objetos; aberturas e cotas associadas a paredes removidas saem junto (cascata). */
export function removeObjects(doc: PlanDocument, ids: Iterable<Id>): PlanDocument {
  const set = new Set(ids)
  if (set.size === 0) return doc
  const objects = doc.objects.filter((o) => {
    if (set.has(o.id)) return false
    const host = hostWallId(o)
    return host === null || !set.has(host)
  })
  return objects.length === doc.objects.length ? doc : { ...doc, objects }
}

/** Aplica `fn` aos objetos cujo id está em `ids`; demais permanecem idênticos (mesma referência). */
export function mapObjects(
  doc: PlanDocument,
  ids: Iterable<Id>,
  fn: (o: PlanObject) => PlanObject
): PlanDocument {
  const set = new Set(ids)
  let changed = false
  const objects = doc.objects.map((o) => {
    if (!set.has(o.id)) return o
    const next = fn(o)
    if (next !== o) changed = true
    return next
  })
  return changed ? { ...doc, objects } : doc
}

/** Atualiza um objeto garantindo o tipo (ex.: updateObject(doc, id, 'door', d => ({...d, side: -1}))). */
export function updateObject<T extends PlanObject['type']>(
  doc: PlanDocument,
  id: Id,
  type: T,
  fn: (o: Extract<PlanObject, { type: T }>) => Extract<PlanObject, { type: T }>
): PlanDocument {
  return mapObjects(doc, [id], (o) => (o.type === type ? fn(o as Extract<PlanObject, { type: T }>) : o))
}

/** Desloca um objeto. Aberturas não se movem sozinhas (seguem a parede hospedeira). */
export function translateObject(o: PlanObject, d: Point): PlanObject {
  switch (o.type) {
    case 'wall':
      return { ...o, a: add(o.a, d), b: add(o.b, d) }
    case 'room':
      return { ...o, points: o.points.map((p) => add(p, d)) }
    case 'text':
      return { ...o, position: add(o.position, d) }
    case 'dimension':
      return o.kind === 'free' ? { ...o, a: add(o.a, d), b: add(o.b, d) } : o
    case 'block':
    case 'image':
      return { ...o, position: add(o.position, d) }
    default:
      return o
  }
}

export function patchLayer(doc: PlanDocument, id: Id, patch: Partial<Layer>): PlanDocument {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) }
}

export function layerById(doc: PlanDocument, id: Id): Layer | undefined {
  return doc.layers.find((l) => l.id === id)
}

/** Camadas cujos objetos podem ser selecionados/editados (visíveis e desbloqueadas). */
export function editableLayerIds(doc: PlanDocument, levelId?: Id): Set<Id> {
  return new Set(doc.layers.filter((l) => l.visible && !l.locked && (!levelId || l.levelId === levelId)).map((l) => l.id))
}

/** Paredes do documento; com `levelId`, só as do andar (pela camada). */
export function wallsOf(doc: PlanDocument, levelId?: Id): WallObject[] {
  const ids = levelId ? new Set(doc.layers.filter((l) => l.levelId === levelId).map((l) => l.id)) : null
  return doc.objects.filter((o): o is WallObject => o.type === 'wall' && (!ids || ids.has(o.layerId)))
}

/** Pontos de referência de um objeto (para enquadrar, seleção etc.). */
export function objectPoints(o: PlanObject, walls: Map<Id, WallObject>): Point[] {
  switch (o.type) {
    case 'wall':
      return [o.a, o.b]
    case 'room':
      return o.points
    case 'text':
      return [o.position]
    case 'dimension':
      if (o.kind === 'free') return [o.a, o.b]
      return walls.get(o.wallId) ? [walls.get(o.wallId)!.a, walls.get(o.wallId)!.b] : []
    case 'block':
      return [o.position]
    case 'image':
      return imageCorners(o)
    default: {
      const w = walls.get(o.wallId)
      return w ? [w.a, w.b] : []
    }
  }
}

/**
 * Clona objetos com novos ids (copiar/colar, duplicar), deslocados por `offset`.
 * Aberturas só são clonadas se a parede hospedeira também estiver no conjunto,
 * apontando para a cópia da parede.
 */
export function cloneObjects(objects: PlanObject[], offset: Point, keepExternalHosts = false): PlanObject[] {
  const idMap = new Map<Id, Id>()
  for (const o of objects) idMap.set(o.id, newId())
  const result: PlanObject[] = []
  for (const o of objects) {
    const id = idMap.get(o.id)!
    const host = hostWallId(o)
    if (host !== null && (isOpening(o) || (o.type === 'dimension' && o.kind === 'wall'))) {
      // keepExternalHosts: a cópia continua na parede original (ex.: duplicar a camada de aberturas).
      const wallId = idMap.get(host) ?? (keepExternalHosts ? host : undefined)
      if (wallId) result.push({ ...o, id, wallId })
    } else {
      result.push({ ...translateObject(o, offset), id })
    }
  }
  return result
}

// ------------------------------------------------------------------- camadas

/** Insere uma camada logo À FRENTE da camada `aboveOf` (ou no topo). */
export function insertLayer(doc: PlanDocument, layer: Layer, aboveOf?: Id): PlanDocument {
  const idx = aboveOf ? doc.layers.findIndex((l) => l.id === aboveOf) : -1
  const layers = [...doc.layers]
  layers.splice(idx >= 0 ? idx + 1 : layers.length, 0, layer)
  return { ...doc, layers }
}

/**
 * Remove a camada. Os objetos dela são excluídos (`moveTo` ausente) ou
 * transferidos para a camada `moveTo`.
 */
export function removeLayer(doc: PlanDocument, id: Id, moveTo?: Id): PlanDocument {
  if (doc.layers.length <= 1) return doc
  const layers = doc.layers.filter((l) => l.id !== id)
  if (moveTo && layers.some((l) => l.id === moveTo)) {
    return { ...doc, layers, objects: doc.objects.map((o) => (o.layerId === id ? { ...o, layerId: moveTo } : o)) }
  }
  const removed = removeObjects(doc, doc.objects.filter((o) => o.layerId === id).map((o) => o.id))
  return { ...removed, layers }
}

/** Duplica a camada (logo acima dela) com cópias de todos os seus objetos. */
export function duplicateLayer(doc: PlanDocument, id: Id, newLayer: Layer): PlanDocument {
  const source = doc.objects.filter((o) => o.layerId === id)
  const copies = cloneObjects(source, { x: 0, y: 0 }, true).map((o) => ({ ...o, layerId: newLayer.id }))
  return addObjects(insertLayer(doc, newLayer, id), copies)
}

/** Move a camada `id` para imediatamente à frente ('front') ou atrás ('back') de `targetId`. */
export function moveLayer(doc: PlanDocument, id: Id, targetId: Id, place: 'front' | 'back'): PlanDocument {
  if (id === targetId) return doc
  const moving = doc.layers.find((l) => l.id === id)
  if (!moving) return doc
  const rest = doc.layers.filter((l) => l.id !== id)
  const ti = rest.findIndex((l) => l.id === targetId)
  if (ti < 0) return doc
  rest.splice(place === 'front' ? ti + 1 : ti, 0, moving)
  const same = rest.every((l, i) => l === doc.layers[i])
  return same ? doc : { ...doc, layers: rest }
}
