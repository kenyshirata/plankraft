import { Group, Line, Text } from 'react-konva'
import type { Id, LengthUnit, RoomObject } from '@shared/model'
import { polygonArea, polygonCentroid } from '@renderer/lib/geometry'
import { formatArea } from '@renderer/lib/format'
import type { CanvasPalette } from '@renderer/theme'

interface RoomShapesProps {
  rooms: RoomObject[]
  palette: CanvasPalette
  scale: number
  selected: Set<Id>
  hoveredId: Id | null
  unit: LengthUnit
  precision: number
  /** 'fill' = só os polígonos; 'labels' = só nome/área (desenhados por cima dos móveis). */
  part?: 'fill' | 'labels' | 'all'
}

const FONT = "'Segoe UI Variable Text', 'Segoe UI', Inter, system-ui, sans-serif"

/**
 * Cômodos: polígono preenchido (alvo de clique) + rótulo com nome e área no
 * centroide. O rótulo tem tamanho constante na tela para ficar legível em
 * qualquer zoom (no PDF ele terá tamanho próprio em pontos).
 */
export function RoomShapes({ rooms, palette, scale, selected, hoveredId, unit, precision, part = 'all' }: RoomShapesProps): React.JSX.Element {
  const hair = 1 / scale
  return (
    <>
      {part !== 'labels' && rooms.map((r) => {
        const isSel = selected.has(r.id)
        const isHover = !isSel && hoveredId === r.id
        return (
          <Line
            key={r.id}
            id={r.id}
            name="plan-object"
            points={r.points.flatMap((p) => [p.x, p.y])}
            closed
            fill={r.color}
            opacity={isSel ? 0.42 : isHover ? 0.34 : 0.24}
            stroke={isSel ? palette.accent : isHover ? palette.hover : undefined}
            strokeWidth={2 * hair}
            dash={isSel ? undefined : [6 * hair, 4 * hair]}
            perfectDrawEnabled={false}
          />
        )
      })}
      {part !== 'fill' && rooms.map((r) => {
        const c = polygonCentroid(r.points)
        const w = 220 * hair
        return (
          <Group key={`label-${r.id}`} x={c.x} y={c.y} listening={false}>
            <Text
              text={r.name}
              width={w}
              offsetX={w / 2}
              offsetY={16 * hair}
              align="center"
              fontSize={13 * hair}
              fontStyle="600"
              fontFamily={FONT}
              fill={palette.text}
              stroke={palette.textHalo}
              strokeWidth={3 * hair}
              fillAfterStrokeEnabled
              perfectDrawEnabled={false}
            />
            <Text
              text={formatArea(polygonArea(r.points), unit, precision)}
              width={w}
              offsetX={w / 2}
              offsetY={-1 * hair}
              align="center"
              fontSize={12 * hair}
              fontFamily={FONT}
              fill={palette.text}
              opacity={0.75}
              stroke={palette.textHalo}
              strokeWidth={3 * hair}
              fillAfterStrokeEnabled
              perfectDrawEnabled={false}
            />
          </Group>
        )
      })}
    </>
  )
}
