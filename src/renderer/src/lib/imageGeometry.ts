import type { ImageObject, Point } from '@shared/model'

/** Cantos da imagem (girada) em cm. */
export function imageCorners(o: Pick<ImageObject, 'position' | 'width' | 'height' | 'rotation'>): Point[] {
  const t = (o.rotation * Math.PI) / 180
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  const hw = o.width / 2
  const hh = o.height / 2
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh]
  ].map(([x, y]) => ({ x: o.position.x + x * cos - y * sin, y: o.position.y + x * sin + y * cos }))
}

/** Escala da imagem: quantos cm do desenho cada pixel representa. */
export const cmPerPixel = (o: Pick<ImageObject, 'width' | 'pixelWidth'>): number => o.width / o.pixelWidth

/**
 * Reescala a imagem por `factor` mantendo o ponto `anchor` (cm) fixo no desenho —
 * usado pela ferramenta "Definir escala" (o 1º ponto clicado não sai do lugar).
 */
export function scaleImageAround<T extends Pick<ImageObject, 'position' | 'width' | 'height'>>(o: T, factor: number, anchor: Point): T {
  return {
    ...o,
    width: o.width * factor,
    height: o.height * factor,
    position: { x: anchor.x + (o.position.x - anchor.x) * factor, y: anchor.y + (o.position.y - anchor.y) * factor }
  }
}
