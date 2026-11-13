/** Áreas externas (zonas) que reaproveitam o objeto "cômodo": terreno, gramado, deck, calçada e piscina. */
import type { RoomZone } from './model'

export interface ZoneDef {
  label: string
  /** Cor padrão do polígono. */
  color: string
  /** Material sugerido ao escolher a zona. */
  material?: string
  /** Espessura em 3D (m). */
  height: number
}

export const ZONES: Record<RoomZone, ZoneDef> = {
  lot: { label: 'Terreno', color: '#d9d2b0', material: undefined, height: 0 },
  lawn: { label: 'Gramado', color: '#6aa84f', material: 'grass', height: 0.03 },
  deck: { label: 'Deck', color: '#a8794a', material: 'deck', height: 0.1 },
  paving: { label: 'Calçada / piso externo', color: '#9b9b9b', material: 'pavers', height: 0.05 },
  pool: { label: 'Piscina', color: '#4fb3e8', material: undefined, height: 0.04 }
}

export const ZONE_ORDER: RoomZone[] = ['lot', 'lawn', 'paving', 'deck', 'pool']

export const isZone = (v: unknown): v is RoomZone => typeof v === 'string' && v in ZONES
