/**
 * Geração de plantas por IA — roda SOMENTE no processo main.
 *
 * - A chave de API é criptografada com `safeStorage` (DPAPI no Windows,
 *   Keychain no macOS, libsecret no Linux) e gravada em userData/ai-settings.json.
 *   Ela nunca é enviada ao renderer: o renderer só sabe se há chave e os
 *   4 últimos caracteres.
 * - Provedores: Anthropic Claude (padrão) e OpenAI. Ambos usam saída
 *   estruturada validada pelo mesmo schema Zod (src/shared/aiPlan.ts).
 */
import { app, ipcMain, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import OpenAI from 'openai'
import * as z from 'zod/v4'
import { AI_SYSTEM_PROMPT, AiPlanResponse, type AiPlanResponseT } from '../shared/aiPlan'
import { AiRecognition, RECOGNIZE_SYSTEM_PROMPT, type AiRecognitionT } from '../shared/aiRecognize'
import { generateOfflinePlan } from '../shared/offlinePlanner'
import { IPC, type AiGenerateResult, type AiProvider, type AiRecognizeResult, type AiStatus, type AiTestResult, type RecognizeImage } from '../shared/ipc'
import { assertTrustedSender } from './security'

/** Modelos usados por provedor. */
export const AI_MODELS: Record<AiProvider, string> = {
  offline: 'Gerador procedural (offline)',
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-4o'
}

interface StoredSettings {
  provider: AiProvider
  /** Chaves criptografadas (base64 do buffer do safeStorage). */
  keys: Partial<Record<AiProvider, string>>
  /** Últimos 4 caracteres, só para exibição. */
  hints: Partial<Record<AiProvider, string>>
}

const settingsPath = (): string => join(app.getPath('userData'), 'ai-settings.json')
const PROVIDERS: AiProvider[] = ['offline', 'anthropic', 'openai']
/** Provedores que usam chave de API. */
type KeyProvider = Exclude<AiProvider, 'offline'>
const isKeyProvider = (p: unknown): p is KeyProvider => p === 'anthropic' || p === 'openai'
const isProvider = (p: unknown): p is AiProvider => PROVIDERS.includes(p as AiProvider)

async function readSettings(): Promise<StoredSettings> {
  try {
    const raw = JSON.parse(await fs.readFile(settingsPath(), 'utf-8')) as Partial<StoredSettings>
    return { provider: isProvider(raw.provider) ? raw.provider : 'offline', keys: raw.keys ?? {}, hints: raw.hints ?? {} }
  } catch {
    // Instalação nova: começa no modo offline (funciona sem chave nem internet).
    return { provider: 'offline', keys: {}, hints: {} }
  }
}

async function writeSettings(s: StoredSettings): Promise<void> {
  const target = settingsPath()
  const tmp = `${target}.tmp-${process.pid}`
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), 'utf-8')
  await fs.rename(tmp, target)
}

