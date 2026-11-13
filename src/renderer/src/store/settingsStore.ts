/**
 * Preferências do usuário (globais, não pertencem ao documento).
 * Persistidas no localStorage do renderer por enquanto; na etapa de IA as
 * preferências sensíveis (chave de API) ficarão no main via electron-store +
 * safeStorage, nunca aqui.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { DoorVariant, LengthUnit, WindowVariant } from '@shared/model'

export type ThemePreference = 'light' | 'dark' | 'system'
export type Precision = 0 | 1 | 2

export interface Settings {
  theme: ThemePreference
  unit: LengthUnit
  precision: Precision
  /** Passo do grid/ímã, em cm. */
  gridSize: number
  showGrid: boolean
  snapEnabled: boolean
  /** Espessura padrão de novas paredes, em cm. */
  wallThickness: number
  /** Larguras padrão de vão, em cm. */
  doorWidth: number
  /** Tipo de porta/janela inseridas pelas ferramentas. */
  doorVariant: DoorVariant
  windowVariant: WindowVariant
  windowWidth: number
  /** Altura padrão de texto novo, em cm. */
  textSize: number
  /** Ao trocar de ferramenta, ativa a camada correspondente (Porta → "Portas e Janelas"). */
  autoLayerByTool: boolean

  // --- cotas ---
  /** Mostrar/ocultar todas as cotas (Ctrl+Shift+C). */
  showDimensions: boolean
  /** Mostra o andar de baixo esmaecido ao editar um andar superior. */
  ghostLevel: boolean
  /** Telhado simples na maquete 3D. */
  roof3d: 'off' | 'flat' | 'gable' | 'hip'
  /** 'architectural' = linha externa à parede; 'linear' = sobre a parede. */
  dimensionStyle: DimensionStyle
  /** Distância (px de tela) entre a face da parede e a linha de cota. */
  dimensionOffset: number
  /** Criar a cota automaticamente ao desenhar uma parede. */
  autoDimensions: boolean
  /** Ângulos nos cantos entre paredes conectadas. */
  cornerAngles: CornerAngleMode
  /** Tour de boas-vindas já foi visto/pulado. */
  onboardingDone: boolean

  // --- vista 3D ---
  /** Altura das paredes (m). */
  wallHeight3d: number
  /** Corta as paredes a 1,20 m para ver o interior. */
  cutaway3d: boolean
  labels3d: boolean
  /** Hora do dia (0–24) que define o sol e o céu da maquete. */
  sunHour: number
  shadows3d: boolean
  /** Imagem de fundo como textura no chão. */
  background3d: boolean
}

export type DimensionStyle = 'architectural' | 'linear'
export type CornerAngleMode = 'off' | 'non-right' | 'all'

interface SettingsState extends Settings {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void
  toggle(
    key: 'showGrid' | 'snapEnabled' | 'autoLayerByTool' | 'showDimensions' | 'ghostLevel' | 'autoDimensions' | 'cutaway3d' | 'labels3d' | 'shadows3d' | 'background3d'
  ): void
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  unit: 'm',
  precision: 2,
  gridSize: 10,
  showGrid: true,
  snapEnabled: true,
  wallThickness: 15,
  doorWidth: 80,
  doorVariant: 'swing',
  windowVariant: 'casement',
  windowWidth: 120,
  textSize: 25,
  autoLayerByTool: true,
  showDimensions: true,
  ghostLevel: true,
  roof3d: 'off',
  dimensionStyle: 'architectural',
  dimensionOffset: 20,
  autoDimensions: true,
  cornerAngles: 'non-right',
  onboardingDone: false,
  wallHeight3d: 2.7,
  cutaway3d: false,
  labels3d: true,
  sunHour: 14,
  shadows3d: true,
  background3d: false
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) => set({ [key]: value } as Partial<Settings>),
      toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<Settings>)
    }),
    {
      name: 'plankraft-settings',
      version: 5,
      // Preferências salvas por versões anteriores recebem os novos campos com valor padrão.
      migrate: (persisted) => ({ ...DEFAULT_SETTINGS, ...(persisted as Partial<Settings>) }) as SettingsState
    }
  )
)
