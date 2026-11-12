import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useToastStore, type ToastKind } from '@renderer/store/toastStore'

const ICONS: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle
}

export function ToastHost(): React.JSX.Element {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  return (
    <div className="toast-host" role="status" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div key={t.id} className={`toast toast--${t.kind}`}>
            <Icon size={16} />
            <span>{t.message}</span>
            <button type="button" className="icon-btn icon-btn--xs" aria-label="Fechar" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
