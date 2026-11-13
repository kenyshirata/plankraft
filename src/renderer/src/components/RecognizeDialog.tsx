/**
 * "Reconhecer planta": a IA lê a imagem de fundo e devolve cômodos, portas e
 * janelas. O usuário revisa o resultado sobreposto à imagem, escolhe a escala
 * (da imagem ou a cota lida pela IA) e só então aplica — numa única ação
 * desfazível (Ctrl+Z).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { AlertTriangle, KeyRound, Loader2, ScanSearch, X } from 'lucide-react'
import type { AiRecognitionT } from '@shared/aiRecognize'
import type { AiStatus } from '@shared/ipc'
import type { ImageObject } from '@shared/model'
import { useEditorStore } from '@renderer/store/editorStore'
import { useAssetImage } from '@renderer/store/assetStore'
import { addObjects, updateObject } from '@renderer/store/docOps'
import { scaleImageAround } from '@renderer/lib/imageGeometry'
import { toast } from '@renderer/store/toastStore'
import { formatNumber } from '@renderer/lib/format'
import { ROOM_COLORS } from '@renderer/store/actions'
import { buildRecognized, prepareImage, recognize, scaleChoices, type PreparedImage } from '@renderer/ai/recognize'
import { openAiSettings } from './AiDialog'

const useRecognize = create<{ imageId: string | null }>()(() => ({ imageId: null }))
export const openRecognize = (imageId: string): void => useRecognize.setState({ imageId })
const close = (): void => useRecognize.setState({ imageId: null })

export function RecognizeDialogHost(): React.JSX.Element | null {
  const imageId = useRecognize((s) => s.imageId)
  const image = useEditorStore((s) => s.doc.objects.find((o): o is ImageObject => o.id === imageId && o.type === 'image'))
  return image ? <RecognizeDialog image={image} /> : null
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; started: number }
  | { kind: 'error'; message: string; needsKey?: boolean }
  | { kind: 'review'; rec: AiRecognitionT; model: string }

function RecognizeDialog({ image }: { image: ImageObject }): React.JSX.Element {
  const { image: el } = useAssetImage(image.asset)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [useAiScale, setUseAiScale] = useState(true)
  const prepared = useRef<PreparedImage | null>(null)

  useEffect(() => {
    window.api?.aiStatus().then(setStatus).catch(() => setStatus(null))
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        void window.api?.aiCancel()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    if (phase.kind !== 'loading') return
    const t = window.setInterval(() => setElapsed(Math.round((Date.now() - phase.started) / 1000)), 500)
    return () => window.clearInterval(t)
  }, [phase])

  const offline = !window.api || status?.provider === 'offline'
  const hasKey = status ? status.configured[status.provider] : false
  const rotated = Math.abs(image.rotation % 360) > 0.05
  const providerName = status?.provider === 'openai' ? 'OpenAI' : 'Claude (Anthropic)'

  const run = async (): Promise<void> => {
    if (!el || !window.api) return
    try {
      prepared.current = prepareImage(el)
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Não foi possível preparar a imagem.' })
      return
    }
    setElapsed(0)
    setPhase({ kind: 'loading', started: Date.now() })
    const result = await window.api.aiRecognize(prepared.current.payload)
    setPhase((cur) => {
      if (cur.kind !== 'loading') return cur // cancelado
      if (!result.ok) return { kind: 'error', message: result.error, needsKey: result.needsKey }
      setUseAiScale(true)
      return { kind: 'review', rec: result.recognition, model: result.model }
    })
  }

  const cancel = (): void => {
    void window.api?.aiCancel()
    setPhase({ kind: 'idle' })
  }

  // ---- revisão
  const review = phase.kind === 'review' ? phase : null
  const factor = prepared.current?.factor ?? 1
  const choices = useMemo(() => (review ? scaleChoices(review.rec, image, factor) : null), [review, image, factor])
  const choice = choices ? (useAiScale && choices.ai ? choices.ai : choices.image) : null
  const result = useMemo(() => (review && choice ? recognize(review.rec, image, factor, choice) : null), [review, choice, image, factor])
  const otherArea = useMemo(() => {
    if (!review || !choices?.ai) return null
    const other = choice?.source === 'ai' ? choices.image : choices.ai
    return recognize(review.rec, image, factor, other).area
  }, [review, choices, choice, image, factor])

  const apply = (): void => {
    if (!result || !choice) return
    const ed = useEditorStore.getState()
    const built = buildRecognized(result, ed.doc, ed.activeLevelId)
    if (!built.objects.length) {
      toast.warning('Nada para aplicar: nenhum cômodo foi reconhecido.')
      return
    }
    // Escala da IA: a imagem é redimensionada em torno do centro (para continuar alinhada),
    // na mesma ação que cria os objetos — um único Ctrl+Z desfaz tudo.
    const scaleFactor = (choice.metersPerPx * 100 * factor * image.pixelWidth) / image.width
    ed.commit((d) =>
      addObjects(
        choice.source === 'ai' ? updateObject(d, image.id, 'image', (o) => scaleImageAround(o, scaleFactor, o.position)) : d,
        built.objects
      )
    )
    ed.select([])
    toast.success(`Planta aplicada — ${formatNumber(built.area / 10000, 1)} m² úteis. Tudo é editável (Ctrl+Z desfaz).`)
    close()
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && phase.kind !== 'loading' && close()}>
      <div className="dialog dialog--form dialog--ai" role="dialog" aria-modal="true" aria-labelledby="rec-title" onKeyDown={(e) => e.stopPropagation()}>
        <div className="ai-head">
          <h2 id="rec-title" className="dialog__title">
            <ScanSearch size={18} /> Reconhecer planta
          </h2>
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Fechar" onClick={() => (phase.kind === 'loading' ? cancel() : close())}>
            <X size={16} />
          </button>
        </div>

        {phase.kind === 'idle' && (
          <p className="form__note">
            A IA lê a imagem <strong title={image.name}>{image.name}</strong> e propõe cômodos, portas e janelas. Você revisa o resultado sobre a
            imagem antes de aplicar. Funciona melhor com plantas nítidas e de frente; paredes diagonais e imagens muito poluídas podem exigir
            ajustes manuais. A imagem é enviada ao provedor de IA configurado.
          </p>
        )}

        {rotated && <div className="ai-error"><AlertTriangle size={16} /><span>A imagem está girada. Zere a rotação no painel de propriedades para reconhecer.</span></div>}

        {(offline || (status && !hasKey)) && (
          <div className="ai-banner">
            <KeyRound size={16} />
            <span>
              {offline
                ? 'Reconhecer planta precisa de IA com visão (Claude ou OpenAI). O modo offline não lê imagens.'
                : `Salve sua chave de API ${providerName} em Configurações para usar este recurso.`}
            </span>
            <button
              type="button"
              className="btn btn--sm btn--accent"
              onClick={() => {
                close()
                openAiSettings()
              }}
            >
              Configurar IA
            </button>
          </div>
        )}

        {phase.kind === 'loading' && (
          <div className="ai-loading">
            <Loader2 size={18} className="spin" />
            <div>
              <strong>Lendo a planta…</strong>
              <span>
                {providerName} · {elapsed}s — costuma levar de 20 a 90 segundos.
              </span>
            </div>
            <button type="button" className="btn btn--sm" onClick={cancel}>
              Cancelar
            </button>
          </div>
        )}

        {phase.kind === 'error' && (
          <div className="ai-error">
            <AlertTriangle size={16} />
            <span>{phase.message}</span>
          </div>
        )}

        {review && result && choice && prepared.current && (
          <div className="rec-review">
            <ReviewPreview prepared={prepared.current} result={result} />
            <div className="rec-review__side">
              <p className="form__note">
                {result.variant.rooms.length} cômodo{result.variant.rooms.length === 1 ? '' : 's'} · {result.variant.doors.length} porta
                {result.variant.doors.length === 1 ? '' : 's'} · {result.variant.windows.length} janela{result.variant.windows.length === 1 ? '' : 's'}
                <br />
                Área reconhecida: <strong>{formatNumber(result.area, 1)} m²</strong>
              </p>
              <span className="field__label">Escala</span>
              <label className="check">
                <input type="radio" name="rec-scale" checked={choice.source === 'image'} onChange={() => setUseAiScale(false)} />
                Usar a escala da imagem{choices && otherArea !== null && choice.source === 'ai' ? ` (${formatNumber(otherArea, 1)} m²)` : ''}
              </label>
              <label className={`check${choices?.ai ? '' : ' is-disabled'}`}>
                <input type="radio" name="rec-scale" disabled={!choices?.ai} checked={choice.source === 'ai'} onChange={() => setUseAiScale(true)} />
                {choices?.ai && review.rec.scale
                  ? `Usar a cota lida pela IA (${formatNumber(review.rec.scale.meters, 2)} m)${otherArea !== null && choice.source === 'image' ? ` (${formatNumber(otherArea, 1)} m²)` : ''}`
                  : 'Cota não encontrada na imagem'}
              </label>
              {review.rec.notes.trim() && <p className="form__note">IA: {review.rec.notes}</p>}
              {result.warnings.map((w) => (
                <p key={w} className="form__note">⚠ {w}</p>
              ))}
              <p className="form__note">Dica: confira a área total. Se estiver muito diferente do esperado, troque a escala ou calibre a imagem.</p>
            </div>
          </div>
        )}

        <div className="dialog__actions dialog__actions--split">
          <span className="ai-footnote">{status && !offline ? `Modelo: ${status.models[status.provider]}` : ''}</span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => (phase.kind === 'loading' ? cancel() : close())}>
            {phase.kind === 'loading' ? 'Cancelar' : 'Fechar'}
          </button>
          {review ? (
            <>
              <button type="button" className="btn" onClick={() => void run()}>
                Ler de novo
              </button>
              <button type="button" className="btn btn--accent" disabled={!result || result.variant.rooms.length === 0} onClick={apply}>
                Aplicar ao desenho
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn btn--accent"
              disabled={phase.kind === 'loading' || !el || rotated || offline || !hasKey}
              onClick={() => void run()}
            >
              <ScanSearch size={15} /> Reconhecer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Imagem enviada com o resultado desenhado por cima (cômodos, portas e janelas). */
