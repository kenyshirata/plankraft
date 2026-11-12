/**
 * Imagens de fundo (assets) — só no processo main.
 *
 *  - Importar: diálogo nativo (PNG/JPG), lê o arquivo e devolve um data URL ao
 *    renderer. O arquivo de origem fica "em espera" (staging) até o projeto ser salvo.
 *  - Salvar: copia os assets usados para `<pasta do projeto>/assets/<chave>`.
 *  - Abrir: lê `<pasta do projeto>/assets/<chave>`; ausentes voltam como null
 *    (o renderer mostra um aviso amigável).
 *
 * Segurança: chaves validadas por regex (sem "../"), leitura só a partir de
 * projetos aprovados por diálogo nesta sessão, tamanho máximo por imagem.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { IPC, type AssetData, type ImportedImage } from '../shared/ipc'
import { assertTrustedSender } from './security'

const MAX_IMAGE_BYTES = 40 * 1024 * 1024
const KEY_RE = /^[a-zA-Z0-9-]{8,64}\.(png|jpg|jpeg)$/
const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

/** chave do asset → caminho absoluto de onde copiá-lo no próximo salvamento. */
const staging = new Map<string, string>()

export const isValidAssetKey = (key: unknown): key is string => typeof key === 'string' && KEY_RE.test(key)
const assetsDir = (projectPath: string): string => join(dirname(projectPath), 'assets')

async function toDataUrl(path: string): Promise<string> {
  const stat = await fs.stat(path)
  if (stat.size > MAX_IMAGE_BYTES) throw new Error('Imagem grande demais (máximo 40 MB).')
  const mime = MIME[extname(path).toLowerCase()]
  if (!mime) throw new Error('Formato não suportado (use PNG ou JPG).')
  const buf = await fs.readFile(path)
  return `data:${mime};base64,${buf.toString('base64')}`
}

/** Copia os assets usados para a pasta `assets/` ao lado do projeto. Retorna as chaves que não puderam ser copiadas. */
export async function copyAssetsForProject(projectPath: string, keys: unknown): Promise<string[]> {
  const list = Array.isArray(keys) ? keys.filter(isValidAssetKey) : []
  if (!list.length) return []
  const dir = assetsDir(projectPath)
  await fs.mkdir(dir, { recursive: true })
  const missing: string[] = []
  for (const key of list) {
    const dest = join(dir, key)
    const src = staging.get(key)
    try {
      if (src && src !== dest) await fs.copyFile(src, dest)
      else await fs.access(dest) // já está na pasta do projeto
      staging.set(key, dest)
    } catch {
      missing.push(key)
    }
  }
  return missing
}

export function registerAssetIpc(isApprovedProject: (path: string) => boolean): void {
  ipcMain.handle(IPC.importImage, async (event): Promise<ImportedImage | null> => {
    assertTrustedSender(event)
    const win = BrowserWindow.fromWebContents(event.sender)
    const opts = {
      title: 'Importar imagem de fundo',
      filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg'] }],
      properties: ['openFile' as const]
    }
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (result.canceled || !result.filePaths[0]) return null
    const path = result.filePaths[0]
    const ext = extname(path).toLowerCase().replace('.jpeg', '.jpg')
    const dataUrl = await toDataUrl(path)
    const key = `${randomUUID()}${ext}`
    staging.set(key, path)
    return { key, name: basename(path), dataUrl }
  })

  ipcMain.handle(IPC.loadAssets, async (event, projectPath: unknown, keys: unknown): Promise<AssetData[]> => {
    assertTrustedSender(event)
    if (typeof projectPath !== 'string' || !isApprovedProject(projectPath)) throw new Error('Projeto não autorizado.')
    const list = Array.isArray(keys) ? keys.filter(isValidAssetKey).slice(0, 200) : []
    return Promise.all(
      list.map(async (key) => {
        const path = join(assetsDir(projectPath), key)
        try {
          const dataUrl = await toDataUrl(path)
          staging.set(key, path)
          return { key, dataUrl }
        } catch {
          return { key, dataUrl: null }
        }
      })
    )
  })
}
