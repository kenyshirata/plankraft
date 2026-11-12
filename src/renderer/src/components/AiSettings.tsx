/**
 * Configurações → Inteligência artificial: provedor, chave de API (salva
 * criptografada no main; aqui só aparecem os 4 últimos caracteres) e
 * "Testar conexão".
 */
import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, Loader2, ShieldCheck, Trash2, XCircle } from 'lucide-react'
import type { AiProvider, AiStatus, AiTestResult } from '@shared/ipc'
import { toast } from '@renderer/store/toastStore'

const LABEL: Record<AiProvider, string> = { offline: 'Offline (grátis)', anthropic: 'Claude', openai: 'OpenAI' }

export function AiSettings(): React.JSX.Element {
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<AiTestResult | null>(null)

  useEffect(() => {
    window.api?.aiStatus().then(setStatus).catch(() => setStatus(null))
  }, [])

  if (!window.api) return <p className="form__note">A IA só está disponível no aplicativo desktop.</p>
  if (!status) return <p className="form__note">Carregando…</p>

  const provider = status.provider
  const configured = status.configured[provider]

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ai-settings">
      <div className="segmented segmented--block">
        {(['offline', 'anthropic', 'openai'] as AiProvider[]).map((p) => (
          <button
            key={p}
            type="button"
            className={provider === p ? 'is-active' : ''}
            onClick={() =>
              run(async () => {
                setTest(null)
                setStatus(await window.api.aiSetProvider(p))
              })
            }
          >
            {LABEL[p]}
          </button>
        ))}
      </div>
      {provider === 'offline' ? (
        <p className="form__note">
          Gera plantas por regras de arquitetura, direto no seu computador: sem chave, sem internet e sem custo. Entende área,
          quartos, suítes, banheiros, cozinha americana, varanda (gourmet), área de serviço, escritório, lavabo, garagem e studio.
          Para layouts mais criativos, use Claude ou OpenAI com sua chave.
        </p>
      ) : (
        <>
      <p className="form__note">Modelo: {status.models[provider]}</p>

      {configured ? (
        <div className="ai-key-saved">
          <ShieldCheck size={15} />
          <span>Chave salva (criptografada) ····{status.hints[provider]}</span>
          <button
            type="button"
            className="icon-btn icon-btn--xs icon-btn--danger"
            aria-label="Remover chave"
            title="Remover chave"
            onClick={() =>
              run(async () => {
                setTest(null)
                setStatus(await window.api.aiSetKey(provider, null))
              })
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ) : (
        <form
          className="ai-key-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!key.trim()) return
            void run(async () => {
              setStatus(await window.api.aiSetKey(provider, key))
              setKey('')
              setTest(null)
              toast.success('Chave salva com criptografia do sistema.')
            })
          }}
        >
          <input
            className="text-input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
            aria-label={`Chave de API ${LABEL[provider]}`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button type="submit" className="btn btn--sm" disabled={busy || !key.trim()}>
            <KeyRound size={13} /> Salvar
          </button>
        </form>
      )}
      {!status.encryptionAvailable && <p className="form__note form__note--error">Criptografia do sistema indisponível — não é possível salvar chaves.</p>}

      <button
        type="button"
        className="btn btn--block"
        disabled={busy || !configured}
        onClick={() =>
          run(async () => {
            setTest(null)
            setTest(await window.api.aiTest(provider))
          })
        }
      >
        {busy ? <Loader2 size={14} className="spin" /> : null} Testar conexão
      </button>
      {test && (
        <p className={`ai-test${test.ok ? ' is-ok' : ' is-error'}`}>
          {test.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {test.message}
        </p>
      )}
      <p className="form__note">A chave é guardada só neste computador (criptografia do sistema) e usada apenas pelo processo principal do app.</p>
        </>
      )}
    </div>
  )
}
