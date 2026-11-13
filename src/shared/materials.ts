/**
 * Catálogo de materiais (acabamentos) de pisos e paredes.
 *
 * Os materiais são DADOS: o documento guarda só o id (string) em
 * `RoomObject.material` / `WallObject.material`. As texturas são geradas
 * proceduralmente no renderer (lib/textures.ts), sem arquivos externos.
 *
 * Ids especiais: `color:#rrggbb` = cor sólida livre (tinta personalizada).
 */

export type MaterialScope = 'floor' | 'wall' | 'both'
export type MaterialGroup = 'Madeira' | 'Cerâmica' | 'Pedra' | 'Parede' | 'Externo' | 'Tintas'

export type MaterialPattern =
  | { kind: 'planks'; colors: string[]; rows: number }
  | { kind: 'tiles'; base: string; grout: string; cells: number }
  | { kind: 'noise'; base: string; amount: number }
  | { kind: 'stone'; colors: string[]; grout: string }
  | { kind: 'brick'; brick: string[]; grout: string }
  | { kind: 'marble'; base: string; vein: string }

export interface MaterialDef {
  id: string
  name: string
  group: MaterialGroup
  scope: MaterialScope
  /** Cor representativa (amostra, 2D sem textura, PDF). */
  color: string
  /** Lado do ladrilho de textura no mundo real, em cm. */
  tileCm?: number
  pattern?: MaterialPattern
}

const paint = (id: string, name: string, color: string): MaterialDef => ({ id: `paint:${id}`, name, group: 'Tintas', scope: 'both', color })

