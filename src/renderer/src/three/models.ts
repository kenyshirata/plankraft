/**
 * Modelos 3D (.glb) dos blocos: leitura, normalização e cache.
 * O GLTFLoader é carregado sob demanda (junto da vista 3D / da importação).
 */
import * as THREE from 'three'
import type { BlockDef } from '@shared/blocks'

export interface LoadedModel {
  /** Modelo centrado em X/Z e apoiado em Y = 0, no tamanho original (m). */
  scene: THREE.Group
  size: THREE.Vector3
}

const cache = new Map<string, Promise<LoadedModel>>()

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

/** Lê o .glb (base64) e devolve o modelo normalizado. Lança erro amigável se não for legível. */
export async function parseGlb(data: string): Promise<LoadedModel> {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
  const buffer = base64ToArrayBuffer(data)
  const gltf = await new Promise<{ scene: THREE.Group }>((resolve, reject) => {
    new GLTFLoader().parse(buffer, '', resolve, (e) => reject(e instanceof Error ? e : new Error('Modelo 3D ilegível.')))
  })
  const box = new THREE.Box3().setFromObject(gltf.scene)
  const size = box.getSize(new THREE.Vector3())
  if (!Number.isFinite(size.x + size.y + size.z) || size.x <= 0 || size.z <= 0 || size.y <= 0) {
    throw new Error('O modelo está vazio ou sem volume.')
  }
  const center = box.getCenter(new THREE.Vector3())
  gltf.scene.position.set(-center.x, -box.min.y, -center.z)
  const wrapper = new THREE.Group()
  wrapper.add(gltf.scene)
  return { scene: wrapper, size }
}

/** Modelo do bloco (com cache por id + tamanho do conteúdo). */
export function loadModel(def: BlockDef): Promise<LoadedModel> {
  if (!def.model) return Promise.reject(new Error('Bloco sem modelo 3D.'))
  const key = `${def.id}:${def.model.data.length}`
  let p = cache.get(key)
  if (!p) {
    p = parseGlb(def.model.data)
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}
