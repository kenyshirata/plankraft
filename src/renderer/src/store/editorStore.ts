/**
 * Estado central do editor (Zustand).
 *
 * Partes:
 *  1. Documento + histórico (undo/redo por snapshots imutáveis).
 *  2. Arquivo: caminho atual e snapshot salvo (para indicar alterações não salvas).
 *  3. Estado de UI do editor: ferramenta, seleção, camada ativa, viewport, edição de texto.
 *
 * Histórico:
 *  - `commit(recipe)`      → alteração atômica que gera 1 passo de undo.
 *  - `beginGesture()` + `updateLive(recipe)` (N vezes) + `endGesture()`
 *    → interações contínuas (arrastar, redimensionar). O documento muda em
 *      tempo real (cotas acompanham), mas apenas 1 passo de undo é gravado.
 */
import { create } from 'zustand'
import {
  createEmptyDocument,
  findLayerByRole,
  hostWallId,
  type Id,
  type Layer,
  type LayerRole,
  type PlanDocument,
  type PlanObject,
  type Point
} from '@shared/model'
import { boundsOf } from '@renderer/lib/geometry'
import { addObjects, cloneObjects, editableLayerIds, objectPoints, patchLayer, removeObjects, wallsOf } from './docOps'
import { useSettingsStore } from './settingsStore'
import { toast } from './toastStore'

export type ToolId =
  | 'select'
  | 'pan'
  | 'wall'
  | 'door'
  | 'window'
  | 'room'
  | 'text'
  | 'measure'
  | 'dimension'
  | 'block'
  | 'calibrate'

export type WallMode = 'line' | 'rect'
export type ViewMode = '2d' | '3d' | 'split'
export type RoomMode = 'detect' | 'polygon'

/** O que está aberto no editor de texto sobreposto ao canvas. */
export type EditTarget =
  | { type: 'text'; id: Id }
  | { type: 'new-text'; position: Point }
  | { type: 'room'; id: Id }

/** Transformação mundo→tela: tela = mundo * scale + (x, y). `scale` = px por cm. */
export interface Viewport {
  x: number
  y: number
  scale: number
}

export const MIN_SCALE = 0.03
export const MAX_SCALE = 8
const HISTORY_LIMIT = 200
const PASTE_OFFSET = 50 // cm

/** Camada usada automaticamente por cada ferramenta (se a opção estiver ligada). */
const TOOL_LAYER_ROLE: Partial<Record<ToolId, LayerRole>> = {
  wall: 'walls',
  door: 'openings',
  window: 'openings',
  room: 'rooms',
  text: 'text',
  dimension: 'dimensions',
  block: 'furniture'
}

type Recipe = (doc: PlanDocument) => PlanDocument

interface EditorState {
  doc: PlanDocument
  past: PlanDocument[]
  future: PlanDocument[]
  /** Snapshot do início de um gesto contínuo (null fora de gestos). */
  gestureBase: PlanDocument | null

  /** Caminho do arquivo aberto/salvo (null = nunca salvo). */
  filePath: string | null
  /** Documento no momento do último salvar/abrir — `doc !== savedDoc` ⇒ alterações pendentes. */
  savedDoc: PlanDocument

  tool: ToolId
  wallMode: WallMode
  roomMode: RoomMode
  activeLayerId: Id
  selectedIds: Id[]
  doorHinge: 'start' | 'end'
  /** Aba do painel esquerdo. */
  leftTab: 'layers' | 'blocks' | 'materials'
  /** Área central: só 2D, só 3D, ou os dois lado a lado. */
  viewMode: ViewMode
  /** Bloco escolhido na biblioteca para inserir com clique (ferramenta Blocos). */
  placingBlockId: string | null
  /** Rotação do bloco "fantasma" (tecla R). */
  placingRotation: number
  /** Imagem sendo calibrada pela ferramenta "Definir escala". */
  calibratingImageId: Id | null
  /** Texto (ou nome de cômodo) em edição no editor sobreposto. */
  editing: EditTarget | null
  viewport: Viewport
  /** Tamanho do canvas em px (atualizado pelo CanvasStage). */
  canvasSize: { width: number; height: number }
  /** Posição do cursor em cm (para a barra de status). */
  cursor: Point | null

  // --- documento / histórico ---
  commit(recipe: Recipe): void
  beginGesture(): void
  updateLive(recipe: Recipe): void
  endGesture(): void
  cancelGesture(): void
  undo(): void
  redo(): void
  newDocument(): void
  loadDocument(doc: PlanDocument, filePath: string | null): void
  markSaved(filePath: string, name: string): void

