/**
 * Área de desenho (Konva).
 *
 * Estrutura de camadas Konva (cada Konva.Layer é um <canvas> próprio; o Konva
 * recomenda poucas, então as camadas do DOCUMENTO viram <Group>s ordenados
 * dentro de uma única Layer de conteúdo — a ordem/opacidade/visibilidade é
 * preservada, e a exportação PDF seguirá a mesma ordem):
 *   1. Layer "grid"     – malha (não interativa)
 *   2. Layer "content"  – um Group por camada do documento, na ordem do documento;
 *                         dentro de cada uma: cômodos → paredes → aberturas → textos
 *   3. Layer "overlay"  – rascunhos, pré-visualizações, rótulos ao vivo, alças, seleção por área
 *
 * Interações são uma pequena máquina de estados (`Gesture`) guardada em ref
 * para não re-renderizar a cada evento; só o que precisa ser desenhado vai
 * para useState.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Circle, Group, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useShallow } from 'zustand/react/shallow'
import {
  isOpening,
  newId,
  type BlockObject,
  type DimensionObject,
  type FreeDimension,
  type Id,
  type ImageObject,
  type OpeningObject,
  type PlanDocument,
  type PlanObject,
  type Point,
  type RoomObject,
  type TextObject,
  type WallObject
} from '@shared/model'
import {
  add,
  angleDeg,
  distance,
  lockToAngle,
  mul,
  normalize,
  perp,
  pointInPolygon,
  dot,
  polygonArea,
  polygonCentroid,
  projectOnSegment,
  rectFromPoints,
  samePoint,
  snapToGrid,
  sub,
  type Rect as RectShape
} from '@renderer/lib/geometry'
import { formatAngle, formatArea, formatLength } from '@renderer/lib/format'
import { clampOffset, nearestWall, openingGeometry, OPENING_MARGIN } from '@renderer/lib/openings'
import { detectRoomAt, planarFaces } from '@renderer/lib/rooms'
import { cornerAngles, exteriorSides, layoutDimensions, measuredSegment } from '@renderer/lib/dimensions'
import { useEditorStore, type Viewport, type WallMode } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { addObjects, editableLayerIds, mapObjects, translateObject } from '@renderer/store/docOps'
import { newRoom, resetDimensionOffset, wallDimensionsFor } from '@renderer/store/actions'
import { toast } from '@renderer/store/toastStore'
import { useDialogStore } from '@renderer/store/dialogStore'
import { useCanvasPalette } from '@renderer/theme'
import { ContextMenu } from '@renderer/components/ContextMenu'
import { useContextMenuItems } from '@renderer/components/contextMenuItems'
import { Grid } from './Grid'
import { WallShapes } from './WallShapes'
import { OpeningShapes, OpeningSymbol } from './OpeningShapes'
import { CornerAngleShapes, DimensionShapes } from './DimensionShapes'
import { RoomShapes } from './RoomShapes'
import { TextShapes } from './TextShapes'
import { LiveLabel } from './LiveLabel'
import { TextEditorOverlay } from './TextEditorOverlay'
import { objectHitsRect } from './selection'
import { BlockPrimitives, BlockShapes, blockNodeId } from './BlockShapes'
import { ImageShapes, imageNodeId } from './ImageShapes'
import { openCalibrateDialog } from '@renderer/components/CalibrateDialog'
import { insertBlock, previewInstance, WALL_SNAP_CM } from '@renderer/store/blockActions'
import { resolveBlock } from '@renderer/store/libraryStore'
import { snapBlockToWalls } from '@renderer/lib/blockGeometry'
import { BLOCK_DRAG_MIME } from '@renderer/components/LibraryPanel'
import { computeWallGeometry } from './wallGeometry'
import { GhostLevel } from './GhostLevel'
import { isStairId } from '@shared/stairs'

/** Raio (px de tela) para "grudar" em extremidades de paredes existentes. */
const SNAP_RADIUS_PX = 10
/** Distância (px de tela) para portas/janelas encontrarem uma parede. */
const WALL_PICK_PX = 18
/** Paredes menores que isso (cm) são descartadas. */
const MIN_WALL_CM = 5
/** Movimento (px) abaixo do qual um clique não é considerado arraste. */
const CLICK_TOLERANCE_PX = 4

type SnapKind = 'endpoint' | 'grid' | 'angle' | 'free'

interface EndRef {
  wallId: Id
  end: 'a' | 'b'
  origin: Point
}

type Gesture =
  | { kind: 'pan'; startPointer: Point; startViewport: Viewport }
  | {
      kind: 'draw'
      start: Point
      current: Point
      /** true = modo clique-a-clique (polilinha) em vez de clicar-e-arrastar. */
      clickMode: boolean
      downScreen: Point
      chainStart: Point
    }
  | { kind: 'move'; startWorld: Point; ids: Id[]; attached: EndRef[]; base: PlanDocument }
  | { kind: 'endpoint'; ends: EndRef[]; anchor: Point; base: PlanDocument }
  | { kind: 'slide'; openingId: Id; grab: number; base: PlanDocument }
  | { kind: 'marquee'; start: Point; startScreen: Point; additive: boolean }
  | { kind: 'measure'; start: Point; clickMode: boolean; downScreen: Point }
  | { kind: 'dimension'; start: Point; current: Point; clickMode: boolean; downScreen: Point }
  | { kind: 'dimOffset'; id: Id; base: PlanDocument }
  | { kind: 'calibrate'; start: Point }
  | { kind: 'poly'; points: Point[] }

interface OpeningPreview {
  wall: WallObject
  offset: number
  side: 1 | -1
}

/** Segmentos de parede gerados pelo rascunho (linha única ou retângulo de 4 paredes). */
function draftSegments(a: Point, b: Point, mode: WallMode): [Point, Point][] {
  if (mode === 'line') return [[a, b]]
  const tr = { x: b.x, y: a.y }
  const bl = { x: a.x, y: b.y }
  return [
    [a, tr],
    [tr, b],
    [b, bl],
    [bl, a]
  ]
}

const byType = <T extends PlanObject['type']>(objects: PlanObject[], type: T) =>
  objects.filter((o): o is Extract<PlanObject, { type: T }> => o.type === type)

