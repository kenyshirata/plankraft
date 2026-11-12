/**
 * "Gerar com IA": o usuário descreve a planta em linguagem natural; o main
 * chama o provedor configurado (a chave nunca passa pelo renderer) e devolve
 * 2–3 variações estruturadas. Cada variação aparece num cartão com prévia;
 * "Usar esta" monta paredes, portas, janelas, cômodos, móveis e cotas.
 */
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { AlertTriangle, KeyRound, Loader2, Sparkles, X } from 'lucide-react'
import type { AiPlanResponseT, AiVariantT } from '@shared/aiPlan'
import type { AiStatus } from '@shared/ipc'
import { buildPlanFromVariant, variantStats } from '@renderer/ai/planFromAi'
import { generateOfflinePlan } from '@shared/offlinePlanner'
import { boundsOf } from '@renderer/lib/geometry'
import { formatNumber } from '@renderer/lib/format'
import { askDialog } from '@renderer/store/dialogStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { objectPoints, wallsOf } from '@renderer/store/docOps'
import { toast } from '@renderer/store/toastStore'
import { ROOM_COLORS } from '@renderer/store/actions'

const useAiDialog = create<{ open: boolean }>()(() => ({ open: false }))
/** Sementes do modo offline quando o app roda no navegador (sem o main). */
const browserSeeds = new Map<string, number>()
export const openAiDialog = (): void => useAiDialog.setState({ open: true })
const close = (): void => useAiDialog.setState({ open: false })

/** Abre Configurações → IA (painel direito). */
export const openAiSettings = (): void => {
  window.dispatchEvent(new CustomEvent('plankraft:open-ai-settings'))
}

const EXAMPLES = [
  'Quero uma casa de 80m² com 2 quartos, 1 suíte, sala ampla, cozinha americana e 1 banheiro.',
  'Apartamento de 60m² com 1 quarto, sala, cozinha e varanda.',
  'Casa térrea de 120m² com 3 quartos (1 suíte), escritório, área de serviço e varanda gourmet com churrasqueira.',
  'Studio de 35m² com cozinha integrada, banheiro e espaço de trabalho.'
]

export function AiDialogHost(): React.JSX.Element | null {
  const open = useAiDialog((s) => s.open)
  return open ? <AiDialog /> : null
}

type Phase = { kind: 'idle' } | { kind: 'loading'; started: number } | { kind: 'error'; message: string; needsKey?: boolean } | { kind: 'done'; plan: AiPlanResponseT; model: string }

/** Aplica uma variação ao desenho (substituindo ou ao lado do que existe). */
export async function applyVariant(v: AiVariantT): Promise<boolean> {
  const { doc, commit, zoomToFit, select } = useEditorStore.getState()
  let mode: 'replace' | 'add' = 'replace'
  if (doc.objects.length) {
    const choice = await askDialog({
      title: 'Usar esta planta',
      message: 'O desenho atual não está vazio. Deseja substituí-lo pela planta gerada ou colocá-la ao lado?',
      actions: [
        { label: 'Cancelar', value: 'cancel' },
        { label: 'Colocar ao lado', value: 'add' },
        { label: 'Substituir', value: 'replace', variant: 'primary' }
      ]
    })
    if (choice !== 'replace' && choice !== 'add') return false
    mode = choice
  }
  const walls = new Map(wallsOf(doc).map((w) => [w.id, w]))
  const b = mode === 'add' ? boundsOf(doc.objects.flatMap((o) => objectPoints(o, walls))) : null
  const origin = b ? { x: b.x + b.width + 300, y: b.y } : { x: 0, y: 0 }
  const built = buildPlanFromVariant(v, doc, origin)
  commit((d) => ({ ...d, objects: mode === 'replace' ? built.objects : [...d.objects, ...built.objects] }))
  select([])
  zoomToFit()
  toast.success(`“${v.title}” aplicada — ${formatNumber(built.area / 10000, 1)} m² úteis. Tudo é editável (Ctrl+Z desfaz).`)
  built.warnings.forEach((w) => toast.warning(w))
  return true
}