  // --- UI ---
  setTool(tool: ToolId): void
  setWallMode(mode: WallMode): void
  setRoomMode(mode: RoomMode): void
  setActiveLayer(id: Id): void
  select(ids: Id[]): void
  toggleSelection(id: Id): void
  clearSelection(): void
  selectAll(): void
  deleteSelection(): void
  setEditing(target: EditTarget | null): void
  setDoorHinge(h: 'start' | 'end'): void
  setLeftTab(tab: 'layers' | 'blocks' | 'materials'): void
  setViewMode(mode: ViewMode): void
  /** Entra no modo de inserção do bloco (ou sai, com null). */
  setPlacing(blockId: string | null): void
  rotatePlacing(deg: number): void
  setViewport(v: Viewport): void
  setCanvasSize(width: number, height: number): void
  setCursor(p: Point | null): void
  zoomBy(factor: number, screenAnchor?: Point): void
  zoomToFit(): void

  // --- área de transferência interna ---
  copySelection(): void
  cutSelection(): void
  paste(): void
  duplicateSelection(): void

  // --- camadas: propriedades de VISUALIZAÇÃO (fora do histórico) ---
  // Operações estruturais (criar, renomear, excluir, reordenar…) ficam em layerActions.ts e usam commit().
  toggleLayerVisibility(id: Id): void
  toggleLayerLock(id: Id): void
  setLayerOpacity(id: Id, opacity: number): void
}

const pushLimited = (stack: PlanDocument[], doc: PlanDocument): PlanDocument[] =>
  [...stack, doc].slice(-HISTORY_LIMIT)

const touch = (doc: PlanDocument): PlanDocument => ({ ...doc, updatedAt: new Date().toISOString() })

const clampScale = (s: number): number => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

/** Remove da seleção ids que não existem mais no documento (após undo/delete). */
const keepExisting = (ids: Id[], doc: PlanDocument): Id[] => {
  const existing = new Set(doc.objects.map((o) => o.id))
  return ids.filter((id) => existing.has(id))
}

function defaultActiveLayer(doc: PlanDocument): Id {
  return (findLayerByRole(doc, 'walls') ?? doc.layers[doc.layers.length - 1]).id
}

/** Mantém a camada ativa válida (ela pode deixar de existir após undo/redo). */
const validActiveLayer = (id: Id, doc: PlanDocument): Id =>
  doc.layers.some((l) => l.id === id) ? id : defaultActiveLayer(doc)

/**
 * Visibilidade, bloqueio e opacidade não fazem parte do histórico. Ao desfazer/refazer,
 * o snapshot restaurado herda esses valores do estado atual — assim um Ctrl+Z não
 * "reacende" uma camada que o usuário acabou de ocultar.
 */
function keepLayerView(target: PlanDocument, current: PlanDocument): PlanDocument {
  const now = new Map(current.layers.map((l) => [l.id, l]))
  let changed = false
  const layers = target.layers.map((l) => {
    const c = now.get(l.id)
    if (!c || (c.visible === l.visible && c.locked === l.locked && c.opacity === l.opacity)) return l
    changed = true
    return { ...l, visible: c.visible, locked: c.locked, opacity: c.opacity }
  })
  return changed ? { ...target, layers } : target
}

/** Objetos selecionados que podem ser editados (camada visível e desbloqueada). */
function editableSelection(doc: PlanDocument, ids: Id[]): PlanObject[] {
  const editable = editableLayerIds(doc)
  const set = new Set(ids)
  return doc.objects.filter((o) => set.has(o.id) && editable.has(o.layerId))
}

/** Área de transferência interna (objetos clonáveis + quantas vezes foi colada). */
let clipboard: { objects: PlanObject[]; pastes: number } | null = null
export const hasClipboard = (): boolean => clipboard !== null

const initialDoc = createEmptyDocument()

