/**
 * Diálogo "Salvar como bloco" / "Editar bloco": nome, categoria (existente ou
 * nova) e ícone (emoji). Aberto por openBlockDialog() de qualquer lugar.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { BUILTIN_CATEGORIES } from '@renderer/blocks/builtin'
import { createBlockFromSelection, updateBlockMeta } from '@renderer/store/blockActions'
import { useEditorStore } from '@renderer/store/editorStore'
import { resolveBlock, useLibraryStore } from '@renderer/store/libraryStore'

type DialogMode = { mode: 'create' } | { mode: 'edit'; blockId: string }

const useBlockDialog = create<{ current: DialogMode | null }>()(() => ({ current: null }))

export const openBlockDialog = (mode: DialogMode): void => useBlockDialog.setState({ current: mode })
const close = (): void => useBlockDialog.setState({ current: null })

const ICONS = ['🛋️', '🛏️', '🪑', '🚪', '🪟', '🛁', '🚿', '🚽', '🍳', '🧊', '📺', '💻', '🗄️', '🪴', '🌳', '🚗', '⭐', '📦']

export function BlockDialogHost(): React.JSX.Element | null {
  const current = useBlockDialog((s) => s.current)
  if (!current) return null
  return <BlockDialog key={current.mode === 'edit' ? current.blockId : 'create'} mode={current} />
}

function BlockDialog({ mode }: { mode: DialogMode }): React.JSX.Element {
  const library = useLibraryStore((s) => s.blocks)
  const doc = useEditorStore((s) => s.doc)
  const existing = mode.mode === 'edit' ? resolveBlock(mode.blockId, doc) : undefined
  const [name, setName] = useState(existing?.name ?? '')
  const [category, setCategory] = useState(existing?.category ?? 'Meus blocos')
  const [icon, setIcon] = useState(existing?.icon ?? '')
  const [replace, setReplace] = useState(true)
  const nameRef = useRef<HTMLInputElement>(null)

  const categories = useMemo(
    () => [...new Set(['Meus blocos', ...library.map((b) => b.category), ...BUILTIN_CATEGORIES])],
    [library]
  )

  useEffect(() => {
    nameRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const submit = (): void => {
    if (!name.trim()) {
      nameRef.current?.focus()
      return
    }
    const meta = { name, category, icon }
    if (mode.mode === 'create') {
      if (createBlockFromSelection(meta, replace)) close()
    } else {
      updateBlockMeta(mode.blockId, meta)
      close()
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className="dialog dialog--form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-dialog-title"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id="block-dialog-title" className="dialog__title">
          {mode.mode === 'create' ? 'Salvar seleção como bloco' : 'Editar bloco'}
        </h2>
        <label className="dialog-field">
          <span>Nome</span>
          <input ref={nameRef} className="text-input" value={name} maxLength={80} placeholder="Ex.: Ilha de cozinha" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="dialog-field">
          <span>Categoria</span>
          <input className="text-input" list="block-categories" value={category} maxLength={40} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="block-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <div className="dialog-field">
          <span>Ícone</span>
          <div className="icon-picker" role="radiogroup" aria-label="Ícone">
            <button type="button" className={`icon-picker__item${icon === '' ? ' is-active' : ''}`} onClick={() => setIcon('')} aria-label="Sem ícone">
              —
            </button>
            {ICONS.map((i) => (
              <button key={i} type="button" className={`icon-picker__item${icon === i ? ' is-active' : ''}`} onClick={() => setIcon(i)} aria-label={`Ícone ${i}`}>
                {i}
              </button>
            ))}
          </div>
        </div>
        {mode.mode === 'create' && (
          <label className="check">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            Substituir a seleção por uma instância do bloco
          </label>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--accent">
            {mode.mode === 'create' ? 'Salvar bloco' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
