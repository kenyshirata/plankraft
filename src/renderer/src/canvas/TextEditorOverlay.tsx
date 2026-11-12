/**
 * Editor HTML sobreposto ao canvas para textos e nomes de cômodos.
 * Konva não tem edição de texto nativa; um <textarea> posicionado sobre o
 * objeto (mesma fonte/escala/rotação) dá a experiência de editar "no lugar".
 *
 * Enter confirma · Shift+Enter quebra linha · Esc cancela · clicar fora confirma.
 */
import { useEffect, useRef, useState } from 'react'
import { newId, type TextObject } from '@shared/model'
import { polygonCentroid } from '@renderer/lib/geometry'
import { addObjects, removeObjects, updateObject } from '@renderer/store/docOps'
import { useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { TEXT_FONT, TEXT_LINE_HEIGHT } from './TextShapes'

export function TextEditorOverlay(): React.JSX.Element | null {
  const editing = useEditorStore((s) => s.editing)
  const viewport = useEditorStore((s) => s.viewport)
  const objects = useEditorStore((s) => s.doc.objects)
  const textSize = useSettingsStore((s) => s.textSize)

  if (!editing) return null
  const toScreen = (p: { x: number; y: number }): { left: number; top: number } => ({
    left: viewport.x + p.x * viewport.scale,
    top: viewport.y + p.y * viewport.scale
  })

  if (editing.type === 'room') {
    const room = objects.find((o) => o.id === editing.id && o.type === 'room')
    if (!room || room.type !== 'room') return null
    const { left, top } = toScreen(polygonCentroid(room.points))
    return (
      <Editor
        key={room.id}
        initial={room.name}
        singleLine
        style={{ left, top, fontSize: 13, transform: 'translate(-50%, -100%)', textAlign: 'center' }}
        onCommit={(value) => {
          const name = value.trim()
          if (name && name !== room.name) {
            useEditorStore.getState().commit((d) => updateObject(d, room.id, 'room', (r) => ({ ...r, name })))
          }
        }}
      />
    )
  }

  const existing =
    editing.type === 'text' ? objects.find((o): o is TextObject => o.id === editing.id && o.type === 'text') : undefined
  if (editing.type === 'text' && !existing) return null
  const position = existing ? existing.position : editing.type === 'new-text' ? editing.position : { x: 0, y: 0 }
  const fontSize = (existing?.fontSize ?? textSize) * viewport.scale
  const { left, top } = toScreen(position)

  return (
    <Editor
      key={existing?.id ?? `new-${position.x}-${position.y}`}
      initial={existing?.text ?? ''}
      style={{
        left,
        top,
        fontSize,
        lineHeight: TEXT_LINE_HEIGHT,
        transform: `rotate(${existing?.rotation ?? 0}deg)`,
        transformOrigin: 'top left'
      }}
      onCommit={(value) => {
        const store = useEditorStore.getState()
        const text = value.replace(/\s+$/, '')
        if (existing) {
          if (!text.trim()) store.commit((d) => removeObjects(d, [existing.id]))
          else if (text !== existing.text) store.commit((d) => updateObject(d, existing.id, 'text', (t) => ({ ...t, text })))
        } else if (text.trim()) {
          const obj: TextObject = {
            id: newId(),
            type: 'text',
            layerId: store.activeLayerId,
            position,
            text,
            fontSize: textSize,
            rotation: 0,
            color: null
          }
          store.commit((d) => addObjects(d, [obj]))
          store.select([obj.id])
        }
      }}
    />
  )
}

function Editor({
  initial,
  style,
  singleLine,
  onCommit
}: {
  initial: string
  style: React.CSSProperties
  singleLine?: boolean
  onCommit(value: string): void
}): React.JSX.Element {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLTextAreaElement>(null)
  const done = useRef(false)
  const focused = useRef(false)

  useEffect(() => {
    // Foca no próximo quadro: garante que nenhum evento de mouse pendente roube o foco.
    const id = requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const finish = (commit: boolean): void => {
    if (done.current) return
    done.current = true
    if (commit) onCommit(value)
    useEditorStore.getState().setEditing(null)
  }

  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={value}
      rows={1}
      spellCheck={false}
      placeholder={singleLine ? 'Nome do cômodo' : 'Digite o texto'}
      style={{ ...style, fontFamily: TEXT_FONT }}
      onChange={(e) => setValue(singleLine ? e.target.value.replace(/\n/g, '') : e.target.value)}
      onFocus={() => (focused.current = true)}
      onBlur={() => focused.current && finish(true)}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation() // atalhos do editor (Delete, V, W…) não devem disparar enquanto digita
        if (e.key === 'Escape') finish(false)
        else if (e.key === 'Enter' && (singleLine || !e.shiftKey)) {
          e.preventDefault()
          finish(true)
        }
      }}
    />
  )
}