export const useEditorStore = create<EditorState>()((set, get) => ({
  doc: initialDoc,
  past: [],
  future: [],
  gestureBase: null,
  filePath: null,
  savedDoc: initialDoc,

  tool: 'select',
  wallMode: 'line',
  roomMode: 'detect',
  activeLayerId: defaultActiveLayer(initialDoc),
  selectedIds: [],
  doorHinge: 'start',
  leftTab: 'layers',
  viewMode: '2d',
  placingBlockId: null,
  placingRotation: 0,
  calibratingImageId: null,
  editing: null,
  viewport: { x: 0, y: 0, scale: 0.6 },
  canvasSize: { width: 0, height: 0 },
  cursor: null,

  // ---------------------------------------------------------------- histórico
  commit: (recipe) =>
    set((s) => {
      const next = recipe(s.doc)
      if (next === s.doc) return s
      return { doc: touch(next), past: pushLimited(s.past, s.doc), future: [] }
    }),

  beginGesture: () => set((s) => ({ gestureBase: s.doc })),

  updateLive: (recipe) =>
    set((s) => {
      const next = recipe(s.doc)
      return next === s.doc ? s : { doc: next }
    }),

  endGesture: () =>
    set((s) => {
      if (!s.gestureBase) return s
      if (s.gestureBase === s.doc) return { gestureBase: null }
      return { gestureBase: null, doc: touch(s.doc), past: pushLimited(s.past, s.gestureBase), future: [] }
    }),

  cancelGesture: () => set((s) => (s.gestureBase ? { doc: s.gestureBase, gestureBase: null } : s)),

  undo: () =>
    set((s) => {
      if (s.gestureBase || s.past.length === 0) return s
      const prev = keepLayerView(s.past[s.past.length - 1], s.doc)
      return {
        doc: prev,
        past: s.past.slice(0, -1),
        future: [s.doc, ...s.future],
        selectedIds: keepExisting(s.selectedIds, prev),
        activeLayerId: validActiveLayer(s.activeLayerId, prev),
        editing: null
      }
    }),

  redo: () =>
    set((s) => {
      if (s.gestureBase || s.future.length === 0) return s
      const [head, ...rest] = s.future
      const next = keepLayerView(head, s.doc)
      return {
        doc: next,
        past: pushLimited(s.past, s.doc),
        future: rest,
        selectedIds: keepExisting(s.selectedIds, next),
        activeLayerId: validActiveLayer(s.activeLayerId, next),
        editing: null
      }
    }),

  newDocument: () => {
    get().loadDocument(createEmptyDocument(), null)
  },

  loadDocument: (doc, filePath) => {
    set({
      doc,
      savedDoc: doc,
      filePath,
      past: [],
      future: [],
      gestureBase: null,
      selectedIds: [],
      editing: null,
      activeLayerId: defaultActiveLayer(doc)
    })
    get().zoomToFit()
  },

  markSaved: (filePath, name) =>
    set((s) => {
      const doc = s.doc.name === name ? s.doc : { ...s.doc, name }
      return { doc, savedDoc: doc, filePath }
    }),

  // ---------------------------------------------------------------------- UI
  setTool: (tool) => {
    const role = TOOL_LAYER_ROLE[tool]
    const { doc, activeLayerId } = get()
    const patch: Partial<EditorState> = { tool, editing: null }
    // Ferramenta Blocos abre a biblioteca; sair dela cancela a inserção pendente.
    if (tool === 'block') patch.leftTab = 'blocks'
    else patch.placingBlockId = null
    // Troca automática de camada (ex.: Porta → "Portas e Janelas").
    if (role && useSettingsStore.getState().autoLayerByTool) {
      const layer = findLayerByRole(doc, role)
      if (layer && layer.id !== activeLayerId) patch.activeLayerId = layer.id
    }
    set(patch)
  },
  setWallMode: (wallMode) => set({ wallMode }),
  setRoomMode: (roomMode) => set({ roomMode }),
  setActiveLayer: (activeLayerId) => set({ activeLayerId }),

  select: (ids) => set({ selectedIds: ids }),
  toggleSelection: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id) ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id]
    })),
  clearSelection: () => set((s) => (s.selectedIds.length ? { selectedIds: [] } : s)),
  selectAll: () =>
    set((s) => {
      const editable = editableLayerIds(s.doc)
      return { selectedIds: s.doc.objects.filter((o) => editable.has(o.layerId)).map((o) => o.id) }
    }),

  deleteSelection: () => {
    const { selectedIds, doc } = get()
    if (selectedIds.length === 0) return
    const deletable = editableSelection(doc, selectedIds)
    get().commit((d) => removeObjects(d, deletable.map((o) => o.id)))
    set({ selectedIds: [] })
  },

  setEditing: (editing) => set({ editing }),
  setDoorHinge: (doorHinge) => set({ doorHinge }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setViewMode: (viewMode) => set({ viewMode }),
  setPlacing: (placingBlockId) => {
    if (placingBlockId) {
      get().setTool('block')
      set({ placingBlockId, selectedIds: [] })
    } else set({ placingBlockId: null, tool: get().tool === 'block' ? 'select' : get().tool })
  },
  rotatePlacing: (deg) => set((s) => ({ placingRotation: (((s.placingRotation + deg) % 360) + 360) % 360 })),

  setViewport: (viewport) => set({ viewport: { ...viewport, scale: clampScale(viewport.scale) } }),
  setCanvasSize: (width, height) => set({ canvasSize: { width, height } }),
  setCursor: (cursor) => set({ cursor }),

  zoomBy: (factor, screenAnchor) => {
    const { viewport: v, canvasSize } = get()
    const anchor = screenAnchor ?? { x: canvasSize.width / 2, y: canvasSize.height / 2 }
    const scale = clampScale(v.scale * factor)
    // Mantém o ponto do mundo sob o "anchor" fixo na tela.
    const world = { x: (anchor.x - v.x) / v.scale, y: (anchor.y - v.y) / v.scale }
    set({ viewport: { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale } })
  },

  zoomToFit: () => {
    const { doc, canvasSize } = get()
    if (canvasSize.width === 0 || canvasSize.height === 0) return
    const walls = new Map(wallsOf(doc).map((w) => [w.id, w]))
    const points = doc.objects.flatMap((o) => objectPoints(o, walls))
    // Documento vazio: enquadra uma área de 12 × 8 m a partir da origem.
    const b = boundsOf(points) ?? { x: 0, y: 0, width: 1200, height: 800 }
    const pad = 80
    const w = Math.max(b.width, 100)
    const h = Math.max(b.height, 100)
    const scale = clampScale(Math.min((canvasSize.width - pad * 2) / w, (canvasSize.height - pad * 2) / h))
    const cx = b.x + b.width / 2
    const cy = b.y + b.height / 2
    set({ viewport: { scale, x: canvasSize.width / 2 - cx * scale, y: canvasSize.height / 2 - cy * scale } })
  },

  // ------------------------------------------------- área de transferência
  copySelection: () => {
    const { doc, selectedIds } = get()
    const objects = editableSelection(doc, selectedIds)
    if (objects.length === 0) return
    // Aberturas e cotas associadas só fazem sentido com a parede: entram junto com as paredes copiadas.
    const ids = new Set(objects.map((o) => o.id))
    const hosted = doc.objects.filter((o) => {
      const host = hostWallId(o)
      return host !== null && ids.has(host) && !ids.has(o.id)
    })
    clipboard = { objects: [...objects, ...hosted], pastes: 0 }
    const lonely = objects.filter((o) => (o.type === 'door' || o.type === 'window') && !ids.has(o.wallId))
    if (lonely.length) toast.info('Portas/janelas só são copiadas junto com a parede onde estão.')
  },

  cutSelection: () => {
    get().copySelection()
    get().deleteSelection()
  },

  paste: () => {
    if (!clipboard) return
    const { doc } = get()
    const editable = editableLayerIds(doc)
    clipboard.pastes++
    const offset = { x: PASTE_OFFSET * clipboard.pastes, y: PASTE_OFFSET * clipboard.pastes }
    // Objetos de camadas que não existem mais / bloqueadas vão para a camada ativa.
    const fallback = get().activeLayerId
    const clones = cloneObjects(clipboard.objects, offset).map((o) =>
      editable.has(o.layerId) ? o : { ...o, layerId: fallback }
    )
    if (clones.length === 0) return
    get().commit((d) => addObjects(d, clones))
    set({ selectedIds: clones.map((o) => o.id), tool: 'select' })
  },

  /** Duplica a seleção sem alterar a área de transferência do usuário. */
  duplicateSelection: () => {
    const previous = clipboard
    get().copySelection()
    if (clipboard && clipboard !== previous) get().paste()
    clipboard = previous
  },

  // ----------------------------------------------------------------- camadas
  // Visibilidade/bloqueio não entram no histórico (não faz sentido "desfazer" isso
  // enquanto se desenha), mas fazem parte do documento salvo.
  toggleLayerVisibility: (id) =>
    set((s) => {
      const layer = s.doc.layers.find((l) => l.id === id)
      if (!layer) return s
      const doc = patchLayer(s.doc, id, { visible: !layer.visible })
      const hiddenIds = new Set(layer.visible ? doc.objects.filter((o) => o.layerId === id).map((o) => o.id) : [])
      return { doc, selectedIds: s.selectedIds.filter((x) => !hiddenIds.has(x)) }
    }),
  toggleLayerLock: (id) =>
    set((s) => {
      const layer = s.doc.layers.find((l) => l.id === id)
      if (!layer) return s
      const doc = patchLayer(s.doc, id, { locked: !layer.locked })
      // Ao bloquear, remove da seleção os objetos daquela camada.
      const lockedIds = new Set(doc.objects.filter((o) => o.layerId === id).map((o) => o.id))
      return { doc, selectedIds: layer.locked ? s.selectedIds : s.selectedIds.filter((x) => !lockedIds.has(x)) }
    }),
  setLayerOpacity: (id, opacity) =>
    set((s) => ({ doc: patchLayer(s.doc, id, { opacity: Math.min(1, Math.max(0, opacity)) }) }))
}))

// Em desenvolvimento, expõe o store no console para depuração (window.__editor.getState()).
if (import.meta.env.DEV) (window as unknown as { __editor: typeof useEditorStore }).__editor = useEditorStore

/** Hooks auxiliares de leitura. */
export const useActiveLayer = (): Layer | undefined =>
  useEditorStore((s) => s.doc.layers.find((l) => l.id === s.activeLayerId))

export const useIsDirty = (): boolean => useEditorStore((s) => s.doc !== s.savedDoc)
