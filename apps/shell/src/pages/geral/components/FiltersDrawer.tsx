import { useMemo, useState } from 'react'
import { Button, Dialog, Drawer, Input } from '@betinhos/ui'
import { ChevronDown } from 'lucide-react'
import { describeFilter, isEmptyFilter, type Filter, type FilterSet } from '../domain/filters'
import { filterKindOf } from '../domain/filterKind'
import type { AttributeMap, Column, LookupOption } from '../domain/types'
import { FilterEditor } from './FilterEditor'

type Props = {
  open: boolean
  onClose: () => void
  filters: FilterSet
  attributes: AttributeMap | null
  /** Colunas da visão: seus atributos vêm primeiro. */
  columns: Column[]
  search: (attribute: string, text: string) => Promise<LookupOption[]>
  /** Rascunhos por atributo (`null` = remover o filtro). */
  onApply: (drafts: Record<string, Filter | null>) => void
  onClearAll: () => void
}

/** Painel "Editar filtros": todos os campos filtráveis da raiz, um acordeão por campo; só vale ao aplicar. */
export function FiltersDrawer({ open, onClose, filters, attributes, columns, search, onApply, onClearAll }: Props) {
  const [drafts, setDrafts] = useState<Record<string, Filter | null>>({})
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [confirming, setConfirming] = useState(false)

  const items = useMemo(() => {
    if (!attributes) return []
    const rootColumns = columns.filter((c) => !c.alias).map((c) => c.attribute)
    const eligible = Array.from(attributes.entries()).filter(([name, info]) => !name.includes('.') && filterKindOf(name, info) != null)
    const first = rootColumns.flatMap((name) => eligible.filter(([n]) => n === name))
    const others = eligible.filter(([name]) => !rootColumns.includes(name)).sort((a, b) => (a[1].label || a[0]).localeCompare(b[1].label || b[0], 'pt-BR'))
    return [...first, ...others].map(([name, info]) => ({ name, info, label: info.label || name, kind: filterKindOf(name, info)! }))
  }, [attributes, columns])

  const shown = useMemo(() => {
    const needle = text.trim().toLocaleLowerCase('pt-BR')
    return needle ? items.filter((item) => item.label.toLocaleLowerCase('pt-BR').includes(needle)) : items
  }, [items, text])

  const dirty = Object.keys(drafts).length > 0
  const reset = () => { setDrafts({}); setOpenKey(null); setText(''); setConfirming(false) }
  const close = () => { reset(); onClose() }
  const requestClose = () => { if (dirty) setConfirming(true); else close() }

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        title="Editar filtros"
        eyebrow="Geral"
        footer={<>
          <Button variant="ghost" onClick={() => { onClearAll(); close() }}>Limpar tudo</Button>
          <Button onClick={() => { onApply(drafts); close() }}>Aplicar</Button>
        </>}
      >
        {open ? (
          <div className="gr-fd">
            <Input aria-label="Buscar campo" placeholder="Buscar campo…" value={text} onChange={(event) => setText(event.target.value)} />
            <ul className="gr-fd__list">
              {shown.map((item) => {
                const draft = item.name in drafts ? drafts[item.name] : (filters[item.name] ?? null)
                const active = draft != null && !isEmptyFilter(draft)
                const expanded = openKey === item.name
                return (
                  <li key={item.name} className="gr-fd__item">
                    <button type="button" className="gr-fd__head" aria-expanded={expanded} onClick={() => setOpenKey(expanded ? null : item.name)}>
                      <span className="gr-fd__label">{item.label}</span>
                      {active ? <span className="gr-fd__summary">{describeFilter(item.name, draft, item.info).slice(item.label.length + 2)}</span> : null}
                      <ChevronDown size={16} className="gr-fd__chevron" aria-hidden="true" />
                    </button>
                    {expanded ? (
                      <div className="gr-fd__body">
                        <FilterEditor
                          attribute={item.name}
                          info={item.info}
                          kind={item.kind}
                          value={draft}
                          search={search}
                          compact
                          onDraft={(next) => setDrafts((d) => ({ ...d, [item.name]: next }))}
                        />
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </Drawer>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        tone="danger"
        title="Descartar alterações?"
        actions={<>
          <Button variant="secondary" onClick={() => setConfirming(false)}>Continuar editando</Button>
          <Button variant="danger" onClick={close}>Descartar</Button>
        </>}
      >
        Os filtros editados ainda não foram aplicados.
      </Dialog>
    </>
  )
}
