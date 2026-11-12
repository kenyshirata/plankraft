/**
 * Diálogo da ferramenta "Definir escala": pergunta a distância real entre os
 * dois pontos clicados na imagem e aplica a nova escala.
 */
import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import type { Id, Point } from '@shared/model'
import { distance } from '@renderer/lib/geometry'
import { formatLength, parseDecimal, toCm } from '@renderer/lib/format'
import { applyCalibration } from '@renderer/store/imageActions'
import { useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'

interface Pending {
  imageId: Id
  a: Point
  b: Point
}

const useCalibrate = create<{ pending: Pending | null }>()(() => ({ pending: null }))

export const openCalibrateDialog = (p: Pending): void => useCalibrate.setState({ pending: p })

function finish(): void {
  useCalibrate.setState({ pending: null })
  useEditorStore.setState({ calibratingImageId: null })
  useEditorStore.getState().setTool('select')
}

export function CalibrateDialogHost(): React.JSX.Element | null {
  const pending = useCalibrate((s) => s.pending)
  return pending ? <CalibrateDialog key={`${pending.a.x},${pending.b.x}`} p={pending} /> : null
}

function CalibrateDialog({ p }: { p: Pending }): React.JSX.Element {
  const { unit, precision } = useSettingsStore()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const inputUnit = unit === 'mm' ? 'mm' : unit

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        useCalibrate.setState({ pending: null }) // volta a clicar os pontos
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const submit = (): void => {
    const v = parseDecimal(text)
    if (v === null || v <= 0) {
      setError('Informe um número maior que zero.')
      return
    }
    applyCalibration(p.imageId, p.a, p.b, toCm(v, inputUnit))
    finish()
  }

  return (
    <div className="dialog-backdrop">
      <form
        className="dialog dialog--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calibrate-title"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id="calibrate-title" className="dialog__title">
          Definir escala da imagem
        </h2>
        <p className="dialog__message">
          Na imagem, os dois pontos estão a {formatLength(distance(p.a, p.b), unit, precision)} na escala atual. Qual é a
          distância <strong>real</strong> entre eles?
        </p>
        <label className="dialog-field">
          <span>Distância real ({inputUnit})</span>
          <input
            ref={ref}
            className="text-input"
            inputMode="decimal"
            placeholder={inputUnit === 'm' ? 'Ex.: 3,50' : 'Ex.: 350'}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError('')
            }}
          />
        </label>
        {error && <p className="form__note form__note--error">{error}</p>}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={finish}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--accent">
            Aplicar escala
          </button>
        </div>
      </form>
    </div>
  )
}
