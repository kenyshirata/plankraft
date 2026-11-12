import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuAction } from '../shared/ipc'

/** Envia uma ação do menu para o renderer da janela em foco. */
function send(action: MenuAction): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(IPC.menuAction, action)
}

/**
 * Menu nativo. Atalhos de edição do canvas (Ctrl+Z, Delete, ferramentas...) são
 * tratados no renderer para não "roubar" teclas de campos de texto; aqui ficam
 * só itens de alto nível. Itens marcados como "em breve" serão ligados nas
 * próximas etapas (importar imagem, exportar PDF, IA, salvar/abrir).
 */
export function installAppMenu(): void {
  const isDev = !app.isPackaged

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Novo projeto', accelerator: 'CmdOrCtrl+N', click: () => send('new-project') },
        { label: 'Abrir…', accelerator: 'CmdOrCtrl+O', click: () => send('open-project') },
        { label: 'Salvar', accelerator: 'CmdOrCtrl+S', click: () => send('save-project') },
        { label: 'Salvar como…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-project-as') },
        { type: 'separator' },
        { label: 'Importar imagem de fundo…', accelerator: 'CmdOrCtrl+I', click: () => send('import-image') },
        { label: 'Exportar PDF…', accelerator: 'CmdOrCtrl+P', click: () => send('export-pdf') },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' }
      ]
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Planta 2D', click: () => send('view-2d') },
        { label: 'Maquete 3D', click: () => send('view-3d') },
        { label: '2D e 3D lado a lado', click: () => send('view-split') },
        { type: 'separator' },
        { label: 'Ajustar à tela', click: () => send('zoom-fit') },
        { label: 'Mostrar/ocultar grade', click: () => send('toggle-grid') },
        {
          label: 'Mostrar/ocultar cotas',
          accelerator: 'CmdOrCtrl+Shift+C',
          // O atalho é tratado no renderer (para não disparar duas vezes); aqui só é exibido.
          registerAccelerator: false,
          click: () => send('toggle-dimensions')
        },
        {
          label: 'Mostrar/ocultar imagem de fundo',
          accelerator: 'CmdOrCtrl+B',
          registerAccelerator: false,
          click: () => send('toggle-background')
        },
        { label: 'Alternar tema claro/escuro', click: () => send('toggle-theme') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
        ...(isDev
          ? ([
              { type: 'separator' },
              { role: 'reload', label: 'Recarregar' },
              { role: 'toggleDevTools', label: 'Ferramentas do desenvolvedor' }
            ] as MenuItemConstructorOptions[])
          : [])
      ]
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: 'Tour de boas-vindas', click: () => send('show-onboarding') },
        { type: 'separator' },
        {
          label: 'Sobre o PlanKraft',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            const opts = {
              type: 'info' as const,
              title: 'Sobre',
              message: `PlanKraft ${app.getVersion()}`,
              detail: `Editor de plantas baixas.\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}`
            }
            void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
