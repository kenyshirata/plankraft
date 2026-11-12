import { Group, Line, Shape } from 'react-konva'
import type { Id, OpeningObject, WallObject } from '@shared/model'
import { add, mul } from '@renderer/lib/geometry'
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
  opening: Pick<OpeningObject, 'type'> & Partial<Pick<OpeningObject, 'id'>> & { side?: 1 | -1; hinge?: 'start' | 'end' }
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
      {opening.type === 'window' ? (
        <WindowSymbol g={g} ink={ink} lw={lw} />
      ) : (
        <DoorSymbol g={g} ink={ink} lw={lw} side={opening.side ?? 1} hinge={opening.hinge ?? 'start'} />
      )}
    </Group>
  )
}

function WindowSymbol({ g, ink, lw }: { g: OpeningGeometry; ink: string; lw: number }): React.JSX.Element {
  // Caixilho (contorno no plano da parede) + duas linhas de vidro próximas ao eixo.
  const glass = mul(g.normal, Math.min(g.thickness / 6, 3))
  const line = (o: { x: number; y: number }): number[] => {
    const s = add(g.start, o)
    const e = add(g.end, o)
    return [s.x, s.y, e.x, e.y]
  }
  return (
    <>
      <Line points={openingRectPoints(g)} closed stroke={ink} strokeWidth={lw} listening={false} />
      <Line points={line(glass)} stroke={ink} strokeWidth={lw} listening={false} />
      <Line points={line(mul(glass, -1))} stroke={ink} strokeWidth={lw} listening={false} />
    </>
  )
}

function DoorSymbol({
  g,
  ink,
  lw,
  side,
  hinge
}: {
  g: OpeningGeometry
  ink: string
  lw: number
  side: 1 | -1
  hinge: 'start' | 'end'
}): React.JSX.Element {
  // A folha parte da face da parede do lado de abertura.
  const face = mul(g.normal, (side * g.thickness) / 2)
  const hingePt = add(hinge === 'start' ? g.start : g.end, face)
  const freePt = add(hinge === 'start' ? g.end : g.start, face)
  const leafEnd = add(hingePt, mul(g.normal, side * g.width))
  return (
    <>
      <Line points={[hingePt.x, hingePt.y, leafEnd.x, leafEnd.y]} stroke={ink} strokeWidth={lw * 1.4} listening={false} />
      <Shape
        listening={false}
        stroke={ink}
        strokeWidth={lw}
        dash={[lw * 4, lw * 3]}
        sceneFunc={(ctx, shape) => {
          // Arco de 90° do fim da folha até o batente livre.
          const a0 = Math.atan2(leafEnd.y - hingePt.y, leafEnd.x - hingePt.x)
          const a1 = Math.atan2(freePt.y - hingePt.y, freePt.x - hingePt.x)
          let delta = a1 - a0
          while (delta > Math.PI) delta -= 2 * Math.PI
          while (delta < -Math.PI) delta += 2 * Math.PI
          ctx.beginPath()
          ctx.arc(hingePt.x, hingePt.y, g.width, a0, a0 + delta, delta < 0)
          ctx.strokeShape(shape)
        }}
      />
    </>
  )
}
