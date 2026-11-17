/**
 * Modelos 3D de fábrica dos blocos (Kenney, "Furniture Kit", CC0).
 * Cada arquivo .glb é carregado sob demanda (um chunk por modelo, texto base64).
 * Blocos sem modelo continuam como prismas extrudados do símbolo 2D.
 */
import { parseGlb, type LoadedModel } from './models'

/** id do bloco → arquivo (sem extensão) e giro extra (graus) para a frente do modelo coincidir com a do símbolo. */
export const BUILTIN_MODELS: Record<string, { file: string; yaw?: number }> = {
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