function AiDialog(): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
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

  const hasKey = status ? status.configured[status.provider] : false
  const offline = !window.api || status?.provider === 'offline'
  const providerName = offline ? 'Modo offline' : status?.provider === 'openai' ? 'OpenAI' : 'Claude (Anthropic)'

  const useOffline = async (): Promise<void> => {
    if (window.api) setStatus(await window.api.aiSetProvider('offline'))
  }

  const generate = async (): Promise<void> => {
    if (prompt.trim().length < 5) {
      ref.current?.focus()
      return
    }
    if (!window.api) {
      // Fora do Electron (navegador): o gerador offline roda aqui mesmo.
      const seed = (browserSeeds.get(prompt.trim()) ?? -1) + 1
      browserSeeds.set(prompt.trim(), seed)
      setPhase({ kind: 'done', plan: generateOfflinePlan(prompt, seed), model: 'Gerador procedural (offline)' })
      return
    }
    setElapsed(0)
    setPhase({ kind: 'loading', started: Date.now() })
    const result = await window.api.aiGenerate(prompt)
    setPhase((cur) => {
      if (cur.kind !== 'loading') return cur // cancelado
      return result.ok ? { kind: 'done', plan: result.plan, model: result.model } : { kind: 'error', message: result.error, needsKey: result.needsKey }
    })
  }

  const cancel = (): void => {
    void window.api?.aiCancel()
    setPhase({ kind: 'idle' })
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && phase.kind !== 'loading' && close()}>
      <div className="dialog dialog--form dialog--ai" role="dialog" aria-modal="true" aria-labelledby="ai-title" onKeyDown={(e) => e.stopPropagation()}>
        <div className="ai-head">
          <h2 id="ai-title" className="dialog__title">
            <Sparkles size={18} /> Gerar planta {offline ? '(modo offline)' : 'com IA'}
          </h2>
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Fechar" onClick={() => (phase.kind === 'loading' ? cancel() : close())}>
            <X size={16} />
          </button>
        </div>

        {status && !hasKey && (
          <div className="ai-banner">
            <KeyRound size={16} />
            <span>
              Para usar {providerName}, salve sua chave de API em Configurações — ou use o <strong>modo offline</strong>, que é grátis e
              não precisa de chave nem de internet.
            </span>
            <button type="button" className="btn btn--sm btn--accent" onClick={() => void useOffline()}>
              Usar offline
            </button>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => {
                close()
                openAiSettings()
              }}
            >
              Configurar chave
            </button>
          </div>
        )}

        <textarea
          ref={ref}
          className="text-input text-input--area ai-prompt"
          rows={3}
          maxLength={4000}
          placeholder="Descreva a planta: área, número de quartos, suítes, sala, cozinha, varanda…"
          value={prompt}
          disabled={phase.kind === 'loading'}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void generate()
          }}
        />
        <div className="ai-examples">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" className="chip" disabled={phase.kind === 'loading'} onClick={() => setPrompt(ex)}>
              {ex}
            </button>
          ))}
        </div>

        {phase.kind === 'loading' && (
          <div className="ai-loading">
            <Loader2 size={18} className="spin" />
            <div>
              <strong>Desenhando variações…</strong>
              <span>
                {providerName} · {elapsed}s{offline ? '' : ' — costuma levar de 20 a 90 segundos.'}
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
            {phase.needsKey && (
              <button type="button" className="btn btn--sm btn--accent" onClick={() => void useOffline().then(() => setPhase({ kind: 'idle' }))}>
                Usar offline
              </button>
            )}
            {phase.needsKey && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => {
                  close()
                  openAiSettings()
                }}
              >
                Configurar chave
              </button>
            )}
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="ai-results">
            {phase.plan.variants.map((v, i) => {
              const st = variantStats(v)
              return (
                <div key={i} className="ai-card">
                  <VariantPreview v={v} />
                  <div className="ai-card__body">
                    <strong>{v.title}</strong>
                    <span className="ai-card__meta">
                      {st.rooms} cômodos · {formatNumber(st.area, 1)} m² brutos
                    </span>
                    <p>{v.summary}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn--accent btn--block"
                    onClick={async () => {
                      if (await applyVariant(v)) close()
                    }}
                  >
                    Usar esta
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div className="dialog__actions dialog__actions--split">
          <span className="ai-footnote">
            {offline ? 'Modo offline · grátis, sem internet' : status ? `Modelo: ${status.models[status.provider]}` : ''}
            {phase.kind === 'done' ? ' · gere de novo para outras ideias' : ''}
          </span>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => (phase.kind === 'loading' ? cancel() : close())}>
            {phase.kind === 'loading' ? 'Cancelar' : 'Fechar'}
          </button>
          <button
            type="button"
            className="btn btn--accent"
            disabled={phase.kind === 'loading' || prompt.trim().length < 5}
            onClick={() => void generate()}
          >
            <Sparkles size={15} /> {phase.kind === 'done' ? 'Gerar novamente' : 'Gerar variações'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Prévia SVG de uma variação: retângulos dos cômodos com nome. */
function VariantPreview({ v }: { v: AiVariantT }): React.JSX.Element {
  const xs = v.rooms.flatMap((r) => [r.x, r.x + r.width])
  const ys = v.rooms.flatMap((r) => [r.y, r.y + r.depth])
  const minX = Math.min(...xs, 0)
  const minY = Math.min(...ys, 0)
  const w = Math.max(...xs, 1) - minX
  const h = Math.max(...ys, 1) - minY
  const pad = Math.max(w, h) * 0.04
  return (
    <svg className="ai-preview" viewBox={`${minX - pad} ${minY - pad} ${w + 2 * pad} ${h + 2 * pad}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {v.rooms.map((r, i) => (
        <g key={i}>
          <rect x={r.x} y={r.y} width={r.width} height={r.depth} fill={ROOM_COLORS[i % ROOM_COLORS.length]} fillOpacity={0.45} stroke="currentColor" strokeWidth={0.12} />
          {r.width > 1.4 && r.depth > 0.8 && (
            <text x={r.x + r.width / 2} y={r.y + r.depth / 2} fontSize={Math.min(0.5, r.width / 7)} textAnchor="middle" dominantBaseline="middle" fill="currentColor">
              {r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name}
            </text>
          )}
        </g>
      ))}
    </svg>
  )
}
