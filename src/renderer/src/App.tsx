import { lazy, Suspense, useEffect } from 'react'
import { CanvasStage } from './canvas/CanvasStage'
import { LeftPanel } from './components/LeftPanel'
import { RightPanel } from './components/RightPanel'
import { StatusBar } from './components/StatusBar'
import { ToastHost } from './components/ToastHost'
import { DialogHost } from './components/DialogHost'
import { BlockDialogHost } from './components/BlockDialog'
import { CalibrateDialogHost } from './components/CalibrateDialog'
import { ExportPdfDialogHost } from './components/ExportPdfDialog'
import { AiDialogHost } from './components/AiDialog'
import { OnboardingHost } from './components/Onboarding'
import { useLibraryStore } from './store/libraryStore'
import { Toolbar } from './components/Toolbar'
import { ToolOptionsBar } from './components/ToolOptionsBar'
import { useShortcuts } from './hooks/useShortcuts'
import { useResolvedTheme } from './theme'
import { useEditorStore, useIsDirty } from './store/editorStore'

/**
 * Layout base:
 *   ┌──────────────── Toolbar ────────────────┐
 *   │ Camadas/ │  Opções da ferramenta │ Prop./ │
 *   │ Blocos   │  Canvas               │ Config │
 *   └──────────────── Status ─────────────────┘
 */
// Vista 3D carregada sob demanda (three.js só entra quando o usuário abre o 3D).
const Viewer3D = lazy(() => import('./three/Viewer3D'))

export function App(): React.JSX.Element {
  const theme = useResolvedTheme()
  const viewMode = useEditorStore((s) => s.viewMode)
  useShortcuts()

  // Carrega a biblioteca pessoal de blocos (userData) no início.
  useEffect(() => {
    void useLibraryStore.getState().load()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // Título da janela + aviso ao main sobre alterações não salvas.
  const dirty = useIsDirty()
  const docName = useEditorStore((s) => s.doc.name)
  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${docName} — PlanKraft`
    window.api?.setDirty(dirty)
  }, [dirty, docName])

  return (
    <div className="app">
      <Toolbar />
      <LeftPanel />
      <main className={`workspace workspace--${viewMode}`}>
        {viewMode !== '3d' && <ToolOptionsBar />}
        <div className="workspace__views">
          {viewMode !== '3d' && <CanvasStage />}
          {viewMode !== '2d' && (
            <Suspense fallback={<div className="viewer3d viewer3d--loading">Carregando vista 3D…</div>}>
              <Viewer3D />
            </Suspense>
          )}
        </div>
      </main>
      <RightPanel />
      <StatusBar />
      <ToastHost />
      <DialogHost />
      <BlockDialogHost />
      <CalibrateDialogHost />
      <ExportPdfDialogHost />
      <AiDialogHost />
      <OnboardingHost />
    </div>
  )
}
