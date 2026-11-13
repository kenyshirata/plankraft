import { useEffect, useState } from 'react'
import {
  FlipHorizontal2,
  FlipVertical2,
  Eye,
  EyeOff,
  ImageIcon,
  Lock,
  LockOpen,
  Ruler,
  MousePointerClick,
  PackagePlus,
  RefreshCw,
  Repeat,
  RotateCw,
  Settings2,
  SlidersHorizontal,
  Trash2
} from 'lucide-react'
import { patchBlock, setBlockSize } from '@renderer/store/blockActions'
import { resolveBlock } from '@renderer/store/libraryStore'
import { BlockSvg } from './BlockSvg'
import { AiSettings } from './AiSettings'
import { MaterialSwatch } from './MaterialsPanel'
import { resolveMaterial } from '@shared/materials'
import { applyMaterial } from '@renderer/store/materialActions'
import { openOnboarding } from './Onboarding'
import { useAssetImage } from '@renderer/store/assetStore'
import { cmPerPixel } from '@renderer/lib/imageGeometry'
import { patchImage, setImageCmPerPixel, setImageView, startCalibration } from '@renderer/store/imageActions'
import { openBlockDialog } from './BlockDialog'
import type {
  BlockObject,
  ImageObject,
  DimensionObject,
  DoorObject,
  LengthUnit,
  OpeningObject,
  PlanObject,
  RoomObject,
  TextObject,
  WallObject
} from '@shared/model'
import { add, angleDeg, distance, mul, normalize, polygonArea, polygonPerimeter, sub } from '@renderer/lib/geometry'
import { formatAngle, formatArea, formatLength, fromCm, toCm } from '@renderer/lib/format'
import { clampOffset } from '@renderer/lib/openings'
import { useEditorStore } from '@renderer/store/editorStore'
import { mapObjects, updateObject } from '@renderer/store/docOps'
import {
  flipDoorSide,
  generateMissingDimensions,
  refreshRoomFromWalls,
  resetDimensionOffset,
  ROOM_COLORS,
  toggleDoorHinge
} from '@renderer/store/actions'
import { measuredSegment } from '@renderer/lib/dimensions'
import { moveSelectionToLayer } from '@renderer/store/layerActions'
import {
  useSettingsStore,
  type CornerAngleMode,
  type DimensionStyle,
  type Precision,
  type ThemePreference
} from '@renderer/store/settingsStore'
import { NumberField } from './ui/NumberField'
import { Tabs } from './ui/Tabs'

type RightTab = 'props' | 'settings'

/** Painel direito: Propriedades do objeto selecionado e Configurações globais. */
export function RightPanel(): React.JSX.Element {
  const [tab, setTab] = useState<RightTab>('props')
  // "Configurar chave" (modal da IA) abre esta aba e rola até a seção de IA.
  useEffect(() => {
    const open = (): void => {
      setTab('settings')
      window.setTimeout(() => document.getElementById('ai-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    }
    window.addEventListener('plankraft:open-ai-settings', open)
    return () => window.removeEventListener('plankraft:open-ai-settings', open)
  }, [])
  return (
    <aside className="panel panel--right">
      <Tabs<RightTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'props', label: 'Propriedades', icon: SlidersHorizontal },
          { value: 'settings', label: 'Configurações', icon: Settings2 }
        ]}
      />
      <div className="panel__body">{tab === 'props' ? <Properties /> : <SettingsForm />}</div>
    </aside>
  )
}

const TYPE_LABEL: Record<PlanObject['type'], [string, string]> = {
  wall: ['Parede', 'paredes'],
  door: ['Porta', 'portas'],
  window: ['Janela', 'janelas'],
  room: ['Cômodo', 'cômodos'],
  text: ['Texto', 'textos'],
  dimension: ['Cota', 'cotas'],
  block: ['Bloco', 'blocos'],
  image: ['Imagem de fundo', 'imagens']
}

