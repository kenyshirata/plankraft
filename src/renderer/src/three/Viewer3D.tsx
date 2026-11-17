/**
 * Vista 3D da planta (somente visualização). Reconstrói a cena sempre que o
 * documento muda, então acompanha as edições do 2D em tempo real.
 *
 * Câmera orbital (drei OrbitControls): arrastar gira, roda aproxima, botão
 * direito desloca. Atalhos de vista: topo, isométrica, frente, ajustar.
 * Carregado sob demanda (React.lazy) para não pesar a abertura do app.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Armchair, Box, Clock, Eye, Footprints, Globe, ImageDown, Layers2, Maximize, Scissors, Sun, Tag, X } from 'lucide-react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useAssetStore } from '@renderer/store/assetStore'
import { resolveBlock } from '@renderer/store/libraryStore'
import { useResolvedTheme } from '@renderer/theme'
import { formatNumber } from '@renderer/lib/format'
import { toast } from '@renderer/store/toastStore'
import { buildScene, type Scene3D } from './buildScene'
import { blockers, EYE_HEIGHT, stepWalker, type Walker } from './walk'
import { loadModel, type LoadedModel } from './models'
import { loadBuiltinModel } from './builtinModels'
import { formatHour, sunState } from './sun'
import { renderImage, renderPanorama } from './capture'
import { resolveMaterial } from '@shared/materials'
import { getTileCanvas } from '@renderer/lib/textures'

type ViewPreset = 'iso' | 'top' | 'front' | 'fit'

/** Ponte para as capturas em alta resolução (preenchida de dentro do Canvas). */
interface CaptureApi {
  image(longSide: number): Promise<Blob>
  panorama(x: number, y: number, z: number, width: number): Promise<Blob>
}

interface WalkStart {
  x: number
  z: number
  ground: number
  yaw: number
}

/** Ponte entre a barra de ferramentas (DOM) e a câmera (dentro do Canvas). */
const cameraBus = new EventTarget()
const goTo = (preset: ViewPreset): void => {
  cameraBus.dispatchEvent(new CustomEvent('view', { detail: preset }))
}