export function CanvasStage(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const gestureRef = useRef<Gesture | null>(null)
  const palette = useCanvasPalette()

  const { doc, tool, wallMode, roomMode, doorHinge, viewport, selectedIds, activeLayerId, activeLevelId, canvasSize, editing, placingBlockId, placingRotation, calibratingImageId } =
    useEditorStore(
      useShallow((s) => ({
        doc: s.doc,
        tool: s.tool,
        wallMode: s.wallMode,
        roomMode: s.roomMode,
        doorHinge: s.doorHinge,
        viewport: s.viewport,
        selectedIds: s.selectedIds,
        activeLayerId: s.activeLayerId,
        activeLevelId: s.activeLevelId,
        canvasSize: s.canvasSize,
        editing: s.editing,
        placingBlockId: s.placingBlockId,
        placingRotation: s.placingRotation,
        calibratingImageId: s.calibratingImageId
      }))
    )
  const settings = useSettingsStore(
    useShallow((s) => ({
      gridSize: s.gridSize,
      showGrid: s.showGrid,
      ghostLevel: s.ghostLevel,
      snapEnabled: s.snapEnabled,
      wallThickness: s.wallThickness,
      doorWidth: s.doorWidth,
      doorVariant: s.doorVariant,
      windowVariant: s.windowVariant,
      windowWidth: s.windowWidth,
      unit: s.unit,
      precision: s.precision,
      showDimensions: s.showDimensions,
      dimensionStyle: s.dimensionStyle,
      dimensionOffset: s.dimensionOffset,
      autoDimensions: s.autoDimensions,
      cornerAngles: s.cornerAngles
    }))
  )

  const [draft, setDraft] = useState<{ a: Point; b: Point } | null>(null)
  const [measure, setMeasure] = useState<{ a: Point; b: Point } | null>(null)
  const [dimDraft, setDimDraft] = useState<{ a: Point; b: Point } | null>(null)
  const [ghostAt, setGhostAt] = useState<{ p: Point; free: boolean } | null>(null)
  const [calib, setCalib] = useState<{ a: Point; b: Point } | null>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const [poly, setPoly] = useState<{ points: Point[]; current: Point } | null>(null)
  const [openingPreview, setOpeningPreview] = useState<OpeningPreview | null>(null)
  const [roomPreview, setRoomPreview] = useState<Point[] | null>(null)
  const [marker, setMarker] = useState<{ p: Point; kind: SnapKind } | null>(null)
  const [marquee, setMarquee] = useState<RectShape | null>(null)
  const [hoveredId, setHoveredId] = useState<Id | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [panning, setPanning] = useState(false)

  // ------------------------------------------------------------ derivados
  // Só as camadas do andar ativo participam de desenho, seleção e cotas.
  const visibleLayerIds = useMemo(
    () => new Set(doc.layers.filter((l) => l.visible && l.levelId === activeLevelId).map((l) => l.id)),
    [doc.layers, activeLevelId]
  )
  const visibleObjects = useMemo(
    () => doc.objects.filter((o) => visibleLayerIds.has(o.layerId)),
    [doc.objects, visibleLayerIds]
  )
  const walls = useMemo(() => byType(doc.objects, 'wall'), [doc.objects])
  const visibleWalls = useMemo(() => byType(visibleObjects, 'wall'), [visibleObjects])
  const wallGeometry = useMemo(() => computeWallGeometry(visibleWalls), [visibleWalls])
  const wallsById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls])
  const objectsById = useMemo(() => new Map(doc.objects.map((o) => [o.id, o])), [doc.objects])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  // Grafo planar das paredes visíveis: usado para detectar cômodos e o lado externo das cotas.
  const graph = useMemo(() => planarFaces(visibleWalls), [visibleWalls])
  const sides = useMemo(() => exteriorSides(visibleWalls, graph), [visibleWalls, graph])
  const visibleDims = useMemo(
    () => visibleObjects.filter((o): o is DimensionObject => o.type === 'dimension'),
    [visibleObjects]
  )
  const dimLayouts = useMemo(
    () =>
      settings.showDimensions
        ? layoutDimensions(visibleDims, wallsById, sides, {
            scale: viewport.scale,
            offsetPx: settings.dimensionOffset,
            style: settings.dimensionStyle
          })
        : [],
    [visibleDims, wallsById, sides, viewport.scale, settings.showDimensions, settings.dimensionOffset, settings.dimensionStyle]
  )
  const ghostLevelId = useMemo(() => {
    const i = doc.levels.findIndex((l) => l.id === activeLevelId)
    return settings.ghostLevel && i > 0 ? doc.levels[i - 1].id : null
  }, [doc.levels, activeLevelId, settings.ghostLevel])
  const resolve = useCallback((id: string) => resolveBlock(id, doc), [doc])
  // Blocos selecionados e editáveis recebem o Transformer (girar/redimensionar).
  const transformIds = useMemo(() => {
    const editable = editableLayerIds(doc, activeLevelId)
    return tool === 'select'
      ? doc.objects
          .filter(
            (o) =>
              ((o.type === 'block' && !isStairId(o.blockId)) || (o.type === 'image' && !o.locked && !o.hidden)) &&
              selectedSet.has(o.id) &&
              editable.has(o.layerId) &&
              visibleLayerIds.has(o.layerId)
          )
          .map((o) => o.id)
      : []
  }, [doc, selectedSet, tool, visibleLayerIds, activeLevelId])
  // Imagens mantêm a proporção ao redimensionar (Shift libera); blocos são livres (Shift trava).
  const transformKeepsRatio = transformIds.some((id) => doc.objects.find((o) => o.id === id)?.type === 'image')
  useEffect(() => {
    const tr = transformerRef.current
    const stage = stageRef.current
    if (!tr || !stage) return
    const nodes = transformIds
      .map((id) => stage.findOne(`#${blockNodeId(id)}`) ?? stage.findOne(`#${imageNodeId(id)}`))
      .filter((n): n is Konva.Node => !!n)
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  })
  const angles = useMemo(
    () => (settings.showDimensions ? cornerAngles(visibleWalls, settings.cornerAngles) : []),
    [visibleWalls, settings.showDimensions, settings.cornerAngles]
  )
  const hair = 1 / viewport.scale
  const fmt = (cm: number): string => formatLength(cm, settings.unit, settings.precision)
  const menuItems = useContextMenuItems()

  // ------------------------------------------------------- tamanho/ajuste
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      useEditorStore.getState().setCanvasSize(Math.floor(width), Math.floor(height))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fittedRef = useRef(false)
  useEffect(() => {
    if (!fittedRef.current && canvasSize.width > 0) {
      fittedRef.current = true
      useEditorStore.getState().zoomToFit()
    }
  }, [canvasSize])

  // ------------------------------------------------------------- snapping
  const snap = useCallback(
    (raw: Point, opts: { origin?: Point; angleLock?: boolean; exclude?: Set<Id>; free?: boolean; extra?: Point[] } = {}) => {
      if (opts.free) return { point: raw, kind: 'free' as SnapKind }
      // 1) Extremidades de paredes existentes (e pontos extras, ex.: vértices do polígono) têm prioridade.
      let best: Point | null = null
      let bestD = SNAP_RADIUS_PX / viewport.scale
      const consider = (p: Point): void => {
        const d = distance(raw, p)
        if (d < bestD) {
          best = p
          bestD = d
        }
      }
      for (const w of visibleWalls) {
        if (opts.exclude?.has(w.id)) continue
        consider(w.a)
        consider(w.b)
      }
      opts.extra?.forEach(consider)
      if (best) return { point: best as Point, kind: 'endpoint' as SnapKind }
      // 2) Shift: trava em múltiplos de 45° (comprimento ainda no passo do grid).
      if (opts.angleLock && opts.origin) {
        const step = settings.snapEnabled ? settings.gridSize : undefined
        return { point: lockToAngle(opts.origin, raw, 45, step), kind: 'angle' as SnapKind }
      }
      // 3) Grid.
      if (settings.snapEnabled) return { point: snapToGrid(raw, settings.gridSize), kind: 'grid' as SnapKind }
      return { point: raw, kind: 'free' as SnapKind }
    },
    [visibleWalls, viewport.scale, settings.snapEnabled, settings.gridSize]
  )

  // ---------------------------------------------------- reset entre ferramentas
  const resetTransient = useCallback(() => {
    const g = gestureRef.current
    if (g && (g.kind === 'draw' || g.kind === 'poly' || g.kind === 'measure' || g.kind === 'dimension' || g.kind === 'calibrate')) gestureRef.current = null
    setDraft(null)
    setPoly(null)
    setMeasure(null)
    setDimDraft(null)
    setGhostAt(null)
    setCalib(null)
    setOpeningPreview(null)
    setRoomPreview(null)
    setMarker(null)
    setHoveredId(null)
  }, [])

  useEffect(() => {
    resetTransient()
    setMenu(null)
  }, [tool, wallMode, roomMode, resetTransient])

  const endDraw = useCallback(() => {
    if (gestureRef.current?.kind === 'draw') gestureRef.current = null
    setDraft(null)
  }, [])

  // -------------------------------------------------------- criação de objetos
  /** Verifica se a camada ativa aceita novos objetos; avisa com toast caso não. */
  const activeLayerWritable = (): boolean => {
    const layer = doc.layers.find((l) => l.id === activeLayerId)
    if (!layer) {
      toast.warning('Selecione uma camada ativa no painel Camadas.')
      return false
    }
    if (layer.locked) {
      toast.warning(`A camada “${layer.name}” está bloqueada. Desbloqueie-a ou escolha outra camada.`)
      return false
    }
    if (!layer.visible) {
      toast.warning(`A camada “${layer.name}” está oculta. Torne-a visível para desenhar nela.`)
      return false
    }
    return true
  }

  const createWalls = (segments: [Point, Point][]): void => {
    const created: WallObject[] = segments
      .filter(([a, b]) => distance(a, b) >= MIN_WALL_CM)
      .map(([a, b]) => ({ id: newId(), type: 'wall', layerId: activeLayerId, a, b, thickness: settings.wallThickness }))
    if (!created.length) return
    // Cada parede nova ganha sua cota associada (camada "Cotas"), se a opção estiver ligada.
    useEditorStore
      .getState()
      .commit((d) => addObjects(d, [...created, ...(settings.autoDimensions ? wallDimensionsFor(d, created) : [])]))
  }

  const createFreeDimension = (a: Point, b: Point): void => {
    if (distance(a, b) < 1) return
    const dim: FreeDimension = { id: newId(), type: 'dimension', kind: 'free', layerId: activeLayerId, a, b, offset: null }
    useEditorStore.getState().commit((d) => addObjects(d, [dim]))
    if (!settings.showDimensions) toast.info('Cota criada — as cotas estão ocultas (Ctrl+Shift+C para mostrar).')
  }

  const createRoom = (points: Point[]): void => {
    if (points.length < 3 || polygonArea(points) < 100) {
      toast.warning('O cômodo precisa de pelo menos 3 pontos e alguma área.')
      return
    }
    const store = useEditorStore.getState()
    const room = newRoom(store.doc, activeLayerId, points)
    store.commit((d) => addObjects(d, [room]))
    toast.success(`${room.name} criado — ${formatArea(polygonArea(points), settings.unit, settings.precision)}`)
  }

  const finishPoly = (): void => {
    const g = gestureRef.current
    if (g?.kind === 'poly') {
      if (g.points.length >= 3) createRoom(g.points)
      gestureRef.current = null
    }
    setPoly(null)
  }

  /** Onde a porta/janela seria inserida para a posição do cursor (null = fora de parede). */
  const openingAt = (world: Point, free: boolean): OpeningPreview | 'too-short' | null => {
    const hit = nearestWall(world, visibleWalls, WALL_PICK_PX * hair)
    if (!hit) return null
    const width = tool === 'door' ? settings.doorWidth : settings.windowWidth
    const len = distance(hit.wall.a, hit.wall.b)
    if (len < width + 2 * OPENING_MARGIN) return 'too-short'
    const raw = settings.snapEnabled && !free ? Math.round(hit.t / 5) * 5 : hit.t
    return { wall: hit.wall, offset: clampOffset(raw, width, len), side: hit.side }
  }

  const placeOpening = (p: OpeningPreview): void => {
    const base = { id: newId(), layerId: activeLayerId, wallId: p.wall.id, offset: p.offset }
    const o: OpeningObject =
      tool === 'door'
        ? { ...base, type: 'door', width: settings.doorWidth, side: p.side, hinge: doorHinge, ...(settings.doorVariant !== 'swing' ? { variant: settings.doorVariant } : {}) }
        : settings.windowVariant === 'niche'
          ? { ...base, type: 'window', width: 50, variant: 'niche', sill: 90, height: 60, depth: 12, side: p.side }
          : { ...base, type: 'window', width: settings.windowWidth, ...(settings.windowVariant !== 'casement' ? { variant: settings.windowVariant } : {}) }
    useEditorStore.getState().commit((d) => addObjects(d, [o]))
  }

  // ------------------------------------------------------------- teclado
  useEffect(() => {
    const isTyping = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))
    const down = (e: KeyboardEvent): void => {
      if (isTyping(e.target) || useDialogStore.getState().current) return
      const store = useEditorStore.getState()
      const g = gestureRef.current
      if (e.code === 'Space') {
        e.preventDefault()
        setSpaceDown(true)
      } else if (e.key === 'Enter') {
        if (g?.kind === 'draw') endDraw()
        else if (g?.kind === 'poly') finishPolyRef.current()
      } else if (e.key === 'Escape') {
        if (store.tool === 'block') {
          store.setPlacing(null)
          return
        }
        if (store.tool === 'calibrate') {
          useEditorStore.setState({ calibratingImageId: null })
          store.setTool('select')
          return
        }
        if (g?.kind === 'move' || g?.kind === 'endpoint' || g?.kind === 'slide') {
          store.cancelGesture()
          gestureRef.current = null
        } else if (g || measureRef.current) {
          resetTransient()
        } else store.clearSelection()
      } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && store.tool === 'door') {
        store.setDoorHinge(store.doorHinge === 'start' ? 'end' : 'start')
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [endDraw, resetTransient])
  // Refs para o listener de teclado acessar valores atuais.
  const finishPolyRef = useRef(finishPoly)
  finishPolyRef.current = finishPoly
  const measureRef = useRef(measure)
  measureRef.current = measure

  // ------------------------------------------------------------ ponteiro
  const pointers = (): { screen: Point; world: Point } | null => {
    const stage = stageRef.current
    const screen = stage?.getPointerPosition()
    const world = stage?.getRelativePointerPosition()
    return screen && world ? { screen, world } : null
  }

  const openMenuAt = (evt: MouseEvent): void => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setMenu({ x: evt.clientX - rect.left, y: evt.clientY - rect.top })
  }

  /** Inicia mover/deslizar/selecionar a partir de um clique em objeto (ferramenta Selecionar). */
  const startSelectGesture = (target: Konva.Node, world: Point, screen: Point, evt: MouseEvent): void => {
    const store = useEditorStore.getState()
    const editable = editableLayerIds(store.doc, store.activeLevelId)

    // Alça de extremidade → redimensiona a parede (e as conectadas naquele ponto).
    if (target.hasName('endpoint-handle')) {
      const [wallId, end] = target.id().split('|') as [Id, 'a' | 'b']
      const wall = wallsById.get(wallId)
      if (!wall) return
      const grabbed = wall[end]
      const ends: EndRef[] = walls
        .filter((w) => editable.has(w.layerId))
        .flatMap((w) =>
          (['a', 'b'] as const).filter((k) => samePoint(w[k], grabbed)).map((k) => ({ wallId: w.id, end: k, origin: w[k] }))
        )
      store.beginGesture()
      gestureRef.current = { kind: 'endpoint', ends, anchor: end === 'a' ? wall.b : wall.a, base: store.doc }
      return
    }

    if (target.hasName('plan-object')) {
      const id = target.id()
      const obj = objectsById.get(id)
      if (!obj) return
      // Duplo clique em cota → volta à posição automática.
      if (evt.detail >= 2 && obj.type === 'dimension') {
        if (obj.offset !== null) resetDimensionOffset(obj.id)
        return
      }
      // Duplo clique em texto/cômodo → editar texto/nome.
      if (evt.detail >= 2 && (obj.type === 'text' || obj.type === 'room')) {
        evt.preventDefault()
        store.select([id])
        store.setEditing({ type: obj.type, id })
        return
      }
      if (evt.shiftKey) {
        store.toggleSelection(id)
        return
      }
      const ids = selectedSet.has(id) ? selectedIds : [id]
      if (!selectedSet.has(id)) store.select(ids)

      // Porta/janela → desliza ao longo da parede (ou muda de parede).
      if (isOpening(obj) && ids.length === 1) {
        const wall = wallsById.get(obj.wallId)
        if (!wall) return
        store.beginGesture()
        const t = projectOnSegment(world, wall.a, wall.b).t
        gestureRef.current = { kind: 'slide', openingId: id, grab: obj.offset - t, base: store.doc }
        return
      }

      // Cota → arrastar muda a distância da linha de cota (offset).
      if (obj.type === 'dimension' && ids.length === 1) {
        store.beginGesture()
        gestureRef.current = { kind: 'dimOffset', id, base: store.doc }
        return
      }

      // Demais → mover. Extremidades de paredes NÃO selecionadas conectadas às movidas "esticam" junto.
      const moving = new Set(ids)
      const movedPoints = walls.filter((w) => moving.has(w.id)).flatMap((w) => [w.a, w.b])
      const attached: EndRef[] = walls
        .filter((w) => !moving.has(w.id) && editable.has(w.layerId))
        .flatMap((w) =>
          (['a', 'b'] as const)
            .filter((k) => movedPoints.some((mp) => samePoint(mp, w[k])))
            .map((k) => ({ wallId: w.id, end: k, origin: w[k] }))
        )
      store.beginGesture()
      gestureRef.current = { kind: 'move', startWorld: world, ids, attached, base: store.doc }
      return
    }

    // Área vazia → seleção por retângulo.
    if (!evt.shiftKey) store.clearSelection()
    gestureRef.current = { kind: 'marquee', start: world, startScreen: screen, additive: evt.shiftKey }
    setMarquee({ x: world.x, y: world.y, width: 0, height: 0 })
  }

  const handleMouseDown = (e: KonvaEventObject<MouseEvent>): void => {
    const evt = e.evt
    const p = pointers()
    if (!p) return
    setMenu(null)
    const store = useEditorStore.getState()
    const g = gestureRef.current

    // Alças do Transformer (girar/redimensionar blocos) são tratadas pelo próprio Konva.
    if (e.target.getParent()?.getClassName() === 'Transformer') return

    // Pan: botão do meio, Espaço + arrastar, ou ferramenta Mão.
    if (evt.button === 1 || (evt.button === 0 && (spaceDown || tool === 'pan'))) {
      evt.preventDefault()
      gestureRef.current = { kind: 'pan', startPointer: p.screen, startViewport: viewport }
      setPanning(true)
      return
    }

    // Botão direito: encerra o desenho em andamento; senão abre o menu de contexto.
    if (evt.button === 2) {
      if (g?.kind === 'draw') return endDraw()
      if (g?.kind === 'poly') return finishPoly()
      if (g?.kind === 'measure' || g?.kind === 'dimension') return resetTransient()
      if (tool === 'select' && e.target.hasName('plan-object') && !selectedSet.has(e.target.id())) {
        store.select([e.target.id()])
      }
      openMenuAt(evt)
      return
    }
    if (evt.button !== 0) return

    switch (tool) {
      case 'select':
        startSelectGesture(e.target, p.world, p.screen, evt)
        return

      case 'wall': {
        if (g?.kind === 'draw' && g.clickMode) {
          // Usa a posição do próprio clique (não depende de ter havido mousemove antes).
          const end = snap(p.world, { origin: g.start, angleLock: evt.shiftKey, free: evt.altKey }).point
          if (distance(g.start, end) < MIN_WALL_CM) {
            // Clique repetido no último ponto: duplo clique encerra a polilinha.
            // (Não usamos o onDblClick do Konva: ele dispara para dois cliques
            // rápidos mesmo em pontos diferentes, o que cortaria o desenho.)
            if (evt.detail >= 2) endDraw()
            return
          }
          createWalls(draftSegments(g.start, end, wallMode))
          if (wallMode === 'rect' || samePoint(end, g.chainStart)) {
            endDraw() // retângulo concluído ou polilinha fechada
            return
          }
          gestureRef.current = { ...g, start: end, current: end, downScreen: p.screen }
          setDraft({ a: end, b: end })
          return
        }
        if (!activeLayerWritable()) return
        const s = snap(p.world, { free: evt.altKey })
        gestureRef.current = {
          kind: 'draw',
          start: s.point,
          current: s.point,
          clickMode: false,
          downScreen: p.screen,
          chainStart: s.point
        }
        setDraft({ a: s.point, b: s.point })
        return
      }

      case 'door':
      case 'window': {
        if (!activeLayerWritable()) return
        const pv = openingAt(p.world, evt.altKey)
        if (pv === 'too-short') toast.warning('Esta parede é curta demais para essa largura de vão.')
        else if (!pv) toast.info(`Clique sobre uma parede para inserir a ${tool === 'door' ? 'porta' : 'janela'}.`)
        else placeOpening(pv)
        return
      }

      case 'room': {
        if (roomMode === 'detect') {
          if (!activeLayerWritable()) return
          const detected = detectRoomAt(p.world, visibleWalls, graph)
          if (!detected) {
            toast.warning('Nenhuma área fechada por paredes aqui. Feche o contorno ou use o modo Polígono.')
            return
          }
          const area = polygonArea(detected.points)
          const existing = byType(store.doc.objects, 'room').find(
            (r) => pointInPolygon(p.world, r.points) && Math.abs(polygonArea(r.points) - area) / area < 0.05
          )
          if (existing) {
            toast.info(`Já existe um cômodo aqui (“${existing.name}”).`)
            return
          }
          createRoom(detected.points)
          setRoomPreview(null)
          return
        }
        // Polígono ponto a ponto.
        const first = g?.kind === 'poly' ? g.points[0] : undefined
        const s = snap(p.world, { free: evt.altKey, extra: first ? [first] : [] })
        if (g?.kind === 'poly') {
          const last = g.points[g.points.length - 1]
          if (g.points.length >= 3 && samePoint(s.point, g.points[0], 1)) return finishPoly() // fechou no 1º ponto
          if (samePoint(s.point, last, 1)) {
            if (evt.detail >= 2) finishPoly()
            return
          }
          g.points = [...g.points, s.point]
          setPoly({ points: g.points, current: s.point })
          return
        }
        if (!activeLayerWritable()) return
        gestureRef.current = { kind: 'poly', points: [s.point] }
        setPoly({ points: [s.point], current: s.point })
        return
      }

      case 'calibrate': {
        if (!calibratingImageId) return
        if (g?.kind === 'calibrate') {
          if (distance(g.start, p.world) < 1) return
          evt.preventDefault() // não deixa o clique tirar o foco do campo do diálogo
          gestureRef.current = null
          setCalib({ a: g.start, b: p.world })
          openCalibrateDialog({ imageId: calibratingImageId, a: g.start, b: p.world })
          return
        }
        gestureRef.current = { kind: 'calibrate', start: p.world }
        setCalib({ a: p.world, b: p.world })
        return
      }

      case 'block': {
        if (!placingBlockId) {
          toast.info('Escolha um bloco na biblioteca (painel à esquerda) para inserir.')
          return
        }
        insertBlock(placingBlockId, p.world, placingRotation, !evt.altKey)
        store.select([]) // continua no modo de inserção para colocar outras cópias
        return
      }

      case 'text': {
        if (!activeLayerWritable()) return
        // Impede que o mousedown tire o foco do editor que vai abrir.
        evt.preventDefault()
        const s = snap(p.world, { free: evt.altKey })
        store.setEditing({ type: 'new-text', position: s.point })
        return
      }

      case 'dimension': {
        const s = snap(p.world, { free: evt.altKey, origin: g?.kind === 'dimension' ? g.start : undefined, angleLock: evt.shiftKey })
        if (g?.kind === 'dimension' && g.clickMode) {
          createFreeDimension(g.start, s.point)
          gestureRef.current = null
          setDimDraft(null)
          return
        }
        if (!activeLayerWritable()) return
        gestureRef.current = { kind: 'dimension', start: s.point, current: s.point, clickMode: false, downScreen: p.screen }
        setDimDraft({ a: s.point, b: s.point })
        return
      }

      case 'measure': {
        const s = snap(p.world, { free: evt.altKey, origin: g?.kind === 'measure' ? g.start : undefined, angleLock: evt.shiftKey })
        if (g?.kind === 'measure' && g.clickMode) {
          setMeasure({ a: g.start, b: s.point })
          gestureRef.current = null
          return
        }
        gestureRef.current = { kind: 'measure', start: s.point, clickMode: false, downScreen: p.screen }
        setMeasure({ a: s.point, b: s.point })
        return
      }
    }
  }

  const handleMouseMove = (e: KonvaEventObject<MouseEvent>): void => {
    const evt = e.evt
    const p = pointers()
    if (!p) return
    const store = useEditorStore.getState()
    store.setCursor(p.world)
    const g = gestureRef.current

    if (!g) {
      switch (tool) {
        case 'select': {
          const id = e.target.hasName('plan-object') ? e.target.id() : null
          if (id !== hoveredId) setHoveredId(id)
          break
        }
        case 'wall':
        case 'measure':
        case 'dimension':
        case 'text': {
          const s = snap(p.world, { free: evt.altKey })
          setMarker({ p: s.point, kind: s.kind })
          break
        }
        case 'door':
        case 'window': {
          const pv = openingAt(p.world, evt.altKey)
          setOpeningPreview(pv && pv !== 'too-short' ? pv : null)
          break
        }
        case 'block':
          setGhostAt({ p: p.world, free: evt.altKey })
          break
        case 'room':
          if (roomMode === 'detect') setRoomPreview(detectRoomAt(p.world, visibleWalls, graph)?.points ?? null)
          else {
            const s = snap(p.world, { free: evt.altKey })
            setMarker({ p: s.point, kind: s.kind })
          }
          break
      }
      return
    }

    switch (g.kind) {
      case 'pan':
        store.setViewport({
          ...g.startViewport,
          x: g.startViewport.x + (p.screen.x - g.startPointer.x),
          y: g.startViewport.y + (p.screen.y - g.startPointer.y)
        })
        break

      case 'draw': {
        const s = snap(p.world, { origin: g.start, angleLock: evt.shiftKey, free: evt.altKey })
        g.current = s.point
        setDraft({ a: g.start, b: s.point })
        setMarker({ p: s.point, kind: s.kind })
        break
      }

      case 'measure': {
        const s = snap(p.world, { origin: g.start, angleLock: evt.shiftKey, free: evt.altKey })
        setMeasure({ a: g.start, b: s.point })
        setMarker({ p: s.point, kind: s.kind })
        break
      }

      case 'dimension': {
        const s = snap(p.world, { origin: g.start, angleLock: evt.shiftKey, free: evt.altKey })
        g.current = s.point
        setDimDraft({ a: g.start, b: s.point })
        setMarker({ p: s.point, kind: s.kind })
        break
      }

      case 'calibrate':
        setCalib({ a: g.start, b: p.world })
        break

      case 'dimOffset': {
        const dim = g.base.objects.find((o): o is DimensionObject => o.id === g.id && o.type === 'dimension')
        const seg = dim && measuredSegment(dim, wallsById)
        if (!dim || !seg) break
        // Distância com sinal do cursor até a reta medida (lado esquerdo de a→b positivo).
        const L = perp(normalize(sub(seg.b, seg.a)))
        let offset = dot(sub(p.world, seg.a), L)
        if (settings.snapEnabled && !evt.altKey) offset = Math.round(offset / 5) * 5
        store.updateLive(() => mapObjects(g.base, [g.id], (o) => (o.type === 'dimension' ? { ...o, offset } : o)))
        break
      }

      case 'poly': {
        const s = snap(p.world, { free: evt.altKey, extra: [g.points[0]] })
        setPoly({ points: g.points, current: s.point })
        setMarker({ p: s.point, kind: s.kind })
        break
      }

      case 'move': {
        let delta = sub(p.world, g.startWorld)
        if (evt.shiftKey) delta = Math.abs(delta.x) >= Math.abs(delta.y) ? { x: delta.x, y: 0 } : { x: 0, y: delta.y }
        if (settings.snapEnabled && !evt.altKey) delta = snapToGrid(delta, settings.gridSize)
        if (delta.x === 0 && delta.y === 0) {
          store.updateLive(() => g.base)
          break
        }
        const moving = new Set(g.ids)
        const attachedIds = new Set(g.attached.map((x) => x.wallId))
        // Um único bloco sendo arrastado "gruda" na parede próxima (Alt desliga).
        const soloBlock = g.ids.length === 1 && !evt.altKey ? g.base.objects.find((o): o is BlockObject => o.id === g.ids[0] && o.type === 'block') : undefined
        const soloDef = soloBlock && resolveBlock(soloBlock.blockId, g.base)
        store.updateLive(() =>
          mapObjects(g.base, [...moving, ...attachedIds], (o) => {
            if (soloBlock && soloDef && o.id === soloBlock.id) {
              const moved = translateObject(o, delta) as BlockObject
              const snapped = snapBlockToWalls(moved, soloDef, visibleWalls, WALL_SNAP_CM)
              return snapped ? { ...moved, ...snapped } : moved
            }
            if (moving.has(o.id)) return translateObject(o, delta)
            if (o.type !== 'wall') return o
            const next = { ...o }
            for (const x of g.attached) if (x.wallId === o.id) next[x.end] = add(x.origin, delta)
            return next
          })
        )
        break
      }

      case 'endpoint': {
        const exclude = new Set(g.ends.map((x) => x.wallId))
        const s = snap(p.world, { origin: g.anchor, angleLock: evt.shiftKey, exclude, free: evt.altKey })
        setMarker({ p: s.point, kind: s.kind })
        if (distance(s.point, g.anchor) < MIN_WALL_CM) break // evita parede de comprimento zero
        store.updateLive(() =>
          mapObjects(g.base, exclude, (o) => {
            if (o.type !== 'wall') return o
            const next = { ...o }
            for (const x of g.ends) if (x.wallId === o.id) next[x.end] = s.point
            return next
          })
        )
        break
      }

      case 'slide': {
        const opening = g.base.objects.find((o): o is OpeningObject => o.id === g.openingId && isOpening(o))
        if (!opening) break
        const host = wallsById.get(opening.wallId)
        // Perto de outra parede → muda de parede; senão desliza na atual.
        const hit = nearestWall(p.world, visibleWalls, WALL_PICK_PX * hair)
        const wall = hit && hit.wall.id !== opening.wallId ? hit.wall : host
        if (!wall) break
        const len = distance(wall.a, wall.b)
        if (len < opening.width + 2 * OPENING_MARGIN) break
        const t = projectOnSegment(p.world, wall.a, wall.b).t + (wall === host ? g.grab : 0)
        const raw = settings.snapEnabled && !evt.altKey ? Math.round(t / 5) * 5 : t
        const offset = clampOffset(raw, opening.width, len)
        store.updateLive(() =>
          mapObjects(g.base, [opening.id], (o) => (isOpening(o) ? { ...o, wallId: wall.id, offset } : o))
        )
        break
      }

      case 'marquee':
        setMarquee(rectFromPoints(g.start, p.world))
        break
    }
  }

  /** Finaliza gestos. Escutado na janela para funcionar mesmo soltando fora do canvas. */
  const handleMouseUp = (evt: MouseEvent): void => {
    const g = gestureRef.current
    if (!g) return
    const stage = stageRef.current
    if (stage) stage.setPointersPositions(evt)
    const p = pointers()
    const store = useEditorStore.getState()

    switch (g.kind) {
      case 'pan':
        gestureRef.current = null
        setPanning(false)
        break

      case 'draw':
        if (g.clickMode) break // no modo clique-a-clique, quem avança é o mousedown
        if (p && distance(p.screen, g.downScreen) < CLICK_TOLERANCE_PX) {
          g.clickMode = true // foi um clique simples → passa para o modo polilinha
          break
        }
        createWalls(draftSegments(g.start, g.current, wallMode))
        endDraw()
        break

      case 'measure':
        if (g.clickMode) break
        if (p && distance(p.screen, g.downScreen) < CLICK_TOLERANCE_PX) g.clickMode = true
        else gestureRef.current = null // medida fica na tela até Esc ou nova medida
        break

      case 'dimension':
        if (g.clickMode) break
        if (p && distance(p.screen, g.downScreen) < CLICK_TOLERANCE_PX) g.clickMode = true
        else {
          createFreeDimension(g.start, g.current)
          setDimDraft(null)
          gestureRef.current = null
        }
        break

      case 'move':
      case 'endpoint':
      case 'slide':
      case 'dimOffset':
        store.endGesture()
        gestureRef.current = null
        setMarker(null)
        break

      case 'marquee': {
        gestureRef.current = null
        setMarquee(null)
        if (!p || distance(p.screen, g.startScreen) < CLICK_TOLERANCE_PX) break
        const r = rectFromPoints(g.start, p.world)
        const editable = editableLayerIds(store.doc, store.activeLevelId)
        const hits = store.doc.objects
          .filter((o) => editable.has(o.layerId) && objectHitsRect(o, r, wallsById, resolve))
          .map((o) => o.id)
        store.select(g.additive ? [...new Set([...store.selectedIds, ...hits])] : hits)
        break
      }

      case 'poly':
      case 'calibrate':
        break // avança por cliques (mousedown)
    }
  }

  // Ref para o listener global sempre usar a versão mais recente do handler.
  const mouseUpRef = useRef(handleMouseUp)
  mouseUpRef.current = handleMouseUp
  useEffect(() => {
    const up = (evt: MouseEvent): void => mouseUpRef.current(evt)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const handleWheel = (e: KonvaEventObject<WheelEvent>): void => {
    e.evt.preventDefault()
    setMenu(null)
    const anchor = stageRef.current?.getPointerPosition() ?? undefined
    // Pinça do touchpad chega como wheel + ctrlKey, com deltas menores.
    const k = e.evt.ctrlKey ? 0.01 : 0.0015
    useEditorStore.getState().zoomBy(Math.exp(-e.evt.deltaY * k), anchor)
  }

  // ------------------------------------------------------------- render
  const cursor = panning
    ? 'grabbing'
    : spaceDown || tool === 'pan'
      ? 'grab'
      : tool === 'text'
        ? 'text'
        : tool === 'block' && !placingBlockId
          ? 'default'
        : tool !== 'select'
          ? 'crosshair'
          : hoveredId
            ? 'move'
            : 'default'

  const selectedObj = selectedIds.length === 1 ? objectsById.get(selectedIds[0]) : undefined
  const singleSelectedWall = selectedObj?.type === 'wall' ? selectedObj : undefined
  const showHandles =
    tool === 'select' && singleSelectedWall && editableLayerIds(doc, activeLevelId).has(singleSelectedWall.layerId)
  const gestureKind = gestureRef.current?.kind
  const segments = draft ? draftSegments(draft.a, draft.b, wallMode) : []
  const editingTextId = editing?.type === 'text' ? editing.id : null

  return (
    <div
      ref={containerRef}
      className="canvas-host"
      style={{ cursor, background: palette.background }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(BLOCK_DRAG_MIME)) {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }
      }}
      onDrop={(e) => {
        const blockId = e.dataTransfer.getData(BLOCK_DRAG_MIME)
        const stage = stageRef.current
        if (!blockId || !stage) return
        e.preventDefault()
        stage.setPointersPositions(e.nativeEvent)
        const world = stage.getRelativePointerPosition()
        if (world) insertBlock(blockId, world, 0, !e.altKey)
      }}
    >
      {canvasSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          x={viewport.x}
          y={viewport.y}
          scaleX={viewport.scale}
          scaleY={viewport.scale}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => {
            useEditorStore.getState().setCursor(null)
            if (!gestureRef.current) {
              setMarker(null)
              setOpeningPreview(null)
              setRoomPreview(null)
            }
          }}
          onWheel={handleWheel}
          onContextMenu={(e) => e.evt.preventDefault()}
        >
          {/* 1. Grid */}
          <Layer listening={false}>
            {settings.showGrid && (
              <Grid
                viewport={viewport}
                width={canvasSize.width}
                height={canvasSize.height}
                step={settings.gridSize}
                palette={palette}
              />
            )}
          </Layer>

          {/* 2. Conteúdo: um Group por camada do documento, na ordem definida */}
          <Layer>
            {ghostLevelId && <GhostLevel doc={doc} levelId={ghostLevelId} palette={palette} scale={viewport.scale} resolve={resolve} />}
            {doc.layers.map((layer) => {
              if (!layer.visible || layer.levelId !== activeLevelId) return null
              const objs = visibleObjects.filter((o) => o.layerId === layer.id)
              const common = { palette, scale: viewport.scale, selected: selectedSet, hoveredId }
              return (
                <Group key={layer.id} opacity={layer.opacity} listening={tool === 'select' && !layer.locked}>
                  <ImageShapes {...common} images={byType(objs, 'image') as ImageObject[]} />
                  <RoomShapes {...common} part="fill" rooms={byType(objs, 'room') as RoomObject[]} unit={settings.unit} precision={settings.precision} />
                  <BlockShapes {...common} blocks={byType(objs, 'block') as BlockObject[]} resolve={resolve} tint={layer.color} />
                  <WallShapes {...common} walls={byType(objs, 'wall')} geometry={wallGeometry} tint={layer.color} />
                  <OpeningShapes
                    {...common}
                    openings={objs.filter(isOpening)}
                    wallsById={wallsById}
                    tint={layer.color}
                  />
                  <TextShapes {...common} texts={byType(objs, 'text') as TextObject[]} editingId={editingTextId} tint={layer.color} />
                  <DimensionShapes
                    {...common}
                    layouts={dimLayouts.filter((d) => d.layerId === layer.id)}
                    unit={settings.unit}
                    precision={settings.precision}
                    tint={layer.color}
                  />
                  {layer.role === 'dimensions' && <CornerAngleShapes angles={angles} palette={palette} scale={viewport.scale} />}
                </Group>
              )
            })}
            {/* Rótulos dos cômodos por cima de paredes e móveis (legibilidade) */}
            <RoomShapes
              part="labels"
              rooms={visibleObjects.filter((o): o is RoomObject => o.type === 'room')}
              palette={palette}
              scale={viewport.scale}
              selected={selectedSet}
              hoveredId={hoveredId}
              unit={settings.unit}
              precision={settings.precision}
            />
          </Layer>

          {/* 3. Overlay */}
          <Layer>
            {/* Rascunho de paredes */}
            {segments.map(([a, b], i) => (
              <Line
                key={`draft-${i}`}
                points={[a.x, a.y, b.x, b.y]}
                stroke={palette.accent}
                opacity={0.45}
                strokeWidth={settings.wallThickness}
                lineCap="square"
                listening={false}
              />
            ))}
            {draft && wallMode === 'line' && distance(draft.a, draft.b) > 0 && (
              <LiveLabel
                a={draft.a}
                b={draft.b}
                text={`${fmt(distance(draft.a, draft.b))}  ·  ${formatAngle(-angleDeg(draft.a, draft.b))}`}
                offset={settings.wallThickness / 2}
                scale={viewport.scale}
                palette={palette}
                color={palette.accent}
              />
            )}
            {draft && wallMode === 'rect' && segments.length === 4 && (
              <>
                <LiveLabel a={segments[0][0]} b={segments[0][1]} text={fmt(Math.abs(draft.b.x - draft.a.x))} offset={settings.wallThickness / 2} scale={viewport.scale} palette={palette} color={palette.accent} />
                <LiveLabel a={segments[3][0]} b={segments[3][1]} text={fmt(Math.abs(draft.b.y - draft.a.y))} offset={settings.wallThickness / 2} scale={viewport.scale} palette={palette} color={palette.accent} />
              </>
            )}

            {/* Pré-visualização de porta/janela */}
            {openingPreview && (tool === 'door' || tool === 'window') && (
              <OpeningSymbol
                opening={{ type: tool, side: openingPreview.side, hinge: doorHinge, variant: tool === 'door' ? settings.doorVariant : settings.windowVariant }}
                g={openingGeometry(
                  { offset: openingPreview.offset, width: tool === 'door' ? settings.doorWidth : settings.windowWidth },
                  openingPreview.wall
                )}
                palette={palette}
                scale={viewport.scale}
                state="preview"
                tint={null}
              />
            )}

            {/* Cômodo: área detectada sob o cursor */}
            {roomPreview && tool === 'room' && <AreaPreview points={roomPreview} palette={palette} hair={hair} label={formatArea(polygonArea(roomPreview), settings.unit, settings.precision)} />}

            {/* Cômodo: polígono em desenho */}
            {poly && (
              <>
                <AreaPreview
                  points={[...poly.points, poly.current]}
                  palette={palette}
                  hair={hair}
                  open
                  label={poly.points.length >= 2 ? formatArea(polygonArea([...poly.points, poly.current]), settings.unit, settings.precision) : undefined}
                />
                {poly.points.map((pt, i) => (
                  <Circle key={i} x={pt.x} y={pt.y} radius={(i === 0 ? 5 : 3.5) * hair} fill={i === 0 ? palette.handleFill : palette.accent} stroke={palette.accent} strokeWidth={1.5 * hair} listening={false} />
                ))}
              </>
            )}

            {/* Cota manual em desenho */}
            {dimDraft && distance(dimDraft.a, dimDraft.b) > 0 && (
              <DimensionShapes
                preview
                layouts={layoutDimensions(
                  [{ id: 'preview', type: 'dimension', kind: 'free', layerId: '', a: dimDraft.a, b: dimDraft.b, offset: null }],
                  wallsById,
                  sides,
                  { scale: viewport.scale, offsetPx: settings.dimensionOffset, style: settings.dimensionStyle }
                )}
                palette={palette}
                scale={viewport.scale}
                selected={selectedSet}
                hoveredId={null}
                unit={settings.unit}
                precision={settings.precision}
                tint={null}
              />
            )}

            {/* Definir escala: linha entre os dois pontos */}
            {calib && distance(calib.a, calib.b) > 0 && (
              <MeasureShape a={calib.a} b={calib.b} palette={palette} scale={viewport.scale} text={fmt(distance(calib.a, calib.b))} />
            )}

            {/* Medida temporária */}
            {measure && distance(measure.a, measure.b) > 0 && <MeasureShape a={measure.a} b={measure.b} palette={palette} scale={viewport.scale} text={`${fmt(distance(measure.a, measure.b))}  ·  ${formatAngle(-angleDeg(measure.a, measure.b))}`} />}

            {/* Comprimento da parede selecionada enquanto redimensiona/move */}
            {singleSelectedWall && (gestureKind === 'move' || gestureKind === 'endpoint') && (
              <LiveLabel
                a={singleSelectedWall.a}
                b={singleSelectedWall.b}
                text={fmt(distance(singleSelectedWall.a, singleSelectedWall.b))}
                offset={singleSelectedWall.thickness / 2}
                scale={viewport.scale}
                palette={palette}
                color={palette.accent}
              />
            )}

            {/* Marcador de snap */}
            {marker &&
              (marker.kind === 'endpoint' ? (
                <Rect x={marker.p.x} y={marker.p.y} width={10 * hair} height={10 * hair} offsetX={5 * hair} offsetY={5 * hair} stroke={palette.accent} strokeWidth={1.5 * hair} listening={false} />
              ) : (
                <Circle x={marker.p.x} y={marker.p.y} radius={3 * hair} fill={palette.accent} listening={false} />
              ))}

            {/* Alças de extremidade da parede selecionada */}
            {showHandles &&
              singleSelectedWall &&
              (['a', 'b'] as const).map((end) => (
                <Circle
                  key={end}
                  id={`${singleSelectedWall.id}|${end}`}
                  name="endpoint-handle"
                  x={singleSelectedWall[end].x}
                  y={singleSelectedWall[end].y}
                  radius={5 * hair}
                  hitStrokeWidth={10 * hair}
                  fill={palette.handleFill}
                  stroke={palette.accent}
                  strokeWidth={1.75 * hair}
                />
              ))}

            {/* Bloco "fantasma" no modo de inserção */}
            {tool === 'block' && placingBlockId && ghostAt && (() => {
              const def = resolve(placingBlockId)
              if (!def) return null
              const inst = previewInstance(def, ghostAt.p, placingRotation, !ghostAt.free)
              return (
                <Group x={inst.position.x} y={inst.position.y} rotation={inst.rotation} offsetX={def.width / 2} offsetY={def.height / 2} opacity={0.7} listening={false}>
                  <BlockPrimitives def={def} colors={{ fill: palette.accentSoft, ink: palette.accent }} px={hair} />
                </Group>
              )
            })()}

            {/* Girar/redimensionar blocos selecionados (Shift mantém a proporção) */}
            <Transformer
              ref={transformerRef}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={6}
              keepRatio={transformKeepsRatio}
              flipEnabled
              ignoreStroke
              anchorSize={8}
              anchorCornerRadius={2}
              rotateAnchorOffset={22}
              borderStroke={palette.accent}
              anchorStroke={palette.accent}
              anchorFill={palette.handleFill}
              visible={transformIds.length > 0}
              onTransformEnd={() => {
                const tr = transformerRef.current
                if (!tr) return
                const updates = new Map(
                  tr.nodes().map((n) => {
                    const u = { x: n.x(), y: n.y(), rotation: n.rotation(), sx: n.scaleX(), sy: n.scaleY() }
                    // Imagens guardam largura/altura em cm: a escala do nó volta a 1.
                    if (n.id().startsWith('img_')) n.scale({ x: 1, y: 1 })
                    return [n.id().replace(/^(blk|img)_/, ''), u] as const
                  })
                )
                useEditorStore.getState().commit((d) =>
                  mapObjects(d, [...updates.keys()], (o) => {
                    const u = updates.get(o.id)
                    if (u && o.type === 'image') {
                      return {
                        ...o,
                        position: { x: u.x, y: u.y },
                        rotation: ((u.rotation % 360) + 360) % 360,
                        width: Math.max(1, o.width * Math.abs(u.sx)),
                        height: Math.max(1, o.height * Math.abs(u.sy))
                      }
                    }
                    if (!u || o.type !== 'block') return o
                    return {
                      ...o,
                      position: { x: u.x, y: u.y },
                      rotation: ((u.rotation % 360) + 360) % 360,
                      scaleX: Math.max(0.01, Math.abs(u.sx)),
                      scaleY: Math.max(0.01, Math.abs(u.sy)),
                      flipX: u.sx < 0,
                      flipY: u.sy < 0
                    }
                  })
                )
              }}
            />

            {/* Seleção por área */}
            {marquee && (
              <Rect {...marquee} fill={palette.accentSoft} stroke={palette.accent} strokeWidth={1 * hair} dash={[4 * hair, 3 * hair]} listening={false} />
            )}
          </Layer>
        </Stage>
      )}

      <TextEditorOverlay />
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  )
}

