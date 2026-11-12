import { Text } from 'react-konva'
import type { Id, TextObject } from '@shared/model'
import type { CanvasPalette } from '@renderer/theme'

interface TextShapesProps {
  texts: TextObject[]
  palette: CanvasPalette
  scale: number
  selected: Set<Id>
  hoveredId: Id | null
  /** Texto em edição (fica oculto enquanto o editor HTML está aberto). */
  editingId: Id | null
  tint: string | null
}

export const TEXT_FONT = "'Segoe UI Variable Text', 'Segoe UI', Inter, system-ui, sans-serif"
export const TEXT_LINE_HEIGHT = 1.2

/** Textos livres. O tamanho é em cm (escala com o desenho, como em CAD). */
export function TextShapes({ texts, palette, scale, selected, hoveredId, editingId, tint }: TextShapesProps): React.JSX.Element {
  const hair = 1 / scale
  return (
    <>
      {texts.map((t) => {
        const isSel = selected.has(t.id)
        const isHover = !isSel && hoveredId === t.id
        return (
          <Text
            key={t.id}
            id={t.id}
            name="plan-object"
            x={t.position.x}
            y={t.position.y}
            rotation={t.rotation}
            text={t.text || ' '}
            fontSize={t.fontSize}
            lineHeight={TEXT_LINE_HEIGHT}
            fontFamily={TEXT_FONT}
            fill={t.color ?? tint ?? palette.text}
            visible={editingId !== t.id}
            // Contorno de seleção/hover desenhado como sombra colorida.
            shadowColor={isSel ? palette.accent : isHover ? palette.hover : undefined}
            shadowBlur={isSel || isHover ? 6 * hair : 0}
            shadowOpacity={isSel || isHover ? 1 : 0}
            hitStrokeWidth={8 * hair}
            perfectDrawEnabled={false}
          />
        )
      })}
    </>
  )
}
