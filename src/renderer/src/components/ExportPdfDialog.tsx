/**
 * Modal "Exportar PDF": papel, orientação, escala, cotas, imagem de fundo,
 * camadas, legenda e carimbo. Mostra uma miniatura da folha com a área do
 * desenho e avisa quando o desenho não cabe na escala escolhida.
 * As opções (exceto camadas) ficam lembradas para a próxima exportação.
 */
import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { AlertTriangle, CheckCircle2, FileDown } from 'lucide-react'
import type { Id } from '@shared/model'
import { buildPdf, computeLayout, PAPER_LABEL, type PdfContext, type PdfOptions, type PdfScale } from '@renderer/pdf/exportPdf'
import { useEditorStore } from '@renderer/store/editorStore'
import { useSettingsStore } from '@renderer/store/settingsStore'
import { resolveBlock } from '@renderer/store/libraryStore'
import { useAssetStore } from '@renderer/store/assetStore'
import { toast } from '@renderer/store/toastStore'

const usePdfDialog = create<{ open: boolean }>()(() => ({ open: false }))
export const openExportPdfDialog = (): void => usePdfDialog.setState({ open: true })
const close = (): void => usePdfDialog.setState({ open: false })

const PREFS_KEY = 'plankraft-pdf-options'
type Prefs = Omit<PdfOptions, 'layerIds' | 'projectName' | 'date'>
const DEFAULT_PREFS: Prefs = {
  paper: 'a4',
  orientation: 'landscape',
  scale: 'fit',
  includeDimensions: true,
  includeBackground: false,
  legend: true,
  titleBlock: true,
  author: '',
  openAfter: true
}
function readPrefs(): Prefs {
  try {
    // A imagem de fundo começa sempre desmarcada (padrão pedido para o PDF).
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}'), includeBackground: false }
  } catch {
    return DEFAULT_PREFS
  }
}

export function ExportPdfDialogHost(): React.JSX.Element | null {
  const open = usePdfDialog((s) => s.open)
  return open ? <ExportPdfDialog /> : null
}

/** Contexto de desenho (blocos, imagens, preferências de cotas). */
export function pdfContext(): PdfContext {
  const doc = useEditorStore.getState().doc
  const s = useSettingsStore.getState()
  const assets = useAssetStore.getState().assets
  return {
    resolveBlock: (id) => resolveBlock(id, doc),
    image: (key) => assets[key]?.image ?? null,
    unit: s.unit,
    precision: s.precision,
    dimensionStyle: s.dimensionStyle,
    dimensionOffset: s.dimensionOffset,
    cornerAngles: s.cornerAngles
  }
}

/** Gera e grava o PDF (diálogo "Salvar como" no main). Exportada para testes/automação. */
export async function exportPdf(opts: PdfOptions): Promise<string | null> {
  const doc = useEditorStore.getState().doc
  const pdf = buildPdf(doc, opts, pdfContext())
  const name = opts.projectName || doc.name
  if (!window.api) {
    pdf.save(`${name}.pdf`) // navegador: download direto
    return `${name}.pdf`
  }
  const data = new Uint8Array(pdf.output('arraybuffer'))
  const result = await window.api.savePdf({ suggestedName: name, data, openAfter: opts.openAfter })
  return result?.filePath ?? null
}

