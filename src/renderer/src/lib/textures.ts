/**
 * Texturas procedurais dos materiais (canvas 2D), cacheadas por id.
 * O tamanho real do ladrilho em cm fica em `MaterialDef.tileCm`.
 */
import { resolveMaterial, type MaterialDef } from '@shared/materials'

export const TILE_PX = 256

const cache = new Map<string, HTMLCanvasElement>()

// PRNG determinístico: a mesma textura sai igual em qualquer sessão.
function rng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number): number => Math.max(0, Math.min(255, v + amt))
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`
}

function noise(ctx: CanvasRenderingContext2D, r: () => number, amount: number): void {
  const img = ctx.getImageData(0, 0, TILE_PX, TILE_PX)
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (r() - 0.5) * amount
    img.data[i] += d
    img.data[i + 1] += d
    img.data[i + 2] += d
  }
  ctx.putImageData(img, 0, 0)
}

function draw(m: MaterialDef, ctx: CanvasRenderingContext2D): void {
  const S = TILE_PX
  const p = m.pattern
  const r = rng(m.id)
  if (!p) {
    ctx.fillStyle = m.color
    ctx.fillRect(0, 0, S, S)
    return
  }
  switch (p.kind) {
    case 'planks': {
      const h = S / p.rows
      for (let row = 0; row < p.rows; row++) {
        // Cada fileira tem 2 tábuas com junta deslocada.
        const joint = Math.floor(S * (0.25 + r() * 0.5))
        const segs: [number, number][] = [
          [0, joint],
          [joint, S]
        ]
        for (const [x0, x1] of segs) {
          ctx.fillStyle = p.colors[Math.floor(r() * p.colors.length)]
          ctx.fillRect(x0, row * h, x1 - x0, h)
          ctx.strokeStyle = 'rgba(0,0,0,0.07)'
          ctx.lineWidth = 1
          for (let g = 0; g < 4; g++) {
            const y = row * h + 4 + r() * (h - 8)
            ctx.beginPath()
            ctx.moveTo(x0, y)
            ctx.lineTo(x1, y + (r() - 0.5) * 3)
            ctx.stroke()
          }
          ctx.fillStyle = 'rgba(0,0,0,0.28)'
          ctx.fillRect(x0, row * h, 1.5, h)
        }
        ctx.fillStyle = 'rgba(0,0,0,0.28)'
        ctx.fillRect(0, row * h, S, 1.5)
      }
      noise(ctx, r, 8)
      break
    }
    case 'tiles': {
      const c = S / p.cells
      ctx.fillStyle = p.grout
      ctx.fillRect(0, 0, S, S)
      for (let i = 0; i < p.cells; i++)
        for (let j = 0; j < p.cells; j++) {
          ctx.fillStyle = shade(p.base, (r() - 0.5) * 8)
          ctx.fillRect(i * c + 1.5, j * c + 1.5, c - 3, c - 3)
        }
      break
    }
    case 'noise': {
      ctx.fillStyle = p.base
      ctx.fillRect(0, 0, S, S)
      noise(ctx, r, p.amount)
      break
    }
    case 'stone': {
      ctx.fillStyle = p.grout
      ctx.fillRect(0, 0, S, S)
      let y = 0
      while (y < S) {
        const hh = Math.min(50 + Math.floor(r() * 40), S - y)
        let x = 0
        while (x < S) {
          const ww = Math.min(50 + Math.floor(r() * 70), S - x)
          ctx.fillStyle = p.colors[Math.floor(r() * p.colors.length)]
          ctx.fillRect(x + 2, y + 2, ww - 4, hh - 4)
          x += ww
        }
        y += hh
      }
      noise(ctx, r, 14)
      break
    }
    case 'brick': {
      ctx.fillStyle = p.grout
      ctx.fillRect(0, 0, S, S)
      const rows = 8
      const h = S / rows
      const w = S / 4
      for (let row = 0; row < rows; row++) {
        const off = row % 2 ? w / 2 : 0
        for (let i = -1; i < 5; i++) {
          ctx.fillStyle = p.brick[Math.floor(r() * p.brick.length)]
          ctx.fillRect(i * w + off + 1.5, row * h + 1.5, w - 3, h - 3)
        }
      }
      noise(ctx, r, 12)
      break
    }
    case 'marble': {
      ctx.fillStyle = p.base
      ctx.fillRect(0, 0, S, S)
      ctx.strokeStyle = p.vein
      for (let k = 0; k < 6; k++) {
        ctx.globalAlpha = 0.25 + r() * 0.35
        ctx.lineWidth = 0.6 + r() * 1.6
        ctx.beginPath()
        let x = r() * S
        let y = 0
        ctx.moveTo(x, y)
        while (y < S) {
          x += (r() - 0.5) * 40
          y += 20 + r() * 20
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      noise(ctx, r, 5)
      break
    }
  }
}

/** Ladrilho (canvas) do material, ou null se for cor lisa/desconhecido. */
export function getTileCanvas(id: string | undefined | null): HTMLCanvasElement | null {
  const m = resolveMaterial(id)
  if (!m?.pattern) return null
  const hit = cache.get(m.id)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE_PX
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  draw(m, ctx)
  cache.set(m.id, canvas)
  return canvas
}

/** Data URL do ladrilho, para amostras na interface. */
const thumbs = new Map<string, string>()
export function materialThumb(id: string): string | null {
  const hit = thumbs.get(id)
  if (hit) return hit
  const tile = getTileCanvas(id)
  if (!tile) return null
  const url = tile.toDataURL('image/png')
  thumbs.set(id, url)
  return url
}
