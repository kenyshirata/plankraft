import { Shape } from 'react-konva'
import type { Viewport } from '@renderer/store/editorStore'
import type { CanvasPalette } from '@renderer/theme'

interface GridProps {
  viewport: Viewport
  width: number
  height: number
  /** Passo da malha fina em cm. */
  step: number
  palette: CanvasPalette
}

const MIN_MINOR_PX = 7
const MIN_MAJOR_PX = 28

/**
 * Malha desenhada num único Shape (sceneFunc) — muito mais barato que centenas
 * de nós Line. Desenha só a área visível e adapta a densidade ao zoom.
 */
export function Grid({ viewport, width, height, step, palette }: GridProps): React.JSX.Element {
  return (
    <Shape
      listening={false}
      perfectDrawEnabled={false}
      sceneFunc={(ctx) => {
        const s = viewport.scale
        const x0 = -viewport.x / s
        const y0 = -viewport.y / s
        const x1 = x0 + width / s
        const y1 = y0 + height / s

        const drawLines = (spacing: number, color: string): void => {
          ctx.beginPath()
          for (let x = Math.floor(x0 / spacing) * spacing; x <= x1; x += spacing) {
            ctx.moveTo(x, y0)
            ctx.lineTo(x, y1)
          }
          for (let y = Math.floor(y0 / spacing) * spacing; y <= y1; y += spacing) {
            ctx.moveTo(x0, y)
            ctx.lineTo(x1, y)
          }
          ctx.setAttr('strokeStyle', color)
          ctx.setAttr('lineWidth', 1 / s)
          ctx.stroke()
        }

        // Densidade adaptativa: multiplica por 10 até ficar legível.
        let minor = step
        while (minor * s < MIN_MINOR_PX) minor *= 10
        let major = Math.max(100, minor) // 1 m
        while (major * s < MIN_MAJOR_PX) major *= 10

        if (minor < major) drawLines(minor, palette.gridMinor)
        drawLines(major, palette.gridMajor)

        // Eixos na origem (0,0).
        ctx.beginPath()
        ctx.moveTo(0, y0)
        ctx.lineTo(0, y1)
        ctx.moveTo(x0, 0)
        ctx.lineTo(x1, 0)
        ctx.setAttr('strokeStyle', palette.gridAxis)
        ctx.setAttr('lineWidth', 1 / s)
        ctx.stroke()
      }}
    />
  )
}
