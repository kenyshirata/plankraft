import { useEffect, useRef } from 'react'
import { useDialogStore } from '@renderer/store/dialogStore'

/** Renderiza o diálogo modal pendente (ver store/dialogStore.ts). */
export function DialogHost(): React.JSX.Element | null {
  const current = useDialogStore((s) => s.current)
  const close = useDialogStore((s) => s.close)
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!current) return
    primaryRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [current, close])

  if (!current) return null
  const last = current.actions.length - 1

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
        <h2 id="dialog-title" className="dialog__title">
          {current.title}
        </h2>
        <p className="dialog__message">{current.message}</p>
        <div className="dialog__actions">
          {current.actions.map((a, i) => (
            <button
              key={a.value}
              ref={i === last ? primaryRef : undefined}
              type="button"
              className={`btn${a.variant === 'primary' ? ' btn--accent' : a.variant === 'danger' ? ' btn--danger-solid' : ''}`}
              onClick={() => close(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