const commit = (recipe: Parameters<ReturnType<typeof useEditorStore.getState>['commit']>[0]): void =>
  useEditorStore.getState().commit(recipe)

// --------------------------------------------------------------- Propriedades

function Properties(): React.JSX.Element {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const objects = useEditorStore((s) => s.doc.objects)
  const { unit, precision } = useSettingsStore()
  const selected = objects.filter((o) => selectedIds.includes(o.id))

  if (selected.length === 0) return <DocumentSummary objects={objects} unit={unit} precision={precision} />

  const deleteBtn = (
    <button type="button" className="btn btn--danger btn--block" onClick={() => useEditorStore.getState().deleteSelection()}>
      <Trash2 size={14} /> Excluir {selected.length > 1 ? `${selected.length} objetos` : TYPE_LABEL[selected[0].type][0].toLowerCase()}
    </button>
  )

  if (selected.length > 1) {
    const walls = selected.filter((o): o is WallObject => o.type === 'wall')
    const thicknesses = new Set(walls.map((w) => w.thickness))
    const counts = Object.entries(
      selected.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.type]: (acc[o.type] ?? 0) + 1 }), {})
    )
      .map(([type, n]) => `${n} ${n === 1 ? TYPE_LABEL[type as PlanObject['type']][0].toLowerCase() : TYPE_LABEL[type as PlanObject['type']][1]}`)
      .join(', ')
    return (
      <div className="form">
        <p className="form__title">{selected.length} objetos selecionados</p>
        <p className="form__note">{counts}</p>
        {walls.length > 0 && (
          <Field label="Espessura das paredes">
            <NumberField
              value={thicknesses.size === 1 ? walls[0].thickness : 0}
              min={1}
              max={200}
              suffix="cm"
              onCommit={(v) =>
                commit((d) => mapObjects(d, walls.map((w) => w.id), (o) => (o.type === 'wall' ? { ...o, thickness: v } : o)))
              }
            />
          </Field>
        )}
        <MultiLayerField ids={selected.map((o) => o.id)} />
        <button type="button" className="btn btn--block" onClick={() => openBlockDialog({ mode: 'create' })}>
          <PackagePlus size={14} /> Salvar como bloco…
        </button>
        {deleteBtn}
      </div>
    )
  }

  const obj = selected[0]
  return (
    <div className="form">
      <p className="form__title">{TYPE_LABEL[obj.type][0]}</p>
      {obj.type === 'wall' && <WallProps wall={obj} unit={unit} precision={precision} />}
      {(obj.type === 'door' || obj.type === 'window') && <OpeningProps opening={obj} unit={unit} precision={precision} />}
      {obj.type === 'room' && <RoomProps room={obj} unit={unit} precision={precision} />}
      {obj.type === 'text' && <TextProps text={obj} />}
      {obj.type === 'dimension' && <DimensionProps dim={obj} unit={unit} precision={precision} />}
      {obj.type === 'block' && <BlockProps block={obj} />}
      {obj.type === 'image' && <ImageProps image={obj} unit={unit} precision={precision} />}
      <LayerField obj={obj} />
      {deleteBtn}
    </div>
  )
}

