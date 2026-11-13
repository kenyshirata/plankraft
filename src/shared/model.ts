/**
 * Modelo de dados do documento (planta), compartilhado entre main e renderer.
 *
 * Convenções:
 *  - Unidade de mundo = CENTÍMETRO. Todas as coordenadas e medidas do modelo
 *    estão em cm; a conversão para m/mm é só de exibição (ver format.ts).
 *  - Eixo Y cresce para baixo (mesma convenção do canvas).
 *  - O documento é imutável: toda alteração gera um novo objeto (facilita undo/redo).
 */

import type { BlockDef } from './blocks'

export type Id = string

export interface Point {
  x: number
  y: number
}

export type LengthUnit = 'm' | 'cm' | 'mm'

/**
 * Papel semântico de uma camada. Permite que importações (ex.: IA) e a troca
 * automática de camada por ferramenta encontrem a camada certa mesmo que o
 * usuário a tenha renomeado.
 */
export type LayerRole = 'walls' | 'openings' | 'rooms' | 'dimensions' | 'furniture' | 'text' | 'background'

export interface Layer {
  id: Id
  name: string
  visible: boolean
  locked: boolean
  /** 0..1 */
  opacity: number
  /** Cor de destaque (tint) opcional, em hex. */
  color: string | null
  role?: LayerRole
}

interface BaseObject {
  id: Id
  layerId: Id
}

export interface WallObject extends BaseObject {
  type: 'wall'
  /** Extremidades no eixo (linha de centro) da parede, em cm. */
  a: Point
  b: Point
  /** Espessura em cm. */
  thickness: number
  /** Acabamento (id de shared/materials.ts); ausente = cor padrão. */
  material?: string
}

/**
 * Abertura (porta/janela) hospedada numa parede. A posição é relativa à
 * parede, então a abertura acompanha a parede quando ela é movida/esticada.
 */
interface OpeningBase extends BaseObject {
  wallId: Id
  /** Distância (cm) do ponto `a` da parede até o CENTRO da abertura. */
  offset: number
  /** Largura do vão em cm. */
  width: number
}

export interface DoorObject extends OpeningBase {
  type: 'door'
  /** Lado para onde a folha abre: 1 = lado esquerdo do vetor a→b, -1 = direito. */
  side: 1 | -1
  /** Dobradiça no lado do ponto `a` ('start') ou do ponto `b` ('end') do vão. */
  hinge: 'start' | 'end'
}

export interface WindowObject extends OpeningBase {
  type: 'window'
}

export type OpeningObject = DoorObject | WindowObject

export interface RoomObject extends BaseObject {
  type: 'room'
  name: string
  /** Polígono do piso (área útil), em cm. */
  points: Point[]
  /** Cor de preenchimento (hex). */
  color: string
  /** Piso/acabamento (id de shared/materials.ts); ausente = só a cor do cômodo. */
  material?: string
}

export interface TextObject extends BaseObject {
  type: 'text'
  /** Posição do canto superior esquerdo, em cm. */
  position: Point
  text: string
  /** Altura da fonte em cm (escala junto com o desenho). */
  fontSize: number
  /** Rotação em graus. */
  rotation: number
  /** Cor (hex) ou null = cor padrão do tema. */
  color: string | null
}

/**
 * Cota (dimensão).
 *  - 'wall' (associada/automática): mede a parede `wallId` e acompanha qualquer
 *    alteração dela em tempo real; é excluída junto com a parede.
 *  - 'free' (manual): mede os pontos `a`→`b` (inclusive diagonais).
 *
 * `offset`: posição da linha de cota em cm, com sinal (positivo = lado esquerdo
 * do vetor a→b). null = automático (lado externo + distância configurada em px,
 * com escalonamento quando cotas paralelas ficam próximas).
 */
interface DimensionBase extends BaseObject {
  type: 'dimension'
  offset: number | null
}

export interface WallDimension extends DimensionBase {
  kind: 'wall'
  wallId: Id
}

export interface FreeDimension extends DimensionBase {
  kind: 'free'
  a: Point
  b: Point
}

