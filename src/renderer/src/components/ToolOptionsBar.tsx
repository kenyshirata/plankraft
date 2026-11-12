import { Grid3x3, Magnet, Maximize, Minus, Plus } from 'lucide-react'
import { useActiveLayer, useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { NumberField } from './ui/NumberField'
import { generateMissingDimensions } from '@renderer/store/actions'

/**
 * Barra contextual (estilo Figma) logo acima do canvas: opções da ferramenta
 * atual à esquerda; ímã, grade e zoom à direita.
 */
export function ToolOptionsBar(): React.JSX.Element {
  const tool = useEditorStore((s) => s.tool)
  const wallMode = useEditorStore((s) => s.wallMode)
  const roomMode = useEditorStore((s) => s.roomMode)
  const doorHinge = useEditorStore((s) => s.doorHinge)
  const scale = useEditorStore((s) => s.viewport.scale)
  const { setWallMode, setRoomMode, setDoorHinge } = useEditorStore.getState()
  const s = useSettingsStore()
  const { snapEnabled, showGrid, toggle } = s

  return (
    <div className="options-bar">
      <div className="options-bar__left">
        {tool === 'wall' && (
          <>
            <Segmented
              label="Modo da parede"
              value={wallMode}
              onChange={setWallMode}
              options={[
                ['line', 'Linha'],
                ['rect', 'Retângulo']
              ]}
            />
            <label className="inline-field">
              <span>Espessura</span>
              <NumberField value={s.wallThickness} min={1} max={200} suffix="cm" onCommit={(v) => s.set('wallThickness', v)} />
            </label>
            <span className="hint">
              Arraste, ou clique ponto a ponto (Enter/Esc encerra) · <kbd>Shift</kbd> trava 45° · <kbd>Alt</kbd> sem ímã
            </span>
          </>
        )}
        {tool === 'door' && (
          <>
            <label className="inline-field">
              <span>Largura</span>
              <NumberField value={s.doorWidth} min={40} max={400} suffix="cm" onCommit={(v) => s.set('doorWidth', v)} />
            </label>
            <Segmented
              label="Dobradiça"
              value={doorHinge}
              onChange={setDoorHinge}
              options={[
                ['start', 'Dobradiça ◧'],
                ['end', 'Dobradiça ◨']
              ]}
            />
            <span className="hint">
              Clique sobre uma parede · o lado de abertura segue o cursor · <kbd>F</kbd> troca a dobradiça
            </span>
          </>
        )}
        {tool === 'window' && (
          <>
            <label className="inline-field">
              <span>Largura</span>
              <NumberField value={s.windowWidth} min={20} max={1000} suffix="cm" onCommit={(v) => s.set('windowWidth', v)} />
            </label>
            <span className="hint">Clique sobre uma parede para inserir · arraste depois para reposicionar</span>
          </>
        )}
        {tool === 'room' && (
          <>
            <Segmented
              label="Modo do cômodo"
              value={roomMode}
              onChange={setRoomMode}
              options={[
                ['detect', 'Detectar'],
                ['polygon', 'Polígono']
              ]}
            />
            <span className="hint">
              {roomMode === 'detect'
                ? 'Clique dentro de uma área fechada por paredes — a área útil é calculada automaticamente'
                : 'Clique os vértices · feche no 1º ponto, Enter ou duplo clique · Esc cancela'}
            </span>
          </>
        )}
        {tool === 'text' && (
          <>
            <label className="inline-field">
              <span>Tamanho</span>
              <NumberField value={s.textSize} min={2} max={500} suffix="cm" onCommit={(v) => s.set('textSize', v)} />
            </label>
            <span className="hint">
              Clique para escrever · <kbd>Enter</kbd> confirma · <kbd>Shift</kbd>+<kbd>Enter</kbd> quebra linha
            </span>
          </>
        )}
        {tool === 'calibrate' && (
          <span className="hint">
            <strong>Definir escala:</strong> clique em dois pontos da imagem cuja distância real você conhece (ex.: uma parede
            cotada) · <kbd>Esc</kbd> cancela
          </span>
        )}
        {tool === 'block' && (
          <span className="hint">
            Escolha um bloco na biblioteca (ou arraste-o para o desenho) · clique para inserir · <kbd>R</kbd> gira ·{' '}
            <kbd>Alt</kbd> sem encaixe na parede · <kbd>Esc</kbd> sai
          </span>
        )}
        {tool === 'dimension' && (
          <>
            <button type="button" className="btn btn--sm" onClick={() => generateMissingDimensions()}>
              Gerar cotas automáticas
            </button>
            <span className="hint">
              Arraste (ou clique em 2 pontos) para cotar · <kbd>Shift</kbd> trava 45° · arraste uma cota com Selecionar para
              afastá-la
            </span>
          </>
        )}
        {tool === 'measure' && (
          <span className="hint">
            Arraste (ou clique em 2 pontos) para medir · <kbd>Shift</kbd> trava 45° · <kbd>Esc</kbd> limpa
          </span>
        )}
        {tool === 'select' && (
          <span className="hint">
            Clique para selecionar · <kbd>Shift</kbd>+clique adiciona · arraste para mover · duplo clique edita texto ·
            botão direito abre o menu
          </span>
        )}
        {tool === 'pan' && <span className="hint">Arraste para mover a vista · roda do mouse para zoom</span>}
      </div>

      <div className="options-bar__right">
        <ActiveLayerChip />
        <button
          type="button"
          className={`icon-btn icon-btn--sm${snapEnabled ? ' is-on' : ''}`}
          aria-pressed={snapEnabled}
          aria-label="Ímã"
          data-tooltip={`Ímã ${snapEnabled ? 'ligado' : 'desligado'}`}
          onClick={() => toggle('snapEnabled')}
        >
          <Magnet size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className={`icon-btn icon-btn--sm${showGrid ? ' is-on' : ''}`}
          aria-pressed={showGrid}
          aria-label="Grade"
          data-tooltip={`Grade ${showGrid ? 'visível' : 'oculta'} (Ctrl+')`}
          onClick={() => toggle('showGrid')}
        >
          <Grid3x3 size={16} strokeWidth={1.75} />
        </button>
        <span className="toolbar__sep" />
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label="Diminuir zoom"
          data-tooltip="Diminuir zoom (Ctrl+-)"
          onClick={() => useEditorStore.getState().zoomBy(1 / 1.25)}
        >
          <Minus size={16} strokeWidth={1.75} />
        </button>
        <span className="zoom-readout">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label="Aumentar zoom"
          data-tooltip="Aumentar zoom (Ctrl+=)"
          onClick={() => useEditorStore.getState().zoomBy(1.25)}
        >
          <Plus size={16} strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label="Ajustar à tela"
          data-tooltip="Ajustar à tela (Ctrl+0)"
          data-tooltip-pos="left"
          onClick={() => useEditorStore.getState().zoomToFit()}
        >
          <Maximize size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options
}: {
  label: string
  value: T
  onChange(v: T): void
  options: [T, string][]
}): React.JSX.Element {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'is-active' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/** Mostra em qual camada os novos objetos serão criados (só nas ferramentas de desenho). */
function ActiveLayerChip(): React.JSX.Element | null {
  const tool = useEditorStore((s) => s.tool)
  const layer = useActiveLayer()
  if (!layer || ['select', 'pan', 'measure'].includes(tool)) return null
  const blocked = layer.locked || !layer.visible
  return (
    <span
      className={`layer-chip${blocked ? ' is-blocked' : ''}`}
      data-tooltip={blocked ? 'Camada ativa bloqueada ou oculta' : 'Novos objetos vão para esta camada'}
    >
      <span className="layer-chip__dot" style={{ background: layer.color ?? 'var(--accent)' }} />
      {layer.name}
    </span>
  )
}
