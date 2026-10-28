import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, Field, SearchBox, Select, StatusBadge, ToastProvider, ViewBar, matchesFilters, todaySaoPaulo, useShellHeader, useToast } from '@betinhos/ui'
import { CalendarClock, CheckCheck, Download, Lock, RefreshCw, SearchX, ShieldCheck, Users } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { useListView } from '../../app/useListView'
import { useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { baixarPlanilha, nomeArquivo, planilhaFechamento } from './domain/excel'
import { TELA, VALIDACAO_COLUMNS, VALIDACAO_DEFAULT_FILTERS, VALIDACAO_SORT, builtinViews, matchesKeyword, readLinha, sortLinhas, validacaoFields } from './domain/lista'
import { linhasDoFechamento, mesDe, mesLabel, valorFechamento } from './domain/regras'
import type { Fechamento } from './domain/types'
import { useValidacoes } from './useValidacoes'
import { ValidacaoCards, ValidacaoTable, money, selecionavel } from './components/ValidacaoList'
import { ValidacaoDrawer } from './components/ValidacaoDrawer'
import { ValidadoresDrawer } from './components/ValidadoresDrawer'
import './validacao-cliente.css'

export function ValidacaoClientePage({ host }: { host: Host }) {
  return <ToastProvider><ValidacaoCliente host={host} /></ToastProvider>
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

function ValidacaoCliente({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  // Só o financeiro: sem papel, a tela nem carrega os dados.
  const [acesso, setAcesso] = useState<'checando' | 'sim' | 'nao'>('checando')
  useEffect(() => {
    let live = true
    source.podeAcessar().then((ok) => { if (live) setAcesso(ok ? 'sim' : 'nao') }).catch(() => { if (live) setAcesso('nao') })
    return () => { live = false }
  }, [source])
  useShellHeader({ title: 'Validação do cliente' })
  if (acesso === 'nao') {
    return <div className="page vc-page"><EmptyState className="surface" align="start" icon={<Lock size={36} />} title="Acesso restrito ao financeiro">Peça ao administrador o papel de financeiro para acompanhar a validação dos clientes.</EmptyState></div>
  }
  if (acesso === 'checando') return <div className="page vc-page"><ValidacaoTable list={[]} hoje="" selecionados={new Set()} onToggle={() => undefined} onOpen={() => undefined} loading /></div>
  return <Conteudo host={host} source={source} />
}

function Conteudo({ host, source }: { host: Host; source: ReturnType<typeof createSource> }) {
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')
  const data = useValidacoes(source)
  const hoje = todaySaoPaulo()
  const fields = useMemo(() => validacaoFields(data.linhas, data.clientes), [data.linhas, data.clientes])

  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    defaultName: 'Validação do cliente',
    tela: TELA,
    columns: VALIDACAO_COLUMNS,
    defaultSort: VALIDACAO_SORT,
    defaultFilters: VALIDACAO_DEFAULT_FILTERS,
    fields,
    ready: data.loaded,
    builtins: builtinViews,
  })
  const [query, setQuery] = useQueryTexto('q')
  const [aberto, setAberto] = useQueryTexto('ver')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [validadoresOpen, setValidadoresOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [marcando, setMarcando] = useState(false)

  const visible = useMemo(() => {
    const list = data.linhas.filter((l) => matchesFilters(l, filters, allFields, readLinha) && matchesKeyword(l, query))
    return sortLinhas(list, view.config.sort)
  }, [data.linhas, filters, allFields, query, view.config.sort])
  const lazyKey = useMemo(() => JSON.stringify({ filters, query, sort: view.config.sort }), [filters, query, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const clearAll = () => { clearFilters(); setQuery('') }

  // A seleção só vale para o que está visível e pode ir ao fechamento.
  const visiveisSel = useMemo(() => visible.filter((l) => selecionados.has(l.id) && selecionavel(l)), [visible, selecionados])
  const toggle = (id: string) => setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selecionaveis = visible.filter(selecionavel)
  const todos = selecionaveis.length > 0 && selecionaveis.every((l) => selecionados.has(l.id))

  async function marcar(valor: Fechamento) {
    const alvo = visiveisSel
    if (!alvo.length) return
    setMarcando(true)
    try {
      await source.setFechamento(alvo.map((l) => l.validacaoId!), valor)
      data.patchLinhas(alvo.map((l) => l.id), { fechamento: valor })
      setSelecionados(new Set())
      toast({ tone: 'success', message: valor === 'sim' ? `${alvo.length} serviço(s) incluído(s) no fechamento.` : `${alvo.length} serviço(s) ficam para o próximo mês.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível marcar. ${reasonText(reason)}` })
    } finally {
      setMarcando(false)
    }
  }

  const refresh = useCallback(() => { void data.reload() }, [data.reload])
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar validação do cliente" onClick={refresh} />, [refresh])
  useShellHeader({ title: 'Validação do cliente', actions: headerActions })

  const linhaAberta = aberto ? data.linhas.find((l) => l.id === aberto) ?? null : null
  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar a validação do cliente" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <ValidacaoTable list={[]} hoje={hoje} selecionados={selecionados} onToggle={toggle} onOpen={() => undefined} loading />
  } else if (!data.clientes.length) {
    body = <EmptyState className="surface" align="start" icon={<ShieldCheck size={36} />} title="Nenhum cliente com portal habilitado.">Marque "Portal habilitado" no cadastro do cliente para os serviços dele aparecerem aqui.</EmptyState>
  } else {
    const footer = <span className="vc-num">{visible.length} de {data.linhas.length}{visiveisSel.length ? ` · ${visiveisSel.length} selecionado(s)` : ''}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum registro com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    body = (
      <>
        {mobile
          ? (visible.length ? <ValidacaoCards list={slice} hoje={hoje} selecionados={selecionados} onToggle={toggle} onOpen={setAberto} /> : <div className="surface">{empty}</div>)
          : <ValidacaoTable list={slice} hoje={hoje} selecionados={selecionados} onToggle={toggle} onOpen={setAberto} view={{ config: view.config, onChange: view.setConfig }} extraCell={extra.cell} quickFilters={quickFilters} footer={footer} empty={empty} />}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <div className="page vc-page">
      <div role="toolbar" aria-label="Comandos da validação do cliente">
        <ViewBar view={view} columns={VALIDACAO_COLUMNS} filters={{ fields: allFields }}>
          {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <SearchBox className="vc-search" value={query} onChange={setQuery} placeholder="Buscar serviço, pedido, trajeto ou mensagem" aria-label="Buscar serviços" />
          {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />}
          <span className="vc-acoes">
            <Button variant="secondary" icon={<Users size={16} />} disabled={!data.loaded} onClick={() => setValidadoresOpen(true)}>Validadores</Button>
            <Button icon={<Download size={16} />} disabled={!data.loaded || !data.clientes.length} onClick={() => setExportOpen(true)}>Exportar Excel do mês</Button>
          </span>
        </ViewBar>
      </div>
      {data.loaded && selecionaveis.length ? (
        <div className="vc-lote" role="region" aria-label="Ações em lote">
          <label className="vc-lote__todos">
            <input type="checkbox" checked={todos} onChange={() => setSelecionados(todos ? new Set() : new Set(selecionaveis.map((l) => l.id)))} />
            <span>{visiveisSel.length ? `${visiveisSel.length} selecionado(s)` : 'Selecionar todos os visíveis'}</span>
          </label>
          <Button variant="secondary" size="compact" icon={<CheckCheck size={14} />} disabled={!visiveisSel.length} loading={marcando} onClick={() => void marcar('sim')}>Incluir no fechamento</Button>
          <Button variant="secondary" size="compact" icon={<CalendarClock size={14} />} disabled={!visiveisSel.length || marcando} onClick={() => void marcar('nao')}>Deixar para o próximo mês</Button>
        </div>
      ) : null}
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      {body}
      {data.loaded ? (
        <ValidacaoDrawer linha={linhaAberta} missing={!!aberto && !linhaAberta} onClose={() => setAberto('')} source={source} mobile={mobile}
          onRespondida={(l, m, prazoTacita) => data.patchLinhas([l.id], { situacao: 'respondido', prazoTacita, ultimaMensagem: m })}
          onRetirada={(l) => { data.patchLinhas([l.id], { situacao: 'retirado' }); setSelecionados((s) => { const n = new Set(s); n.delete(l.id); return n }) }} />
      ) : null}
      {data.loaded ? <ValidadoresDrawer open={validadoresOpen} onClose={() => setValidadoresOpen(false)} validadores={data.validadores} clientes={data.clientes} source={source} mobile={mobile} onSaved={data.upsertValidador} /> : null}
      {data.loaded ? <ExportarDialog open={exportOpen} onClose={() => setExportOpen(false)} linhas={data.linhas} clientes={data.clientes} hoje={hoje} /> : null}
    </div>
  )
}

/** Excel do mês: cliente e mês; leva só o marcado para o fechamento (aprovados sem decisão entram como sugeridos). */
function ExportarDialog({ open, onClose, linhas, clientes, hoje }: { open: boolean; onClose: () => void; linhas: ReturnType<typeof useValidacoes>['linhas']; clientes: { id: string; nome: string }[]; hoje: string }) {
  const toast = useToast()
  const meses = useMemo(() => [...new Set(linhas.map(mesDe).filter((m): m is string => !!m))].sort().reverse(), [linhas])
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? '')
  const [mes, setMes] = useState(meses.includes(hoje.slice(0, 7)) ? hoje.slice(0, 7) : meses[0] ?? hoje.slice(0, 7))
  const out = linhasDoFechamento(linhas, clienteId, mes)
  const total = out.reduce((s, l) => s + valorFechamento(l), 0)
  const cliente = clientes.find((c) => c.id === clienteId)
  function exportar() {
    if (!cliente || !out.length) return
    baixarPlanilha(planilhaFechamento(out, `${cliente.nome} ${mesLabel(mes)}`), nomeArquivo(cliente.nome, mes))
    toast({ tone: 'success', message: `Excel de ${mesLabel(mes)} gerado com ${out.length} serviço(s).` })
    onClose()
  }
  return (
    <Dialog open={open} onClose={onClose} title="Exportar Excel do mês"
      actions={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button icon={<Download size={16} />} disabled={!out.length} onClick={exportar}>Exportar {out.length} serviço(s)</Button>
      </>}>
      <div className="vc-export">
        <Field label="Cliente"><Select value={clienteId} clearable={false} searchable={false} onChange={(v) => setClienteId(v ?? '')} options={clientes.map((c) => ({ value: c.id, label: c.nome }))} /></Field>
        <Field label="Mês"><Select value={mes} clearable={false} searchable={false} onChange={(v) => setMes(v ?? mes)} options={meses.map((m) => ({ value: m, label: mesLabel(m) }))} /></Field>
        <p className="vc-muted">Vão para o Excel os serviços marcados "Entra" e os aprovados ainda sem decisão. Total: <strong className="vc-num">{money.format(total)}</strong>. Layout provisório até chegar o modelo do financeiro.</p>
      </div>
    </Dialog>
  )
}