async function getKey(provider: KeyProvider): Promise<string | null> {
  const enc = (await readSettings()).keys[provider]
  if (!enc || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

async function status(): Promise<AiStatus> {
  const s = await readSettings()
  return {
    provider: s.provider,
    configured: { offline: true, anthropic: !!s.keys.anthropic, openai: !!s.keys.openai },
    hints: s.hints,
    models: AI_MODELS,
    encryptionAvailable: safeStorage.isEncryptionAvailable()
  }
}

// ------------------------------------------------------------- mensagens de erro

/** Converte erros dos SDKs em mensagens amigáveis (sem expor a chave). */
function friendlyError(err: unknown, provider: KeyProvider): string {
  const name = provider === 'anthropic' ? 'Anthropic' : 'OpenAI'
  if (err instanceof Anthropic.AuthenticationError || err instanceof OpenAI.AuthenticationError) {
    return `A chave de API da ${name} foi recusada. Confira a chave em Configurações → Inteligência artificial.`
  }
  if (err instanceof Anthropic.PermissionDeniedError || err instanceof OpenAI.PermissionDeniedError) {
    return `Sua conta ${name} não tem acesso ao modelo ${AI_MODELS[provider]}.`
  }
  if (err instanceof Anthropic.RateLimitError || err instanceof OpenAI.RateLimitError) {
    return 'Limite de uso atingido no provedor de IA. Aguarde um pouco e tente novamente.'
  }
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return 'Não foi possível conectar ao serviço de IA. Verifique sua internet.'
  }
  if (err instanceof Anthropic.APIUserAbortError || err instanceof OpenAI.APIUserAbortError) {
    return 'Geração cancelada.'
  }
  if (err instanceof Anthropic.InternalServerError || err instanceof OpenAI.InternalServerError) {
    return `O serviço da ${name} está instável no momento. Tente de novo em instantes.`
  }
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) {
    return `Erro do serviço de IA (${err.status ?? '?'}): ${err.message}`
  }
  if (err instanceof z.ZodError) return 'A IA respondeu num formato inesperado. Tente gerar novamente.'
  return err instanceof Error ? err.message : 'Erro desconhecido ao gerar a planta.'
}

// ------------------------------------------------------------------ provedores

async function generateWithClaude(key: string, prompt: string, signal: AbortSignal): Promise<AiPlanResponseT> {
  const client = new Anthropic({ apiKey: key })
  const response = await client.beta.messages.parse(
    {
      model: AI_MODELS.anthropic,
      max_tokens: 16000,
      // Fallback no servidor: se o modelo recusar por política, o próprio API tenta o modelo adequado.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(AiPlanResponse) },
      system: [{ type: 'text', text: AI_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: prompt }]
    },
    { signal }
  )
  if (response.stop_reason === 'refusal') {
    throw new Error('O pedido foi recusado pelo modelo. Reformule a descrição da planta.')
  }
  if (response.stop_reason === 'max_tokens') {
    throw new Error('A resposta ficou longa demais. Peça menos cômodos ou menos detalhes.')
  }
  if (!response.parsed_output) throw new Error('A IA não retornou uma planta válida. Tente novamente.')
  return response.parsed_output
}

/** JSON Schema estrito para a OpenAI (todos os campos obrigatórios, sem propriedades extras). */
function openAiSchema(): Record<string, unknown> {
  return strictSchema(z.toJSONSchema(AiPlanResponse))
}

function strictSchema(schema: unknown): Record<string, unknown> {
  const strictify = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strictify)
    if (!node || typeof node !== 'object') return node
    const obj = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, strictify(v)])) as Record<string, unknown>
    if (obj.type === 'object' && obj.properties && typeof obj.properties === 'object') {
      obj.additionalProperties = false
      obj.required = Object.keys(obj.properties)
    }
    delete obj.$schema
    return obj
  }
  return strictify(schema) as Record<string, unknown>
}

