/**
 * Vista 3D da planta (somente visualização). Reconstrói a cena sempre que o
 * documento muda, então acompanha as edições do 2D em tempo real.
 *
 * Câmera orbital (drei OrbitControls): arrastar gira, roda aproxima, botão
 * direito desloca. Atalhos de vista: topo, isométrica, frente, ajustar.
 * Carregado sob demanda (React.lazy) para não pesar a abertura do app.
 */
import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Box, Eye, ImageDown, Layers2, Maximize, Scissors, Sun, Tag } from 'lucide-react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { useAssetStore } from '@renderer/store/assetStore'
import { resolveBlock } from '@renderer/store/libraryStore'
import { useResolvedTheme } from '@renderer/theme'
import { formatNumber } from '@renderer/lib/format'
import { toast } from '@renderer/store/toastStore'
import { buildScene, type Scene3D } from './buildScene'

type ViewPreset = 'iso' | 'top' | 'front' | 'fit'

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

  const scene = useMemo(
    () =>
      buildScene(doc, {
        wallHeight: s.wallHeight3d,
        cutHeight: s.cutaway3d ? 1.2 : null,
        includeImages: s.background3d,
        resolveBlock: (id) => resolveBlock(id, doc),
        image: (key) => assets[key]?.image ?? null
      }),
    [doc, assets, s.wallHeight3d, s.cutaway3d, s.background3d]
  )

  // Libera as geometrias antigas quando a cena é reconstruída.
  useEffect(
    () => () => {
      scene.floors.forEach((f) => f.geometry.dispose())
      scene.furniture.forEach((f) => f.geometry.dispose())
    },
    [scene]
  )

  const exportPng = (): void => {
    const canvas = canvasRef.current
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${doc.name || 'planta'} - 3D.png`
    a.click()
    toast.success('Imagem 3D exportada.')
  }

  const bg = theme === 'dark' ? '#1b1d22' : '#eef1f5'

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
        <SceneContent scene={scene} shadows={s.shadows3d} labels={s.labels3d} dark={theme === 'dark'} />
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
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip="Exportar PNG" data-tooltip-pos="left" onClick={exportPng}>
          <ImageDown size={16} />
        </button>
      </div>
      <div className="viewer3d__hint">Arraste para girar · roda para aproximar · botão direito para deslocar</div>
    </div>
  )
}

const ImageDownIcon = (): React.JSX.Element => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="m3 15 5-5 4 4 3-3 6 6" />
  </svg>
)

function SceneContent({ scene, shadows, labels, dark }: { scene: Scene3D; shadows: boolean; labels: boolean; dark: boolean }): React.JSX.Element {
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
      <hemisphereLight args={[dark ? '#c9d4ff' : '#ffffff', dark ? '#2a2620' : '#b9ad99', dark ? 0.55 : 0.75]} />
      <directionalLight
        position={[cx + r * 1.2, r * 2.2, cz + r * 0.8]}
        intensity={dark ? 1.4 : 1.8}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-shadowSize}
        shadow-camera-right={shadowSize}
        shadow-camera-top={shadowSize}
        shadow-camera-bottom={-shadowSize}
        shadow-camera-far={r * 8}
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
        <mesh key={f.id} geometry={f.geometry} position={[0, 0.003, 0]} receiveShadow>
          <meshStandardMaterial color={f.color} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {scene.boxes.map((b, i) => (
        <mesh key={i} position={b.position} rotation-y={b.rotationY} castShadow={b.kind !== 'glass'} receiveShadow>
          <boxGeometry args={b.size} />
          {b.kind === 'glass' ? (
            <meshStandardMaterial color={b.color} transparent opacity={0.35} roughness={0.1} metalness={0.1} depthWrite={false} />
          ) : (
            <meshStandardMaterial color={b.color} roughness={b.kind === 'door' ? 0.6 : 0.85} />
          )}
        </mesh>
      ))}

      {scene.furniture.map((f, i) => (
        <mesh key={i} geometry={f.geometry} castShadow receiveShadow>
          <meshStandardMaterial color={f.color} roughness={0.7} />
        </mesh>
      ))}

      {labels &&
        scene.floors.map((f) => (
          <Html key={`l-${f.id}`} position={[f.center[0], 0.05, f.center[1]]} center zIndexRange={[10, 0]} className="viewer3d__label">
            <strong>{f.name}</strong>
            <span>{formatNumber(f.area, 2)} m²</span>
          </Html>
        ))}

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
    <mesh position={[im.center[0], 0.001, im.center[1]]} rotation={[-Math.PI / 2, 0, im.rotationY]} receiveShadow>
      <planeGeometry args={[im.width, im.height]} />
      <meshStandardMaterial map={texture} transparent opacity={im.opacity} roughness={1} />
    </mesh>
  )
}
