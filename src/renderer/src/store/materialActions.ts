/** Aplicação de materiais (acabamentos) à seleção. */
import { materialAppliesTo, resolveMaterial } from '@shared/materials'
import { useEditorStore } from './editorStore'
import { mapObjects } from './docOps'
import { toast } from './toastStore'

/**
 * Aplica o material aos cômodos (piso) e paredes selecionados, respeitando o
 * escopo do material. `null` remove o acabamento. Devolve quantos objetos mudaram.
 */
export function applyMaterial(materialId: string | null): number {
  const ed = useEditorStore.getState()
  const def = materialId ? resolveMaterial(materialId) : undefined
  if (materialId && !def) return 0
  const sel = new Set(ed.selectedIds)
  const targets = ed.doc.objects.filter((o) => {
    if (!sel.has(o.id)) return false
    if (o.type === 'room') return !def || materialAppliesTo(def, 'floor')
    if (o.type === 'wall') return !def || materialAppliesTo(def, 'wall')
    return false
  })
  if (!targets.length) {
    toast.info(
      def
        ? `Selecione ${def.scope === 'floor' ? 'cômodos' : def.scope === 'wall' ? 'paredes' : 'cômodos ou paredes'} para aplicar “${def.name}”.`
        : 'Selecione cômodos ou paredes.'
    )
    return 0
  }
  ed.commit((d) =>
    mapObjects(
      d,
      targets.map((t) => t.id),
      (o) => {
        if (o.type !== 'room' && o.type !== 'wall') return o
        if ((o.material ?? null) === materialId) return o
        const { material: _old, ...rest } = o
        void _old
        return (materialId ? { ...rest, material: materialId } : rest) as typeof o
      }
    )
  )
  return targets.length
}