async function generateWithOpenAI(key: string, prompt: string, signal: AbortSignal): Promise<AiPlanResponseT> {
  const client = new OpenAI({ apiKey: key })
  const completion = await client.chat.completions.create(
    {
      model: AI_MODELS.openai,
      response_format: { type: 'json_schema', json_schema: { name: 'plantas', strict: true, schema: openAiSchema() } },
      messages: [
        { role: 'system', content: AI_SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ]
    },
    { signal }
  )
  const choice = completion.choices[0]
  if (choice?.message.refusal) throw new Error('O pedido foi recusado pelo modelo. Reformule a descrição da planta.')
  if (choice?.finish_reason === 'length') throw new Error('A resposta ficou longa demais. Peça menos cômodos ou menos detalhes.')
  return AiPlanResponse.parse(JSON.parse(choice?.message.content ?? '{}'))
}

// ------------------------------------------------------- reconhecimento de imagem

const MAX_IMAGE_B64 = 7_000_000 // ~5 MB de imagem

function validImage(v: unknown): v is RecognizeImage {
  if (!v || typeof v !== 'object') return false
  const i = v as Record<string, unknown>
  return (
    (i.mediaType === 'image/jpeg' || i.mediaType === 'image/png') &&
    typeof i.data === 'string' &&
    i.data.length > 100 &&
    i.data.length <= MAX_IMAGE_B64 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(i.data) &&
    Number.isInteger(i.width) &&
    Number.isInteger(i.height) &&
    (i.width as number) > 0 &&
    (i.width as number) <= 4096 &&
    (i.height as number) > 0 &&
    (i.height as number) <= 4096
  )
}

const recognizeText = (img: RecognizeImage): string =>
  `Esta é uma planta baixa. A imagem tem ${img.width} px de largura e ${img.height} px de altura. Devolva os cômodos, portas, janelas e a escala em pixels dessa imagem.`

async function recognizeWithClaude(key: string, img: RecognizeImage, signal: AbortSignal): Promise<AiRecognitionT> {
  const client = new Anthropic({ apiKey: key })
  const response = await client.beta.messages.parse(
    {
      model: AI_MODELS.anthropic,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(AiRecognition) },
      system: [{ type: 'text', text: RECOGNIZE_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } },
            { type: 'text', text: recognizeText(img) }
          ]
        }
      ]
    },
    { signal }
  )
  if (response.stop_reason === 'refusal') throw new Error('A imagem foi recusada pelo modelo.')
  if (response.stop_reason === 'max_tokens') throw new Error('A resposta ficou longa demais. Tente uma imagem mais simples.')
  if (!response.parsed_output) throw new Error('A IA não retornou uma leitura válida. Tente novamente.')
  return response.parsed_output
}

