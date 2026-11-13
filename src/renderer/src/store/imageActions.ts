/**
 * Imagem de fundo: importar, visibilidade rápida (Ctrl+B), bloqueio, opacidade
 * e calibração de escala por dois pontos.
 */
import { findLayerByRole, newId, type Id, type ImageObject, type PlanDocument, type Point } from '@shared/model'
import { distance } from '@renderer/lib/geometry'
import { scaleImageAround } from '@renderer/lib/imageGeometry'
import { addObjects, mapObjects, updateObject } from './docOps'
import { useAssetStore } from './assetStore'
import { useEditorStore } from './editorStore'
import { toast } from './toastStore'

/** Largura inicial (cm) de uma imagem importada, antes de calibrar a escala. */
const DEFAULT_WIDTH_CM = 1000

const st = useEditorStore.getState

export const imagesOf = (doc: PlanDocument): ImageObject[] => doc.objects.filter((o): o is ImageObject => o.type === 'image')

/** Abre o diálogo nativo, carrega a imagem e a coloca no centro da vista, na camada "Imagem de Fundo". */
export async function importBackgroundImage(): Promise<void> {
  if (!window.api) {
    toast.warning('Importar imagem só funciona no aplicativo desktop.')
    return
  }
  try {
    const result = await window.api.importImage()
    if (!result) return
    const img = await useAssetStore.getState().put(result.key, result.dataUrl)
    const { doc, viewport, canvasSize, activeLayerId, activeLevelId, commit, select, setTool } = st()
    const layer = findLayerByRole(doc, 'background', activeLevelId) ?? doc.layers.find((l) => l.id === activeLayerId)!
    const center: Point = {
      x: (canvasSize.width / 2 - viewport.x) / viewport.scale,
      y: (canvasSize.height / 2 - viewport.y) / viewport.scale
    }
    const width = DEFAULT_WIDTH_CM
    const height = (DEFAULT_WIDTH_CM * img.naturalHeight) / img.naturalWidth
    const obj: ImageObject = {
      id: newId(),
      type: 'image',
      layerId: layer.id,
      asset: result.key,
      name: result.name,
      position: center,
      width,
      height,
      rotation: 0,
      pixelWidth: img.naturalWidth,
      pixelHeight: img.naturalHeight,
      opacity: 0.6,
      hidden: false,
      locked: false
    }
    commit((d) => addObjects(d, [obj]))
    // A camada pode estar oculta/bloqueada: deixa a imagem visível e editável.
    if (!layer.visible) st().toggleLayerVisibility(layer.id)
    if (layer.locked) st().toggleLayerLock(layer.id)
    setTool('select')
    select([obj.id])
    st().zoomToFit()
    toast.success('Imagem importada. Use “Definir escala” para ajustar as medidas reais.')
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Não foi possível importar a imagem.')
  }
}

/** Ctrl+B: oculta todas as imagens de fundo se alguma estiver visível; senão mostra todas. Fora do histórico. */
export function toggleBackgroundImages(): void {
  const { doc, updateLive, selectedIds, select } = st()
  const images = imagesOf(doc)
  if (!images.length) {
    toast.info('Não há imagem de fundo. Importe uma em Arquivo → Importar imagem de fundo (Ctrl+I).')
    return
  }
  const hide = images.some((i) => !i.hidden)
  updateLive((d) => mapObjects(d, images.map((i) => i.id), (o) => (o.type === 'image' ? { ...o, hidden: hide } : o)))
  if (hide) select(selectedIds.filter((id) => !images.some((i) => i.id === id)))
  toast.info(hide ? 'Imagem de fundo oculta (Ctrl+B para mostrar)' : 'Imagem de fundo visível')
}

/** Alterações de visualização (visível, bloqueio, opacidade) — fora do histórico, como nas camadas. */
export function setImageView(id: Id, patch: Partial<Pick<ImageObject, 'hidden' | 'locked' | 'opacity'>>): void {
  st().updateLive((d) => updateObject(d, id, 'image', (o) => ({ ...o, ...patch })))
  if (patch.hidden || patch.locked) {
    const { selectedIds, select } = st()
    select(selectedIds.filter((s) => s !== id))
  }
}

export function patchImage(id: Id, patch: Partial<ImageObject>): void {
  st().commit((d) => updateObject(d, id, 'image', (o) => ({ ...o, ...patch })))
}

/** Define a escala diretamente: quantos cm cada pixel da imagem representa. */
export function setImageCmPerPixel(id: Id, cmPerPx: number): void {
  const img = imagesOf(st().doc).find((i) => i.id === id)
  if (!img || cmPerPx <= 0) return
  const factor = (cmPerPx * img.pixelWidth) / img.width
  st().commit((d) => updateObject(d, id, 'image', (o) => scaleImageAround(o, factor, o.position)))
}

/** Inicia a ferramenta "Definir escala" para a imagem. */
export function startCalibration(id: Id): void {
  const img = imagesOf(st().doc).find((i) => i.id === id)
  if (!img) return
  if (img.locked) setImageView(id, { locked: false })
  useEditorStore.setState({ calibratingImageId: id })
  st().setTool('calibrate')
}

/** Aplica a calibração: a distância entre a e b passa a valer `realCm`; o ponto a fica fixo. */
export function applyCalibration(id: Id, a: Point, b: Point, realCm: number): void {
  const measured = distance(a, b)
  if (measured < 1 || realCm <= 0) return
  const factor = realCm / measured
  st().commit((d) => updateObject(d, id, 'image', (o) => scaleImageAround(o, factor, a)))
  toast.success(`Escala ajustada (×${factor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}).`)
}

/** Carrega do disco as imagens de um projeto recém-aberto; avisa sobre as ausentes. */
export async function loadProjectAssets(filePath: string, doc: PlanDocument): Promise<void> {
  const images = imagesOf(doc)
  if (!images.length || !window.api) return
  const keys = [...new Set(images.map((i) => i.asset))]
  const results = await window.api.loadAssets(filePath, keys)
  const missing: string[] = []
  for (const r of results) {
    if (r.dataUrl) await useAssetStore.getState().put(r.key, r.dataUrl).catch(() => missing.push(r.key))
    else {
      useAssetStore.getState().markMissing(r.key)
      missing.push(r.key)
    }
  }
  if (missing.length) {
    const names = images.filter((i) => missing.includes(i.asset)).map((i) => `“${i.name}”`)
    toast.warning(
      `Imagem de fundo não encontrada: ${[...new Set(names)].join(', ')}. Verifique a pasta “assets” ao lado do projeto — o restante foi aberto normalmente.`
    )
  }
}

