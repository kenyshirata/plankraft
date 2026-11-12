import { useEffect } from 'react'
import type { MenuAction } from '@shared/ipc'
import { useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useDialogStore } from '@renderer/store/dialogStore'
import { toast } from '@renderer/store/toastStore'
import { newProject, openProject, saveAndClose, saveProject } from '@renderer/store/projectFile'
import { TOOLS } from '@renderer/components/tools'
import { rotateSelectedBlocks } from '@renderer/store/blockActions'
import { importBackgroundImage, toggleBackgroundImages } from '@renderer/store/imageActions'
import { openExportPdfDialog } from '@renderer/components/ExportPdfDialog'
import { openAiDialog } from '@renderer/components/AiDialog'
import { openOnboarding } from '@renderer/components/Onboarding'

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

/** Executa uma ação vinda do menu nativo ou de um atalho. */
export function runAction(action: MenuAction): void {
  const editor = useEditorStore.getState()
  const settings = useSettingsStore.getState()
  switch (action) {
    case 'new-project':
      void newProject()
      break
    case 'open-project':
      void openProject()
      break
    case 'save-project':
      void saveProject(false)
      break
    case 'save-project-as':
      void saveProject(true)
      break
    case 'save-and-close':
      void saveAndClose()
      break
    case 'undo':
      editor.undo()
      break
    case 'redo':
      editor.redo()
      break
    case 'zoom-fit':
      editor.zoomToFit()
      break
    case 'toggle-grid':
      settings.toggle('showGrid')
      break
    case 'view-2d':
    case 'view-3d':
    case 'view-split':
      editor.setViewMode(action === 'view-2d' ? '2d' : action === 'view-3d' ? '3d' : 'split')
      break
    case 'ai-generate':
      openAiDialog()
      break
    case 'show-onboarding':
      openOnboarding()
      break
    case 'export-pdf':
      openExportPdfDialog()
      break
    case 'toggle-background':
      toggleBackgroundImages()
      break
    case 'import-image':
      void importBackgroundImage()
      break
    case 'toggle-dimensions':
      settings.toggle('showDimensions')
      toast.info(useSettingsStore.getState().showDimensions ? 'Cotas visíveis' : 'Cotas ocultas')
      break
    case 'toggle-theme': {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      settings.set('theme', dark ? 'light' : 'dark')
      break
    }
  }
}

/**
 * Atalhos globais de teclado do editor. Ignorados enquanto o foco está num
 * campo de texto. (Esc/Enter/Espaço/F do canvas ficam no próprio CanvasStage;
 * Ctrl+N/O/S ficam no menu nativo.)
 */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target) || useDialogStore.getState().current) return
      const editor = useEditorStore.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (mod) {
        if (key === 'z' && !e.shiftKey) runAction('undo')
        else if (key === 'y' || (key === 'z' && e.shiftKey)) runAction('redo')
        else if (key === 'a') editor.selectAll()
        else if (key === 'c' && e.shiftKey) runAction('toggle-dimensions')
        else if (key === 'c') editor.copySelection()
        else if (key === 'x') editor.cutSelection()
        else if (key === 'v') editor.paste()
        else if (key === 'd') editor.duplicateSelection()
        else if (key === '0') runAction('zoom-fit')
        else if (key === '=' || key === '+') editor.zoomBy(1.25)
        else if (key === '-') editor.zoomBy(1 / 1.25)
        else if (key === "'") runAction('toggle-grid')
        // Sem o menu nativo (ex.: renderer aberto no navegador), atende Ctrl+S/O aqui.
        else if (!window.api && key === 's') runAction(e.shiftKey ? 'save-project-as' : 'save-project')
        else if (!window.api && key === 'o') runAction('open-project')
        else if (key === 'b') runAction('toggle-background')
        // Ctrl+I vem do menu nativo no app; no navegador é tratado aqui.
        else if (!window.api && key === 'i') runAction('import-image')
        else if (!window.api && key === 'p') runAction('export-pdf')
        else return
        e.preventDefault()
        return
      }

      if (e.altKey) return

      // R: gira 90° os blocos selecionados (ou o bloco em inserção). Shift+R: -90°.
      if (key === 'r') {
        const deg = e.shiftKey ? -90 : 90
        if (editor.tool === 'block') editor.rotatePlacing(deg)
        else rotateSelectedBlocks(deg)
        e.preventDefault()
        return
      }

      if (key === 'delete' || key === 'backspace') {
        editor.deleteSelection()
        e.preventDefault()
        return
      }

      const tool = TOOLS.find((t) => t.shortcut.toLowerCase() === key)
      if (tool?.available) {
        editor.setTool(tool.id)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    // Ações do menu nativo (via preload).
    const off = window.api?.onMenuAction(runAction)
    return () => {
      window.removeEventListener('keydown', onKey)
      off?.()
    }
  }, [])
}
