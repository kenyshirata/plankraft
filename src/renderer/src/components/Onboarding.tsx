/**
 * Tour de boas-vindas (primeira execução; também em Ajuda → Tour de boas-vindas).
 * 7 passos curtos cobrindo desenho, camadas, blocos, imagem de fundo, cotas,
 * PDF e IA. "Concluir"/"Pular" marca `onboardingDone` nas preferências.
 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { Armchair, BrickWall, FileDown, ImagePlus, Layers, MoveDiagonal, Sparkles, type LucideIcon } from 'lucide-react'
import { useSettingsStore } from '@renderer/store/settingsStore'

const useOnboarding = create<{ open: boolean }>()(() => ({ open: false }))
export const openOnboarding = (): void => useOnboarding.setState({ open: true })

interface Step {
  icon: LucideIcon
  title: string
  text: string
  keys: string[]
}

const STEPS: Step[] = [
  {
    icon: BrickWall,
    title: 'Desenhe paredes',
    text: 'Use a ferramenta Parede (W): arraste para criar uma parede ou clique ponto a ponto. O ímã alinha à grade e às pontas; Shift trava em 45°. Depois, Porta (D), Janela (J) e Cômodo (C) — que calcula a área automaticamente.',
    keys: ['W', 'D', 'J', 'C']
  },
  {
    icon: Layers,
    title: 'Organize em camadas',
    text: 'Cada ferramenta usa sua camada (Paredes, Portas e Janelas, Móveis…). No painel Camadas você oculta, bloqueia, muda a cor e reordena arrastando.',
    keys: []
  },
  {
    icon: Armchair,
    title: 'Mobilie com blocos',
    text: 'Na aba Blocos, arraste sofás, camas e louças para o desenho — eles encostam sozinhos na parede. R gira 90°; salve seus próprios blocos a partir de uma seleção.',
    keys: ['B', 'R']
  },
  {
    icon: ImagePlus,
    title: 'Trace sobre uma imagem',
    text: 'Importe a foto ou o PDF escaneado de uma planta como imagem de fundo (Ctrl+I) e use "Definir escala" clicando em dois pontos de medida conhecida. Ctrl+B mostra/oculta.',
    keys: ['Ctrl+I', 'Ctrl+B']
  },
  {
    icon: MoveDiagonal,
    title: 'Cotas automáticas',
    text: 'Toda parede ganha sua cota — inclusive diagonais — e ela acompanha a parede. Arraste uma cota para afastá-la; K cria cotas manuais. Ctrl+Shift+C mostra/oculta.',
    keys: ['K', 'Ctrl+Shift+C']
  },
  {
    icon: FileDown,
    title: 'Exporte em PDF',
    text: 'Gere um PDF vetorial em A4, A3, A2 ou Carta, na escala 1:50, 1:100, 1:200 ou ajustado à folha, com quadro de áreas e carimbo.',
    keys: ['Ctrl+P']
  },
  {
    icon: Sparkles,
    title: 'Gere plantas com IA',
    text: 'Descreva o que precisa ("casa de 80 m² com 2 quartos e cozinha americana") e escolha entre as variações geradas. Configure sua chave de API em Configurações → Inteligência artificial.',
    keys: []
  }
]

export function OnboardingHost(): React.JSX.Element | null {
  const open = useOnboarding((s) => s.open)
  const done = useSettingsStore((s) => s.onboardingDone)
  // Primeira execução: abre sozinho.
  useEffect(() => {
    if (!done) openOnboarding()
  }, [done])
  return open ? <Onboarding /> : null
}

function Onboarding(): React.JSX.Element {
  const [i, setI] = useState(0)
  const step = STEPS[i]
  const Icon = step.icon
  const finish = (): void => {
    useSettingsStore.getState().set('onboardingDone', true)
    useOnboarding.setState({ open: false })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      e.stopPropagation()
      if (e.key === 'Escape') finish()
      else if (e.key === 'ArrowRight') setI((n) => Math.min(STEPS.length - 1, n + 1))
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <div className="dialog-backdrop">
      <div className="dialog onboarding" role="dialog" aria-modal="true" aria-labelledby="onb-title">
        {i === 0 && (
          <div className="onboarding__welcome">
            <div className="brand-mark brand-mark--lg">P</div>
            <div>
              <strong>Bem-vindo ao PlanKraft</strong>
              <span>Um tour rápido de 1 minuto pelo essencial.</span>
            </div>
          </div>
        )}
        <div className="onboarding__art" aria-hidden>
          <Icon size={44} strokeWidth={1.4} />
        </div>
        <p className="onboarding__count">
          Passo {i + 1} de {STEPS.length}
        </p>
        <h2 id="onb-title" className="dialog__title">
          {step.title}
        </h2>
        <p className="dialog__message">{step.text}</p>
        {step.keys.length > 0 && (
          <div className="onboarding__keys">
            {step.keys.map((k) => (
              <kbd key={k}>{k}</kbd>
            ))}
          </div>
        )}
        <div className="onboarding__dots" aria-hidden>
          {STEPS.map((_, n) => (
            <button key={n} type="button" className={n === i ? 'is-active' : ''} onClick={() => setI(n)} tabIndex={-1} />
          ))}
        </div>
        <div className="dialog__actions dialog__actions--split">
          <button type="button" className="btn btn--ghost" onClick={finish}>
            Pular tour
          </button>
          <span className="spacer" />
          {i > 0 && (
            <button type="button" className="btn" onClick={() => setI(i - 1)}>
              Voltar
            </button>
          )}
          {i < STEPS.length - 1 ? (
            <button type="button" className="btn btn--accent" autoFocus onClick={() => setI(i + 1)}>
              Próximo
            </button>
          ) : (
            <button type="button" className="btn btn--accent" autoFocus onClick={finish}>
              Começar a desenhar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
