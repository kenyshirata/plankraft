/**
 * Fluxos de arquivo do renderer: novo, abrir, salvar, salvar como.
 * A leitura/gravação em disco acontece no main (window.api); aqui ficam a
 * serialização, a validação e as confirmações de "alterações não salvas".
 */
import { parseProject, serializeProject } from '@shared/serialize'
import { askDialog } from './dialogStore'
import { imagesOf, loadProjectAssets } from './imageActions'
import { useEditorStore } from './editorStore'
import { toast } from './toastStore'

const isDirty = (): boolean => {
  const s = useEditorStore.getState()
  return s.doc !== s.savedDoc
}

/** Pergunta antes de descartar alterações pendentes: Salvar / Descartar / Cancelar. */
async function confirmDiscard(): Promise<boolean> {
  if (!isDirty()) return true
  const choice = await askDialog({
    title: 'Alterações não salvas',
    message: 'O projeto atual tem alterações que ainda não foram salvas.',
    actions: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Descartar', value: 'discard', variant: 'danger' },
      { label: 'Salvar', value: 'save', variant: 'primary' }
    ]
  })
  if (choice === 'save') return saveProject()
  return choice === 'discard'
}

function apiAvailable(): boolean {
  if (window.api) return true
  toast.warning('Abrir e salvar arquivos só funciona no aplicativo desktop.')
  return false
}

export async function newProject(): Promise<void> {
  if (await confirmDiscard()) useEditorStore.getState().newDocument()
}

export async function openProject(): Promise<void> {
  if (!apiAvailable() || !(await confirmDiscard())) return
  try {
    const result = await window.api.openProject()
    if (!result) return
    const doc = parseProject(result.data, result.name)
    useEditorStore.getState().loadDocument({ ...doc, name: result.name }, result.filePath)
    toast.success(`“${result.name}” aberto.`)
    await loadProjectAssets(result.filePath, doc)
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Não foi possível abrir o arquivo.')
  }
}

/** Salva o projeto. Retorna true se gravou (false = cancelado ou erro). */
export async function saveProject(saveAs = false): Promise<boolean> {
  if (!apiAvailable()) return false
  const { doc, filePath, markSaved } = useEditorStore.getState()
  try {
    const result = await window.api.saveProject({
      filePath,
      saveAs,
      suggestedName: doc.name,
      data: serializeProject(doc),
      assets: [...new Set(imagesOf(doc).map((i) => i.asset))]
    })
    if (!result) return false
    if (result.missingAssets.length) {
      toast.warning(`${result.missingAssets.length} imagem(ns) de fundo não puderam ser copiadas para a pasta “assets”.`)
    }
    // Só marca como salvo se o documento não mudou durante a gravação.
    if (useEditorStore.getState().doc === doc) markSaved(result.filePath, result.name)
    else useEditorStore.setState({ filePath: result.filePath })
    toast.success(`Projeto salvo em “${result.name}”.`)
    return true
  } catch (err) {
    toast.error(err instanceof Error ? `Erro ao salvar: ${err.message}` : 'Não foi possível salvar.')
    return false
  }
}

/** Fluxo "Salvar e sair" iniciado pelo main ao fechar a janela. */
export async function saveAndClose(): Promise<void> {
  if (await saveProject()) window.api?.confirmClose()
}
