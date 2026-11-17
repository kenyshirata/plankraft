/**
 * Modelos 3D de fábrica dos blocos (Kenney, "Furniture Kit", CC0).
 * Cada arquivo .glb é carregado sob demanda (um chunk por modelo, texto base64).
 * Blocos sem modelo continuam como prismas extrudados do símbolo 2D.
 */
import { parseGlb, type LoadedModel } from './models'

/** id do bloco → arquivo (sem extensão) e giro extra (graus) para a frente do modelo coincidir com a do símbolo. */
export interface ModelPart {
  file: string
  /** Centro e tamanho da peça no sistema do símbolo (cm, antes da escala da instância). */
  x: number
  y: number
  w: number
  d: number
  yaw?: number
  /** Altura final (m); ausente = média da escala em largura e profundidade. */
  height?: number
}

/** Bloco com um modelo (`file`) ou composto por várias peças (`parts`). */
export type ModelEntry =
  | { file: string; yaw?: number; height?: number; parts?: undefined }
  | { parts: ModelPart[]; file?: undefined; yaw?: undefined; height?: undefined }

/** Mesa de jantar: tampo + cadeiras nos dois lados maiores (frente das cadeiras para a mesa). */
function diningSet(width: number, chairsX: number[]): ModelEntry {
  const parts: ModelPart[] = [{ file: 'table', x: width / 2, y: 80, w: width, d: 90, height: 0.75 }]
  for (const x of chairsX) {
    parts.push({ file: 'chair', x, y: 22.5, w: 45, d: 45, height: 0.9 })
    parts.push({ file: 'chair', x, y: 137.5, w: 45, d: 45, yaw: 180, height: 0.9 })
  }
  return { parts }
}

export const BUILTIN_MODELS: Record<string, ModelEntry> = {
  'builtin:dining-4': diningSet(120, [37.5, 82.5]),
  'builtin:dining-6': diningSet(180, [37.5, 90.5, 143.5]),
  'builtin:dining-8': diningSet(240, [37.5, 90.5, 143.5, 196.5]),
  'builtin:car': { file: 'sedan', yaw: 180, height: 1.5 },
  'builtin:tree': { file: 'tree_oak', height: 5 },
  'builtin:tree-small': { file: 'tree_small', height: 3 },
  'builtin:shrub': { file: 'plant_bushLarge', height: 0.8 },
  'builtin:planter': { file: 'pot_large', height: 0.45 },
  'builtin:garden-bench': { file: 'bench', height: 0.85 },
  'builtin:lounger': { file: 'loungeChairRelax', height: 0.9 },
  'builtin:dishwasher': { file: 'dryer' },
  'builtin:bidet': { file: 'toiletSquare' },
  'builtin:laundry-tub': { file: 'bathroomSinkSquare' },
  'builtin:vanity': { file: 'sideTableDrawers' },
  'builtin:chest': { file: 'benchCushionLow' },
  'builtin:pantry': { file: 'bookcaseClosedDoors' },
  'builtin:file-cabinet': { file: 'cabinetBedDrawer' },
  'builtin:sofa-3': { file: 'loungeSofaLong' },
  'builtin:sofa-2': { file: 'loungeSofa' },
  'builtin:armchair': { file: 'loungeChair' },
  'builtin:coffee-table': { file: 'tableCoffee' },
  'builtin:tv-rack': { file: 'cabinetTelevision' },
  'builtin:tv': { file: 'televisionModern' },
  'builtin:sofa-l': { file: 'loungeSofaCorner' },
  'builtin:puff': { file: 'loungeSofaOttoman' },
  'builtin:side-table': { file: 'sideTable' },
  'builtin:bookshelf': { file: 'bookcaseClosed' },
  'builtin:sideboard': { file: 'cabinetTelevisionDoors' },
  'builtin:rug': { file: 'rugRectangle' },
  'builtin:plant-pot': { file: 'pottedPlant' },
  'builtin:floor-lamp': { file: 'lampSquareFloor' },
  'builtin:bed-single': { file: 'bedSingle' },
  'builtin:bed-double': { file: 'bedDouble' },
  'builtin:bed-queen': { file: 'bedDouble' },
  'builtin:bed-king': { file: 'bedDouble' },
  'builtin:wardrobe': { file: 'bookcaseClosedDoors' },
  'builtin:nightstand': { file: 'cabinetBed' },
  'builtin:desk': { file: 'desk' },
  'builtin:bunk-bed': { file: 'bedBunk' },
  'builtin:dresser': { file: 'cabinetBedDrawer' },
  'builtin:wardrobe-wide': { file: 'bookcaseClosedWide' },
  'builtin:kitchen-sink': { file: 'kitchenSink' },
  'builtin:stove': { file: 'kitchenStove' },
  'builtin:fridge': { file: 'kitchenFridgeLarge' },
  'builtin:microwave': { file: 'kitchenMicrowave' },
  'builtin:chair': { file: 'chair' },
  'builtin:round-table': { file: 'tableRound' },
  'builtin:kitchen-island': { file: 'kitchenBar' },
  'builtin:washer': { file: 'washer' },
  'builtin:counter': { file: 'kitchenCabinet' },
  'builtin:toilet': { file: 'toilet' },
  'builtin:bath-sink': { file: 'bathroomSink' },
  'builtin:shower': { file: 'shower' },
  'builtin:bathtub': { file: 'bathtub' },
  'builtin:double-sink': { file: 'bathroomCabinetDrawer' },
  'builtin:desk-l': { file: 'deskCorner' },
  'builtin:office-chair': { file: 'chairDesk' },
  'builtin:shelf-office': { file: 'bookcaseOpen' },
  'builtin:garden-chair': { file: 'chairModernCushion' }
}

// Um chunk por arquivo (carregamento preguiçoso). Os .glb ficam como texto base64 (`*.b64.txt`):
// assim o carregamento é igual no desenvolvimento e no app empacotado (sem fetch/file://).
const files = import.meta.glob('../assets/models/*.b64.txt', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>

const cache = new Map<string, Promise<LoadedModel>>()

/** Modelo de fábrica de um arquivo (cache por nome). */
export function loadBuiltinModel(file: string): Promise<LoadedModel> {
  let p = cache.get(file)
  if (!p) {
    const loader = files[`../assets/models/${file}.b64.txt`]
    if (!loader) return Promise.reject(new Error(`Modelo ${file} não encontrado.`))
    p = loader().then((b64) => parseGlb(b64.trim()))
    cache.set(file, p)
    p.catch(() => cache.delete(file))
  }
  return p
}
