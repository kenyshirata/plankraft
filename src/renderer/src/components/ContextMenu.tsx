import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuItem =
  | { label: string; shortcut?: string; onSelect(): void; disabled?: boolean; danger?: boolean }
  | { separator: true }

interface ContextMenuProps {
  /** Posição em px relativa ao contêiner do canvas. */
  x: number
  y: number
  items: MenuItem[]
  onClose(): void
}

/** Menu de contexto leve (HTML) exibido sobre o canvas. Fecha com clique fora, Esc ou rolagem. */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Mantém o menu dentro da área visível.
  useLayoutEffect(() => {
    const el = ref.current
    const parent = el?.parentElement
    if (!el || !parent) return
    const maxX = parent.clientWidth - el.offsetWidth - 4
    const maxY = parent.clientHeight - el.offsetHeight - 4
    setPos({ x: Math.max(4, Math.min(x, maxX)), y: Math.max(4, Math.min(y, maxY)) })
  }, [x, y])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) =>
        'separator' in item ? (
          <div key={i} className="context-menu__sep" role="separator" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`context-menu__item${item.danger ? ' is-danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <kbd>{item.shortcut}</kbd>}
          </button>
        )
      )}
    </div>
  )
}
