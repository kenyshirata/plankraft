/**
 * Cache das imagens de fundo carregadas (fora do documento: o documento guarda
 * só a chave do arquivo; os pixels ficam aqui, como HTMLImageElement).
 */
import { create } from 'zustand'

export type AssetStatus = 'ready' | 'missing'

interface AssetEntry {
  status: AssetStatus
  dataUrl?: string
  image?: HTMLImageElement
}

interface AssetState {
  assets: Record<string, AssetEntry>
  /** Registra o conteúdo de um asset (data URL); resolve quando a imagem decodificar. */
  put(key: string, dataUrl: string): Promise<HTMLImageElement>
  markMissing(key: string): void
}

export const useAssetStore = create<AssetState>()((set) => ({
  assets: {},
  put: (key, dataUrl) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        set((s) => ({ assets: { ...s.assets, [key]: { status: 'ready', dataUrl, image: img } } }))
        resolve(img)
      }
      img.onerror = () => {
        set((s) => ({ assets: { ...s.assets, [key]: { status: 'missing' } } }))
        reject(new Error('Não foi possível ler a imagem.'))
      }
      img.src = dataUrl
    }),
  markMissing: (key) => set((s) => ({ assets: { ...s.assets, [key]: { status: 'missing' } } }))
}))

/** Imagem pronta para o Konva (ou null enquanto carrega / se estiver ausente). */
export function useAssetImage(key: string): { image: HTMLImageElement | null; missing: boolean } {
  const entry = useAssetStore((s) => s.assets[key])
  return { image: entry?.image ?? null, missing: entry?.status === 'missing' }
}
