/**
 * Painel de Camadas.
 *
 * Lista exibida de cima para baixo = da camada mais à frente para a mais ao
 * fundo (como Figma/Photoshop). Recursos:
 *  - clique ativa · duplo clique renomeia · olho/cadeado · contador de objetos
 *  - arrastar para reordenar (implementação própria com mouse: mais previsível
 *    que o drag-and-drop nativo do HTML e com indicador de posição)
 *  - menu de contexto por camada · rodapé com opacidade, cor, duplicar, excluir
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Lock,
  LockOpen,
  MousePointerSquareDashed,
  Plus,
  Trash2
} from 'lucide-react'
import type { Id, Layer } from '@shared/model'
import { useEditorStore } from '@renderer/store/editorStore'
import {
  createLayer,
  deleteLayer,
  duplicateLayer,
  LAYER_COLORS,
  moveSelectionToLayer,
  nudgeLayer,
  renameLayer,
  reorderLayer,
  selectLayerObjects,
  setLayerColor
} from '@renderer/store/layerActions'
import { ContextMenu, type MenuItem } from './ContextMenu'

const DRAG_THRESHOLD_PX = 4

interface DragState {
  id: Id
  startY: number
  active: boolean
}

export function LayersPanel(): React.JSX.Element {
  const layers = useEditorStore((s) => s.doc.layers)
  const objects = useEditorStore((s) => s.doc.objects)
  const activeLayerId = useEditorStore((s) => s.activeLayerId)
  const hasSelection = useEditorStore((s) => s.selectedIds.length > 0)
  const { setActiveLayer, toggleLayerVisibility, toggleLayerLock } = useEditorStore.getState()

  const [renamingId, setRenamingId] = useState<Id | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; layerId: Id } | null>(null)
  const [drop, setDrop] = useState<{ id: Id; place: 'front' | 'back' } | null>(null)
  const [draggingId, setDraggingId] = useState<Id | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const dropRef = useRef<{ id: Id; place: 'front' | 'back' } | null>(null)
  const suppressClick = useRef(false)
  const rowRefs = useRef(new Map<Id, HTMLLIElement>())
  const rootRef = useRef<HTMLDivElement>(null)

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const o of objects) m.set(o.layerId, (m.get(o.layerId) ?? 0) + 1)
    return m
  }, [objects])

  const displayed = useMemo(() => [...layers].reverse(), [layers])
  const active = layers.find((l) => l.id === activeLayerId)

  // ----------------------------------------------------------- arrastar
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      const d = dragRef.current
      if (!d) return
      if (!d.active) {
        if (Math.abs(e.clientY - d.startY) < DRAG_THRESHOLD_PX) return
        d.active = true
        setDraggingId(d.id)
      }
      // Linha sob o cursor → metade de cima = à frente; metade de baixo = atrás.
      for (const [id, el] of rowRefs.current) {
        const r = el.getBoundingClientRect()
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          const place = e.clientY < r.top + r.height / 2 ? 'front' : 'back'
          dropRef.current = id === d.id ? null : { id, place }
          setDrop(dropRef.current)
          return
        }
      }
    }
    const onUp = (): void => {
      const d = dragRef.current
      dragRef.current = null
      if (!d) return
      if (d.active) {
        suppressClick.current = true
        const target = dropRef.current
        if (target) reorderLayer(d.id, target.id, target.place)
        dropRef.current = null
        setDrop(null)
        setDraggingId(null)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startRename = (id: Id): void => {
    setActiveLayer(id)
    setRenamingId(id)
  }

  const menuItems = (layer: Layer): MenuItem[] => {
    const i = layers.findIndex((l) => l.id === layer.id)
    return [
      { label: 'Renomear', shortcut: 'Duplo clique', onSelect: () => startRename(layer.id) },
      { label: 'Duplicar camada', onSelect: () => duplicateLayer(layer.id) },
      { label: 'Selecionar objetos da camada', onSelect: () => selectLayerObjects(layer.id) },
      ...(hasSelection
        ? [{ label: 'Mover seleção para esta camada', onSelect: () => moveSelectionToLayer(layer.id) }]
        : []),
      { separator: true },
      { label: 'Trazer para frente', disabled: i === layers.length - 1, onSelect: () => nudgeLayer(layer.id, 1) },
      { label: 'Enviar para trás', disabled: i === 0, onSelect: () => nudgeLayer(layer.id, -1) },
      { separator: true },
      { label: layer.visible ? 'Ocultar' : 'Mostrar', onSelect: () => toggleLayerVisibility(layer.id) },
      { label: layer.locked ? 'Desbloquear' : 'Bloquear', onSelect: () => toggleLayerLock(layer.id) },
      { separator: true },
      { label: 'Excluir camada', danger: true, disabled: layers.length <= 1, onSelect: () => void deleteLayer(layer.id) }
    ]
  }

  return (
    <div className="layers-panel" ref={rootRef}>
      <div className="panel-section-header">
        <span>
          {layers.length} camada{layers.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          data-tooltip="Nova camada acima da ativa"
          onClick={() => setRenamingId(createLayer())}
        >
          <Plus size={14} /> Nova
        </button>
      </div>

      <ul className={`layer-list${draggingId ? ' is-dragging' : ''}`} role="listbox" aria-label="Camadas">
        {displayed.map((layer) => {
          const isActive = layer.id === activeLayerId
          const dropClass = drop?.id === layer.id ? ` drop-${drop.place}` : ''
          return (
            <li
              key={layer.id}
              ref={(el) => {
                if (el) rowRefs.current.set(layer.id, el)
                else rowRefs.current.delete(layer.id)
              }}
              role="option"
              aria-selected={isActive}
              className={`layer-row${isActive ? ' is-active' : ''}${layer.visible ? '' : ' is-hidden'}${
                draggingId === layer.id ? ' is-dragged' : ''
              }${dropClass}`}
              onMouseDown={(e) => {
                if (e.button !== 0 || (e.target as HTMLElement).closest('button, input')) return
                dragRef.current = { id: layer.id, startY: e.clientY, active: false }
              }}
              onClick={() => {
                if (suppressClick.current) {
                  suppressClick.current = false
                  return
                }
                setActiveLayer(layer.id)
              }}
              onDoubleClick={(e) => {
                if (!(e.target as HTMLElement).closest('button')) startRename(layer.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                const r = rootRef.current?.getBoundingClientRect()
                if (r) setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, layerId: layer.id })
              }}
            >
              <GripVertical size={13} className="layer-row__grip" aria-hidden />
              <button
                type="button"
                className={`icon-btn icon-btn--xs${layer.visible ? '' : ' is-on'}`}
                aria-label={layer.visible ? 'Ocultar camada' : 'Mostrar camada'}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleLayerVisibility(layer.id)
                }}
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              {layer.color && <span className="layer-row__swatch" style={{ background: layer.color }} />}
              {renamingId === layer.id ? (
                <RenameInput
                  initial={layer.name}
                  onDone={(name) => {
                    if (name !== null) renameLayer(layer.id, name)
                    setRenamingId(null)
                  }}
                />
              ) : (
                <span className="layer-row__name" title={layer.name}>
                  {layer.name}
                </span>
              )}
              {layer.opacity < 1 && <span className="layer-row__opacity">{Math.round(layer.opacity * 100)}%</span>}
              <span className="badge" title="Objetos nesta camada">
                {counts.get(layer.id) ?? 0}
              </span>
              <button
                type="button"
                className={`icon-btn icon-btn--xs${layer.locked ? ' is-on' : ' is-faint'}`}
                aria-label={layer.locked ? 'Desbloquear camada' : 'Bloquear camada'}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleLayerLock(layer.id)
                }}
              >
                {layer.locked ? <Lock size={14} /> : <LockOpen size={14} />}
              </button>
            </li>
          )
        })}
      </ul>

      {active && <ActiveLayerCard layer={active} count={counts.get(active.id) ?? 0} total={layers.length} index={layers.indexOf(active)} />}

      {menu &&
        (() => {
          const layer = layers.find((l) => l.id === menu.layerId)
          return layer ? <ContextMenu x={menu.x} y={menu.y} items={menuItems(layer)} onClose={() => setMenu(null)} /> : null
        })()}
    </div>
  )
}

function RenameInput({ initial, onDone }: { initial: string; onDone(name: string | null): void }): React.JSX.Element {
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (value: string | null): void => {
    if (done.current) return
    done.current = true
    onDone(value)
  }
  return (
    <input
      ref={ref}
      className="layer-row__input"
      defaultValue={initial}
      maxLength={60}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(e.currentTarget.value)
        else if (e.key === 'Escape') finish(null)
      }}
    />
  )
}

/** Rodapé com as propriedades da camada ativa. */
function ActiveLayerCard({ layer, count, total, index }: { layer: Layer; count: number; total: number; index: number }): React.JSX.Element {
  const setOpacity = useEditorStore((s) => s.setLayerOpacity)
  const pct = Math.round(layer.opacity * 100)
  return (
    <div className="layer-card">
      <div className="layer-card__title">
        <span className="layer-card__label">Camada ativa</span>
        <strong title={layer.name}>{layer.name}</strong>
      </div>

      <label className="layer-card__row">
        <span>Opacidade</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          aria-label="Opacidade da camada"
          onChange={(e) => setOpacity(layer.id, Number(e.target.value) / 100)}
        />
        <span className="layer-card__value">{pct}%</span>
      </label>

      <div className="layer-card__row">
        <span>Cor</span>
        <div className="swatches swatches--sm">
          <button
            type="button"
            aria-label="Sem cor"
            className={`swatch swatch--none${layer.color === null ? ' is-active' : ''}`}
            onClick={() => setLayerColor(layer.id, null)}
          />
          {LAYER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              className={`swatch${layer.color === c ? ' is-active' : ''}`}
              style={{ background: c }}
              onClick={() => setLayerColor(layer.id, c)}
            />
          ))}
          <label className="swatch swatch--custom" data-tooltip-pos="top" data-tooltip="Outra cor" style={{ background: layer.color && !LAYER_COLORS.includes(layer.color) ? layer.color : undefined }}>
            <input
              type="color"
              value={layer.color ?? '#4f6bff'}
              onChange={(e) => setLayerColor(layer.id, e.target.value)}
              aria-label="Escolher outra cor"
            />
          </label>
        </div>
      </div>

      <div className="layer-card__actions">
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip-pos="top" data-tooltip="Trazer para frente" disabled={index === total - 1} onClick={() => nudgeLayer(layer.id, 1)}>
          <ArrowUp size={15} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip-pos="top" data-tooltip="Enviar para trás" disabled={index === 0} onClick={() => nudgeLayer(layer.id, -1)}>
          <ArrowDown size={15} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip-pos="top" data-tooltip={`Selecionar ${count} objeto(s)`} disabled={count === 0} onClick={() => selectLayerObjects(layer.id)}>
          <MousePointerSquareDashed size={15} />
        </button>
        <button type="button" className="icon-btn icon-btn--sm" data-tooltip-pos="top" data-tooltip="Duplicar camada" onClick={() => duplicateLayer(layer.id)}>
          <Copy size={15} />
        </button>
        <span className="layer-card__spacer" />
        <button
          type="button"
          className="icon-btn icon-btn--sm icon-btn--danger"
          data-tooltip-pos="top-left" data-tooltip="Excluir camada"
                    disabled={total <= 1}
          onClick={() => void deleteLayer(layer.id)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