export type DimensionObject = WallDimension | FreeDimension

/**
 * Instância de bloco (móvel/símbolo). Referencia o símbolo por `blockId`; o
 * tamanho final é `def.width × scaleX` por `def.height × scaleY`.
 */
export interface BlockObject extends BaseObject {
  type: 'block'
  blockId: string
  /** Centro da instância, em cm. */
  position: Point
  rotation: number
  scaleX: number
  scaleY: number
  flipX: boolean
  flipY: boolean
  /** Cores (hex) ou null = padrão do tema. */
  fill: string | null
  stroke: string | null
}

/**
 * Imagem de fundo (planta escaneada/foto para traçar por cima).
 * O arquivo fica em `<pasta do projeto>/assets/<asset>`; o JSON guarda só a referência.
 */
export interface ImageObject extends BaseObject {
  type: 'image'
  /** Nome do arquivo em assets/ (ex.: "3f2a…c1.png"). */
  asset: string
  /** Nome original do arquivo (para mensagens). */
  name: string
  /** Centro, em cm. */
  position: Point
  /** Tamanho real no desenho, em cm. */
  width: number
  height: number
  rotation: number
  /** Tamanho original em pixels (para a escala "1 px = N cm"). */
  pixelWidth: number
  pixelHeight: number
  /** 0..1 */
  opacity: number
  hidden: boolean
  locked: boolean
}

/** União de todos os objetos desenháveis. */
export type PlanObject = WallObject | DoorObject | WindowObject | RoomObject | TextObject | DimensionObject | BlockObject | ImageObject
export type PlanObjectType = PlanObject['type']

export interface PlanDocument {
  schemaVersion: 1
  id: Id
  name: string
  createdAt: string
  updatedAt: string
  /** Ordem do array = ordem de renderização (índice 0 = mais ao fundo). */
  layers: Layer[]
  objects: PlanObject[]
  /**
   * Definições dos blocos PERSONALIZADOS usados no projeto (cópia embutida),
   * para o arquivo abrir em outro computador. Símbolos de fábrica não entram.
   */
  blocks: BlockDef[]
}

export const newId = (): Id => crypto.randomUUID()

export const isOpening = (o: PlanObject): o is OpeningObject => o.type === 'door' || o.type === 'window'

/** Parede da qual o objeto depende (aberturas e cotas associadas), ou null. */
export function hostWallId(o: PlanObject): Id | null {
  if (o.type === 'door' || o.type === 'window') return o.wallId
  if (o.type === 'dimension' && o.kind === 'wall') return o.wallId
  return null
}

/** Camadas padrão de um projeto novo, da mais ao fundo para a mais à frente. */
export function createDefaultLayers(): Layer[] {
  const base = { visible: true, locked: false, opacity: 1, color: null }
  return [
    { ...base, id: newId(), name: 'Imagem de Fundo', role: 'background' },
    { ...base, id: newId(), name: 'Cômodos', role: 'rooms' },
    { ...base, id: newId(), name: 'Móveis', role: 'furniture' },
    { ...base, id: newId(), name: 'Paredes', role: 'walls' },
    { ...base, id: newId(), name: 'Portas e Janelas', role: 'openings' },
    { ...base, id: newId(), name: 'Texto', role: 'text' },
    { ...base, id: newId(), name: 'Cotas', role: 'dimensions' }
  ]
}

export function createEmptyDocument(name = 'Projeto sem título'): PlanDocument {
  const now = new Date().toISOString()
  return {
    schemaVersion: 1,
    id: newId(),
    name,
    createdAt: now,
    updatedAt: now,
    layers: createDefaultLayers(),
    objects: [],
    blocks: []
  }
}

export function findLayerByRole(doc: PlanDocument, role: LayerRole): Layer | undefined {
  return doc.layers.find((l) => l.role === role)
}

// ------------------------------------------------------------ arquivo .plankraft

export const PROJECT_EXTENSION = 'plankraft'

/** Envelope gravado em disco. */
export interface ProjectFile {
  format: 'plankraft'
  version: 1
  savedAt: string
  document: PlanDocument
}
