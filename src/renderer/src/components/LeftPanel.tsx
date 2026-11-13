import { Armchair, Layers, Paintbrush } from 'lucide-react'
import { useEditorStore } from '@renderer/store/editorStore'
import { LayersPanel } from './LayersPanel'
import { LibraryPanel } from './LibraryPanel'
import { MaterialsPanel } from './MaterialsPanel'
import { Tabs } from './ui/Tabs'

type LeftTab = 'layers' | 'blocks' | 'materials'

/** Painel esquerdo: Camadas e Biblioteca de Blocos (abas). */
export function LeftPanel(): React.JSX.Element {
  const tab = useEditorStore((s) => s.leftTab)
  const setTab = useEditorStore((s) => s.setLeftTab)
  return (
    <aside className="panel panel--left">
      <Tabs<LeftTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'layers', label: 'Camadas', icon: Layers },
          { value: 'blocks', label: 'Blocos', icon: Armchair },
          { value: 'materials', label: 'Materiais', icon: Paintbrush }
        ]}
      />
      <div className="panel__body">{tab === 'layers' ? <LayersPanel /> : tab === 'blocks' ? <LibraryPanel /> : <MaterialsPanel />}</div>
    </aside>
  )
}
