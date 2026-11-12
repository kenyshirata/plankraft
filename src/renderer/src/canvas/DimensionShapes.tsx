import { Group, Line, Shape, Text } from 'react-konva'
import type { Id, LengthUnit } from '@shared/model'
import { add, angleDeg, midpoint, mul, normalize, readableAngle } from '@renderer/lib/geometry'
import { formatLength } from '@renderer/lib/format'
import type { CornerAngle, DimensionLayout } from '@renderer/lib/dimensions'
import type { CanvasPalette } from '@renderer/theme'

const FONT = "'Segoe UI Variable Text', 'Segoe UI', Inter, system-ui, sans-serif"
const FONT_PX = 11
const TICK_PX = 5
const OVERSHOOT_PX = 4

interface DimensionShapesProps {
  layouts: DimensionLayout[]
  palette: CanvasPalette
  scale: number
  selected: Set<Id>
  hoveredId: Id | null
  unit: LengthUnit
  precision: number
  /** Cor da camada (tint), se houver. */
  tint: string | null
  /** Pré-visualização (não interativa). */
  preview?: boolean
}

/**
 * Desenho vetorial das cotas: linhas de chamada, linha de cota estendida,
 * marcas oblíquas (padrão arquitetônico) e texto paralelo sempre legível.
 * Tudo em Line/Text do Konva → mantém qualidade vetorial e servirá de
 * referência para a exportação PDF.
 */
export function DimensionShapes({ layouts, palette, scale, selected, hoveredId, unit, precision, tint, preview }: DimensionShapesProps): React.JSX.Element {
  const hair = 1 / scale
  return (
    <>
      {layouts.map((d) => {
        const color = preview || selected.has(d.id) ? palette.accent : hoveredId === d.id ? palette.hover : (tint ?? palette.dimension)
        const lw = (selected.has(d.id) ? 1.6 : 1) * hair
        const q1 = add(d.p1, mul(d.n, d.dist))
        const q2 = add(d.p2, mul(d.n, d.dist))
        const over = mul(d.dir, OVERSHOOT_PX * hair)
        const hasExtension = d.dist - d.gap > hair
        // Marca oblíqua a 45° entre a direção da cota e a normal.
        const slash = mul(normalize(add(d.dir, d.n)), TICK_PX * hair)
        const tick = (q: { x: number; y: number }): number[] => [q.x - slash.x, q.y - slash.y, q.x + slash.x, q.y + slash.y]
        const label = formatLength(d.length, unit, precision)
        const width = 200 * hair
        const height = FONT_PX * 1.4 * hair
        // Texto acima da linha (lado oposto à parede); no estilo linear, centrado sobre a linha.
        const textPos = add(midpoint(q1, q2), mul(d.n, d.dist === 0 ? 0 : height / 2 + 1.5 * hair))
        const listening = !preview
        return (
          <Group key={d.id}>
            {hasExtension &&
              [
                [d.p1, q1],
                [d.p2, q2]
              ].map(([p, q], i) => {
                const s = add(p, mul(d.n, d.gap))
                const e = add(q, mul(d.n, OVERSHOOT_PX * hair))
                return <Line key={i} points={[s.x, s.y, e.x, e.y]} stroke={color} strokeWidth={lw * 0.8} opacity={0.75} listening={false} perfectDrawEnabled={false} />
              })}
            <Line
              id={listening ? d.id : undefined}
              name={listening ? 'plan-object' : undefined}
              points={[q1.x - over.x, q1.y - over.y, q2.x + over.x, q2.y + over.y]}
              stroke={color}
              strokeWidth={lw}
              hitStrokeWidth={10 * hair}
              listening={listening}
              perfectDrawEnabled={false}
            />
            <Line points={tick(q1)} stroke={color} strokeWidth={lw * 1.6} listening={false} perfectDrawEnabled={false} />
            <Line points={tick(q2)} stroke={color} strokeWidth={lw * 1.6} listening={false} perfectDrawEnabled={false} />
            <Text
              id={listening ? d.id : undefined}
              name={listening ? 'plan-object' : undefined}
              x={textPos.x}
              y={textPos.y}
              width={width}
              height={height}
              offsetX={width / 2}
              offsetY={height / 2}
              rotation={readableAngle(angleDeg(d.p1, d.p2))}
              text={label}
              align="center"
              verticalAlign="middle"
              fontSize={FONT_PX * hair}
              fontStyle="600"
              fontFamily={FONT}
              fill={color}
              stroke={palette.textHalo}
              strokeWidth={3 * hair}
              fillAfterStrokeEnabled
              listening={listening}
              perfectDrawEnabled={false}
            />
          </Group>
        )
      })}
    </>
  )
}

/** Arcos e rótulos de ângulo nos cantos entre paredes. */
export function CornerAngleShapes({ angles, palette, scale }: { angles: CornerAngle[]; palette: CanvasPalette; scale: number }): React.JSX.Element {
  const hair = 1 / scale
  const r = 16 * hair
  return (
    <>
      {angles.map((c, i) => {
        const a0 = Math.atan2(c.d1.y, c.d1.x)
        const a1 = Math.atan2(c.d2.y, c.d2.x)
        let delta = a1 - a0
        while (delta > Math.PI) delta -= 2 * Math.PI
        while (delta < -Math.PI) delta += 2 * Math.PI
        const bis = normalize(add(c.d1, c.d2))
        const label = add(c.at, mul(bis, r + 13 * hair))
        const w = 48 * hair
        return (
          <Group key={i} listening={false}>
            <Shape
              stroke={palette.dimension}
              strokeWidth={1 * hair}
              opacity={0.85}
              sceneFunc={(ctx, shape) => {
                ctx.beginPath()
                ctx.arc(c.at.x, c.at.y, r, a0, a0 + delta, delta < 0)
                ctx.strokeShape(shape)
              }}
            />
            <Text
              x={label.x}
              y={label.y}
              width={w}
              offsetX={w / 2}
              offsetY={5.5 * hair}
              align="center"
              text={`${Math.round(c.degrees * 10) / 10}°`.replace('.', ',')}
              fontSize={10.5 * hair}
              fontFamily={FONT}
              fontStyle="600"
              fill={palette.dimension}
              stroke={palette.textHalo}
              strokeWidth={3 * hair}
              fillAfterStrokeEnabled
            />
          </Group>
        )
      })}
    </>
  )
}
