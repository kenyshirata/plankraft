import { useEffect, useState } from 'react'
import { formatLength } from '@renderer/lib/format'
import { useActiveLayer, useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'

/** Barra inferior: posição do cursor, camada ativa, contagem de objetos e versão. */
export function StatusBar(): React.JSX.Element {
  const cursor = useEditorStore((s) => s.cursor)
  const count = useEditorStore((s) => s.doc.objects.length)
  const selected = useEditorStore((s) => s.selectedIds.length)
  const activeLayer = useActiveLayer()
  const unit = useSettingsStore((s) => s.unit)
  const precision = useSettingsStore((s) => s.precision)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api
      ?.getAppInfo()
      .then((info) => setVersion(`v${info.version} · Electron ${info.electron}`))
      .catch(() => setVersion(''))
  }, [])

  return (
    <footer className="statusbar">
      <span className="statusbar__item statusbar__coords">
        {cursor
          ? `X ${formatLength(cursor.x, unit, precision)}   Y ${formatLength(cursor.y, unit, precision)}`
          : 'X —   Y —'}
      </span>
      <span className="statusbar__item">
        Camada ativa: <strong>{activeLayer?.name ?? '—'}</strong>
        {activeLayer?.locked ? ' (bloqueada)' : ''}
      </span>
      <span className="statusbar__item">
        {count} {count === 1 ? 'objeto' : 'objetos'}
        {selected > 0 ? ` · ${selected} selecionado${selected > 1 ? 's' : ''}` : ''}
      </span>
      <span className="statusbar__spacer" />
      <span className="statusbar__item statusbar__muted">{version}</span>
    </footer>
  )
}