function DocumentSummary({ objects, unit, precision }: { objects: PlanObject[]; unit: LengthUnit; precision: Precision }): React.JSX.Element {
  const walls = objects.filter((o): o is WallObject => o.type === 'wall')
  const rooms = objects.filter((o): o is RoomObject => o.type === 'room')
  const count = (t: PlanObject['type']): number => objects.filter((o) => o.type === t).length
  return (
    <div className="empty-state">
      <MousePointerClick size={28} strokeWidth={1.5} />
      <p className="empty-state__title">Nada selecionado</p>
      <p className="empty-state__text">
        Use a ferramenta <strong>Parede (W)</strong> para desenhar, ou <strong>Selecionar (V)</strong> para editar um objeto.
      </p>
      <dl className="stats">
        <dt>Paredes</dt>
        <dd>{walls.length}</dd>
        <dt>Comprimento de paredes</dt>
        <dd>{formatLength(walls.reduce((s, w) => s + distance(w.a, w.b), 0), unit, precision)}</dd>
        <dt>Portas / janelas</dt>
        <dd>
          {count('door')} / {count('window')}
        </dd>
        <dt>Cômodos</dt>
        <dd>{rooms.length}</dd>
        <dt>Área total</dt>
        <dd>{formatArea(rooms.reduce((s, r) => s + polygonArea(r.points), 0), unit, precision)}</dd>
      </dl>
      <BackgroundImagesCard />
      {rooms.length > 0 && (
        <dl className="stats stats--rooms">
          {rooms.map((r) => (
            <RoomRow key={r.id} room={r} unit={unit} precision={precision} />
          ))}
        </dl>
      )}
    </div>
  )
}

function RoomRow({ room, unit, precision }: { room: RoomObject; unit: LengthUnit; precision: Precision }): React.JSX.Element {
  return (
    <>
      <dt>
        <span className="color-dot" style={{ background: room.color }} />
        {room.name}
      </dt>
      <dd>{formatArea(polygonArea(room.points), unit, precision)}</dd>
    </>
  )
}

function WallProps({ wall, unit, precision }: { wall: WallObject; unit: LengthUnit; precision: Precision }): React.JSX.Element {
  const len = distance(wall.a, wall.b)
  /** Altera o comprimento mantendo o ponto A e a direção. */
  const setLength = (displayValue: number): void => {
    const cm = toCm(displayValue, unit)
    if (cm < 1) return
    const dir = normalize(sub(wall.b, wall.a))
    commit((d) => updateObject(d, wall.id, 'wall', (o) => ({ ...o, b: add(o.a, mul(dir, cm)) })))
  }
  return (
    <>
      <Field label="Comprimento">
        <NumberField value={fromCm(len, unit)} precision={precision} min={0} suffix={unit} onCommit={setLength} />
      </Field>
      <Field label="Espessura">
        <NumberField
          value={wall.thickness}
          min={1}
          max={200}
          suffix="cm"
          onCommit={(v) => commit((d) => updateObject(d, wall.id, 'wall', (o) => ({ ...o, thickness: v })))}
        />
      </Field>
      <MaterialField id={wall.material} label="Acabamento" />
      <Field label="Ângulo">
        <span className="readout">{formatAngle(-angleDeg(wall.a, wall.b))}</span>
      </Field>
      <Field label="Início (x, y)">
        <span className="readout">
          {formatLength(wall.a.x, unit, precision)}, {formatLength(wall.a.y, unit, precision)}
        </span>
      </Field>
    </>
  )
}

function OpeningProps({ opening, unit, precision }: { opening: OpeningObject; unit: LengthUnit; precision: Precision }): React.JSX.Element {
  const wall = useEditorStore((s) =>
    s.doc.objects.find((o): o is WallObject => o.id === opening.wallId && o.type === 'wall')
  )
  if (!wall) return <p className="form__note">Parede hospedeira não encontrada.</p>
  const len = distance(wall.a, wall.b)
  const offset = clampOffset(opening.offset, opening.width, len)
  const setPatch = (patch: Partial<OpeningObject>): void =>
    commit((d) => mapObjects(d, [opening.id], (o) => (o.type === opening.type ? ({ ...o, ...patch } as PlanObject) : o)))
  return (
    <>
      <Field label="Largura">
        <NumberField
          value={opening.width}
          min={20}
          max={Math.max(20, Math.floor(len - 10))}
          suffix="cm"
          onCommit={(width) => setPatch({ width, offset: clampOffset(opening.offset, width, len) })}
        />
      </Field>
      <Field label="Do início da parede">
        <NumberField
          value={fromCm(offset - opening.width / 2, unit)}
          precision={precision}
          min={0}
          suffix={unit}
          onCommit={(v) => setPatch({ offset: clampOffset(toCm(v, unit) + opening.width / 2, opening.width, len) })}
        />
      </Field>
      <Field label="Parede">
        <span className="readout">
          {formatLength(len, unit, precision)} · esp. {wall.thickness} cm
        </span>
      </Field>
      {opening.type === 'door' && <DoorButtons door={opening} />}
    </>
  )
}