export const MATERIALS: MaterialDef[] = [
  // Madeira
  { id: 'wood-oak', name: 'Carvalho', group: 'Madeira', scope: 'floor', color: '#c49a62', tileCm: 80, pattern: { kind: 'planks', colors: ['#c49a62', '#b98c54', '#cda670', '#bf9560'], rows: 4 } },
  { id: 'wood-walnut', name: 'Nogueira', group: 'Madeira', scope: 'floor', color: '#6b4a32', tileCm: 80, pattern: { kind: 'planks', colors: ['#6b4a32', '#5f4029', '#74523a', '#684630'], rows: 4 } },
  { id: 'wood-light', name: 'Madeira clara', group: 'Madeira', scope: 'floor', color: '#e0c9a0', tileCm: 80, pattern: { kind: 'planks', colors: ['#e0c9a0', '#d8bf92', '#e8d4ae', '#dcc59b'], rows: 4 } },
  { id: 'wood-gray', name: 'Madeira acinzentada', group: 'Madeira', scope: 'floor', color: '#9a948b', tileCm: 80, pattern: { kind: 'planks', colors: ['#9a948b', '#8e887f', '#a29c93', '#958f86'], rows: 4 } },
  { id: 'deck', name: 'Deck', group: 'Madeira', scope: 'floor', color: '#a8794a', tileCm: 60, pattern: { kind: 'planks', colors: ['#a8794a', '#9b6e42', '#b2824f'], rows: 6 } },
  // Cerâmica
  { id: 'porc-white', name: 'Porcelanato branco', group: 'Cerâmica', scope: 'both', color: '#eceae6', tileCm: 120, pattern: { kind: 'tiles', base: '#eceae6', grout: '#cfcbc4', cells: 2 } },
  { id: 'porc-gray', name: 'Porcelanato cinza', group: 'Cerâmica', scope: 'both', color: '#a9abae', tileCm: 120, pattern: { kind: 'tiles', base: '#a9abae', grout: '#8d8f92', cells: 2 } },
  { id: 'porc-beige', name: 'Porcelanato bege', group: 'Cerâmica', scope: 'both', color: '#d8c8aa', tileCm: 120, pattern: { kind: 'tiles', base: '#d8c8aa', grout: '#bdad8f', cells: 2 } },
  { id: 'tile-white', name: 'Azulejo branco', group: 'Cerâmica', scope: 'both', color: '#f4f6f8', tileCm: 60, pattern: { kind: 'tiles', base: '#f4f6f8', grout: '#c9ced4', cells: 3 } },
  { id: 'tile-blue', name: 'Azulejo azul', group: 'Cerâmica', scope: 'both', color: '#5b8fb9', tileCm: 60, pattern: { kind: 'tiles', base: '#5b8fb9', grout: '#d7e3ee', cells: 3 } },
  { id: 'tile-green', name: 'Azulejo verde', group: 'Cerâmica', scope: 'both', color: '#6fa58a', tileCm: 60, pattern: { kind: 'tiles', base: '#6fa58a', grout: '#dbe9e1', cells: 3 } },
  { id: 'tile-terracotta', name: 'Terracota', group: 'Cerâmica', scope: 'floor', color: '#b9633f', tileCm: 100, pattern: { kind: 'tiles', base: '#b9633f', grout: '#8f4a2e', cells: 2 } },
  // Pedra e concreto
  { id: 'concrete', name: 'Cimento queimado', group: 'Pedra', scope: 'both', color: '#a6a6a2', tileCm: 100, pattern: { kind: 'noise', base: '#a6a6a2', amount: 14 } },
  { id: 'marble', name: 'Mármore branco', group: 'Pedra', scope: 'both', color: '#ecebe8', tileCm: 120, pattern: { kind: 'marble', base: '#ecebe8', vein: '#b4b2ae' } },
  { id: 'granite', name: 'Granito escuro', group: 'Pedra', scope: 'both', color: '#4b4d52', tileCm: 80, pattern: { kind: 'noise', base: '#4b4d52', amount: 30 } },
  { id: 'stone', name: 'Pedra natural', group: 'Pedra', scope: 'both', color: '#a39a8c', tileCm: 120, pattern: { kind: 'stone', colors: ['#a39a8c', '#968d7f', '#b0a698', '#9c9385'], grout: '#7d7568' } },
  // Parede
  { id: 'brick-red', name: 'Tijolo aparente', group: 'Parede', scope: 'wall', color: '#a8553a', tileCm: 80, pattern: { kind: 'brick', brick: ['#a8553a', '#9a4b32', '#b25f43'], grout: '#cfc7bb' } },
  { id: 'brick-white', name: 'Tijolo branco', group: 'Parede', scope: 'wall', color: '#e6e1d8', tileCm: 80, pattern: { kind: 'brick', brick: ['#e6e1d8', '#ddd7cc', '#ece8e0'], grout: '#bdb7ac' } },
  { id: 'plaster', name: 'Reboco', group: 'Parede', scope: 'wall', color: '#e3ddd2', tileCm: 100, pattern: { kind: 'noise', base: '#e3ddd2', amount: 8 } },
  // Externo
  { id: 'grass', name: 'Grama', group: 'Externo', scope: 'floor', color: '#6aa84f', tileCm: 100, pattern: { kind: 'noise', base: '#6aa84f', amount: 26 } },
  { id: 'pavers', name: 'Piso intertravado', group: 'Externo', scope: 'floor', color: '#9b9b9b', tileCm: 100, pattern: { kind: 'brick', brick: ['#9b9b9b', '#8e8e8e', '#a6a6a6'], grout: '#777777' } },
  // Tintas (cor lisa)
  paint('white', 'Branco gelo', '#f2f0eb'),
  paint('cream', 'Creme', '#eadfc8'),
  paint('sand', 'Areia', '#d9c7a5'),
  paint('gray', 'Cinza claro', '#c9cbcf'),
  paint('graphite', 'Grafite', '#4a4d54'),
  paint('sage', 'Verde sálvia', '#a9bda0'),
  paint('olive', 'Verde oliva', '#7d8b5a'),
  paint('sky', 'Azul céu', '#a8cbe4'),
  paint('navy', 'Azul marinho', '#2f4668'),
  paint('rose', 'Rosa antigo', '#dba9a4'),
  paint('terracotta', 'Terracota', '#c4724e'),
  paint('mustard', 'Mostarda', '#d9a93b')
]

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]))

const HEX = /^#[0-9a-fA-F]{6}$/

/** Cor livre: `color:#rrggbb`. */
export const customColorId = (hex: string): string => `color:${hex.toLowerCase()}`

/** Resolve um id de material (inclusive cores livres); undefined se desconhecido. */
export function resolveMaterial(id: string | undefined | null): MaterialDef | undefined {
  if (!id) return undefined
  const known = BY_ID.get(id)
  if (known) return known
  if (id.startsWith('color:')) {
    const hex = id.slice(6)
    if (HEX.test(hex)) return { id, name: `Cor ${hex.toUpperCase()}`, group: 'Tintas', scope: 'both', color: hex }
  }
  return undefined
}

export const materialAppliesTo = (m: MaterialDef, target: 'floor' | 'wall'): boolean => m.scope === 'both' || m.scope === target

export const MATERIAL_GROUPS: MaterialGroup[] = ['Tintas', 'Madeira', 'Cerâmica', 'Pedra', 'Parede', 'Externo']
