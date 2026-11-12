import { Line } from 'react-konva'
import type { Id, WallObject } from '@shared/model'
import type { CanvasPalette } from '@renderer/theme'
import { extendedPoints, type WallRenderGeometry } from './wallGeometry'

interface WallShapesProps {
  walls: WallObject[]
  geometry: Map<Id, WallRenderGeometry>
  palette: CanvasPalette
  /** px por cm — usado para manter traços finos com espessura constante na tela. */
  scale: number
  selected: Set<Id>
  hoveredId: Id | null
  /** Cor de destaque da camada (tint), se houver. */
  tint: string | null
}

/**
 * Desenha paredes em duas passadas:
 *  1. Contorno (linha um pouco mais larga, cor de contorno / seleção).
 *  2. Preenchimento por cima — cobre os contornos internos nos encontros,
 *     fazendo cantos e "T" parecerem uma peça única.
 * O nó de preenchimento é o alvo de clique (name="plan-object", id = id da parede).
 */
export function WallShapes({ walls, geometry, palette, scale, selected, hoveredId, tint }: WallShapesProps): React.JSX.Element {
  const hair = 1 / scale // 1 px de tela em cm

  return (
    <>
      {walls.map((w) => {
        const g = geometry.get(w.id)
        if (!g) return null
        const isSelected = selected.has(w.id)
        const isHovered = !isSelected && hoveredId === w.id
        const border = isSelected ? 3 : isHovered ? 2.5 : 1.25
        return (
          <Line
            key={`outline-${w.id}`}
            points={extendedPoints(g, border * hair)}
            stroke={isSelected ? palette.accent : isHovered ? palette.hover : palette.wallOutline}
            strokeWidth={w.thickness + 2 * border * hair}
            lineCap="butt"
            listening={false}
            perfectDrawEnabled={false}
          />
        )
      })}
      {walls.map((w) => {
        const g = geometry.get(w.id)
        if (!g) return null
        return (
          <Line
            key={`fill-${w.id}`}
            id={w.id}
            name="plan-object"
            points={[g.a.x, g.a.y, g.b.x, g.b.y]}
            stroke={tint ?? palette.wallFill}
            strokeWidth={w.thickness}
            hitStrokeWidth={Math.max(w.thickness, 12 * hair)}
            lineCap="butt"
            perfectDrawEnabled={false}
          />
        )
      })}
    </>
  )
}
