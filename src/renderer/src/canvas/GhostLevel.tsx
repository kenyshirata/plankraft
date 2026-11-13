import { useMemo } from 'react'
import { Group } from 'react-konva'
import type { BlockObject, DoorObject, Id, OpeningObject, PlanDocument, RoomObject, WallObject } from '@shared/model'
import { isOpening } from '@shared/model'
import type { BlockDef } from '@shared/blocks'
import type { CanvasPalette } from '@renderer/theme'
import { RoomShapes } from './RoomShapes'
import { WallShapes } from './WallShapes'
import { OpeningShapes } from './OpeningShapes'
import { BlockShapes } from './BlockShapes'
import { computeWallGeometry } from './wallGeometry'

interface GhostLevelProps {
  doc: PlanDocument
  /** Andar a mostrar esmaecido (o de baixo do andar ativo). */
  levelId: Id
  palette: CanvasPalette
  scale: number
  resolve(id: string): BlockDef | undefined
}

const NONE = new Set<Id>()

/** Calco do andar inferior: só leitura, sem seleção, bem esmaecido. */
export function GhostLevel({ doc, levelId, palette, scale, resolve }: GhostLevelProps): React.JSX.Element {
  const { rooms, walls, openings, blocks } = useMemo(() => {
    const ids = new Set(doc.layers.filter((l) => l.levelId === levelId && l.visible).map((l) => l.id))
    const objs = doc.objects.filter((o) => ids.has(o.layerId))
    return {
      rooms: objs.filter((o): o is RoomObject => o.type === 'room'),
      walls: objs.filter((o): o is WallObject => o.type === 'wall'),
      openings: objs.filter((o): o is OpeningObject => isOpening(o)),
      blocks: objs.filter((o): o is BlockObject => o.type === 'block')
    }
  }, [doc.layers, doc.objects, levelId])
  const geometry = useMemo(() => computeWallGeometry(walls), [walls])
  const wallsById = useMemo(() => new Map(walls.map((w) => [w.id, w])), [walls])
  const common = { palette, scale, selected: NONE, hoveredId: null }
  return (
    <Group opacity={0.28} listening={false}>
      <RoomShapes {...common} part="fill" rooms={rooms} unit="m" precision={2} />
      <BlockShapes {...common} blocks={blocks} resolve={resolve} tint={null} />
      <WallShapes {...common} walls={walls} geometry={geometry} tint={null} />
      <OpeningShapes {...common} openings={openings as (OpeningObject | DoorObject)[]} wallsById={wallsById} tint={null} />
    </Group>
  )
}
