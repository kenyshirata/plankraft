import {
  Armchair,
  DoorOpen,
  Hand,
  type LucideIcon,
  MousePointer2,
  RectangleHorizontal,
  Ruler,
  SquareDashed,
  Type,
  BrickWall,
  MoveDiagonal
} from 'lucide-react'
import type { ToolId } from '@renderer/store/editorStore'

export interface ToolDef {
  id: ToolId
  label: string
  icon: LucideIcon
  /** Tecla de atalho (sem modificadores). */
  shortcut: string
  /** false = ainda não implementada (exibida desabilitada com “em breve”). */
  available: boolean
  hint?: string
}

/** Ferramentas do canvas, na ordem da toolbar. */
export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Selecionar', icon: MousePointer2, shortcut: 'V', available: true },
  { id: 'pan', label: 'Mão (mover vista)', icon: Hand, shortcut: 'H', available: true },
  { id: 'wall', label: 'Parede', icon: BrickWall, shortcut: 'W', available: true },
  { id: 'door', label: 'Porta', icon: DoorOpen, shortcut: 'D', available: true },
  { id: 'window', label: 'Janela', icon: RectangleHorizontal, shortcut: 'J', available: true },
  { id: 'room', label: 'Cômodo', icon: SquareDashed, shortcut: 'C', available: true },
  { id: 'text', label: 'Texto', icon: Type, shortcut: 'T', available: true },
  { id: 'measure', label: 'Medir', icon: Ruler, shortcut: 'M', available: true },
  { id: 'dimension', label: 'Cota manual', icon: MoveDiagonal, shortcut: 'K', available: true },
  { id: 'block', label: 'Blocos (móveis)', icon: Armchair, shortcut: 'B', available: true }
]
