/**
 * Tema. A UI usa variáveis CSS (styles/global.css, via data-theme no <html>);
 * o Konva desenha em <canvas> e não lê CSS, então as cores do canvas vivem aqui.
 */
import { useEffect, useState } from 'react'
import { useSettingsStore } from './store/settingsStore'

export type ResolvedTheme = 'light' | 'dark'

export interface CanvasPalette {
  background: string
  gridMinor: string
  gridMajor: string
  gridAxis: string
  wallFill: string
  wallOutline: string
  accent: string
  accentSoft: string
  hover: string
  text: string
  textHalo: string
  handleFill: string
  /** Cor das cotas (contrasta com paredes e fundo). */
  dimension: string
  /** Cores padrão dos blocos (móveis). */
  blockFill: string
  blockStroke: string
}

export const CANVAS_PALETTES: Record<ResolvedTheme, CanvasPalette> = {
  light: {
    background: '#fbfbfc',
    gridMinor: '#eef0f3',
    gridMajor: '#dde1e7',
    gridAxis: '#c5cbd5',
    wallFill: '#3b4049',
    wallOutline: '#1d2026',
    accent: '#4f6bff',
    accentSoft: 'rgba(79, 107, 255, 0.12)',
    hover: '#8fa2ff',
    text: '#1d2026',
    textHalo: '#fbfbfc',
    handleFill: '#ffffff',
    dimension: '#d9480f',
    blockFill: '#ffffff',
    blockStroke: '#545b68'
  },
  dark: {
    background: '#18191c',
    gridMinor: '#222428',
    gridMajor: '#2d3035',
    gridAxis: '#41454c',
    wallFill: '#c9ccd3',
    wallOutline: '#f2f3f5',
    accent: '#7a8fff',
    accentSoft: 'rgba(122, 143, 255, 0.16)',
    hover: '#5a6ccc',
    text: '#eceef1',
    textHalo: '#18191c',
    handleFill: '#18191c',
    dimension: '#ffa94d',
    blockFill: '#262830',
    blockStroke: '#b9bec9'
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Resolve "system" para claro/escuro e reage a mudanças do SO. */
export function useResolvedTheme(): ResolvedTheme {
  const pref = useSettingsStore((s) => s.theme)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (pref === 'system') return systemDark ? 'dark' : 'light'
  return pref
}

export function useCanvasPalette(): CanvasPalette {
  return CANVAS_PALETTES[useResolvedTheme()]
}
