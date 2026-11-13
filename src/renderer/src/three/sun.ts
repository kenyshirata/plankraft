/**
 * Sol e céu por hora do dia.
 *
 * Convenção da planta: o norte é para CIMA no desenho 2D (−Z no 3D) e o leste
 * é +X. O sol nasce a leste às 6 h, passa pelo sul ao meio-dia e se põe a
 * oeste às 18 h; fora desse intervalo é noite (luz fraca e azulada).
 */
import * as THREE from 'three'

export interface SunState {
  /** Direção unitária PARA o sol. */
  dir: [number, number, number]
  /** Altura do sol sobre o horizonte (graus; negativo = noite). */
  elevation: number
  intensity: number
  color: string
  /** Intensidade da luz hemisférica (céu/chão). */
  hemi: number
  hemiSky: string
  hemiGround: string
  /** Cor do céu (fundo). */
  sky: string
}

const lerpColor = (a: string, b: string, t: number): string => new THREE.Color(a).lerp(new THREE.Color(b), Math.min(1, Math.max(0, t))).getStyle()
const smooth = (t: number): number => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

export const formatHour = (h: number): string => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`
}

export function sunState(hour: number): SunState {
  const t = (hour - 6) / 12 // 0 = nascer, 1 = pôr do sol
  const day = t >= 0 && t <= 1
  const elevation = day ? 68 * Math.sin(Math.PI * t) : -12
  const az = ((90 + 180 * Math.min(1.15, Math.max(-0.15, t))) * Math.PI) / 180
  const el = (Math.max(elevation, 6) * Math.PI) / 180 // a luz nunca vem de baixo do horizonte
  const dir: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)]
  const high = smooth(elevation / 30) // 0 no horizonte → 1 com o sol alto
  const night = elevation <= 0

  const intensity = night ? 0.12 : 0.35 + 1.55 * high
  const color = night ? '#8fa6ff' : lerpColor('#ff9a4d', '#fff4e2', high)
  const hemi = night ? 0.22 : 0.3 + 0.5 * high
  const sky = night ? '#0b1224' : lerpColor('#f2a679', '#bcdcff', high)
  return {
    dir,
    elevation,
    intensity,
    color,
    hemi,
    hemiSky: night ? '#3b4a7a' : lerpColor('#ffd9b8', '#e8f2ff', high),
    hemiGround: night ? '#151922' : lerpColor('#6f5a47', '#b9ad99', high),
    sky
  }
}
