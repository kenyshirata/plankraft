import { BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { guardUnsavedChanges } from './project'

/** URL do servidor Vite em desenvolvimento (injetada pelo electron-vite). */
const devServerUrl = process.env['ELECTRON_RENDERER_URL']

const rendererIndex = join(__dirname, '../renderer/index.html')

/** Verdadeiro se a URL pertence ao próprio renderer do app (dev server ou index.html empacotado). */
export function isAllowedNavigation(url: string): boolean {
  if (devServerUrl) return url.startsWith(devServerUrl)
  const withoutHashOrQuery = url.split(/[?#]/)[0]
  return withoutHashOrQuery === pathToFileURL(rendererIndex).toString()
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    center: true,
    show: false, // exibida em 'ready-to-show' para evitar "flash" branco
    title: 'PlanKraft',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16171a' : '#f4f5f7',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // --- Segurança (não alterar sem revisão) ---
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win.show())
  guardUnsavedChanges(win)

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(rendererIndex)
  }

  return win
}
