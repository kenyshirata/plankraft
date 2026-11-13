import { Group, Line, Text } from 'react-konva'
import type { Id, LengthUnit, RoomObject } from '@shared/model'
import { insetPolygon, polygonArea, polygonCentroid } from '@renderer/lib/geometry'
import { formatArea } from '@renderer/lib/format'
import type { CanvasPalette } from '@renderer/theme'
import { resolveMaterial } from '@shared/materials'
import { getTileCanvas, TILE_PX } from '@renderer/lib/textures'

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
      {part !== 'labels' && [...rooms].sort((a, b) => Number(b.zone === 'lot') - Number(a.zone === 'lot')).map((r) => {
        const isSel = selected.has(r.id)
        const isHover = !isSel && hoveredId === r.id
        const mat = resolveMaterial(r.material)
        const tile = mat ? getTileCanvas(mat.id) : null
        const k = mat?.tileCm ? mat.tileCm / TILE_PX : 1
        // Com acabamento o piso aparece quase opaco; sem ele, fica como tinta translúcida.
        const baseOpacity = r.zone === 'lot' ? 0.3 : r.zone === 'pool' ? 0.75 : mat ? 0.9 : 0.24
        const flat = r.points.flatMap((p) => [p.x, p.y])
        const setback = r.zone === 'lot' && r.setback ? insetPolygon(r.points, r.setback) : null
        return (
          <Group key={r.id}>
          <Line
            id={r.id}
            name="plan-object"
            points={r.points.flatMap((p) => [p.x, p.y])}
            closed
            fill={tile ? undefined : (mat?.color ?? r.color)}
            fillPatternImage={(tile ?? undefined) as unknown as HTMLImageElement | undefined}
            fillPatternScale={tile ? { x: k, y: k } : undefined}
            fillPatternRepeat="repeat"
            opacity={isSel ? Math.min(1, baseOpacity + 0.12) : isHover ? Math.min(1, baseOpacity + 0.06) : baseOpacity}
            stroke={isSel ? palette.accent : isHover ? palette.hover : undefined}
            strokeWidth={2 * hair}
            dash={isSel ? undefined : [6 * hair, 4 * hair]}
            perfectDrawEnabled={false}
          />
          {r.zone === 'lot' && (
            // Divisa do terreno: traço-ponto sempre visível (a opacidade do preenchimento não a apaga).
            <Line points={flat} closed stroke="#6b5d1f" strokeWidth={2 * hair} dash={[16 * hair, 5 * hair, 3 * hair, 5 * hair]} listening={false} perfectDrawEnabled={false} />
          )}
          {setback && (
            <Line
              points={setback.flatMap((p) => [p.x, p.y])}
              closed
              stroke="#e8590c"
              strokeWidth={1.5 * hair}
              dash={[8 * hair, 5 * hair]}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
          </Group>
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