export default function Viewer3D(): React.JSX.Element {
  const doc = useEditorStore((s) => s.doc)
  const assets = useAssetStore((s) => s.assets)
  const s = useSettingsStore()
  const theme = useResolvedTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [walk, setWalk] = useState<WalkStart | null>(null)
  const [exportSize, setExportSize] = useState<'screen' | '2k' | '4k'>('2k')
  const [busy, setBusy] = useState(false)
  const capture = useRef<CaptureApi | null>(null)
  /** Posição atual do passeio (atualizada a cada quadro), usada pelo panorama. */
  const walkPos = useRef<Walker | null>(null)

  const scene = useMemo(
    () =>
      buildScene(doc, {
        wallHeight: s.wallHeight3d,
        cutHeight: s.cutaway3d && !walk ? 1.2 : null,
        includeImages: s.background3d,
        roof: s.roof3d,
        detailedModels: s.detailModels3d,
        resolveBlock: (id) => resolveBlock(id, doc),
        image: (key) => assets[key]?.image ?? null
      }),
    [doc, assets, s.wallHeight3d, s.cutaway3d, s.background3d, s.roof3d, s.detailModels3d, walk]
  )

  // Libera as geometrias antigas quando a cena é reconstruída.
  useEffect(
    () => () => {
      scene.roof?.geometry.dispose()
      scene.floors.forEach((f) => {
        f.geometry.dispose()
        f.slab?.dispose()
      })
      scene.furniture.forEach((f) => f.geometry.dispose())
    },
    [scene]
  )

  /** Grava o PNG via diálogo nativo (no navegador, baixa direto). */
  const savePng = async (blob: Blob, name: string): Promise<void> => {
    if (window.api) {
      const res = await window.api.saveImage({ suggestedName: name, data: new Uint8Array(await blob.arrayBuffer()) })
      if (res) toast.success(`Imagem salva: ${res.filePath}`)
      return
    }
    const url = URL.createObjectURL(blob)
    const el = document.createElement('a')
    el.href = url
    el.download = `${name}.png`
    el.click()
    URL.revokeObjectURL(url)
    toast.success('Imagem exportada.')
  }

  const exportPng = async (): Promise<void> => {
    const cap = capture.current
    if (!cap || busy) return
    setBusy(true)
    try {
      const canvas = canvasRef.current
      const side = exportSize === '4k' ? 3840 : exportSize === '2k' ? 2560 : Math.max(canvas?.width ?? 1280, canvas?.height ?? 720)
      const blob = await cap.image(side)
      await savePng(blob, `${doc.name || 'planta'} - 3D ${exportSize === 'screen' ? '' : exportSize.toUpperCase()}`.trim())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível exportar a imagem.')
    } finally {
      setBusy(false)
    }
  }

  /** Ponto de partida: cômodo selecionado ou o maior do andar ativo. */
  const pickStart = (): WalkStart | null => {
    const ed = useEditorStore.getState()
    const level = ed.doc.levels.find((l) => l.id === ed.activeLevelId)
    const elev = (level?.elevation ?? 0) / 100
    const onLevel = scene.floors.filter((f) => !f.zone && Math.abs(f.elevation - elev) < 1e-3)
    const pick = onLevel.find((f) => ed.selectedIds.includes(f.id)) ?? [...onLevel].sort((a, b) => b.area - a.area)[0]
    if (!pick) return null
    const [cx, cz] = scene.center
    const dx = cx - pick.center[0]
    const dz = cz - pick.center[1]
    const yaw = Math.hypot(dx, dz) > 0.5 ? Math.atan2(-dx, -dz) : 0
    return { x: pick.center[0], z: pick.center[1], ground: pick.elevation, yaw }
  }

  /** Panorama 360° a partir do ponto do passeio (se estiver andando) ou do cômodo escolhido. */
  const exportPanorama = async (): Promise<void> => {
    const cap = capture.current
    if (!cap || busy) return
    const here = walk && walkPos.current ? { x: walkPos.current.x, z: walkPos.current.z, ground: walkPos.current.ground } : pickStart()
    if (!here) {
      toast.info('Desenhe um cômodo neste andar (ou gere uma planta) para criar o panorama.')
      return
    }
    setBusy(true)
    try {
      const blob = await cap.panorama(here.x, here.ground + EYE_HEIGHT, here.z, exportSize === '4k' ? 8192 : 4096)
      await savePng(blob, `${doc.name || 'planta'} - panorama 360`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o panorama.')
    } finally {
      setBusy(false)
    }
  }

  /** Começa o passeio no cômodo selecionado (ou no maior do andar ativo). */
  const startWalk = (): void => {
    const start = pickStart()
    if (!start) {
      toast.info('Desenhe um cômodo neste andar (ou gere uma planta) para começar o passeio.')
      return
    }
    setWalk(start)
  }

  const sun = useMemo(() => sunState(s.sunHour), [s.sunHour])
  // Céu: mistura a cor do tema com a do horário (a noite escurece, o fim de tarde esquenta).
  const bg = useMemo(() => new THREE.Color(theme === 'dark' ? '#1b1d22' : '#eef1f5').lerp(new THREE.Color(sun.sky), 0.55).getStyle(), [theme, sun.sky])

  return (
    <div className="viewer3d">
      <Canvas
        ref={canvasRef}
        shadows={s.shadows3d}
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ fov: 45, near: 0.1, far: 500, position: [10, 10, 10] }}
      >
        <color attach="background" args={[bg]} />
        <CaptureBridge api={capture} />
        <SceneContent scene={scene} shadows={s.shadows3d} labels={s.labels3d && !walk && !scene.roof} dark={theme === 'dark'} sun={sun} walk={walk} walkPos={walkPos} onExit={() => setWalk(null)} />
      </Canvas>

      {scene.empty && <div className="viewer3d__empty">Desenhe paredes no 2D (ou gere uma planta) para ver a maquete 3D.</div>}

      <div className="viewer3d__bar" role="toolbar" aria-label="Vista 3D">
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip="Isométrica" onClick={() => goTo('iso')}>
          <Box size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip="Vista de topo" onClick={() => goTo('top')}>
          <Layers2 size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip="Fachada frontal" onClick={() => goTo('front')}>
          <Eye size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip="Ajustar à tela" onClick={() => goTo('fit')}>
          <Maximize size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn icon-btn--sm${walk ? ' is-on' : ''}`}
          aria-pressed={!!walk}
          data-tooltip="Passeio em primeira pessoa"
          onClick={() => (walk ? setWalk(null) : startWalk())}
        >
          <Footprints size={16} />
        </button>
        <span className="toolbar__sep" />
        <button
          type="button"
          className={`icon-btn icon-btn--sm${s.cutaway3d ? ' is-on' : ''}`}
          aria-pressed={s.cutaway3d}
          data-tooltip="Cortar paredes a 1,20 m"
          onClick={() => s.toggle('cutaway3d')}
        >
          <Scissors size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn icon-btn--sm${s.detailModels3d ? ' is-on' : ''}`}
          aria-pressed={s.detailModels3d}
          data-tooltip="Móveis detalhados (modelos 3D)"
          onClick={() => s.toggle('detailModels3d')}
        >
          <Armchair size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn icon-btn--sm${s.labels3d ? ' is-on' : ''}`}
          aria-pressed={s.labels3d}
          data-tooltip="Nomes dos cômodos"
          onClick={() => s.toggle('labels3d')}
        >
          <Tag size={16} />
        </button>
        <button
          type="button"
          className={`icon-btn icon-btn--sm${s.shadows3d ? ' is-on' : ''}`}
          aria-pressed={s.shadows3d}
          data-tooltip="Sombras"
          onClick={() => s.toggle('shadows3d')}
        >
          <Sun size={16} />
        </button>
        {doc.objects.some((o) => o.type === 'image') && (
          <button
            type="button"
            className={`icon-btn icon-btn--sm${s.background3d ? ' is-on' : ''}`}
            aria-pressed={s.background3d}
            data-tooltip="Imagem de fundo no chão"
            onClick={() => s.toggle('background3d')}
          >
            <ImageDownIcon />
          </button>
        )}
        <span className="toolbar__sep" />
        <label className="viewer3d__roof" data-tooltip="Telhado">
          <select
            className="select"
            value={s.roof3d}
            aria-label="Telhado"
            onChange={(e) => s.set('roof3d', e.target.value as typeof s.roof3d)}
          >
            <option value="off">Sem telhado</option>
            <option value="flat">Laje plana</option>
            <option value="gable">Duas águas</option>
            <option value="hip">Quatro águas</option>
          </select>
        </label>
        <label className="viewer3d__height" data-tooltip="Altura das paredes">
          <input
            type="range"
            min={2.2}
            max={4}
            step={0.1}
            value={s.wallHeight3d}
            aria-label="Altura das paredes"
            onChange={(e) => s.set('wallHeight3d', Number(e.target.value))}
          />
          <span>{formatNumber(s.wallHeight3d, 1)} m</span>
        </label>
        <span className="toolbar__sep" />
        <label className="viewer3d__hour" data-tooltip="Hora do dia (sol e céu)">
          <Clock size={14} />
          <input
            type="range"
            min={4}
            max={21}
            step={0.25}
            value={s.sunHour}
            aria-label="Hora do dia"
            onChange={(e) => s.set('sunHour', Number(e.target.value))}
          />
          <span>{formatHour(s.sunHour)}</span>
        </label>
        <span className="toolbar__sep" />
        <select className="select viewer3d__size" value={exportSize} aria-label="Tamanho da imagem" onChange={(e) => setExportSize(e.target.value as typeof exportSize)}>
          <option value="screen">Tela</option>
          <option value="2k">2K</option>
          <option value="4k">4K</option>
        </select>
        <button type="button" className="icon-btn icon-btn--sm" disabled={busy} data-tooltip="Exportar PNG" data-tooltip-pos="left" onClick={() => void exportPng()}>
          <ImageDown size={16} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" disabled={busy} data-tooltip="Panorama 360° (PNG)" data-tooltip-pos="left" onClick={() => void exportPanorama()}>
          <Globe size={16} />
        </button>
      </div>
      {walk ? (
        <div className="viewer3d__walkhud">
          <span>
            <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> andar · <kbd>Shift</kbd> correr · <kbd>←</kbd> <kbd>→</kbd> ou arrastar para olhar
          </span>
          <button type="button" className="btn btn--sm" onClick={() => setWalk(null)}>
            <X size={13} /> Sair (Esc)
          </button>
        </div>
      ) : (
        <div className="viewer3d__hint">Arraste para girar · roda para aproximar · botão direito para deslocar</div>
      )}
    </div>
  )
}

const ImageDownIcon = (): React.JSX.Element => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="m3 15 5-5 4 4 3-3 6 6" />
  </svg>
)

function SceneContent({
  scene,
  shadows,
  labels,
  dark,
  sun,
  walk,
  walkPos,
  onExit
}: {
  scene: Scene3D
  shadows: boolean
  labels: boolean
  dark: boolean
  sun: ReturnType<typeof sunState>
  walk: WalkStart | null
  walkPos: React.MutableRefObject<Walker | null>
  onExit: () => void
}): React.JSX.Element {
  const controls = useRef<OrbitControlsImpl>(null)
  const { camera } = useThree()
  const [cx, cz] = scene.center
  const r = scene.radius

  // Posiciona a câmera para um preset; mantém o alvo no centro da planta.
  const apply = (preset: ViewPreset): void => {
    const d = r * 2.4
    const pos: Record<ViewPreset, [number, number, number]> = {
      iso: [cx + d * 0.7, d * 0.75, cz + d * 0.7],
      top: [cx, d * 1.25, cz + 0.001],
      // Fachada frontal: a frente da casa é o lado de cima do desenho 2D (y menor → z menor).
      front: [cx, d * 0.3, cz - d * 1.05],
      fit: [cx + d * 0.7, d * 0.75, cz + d * 0.7]
    }
    camera.position.set(...pos[preset])
    controls.current?.target.set(cx, 0, cz)
    controls.current?.update()
  }

  // Enquadra ao abrir; presets vindos da barra.
  const framed = useRef(false)
  useEffect(() => {
    if (!framed.current && !scene.empty) {
      framed.current = true
      apply('iso')
    }
    const onView = (e: Event): void => apply((e as CustomEvent<ViewPreset>).detail)
    cameraBus.addEventListener('view', onView)
    return () => cameraBus.removeEventListener('view', onView)
  })

  const shadowSize = Math.max(8, r * 1.6)
  return (
    <>
      <hemisphereLight args={[sun.hemiSky, sun.hemiGround, sun.hemi]} />
      <directionalLight
        position={[cx + sun.dir[0] * (r * 3 + 12), sun.dir[1] * (r * 3 + 12), cz + sun.dir[2] * (r * 3 + 12)]}
        color={sun.color}
        intensity={sun.intensity}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-shadowSize}
        shadow-camera-right={shadowSize}
        shadow-camera-top={shadowSize}
        shadow-camera-bottom={-shadowSize}
        shadow-camera-far={r * 10 + 40}
      >
        <object3D attach="target" position={[cx, 0, cz]} />
      </directionalLight>

      {/* Terreno */}
      <mesh rotation-x={-Math.PI / 2} position={[cx, -0.001, cz]} receiveShadow>
        <planeGeometry args={[r * 8, r * 8]} />
        <meshStandardMaterial color={dark ? '#24272d' : '#dfe3e8'} roughness={1} />
      </mesh>

      {scene.images.map((im) => (
        <BackgroundPlane key={im.id} im={im} />
      ))}

      {scene.floors.map((f) => (
        <FloorMesh key={f.id} f={f} />
      ))}

      {scene.roof && (
        <mesh geometry={scene.roof.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={scene.roof.color} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      )}

      {scene.boxes.map((b, i) => (
        <BoxMesh key={i} b={b} />
      ))}

      {scene.models.map((m) => (
        <ModelMesh key={m.key} m={m} />
      ))}

      {scene.furniture.map((f, i) => (
        <mesh key={i} geometry={f.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={f.color} roughness={0.7} />
        </mesh>
      ))}

      {labels &&
        scene.floors.filter((f) => f.zone !== 'drop').map((f) => (
          <Html key={`l-${f.id}`} position={[f.center[0], f.elevation + 0.05, f.center[1]]} center zIndexRange={[10, 0]} className="viewer3d__label">
            <strong>{f.name}</strong>
            <span>{formatNumber(f.area, 2)} m²</span>
          </Html>
        ))}

      {walk && scene.floors.filter((f) => f.topLevel && !f.zone).map((f) => (
        <mesh key={`ceil-${f.id}`} geometry={f.geometry} position={[0, f.ceilingY - f.elevation, 0]}>
          <meshStandardMaterial color="#f4f2ee" roughness={1} side={THREE.BackSide} />
        </mesh>
      ))}

      {walk ? (
        <WalkRig scene={scene} start={walk} posRef={walkPos} onExit={onExit} onLeave={() => apply('iso')} />
      ) : (
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          dampingFactor={0.12}
          maxPolarAngle={Math.PI / 2 - 0.04}
          minDistance={1.5}
          maxDistance={r * 10}
          target={[cx, 0, cz]}
        />
      )}
    </>
  )
}

function BackgroundPlane({ im }: { im: Scene3D['images'][number] }): React.JSX.Element {
  const texture = useMemo(() => {
    const t = new THREE.Texture(im.image)
    t.colorSpace = THREE.SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [im.image])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={[im.center[0], im.y + 0.001, im.center[1]]} rotation={[-Math.PI / 2, 0, im.rotationY]} receiveShadow>
      <planeGeometry args={[im.width, im.height]} />
      <meshStandardMaterial map={texture} transparent opacity={im.opacity} roughness={1} />
    </mesh>
  )
}

// --------------------------------------------------------------- texturas dos materiais

const baseTextures = new Map<string, THREE.CanvasTexture>()

/** Textura do material com repetição em unidades de ladrilho (clone leve, mesma imagem). */
function useMaterialTexture(id: string | undefined, repeatX: number, repeatY: number): THREE.Texture | null {
  const tex = useMemo(() => {
    if (!id) return null
    const canvas = getTileCanvas(id)
    if (!canvas) return null
    let base = baseTextures.get(id)
    if (!base) {
      base = new THREE.CanvasTexture(canvas)
      base.colorSpace = THREE.SRGBColorSpace
      base.wrapS = base.wrapT = THREE.RepeatWrapping
      base.anisotropy = 4
      baseTextures.set(id, base)
    }
    const t = base.clone()
    t.repeat.set(repeatX, repeatY)
    t.needsUpdate = true
    return t
  }, [id, repeatX, repeatY])
  useEffect(() => () => tex?.dispose(), [tex])
  return tex
}

const tileMeters = (id: string | undefined): number => (resolveMaterial(id)?.tileCm ?? 100) / 100

function FloorMesh({ f }: { f: Scene3D['floors'][number] }): React.JSX.Element {
  const k = 1 / tileMeters(f.texture)
  const map = useMaterialTexture(f.texture, k, k)
  return (
    <>
      <mesh geometry={f.geometry} position={[0, 0.003, 0]} receiveShadow>
        <meshStandardMaterial
          color={map ? '#ffffff' : f.color}
          map={map}
          roughness={f.zone === 'pool' ? 0.12 : 0.9}
          metalness={f.zone === 'pool' ? 0.25 : 0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {f.slab && (
        <mesh geometry={f.slab} castShadow receiveShadow>
          <meshStandardMaterial color="#d9d6d0" roughness={0.95} />
        </mesh>
      )}
    </>
  )
}

function BoxMesh({ b }: { b: Scene3D['boxes'][number] }): React.JSX.Element {
  const tm = tileMeters(b.texture)
  const map = useMaterialTexture(b.texture, b.size[0] / tm, b.size[1] / tm)
  return (
    <mesh position={b.position} rotation-y={b.rotationY} castShadow={b.kind !== 'glass'} receiveShadow>
      <boxGeometry args={b.size} />
      {b.kind === 'glass' ? (
        <meshStandardMaterial color={b.color} transparent opacity={0.35} roughness={0.1} metalness={0.1} depthWrite={false} />
      ) : (
        <meshStandardMaterial color={map ? '#ffffff' : b.color} map={map} roughness={b.kind === 'door' ? 0.6 : 0.85} />
      )}
    </mesh>
  )
}

// --------------------------------------------------------------- passeio em primeira pessoa

const WALK_SPEED = 1.5
const RUN_FACTOR = 2.2

/** Câmera na altura dos olhos: WASD/setas, arrastar para olhar, colisão com paredes e escadas. */
function WalkRig({
  scene,
  start,
  posRef,
  onExit,
  onLeave
}: {
  scene: Scene3D
  start: WalkStart
  posRef: React.MutableRefObject<Walker | null>
  onExit: () => void
  onLeave: () => void
}): null {
  const { camera, gl } = useThree()
  const walls = useMemo(() => blockers(scene), [scene])
  const sceneRef = useRef(scene)
  sceneRef.current = scene
  const wallsRef = useRef(walls)
  wallsRef.current = walls
  const me = useRef<Walker>({ x: start.x, z: start.z, ground: start.ground })
  const look = useRef({ yaw: start.yaw, pitch: 0 })
  const eye = useRef(start.ground + EYE_HEIGHT)
  const keys = useRef(new Set<string>())
  const exitRef = useRef(onExit)
  exitRef.current = onExit
  const leaveRef = useRef(onLeave)
  leaveRef.current = onLeave

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    const prev = { fov: cam.fov, near: cam.near }
    cam.fov = 70
    cam.near = 0.05
    cam.rotation.order = 'YXZ'
    cam.updateProjectionMatrix()
    return () => {
      cam.fov = prev.fov
      cam.near = prev.near
      cam.rotation.order = 'XYZ'
      cam.updateProjectionMatrix()
      leaveRef.current()
    }
  }, [camera])

  useEffect(() => {
    const typing = (t: EventTarget | null): boolean => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
    const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'])
    const down = (e: KeyboardEvent): void => {
      if (typing(e.target)) return
      if (e.code === 'Escape') {
        e.stopImmediatePropagation()
        exitRef.current()
        return
      }
      if (MOVE.has(e.code) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Evita que W/A/S/D acionem as ferramentas do editor enquanto se anda.
        e.stopImmediatePropagation()
        e.preventDefault()
        keys.current.add(e.code)
      }
    }
    const up = (e: KeyboardEvent): void => void keys.current.delete(e.code)
    const blur = (): void => keys.current.clear()
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    }
  }, [])

  useEffect(() => {
    const el = gl.domElement
    let drag = false
    const onDown = (e: PointerEvent): void => {
      drag = true
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent): void => {
      if (!drag) return
      look.current.yaw -= e.movementX * 0.0035
      look.current.pitch = Math.max(-1.3, Math.min(1.3, look.current.pitch - e.movementY * 0.0035))
    }
    const onUp = (e: PointerEvent): void => {
      drag = false
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
  }, [gl])

  useFrame((_, dt) => {
    const k = keys.current
    const l = look.current
    const d = Math.min(dt, 0.1)
    if (k.has('ArrowLeft')) l.yaw += 1.8 * d
    if (k.has('ArrowRight')) l.yaw -= 1.8 * d
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)
    const side = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0)
    if (fwd || side) {
      const speed = WALK_SPEED * (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN_FACTOR : 1) * d
      const sin = Math.sin(l.yaw)
      const cos = Math.cos(l.yaw)
      // frente = (−sin, −cos); direita = (cos, −sin)
      const dx = (-sin * fwd + cos * side) * speed
      const dz = (-cos * fwd - sin * side) * speed
      me.current = stepWalker(me.current, dx, dz, sceneRef.current, wallsRef.current)
    }
    // Suaviza a subida/descida (escadas) e o olhar.
    eye.current += (me.current.ground + EYE_HEIGHT - eye.current) * Math.min(1, d * 12)
    camera.position.set(me.current.x, eye.current, me.current.z)
    camera.rotation.set(l.pitch, l.yaw, 0)
    posRef.current = me.current
    if (import.meta.env.DEV) (window as unknown as { __walk: unknown }).__walk = { ...me.current, yaw: l.yaw, eye: eye.current }
  })
  return null
}

// --------------------------------------------------------------- modelos 3D dos blocos

/** Modelo .glb de um bloco, ajustado à pegada da instância (carrega de forma assíncrona). */
function ModelMesh({ m }: { m: Scene3D['models'][number] }): React.JSX.Element | null {
  const [loaded, setLoaded] = useState<LoadedModel | null>(null)
  const len = m.def.model?.data.length ?? 0
  useEffect(() => {
    let alive = true
    const pending = m.builtin ? loadBuiltinModel(m.builtin.file) : loadModel(m.def)
    pending.then((l) => alive && setLoaded(l)).catch(() => alive && setLoaded(null))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.def.id, len, m.builtin?.file])
  const obj = useMemo(() => {
    if (!loaded) return null
    const g = loaded.scene.clone(true)
    g.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return g
  }, [loaded])
  if (!obj || !loaded) return null
  const sx = m.dims[0] / Math.max(loaded.size.x, 1e-6)
  const sz = m.dims[1] / Math.max(loaded.size.z, 1e-6)
  const sy = (sx + sz) / 2
  return (
    <group position={m.position} rotation-y={m.rotationY + ((m.builtin?.yaw ?? 0) * Math.PI) / 180} scale={[sx * (m.flipX ? -1 : 1), sy, sz * (m.flipY ? -1 : 1)]}>
      <primitive object={obj} />
    </group>
  )
}

/** Entrega ao Viewer3D as funções de captura em alta resolução (usam o renderer do Canvas). */
function CaptureBridge({ api }: { api: React.MutableRefObject<CaptureApi | null> }): null {
  const get = useThree((st) => st.get)
  useEffect(() => {
    api.current = {
      image: (side) => {
        const { gl, scene, camera } = get()
        return renderImage(gl, scene, camera as THREE.PerspectiveCamera, side)
      },
      panorama: (x, y, z, width) => {
        const { gl, scene } = get()
        return renderPanorama(gl, scene, new THREE.Vector3(x, y, z), width)
      }
    }
    return () => {
      api.current = null
    }
  }, [api, get])
  return null
}
