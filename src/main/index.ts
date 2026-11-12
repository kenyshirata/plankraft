/**
 * Processo principal (main) do Electron.
 * Responsável por: ciclo de vida do app, janela, menu nativo, IPC e — nas
 * próximas etapas — acesso a disco (dialogs/fs), chave de API e chamadas de IA.
 */
import { app, BrowserWindow, shell } from 'electron'
import { createMainWindow, isAllowedNavigation } from './window'
import { registerIpcHandlers } from './ipc'
import { installAppMenu } from './menu'

// Garante uma única instância: um segundo duplo-clique apenas foca a janela existente.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  // Endurecimento de segurança para QUALQUER webContents criado.
  app.on('web-contents-created', (_event, contents) => {
    // Nunca abrir janelas novas dentro do app; links http(s) vão para o navegador padrão.
    contents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    // Bloqueia navegação para fora da origem do app.
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url)) event.preventDefault()
    })
    // Nunca anexar <webview>.
    contents.on('will-attach-webview', (event) => event.preventDefault())
  })

  app.whenReady().then(() => {
    registerIpcHandlers()
    installAppMenu()
    createMainWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
