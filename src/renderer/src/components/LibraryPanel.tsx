/**
 * Biblioteca de Blocos: busca, categorias colapsáveis, favoritos, blocos do
 * projeto e blocos pessoais. Cada item pode ser ARRASTADO para o canvas ou
 * CLICADO (entra no modo de inserção: clique no desenho para posicionar,
 * R gira, Esc sai).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, PackagePlus, Search, Star, X } from 'lucide-react'
import type { BlockDef } from '@shared/blocks'
import { BUILTIN_BLOCKS, BUILTIN_CATEGORIES } from '@renderer/blocks/builtin'
import { useEditorStore } from '@renderer/store/editorStore'
import { useLibraryStore } from '@renderer/store/libraryStore'
import { addProjectBlockToLibrary, redefineBlockFromSelection } from '@renderer/store/blockActions'
import { confirmDialog } from '@renderer/store/dialogStore'
import { BlockSvg } from './BlockSvg'
import { openBlockDialog } from './BlockDialog'
import { ContextMenu, type MenuItem } from './ContextMenu'

export const BLOCK_DRAG_MIME = 'application/x-plankraft-block'
const COLLAPSE_KEY = 'plankraft-library-collapsed'

function readCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]')
  } catch {
    return []
  }
}

interface Section {
  key: string
  title: string
  blocks: BlockDef[]
}

const normalize = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function LibraryPanel(): React.JSX.Element {
  const { loaded, blocks: personal, favorites, load, toggleFavorite, removeBlock } = useLibraryStore()
  const projectBlocks = useEditorStore((s) => s.doc.blocks)
  const placingBlockId = useEditorStore((s) => s.placingBlockId)
  const hasSelection = useEditorStore((s) => s.selectedIds.length > 0)
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const [menu, setMenu] = useState<{ x: number; y: number; def: BlockDef; source: 'personal' | 'project' | 'builtin' } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const sections = useMemo<Section[]>(() => {
    const q = normalize(query.trim())
    const match = (b: BlockDef): boolean => !q || normalize(`${b.name} ${b.category}`).includes(q)
    const personalIds = new Set(personal.map((b) => b.id))
    const projectOnly = projectBlocks.filter((b) => !personalIds.has(b.id))
    const all = [...BUILTIN_BLOCKS, ...personal, ...projectOnly]
    const out: Section[] = []
    const favs = all.filter((b) => favorites.includes(b.id) && match(b))
    if (favs.length) out.push({ key: '__fav', title: '★ Favoritos', blocks: favs })
    if (projectOnly.some(match)) out.push({ key: '__project', title: 'Deste projeto', blocks: projectOnly.filter(match) })
    const personalCats = [...new Set(personal.map((b) => b.category))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    for (const cat of personalCats) {
      const list = personal.filter((b) => b.category === cat && match(b))
      if (list.length) out.push({ key: `p:${cat}`, title: cat, blocks: list })
    }
    for (const cat of BUILTIN_CATEGORIES) {
      const list = BUILTIN_BLOCKS.filter((b) => b.category === cat && match(b))
      if (list.length) out.push({ key: `b:${cat}`, title: cat, blocks: list })
    }
    return out
  }, [query, personal, projectBlocks, favorites])

  const toggleSection = (key: string): void => {
    const next = collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key]
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
    } catch {
      /* preferência opcional */
    }
  }

  const sourceOf = (def: BlockDef): 'personal' | 'project' | 'builtin' =>
    def.builtin ? 'builtin' : personal.some((b) => b.id === def.id) ? 'personal' : 'project'

  const menuItems = (def: BlockDef, source: 'personal' | 'project' | 'builtin'): MenuItem[] => {
    const items: MenuItem[] = [
      { label: 'Inserir no desenho', onSelect: () => useEditorStore.getState().setPlacing(def.id) },
      { label: favorites.includes(def.id) ? 'Remover dos favoritos' : 'Adicionar aos favoritos', onSelect: () => toggleFavorite(def.id) }
    ]
    if (source === 'project') items.push({ label: 'Adicionar à minha biblioteca', onSelect: () => addProjectBlockToLibrary(def.id) })
    if (source !== 'builtin') {
      items.push(
        { separator: true },
        { label: 'Editar nome, categoria e ícone…', onSelect: () => openBlockDialog({ mode: 'edit', blockId: def.id }) },
        {
          label: 'Redefinir com a seleção atual',
          disabled: !hasSelection,
          onSelect: () => redefineBlockFromSelection(def.id)
        }
      )
    }
    if (source === 'personal') {
      items.push(
        { separator: true },
        {
          label: 'Excluir da biblioteca',
          danger: true,
          onSelect: async () => {
            const ok = await confirmDialog(
              `Excluir “${def.name}” da biblioteca?`,
              'Projetos que já usam este bloco continuam funcionando (eles guardam uma cópia).',
              'Excluir',
              true
            )
            if (ok) removeBlock(def.id)
          }
        }
      )
    }
    return items
  }

  return (
    <div className="library" ref={rootRef}>
      <div className="library__search">
        <Search size={14} />
        <input value={query} placeholder="Buscar blocos…" aria-label="Buscar blocos" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setQuery('')} />
        {query && (
          <button type="button" className="icon-btn icon-btn--xs" aria-label="Limpar busca" onClick={() => setQuery('')}>
            <X size={13} />
          </button>
        )}
      </div>

      <button
        type="button"
        className="btn btn--sm btn--block library__save"
        disabled={!hasSelection}
        title={hasSelection ? undefined : 'Selecione objetos no desenho primeiro'}
        onClick={() => openBlockDialog({ mode: 'create' })}
      >
        <PackagePlus size={14} /> Salvar seleção como bloco
      </button>

      {placingBlockId && (
        <p className="library__hint">
          Clique no desenho para inserir · <kbd>R</kbd> gira · <kbd>Alt</kbd> sem encaixe · <kbd>Esc</kbd> sai
        </p>
      )}

      {sections.length === 0 && <p className="library__empty">Nenhum bloco encontrado para “{query}”.</p>}

      {sections.map((sec) => {
        const isCollapsed = collapsed.includes(sec.key) && !query
        return (
          <section key={sec.key} className="library__section">
            <button type="button" className="library__header" aria-expanded={!isCollapsed} onClick={() => toggleSection(sec.key)}>
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span>{sec.title}</span>
              <span className="badge">{sec.blocks.length}</span>
            </button>
            {!isCollapsed && (
              <div className="library__grid">
                {sec.blocks.map((def) => (
                  <div
                    key={def.id}
                    className={`block-card${placingBlockId === def.id ? ' is-active' : ''}`}
                    draggable
                    role="button"
                    tabIndex={0}
                    title={`${def.name} — ${Math.round(def.width)} × ${Math.round(def.height)} cm`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(BLOCK_DRAG_MIME, def.id)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => useEditorStore.getState().setPlacing(placingBlockId === def.id ? null : def.id)}
                    onKeyDown={(e) => e.key === 'Enter' && useEditorStore.getState().setPlacing(def.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      const r = rootRef.current?.getBoundingClientRect()
                      if (r) setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, def, source: sourceOf(def) })
                    }}
                  >
                    <BlockSvg def={def} />
                    <span className="block-card__name">
                      {def.icon && <span className="block-card__icon">{def.icon}</span>}
                      {def.name}
                    </span>
                    <button
                      type="button"
                      className={`block-card__star${favorites.includes(def.id) ? ' is-on' : ''}`}
                      aria-label={favorites.includes(def.id) ? 'Remover dos favoritos' : 'Favoritar'}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleFavorite(def.id)
                      }}
                    >
                      <Star size={13} fill={favorites.includes(def.id) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.def, menu.source)} onClose={() => setMenu(null)} />}
    </div>
  )
}
