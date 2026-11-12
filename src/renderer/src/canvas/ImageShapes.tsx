import { Group, Image as KonvaImage, Rect, Text } from 'react-konva'
import type { Id, ImageObject } from '@shared/model'
import { useAssetImage } from '@renderer/store/assetStore'
import type { CanvasPalette } from '@renderer/theme'

/** Id do nó Konva de uma imagem (usado pelo Transformer). */
export const imageNodeId = (id: Id): string => `img_${id}`

interface ImageShapesProps {
  images: ImageObject[]
  palette: CanvasPalette
  scale: number
  hoveredId: Id | null
  selected: Set<Id>
}

/** Imagens de fundo, abaixo do desenho. Imagens bloqueadas não recebem clique. */
export function ImageShapes({ images, palette, scale, hoveredId, selected }: ImageShapesProps): React.JSX.Element {
  return (
    <>
      {images
        .filter((o) => !o.hidden)
        .map((o) => (
          <BackgroundImage key={o.id} o={o} palette={palette} scale={scale} hovered={hoveredId === o.id && !selected.has(o.id)} />
        ))}
    </>
  )
}

function BackgroundImage({ o, palette, scale, hovered }: { o: ImageObject; palette: CanvasPalette; scale: number; hovered: boolean }): React.JSX.Element {
  const { image, missing } = useAssetImage(o.asset)
  const hair = 1 / scale
  return (
    <Group
      id={imageNodeId(o.id)}
      x={o.position.x}
      y={o.position.y}
      rotation={o.rotation}
      offsetX={o.width / 2}
      offsetY={o.height / 2}
      listening={!o.locked}
    >
      {image ? (
        <KonvaImage image={image} width={o.width} height={o.height} opacity={o.opacity} listening={false} />
      ) : (
        <>
          <Rect width={o.width} height={o.height} stroke={palette.dimension} strokeWidth={1.5 * hair} dash={[8 * hair, 6 * hair]} listening={false} />
          <Text
            width={o.width}
            y={o.height / 2 - 10 * hair}
            align="center"
            text={missing ? `Imagem não encontrada: ${o.name}` : 'Carregando imagem…'}
            fontSize={13 * hair}
            fill={palette.dimension}
            listening={false}
          />
        </>
      )}
      {/* Alvo de clique + contorno de hover */}
      <Rect
        id={o.id}
        name="plan-object"
        width={o.width}
        height={o.height}
        fill="transparent"
        stroke={hovered ? palette.hover : undefined}
        strokeWidth={1.5 * hair}
        dash={[6 * hair, 4 * hair]}
      />
    </Group>
  )
}
