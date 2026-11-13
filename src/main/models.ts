/**
 * Importação de modelos 3D (.glb) para blocos — só no processo main.
 * Diálogo nativo, validação do cabeçalho glTF 2.0 e limite de tamanho; o
 * conteúdo volta ao renderer em base64 (que o embute no bloco).
 */
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, extname } from 'node:path'
import { MAX_MODEL_BYTES } from '../shared/blocks'
import { IPC, type ImportedModel } from '../shared/ipc'
import { assertTrustedSender } from './security'

export function registerModelIpc(): void {
  ipcMain.handle(IPC.importModel, async (event): Promise<ImportedModel | null> => {
    assertTrustedSender(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      title: 'Importar modelo 3D',
      filters: [{ name: 'Modelo 3D (glTF binário)', extensions: ['glb'] }],
      properties: ['openFile' as const]
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    if (extname(path).toLowerCase() !== '.glb') throw new Error('Use um arquivo .glb (glTF binário).')
    const stat = await fs.stat(path)
    if (stat.size > MAX_MODEL_BYTES) {
      throw new Error(`Modelo grande demais (${(stat.size / 1048576).toFixed(1)} MB). O máximo é ${MAX_MODEL_BYTES / 1048576} MB — simplifique ou comprima o modelo.`)
    }
    const buf = await fs.readFile(path)
    // Cabeçalho GLB: "glTF" (0x46546C67) + versão 2.
    if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67 || buf.readUInt32LE(4) !== 2) {
      throw new Error('O arquivo não é um .glb válido (glTF 2.0).')
    }
    return { name: basename(path, extname(path)).slice(0, 60), data: buf.toString('base64') }
  })
}
