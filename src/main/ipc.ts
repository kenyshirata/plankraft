import { app, ipcMain } from 'electron'
import { IPC, type AppInfo } from '../shared/ipc'
import { registerProjectIpc } from './project'
import { registerLibraryIpc } from './library'
import { registerPdfIpc } from './pdf'
import { registerAiIpc } from './ai'
import { assertTrustedSender } from './security'

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.getAppInfo, (event): AppInfo => {
    assertTrustedSender(event)
    return {
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform
    }
  })

  registerProjectIpc()
  registerLibraryIpc()
  registerPdfIpc()
  registerAiIpc()
}
