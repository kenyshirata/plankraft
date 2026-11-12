import { Text } from 'react-konva'
import type { Point } from '@shared/model'
import { add, angleDeg, midpoint, mul, normalize, perp, readableAngle, sub } from '@renderer/lib/geometry'
import type { CanvasPalette } from '@renderer/theme'

interface LiveLabelProps {
  a: Point
  b: Point
  text: string
  /** Distância (cm) do eixo do segmento até o texto, além do respiro fixo em px. */
  offset: number
  scale: number
  palette: CanvasPalette
  color?: string
}

const FONT_PX = 12
const GAP_PX = 12

/**
 * Rótulo de medida paralelo a um segmento, sempre legível (nunca de cabeça
 * para baixo) e posicionado do lado de "cima"/"esquerda" na tela.
 * Base para as cotas automáticas da próxima etapa.
 */
export function LiveLabel({ a, b, text, offset, scale, palette, color }: LiveLabelProps): React.JSX.Element {
  const hair = 1 / scale
  let n = normalize(perp(sub(b, a)))
  // Normal apontando para cima (y<0) ou, em segmentos verticais, para a esquerda.
  if (n.y > 0 || (Math.abs(n.y) < 1e-9 && n.x > 0)) n = mul(n, -1)
  const pos = add(midpoint(a, b), mul(n, offset + GAP_PX * hair))
  const width = 260 * hair
  const height = 18 * hair

  return (
    <Text
      x={pos.x}
      y={pos.y}
      width={width}
      height={height}
      offsetX={width / 2}
      offsetY={height / 2}
      rotation={readableAngle(angleDeg(a, b))}
      text={text}
      align="center"
      verticalAlign="middle"
      fontSize={FONT_PX * hair}
      fontStyle="600"
      fontFamily="'Segoe UI Variable Text', 'Segoe UI', Inter, system-ui, sans-serif"
      fill={color ?? palette.text}
      stroke={palette.textHalo}
      strokeWidth={4 * hair}
      fillAfterStrokeEnabled
      listening={false}
      perfectDrawEnabled={false}
    />
  )
}
