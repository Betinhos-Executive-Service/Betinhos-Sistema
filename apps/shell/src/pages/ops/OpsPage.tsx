import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Alert, Button, EmptyState, SearchBox, StatusBadge, ToastProvider, ViewBar, todaySaoPaulo, useShellHeader, useToast, type MenuAction } from '@betinhos/ui'
import { CalendarCheck, Copy, Download, FileStack, RefreshCw, SearchX, Split } from 'lucide-react'
import type { Host } from '../../host'
import { LazyFooter, useLazySlice } from '../../app/LazyList'
import { ListaAgrupada, useRowGroups } from '../../app/ListaAgrupada'
import { listCache } from '../../app/listCache'
import { downloadCsv } from '../../app/csv'
import { selectionActions, useRowSelection } from '../../app/Selecao'
import { keywordIndex, searchWords, useDebouncedText, useMergedById, useServerSearch } from '../../app/search'
import { filterRows } from '../../app/filterRows'
import { useListView } from '../../app/useListView'
import { useQueryId, useQueryTexto } from '../../nav/queryState'
import { useMedia } from '../operacional/useMedia'
import { GerarPagantesFrame } from '../pagantes/components/Dialogs'
import { copyText } from '../pagantes/components/QuickActions'
import { formatMoney } from '../pagantes/domain/messages'
import { ComprovantesOpDrawer, type OpAberta } from '../recebimentos/ComprovantesOpDrawer'
import { useColunaComprovantes } from '../recebimentos/useColunaComprovantes'
import { createSource } from './data/source'
import { VIEWS_KEY, loadViews, periodoStart, total } from './domain/filters'
import { OP_COLUMNS, OP_SORT, TELA, builtinViews, fromLegacyFilters, legacyViewConfig, opFields, opKeywordText, readOp, sortOps } from './domain/lista'
import { opsQuery } from './domain/query'
import { opsCsv, opsNumeros } from './domain/exportar'
import { OP_STATUS } from './domain/status'
import type { Op } from './domain/types'
import { useOps } from './useOps'
import { OpsCards, OpsTable } from './components/OpsList'
import { OpDrawer } from './components/OpDrawer'
import { CancelDialog } from './components/CancelDialog'
import { FecharMesDialog } from '../pendencias/components/FecharMesDialog'
import { createSource as createPendenciasSource } from '../pendencias/data/source'
import { detectarPendencias } from '../pendencias/domain/detect'
import type { Pendencia } from '../pendencias/domain/types'
import '../pagantes/pagantes.css'
import '../pendencias/pendencias.css'
import './ops.css'
import { useAuditoria } from '../../app/auditoria/AuditoriaProvider'

export function OpsPage({ host }: { host: Host }) {
  return <ToastProvider><Ops host={host} /></ToastProvider>
}

const reasonText = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason))

const opDaLinha = (op: Op): OpAberta => ({ id: op.id, nome: op.codigo || 'OP sem código' })

