import { useCallback, useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Field, Input, Pagination, StatusBadge, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { Plus, RefreshCw, SearchX, Users } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { useQueryAlvo, useQueryFilters, useQueryPagina } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { label } from './domain/choices'
import { duplicateIndex } from './domain/duplicates'
import { BUILTIN_VIEWS, EMPTY_FILTERS, clienteOptions, filterPessoas, loadViews, matchView, newView, saveViews, viewFilters, type Filters, type View } from './domain/filters'
import { pessoasQuery } from './domain/query'
import { usePessoas } from './usePessoas'
import { PessoasToolbar } from './components/PessoasToolbar'
import { PessoasCards, PessoasTable } from './components/PessoasList'
import { PessoaDrawer } from './components/PessoaDrawer'
import './pessoas.css'

export function PessoasPage({ host }: { host: Host }) {
  return <ToastProvider><Pessoas host={host} /></ToastProvider>
}

const PAGE_SIZE = 50

function Pessoas({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')
  const ps = usePessoas(source)

  const [stored, setStored] = useState(() => loadViews(source.kv))
  const views = useMemo(() => [...BUILTIN_VIEWS, ...stored.views], [stored.views])
  // Filtros, página e gaveta vivem na URL (#/pessoas?q=…&cliente=…&pagina=2&ver=…); sem filtro na abertura, entra a última visão.
  const [filters, setFiltersUrl] = useQueryFilters(pessoasQuery, () => {
    const last = views.find((v) => v.id === stored.last)
    return last ? viewFilters(last) : { ...EMPTY_FILTERS }
  })
  const [page, setPage] = useQueryPagina()
  const activeView = useMemo(() => matchView(views, filters, stored.last), [views, filters, stored.last])
  const setFilters = useCallback((next: Filters, viewId?: string) => {
    setFiltersUrl(next)
    setStored((s) => {
      const last = viewId ?? matchView([...BUILTIN_VIEWS, ...s.views], next, s.last)?.id ?? null
      if (last === s.last) return s
      const data = { ...s, last }
      saveViews(source.kv, data)
      return data
    })
  }, [source.kv, setFiltersUrl])

  const dups = useMemo(() => duplicateIndex(ps.list), [ps.list])
  const dupIds = useMemo(() => new Set(dups.keys()), [dups])
  const choices = ps.choices
  const visible = useMemo(() => (choices ? filterPessoas(ps.list, filters, dupIds, (p) => label(choices.cargo, p.cargo)) : []), [ps.list, filters, dupIds, choices])
  const clientes = useMemo(() => clienteOptions(ps.list), [ps.list])

  const [target, setTarget] = useQueryAlvo()
  const [saving, setSaving] = useState(false)
  const [viewName, setViewName] = useState('')

  const refresh = useCallback(() => { void ps.reload() }, [ps.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar pessoas" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Pessoas', actions: headerActions })

  function saveView() {
    const nome = viewName.trim()
    if (!nome) return
    const same = matchView(views, filters)
    setSaving(false)
    if (same) { toast({ tone: 'info', message: `Esses filtros já estão na visão “${same.nome}”.` }); return }
    const view = newView(nome, filters)
    setStored((s) => { const data = { views: [...s.views, view], last: view.id }; saveViews(source.kv, data); return data })
    toast({ tone: 'success', message: `Visão “${view.nome}” salva.` })
  }
  function deleteView(view: View) {
    setStored((s) => { const data = { views: s.views.filter((v) => v.id !== view.id), last: s.last === view.id ? null : s.last }; saveViews(source.kv, data); return data })
    toast({ tone: 'success', message: `Visão “${view.nome}” excluída.` })
  }

  let body
  if (ps.error && !choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as pessoas" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{ps.error}</Alert>
  } else if (!choices) {
    body = <PessoasTable list={[]} choices={{ cargo: [], classificacao: [], idioma: [], status: [], sexo: [], tipoVeiculo: [] }} dups={dups} onOpen={() => undefined} loading />
  } else if (!ps.list.length) {
    body = <EmptyState className="surface" align="start" icon={<Users size={36} />} title="Nenhuma pessoa cadastrada" action={<Button icon={<Plus size={16} />} onClick={() => setTarget({ mode: 'create' })}>Nova pessoa</Button>}>Cadastre passageiros e solicitantes para usar nas reservas.</EmptyState>
  } else if (!visible.length) {
    body = <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhuma pessoa encontrada para estes filtros" action={<Button variant="secondary" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Limpar filtros</Button>} />
  } else {
    const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
    const safePage = Math.min(page, pages)
    const slice = visible.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
    const open = (id: string) => setTarget({ mode: 'view', id })
    body = (
      <>
        {mobile ? <PessoasCards list={slice} choices={choices} dups={dups} onOpen={open} /> : <PessoasTable list={slice} choices={choices} dups={dups} onOpen={open} />}
        {visible.length > PAGE_SIZE ? <Pagination page={safePage} pageSize={PAGE_SIZE} total={visible.length} onChange={setPage} noun="pessoas" /> : null}
      </>
    )
  }

  return (
    <PageLayout
      eyebrow="Cadastros"
      title="Pessoas"
      meta={<span className="ps-meta">{choices ? <span className="ps-num">{visible.length} de {ps.list.length} · {dupIds.size} possíveis duplicados</span> : null}{source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}</span>}
      description="Passageiros, solicitantes e contatos dos clientes."
      actions={<>
        {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={ps.loading && Boolean(choices)} onClick={refresh}>Atualizar</Button>}
        <Button icon={<Plus size={16} />} disabled={!choices} onClick={() => setTarget({ mode: 'create' })}>Nova pessoa</Button>
      </>}
      toolbar={choices && ps.list.length ? <PessoasToolbar filters={filters} onChange={setFilters} choices={choices} clientes={clientes} views={views} activeView={activeView} onSaveView={() => { setViewName(''); setSaving(true) }} onDeleteView={deleteView} /> : undefined}
    >
      {ps.error && choices ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{ps.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {choices ? <PessoaDrawer target={target} onTarget={setTarget} list={ps.list} dups={dups} choices={choices} source={source} onSaved={ps.upsert} /> : null}
      <Dialog open={saving} onClose={() => setSaving(false)} title="Salvar visão"
        actions={<><Button variant="secondary" onClick={() => setSaving(false)}>Voltar</Button><Button type="submit" form="ps-save-view" disabled={!viewName.trim()}>Salvar visão</Button></>}>
        <form id="ps-save-view" onSubmit={(e) => { e.preventDefault(); saveView() }}>
          <Field label="Nome da visão" hint="Fica salva neste navegador, com os filtros atuais (sem a busca)." required>
            <Input value={viewName} maxLength={40} onChange={(e) => setViewName(e.currentTarget.value)} placeholder="Ex.: Diretores do Grupo Atlântico" autoFocus />
          </Field>
        </form>
      </Dialog>
    </PageLayout>
  )
}
