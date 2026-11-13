/**
 * Captura da maquete 3D em alta resolução: imagem (2K/4K) e panorama 360°
 * equirretangular (cubo → projeção). Roda sobre o renderer do React Three Fiber,
 * redimensionando-o temporariamente e restaurando em seguida.
 */
import * as THREE from 'three'

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png'))

/** Maior lado suportado pelo dispositivo (com folga). */
function maxSide(gl: THREE.WebGLRenderer): number {
  return Math.min(8192, gl.capabilities.maxTextureSize, 8192)
}

/** Renderiza a vista atual com `longSide` px no maior lado, mantendo a proporção da janela. */
export async function renderImage(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, longSide: number): Promise<Blob> {
  const prevSize = gl.getSize(new THREE.Vector2())
  const prevRatio = gl.getPixelRatio()
  const prevAspect = camera.aspect
  const aspect = prevSize.x / Math.max(prevSize.y, 1)
  const side = Math.min(longSide, maxSide(gl))
  const w = aspect >= 1 ? side : Math.round(side * aspect)
  const h = aspect >= 1 ? Math.round(side / aspect) : side
  try {
    gl.setPixelRatio(1)
    gl.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    gl.render(scene, camera)
    return await toBlob(gl.domElement)
  } finally {
    gl.setPixelRatio(prevRatio)
    gl.setSize(prevSize.x, prevSize.y, false)
    camera.aspect = prevAspect
    camera.updateProjectionMatrix()
    gl.render(scene, camera)
  }
}

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
// Centro da imagem = norte (−Z); direita = leste (+X).
const FRAG = `
uniform samplerCube tCube;
varying vec2 vUv;
void main(){
  float lon = (vUv.x - 0.5) * 6.28318530718;
  float lat = (vUv.y - 0.5) * 3.14159265359;
  vec3 dir = vec3(sin(lon) * cos(lat), sin(lat), -cos(lon) * cos(lat));
  gl_FragColor = textureCube(tCube, vec3(dir.x, dir.y, dir.z));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Panorama 360° (equirretangular, 2:1) a partir de `position` (m). `width` = largura em px. */
export async function renderPanorama(gl: THREE.WebGLRenderer, scene: THREE.Scene, position: THREE.Vector3, width: number): Promise<Blob> {
  const W = Math.min(width, maxSide(gl))
  const H = Math.round(W / 2)
  const cubeSize = Math.min(2048, Math.max(512, Math.pow(2, Math.ceil(Math.log2(W / 4)))))
  const rt = new THREE.WebGLCubeRenderTarget(cubeSize, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter })
  const cubeCam = new THREE.CubeCamera(0.05, 500, rt)
  cubeCam.position.copy(position)
  const quadScene = new THREE.Scene()
  const material = new THREE.ShaderMaterial({ uniforms: { tCube: { value: rt.texture } }, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  quadScene.add(quad)
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  const prevSize = gl.getSize(new THREE.Vector2())
  const prevRatio = gl.getPixelRatio()
  try {
    scene.add(cubeCam)
    cubeCam.update(gl, scene)
    scene.remove(cubeCam)
    gl.setPixelRatio(1)
    gl.setSize(W, H, false)
    gl.render(quadScene, ortho)
    return await toBlob(gl.domElement)
  } finally {
    gl.setPixelRatio(prevRatio)
    gl.setSize(prevSize.x, prevSize.y, false)
    rt.dispose()
    material.dispose()
    quad.geometry.dispose()
  }
}