function Ops({ host }: { host: Host }) {
  const auditoria = useAuditoria()
  const source = useMemo(() => createSource(host), [host])
  const toast = useToast()
  const mobile = useMedia('(max-width: 820px)')

  const ops = useOps(source, null, listCache(host))
  const choices = ops.choices
  const fields = useMemo(() => (choices ? opFields(choices) : []), [choices])

  const { view, filters, quickFilters, clearFilters, fields: allFields, extra } = useListView({
    host,
    extra: { entity: 'cr40f_financeiro', ids: ops.list.map((op) => op.id) },
    defaultName: 'Todas as OPs',
    tela: TELA,
    columns: OP_COLUMNS,
    defaultSort: OP_SORT,
    fields,
    ready: Boolean(choices),
    builtins: () => (choices ? builtinViews(choices) : []),
    legacy: { keys: ['status'], read: (q) => fromLegacyFilters(opsQuery.ler(q), choices!) },
    imports: {
      list: () => loadViews(source.kv).views.map((v) => ({ name: v.nome, config: legacyViewConfig(v.filters, choices!) })),
      done: () => source.kv.removeItem(VIEWS_KEY),
      onImported: (n) => toast({ tone: 'info', message: n === 1 ? 'A visão salva neste navegador agora fica em “Minhas”.' : `As ${n} visões salvas neste navegador agora ficam em “Minhas”.` }),
    },
  })

  // Busca, OP aberta e Gerar Pagantes continuam na URL; os filtros vão em `f=` (useListView). A lista filtra 200 ms
  // depois da última tecla; enquanto a lista não chegou inteira, a busca também vai ao servidor.
  const [query, setQuery] = useQueryTexto('q')
  const q = useDebouncedText(query)
  const searchOps = useCallback((text: string) => source.search(null, text), [source])
  const found = useServerSearch({ query: q, enabled: Boolean(choices) && !ops.complete, search: searchOps })
  const list = useMergedById(ops.list, found)
  // Ordena e filtra uma vez por lista/visão; a cada busca só confere o texto já normalizado de cada linha.
  const sorted = useMemo(() => extra.sort(choices ? sortOps(list, view.config.sort, choices) : list, view.config.sort, (op) => op.id), [list, choices, view.config.sort, extra])
  const recebimentos = source.pagantes.recebimentos
  const [version, setVersion] = useState(0)
  const comprovantes = useColunaComprovantes(recebimentos, view.config, filters, list, opDaLinha, mobile, version)
  const { comLeitura, contada } = comprovantes
  const read = useMemo(() => comLeitura(extra.read(readOp, (op) => op.id)), [extra, comLeitura])
  const filtered = useMemo(() => filterRows(sorted, filters, allFields, read), [sorted, filters, allFields, read])
  const index = useMemo(() => keywordIndex<Op>(opKeywordText), [])
  const visible = useMemo(() => {
    if (!choices) return []
    const words = searchWords(q)
    if (!contada && !words.length) return filtered
    return filtered.filter((op) => (!contada || contada(op)) && (!words.length || index.matches(op, words)))
  }, [filtered, index, q, choices, contada])
  // Rolagem infinita: trocar filtro, busca ou ordenação volta ao primeiro lote; a lista crescer (carga em segundo
  // plano) ou recarregar não. A chave é texto para não mudar quando só a identidade dos filtros muda.
  const lazyKey = useMemo(() => JSON.stringify({ filters, q, sort: view.config.sort }), [filters, q, view.config.sort])
  const { slice, more, loadMore } = useLazySlice(visible, lazyKey)
  const groups = useRowGroups(visible, view.config.group, allFields, read)
  const clearAll = () => { clearFilters(); setQuery('') }
  const sel = useRowSelection(visible)
  const selecting = !mobile && sel.rows.length > 0

  const [selectedId, setSelectedId] = useQueryId('abrir')
  const current = selectedId ? list.find((op) => op.id === selectedId) ?? null : null
  const [cancelRequest, setCancelRequest] = useState<Op | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // O Gerar Pagantes aberto (por cima da tela) também vive na URL: `gerar=<id da OP>`.
  const [gerarOpId, setGerarOpId] = useQueryId('gerar')
  const frameUrl = gerarOpId ? source.pagantes.gerarPagantesUrl(gerarOpId) : null

  const refresh = useCallback(() => { setVersion((v) => v + 1); void ops.reload() }, [ops.reload])
  // Fechar mês: as opções são as pendências tipo 4 (cliente + mês com serviços mensais sem OP) dos últimos 12 meses.
  const pendSource = useMemo(() => createPendenciasSource(host), [host])
  const [fechar, setFechar] = useState<{ open: boolean; opcoes: Pendencia[] | null; erro: string | null }>({ open: false, opcoes: null, erro: null })
  useEffect(() => {
    if (!fechar.open) return
    let cancelled = false
    pendSource.load(periodoStart('365', new Date()))
      .then((d) => { if (!cancelled) setFechar((s) => ({ ...s, opcoes: detectarPendencias(d.ops, d.reservas, d.pagantes).filter((p) => p.tipo === 'mensal-sem-op') })) })
      .catch((reason) => { if (!cancelled) setFechar((s) => ({ ...s, erro: reasonText(reason) })) })
    return () => { cancelled = true }
  }, [fechar.open, pendSource])
  const abrirFechar = useCallback(() => setFechar({ open: true, opcoes: null, erro: null }), [])
  // "Atualizar" fica na linha de comando em todas as larguras; o cabeçalho do celular não repete.
  useShellHeader({ title: 'Ordens de Pagamento' })
  const size = mobile ? 'touch' : 'default'

  async function confirmCancel(op: Op) {
    if (busyId) return
    setCancelRequest(null)
    setBusyId(op.id)
    try {
      await ops.cancel(op.id)
      setVersion((v) => v + 1)
      toast({ tone: 'success', message: `${op.codigo || 'OP'} cancelada.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível cancelar a ${op.codigo || 'OP'}. Nada foi alterado. ${reasonText(reason)}` })
    } finally {
      setBusyId(null)
    }
  }

  function gerarPagantes(op: Op) {
    const url = source.pagantes.gerarPagantesUrl(op.id)
    if (!url) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
    setSelectedId(null)
    setGerarOpId(op.id)
  }

  function exportar(rows: Op[]) {
    if (!ops.choices) return
    downloadCsv(`ops-${todaySaoPaulo()}.csv`, opsCsv(rows, ops.choices))
    toast({ tone: 'success', message: rows.length === 1 ? '1 OP exportada.' : `${rows.length} OPs exportadas.` })
  }

  async function copiarNumeros(rows: Op[]) {
    const numeros = opsNumeros(rows)
    try {
      await copyText(numeros.join('\n'))
      const n = numeros.length
      toast({ tone: 'success', message: n === 1 ? '1 número de OP copiado.' : `${n} números de OP copiados.` })
    } catch (reason) {
      toast({ tone: 'danger', message: `Não foi possível copiar. ${reasonText(reason)}` })
    }
  }

  // Ações em lote: as mesmas na faixa da seleção e no clique direito.
  const bulkActions = (rows: Op[]): MenuAction[] => {
    const semNumero = !opsNumeros(rows).length
    // Com uma OP só, o Gerar Pagantes sai direto da lista, sem abrir a gaveta.
    const [unica] = rows.length === 1 ? rows : []
    const cancelada = unica?.status === OP_STATUS.cancelada
    return [
      ...(unica ? [{ id: 'gerar', label: 'Gerar pagantes', icon: <Split size={16} />, disabled: cancelada, title: cancelada ? 'A OP está cancelada.' : undefined, onSelect: () => gerarPagantes(unica) }] : []),
      { id: 'exportar', label: 'Exportar seleção', icon: <Download size={16} />, onSelect: () => exportar(rows) },
      { id: 'copiar', label: 'Copiar números', icon: <Copy size={16} />, disabled: semNumero, title: semNumero ? 'As OPs selecionadas ainda não têm número.' : undefined, onSelect: () => void copiarNumeros(rows) },
    ]
  }

  const closeFrame = useCallback((reload: boolean) => { setGerarOpId(null); if (reload) refresh() }, [refresh, setGerarOpId])

  let body
  if (ops.error && !ops.choices) {
    body = <Alert tone="danger" title="Não foi possível carregar as ordens de pagamento" action={<Button variant="secondary" onClick={() => void ops.reload()}>Tentar de novo</Button>}>{ops.error}</Alert>
  } else if (!ops.choices) {
    body = <OpsTable list={[]} choices={{ status: [], idioma: [] }} onOpen={() => undefined} loading />
  } else if (ops.complete && !ops.loading && !ops.list.length) {
    body = <EmptyState className="surface" align="start" icon={<FileStack size={36} />} title="Nenhuma OP ainda">As OPs nascem pelo botão Gerar OP nas reservas.</EmptyState>
  } else {
    // O total só vale com a lista inteira e os valores dos serviços: até lá, o rodapé avisa que ainda soma.
    const pending = !ops.complete && ops.loading
    // A closure perde o narrowing de `choices`; aqui ela já está carregada.
    const loaded = ops.choices
    const footer = <span className="pg-num">{visible.length} {visible.length === 1 ? 'OP' : 'OPs'} · {pending || comprovantes.aguardando ? 'somando valores…' : formatMoney(total(visible))}</span>
    const empty = comprovantes.aguardando
      ? <EmptyState align="start" icon={<SearchX size={36} />} title={comprovantes.aguardando} />
      : pending
      ? <EmptyState align="start" icon={<SearchX size={36} />} title="Procurando no restante da lista…" />
      : <EmptyState align="start" icon={<SearchX size={36} />} title="Nenhuma OP com estes filtros" action={<Button variant="secondary" onClick={clearAll}>Limpar filtros</Button>} />
    // Agrupada, cada grupo tem sua tabela (virtualizada acima de 100 linhas); o `TableGroups` faz o lote do clique direito valer para a lista inteira e o checkbox do cabeçalho, só para o grupo.
    const table = (rows: Op[], tableFooter?: ReactNode) => (
      <OpsTable list={rows} choices={loaded} onOpen={setSelectedId} view={{ config: view.config, onChange: view.setConfig, density: view.density, pinnable: true, groupable: true, extraCell: extra.cell }} quickFilters={quickFilters} footer={tableFooter} empty={empty} selection={sel.selection} bulkActions={(picked) => bulkActions(sel.targets(picked))} comprovantes={comprovantes.coluna} />
    )
    body = groups ? (
      <ListaAgrupada groups={groups} group={view.config.group} lazyKey={lazyKey} pending={pending} mobile={mobile} table={table} footer={footer}
        cards={(rows) => <OpsCards list={rows} choices={loaded} onOpen={setSelectedId} />} />
    ) : (
      <>
        {mobile
          ? (visible.length ? <OpsCards list={slice} choices={loaded} onOpen={setSelectedId} /> : <div className="surface">{empty}</div>)
          : table(slice, footer)}
        <LazyFooter loaded={slice.length} more={more} onLoadMore={loadMore} pending={pending} />
      </>
    )
  }

  return (
    <div className="page page--full op-page">
      <div role="toolbar" aria-label="Comandos de ordens de pagamento">
        <ViewBar pinnable onAudit={() => auditoria({ entity: 'cr40f_financeiro', onOpenRecord: setSelectedId })} view={view} columns={OP_COLUMNS} catalog={extra.catalog} filters={choices ? { fields: allFields } : undefined}
          search={<SearchBox size={size} value={query} onChange={setQuery} placeholder="Buscar por OP, cliente, passageiro ou trajeto" aria-label="Buscar ordens de pagamento" />}
          primary={<>
            <Button variant="secondary" size={size} icon={<RefreshCw size={16} />} aria-label="Atualizar" title="Atualizar" loading={ops.loading && Boolean(choices)} onClick={refresh} />
            <Button size={size} icon={<CalendarCheck size={16} />} onClick={abrirFechar}>Fechar mês</Button>
          </>}
          // As mesmas ações com ou sem seleção: o DS mede a reserva com elas (§10.9.6).
          selection={{ count: selecting ? sel.rows.length : 0, onClear: sel.clear, actions: selectionActions(bulkActions(sel.rows)) }}>
          {source.mock && !mobile ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
        </ViewBar>
      </div>
      {ops.error && ops.choices ? (
        <Alert tone="danger" title={ops.complete ? 'A última atualização falhou' : 'A carga parou no meio'} action={<Button variant="secondary" onClick={refresh}>Tentar de novo</Button>}>
          {ops.error} {ops.complete ? 'A lista mostra os dados da carga anterior.' : 'A lista mostra só as OPs que chegaram; busca, filtros e total valem para elas.'}
        </Alert>
      ) : null}
      {comprovantes.aviso}
      {body}
      {ops.choices ? (
        <OpDrawer op={current} onClose={() => setSelectedId(null)} choices={ops.choices} source={source} version={version}
          busy={current != null && busyId === current.id} onCancel={setCancelRequest} onGerarPagantes={gerarPagantes} />
      ) : null}
      <ComprovantesOpDrawer op={comprovantes.aberta} source={recebimentos} servicos={source.pagantes.servicos} mobile={mobile} onClose={comprovantes.fechar} />
      <CancelDialog op={cancelRequest} onClose={() => setCancelRequest(null)} onConfirm={(op) => void confirmCancel(op)} />
      <FecharMesDialog escolha={fechar} source={pendSource} onClose={() => setFechar({ open: false, opcoes: null, erro: null })}
        onDone={(r) => {
          setFechar({ open: false, opcoes: null, erro: null })
          toast({ tone: 'success', message: `OP criada com ${r.reservas} serviço(s).` })
          // No mock a OP nova não aparece na lista de OPs: os sources de OPs e de Pendências são separados.
          refresh()
          if (!source.pagantes.gerarPagantesUrl(r.opId)) { toast({ tone: 'info', message: 'O Gerar Pagantes só abre dentro do Dataverse.' }); return }
          setSelectedId(null)
          setGerarOpId(r.opId)
        }} />
      <GerarPagantesFrame url={frameUrl} onClose={closeFrame} />
    </div>
  )
}
