/**
 * Aba Materiais: amostras de tintas, pisos e revestimentos. Clique numa
 * amostra para aplicá-la aos cômodos (piso) e paredes selecionados.
 */
import { useMemo } from 'react'
import { Ban } from 'lucide-react'
import { customColorId, MATERIALS, MATERIAL_GROUPS, type MaterialDef } from '@shared/materials'
import { useEditorStore } from '@renderer/store/editorStore'
import { applyMaterial } from '@renderer/store/materialActions'
import { materialThumb } from '@renderer/lib/textures'

const SCOPE_LABEL = { floor: 'piso', wall: 'parede', both: 'piso e parede' } as const

export function MaterialSwatch({ def, active, onClick }: { def: MaterialDef; active?: boolean; onClick?: () => void }): React.JSX.Element {
  const thumb = materialThumb(def.id)
  return (
    <button
      type="button"
      className={`mat-swatch${active ? ' is-active' : ''}`}
      style={thumb ? { backgroundImage: `url(${thumb})` } : { background: def.color }}
      data-tooltip={`${def.name} · ${SCOPE_LABEL[def.scope]}`}
      aria-label={def.name}
      onClick={onClick}
    />
  )
}

export function MaterialsPanel(): React.JSX.Element {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const objects = useEditorStore((s) => s.doc.objects)

  // Materiais em uso na seleção (para marcar a amostra ativa).
  const current = useMemo(() => {
    const sel = new Set(selectedIds)
    const used = new Set<string | undefined>()
    let n = 0
    for (const o of objects) {
      if (sel.has(o.id) && (o.type === 'room' || o.type === 'wall')) {
        used.add(o.material)
        n++
      }
    }
    return { n, id: used.size === 1 ? [...used][0] : undefined }
  }, [selectedIds, objects])

  return (
    <div className="materials">
      <p className="library__hint">
        {current.n > 0
          ? `${current.n} ${current.n === 1 ? 'item selecionado' : 'itens selecionados'} — clique numa amostra para aplicar.`
          : 'Selecione cômodos (piso) ou paredes e clique numa amostra.'}
      </p>
      <div className="materials__actions">
        <label className="btn btn--sm materials__custom" data-tooltip="Cor personalizada">
          <input
            type="color"
            defaultValue="#d9c7a5"
            aria-label="Cor personalizada"
            onChange={(e) => applyMaterial(customColorId(e.target.value))}
          />
          Cor livre
        </label>
        <button type="button" className="btn btn--sm" disabled={current.n === 0} onClick={() => applyMaterial(null)}>
          <Ban size={13} /> Remover
        </button>
      </div>
      {MATERIAL_GROUPS.map((g) => (
        <section key={g} className="materials__group">
          <h4>{g}</h4>
          <div className="materials__grid">
            {MATERIALS.filter((m) => m.group === g).map((m) => (
              <MaterialSwatch key={m.id} def={m} active={current.id === m.id} onClick={() => applyMaterial(m.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
