/**
 * Biblioteca pessoal de blocos (personalizados + favoritos).
 * Persistida no main (userData/block-library.json) via window.api; quando o
 * renderer roda fora do Electron (navegador), cai para localStorage.
 */
import { create } from 'zustand'
import { normalizeLibraryFile, type BlockDef, type BlockLibraryFile } from '@shared/blocks'
import type { PlanDocument } from '@shared/model'
import { BUILTIN_BY_ID } from '@renderer/blocks/builtin'
import { stairDefFromId } from '@shared/stairs'
import { toast } from './toastStore'

const LS_KEY = 'plankraft-block-library'

interface LibraryState {
  loaded: boolean
  blocks: BlockDef[]
  favorites: string[]
  load(): Promise<void>
  upsertBlock(def: BlockDef): void
  removeBlock(id: string): void
  toggleFavorite(id: string): void
}

async function readStorage(): Promise<BlockLibraryFile> {
  if (window.api) return window.api.loadLibrary()
  try {
    return normalizeLibraryFile(JSON.parse(localStorage.getItem(LS_KEY) ?? '{}'))
  } catch {
    return { version: 1, blocks: [], favorites: [] }
  }
}

let saveTimer: number | undefined
/** Grava com pequeno atraso para agrupar alterações seguidas. */
function scheduleSave(data: BlockLibraryFile): void {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    const done = window.api
      ? window.api.saveLibrary(data)
      : Promise.resolve(localStorage.setItem(LS_KEY, JSON.stringify(data)))
    done.catch((err: unknown) => toast.error(`Não foi possível salvar a biblioteca: ${err instanceof Error ? err.message : err}`))
  }, 250)
}

export const useLibraryStore = create<LibraryState>()((set, get) => {
  const persist = (): void => scheduleSave({ version: 1, blocks: get().blocks, favorites: get().favorites })
  return {
    loaded: false,
    blocks: [],
    favorites: [],
    load: async () => {
      try {
        const data = await readStorage()
        set({ loaded: true, blocks: data.blocks, favorites: data.favorites })
      } catch {
        set({ loaded: true })
      }
    },
    upsertBlock: (def) => {
      const exists = get().blocks.some((b) => b.id === def.id)
      set((s) => ({ blocks: exists ? s.blocks.map((b) => (b.id === def.id ? def : b)) : [...s.blocks, def] }))
      persist()
    },
    removeBlock: (id) => {
      set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id), favorites: s.favorites.filter((f) => f !== id) }))
      persist()
    },
    toggleFavorite: (id) => {
      set((s) => ({ favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [...s.favorites, id] }))
      persist()
    }
  }
})

/**
 * Resolve a definição de um bloco: fábrica → embutida no projeto → biblioteca pessoal.
 * (O projeto vem antes da biblioteca: o arquivo é a fonte da verdade do desenho.)
 */
export function resolveBlock(id: string, doc: PlanDocument): BlockDef | undefined {
  return BUILTIN_BY_ID.get(id) ?? stairDefFromId(id) ?? doc.blocks.find((b) => b.id === id) ?? useLibraryStore.getState().blocks.find((b) => b.id === id)
}

/** Garante que a definição de um bloco personalizado esteja embutida no documento. */
export function withEmbeddedBlock(doc: PlanDocument, def: BlockDef): PlanDocument {
  if (def.builtin || def.id.startsWith('builtin:')) return doc
  const current = doc.blocks.find((b) => b.id === def.id)
  if (current === def) return doc
  const blocks = current ? doc.blocks.map((b) => (b.id === def.id ? def : b)) : [...doc.blocks, def]
  return { ...doc, blocks }
}
