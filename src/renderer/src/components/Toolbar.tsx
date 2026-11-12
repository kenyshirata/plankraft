import { FileDown, FolderOpen, ImagePlus, Moon, Redo2, Save, Sparkles, Sun, Undo2 } from 'lucide-react'
import { useEditorStore, useIsDirty } from '@renderer/store/editorStore'
import { openProject, saveProject } from '@renderer/store/projectFile'
import { importBackgroundImage } from '@renderer/store/imageActions'
import { openExportPdfDialog } from './ExportPdfDialog'
import { openAiDialog } from './AiDialog'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useResolvedTheme } from '@renderer/theme'
import { TOOLS } from './tools'

/** Barra superior: marca, ferramentas, ações de arquivo/IA, desfazer/refazer e tema. */
export function Toolbar(): React.JSX.Element {
  const tool = useEditorStore((s) => s.tool)
  const setTool = useEditorStore((s) => s.setTool)
  const canUndo = useEditorStore((s) => s.past.length > 0)
  const canRedo = useEditorStore((s) => s.future.length > 0)
  const docName = useEditorStore((s) => s.doc.name)
  const dirty = useIsDirty()
  const viewMode = useEditorStore((s) => s.viewMode)
  const theme = useResolvedTheme()
  const setSetting = useSettingsStore((s) => s.set)


  return (
    <header className="toolbar">
      <div className="toolbar__brand">
        <div className="brand-mark" aria-hidden>
          P
        </div>
        <div className="brand-text">
          <span className="brand-name">PlanKraft</span>
          <span className="brand-doc" title={dirty ? `${docName} — alterações não salvas` : docName}>
            {docName}
            {dirty && <span className="dirty-dot" aria-label="alterações não salvas" />}
          </span>
        </div>
      </div>

      <nav className="toolbar__tools" aria-label="Ferramentas">
        {TOOLS.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              className={`icon-btn${tool === t.id ? ' is-active' : ''}`}
              aria-pressed={tool === t.id}
              aria-label={t.label}
              data-tooltip={t.available ? `${t.label} (${t.shortcut})` : `${t.label} — em breve`}
              disabled={!t.available}
              onClick={() => setTool(t.id)}
            >
              <Icon size={18} strokeWidth={1.75} />
            </button>
          )
        })}
      </nav>

      <div className="segmented view-switch" role="radiogroup" aria-label="Modo de visualização">
        {(
          [
            ['2d', '2D', 'Planta 2D (edição)'],
            ['3d', '3D', 'Maquete 3D'],
            ['split', '2D+3D', 'Lado a lado']
          ] as const
        ).map(([v, label, tip]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={viewMode === v}
            className={viewMode === v ? 'is-active' : ''}
            data-tooltip={tip}
            onClick={() => useEditorStore.getState().setViewMode(v)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="toolbar__actions">
        <button type="button" className="icon-btn" aria-label="Abrir" data-tooltip="Abrir projeto (Ctrl+O)" onClick={() => void openProject()}>
          <FolderOpen size={18} strokeWidth={1.75} />
        </button>
        <button type="button" className="icon-btn" aria-label="Salvar" data-tooltip="Salvar (Ctrl+S)" onClick={() => void saveProject()}>
          <Save size={18} strokeWidth={1.75} />
        </button>
        <span className="toolbar__sep" />
        <button
          type="button"
          className="icon-btn"
          aria-label="Desfazer"
          data-tooltip="Desfazer (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => useEditorStore.getState().undo()}
        >
          <Undo2 size={18} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refazer"
          data-tooltip="Refazer (Ctrl+Y)"
          disabled={!canRedo}
          onClick={() => useEditorStore.getState().redo()}
        >
          <Redo2 size={18} strokeWidth={1.75} />
        </button>
        <span className="toolbar__sep" />
        <button type="button" className="btn btn--ghost" data-tooltip="Importar imagem de fundo (Ctrl+I)" onClick={() => void importBackgroundImage()}>
          <ImagePlus size={16} strokeWidth={1.75} />
          <span>Imagem</span>
        </button>
        <button type="button" className="btn btn--ghost" data-tooltip="Exportar PDF (Ctrl+P)" onClick={openExportPdfDialog}>
          <FileDown size={16} strokeWidth={1.75} />
          <span>PDF</span>
        </button>
        <button type="button" className="btn btn--accent" data-tooltip="Gerar planta com IA" data-tooltip-pos="left" onClick={openAiDialog}>
          <Sparkles size={16} strokeWidth={1.75} />
          <span>Gerar com IA</span>
        </button>
        <span className="toolbar__sep" />
        <button
          type="button"
          className="icon-btn"
          aria-label="Alternar tema"
          data-tooltip={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          data-tooltip-pos="left"
          onClick={() => setSetting('theme', theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
        </button>
      </div>
    </header>
  )
}