// ----------------------------------------------------------- formas auxiliares

function AreaPreview({
  points,
  palette,
  hair,
  label,
  open
}: {
  points: Point[]
  palette: ReturnType<typeof useCanvasPalette>
  hair: number
  label?: string
  open?: boolean
}): React.JSX.Element {
  const c = polygonCentroid(points)
  const w = 200 * hair
  return (
    <>
      <Line
        points={points.flatMap((p) => [p.x, p.y])}
        closed
        fill={palette.accentSoft}
        stroke={palette.accent}
        strokeWidth={1.5 * hair}
        dash={open ? [5 * hair, 4 * hair] : undefined}
        listening={false}
      />
      {label && points.length >= 3 && (
        <Text x={c.x} y={c.y} width={w} offsetX={w / 2} offsetY={7 * hair} align="center" text={label} fontSize={13 * hair} fontStyle="600" fill={palette.accent} stroke={palette.textHalo} strokeWidth={3 * hair} fillAfterStrokeEnabled listening={false} />
      )}
    </>
  )
}

function MeasureShape({
  a,
  b,
  palette,
  scale,
  text
}: {
  a: Point
  b: Point
  palette: ReturnType<typeof useCanvasPalette>
  scale: number
  text: string
}): React.JSX.Element {
  const hair = 1 / scale
  const n = mul(normalize(perp(sub(b, a))), 6 * hair)
  const tick = (p: Point): number[] => [p.x - n.x, p.y - n.y, p.x + n.x, p.y + n.y]
  return (
    <>
      <Line points={[a.x, a.y, b.x, b.y]} stroke={palette.accent} strokeWidth={1.5 * hair} dash={[6 * hair, 4 * hair]} listening={false} />
      <Line points={tick(a)} stroke={palette.accent} strokeWidth={1.5 * hair} listening={false} />
      <Line points={tick(b)} stroke={palette.accent} strokeWidth={1.5 * hair} listening={false} />
      <LiveLabel a={a} b={b} text={text} offset={0} scale={scale} palette={palette} color={palette.accent} />
    </>
  )
}
