/**
 * Barra de andares (pavimentos): abas para trocar o andar em edição, criar,
 * duplicar e excluir andares, ajustar o pé-direito e ligar o calco do andar de baixo.
 * Clique duplo na aba renomeia.
 */
import { useState } from 'react'
import { Copy, Layers3, Plus, Trash2 } from 'lucide-react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { addLevel, deleteLevel, duplicateLevel, renameLevel, setLevelHeight } from '@renderer/store/levelActions'
import { NumberField } from './ui/NumberField'
import { formatNumber } from '@renderer/lib/format'

export function LevelBar(): React.JSX.Element {
  const levels = useEditorStore((s) => s.doc.levels)
  const activeId = useEditorStore((s) => s.activeLevelId)
  const setActive = useEditorStore((s) => s.setActiveLevel)
  const ghost = useSettingsStore((s) => s.ghostLevel)
  const toggle = useSettingsStore((s) => s.toggle)
  const [renaming, setRenaming] = useState<string | null>(null)
  const active = levels.find((l) => l.id === activeId) ?? levels[0]
  const idx = levels.indexOf(active)

  return (
    <div className="level-bar" role="toolbar" aria-label="Andares">
      <span className="level-bar__title">
        <Layers3 size={14} /> Andares
      </span>
      <div className="level-bar__tabs" role="tablist">
        {levels.map((l) =>
          renaming === l.id ? (
            <input
              key={l.id}
              className="text-input level-bar__rename"
              defaultValue={l.name}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                renameLevel(l.id, e.target.value)
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={l.id === activeId}
              className={`level-bar__tab${l.id === activeId ? ' is-active' : ''}`}
              data-tooltip={`Cota ${formatNumber(l.elevation / 100, 2)} m · clique duplo renomeia`}
              data-tooltip-pos="top"
              onClick={() => setActive(l.id)}
              onDoubleClick={() => setRenaming(l.id)}
            >
              {l.name}
            </button>
          )
        )}
        <button type="button" className="level-bar__add" aria-label="Novo andar" data-tooltip="Novo andar" data-tooltip-pos="top" onClick={() => addLevel()}>
          <Plus size={14} />
        </button>
      </div>
      <span className="level-bar__sep" />
      <label className="level-bar__height" data-tooltip="Altura de piso a piso" data-tooltip-pos="top">
        Pé-direito
        <NumberField value={active.height} min={200} max={600} suffix="cm" ariaLabel="Altura do andar" onCommit={(v) => setLevelHeight(active.id, v)} />
      </label>
      <button type="button" className="icon-btn icon-btn--sm" data-tooltip="Duplicar andar" data-tooltip-pos="top" onClick={() => duplicateLevel(active.id)}>
        <Copy size={15} />
      </button>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        data-tooltip="Excluir andar"
        data-tooltip-pos="top"
        disabled={levels.length <= 1}
        onClick={() => void deleteLevel(active.id)}
      >
        <Trash2 size={15} />
      </button>
      {idx > 0 && (
        <button
          type="button"
          className={`icon-btn icon-btn--sm${ghost ? ' is-on' : ''}`}
          aria-pressed={ghost}
          data-tooltip="Mostrar o andar de baixo esmaecido"
          data-tooltip-pos="top-left"
          onClick={() => toggle('ghostLevel')}
        >
          <Layers3 size={15} />
        </button>
      )}
    </div>
  )
}
