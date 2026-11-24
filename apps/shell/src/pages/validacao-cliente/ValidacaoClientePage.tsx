import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, Dialog, EmptyState, Field, SearchBox, Textarea, Select, StatusBadge, Tabs, ToastProvider, ViewBar, tabId, matchesFilters, todaySaoPaulo, useShellHeader, useToast } from '@betinhos/ui'
import { CalendarClock, CheckCheck, Download, Lock, MessageCircleQuestion, RefreshCw, SearchX, Settings2, ShieldCheck, Undo2, Users } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { ListaAgrupada, useRowGroups } from '../../app/ListaAgrupada'
import { useListView } from '../../app/useListView'
import { SearchHits } from '../../app/SearchHits'
import { keywordIndex, searchWords, useDebouncedText } from '../../app/search'
import { useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { createSource, type Lote, type Source } from './data/source'
import { baixarPlanilha, nomeArquivo, planilhaFechamento } from './domain/excel'
import { TELA, VALIDACAO_COLUMNS, VALIDACAO_DEFAULT_FILTERS, VALIDACAO_SORT, builtinViews, linhaKeywordText, readLinha, sortLinhas, validacaoFields } from './domain/lista'
import { aplicarLiberacao, linhasDoFechamento, mesDe, mesLabel, podeLiberar, podeMarcarFechamento, podeRetirar, valorFechamento } from './domain/regras'
import type { Fechamento, Linha, PortalConfig } from './domain/types'
import { useValidacoes } from './useValidacoes'
import { ValidacaoCards, ValidacaoTable, money } from './components/ValidacaoList'
import { ValidacaoDrawer } from './components/ValidacaoDrawer'
import { ConfiguracoesTab } from './components/ConfiguracoesTab'
import { UsuariosTab } from './components/UsuariosTab'
import './validacao-cliente.css'
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'

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
  useShellHeader({ title: 'Portal do cliente' })
  if (acesso === 'nao') {
    return <div className="page vc-page"><EmptyState className="surface" align="start" icon={<Lock size={36} />} title="Acesso restrito ao financeiro">Peça ao administrador o papel de financeiro para acompanhar a validação dos clientes.</EmptyState></div>
  }
  if (acesso === 'checando') return <div className="page vc-page"><ValidacaoTable list={[]} hoje="" selecionados={new Set()} onToggle={() => undefined} onOpen={() => undefined} loading /></div>
  return <Portal host={host} source={source} />
}

type Aba = 'validacao' | 'usuarios' | 'configuracoes'
const ABAS = [
  { value: 'usuarios' as const, label: 'Usuários', icon: <Users size={16} /> },
  { value: 'configuracoes' as const, label: 'Configurações', icon: <Settings2 size={16} /> },
  { value: 'validacao' as const, label: 'Validação', icon: <ShieldCheck size={16} /> },
]
const abaDe = (valor: string): Aba => (valor === 'usuarios' || valor === 'configuracoes' ? valor : 'validacao')

/** Portal do cliente: validação dos serviços, usuários do portal e configuração por cliente; a aba ativa fica na URL (`aba`). */
function Portal({ host, source }: { host: Host; source: Source }) {
  const mobile = useMedia('(max-width: 820px)')
  const data = useValidacoes(source)
  const [abaTexto, setAba] = useQueryTexto('aba', 'validacao')
  const aba = abaDe(abaTexto)
  const salvouConfig = useCallback((config: PortalConfig) => { data.upsertConfig(config); void data.reload() }, [data.upsertConfig, data.reload])

  let conteudo: ReactNode
  if (aba === 'validacao') conteudo = <Conteudo host={host} source={source} data={data} mobile={mobile} />
  else if (data.error && !data.loaded) conteudo = <Alert tone="danger" title="Não foi possível carregar o portal do cliente" action={<Button variant="secondary" onClick={() => void data.reload()}>Tentar de novo</Button>}>{data.error}</Alert>
  else if (!data.loaded) conteudo = <p className="vc-muted" role="status">Carregando...</p>
  else if (aba === 'usuarios') conteudo = <UsuariosTab validadores={data.validadores} clientes={data.clientes} source={source} onSaved={data.upsertValidador} />
  else conteudo = <ConfiguracoesTab configs={data.configs} validadores={data.validadores} source={source} mobile={mobile} onSaved={salvouConfig} onValidadorSaved={data.upsertValidador} />

  return (
    <div className="page vc-page">
      <Tabs tabs={ABAS} value={aba} onChange={setAba} aria-label="Portal do cliente" panelId="vc-aba" />
      <div id="vc-aba" role="tabpanel" aria-labelledby={tabId('vc-aba', aba)} className="vc-aba">{conteudo}</div>
    </div>
  )
}

