import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, ClipboardList, RefreshCw, Search, X } from 'lucide-react'
import { loadAudit, loadAuditDetails, type AuditChange, type AuditRecord } from '../data/audit'
import { loadMockAudit, loadMockAuditDetails } from '../data/mock-store'

const PAGE_SIZE = 50
const operations: Record<number, string> = { 1: 'Criação', 2: 'Atualização', 3: 'Exclusão', 4: 'Acesso' }
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date)
}

function changedFields(data?: string) {
  if (!data) return 0
  try {
    const parsed = JSON.parse(data) as { changedAttributes?: unknown[]; auditDetails?: unknown[] }
    return (parsed.changedAttributes ?? parsed.auditDetails ?? []).length
  } catch { return 0 }
}

function userName(record: AuditRecord) {
  return record.userid?.fullname ?? String((record as Record<string, unknown>)['_userid_value@OData.Community.Display.V1.FormattedValue'] ?? record._userid_value ?? '—')
}

export function AuditOverlay({ ids, mock = false, onClose }: { ids: string[]; mock?: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [fieldNames, setFieldNames] = useState<Record<string, string>>({})
  const [recordNames, setRecordNames] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<AuditRecord | null>(null)
  const [changes, setChanges] = useState<AuditChange[] | null>(null)
  const [error, setError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<'asc' | 'desc'>('desc')
  const [reloadToken, setReloadToken] = useState(0)
  const [detailToken, setDetailToken] = useState(0)
  const idsKey = ids.join(',')

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab') return
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')
      if (!focusables?.length) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previousFocus?.focus() }
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void (mock ? Promise.resolve(loadMockAudit(idsKey ? idsKey.split(',') : [])) : loadAudit(idsKey ? idsKey.split(',') : [], controller.signal)).then((result) => {
      setRecords(result.records)
      setFieldNames(result.fieldNames)
      setRecordNames(result.recordNames)
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [idsKey, mock, reloadToken])

  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    setChanges(null)
    setDetailError('')
    void (mock ? Promise.resolve(loadMockAuditDetails(selected.auditid)) : loadAuditDetails(selected.auditid, fieldNames, controller.signal)).then(setChanges)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : String(reason)) })
    return () => controller.abort()
  }, [selected, fieldNames, detailToken, mock])

  const filtered = useMemo(() => records.filter((record) => {
    const content = `${formatDate(record.createdon)} ${operations[record.operation] ?? record.operation} ${userName(record)} ${recordNames[record._objectid_value?.toLowerCase()] ?? record._objectid_value ?? ''}`
    return content.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
  }).sort((a, b) => sort === 'desc' ? b.createdon.localeCompare(a.createdon) : a.createdon.localeCompare(b.createdon)), [records, search, sort, recordNames])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const shown = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const selectedName = selected ? recordNames[selected._objectid_value?.toLowerCase()] ?? selected._objectid_value ?? 'Registro' : ''

  return (
    <div ref={dialogRef} className="audit-overlay" role="dialog" aria-modal="true" aria-label="Histórico de Auditoria">
      <header className="audit-overlay__header">
        <div><span className="audit-overlay__eyebrow">COMPOSIÇÃO DE PREÇOS</span><h2>Histórico de auditoria</h2><p>{ids.length ? `${ids.length} ${ids.length === 1 ? 'composição selecionada' : 'composições selecionadas'}` : 'Todas as composições'} · {mock ? 'simulação local' : 'até 500 eventos recentes'}</p></div>
        <div className="audit-overlay__header-actions"><button type="button" disabled={loading} onClick={() => { setSelected(null); setReloadToken((value) => value + 1) }} title="Atualizar histórico"><RefreshCw />Atualizar</button><button ref={closeRef} type="button" className="audit-overlay__close" onClick={onClose} aria-label="Fechar auditoria"><X /></button></div>
      </header>
      <div className="audit-overlay__toolbar">
        <span className="audit-overlay__count"><strong>{filtered.length}</strong> {filtered.length === 1 ? 'evento encontrado' : 'eventos encontrados'}</span>
        <label className="audit-overlay__search"><Search aria-hidden="true" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Buscar por registro, usuário ou operação" aria-label="Pesquisar histórico" />{search && <button type="button" onClick={() => { setSearch(''); setPage(1) }} aria-label="Limpar pesquisa"><X /></button>}</label>
      </div>
      <div className="audit-overlay__content">
        <div className="audit-overlay__list">
          {loading ? <div className="audit-overlay__state" role="status"><RefreshCw className="command-icon--spin" /><strong>Buscando histórico…</strong><span>Consultando os eventos permitidos ao seu usuário.</span></div> : error ? <div className="audit-overlay__state" role="alert"><ClipboardList /><strong>Não foi possível carregar a auditoria</strong><span>{error}</span><button type="button" onClick={() => setReloadToken((value) => value + 1)}>Tentar novamente</button></div> : !filtered.length ? <div className="audit-overlay__state"><ClipboardList /><strong>{search ? 'Nenhum resultado para esta pesquisa' : 'Nenhum evento encontrado'}</strong><span>{search ? 'Tente outro termo ou limpe a pesquisa.' : 'Não há eventos disponíveis para esta seleção.'}</span></div> : (
            <table><thead><tr><th><button type="button" onClick={() => setSort((current) => current === 'desc' ? 'asc' : 'desc')}>Data e hora {sort === 'desc' ? <ArrowDown /> : <ArrowUp />}</button></th><th>Operação</th><th>Usuário</th><th>Registro</th><th>Alterações</th></tr></thead>
              <tbody>{shown.map((record) => <tr key={record.auditid} className={selected?.auditid === record.auditid ? 'audit-overlay__selected' : ''}>
                <td><button type="button" className="audit-overlay__row-open" onClick={() => setSelected(record)} aria-label={`Ver auditoria de ${recordNames[record._objectid_value?.toLowerCase()] ?? record._objectid_value ?? 'registro'} em ${formatDate(record.createdon)}`}>{formatDate(record.createdon)}</button></td><td><span className="audit-overlay__operation" data-operation={record.operation}>{operations[record.operation] ?? record.operation}</span></td><td className="audit-overlay__user" title={userName(record)}>{userName(record)}</td><td className="audit-overlay__record">{recordNames[record._objectid_value?.toLowerCase()] ?? record._objectid_value ?? '—'}</td><td><button type="button" className="audit-overlay__details-link" onClick={() => setSelected(record)}>{changedFields(record.changedata)} {changedFields(record.changedata) === 1 ? 'campo' : 'campos'}<ArrowRight aria-hidden="true" /></button></td>
              </tr>)}</tbody>
            </table>
          )}
        </div>
        {selected && <aside className="audit-overlay__details" aria-label="Detalhes da auditoria">
          <div className="audit-overlay__details-header"><div><span className="audit-overlay__eyebrow">DETALHES DO EVENTO</span><h3>{selectedName}</h3><p><span className="audit-overlay__operation" data-operation={selected.operation}>{operations[selected.operation] ?? 'Operação'}</span><time>{formatDate(selected.createdon)}</time></p><small>Por {userName(selected)}</small></div><button type="button" onClick={() => setSelected(null)} aria-label="Fechar detalhes"><X /></button></div>
          {detailError ? <div className="audit-overlay__detail-error" role="alert"><p>{detailError}</p><button type="button" onClick={() => setDetailToken((value) => value + 1)}>Tentar novamente</button></div> : changes === null ? <p role="status">Carregando detalhes…</p> : !changes.length ? <p>Sem alterações de campo registradas.</p> : <div className="audit-overlay__changes"><div className="audit-overlay__changes-heading"><strong>Campos alterados</strong><span>{changes.length}</span></div>{changes.map((change, index) => <div className="audit-overlay__change" key={`${change.field}-${index}`}><strong>{change.field}</strong><div><span>Antes<b data-empty={!change.before}>{change.before || 'Vazio'}</b></span><ArrowRight aria-hidden="true" /><span>Depois<b data-empty={!change.after}>{change.after || 'Vazio'}</b></span></div></div>)}</div>}
        </aside>}
      </div>
      <footer className="audit-overlay__pagination"><span>Mostrando {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}</span><div><span>Página {currentPage} de {pageCount}</span><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Anterior</button><button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</button></div></footer>
    </div>
  )
}
