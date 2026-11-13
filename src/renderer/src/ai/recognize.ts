/**
 * Reconhecimento de planta: prepara a imagem para a IA e converte a leitura
 * (pixels) em objetos do desenho, alinhados à imagem de fundo.
 */
import type { AiRecognitionT } from '@shared/aiRecognize'
import { metersPerPxFromScale, recognitionToVariant, type RecognizedPlan } from '@shared/aiRecognize'
import type { RecognizeImage } from '@shared/ipc'
import type { Id, ImageObject, PlanDocument, Point } from '@shared/model'
import { buildPlanFromVariant, type BuiltPlan } from './planFromAi'

/** Maior lado enviado à IA (px): acima disso só aumenta custo, sem ler melhor. */
const MAX_SIDE = 1568

export interface PreparedImage {
  payload: RecognizeImage
  /** Pixels enviados ÷ pixels originais. */
  factor: number
  /** Cópia reduzida (para a prévia de revisão). */
  canvas: HTMLCanvasElement
}

export function prepareImage(el: HTMLImageElement): PreparedImage {
  const nw = el.naturalWidth
  const nh = el.naturalHeight
  const factor = Math.min(1, MAX_SIDE / Math.max(nw, nh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(nw * factor))
  canvas.height = Math.max(1, Math.round(nh * factor))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a imagem.')
  // Fundo branco: PNGs com transparência ficariam pretos em JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
  const data = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
  return { payload: { mediaType: 'image/jpeg', data, width: canvas.width, height: canvas.height }, factor, canvas }
}

export interface ScaleChoice {
  /** 'image' = a escala atual da imagem; 'ai' = a cota lida pela IA. */
  source: 'image' | 'ai'
  /** Metros por pixel da imagem ENVIADA. */
  metersPerPx: number
}

/** Escalas possíveis: a da imagem (sempre) e a lida pela IA (se houver). */
export function scaleChoices(rec: AiRecognitionT, image: ImageObject, factor: number): { image: ScaleChoice; ai: ScaleChoice | null } {
  const cmPerOrigPx = image.width / image.pixelWidth
  const ai = metersPerPxFromScale(rec.scale)
  return {
    image: { source: 'image', metersPerPx: cmPerOrigPx / 100 / factor },
    ai: ai === null ? null : { source: 'ai', metersPerPx: ai }
  }
}

export interface RecognizedResult extends RecognizedPlan {
  /** Canto superior esquerdo da imagem (cm, mundo) para esta escala. */
  origin: Point
  metersPerPx: number
  source: ScaleChoice['source']
}

/** Aplica a escala escolhida e devolve a variação em metros com a origem alinhada à imagem. */
export function recognize(rec: AiRecognitionT, image: ImageObject, factor: number, choice: ScaleChoice): RecognizedResult {
  const plan = recognitionToVariant(rec, choice.metersPerPx)
  // Com a escala da IA a imagem será redimensionada em torno do centro.
  const cmPerOrigPx = (choice.metersPerPx * 100) * factor
  const w = image.pixelWidth * cmPerOrigPx
  const h = image.pixelHeight * cmPerOrigPx
  const origin = { x: image.position.x - w / 2, y: image.position.y - h / 2 }
  return { ...plan, origin, metersPerPx: choice.metersPerPx, source: choice.source }
}

/** Monta os objetos do desenho (paredes, portas, janelas, cômodos e cotas) no andar indicado. */
export function buildRecognized(result: RecognizedResult, doc: PlanDocument, levelId: Id): BuiltPlan {
  return buildPlanFromVariant(result.variant, doc, result.origin, levelId)
}