function ExportPdfDialog(): React.JSX.Element {
  const doc = useEditorStore((s) => s.doc)
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [projectName, setProjectName] = useState(doc.name)
  const [date, setDate] = useState(() => new Date().toLocaleDateString('pt-BR'))
  const visibleLayers = doc.layers.filter((l) => l.visible)
  const [layerIds, setLayerIds] = useState<Id[]>(() => visibleLayers.map((l) => l.id))
  const [busy, setBusy] = useState(false)

  const opts: PdfOptions = { ...prefs, layerIds, projectName, date }
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]): void => setPrefs((p) => ({ ...p, [k]: v }))
  const optsKey = JSON.stringify(opts)
  const layout = useMemo(() => computeLayout(doc, JSON.parse(optsKey) as PdfOptions, pdfContext()), [doc, optsKey])
  const hasImages = doc.objects.some((o) => o.type === 'image')
  const isEmpty = !doc.objects.some((o) => layerIds.includes(o.layerId))

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
    } catch {
      /* preferências opcionais */
    }
    try {
      const path = await exportPdf(opts)
      if (path) {
        toast.success('PDF exportado.')
        close()
      }
    } catch (err) {
      toast.error(`Falha ao exportar o PDF: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  // Miniatura da folha (proporcional)
  const thumbW = 168
  const k = thumbW / layout.pageW
  const thumbH = layout.pageH * k
  const contentW = Math.min(layout.contentMm.w, layout.area.width * 3) * k
  const contentH = Math.min(layout.contentMm.h, layout.area.height * 3) * k

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form
        className="dialog dialog--form dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pdf-title"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <h2 id="pdf-title" className="dialog__title">
          Exportar PDF
        </h2>
        <div className="pdf-grid">
          <div className="pdf-col">
            <Row label="Papel">
              <select className="select" value={prefs.paper} onChange={(e) => set('paper', e.target.value as PdfOptions['paper'])}>
                {(['a4', 'a3', 'a2', 'letter'] as const).map((p) => (
                  <option key={p} value={p}>
                    {PAPER_LABEL[p]}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Orientação">
              <div className="segmented segmented--block">
                {(
                  [
                    ['landscape', 'Paisagem'],
                    ['portrait', 'Retrato']
                  ] as const
                ).map(([v, t]) => (
                  <button key={v} type="button" className={prefs.orientation === v ? 'is-active' : ''} onClick={() => set('orientation', v)}>
                    {t}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Escala">
              <div className="segmented segmented--block">
                {(['fit', 50, 100, 200] as PdfScale[]).map((v) => (
                  <button key={v} type="button" className={prefs.scale === v ? 'is-active' : ''} onClick={() => set('scale', v)}>
                    {v === 'fit' ? 'Ajustar' : `1:${v}`}
                  </button>
                ))}
              </div>
            </Row>
            <label className="check">
              <input type="checkbox" checked={prefs.includeDimensions} onChange={(e) => set('includeDimensions', e.target.checked)} />
              Incluir cotas
            </label>
            <label className={`check${hasImages ? '' : ' is-disabled'}`}>
              <input type="checkbox" disabled={!hasImages} checked={prefs.includeBackground} onChange={(e) => set('includeBackground', e.target.checked)} />
              Incluir imagem de fundo
            </label>
            <label className="check">
              <input type="checkbox" checked={prefs.legend} onChange={(e) => set('legend', e.target.checked)} />
              Legenda com cômodos e áreas
            </label>
            <label className="check">
              <input type="checkbox" checked={prefs.titleBlock} onChange={(e) => set('titleBlock', e.target.checked)} />
              Carimbo (projeto, autor, data, escala)
            </label>
            {prefs.titleBlock && (
              <div className="pdf-stamp">
                <input className="text-input" value={projectName} placeholder="Nome do projeto" aria-label="Nome do projeto" onChange={(e) => setProjectName(e.target.value)} />
                <input className="text-input" value={prefs.author} placeholder="Autor (opcional)" aria-label="Autor" onChange={(e) => set('author', e.target.value)} />
                <input className="text-input" value={date} placeholder="Data" aria-label="Data" onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
          </div>

          <div className="pdf-col">
            <span className="field__label">Camadas</span>
            <div className="pdf-layers">
              {visibleLayers
                .slice()
                .reverse()
                .map((l) => (
                  <label key={l.id} className="check">
                    <input
                      type="checkbox"
                      checked={layerIds.includes(l.id)}
                      onChange={(e) => setLayerIds((ids) => (e.target.checked ? [...ids, l.id] : ids.filter((x) => x !== l.id)))}
                    />
                    {l.name}
                  </label>
                ))}
            </div>
            <div className="pdf-preview" style={{ width: thumbW, height: thumbH }} aria-hidden>
              <div
                className="pdf-preview__area"
                style={{ left: layout.area.x * k, top: layout.area.y * k, width: layout.area.width * k, height: layout.area.height * k }}
              >
                <div className={`pdf-preview__content${layout.fits ? '' : ' is-over'}`} style={{ width: contentW, height: contentH }} />
              </div>
              {layout.legendArea && (
                <div className="pdf-preview__box" style={{ left: layout.legendArea.x * k, top: layout.legendArea.y * k, width: layout.legendArea.width * k, height: layout.legendArea.height * k }} />
              )}
              {layout.titleArea && (
                <div className="pdf-preview__box" style={{ left: layout.titleArea.x * k, top: layout.titleArea.y * k, width: layout.titleArea.width * k, height: layout.titleArea.height * k }} />
              )}
            </div>
            <p className={`pdf-status${layout.fits ? '' : ' is-warn'}`}>
              {layout.fits ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {isEmpty
                ? 'Nada para exportar nas camadas escolhidas.'
                : layout.fits
                  ? `Escala 1:${Math.round(layout.scaleDen)} — desenho de ${Math.round(layout.contentMm.w)} × ${Math.round(layout.contentMm.h)} mm cabe na folha.`
                  : `Não cabe em 1:${Math.round(layout.scaleDen)} (${Math.round(layout.contentMm.w)} × ${Math.round(layout.contentMm.h)} mm). Use papel maior, outra escala ou "Ajustar" — o excedente seria cortado.`}
            </p>
          </div>
        </div>

        <div className="dialog__actions dialog__actions--split">
          <label className="check">
            <input type="checkbox" checked={prefs.openAfter} onChange={(e) => set('openAfter', e.target.checked)} />
            Abrir após exportar
          </label>
          <span className="spacer" />
          <button type="button" className="btn" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--accent" disabled={busy || isEmpty}>
            <FileDown size={15} /> {busy ? 'Gerando…' : 'Exportar'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="field__control">{children}</div>
    </div>
  )
}