function Conteudo({ host, source, data, mobile }: { host: Host; source: Source; data: ReturnType<typeof useValidacoes>; mobile: boolean }) {
  const auditoria = useAuditoria()
  const toast = useToast()
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
  const [exportOpen, setExportOpen] = useState(false)
  const [marcando, setMarcando] = useState(false)

  const q = useDebouncedText(query)
  const words = useMemo(() => searchWords(q), [q])
  const index = useMemo(() => keywordIndex<Linha>(linhaKeywordText), [data.linhas])
  const visible = useMemo(() => {
    const list = data.linhas.filter((l) => matchesFilters(l, filters, allFields, readLinha) && index.matches(l, words))
    return sortLinhas(list, view.config.sort)
  }, [data.linhas, filters, allFields, index, words, view.config.sort])
  const lazyKey = useMemo(() => JSON.stringify({ filters, query: q, sort: view.config.sort }), [filters, q, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const groups = useRowGroups(visible, view.config.group, allFields, readLinha)
  const clearAll = () => { clearFilters(); setQuery('') }

  // A seleção só vale para o que está visível; cada ação usa a parte da seleção a que se aplica.
  const visiveisSel = useMemo(() => visible.filter((l) => selecionados.has(l.id)), [visible, selecionados])
  const paraLiberar = visiveisSel.filter((l) => podeLiberar(l.situacao) && l.valorComposicao != null)
  const paraRetirar = visiveisSel.filter((l) => podeRetirar(l.situacao))
  const paraFechamento = visiveisSel.filter((l) => podeMarcarFechamento(l.situacao))
  const [loteLiberar, setLoteLiberar] = useState(false)
  const [loteRetirar, setLoteRetirar] = useState(false)
  const [obsLote, setObsLote] = useState('')
  const duvidas = data.linhas.filter((l) => l.situacao === 'em_duvida').length

  /** Aplica o resultado de um lote: atualiza o que deu certo, mantém selecionado o que falhou e avisa. */
  function concluir(r: Lote, linhas: Linha[], patch: (l: Linha, validacaoId: string) => Partial<Linha>, sucesso: string) {
    const porId = new Map(linhas.map((l) => [l.id, l]))
    for (const ok of r.ok) data.patchLinhas([ok.linhaId], patch(porId.get(ok.linhaId)!, ok.validacaoId))
    setSelecionados(new Set(r.failed.map((f) => f.linhaId)))
    if (r.ok.length) toast({ tone: 'success', message: `${r.ok.length} ${sucesso}` })
    if (r.failed.length) toast({ tone: 'danger', message: `${r.failed.length} não foram: ${r.failed.map((f) => `${f.codigo} (${f.message})`).join('; ')}. Continuam selecionados.` })
  }

  async function liberarLote() {
    const alvo = paraLiberar
    setMarcando(true)
    try {
      const agora = new Date().toISOString()
      const r = await source.liberar(alvo, obsLote)
      concluir(r, alvo, (l, id) => ({ ...aplicarLiberacao(l, agora, obsLote), id, validacaoId: id }), 'serviço(s) liberado(s) para o portal.')
      setLoteLiberar(false)
      setObsLote('')
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível liberar. ${reasonText(reason)}` })
    } finally {
      setMarcando(false)
    }
  }

  async function retirarLote() {
    const alvo = paraRetirar
    setMarcando(true)
    try {
      const results = await Promise.allSettled(alvo.map((l) => source.retirar(l.validacaoId!)))
      const r: Lote = { ok: [], failed: [] }
      results.forEach((x, i) => (x.status === 'fulfilled'
        ? r.ok.push({ linhaId: alvo[i].id, validacaoId: alvo[i].validacaoId! })
        : r.failed.push({ linhaId: alvo[i].id, codigo: alvo[i].codigo, message: reasonText(x.reason) })))
      concluir(r, alvo, () => ({ situacao: 'retirado' }), 'serviço(s) retirado(s) do portal. As conversas ficaram guardadas.')
      setLoteRetirar(false)
    } finally {
      setMarcando(false)
    }
  }
  const toggle = (id: string) => setSelecionados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selecionaveis = visible
  const todos = selecionaveis.length > 0 && selecionaveis.every((l) => selecionados.has(l.id))

  async function marcar(valor: Fechamento) {
    const alvo = paraFechamento
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
  // "Atualizar" fica na linha de comando em todas as larguras; o cabeçalho do celular não repete.
  const size = mobile ? 'touch' : 'default'
  const linhaAberta = aberto ? data.linhas.find((l) => l.id === aberto) ?? null : null
  let body
  if (data.error && !data.loaded) {
    body = <Alert tone="danger" title="Não foi possível carregar a validação do cliente" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error}</Alert>
  } else if (!data.loaded) {
    body = <ValidacaoTable list={[]} hoje={hoje} selecionados={selecionados} onToggle={toggle} onOpen={() => undefined} loading />
  } else if (!data.clientes.length) {
    body = <EmptyState className="surface" align="start" icon={<ShieldCheck size={36} />} title="Nenhum cliente com portal liberado.">Ligue o portal do cliente na aba Configurações para os serviços dele aparecerem aqui.</EmptyState>
  } else {
    const footer = <span className="vc-num">{visible.length} de {data.linhas.length}{visiveisSel.length ? ` · ${visiveisSel.length} selecionado(s)` : ''}</span>
    const empty = <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhum registro com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    const table = (rows: Linha[], tableFooter?: ReactNode) => (
      <ValidacaoTable list={rows} hoje={hoje} selecionados={selecionados} onToggle={toggle} onOpen={setAberto} view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true, groupable: true }} extraCell={extra.cell} quickFilters={quickFilters} footer={tableFooter} empty={empty} />
    )
    const cards = (rows: Linha[]) => <ValidacaoCards list={rows} hoje={hoje} selecionados={selecionados} onToggle={toggle} onOpen={setAberto} />
    body = groups ? (
      <ListaAgrupada groups={groups} group={view.config.group} lazyKey={lazyKey} mobile={mobile} table={table} cards={cards} footer={footer} />
    ) : (
      <>
        {mobile ? (visible.length ? cards(slice) : <div className="surface">{empty}</div>) : table(slice, footer)}
        {more ? <LazyFooter loaded={slice.length} more onLoadMore={loadMore} /> : null}
      </>
    )
  }

  return (
    <>
      <div role="toolbar" aria-label="Comandos da validação do cliente">
        <ViewBar pinnable onAudit={() => auditoria({ entity: 'cr40f_validacaoservico', onOpenRecord: setAberto })} view={view} columns={VALIDACAO_COLUMNS} filters={{ fields: allFields }}
          search={<SearchBox size={size} value={query} onChange={setQuery} placeholder="Buscar por serviço, pedido, cliente, trajeto, situação, data, valor ou mensagem" aria-label="Buscar serviços" />}
          primary={<>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={data.loading && data.loaded} onClick={refresh} />
            <Button size={size} icon={<Download size={16} />} disabled={!data.loaded || !data.clientes.length} onClick={() => setExportOpen(true)}>Exportar Excel do mês</Button>
          </>}>
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
          <Button variant="secondary" size={size} icon={<MessageCircleQuestion size={16} />} disabled={!data.loaded} aria-label={`Dúvidas abertas: ${duvidas}`} onClick={() => view.select('pronta:em-duvida')}>{mobile ? null : `Dúvidas (${duvidas})`}</Button>
        </ViewBar>
      </div>
      {data.loaded && selecionaveis.length ? (
        <div className="vc-lote" role="region" aria-label="Ações em lote">
          <label className="vc-lote__todos">
            <input type="checkbox" checked={todos} onChange={() => setSelecionados(todos ? new Set() : new Set(selecionaveis.map((l) => l.id)))} />
            <span>{visiveisSel.length ? `${visiveisSel.length} selecionado(s)` : 'Selecionar todos os visíveis'}</span>
          </label>
          <Button variant="secondary" size="compact" icon={<ShieldCheck size={14} />} disabled={!paraLiberar.length || marcando} onClick={() => setLoteLiberar(true)}>Liberar para o portal{paraLiberar.length ? ` (${paraLiberar.length})` : ''}</Button>
          <Button variant="secondary" size="compact" icon={<Undo2 size={14} />} disabled={!paraRetirar.length || marcando} onClick={() => setLoteRetirar(true)}>Retirar do portal{paraRetirar.length ? ` (${paraRetirar.length})` : ''}</Button>
          <Button variant="secondary" size="compact" icon={<CheckCheck size={14} />} disabled={!paraFechamento.length} loading={marcando} onClick={() => void marcar('sim')}>Incluir no fechamento{paraFechamento.length ? ` (${paraFechamento.length})` : ''}</Button>
          <Button variant="secondary" size="compact" icon={<CalendarClock size={14} />} disabled={!paraFechamento.length || marcando} onClick={() => void marcar('nao')}>Deixar para o próximo mês</Button>
        </div>
      ) : null}
      {data.error && data.loaded ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>{data.error} A lista mostra os dados da carga anterior.</Alert> : null}
      <SearchHits tokens={words}>{body}</SearchHits>
      {data.loaded ? (
        <ValidacaoDrawer linha={linhaAberta} missing={!!aberto && !linhaAberta} onClose={() => setAberto('')} source={source} mobile={mobile}
          onRespondida={(l, m, prazoTacita) => data.patchLinhas([l.id], { situacao: 'respondido', prazoTacita, ultimaMensagem: m })}
          onPatch={(l, patch) => data.patchLinhas([l.id], patch)}
          onRetirada={(l) => { data.patchLinhas([l.id], { situacao: 'retirado' }); setSelecionados((s) => { const n = new Set(s); n.delete(l.id); return n }) }} />
      ) : null}
      <Dialog open={loteLiberar} onClose={() => { if (!marcando) setLoteLiberar(false) }} title={`Liberar ${paraLiberar.length} serviço(s) para o portal?`}
        actions={<>
          <Button variant="secondary" disabled={marcando} onClick={() => setLoteLiberar(false)}>Cancelar</Button>
          <Button icon={<ShieldCheck size={16} />} loading={marcando} onClick={() => void liberarLote()}>Liberar {paraLiberar.length} serviço(s)</Button>
        </>}>
        <div className="vc-export">
          <p className="vc-muted">O cliente passa a ver {paraLiberar.map((l) => l.codigo).join(', ')} com o valor da composição. O prazo da aprovação automática começa hoje.</p>
          <Field label="Observação ao cliente" hint="Opcional; vale para todos os selecionados."><Textarea rows={2} maxLength={2000} value={obsLote} disabled={marcando} onChange={(e) => setObsLote(e.target.value)} /></Field>
        </div>
      </Dialog>
      <Dialog open={loteRetirar} onClose={() => { if (!marcando) setLoteRetirar(false) }} tone="danger" title={`Retirar ${paraRetirar.length} serviço(s) do portal?`}
        actions={<>
          <Button variant="secondary" disabled={marcando} onClick={() => setLoteRetirar(false)}>Manter no portal</Button>
          <Button variant="danger" loading={marcando} onClick={() => void retirarLote()}>Retirar do portal</Button>
        </>}>
        O cliente deixa de ver {paraRetirar.map((l) => l.codigo).join(', ')} e eles não entram no fechamento. As conversas ficam guardadas aqui.
      </Dialog>
      {data.loaded ? <ExportarDialog open={exportOpen} onClose={() => setExportOpen(false)} linhas={data.linhas} clientes={data.clientes} hoje={hoje} /> : null}
    </>
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
