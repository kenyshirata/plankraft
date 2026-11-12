/**
 * Abrir/salvar projetos (.plankraft) — só no processo main.
 *
 * Segurança: o renderer nunca escolhe livremente onde gravar. Ele só pode
 * salvar num caminho que veio de um diálogo nativo desta sessão (abrir ou
 * salvar como). Caso contrário, o diálogo "Salvar como" é exibido.
 *
 * Estrutura em disco (preparada para a etapa de imagem de fundo):
 *   MeuProjeto.plankraft   ← JSON
 *   assets/                ← imagens referenciadas pelo projeto
 */
import { BrowserWindow, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, extname } from 'node:path'
import { IPC, type OpenProjectResult, type SaveProjectRequest, type SaveProjectResult } from '../shared/ipc'
import { PROJECT_EXTENSION } from '../shared/model'
import { assertTrustedSender } from './security'
import { copyAssetsForProject, registerAssetIpc } from './assets'

const FILTERS = [{ name: 'Projeto PlanKraft', extensions: [PROJECT_EXTENSION] }]
const MAX_FILE_BYTES = 50 * 1024 * 1024

/** Caminhos aprovados pelo usuário via diálogo nesta sessão. */
const approvedPaths = new Set<string>()

/** Estado "alterações não salvas" por janela (para confirmar ao fechar). */
const dirtyWindows = new WeakMap<BrowserWindow, boolean>()

const projectName = (filePath: string): string => basename(filePath, extname(filePath))

async function writeAtomic(filePath: string, data: string): Promise<void> {
  const tmp = `${filePath}.tmp-${process.pid}`
  await fs.writeFile(tmp, data, 'utf-8')
  await fs.rename(tmp, filePath)
}

export async function openProjectFile(filePath: string): Promise<OpenProjectResult> {
  const stat = await fs.stat(filePath)
  if (stat.size > MAX_FILE_BYTES) throw new Error('Arquivo grande demais para ser um projeto PlanKraft.')
  const text = await fs.readFile(filePath, 'utf-8')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('O arquivo está corrompido ou não é um projeto PlanKraft.')
  }
  approvedPaths.add(filePath)
  return { filePath, name: projectName(filePath), data }
}

export function registerProjectIpc(): void {
  registerAssetIpc((path) => approvedPaths.has(path))

  ipcMain.handle(IPC.openProject, async (event: IpcMainInvokeEvent): Promise<OpenProjectResult | null> => {
    assertTrustedSender(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = { title: 'Abrir projeto', filters: FILTERS, properties: ['openFile' as const] }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || result.filePaths.length === 0) return null
    return openProjectFile(result.filePaths[0])
  })

  ipcMain.handle(
    IPC.saveProject,
    async (event: IpcMainInvokeEvent, req: SaveProjectRequest): Promise<SaveProjectResult | null> => {
      assertTrustedSender(event)
      if (typeof req?.data !== 'string') throw new Error('Dados inválidos para salvar.')
      let filePath = req.filePath && approvedPaths.has(req.filePath) && !req.saveAs ? req.filePath : null

      if (!filePath) {
        const win = BrowserWindow.fromWebContents(event.sender)
        const opts = {
          title: 'Salvar projeto',
          defaultPath: `${(req.suggestedName || 'Projeto').replace(/[\\/:*?"<>|]/g, '_')}.${PROJECT_EXTENSION}`,
          filters: FILTERS
        }
        const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
        if (result.canceled || !result.filePath) return null
        filePath = result.filePath
        if (extname(filePath).toLowerCase() !== `.${PROJECT_EXTENSION}`) filePath += `.${PROJECT_EXTENSION}`
        approvedPaths.add(filePath)
      }

      await writeAtomic(filePath, req.data)
      const missingAssets = await copyAssetsForProject(filePath, req.assets)
      return { filePath, name: projectName(filePath), missingAssets }
    }
  )

  const trusted = (event: IpcMainEvent): boolean => {
    try {
      assertTrustedSender(event)
      return true
    } catch {
      return false
    }
  }

  ipcMain.on(IPC.setDirty, (event, dirty: unknown) => {
    if (!trusted(event)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) dirtyWindows.set(win, dirty === true)
  })

  ipcMain.on(IPC.confirmClose, (event) => {
    if (!trusted(event)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    dirtyWindows.set(win, false)
    win.close()
  })
}

/**
 * Ao fechar com alterações pendentes: Salvar / Não salvar / Cancelar.
 * "Salvar" pede ao renderer para salvar e, se der certo, ele confirma o fechamento.
 */
export function guardUnsavedChanges(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (!dirtyWindows.get(win)) return
    event.preventDefault()
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: 'Alterações não salvas',
      message: 'Deseja salvar as alterações antes de sair?',
      detail: 'Se não salvar, as alterações feitas desde o último salvamento serão perdidas.',
      buttons: ['Salvar', 'Não salvar', 'Cancelar'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    if (choice === 0) win.webContents.send(IPC.menuAction, 'save-and-close')
    else if (choice === 1) {
      dirtyWindows.set(win, false)
      win.close()
    }
  })
}
