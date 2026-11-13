/**
 * Gravação do PDF exportado: o renderer gera o arquivo (jsPDF, vetorial) e o
 * main mostra o diálogo "Salvar como" e grava em disco. Opcionalmente abre o
 * PDF no visualizador padrão do sistema (somente o arquivo recém-gravado).
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { IPC, type SaveImageRequest, type SavePdfRequest } from '../shared/ipc'
import { assertTrustedSender } from './security'

const MAX_PDF_BYTES = 200 * 1024 * 1024
const MAX_IMAGE_BYTES = 200 * 1024 * 1024

export function registerPdfIpc(): void {
  ipcMain.handle(IPC.saveImage, async (event, req: SaveImageRequest): Promise<{ filePath: string } | null> => {
    assertTrustedSender(event)
    const d = req?.data
    // PNG: assinatura de 8 bytes (89 50 4E 47 0D 0A 1A 0A).
    if (!(d instanceof Uint8Array) || d.byteLength > MAX_IMAGE_BYTES || d.byteLength < 8 || d[0] !== 0x89 || d[1] !== 0x50 || d[2] !== 0x4e || d[3] !== 0x47) {
      throw new Error('Dados de imagem inválidos.')
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      title: 'Salvar imagem',
      defaultPath: `${(req.suggestedName || 'Imagem 3D').replace(/[\\/:*?"<>|]/g, '_')}.png`,
      filters: [{ name: 'Imagem PNG', extensions: ['png'] }]
    }
    const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (result.canceled || !result.filePath) return null
    let filePath = result.filePath
    if (extname(filePath).toLowerCase() !== '.png') filePath += '.png'
    await fs.writeFile(filePath, d)
    return { filePath }
  })

  ipcMain.handle(IPC.savePdf, async (event, req: SavePdfRequest): Promise<{ filePath: string } | null> => {
    assertTrustedSender(event)
    if (!(req?.data instanceof Uint8Array) || req.data.byteLength > MAX_PDF_BYTES) throw new Error('Dados de PDF inválidos.')
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      title: 'Exportar PDF',
      defaultPath: `${(req.suggestedName || 'Planta').replace(/[\\/:*?"<>|]/g, '_')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const result = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (result.canceled || !result.filePath) return null
    let filePath = result.filePath
    if (extname(filePath).toLowerCase() !== '.pdf') filePath += '.pdf'
    await fs.writeFile(filePath, req.data)
    if (req.openAfter) void shell.openPath(filePath)
    return { filePath }
  })
}
