/**
 * Biblioteca pessoal de blocos, persistida em JSON no diretório de dados do app
 * (app.getPath('userData')/block-library.json). Gravação atômica + validação.
 * Usamos fs direto (em vez de electron-store) para não depender de pacote ESM
 * no main e manter o formato legível/portável.
 */
import { app, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { normalizeLibraryFile, type BlockLibraryFile } from '../shared/blocks'
import { IPC } from '../shared/ipc'
import { assertTrustedSender } from './security'

const MAX_BYTES = 10 * 1024 * 1024
const libraryPath = (): string => join(app.getPath('userData'), 'block-library.json')

async function readLibrary(): Promise<BlockLibraryFile> {
  try {
    const text = await fs.readFile(libraryPath(), 'utf-8')
    return normalizeLibraryFile(JSON.parse(text))
  } catch {
    return { version: 1, blocks: [], favorites: [] } // primeira execução ou arquivo corrompido
  }
}

async function writeLibrary(data: BlockLibraryFile): Promise<void> {
  const text = JSON.stringify(normalizeLibraryFile(data), null, 2)
  if (text.length > MAX_BYTES) throw new Error('A biblioteca de blocos ficou grande demais.')
  const target = libraryPath()
  const tmp = `${target}.tmp-${process.pid}`
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(tmp, text, 'utf-8')
  await fs.rename(tmp, target)
}

export function registerLibraryIpc(): void {
  ipcMain.handle(IPC.loadLibrary, async (event) => {
    assertTrustedSender(event)
    return readLibrary()
  })
  ipcMain.handle(IPC.saveLibrary, async (event, data: unknown) => {
    assertTrustedSender(event)
    await writeLibrary(normalizeLibraryFile(data))
    return true
  })
}
