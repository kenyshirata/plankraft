import { Armchair, Layers } from 'lucide-react'
import { useEditorStore } from '@renderer/store/editorStore'
import { LayersPanel } from './LayersPanel'
import { LibraryPanel } from './LibraryPanel'
import { Tabs } from './ui/Tabs'

type LeftTab = 'layers' | 'blocks'

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
          { value: 'blocks', label: 'Blocos', icon: Armchair }
        ]}
      />
      <div className="panel__body">{tab === 'layers' ? <LayersPanel /> : <LibraryPanel />}</div>
    </aside>
  )
}