async function recognizeWithOpenAI(key: string, img: RecognizeImage, signal: AbortSignal): Promise<AiRecognitionT> {
  const client = new OpenAI({ apiKey: key })
  const schema = strictSchema(z.toJSONSchema(AiRecognition))
  const completion = await client.chat.completions.create(
    {
      model: AI_MODELS.openai,
      response_format: { type: 'json_schema', json_schema: { name: 'reconhecimento', strict: true, schema } },
      messages: [
        { role: 'system', content: RECOGNIZE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${img.mediaType};base64,${img.data}`, detail: 'high' } },
            { type: 'text', text: recognizeText(img) }
          ]
        }
      ]
    },
    { signal }
  )
  const choice = completion.choices[0]
  if (choice?.message.refusal) throw new Error('A imagem foi recusada pelo modelo.')
  if (choice?.finish_reason === 'length') throw new Error('A resposta ficou longa demais. Tente uma imagem mais simples.')
  return AiRecognition.parse(JSON.parse(choice?.message.content ?? '{}'))
}

// ------------------------------------------------------------------------ IPC

let inFlight: AbortController | null = null
/** Modo offline: repetir o mesmo pedido gera rearranjos diferentes ("Gerar novamente"). */
const offlineSeeds = new Map<string, number>()

export function registerAiIpc(): void {
  ipcMain.handle(IPC.aiStatus, async (event) => {
    assertTrustedSender(event)
    return status()
  })

  ipcMain.handle(IPC.aiSetProvider, async (event, provider: unknown) => {
    assertTrustedSender(event)
    if (!isProvider(provider)) throw new Error('Provedor inválido.')
    const s = await readSettings()
    await writeSettings({ ...s, provider })
    return status()
  })

  ipcMain.handle(IPC.aiSetKey, async (event, provider: unknown, key: unknown) => {
    assertTrustedSender(event)
    if (!isKeyProvider(provider)) throw new Error('Este provedor não usa chave de API.')
    const s = await readSettings()
    if (key === null || key === '') {
      delete s.keys[provider]
      delete s.hints[provider]
    } else {
      if (typeof key !== 'string' || key.trim().length < 10 || key.length > 500) throw new Error('Chave de API inválida.')
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('O sistema não oferece armazenamento criptografado; a chave não foi salva.')
      }
      const clean = key.trim()
      s.keys[provider] = safeStorage.encryptString(clean).toString('base64')
      s.hints[provider] = clean.slice(-4)
    }
    await writeSettings(s)
    return status()
  })

  ipcMain.handle(IPC.aiTest, async (event, provider: unknown): Promise<AiTestResult> => {
    assertTrustedSender(event)
    if (!isProvider(provider)) return { ok: false, message: 'Provedor inválido.' }
    if (provider === 'offline') return { ok: true, message: 'Modo offline: não precisa de chave nem de internet.' }
    const key = await getKey(provider)
    if (!key) return { ok: false, message: 'Nenhuma chave salva para este provedor.' }
    try {
      // Consulta o modelo (sem gerar texto): valida chave e acesso sem custo de tokens.
      if (provider === 'anthropic') await new Anthropic({ apiKey: key }).models.retrieve(AI_MODELS.anthropic)
      else await new OpenAI({ apiKey: key }).models.retrieve(AI_MODELS.openai)
      return { ok: true, message: `Conexão OK — modelo ${AI_MODELS[provider]} disponível.` }
    } catch (err) {
      return { ok: false, message: friendlyError(err, provider) }
    }
  })

  ipcMain.handle(IPC.aiGenerate, async (event, prompt: unknown): Promise<AiGenerateResult> => {
    assertTrustedSender(event)
    if (typeof prompt !== 'string' || prompt.trim().length < 5) return { ok: false, error: 'Descreva a planta desejada.' }
    if (prompt.length > 4000) return { ok: false, error: 'Descrição longa demais (máx. 4000 caracteres).' }
    const { provider } = await readSettings()
    if (provider === 'offline') {
      const text = prompt.trim()
      const seed = (offlineSeeds.get(text) ?? -1) + 1
      offlineSeeds.set(text, seed)
      return { ok: true, plan: generateOfflinePlan(text, seed), provider, model: AI_MODELS.offline }
    }
    const key = await getKey(provider)
    if (!key) {
      return { ok: false, error: 'Configure sua chave de API em Configurações → Inteligência artificial.', needsKey: true }
    }
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller
    try {
      const plan =
        provider === 'anthropic'
          ? await generateWithClaude(key, prompt.trim(), controller.signal)
          : await generateWithOpenAI(key, prompt.trim(), controller.signal)
      if (!plan.variants.length) return { ok: false, error: 'A IA não retornou nenhuma variação. Tente novamente.' }
      return { ok: true, plan, provider, model: AI_MODELS[provider] }
    } catch (err) {
      return { ok: false, error: friendlyError(err, provider) }
    } finally {
      if (inFlight === controller) inFlight = null
    }
  })

  ipcMain.handle(IPC.aiRecognize, async (event, image: unknown): Promise<AiRecognizeResult> => {
    assertTrustedSender(event)
    if (!validImage(image)) return { ok: false, error: 'Imagem inválida ou grande demais para o reconhecimento.' }
    const { provider } = await readSettings()
    if (provider === 'offline') {
      return {
        ok: false,
        error: 'Reconhecer planta precisa de IA com visão. Escolha Claude ou OpenAI em Configurações → Inteligência artificial.',
        needsKey: true
      }
    }
    const key = await getKey(provider)
    if (!key) return { ok: false, error: 'Configure sua chave de API em Configurações → Inteligência artificial.', needsKey: true }
    inFlight?.abort()
    const controller = new AbortController()
    inFlight = controller
    try {
      const recognition =
        provider === 'anthropic'
          ? await recognizeWithClaude(key, image, controller.signal)
          : await recognizeWithOpenAI(key, image, controller.signal)
      return { ok: true, recognition, provider, model: AI_MODELS[provider] }
    } catch (err) {
      return { ok: false, error: friendlyError(err, provider) }
    } finally {
      if (inFlight === controller) inFlight = null
    }
  })

  ipcMain.handle(IPC.aiCancel, (event) => {
    assertTrustedSender(event)
    inFlight?.abort()
    return true
  })
}
