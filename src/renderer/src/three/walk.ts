/**
 * Lógica do passeio em primeira pessoa (sem three/React, para ser testável):
 * colisão do corpo (círculo) com as paredes e altura do chão (andares e escadas).
 */
import type { BoxPiece, Scene3D } from './buildScene'

export const EYE_HEIGHT = 1.6
export const BODY_RADIUS = 0.25
/** Altura do corpo para colidir com peças (m). */
const BODY_HEIGHT = 1.7
/** Degrau que se pode vencer sem escada (m). */
const STEP = 0.35

export interface Walker {
  x: number
  z: number
  /** Altura do chão sob os pés (m). */
  ground: number
}

/** Peças que bloqueiam o corpo: paredes e vidros (folhas de porta não). */
export function blockers(scene: Scene3D): BoxPiece[] {
  return scene.boxes.filter((b) => b.kind === 'wall' || b.kind === 'glass')
}

/** Empurra o círculo (x, z, r) para fora de uma caixa orientada; devolve a nova posição. */
function pushOut(x: number, z: number, r: number, b: BoxPiece): [number, number] {
  const cx = b.position[0]
  const cz = b.position[2]
  const t = b.rotationY
  const cos = Math.cos(t)
  const sin = Math.sin(t)
  // mundo → local (inverso de R_y(t))
  const dx = x - cx
  const dz = z - cz
  const lx = dx * cos - dz * sin
  const lz = dx * sin + dz * cos
  const hx = b.size[0] / 2
  const hz = b.size[2] / 2
  const qx = Math.max(-hx, Math.min(hx, lx))
  const qz = Math.max(-hz, Math.min(hz, lz))
  let nx = lx - qx
  let nz = lz - qz
  let d = Math.hypot(nx, nz)
  let push: number
  if (d < 1e-6) {
    // Centro dentro da caixa: sai pelo lado mais próximo.
    const ox = hx - Math.abs(lx)
    const oz = hz - Math.abs(lz)
    if (ox < oz) {
      nx = Math.sign(lx) || 1
      nz = 0
      push = ox + r
    } else {
      nx = 0
      nz = Math.sign(lz) || 1
      push = oz + r
    }
    d = 1
  } else {
    if (d >= r) return [x, z]
    push = r - d
  }
  nx /= d
  nz /= d
  // local → mundo
  const wx = nx * cos + nz * sin
  const wz = -nx * sin + nz * cos
  return [x + wx * push, z + wz * push]
}

/** Resolve colisões de um corpo com as paredes que cruzam a faixa vertical [ground, ground+altura]. */
export function resolveCollisions(x: number, z: number, ground: number, walls: BoxPiece[], r = BODY_RADIUS): [number, number] {
  const lo = ground + STEP
  const hi = ground + BODY_HEIGHT
  const near = walls.filter((b) => {
    const bottom = b.position[1] - b.size[1] / 2
    const top = b.position[1] + b.size[1] / 2
    return top > lo && bottom < hi
  })
  let px = x
  let pz = z
  for (let i = 0; i < 3; i++) {
    for (const b of near) [px, pz] = pushOut(px, pz, r, b)
  }
  return [px, pz]
}

function inQuad(x: number, z: number, q: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = q.length - 1; i < q.length; j = i++) {
    const [xi, zi] = q[i]
    const [xj, zj] = q[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/**
 * Chão no ponto: sobre um degrau compatível com a altura atual segue o degrau
 * (os degraus são discretos); senão é o piso mais alto que se alcança sem passar
 * do degrau tolerado. Devolve null quando o ponto cai no vão de uma escada sem acesso.
 */
export function groundAt(x: number, z: number, current: number, scene: Scene3D): number | null {
  let onStair: number | null = null
  let inAny = false
  for (const s of scene.stairs) {
    if (!inQuad(x, z, s.footprint)) continue
    inAny = true
    for (const t of s.treads) {
      if (!inQuad(x, z, t.pts)) continue
      const g = s.elevation + t.top
      if (Math.abs(g - current) <= 0.6 && (onStair === null || Math.abs(g - current) < Math.abs(onStair - current))) onStair = g
    }
  }
  if (onStair !== null) return onStair
  if (inAny) return null
  let g = scene.levelElevations[0] ?? 0
  for (const e of scene.levelElevations) if (e <= current + STEP && e > g) g = e
  return g
}

/**
 * Anda `dx, dz` a partir do estado: colide com paredes, segue o chão e não
 * entra no vão de escadas sem acesso. Desliza pelas paredes.
 */
export function stepWalker(w: Walker, dx: number, dz: number, scene: Scene3D, walls: BoxPiece[]): Walker {
  const tryMove = (nx: number, nz: number): Walker | null => {
    const [rx, rz] = resolveCollisions(nx, nz, w.ground, walls)
    const g = groundAt(rx, rz, w.ground, scene)
    return g === null ? null : { x: rx, z: rz, ground: g }
  }
  return tryMove(w.x + dx, w.z + dz) ?? tryMove(w.x + dx, w.z) ?? tryMove(w.x, w.z + dz) ?? w
}