function DoorButtons({ door }: { door: DoorObject }): React.JSX.Element {
  return (
    <div className="button-row">
      <button type="button" className="btn" onClick={() => flipDoorSide(door.id)}>
        <FlipHorizontal2 size={14} /> Inverter lado
      </button>
      <button type="button" className="btn" onClick={() => toggleDoorHinge(door.id)}>
        <Repeat size={14} /> Dobradiça
      </button>
    </div>
  )
}

function RoomProps({ room, unit, precision }: { room: RoomObject; unit: LengthUnit; precision: Precision }): React.JSX.Element {
  return (
    <>
      <Field label="Nome">
        <input
          key={room.id + room.name}
          className="text-input"
          defaultValue={room.name}
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== room.name) commit((d) => updateObject(d, room.id, 'room', (r) => ({ ...r, name })))
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </Field>
      <Field label="Área útil">
        <span className="readout readout--strong">{formatArea(polygonArea(room.points), unit, precision)}</span>
      </Field>
      <Field label="Perímetro">
        <span className="readout">{formatLength(polygonPerimeter(room.points), unit, precision)}</span>
      </Field>
      <Field label="Cor">
        <div className="swatches">
          {ROOM_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              className={`swatch${room.color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => commit((d) => updateObject(d, room.id, 'room', (r) => ({ ...r, color: c })))}
            />
          ))}
        </div>
      </Field>
      <MaterialField id={room.material} label="Piso" />
      <button type="button" className="btn btn--block" onClick={() => refreshRoomFromWalls(room.id)}>
        <RefreshCw size={14} /> Atualizar pelas paredes
      </button>
    </>
  )
}

/** Mostra o material atual e leva à aba Materiais para trocá-lo. */
function MaterialField({ id, label }: { id: string | undefined; label: string }): React.JSX.Element {
  const def = resolveMaterial(id)
  return (
    <Field label={label}>
      <div className="material-field">
        {def ? <MaterialSwatch def={def} /> : <span className="mat-swatch mat-swatch--none" />}
        <span className="material-field__name">{def?.name ?? 'Padrão'}</span>
        <button type="button" className="btn btn--sm" onClick={() => useEditorStore.getState().setLeftTab('materials')}>
          Escolher
        </button>
        {def && (
          <button type="button" className="btn btn--sm" onClick={() => applyMaterial(null)} aria-label="Remover acabamento">
            Remover
          </button>
        )}
      </div>
    </Field>
  )
}

function TextProps({ text }: { text: TextObject }): React.JSX.Element {
  const patch = (p: Partial<TextObject>): void => commit((d) => updateObject(d, text.id, 'text', (t) => ({ ...t, ...p })))
  return (
    <>
      <Field label="Conteúdo">
        <textarea
          key={text.id + text.text}
          className="text-input text-input--area"
          defaultValue={text.text}
          rows={3}
          onBlur={(e) => {
            const value = e.target.value.replace(/\s+$/, '')
            if (value && value !== text.text) patch({ text: value })
          }}
        />
      </Field>
      <Field label="Tamanho">
        <NumberField value={text.fontSize} min={2} max={500} suffix="cm" onCommit={(fontSize) => patch({ fontSize })} />
      </Field>
      <Field label="Rotação">
        <NumberField value={text.rotation} min={-360} max={360} suffix="°" onCommit={(rotation) => patch({ rotation })} />
      </Field>
    </>
  )
}

/** Mover vários objetos de uma vez para outra camada. */
function MultiLayerField({ ids }: { ids: string[] }): React.JSX.Element {
  const layers = useEditorStore((s) => s.doc.layers)
  const objects = useEditorStore((s) => s.doc.objects)
  const layerIds = new Set(objects.filter((o) => ids.includes(o.id)).map((o) => o.layerId))
  const current = layerIds.size === 1 ? [...layerIds][0] : ''
  return (
    <Field label="Camada">
      <select className="select" value={current} onChange={(e) => e.target.value && moveSelectionToLayer(e.target.value)}>
        {current === '' && <option value="">(várias)</option>}
        {layers.map((l) => (
          <option key={l.id} value={l.id} disabled={l.locked}>
            {l.name}
            {l.locked ? ' (bloqueada)' : ''}
          </option>
        ))}
      </select>
    </Field>
  )
}

const BLOCK_COLORS = ['#ffffff', '#f1f3f5', '#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#d6bcfa', '#a8a29e']
const INK_COLORS = ['#1f2937', '#545b68', '#2563eb', '#16a34a', '#dc2626', '#9333ea']

function BlockProps({ block }: { block: BlockObject }): React.JSX.Element {
  const doc = useEditorStore((s) => s.doc)
  const [keepRatio, setKeepRatio] = useState(true)
  const def = resolveBlock(block.blockId, doc)
  if (!def) return <p className="form__note">Definição do bloco não encontrada.</p>
  const w = def.width * block.scaleX
  const h = def.height * block.scaleY
  return (
    <>
      <div className="block-head">
        <BlockSvg def={def} size={44} />
        <div>
          <strong>
            {def.icon ? `${def.icon} ` : ''}
            {def.name}
          </strong>
          <span>{def.builtin ? def.category : `${def.category} · personalizado`}</span>
        </div>
      </div>
      <Field label="Largura">
        <NumberField value={Math.round(w * 10) / 10} min={1} max={5000} precision={0} suffix="cm" onCommit={(v) => setBlockSize(block.id, v, null, keepRatio)} />
      </Field>
      <Field label="Profundidade">
        <NumberField value={Math.round(h * 10) / 10} min={1} max={5000} precision={0} suffix="cm" onCommit={(v) => setBlockSize(block.id, null, v, keepRatio)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={keepRatio} onChange={(e) => setKeepRatio(e.target.checked)} />
        Manter proporção
      </label>
      <Field label="Rotação">
        <NumberField value={Math.round(block.rotation * 10) / 10} min={-360} max={360} suffix="°" onCommit={(rotation) => patchBlock(block.id, { rotation: ((rotation % 360) + 360) % 360 })} />
      </Field>
      <div className="button-row">
        <button type="button" className="btn" data-tooltip="Girar 90° (R)" onClick={() => patchBlock(block.id, { rotation: (block.rotation + 90) % 360 })}>
          <RotateCw size={14} />
        </button>
        <button type="button" className="btn" data-tooltip="Espelhar horizontalmente" onClick={() => patchBlock(block.id, { flipX: !block.flipX })}>
          <FlipHorizontal2 size={14} />
        </button>
        <button type="button" className="btn" data-tooltip="Espelhar verticalmente" onClick={() => patchBlock(block.id, { flipY: !block.flipY })}>
          <FlipVertical2 size={14} />
        </button>
        <button type="button" className="btn" data-tooltip="Tamanho original" data-tooltip-pos="left" onClick={() => patchBlock(block.id, { scaleX: 1, scaleY: 1 })}>
          1:1
        </button>
      </div>
      <Field label="Preenchimento">
        <ColorRow value={block.fill} colors={BLOCK_COLORS} onChange={(fill) => patchBlock(block.id, { fill })} />
      </Field>
      <Field label="Traço">
        <ColorRow value={block.stroke} colors={INK_COLORS} onChange={(stroke) => patchBlock(block.id, { stroke })} />
      </Field>
    </>
  )
}

/** Paleta de cores + "padrão do tema" + cor livre. */
function ColorRow({ value, colors, onChange }: { value: string | null; colors: string[]; onChange(c: string | null): void }): React.JSX.Element {
  return (
    <div className="swatches swatches--sm">
      <button type="button" aria-label="Cor padrão" data-tooltip="Padrão do tema" className={`swatch swatch--none${value === null ? ' is-active' : ''}`} onClick={() => onChange(null)} />
      {colors.map((c) => (
        <button key={c} type="button" aria-label={`Cor ${c}`} className={`swatch${value === c ? ' is-active' : ''}`} style={{ background: c }} onClick={() => onChange(c)} />
      ))}
      <label className="swatch swatch--custom" style={{ background: value && !colors.includes(value) ? value : undefined }}>
        <input type="color" value={value ?? '#888888'} onChange={(e) => onChange(e.target.value)} aria-label="Outra cor" />
      </label>
    </div>
  )
}

function ImageProps({ image, unit, precision }: { image: ImageObject; unit: LengthUnit; precision: Precision }): React.JSX.Element {
  const { image: el, missing } = useAssetImage(image.asset)
  const pct = Math.round(image.opacity * 100)
  return (
    <>
      <div className="block-head">
        <ImageIcon size={28} strokeWidth={1.5} />
        <div>
          <strong title={image.name}>{image.name}</strong>
          <span>
            {image.pixelWidth} × {image.pixelHeight} px{missing ? ' · arquivo não encontrado' : el ? '' : ' · carregando…'}
          </span>
        </div>
      </div>
      <Field label="Opacidade">
        <div className="range-row">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={pct}
            aria-label="Opacidade da imagem"
            onChange={(e) => setImageView(image.id, { opacity: Number(e.target.value) / 100 })}
          />
          <span>{pct}%</span>
        </div>
      </Field>
      <div className="button-row">
        <button type="button" className="btn" onClick={() => setImageView(image.id, { hidden: true })}>
          <EyeOff size={14} /> Ocultar
        </button>
        <button type="button" className="btn" onClick={() => setImageView(image.id, { locked: true })}>
          <Lock size={14} /> Bloquear
        </button>
      </div>
      <p className="form__section">Escala</p>
      <button type="button" className="btn btn--accent btn--block" onClick={() => startCalibration(image.id)}>
        <Ruler size={14} /> Definir escala (2 pontos)
      </button>
      <Field label="1 pixel =">
        <NumberField
          value={Math.round(cmPerPixel(image) * 1000) / 1000}
          precision={3}
          min={0.001}
          max={1000}
          suffix="cm"
          onCommit={(v) => setImageCmPerPixel(image.id, v)}
        />
      </Field>
      <Field label="Largura real">
        <NumberField
          value={fromCm(image.width, unit)}
          precision={precision}
          min={0.01}
          suffix={unit}
          onCommit={(v) => setImageCmPerPixel(image.id, toCm(v, unit) / image.pixelWidth)}
        />
      </Field>
      <p className="form__section">Posição</p>
      <Field label="Rotação">
        <NumberField value={Math.round(image.rotation * 10) / 10} min={-360} max={360} precision={1} suffix="°" onCommit={(rotation) => patchImage(image.id, { rotation: ((rotation % 360) + 360) % 360 })} />
      </Field>
      <Field label="Centro (x, y)">
        <span className="readout">
          {formatLength(image.position.x, unit, precision)}, {formatLength(image.position.y, unit, precision)}
        </span>
      </Field>
      <p className="form__note">Arraste para mover; use as alças para girar e redimensionar (proporção mantida). Ctrl+B oculta/mostra.</p>
    </>
  )
}

/** Lista de imagens de fundo (útil para reexibir/desbloquear, já que imagens ocultas ou bloqueadas não são clicáveis). */
function BackgroundImagesCard(): React.JSX.Element | null {
  // Seleciona o array estável e filtra fora do seletor (um seletor que cria array novo causa loop de render).
  const objects = useEditorStore((s) => s.doc.objects)
  const images = objects.filter((o): o is ImageObject => o.type === 'image')
  if (!images.length) return null
  return (
    <div className="stats stats--images">
      <p className="stats__title">Imagens de fundo</p>
      {images.map((img) => (
        <div key={img.id} className="image-row">
          <button
            type="button"
            className="icon-btn icon-btn--xs"
            aria-label={img.hidden ? 'Mostrar imagem' : 'Ocultar imagem'}
            onClick={() => setImageView(img.id, { hidden: !img.hidden })}
          >
            {img.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
          <button
            type="button"
            className={`icon-btn icon-btn--xs${img.locked ? ' is-on' : ''}`}
            aria-label={img.locked ? 'Desbloquear imagem' : 'Bloquear imagem'}
            onClick={() => setImageView(img.id, { locked: !img.locked })}
          >
            {img.locked ? <Lock size={14} /> : <LockOpen size={14} />}
          </button>
          <button
            type="button"
            className="image-row__name"
            title="Selecionar"
            disabled={img.hidden || img.locked}
            onClick={() => {
              useEditorStore.getState().setTool('select')
              useEditorStore.getState().select([img.id])
            }}
          >
            {img.name}
          </button>
        </div>
      ))}
    </div>
  )
}

function DimensionProps({ dim, unit, precision }: { dim: DimensionObject; unit: LengthUnit; precision: Precision }): React.JSX.Element {
  const walls = useEditorStore((s) => s.doc.objects)
  const wallMap = new Map(walls.filter((o): o is WallObject => o.type === 'wall').map((w) => [w.id, w]))
  const seg = measuredSegment(dim, wallMap)
  if (!seg) return <p className="form__note">Parede da cota não encontrada.</p>
  return (
    <>
      <Field label="Medida">
        <span className="readout readout--strong">{formatLength(distance(seg.a, seg.b), unit, precision)}</span>
      </Field>
      <Field label="Tipo">
        <span className="readout">{dim.kind === 'wall' ? 'Associada à parede' : 'Livre (manual)'}</span>
      </Field>
      <Field label="Ângulo">
        <span className="readout">{formatAngle(-angleDeg(seg.a, seg.b))}</span>
      </Field>
      <Field label="Afastamento">
        {dim.offset === null ? (
          <span className="readout">Automático</span>
        ) : (
          <NumberField
            value={dim.offset}
            min={-5000}
            max={5000}
            suffix="cm"
            onCommit={(offset) => commit((d) => updateObject(d, dim.id, 'dimension', (o) => ({ ...o, offset })))}
          />
        )}
      </Field>
      {dim.offset !== null && (
        <button type="button" className="btn btn--block" onClick={() => resetDimensionOffset(dim.id)}>
          <RefreshCw size={14} /> Posição automática
        </button>
      )}
      <p className="form__note">Arraste a cota para afastá-la; duplo clique volta à posição automática.</p>
    </>
  )
}

function LayerField({ obj }: { obj: PlanObject }): React.JSX.Element {
  const layers = useEditorStore((s) => s.doc.layers)
  const layer = layers.find((l) => l.id === obj.layerId)
  return (
    <>
      <Field label="Camada">
        <select
          className="select"
          value={obj.layerId}
          onChange={(e) => {
            const layerId = e.target.value
            commit((d) => mapObjects(d, [obj.id], (o) => ({ ...o, layerId })))
          }}
        >
          {layers.map((l) => (
            <option key={l.id} value={l.id} disabled={l.locked}>
              {l.name}
              {l.locked ? ' (bloqueada)' : ''}
            </option>
          ))}
        </select>
      </Field>
      {layer && !layer.visible && <p className="form__note">A camada deste objeto está oculta.</p>}
    </>
  )
}

// ------------------------------------------------------------- Configurações

function SettingsForm(): React.JSX.Element {
  const s = useSettingsStore()
  return (
    <div className="form">
      <p className="form__section">Aparência</p>
      <Field label="Tema">
        <select className="select" value={s.theme} onChange={(e) => s.set('theme', e.target.value as ThemePreference)}>
          <option value="system">Seguir o sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </select>
      </Field>

      <p className="form__section">Medidas</p>
      <Field label="Unidade">
        <select className="select" value={s.unit} onChange={(e) => s.set('unit', e.target.value as LengthUnit)}>
          <option value="m">Metros (m)</option>
          <option value="cm">Centímetros (cm)</option>
          <option value="mm">Milímetros (mm)</option>
        </select>
      </Field>
      <Field label="Casas decimais">
        <div className="segmented segmented--block">
          {([0, 1, 2] as Precision[]).map((p) => (
            <button key={p} type="button" className={s.precision === p ? 'is-active' : ''} onClick={() => s.set('precision', p)}>
              {p}
            </button>
          ))}
        </div>
      </Field>

      <p className="form__section">Cotas</p>
      <label className="check">
        <input type="checkbox" checked={s.showDimensions} onChange={() => s.toggle('showDimensions')} />
        Mostrar cotas <kbd>Ctrl+Shift+C</kbd>
      </label>
      <Field label="Estilo">
        <div className="segmented segmented--block">
          {(
            [
              ['architectural', 'Arquitetônico'],
              ['linear', 'Linear simples']
            ] as [DimensionStyle, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" className={s.dimensionStyle === v ? 'is-active' : ''} onClick={() => s.set('dimensionStyle', v)}>
              {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Distância da parede">
        <NumberField
          value={s.dimensionOffset}
          min={4}
          max={120}
          suffix="px"
          disabled={s.dimensionStyle === 'linear'}
          onCommit={(v) => s.set('dimensionOffset', v)}
        />
      </Field>
      <Field label="Ângulos nos cantos">
        <select className="select" value={s.cornerAngles} onChange={(e) => s.set('cornerAngles', e.target.value as CornerAngleMode)}>
          <option value="non-right">Só diferentes de 90°</option>
          <option value="all">Todos</option>
          <option value="off">Ocultar</option>
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={s.autoDimensions} onChange={() => s.toggle('autoDimensions')} />
        Criar cota ao desenhar parede
      </label>
      <button type="button" className="btn btn--block" onClick={() => generateMissingDimensions()}>
        <RefreshCw size={14} /> Gerar cotas automáticas
      </button>

      <p className="form__section">Desenho</p>
      <Field label="Passo da grade/ímã">
        <NumberField value={s.gridSize} min={1} max={500} suffix="cm" onCommit={(v) => s.set('gridSize', v)} />
      </Field>
      <Field label="Espessura padrão">
        <NumberField value={s.wallThickness} min={1} max={200} suffix="cm" onCommit={(v) => s.set('wallThickness', v)} />
      </Field>
      <Field label="Porta padrão">
        <NumberField value={s.doorWidth} min={40} max={400} suffix="cm" onCommit={(v) => s.set('doorWidth', v)} />
      </Field>
      <Field label="Janela padrão">
        <NumberField value={s.windowWidth} min={20} max={1000} suffix="cm" onCommit={(v) => s.set('windowWidth', v)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={s.snapEnabled} onChange={() => s.toggle('snapEnabled')} />
        Ímã (snap) ativado
      </label>
      <label className="check">
        <input type="checkbox" checked={s.showGrid} onChange={() => s.toggle('showGrid')} />
        Mostrar grade
      </label>
      <label className="check">
        <input type="checkbox" checked={s.autoLayerByTool} onChange={() => s.toggle('autoLayerByTool')} />
        Trocar de camada conforme a ferramenta
      </label>

      <p className="form__section" id="ai-settings">
        Inteligência artificial
      </p>
      <AiSettings />

      <p className="form__section">Ajuda</p>
      <button type="button" className="btn btn--block" onClick={openOnboarding}>
        Rever o tour de boas-vindas
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="field__control">{children}</div>
    </div>
  )
}
