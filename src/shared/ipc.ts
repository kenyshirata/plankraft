/**
 * Contrato de IPC entre main ↔ preload ↔ renderer.
 * Os nomes de canal ficam centralizados aqui para evitar strings soltas.
 * O renderer só enxerga a interface `PlanKraftApi` (exposta em window.api).
 */

import type { BlockLibraryFile } from './blocks'
import type { AiPlanResponseT } from './aiPlan'
import type { AiRecognitionT } from './aiRecognize'

export const IPC = {
  getAppInfo: 'app:get-info',
  menuAction: 'menu:action',
  openProject: 'project:open',
  saveProject: 'project:save',
  setDirty: 'app:set-dirty',
  confirmClose: 'app:confirm-close',
  loadLibrary: 'library:load',
  saveLibrary: 'library:save',
  importImage: 'image:import',
  importModel: 'model:import',
  loadAssets: 'assets:load',
  savePdf: 'pdf:save',
  saveImage: 'image:save',
  aiStatus: 'ai:status',
  aiSetProvider: 'ai:set-provider',
  aiSetKey: 'ai:set-key',
  aiTest: 'ai:test',
  aiGenerate: 'ai:generate',
  aiRecognize: 'ai:recognize',
  aiCancel: 'ai:cancel'
} as const

/** Ações disparadas pelo menu nativo (ou pelo main) e encaminhadas ao renderer. */
export type MenuAction =
  | 'new-project'
  | 'open-project'
  | 'save-project'
  | 'save-project-as'
  | 'save-and-close'
  | 'undo'
  | 'redo'
  | 'zoom-fit'
  | 'toggle-theme'
  | 'toggle-grid'
  | 'toggle-dimensions'
  | 'toggle-background'
  | 'import-image'
  | 'export-pdf'
  | 'ai-generate'
  | 'show-onboarding'
  | 'view-2d'
  | 'view-3d'
  | 'view-split'

export interface AppInfo {
  name: string
  version: string
  electron: string
  platform: string
}

export interface OpenProjectResult {
  filePath: string
  /** Nome do arquivo sem extensão. */
  name: string
  /** Conteúdo JSON já parseado (validado/normalizado no renderer). */
  data: unknown
}

export interface SaveProjectRequest {
  /** Caminho atual (só é usado se veio de um diálogo nesta sessão). */
  filePath: string | null
  /** Força o diálogo "Salvar como". */
  saveAs: boolean
  suggestedName: string
  /** Chaves dos assets (imagens) usados — copiados para <pasta do projeto>/assets. */
  assets: string[]
  /** JSON serializado. */
  data: string
}

export interface SaveProjectResult {
  filePath: string
  name: string
  /** Assets que não puderam ser copiados (arquivo de origem sumiu). */
  missingAssets: string[]
}

export interface ImportedImage {
  /** Nome do arquivo em assets/ (gerado). */
  key: string
  /** Nome original. */
  name: string
  dataUrl: string
}

/** Modelo 3D escolhido pelo usuário (.glb), já validado no main. */
export interface ImportedModel {
  /** Nome do arquivo sem extensão. */
  name: string
  /** Conteúdo em base64. */
  data: string
}

/** 'offline' = gerador procedural local: sem IA, sem chave, sem internet e sem custo. */
export type AiProvider = 'offline' | 'anthropic' | 'openai'

export interface AiStatus {
  provider: AiProvider
  /** Há chave salva (criptografada) para cada provedor. */
  configured: Record<AiProvider, boolean>
  /** Últimos 4 caracteres de cada chave (nunca a chave inteira). */
  hints: Partial<Record<AiProvider, string>>
  models: Record<AiProvider, string>
  encryptionAvailable: boolean
}

export interface AiTestResult {
  ok: boolean
  message: string
}

export type AiGenerateResult =
  | { ok: true; plan: AiPlanResponseT; provider: AiProvider; model: string }
  | { ok: false; error: string; needsKey?: boolean }

/** Imagem da planta enviada para reconhecimento (já reduzida pelo renderer). */
export interface RecognizeImage {
  mediaType: 'image/jpeg' | 'image/png'
  /** Base64 sem o prefixo data:. */
  data: string
  width: number
  height: number
}

export type AiRecognizeResult =
  | { ok: true; recognition: AiRecognitionT; provider: AiProvider; model: string }
  | { ok: false; error: string; needsKey?: boolean }

export interface SaveImageRequest {
  suggestedName: string
  /** Bytes do PNG. */
  data: Uint8Array
}

export interface SavePdfRequest {
  suggestedName: string
  /** Bytes do PDF. */
  data: Uint8Array
  /** Abrir no visualizador padrão após salvar. */
  openAfter: boolean
}

export interface AssetData {
  key: string
  /** null = arquivo não encontrado. */
  dataUrl: string | null
}

export interface PlanKraftApi {
  getAppInfo(): Promise<AppInfo>
  /** Registra um listener para ações do menu. Retorna a função de cancelamento. */
  onMenuAction(listener: (action: MenuAction) => void): () => void
  /** Abre o diálogo nativo e lê o projeto. null = cancelado. */
  openProject(): Promise<OpenProjectResult | null>
  /** Salva (exibe "Salvar como" se necessário). null = cancelado. */
  saveProject(req: SaveProjectRequest): Promise<SaveProjectResult | null>
  /** Informa ao main se há alterações não salvas (para confirmar ao fechar). */
  setDirty(dirty: boolean): void
  /** Após "Salvar e sair" bem-sucedido, autoriza o fechamento da janela. */
  confirmClose(): void
  /** Biblioteca pessoal de blocos (userData/block-library.json). */
  loadLibrary(): Promise<BlockLibraryFile>
  saveLibrary(data: BlockLibraryFile): Promise<boolean>
  /** Diálogo nativo para escolher a imagem de fundo. null = cancelado. */
  importImage(): Promise<ImportedImage | null>
  /** Abre o diálogo nativo e lê um modelo .glb. null = cancelado. */
  importModel(): Promise<ImportedModel | null>
  /** Lê as imagens da pasta assets/ de um projeto aberto. */
  loadAssets(projectPath: string, keys: string[]): Promise<AssetData[]>
  /** Diálogo "Salvar como" + gravação do PDF. null = cancelado. */
  savePdf(req: SavePdfRequest): Promise<{ filePath: string } | null>
  /** Mostra "Salvar como" e grava um PNG (imagem 3D / panorama). null = cancelado. */
  saveImage(req: SaveImageRequest): Promise<{ filePath: string } | null>
  /** IA: a chave fica só no main (criptografada); o renderer vê apenas o status. */
  aiStatus(): Promise<AiStatus>
  aiSetProvider(provider: AiProvider): Promise<AiStatus>
  aiSetKey(provider: AiProvider, key: string | null): Promise<AiStatus>
  aiTest(provider: AiProvider): Promise<AiTestResult>
  aiGenerate(prompt: string): Promise<AiGenerateResult>
  aiRecognize(image: RecognizeImage): Promise<AiRecognizeResult>
  aiCancel(): Promise<boolean>
}
