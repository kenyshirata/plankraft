import { Group, Line, Shape } from 'react-konva'
import type { DoorVariant, Id, OpeningObject, WallObject, WindowVariant } from '@shared/model'
import { mul } from '@renderer/lib/geometry'
import { openingPrims, type SymbolPrim } from '@renderer/lib/openingSymbols'
import { openingGeometry, openingRectPoints, type OpeningGeometry } from '@renderer/lib/openings'
import type { CanvasPalette } from '@renderer/theme'

interface OpeningShapesProps {
  openings: OpeningObject[]
  wallsById: Map<Id, WallObject>
  palette: CanvasPalette
  scale: number
  selected: Set<Id>
  hoveredId: Id | null
  tint: string | null
}

/**
 * Portas e janelas. Cada abertura:
 *  1. "recorta" a parede com um retângulo na cor do fundo (é também o alvo de clique);
 *  2. desenha os batentes e o símbolo (folha + arco da porta / caixilho da janela).
 */
export function OpeningShapes({ openings, wallsById, palette, scale, selected, hoveredId, tint }: OpeningShapesProps): React.JSX.Element {
  return (
    <>
      {openings.map((o) => {
        const wall = wallsById.get(o.wallId)
        if (!wall) return null
        const g = openingGeometry(o, wall)
        const state = selected.has(o.id) ? 'selected' : hoveredId === o.id ? 'hover' : 'normal'
        return (
          <OpeningSymbol key={o.id} opening={o} g={g} palette={palette} scale={scale} state={state} tint={tint} />
        )
      })}
    </>
  )
}

interface SymbolProps {
  opening: Pick<OpeningObject, 'type'> & Partial<Pick<OpeningObject, 'id'>> & { side?: 1 | -1; hinge?: 'start' | 'end'; variant?: DoorVariant | WindowVariant }
  g: OpeningGeometry
  palette: CanvasPalette
  scale: number
  state: 'normal' | 'hover' | 'selected' | 'preview'
  tint: string | null
}

/** Símbolo de uma abertura — usado também na pré-visualização da ferramenta. */
export function OpeningSymbol({ opening, g, palette, scale, state, tint }: SymbolProps): React.JSX.Element {
  const hair = 1 / scale
  const ink =
    state === 'selected' || state === 'preview' ? palette.accent : state === 'hover' ? palette.hover : (tint ?? palette.text)
  const lw = (state === 'selected' ? 2 : 1.25) * hair
  const half = mul(g.normal, g.thickness / 2)

  return (
    <Group opacity={state === 'preview' ? 0.85 : 1}>
      {/* Recorte da parede + alvo de clique */}
      <Line
        id={opening.id}
        name={opening.id ? 'plan-object' : undefined}
        points={openingRectPoints(g, 3.5 * hair)}
        closed
        fill={palette.background}
        listening={!!opening.id}
        perfectDrawEnabled={false}
      />
      {/* Batentes */}
      {[g.start, g.end].map((p, i) => (
        <Line
          key={i}
          points={[p.x + half.x, p.y + half.y, p.x - half.x, p.y - half.y]}
          stroke={palette.wallOutline}
          strokeWidth={1.5 * hair}
          listening={false}
        />
      ))}
      <Prims prims={openingPrims({ type: opening.type, variant: opening.variant, side: opening.side, hinge: opening.hinge }, g)} ink={ink} lw={lw} />
    </Group>
  )
}

function Prims({ prims, ink, lw }: { prims: SymbolPrim[]; ink: string; lw: number }): React.JSX.Element {
  return (
    <>
      {prims.map((pr, i) => {
        if (pr.kind === 'line') {
          const w = pr.weight === 'heavy' ? lw * 1.4 : pr.weight === 'thin' ? lw * 0.7 : lw
          return (
            <Line
              key={i}
              points={pr.pts.flatMap((p) => [p.x, p.y])}
              closed={pr.closed}
              stroke={ink}
              strokeWidth={w}
              dash={pr.dash ? [lw * 3, lw * 2.5] : undefined}
              listening={false}
            />
          )
        }
        return (
          <Shape
            key={i}
            listening={false}
            stroke={ink}
            strokeWidth={lw}
            dash={pr.dash ? [lw * 4, lw * 3] : undefined}
            sceneFunc={(ctx, shape) => {
              ctx.beginPath()
              ctx.arc(pr.center.x, pr.center.y, pr.r, pr.from, pr.from + pr.delta, pr.delta < 0)
              ctx.strokeShape(shape)
            }}
          />
        )
      })}
    </>
  )
}
