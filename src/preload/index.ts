/**
 * Preload: única ponte entre o renderer (sem Node) e o main.
 * Expõe uma API mínima e tipada em `window.api` via contextBridge.
 * Nunca expor ipcRenderer cru, fs, ou segredos (ex.: chave de API) aqui.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type MenuAction, type PlanKraftApi } from '../shared/ipc'

const api: PlanKraftApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.getAppInfo),

  onMenuAction: (listener) => {
    const handler = (_event: IpcRendererEvent, action: MenuAction): void => listener(action)
    ipcRenderer.on(IPC.menuAction, handler)
    return () => ipcRenderer.removeListener(IPC.menuAction, handler)
  },

  openProject: () => ipcRenderer.invoke(IPC.openProject),
  saveProject: (req) => ipcRenderer.invoke(IPC.saveProject, req),
  setDirty: (dirty) => ipcRenderer.send(IPC.setDirty, dirty === true),
  confirmClose: () => ipcRenderer.send(IPC.confirmClose),
  loadLibrary: () => ipcRenderer.invoke(IPC.loadLibrary),
  saveLibrary: (data) => ipcRenderer.invoke(IPC.saveLibrary, data),
  importImage: () => ipcRenderer.invoke(IPC.importImage),
  importModel: () => ipcRenderer.invoke(IPC.importModel),
  loadAssets: (projectPath, keys) => ipcRenderer.invoke(IPC.loadAssets, projectPath, keys),
  savePdf: (req) => ipcRenderer.invoke(IPC.savePdf, req),
  aiStatus: () => ipcRenderer.invoke(IPC.aiStatus),
  aiSetProvider: (provider) => ipcRenderer.invoke(IPC.aiSetProvider, provider),
  aiSetKey: (provider, key) => ipcRenderer.invoke(IPC.aiSetKey, provider, key),
  aiTest: (provider) => ipcRenderer.invoke(IPC.aiTest, provider),
  saveImage: (req) => ipcRenderer.invoke(IPC.saveImage, req),
  aiGenerate: (prompt) => ipcRenderer.invoke(IPC.aiGenerate, prompt),
  aiRecognize: (image) => ipcRenderer.invoke(IPC.aiRecognize, image),
  aiCancel: () => ipcRenderer.invoke(IPC.aiCancel)
}

contextBridge.exposeInMainWorld('api', api)
