/**
 * Gravação do PDF exportado: o renderer gera o arquivo (jsPDF, vetorial) e o
 * main mostra o diálogo "Salvar como" e grava em disco. Opcionalmente abre o
 * PDF no visualizador padrão do sistema (somente o arquivo recém-gravado).
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { IPC, type SavePdfRequest } from '../shared/ipc'
import { assertTrustedSender } from './security'

const MAX_PDF_BYTES = 200 * 1024 * 1024

export function registerPdfIpc(): void {
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
