import { Ellipse, Group, Line, Rect, Shape, Text } from 'react-konva'
import type { BlockDef, BlockShape } from '@shared/blocks'
import type { BlockObject, Id } from '@shared/model'
import type { CanvasPalette } from '@renderer/theme'

const FONT = "'Segoe UI Variable Text', 'Segoe UI', Inter, system-ui, sans-serif"
const STROKE_PX = 1.1

interface Colors {
  fill: string
  ink: string
}

/** Formas de um símbolo em coordenadas locais. `px` = cm locais por px de tela (para tracejados). */
export function BlockPrimitives({ def, colors, px, listening = false }: { def: BlockDef; colors: Colors; px: number; listening?: boolean }): React.JSX.Element {
  return (
    <>
      {def.shapes.map((s, i) => (
        <Primitive key={i} s={s} colors={colors} px={px} listening={listening} />
      ))}
    </>
  )
}

function Primitive({ s, colors, px, listening }: { s: BlockShape; colors: Colors; px: number; listening: boolean }): React.JSX.Element {
  const fill = s.fill === 'fill' ? colors.fill : s.fill === 'ink' ? colors.ink : undefined
  const weight = s.weight ?? 1
  const common = {
    fill,
    stroke: weight > 0 ? colors.ink : undefined,
    strokeWidth: STROKE_PX * weight,
    // Traço com espessura constante na tela (como em CAD), independente de zoom/escala do bloco.
    strokeScaleEnabled: false,
    dash: s.dash ? [5 * px, 3.5 * px] : undefined,
    listening,
    perfectDrawEnabled: false
  }
  switch (s.kind) {
    case 'rect':
      return <Rect {...common} x={s.x} y={s.y} width={s.w} height={s.h} cornerRadius={s.r} />
    case 'ellipse':
      return <Ellipse {...common} x={s.cx} y={s.cy} radiusX={s.rx} radiusY={s.ry} rotation={s.rotation ?? 0} />
    case 'poly':
      return <Line {...common} points={s.points} closed={!!s.closed} fill={s.closed ? fill : undefined} />
    case 'arc':
      return (
        <Shape
          {...common}
          fill={undefined}
          sceneFunc={(ctx, shape) => {
            ctx.beginPath()
            ctx.arc(s.cx, s.cy, s.r, (s.start * Math.PI) / 180, (s.end * Math.PI) / 180, s.end < s.start)
            ctx.strokeShape(shape)
          }}
        />
      )
    case 'text': {
      const w = Math.max(s.text.length * s.size * 0.7, s.size)
      return (
        <Text
          x={s.x}
          y={s.y}
          width={s.align === 'center' ? w : undefined}
          offsetX={s.align === 'center' ? w / 2 : 0}
          align={s.align === 'center' ? 'center' : 'left'}
          rotation={s.rotation ?? 0}
          text={s.text}
          fontSize={s.size}
          fontFamily={FONT}
          fontStyle="600"
          fill={colors.ink}
          listening={listening}
          perfectDrawEnabled={false}
        />
      )
    }
  }
}

interface BlockShapesProps {
  blocks: BlockObject[]
  resolve(id: string): BlockDef | undefined
  palette: CanvasPalette
  scale: number
  hoveredId: Id | null
  selected: Set<Id>
  tint: string | null
}

/** Nome do nó Konva do grupo de uma instância (usado pelo Transformer). */
export const blockNodeId = (id: Id): string => `blk_${id}`

/** Instâncias de blocos. Cada uma é um Group transformado + um retângulo invisível de clique. */
export function BlockShapes({ blocks, resolve, palette, scale, hoveredId, selected, tint }: BlockShapesProps): React.JSX.Element {
  return (
    <>
      {blocks.map((b) => {
        const def = resolve(b.blockId)
        if (!def) return <MissingBlock key={b.id} b={b} palette={palette} scale={scale} />
        const colors = { fill: b.fill ?? palette.blockFill, ink: b.stroke ?? tint ?? palette.blockStroke }
        const px = 1 / (scale * Math.max(0.01, Math.min(b.scaleX, b.scaleY)))
        return (
          <Group
            key={b.id}
            id={blockNodeId(b.id)}
            x={b.position.x}
            y={b.position.y}
            rotation={b.rotation}
            scaleX={b.scaleX * (b.flipX ? -1 : 1)}
            scaleY={b.scaleY * (b.flipY ? -1 : 1)}
            offsetX={def.width / 2}
            offsetY={def.height / 2}
          >
            <BlockPrimitives def={def} colors={colors} px={px} />
            {/* Alvo de clique cobrindo a caixa do símbolo */}
            <Rect
              id={b.id}
              name="plan-object"
              width={def.width}
              height={def.height}
              fill="transparent"
              stroke={hoveredId === b.id && !selected.has(b.id) ? palette.hover : undefined}
              strokeWidth={1}
              strokeScaleEnabled={false}
              dash={[4 * px, 3 * px]}
              perfectDrawEnabled={false}
            />
          </Group>
        )
      })}
    </>
  )
}

/** Bloco cuja definição não foi encontrada (ex.: biblioteca de outro computador sem cópia no projeto). */
function MissingBlock({ b, palette, scale }: { b: BlockObject; palette: CanvasPalette; scale: number }): React.JSX.Element {
  const s = 40
  return (
    <Group x={b.position.x} y={b.position.y} rotation={b.rotation}>
      <Rect id={b.id} name="plan-object" x={-s} y={-s} width={2 * s} height={2 * s} stroke={palette.dimension} strokeWidth={1.5 / scale} dash={[6 / scale, 4 / scale]} fill="transparent" />
      <Text x={-s} y={-6 / scale} width={2 * s} align="center" text="?" fontSize={14 / scale} fill={palette.dimension} listening={false} />
    </Group>
  )
}