function ReviewPreview({ prepared, result }: { prepared: PreparedImage; result: ReturnType<typeof recognize> }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const W = 400
  const k = W / prepared.canvas.width
  const H = Math.round(prepared.canvas.height * k)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, W, H)
    ctx.globalAlpha = 0.55
    ctx.drawImage(prepared.canvas, 0, 0, W, H)
    ctx.globalAlpha = 1
    const px = (m: number): number => (m / result.metersPerPx) * k
    result.variant.rooms.forEach((r, i) => {
      ctx.fillStyle = `${ROOM_COLORS[i % ROOM_COLORS.length]}66`
      ctx.strokeStyle = ROOM_COLORS[i % ROOM_COLORS.length]
      ctx.lineWidth = 2
      ctx.fillRect(px(r.x), px(r.y), px(r.width), px(r.depth))
      ctx.strokeRect(px(r.x), px(r.y), px(r.width), px(r.depth))
      ctx.fillStyle = '#111'
      ctx.font = '600 12px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(r.name.length > 16 ? `${r.name.slice(0, 15)}…` : r.name, px(r.x + r.width / 2), px(r.y + r.depth / 2))
    })
    const dot = (o: { x: number; y: number }, color: string): void => {
      ctx.beginPath()
      ctx.arc(px(o.x), px(o.y), 5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    result.variant.doors.forEach((o) => dot(o, '#e8590c'))
    result.variant.windows.forEach((o) => dot(o, '#1c7ed6'))
  }, [prepared, result, k, H])
  return (
    <div className="rec-preview">
      <canvas ref={ref} width={W} height={H} style={{ width: W, height: H }} />
      <span className="rec-preview__legend">
        <i style={{ background: '#e8590c' }} /> portas <i style={{ background: '#1c7ed6' }} /> janelas
      </span>
    </div>
  )
}
