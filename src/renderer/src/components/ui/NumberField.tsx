import { useEffect, useState } from 'react'
import { formatNumber, parseDecimal } from '@renderer/lib/format'

interface NumberFieldProps {
  value: number
  onCommit(value: number): void
  min?: number
  max?: number
  precision?: number
  suffix?: string
  disabled?: boolean
  ariaLabel?: string
}

/**
 * Campo numérico que aceita vírgula decimal e só confirma o valor ao sair do
 * campo ou pressionar Enter (evita gerar um passo de undo por tecla digitada).
 * Esc descarta a edição. Setas ↑/↓ ajustam em 1 (Shift: 10).
 */
export function NumberField({
  value,
  onCommit,
  min = -Infinity,
  max = Infinity,
  precision = 0,
  suffix,
  disabled,
  ariaLabel
}: NumberFieldProps): React.JSX.Element {
  const display = formatNumber(value, precision).replace(/\./g, '') // sem separador de milhar
  const [text, setText] = useState(display)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) setText(display)
  }, [display, editing])

  const commit = (raw: string): void => {
    const n = parseDecimal(raw)
    if (n === null) {
      setText(display)
      return
    }
    const clamped = Math.min(max, Math.max(min, n))
    if (clamped !== value) onCommit(clamped)
    setText(formatNumber(clamped, precision).replace(/\./g, ''))
  }

  return (
    <span className={`number-field${disabled ? ' is-disabled' : ''}`}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        onFocus={(e) => {
          setEditing(true)
          e.currentTarget.select()
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          setEditing(false)
          commit(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setText(display)
            setEditing(false)
            e.currentTarget.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1)
            const next = Math.min(max, Math.max(min, (parseDecimal(text) ?? value) + step))
            setText(formatNumber(next, precision).replace(/\./g, ''))
            onCommit(next)
          }
        }}
      />
      {suffix && <span className="number-field__suffix">{suffix}</span>}
    </span>
  )
}
