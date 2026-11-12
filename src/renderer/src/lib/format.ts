import type { LengthUnit } from '@shared/model'

/** Converte cm (unidade do modelo) para a unidade de exibição. */
export function fromCm(cm: number, unit: LengthUnit): number {
  if (unit === 'm') return cm / 100
  if (unit === 'mm') return cm * 10
  return cm
}

/** Converte da unidade de exibição para cm. */
export function toCm(value: number, unit: LengthUnit): number {
  if (unit === 'm') return value * 100
  if (unit === 'mm') return value / 10
  return value
}

export function formatNumber(value: number, precision: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  })
}

/** Ex.: formatLength(320, 'm', 2) → "3,20 m" */
export function formatLength(cm: number, unit: LengthUnit, precision: number): string {
  return `${formatNumber(fromCm(cm, unit), precision)} ${unit}`
}

/**
 * Área a partir de cm². Em "m" exibe m²; em "cm" e "mm" também usa m² (é a
 * convenção de plantas — ninguém lê área de cômodo em cm²).
 */
export function formatArea(cm2: number, _unit: LengthUnit, precision: number): string {
  return `${formatNumber(cm2 / 10000, Math.max(precision, 2))} m²`
}

/** Ângulo em graus inteiro e positivo, ex.: "45°". */
export function formatAngle(deg: number): string {
  const a = Math.round(((deg % 360) + 360) % 360)
  return `${a === 360 ? 0 : a}°`
}

/** Aceita "3,2", "3.2", "  320 " → número (ou null se inválido). */
export function parseDecimal(text: string): number | null {
  const n = Number(text.trim().replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
