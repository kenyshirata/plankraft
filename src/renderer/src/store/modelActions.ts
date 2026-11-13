/** Importação de modelos 3D (.glb) como blocos da biblioteca pessoal. */
import type { BlockDef, BlockShape } from '@shared/blocks'
import { newId } from '@shared/model'
import { parseGlb } from '@renderer/three/models'
import { useEditorStore } from './editorStore'
import { useLibraryStore } from './libraryStore'
import { toast } from './toastStore'

export const MODEL_CATEGORY = 'Modelos 3D'

/** Símbolo 2D da planta do modelo: retângulo da pegada com diagonais e o texto "3D". */
function footprintShapes(w: number, d: number): BlockShape[] {
  return [
    { kind: 'rect', x: 0, y: 0, w, h: d, r: 2, fill: 'fill' },
    { kind: 'poly', points: [0, 0, w, d], fill: 'none', weight: 0.4 },
    { kind: 'poly', points: [w, 0, 0, d], fill: 'none', weight: 0.4 },
    { kind: 'text', x: w / 2, y: Math.max(0, d / 2 - Math.min(w, d) * 0.12), text: '3D', size: Math.max(6, Math.min(w, d) * 0.24), align: 'center', fill: 'ink' }
  ]
}

/** Escolhe um .glb, cria o bloco na biblioteca e entra no modo de inserção. */
export async function importModelBlock(): Promise<void> {
  if (!window.api) {
    toast.warning('A importação de modelos 3D só funciona no aplicativo.')
    return
  }
  try {
    const file = await window.api.importModel()
    if (!file) return
    const loaded = await parseGlb(file.data)
    const { x, y, z } = loaded.size
    // Pegada em cm. Modelos em unidades estranhas (muito pequenos ou enormes) são normalizados para ~1 m.
    let w = x * 100
    let d = z * 100
    const biggest = Math.max(w, d)
    if (biggest < 5 || biggest > 2000) {
      const k = 100 / biggest
      w *= k
      d *= k
      toast.info('O tamanho do modelo parecia fora de escala; ele entrou com ~1 m. Ajuste a largura nas propriedades.')
    }
    w = Math.round(w * 10) / 10
    d = Math.round(d * 10) / 10
    const def: BlockDef = {
      id: newId(),
      name: file.name || 'Modelo 3D',
      category: MODEL_CATEGORY,
      width: w,
      height: d,
      shapes: footprintShapes(w, d),
      model: { data: file.data, size: [x, y, z] },
      updatedAt: new Date().toISOString()
    }
    useLibraryStore.getState().upsertBlock(def)
    const ed = useEditorStore.getState()
    ed.setLeftTab('blocks')
    ed.setPlacing(def.id)
    toast.success(`“${def.name}” adicionado à biblioteca. Clique no desenho para inserir.`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Não foi possível importar o modelo.'
    // O Electron prefixa erros do main com "Error invoking remote method…": mostra só a mensagem útil.
    toast.error(msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
  }
}
