import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Alert, Button, EmptyState, StatusBadge, Tabs, buttonClassName, tabId, useShellHeader } from '@betinhos/ui'
import { ExternalLink, Info, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { hrefFor, setHashQuery, useHashQuery } from '../../nav/useHashRoute'
import { useMedia } from '../operacional/useMedia'
import { createSource, type ConjuntoExtra } from './data/source'
import { filtrarServicos, opcoesFiltro, type OpcoesFiltro } from './domain/base'
import { int } from './domain/format'
import type { Contexto } from './domain/kpis'
import { atalho, cargaDesde, periodoAnterior } from './domain/periodo'
import type { Filtros } from './domain/types'
import { useDashboard } from './useDashboard'
import { ABAS, ABAS_POR_SERVICO, abaDaUrl, avisoSegmento, type Aba, type PropsAba } from './components/abas/abas'
import { ResumoTab } from './components/abas/ResumoTab'
import { ServicosTab } from './components/abas/ServicosTab'
import { FinanceiroTab } from './components/abas/FinanceiroTab'
import { DespesasTab, FILTROS_DESPESA_VAZIOS, type FiltrosDespesaProprios } from './components/abas/DespesasTab'
import { FrotaTab } from './components/abas/FrotaTab'
import { MotoristasTab, type FrotaMotorista } from './components/abas/MotoristasTab'
import { ManutencoesTab } from './components/abas/ManutencoesTab'
import { MultasTab } from './components/abas/MultasTab'
import { DashboardToolbar } from './components/DashboardToolbar'
import { DetalheProvider } from './components/DetalheDrawer'
import './dashboard.css'

const PAINEL_ID = 'dash-painel'
/** Conjuntos do estágio 2 que cada aba usa: carregados na primeira vez que ela abre e recarregados a cada 60 s só enquanto ela está ativa. */
const SEM_EXTRAS: ReadonlySet<ConjuntoExtra> = new Set()
const EXTRAS_POR_ABA: Partial<Record<Aba, ReadonlySet<ConjuntoExtra>>> = { financeiro: new Set(['pagantes']), despesas: new Set(['despesas']) }
const SEM_OPCOES: OpcoesFiltro = { status: [], clientes: [], motoristas: [], tipos: [] }
const dataBR = (dia: string) => dia.split('-').reverse().join('/')
const horaBR = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export function DashboardPage({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  // A aba vive na URL (#/dashboard?tab=servicos): recarregar ou compartilhar o link mantém a aba.
  const query = useHashQuery()
  const aba = abaDaUrl(query.get('tab'))
  const trocarAba = (proxima: Aba) => {
    const params = new URLSearchParams(query)
    if (proxima === 'resumo') params.delete('tab')
    else params.set('tab', proxima)
    setHashQuery(params)
  }
  const [filtros, setFiltros] = useState<Filtros>(() => ({ atalho: 'esteAno', ...atalho('esteAno', new Date()), status: [], clientes: [], motoristas: [], tipos: [] }))
  const [now, setNow] = useState(() => new Date())
  // Filtros próprios das abas (Despesas; Próprios/Terceiros do ranking de Motoristas): ficam na página para sobreviver à troca de aba.
  const [filtrosDespesa, setFiltrosDespesa] = useState<FiltrosDespesaProprios>(FILTROS_DESPESA_VAZIOS)
  const [frotaMotorista, setFrotaMotorista] = useState<FrotaMotorista>('todos')
  // Carga única com todos os conjuntos; a aba só escolhe o que calcular.
  const extrasDaAba = EXTRAS_POR_ABA[aba] ?? SEM_EXTRAS
  const desde = cargaDesde(filtros.inicio, now)
  const db = useDashboard(source, desde, filtros.fim, { conjuntosExtras: extrasDaAba })

  // Cada recarga avança o relógio; um atalho relativo ("Este mês") acompanha a virada do dia.
  useEffect(() => { if (db.atualizadoEm) setNow(db.atualizadoEm) }, [db.atualizadoEm])
  useEffect(() => {
    if (filtros.atalho === 'personalizado') return
    const p = atalho(filtros.atalho, now)
    if (p.inicio !== filtros.inicio || p.fim !== filtros.fim) setFiltros((f) => ({ ...f, ...p }))
  }, [now, filtros.atalho, filtros.inicio, filtros.fim])

  // Contexto único do recorte (todas, serviços filtrados, filtros e relógio): calculado uma vez e passado a todas as abas.
  // `anterior`: período de mesma duração dos chips "ANT."; começando antes da janela carregada, os chips mostram s/dado.
  const ctx = useMemo<Contexto | null>(() => {
    if (!db.dados) return null
    const p = periodoAnterior(filtros.inicio, filtros.fim)
    return { todas: db.dados.reservas, rv: filtrarServicos(db.dados.reservas, filtros), f: filtros, now, anterior: p && p.inicio >= desde ? p : null }
  }, [db.dados, filtros, now, desde])
  const servicos = ctx ? ctx.rv.length : null
  // Ao trocar de janela `db.dados` volta a null; as últimas opções conhecidas seguem nos filtros até a nova carga.
  const ultimasOpcoes = useRef(SEM_OPCOES)
  const opcoes = useMemo(() => {
    if (db.dados) ultimasOpcoes.current = opcoesFiltro(db.dados.reservas)
    return ultimasOpcoes.current
  }, [db.dados])
  const periodo = `${dataBR(filtros.inicio)} a ${dataBR(filtros.fim)}`
  // Aba cujo conjunto do estágio 2 ainda não chegou nesta janela: mostra o esqueleto dela (não s/dado).
  const abaPendente = [...extrasDaAba].some((c) => db.dados?.pendentes?.includes(c))
  const carregandoPrimeira = (!db.dados && db.carregando) || abaPendente

  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar dashboard" onClick={() => void db.atualizar()} />, [db.atualizar])
  useShellHeader({ title: 'Dashboard', actions: headerActions })

  const segmentado = filtros.status.length + filtros.clientes.length + filtros.motoristas.length + filtros.tipos.length > 0
  const limpar = () => setFiltros((f) => ({ ...f, status: [], clientes: [], motoristas: [], tipos: [] }))
  const aviso = avisoSegmento(aba, filtros)

  const props: PropsAba = abaPendente ? { ctx: null, dados: null, periodo } : { ctx, dados: db.dados, periodo }
  const conteudo = {
    resumo: () => <ResumoTab {...props} />,
    servicos: () => <ServicosTab {...props} />,
    financeiro: () => <FinanceiroTab {...props} />,
    despesas: () => <DespesasTab {...props} proprios={filtrosDespesa} onProprios={setFiltrosDespesa} />,
    frota: () => <FrotaTab {...props} />,
    motoristas: () => <MotoristasTab {...props} frota={frotaMotorista} onFrota={setFrotaMotorista} />,
    manutencoes: () => <ManutencoesTab {...props} />,
    multas: () => <MultasTab {...props} />,
  } satisfies Record<Aba, () => ReactElement>

  return (
    <PageLayout
      className="dash-pagina"
      eyebrow="Operacional"
      title="Dashboard"
      meta={<span className="dash-meta">
        <span>{periodo}</span>
        {servicos != null ? <span>{int(servicos)} serviços</span> : null}
        {db.atualizadoEm ? <span>atualizado {horaBR(db.atualizadoEm)}</span> : null}
        {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
      </span>}
      description="Indicadores executivos, alertas e análises da operação no período escolhido."
      actions={<>
        <a className={buttonClassName({ variant: 'secondary' })} href={hrefFor('new_dashboard')}><ExternalLink size={16} aria-hidden="true" /> Abrir dashboard completo</a>
        {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={db.carregando && Boolean(db.dados)} onClick={() => void db.atualizar()}>Atualizar</Button>}
      </>}
      tabs={<div className="dash-abas"><Tabs tabs={[...ABAS]} value={aba} onChange={trocarAba} panelId={PAINEL_ID} aria-label="Abas do dashboard" /></div>}
      toolbar={<DashboardToolbar filtros={filtros} opcoes={opcoes} now={now} onChange={setFiltros} />}
    >
      <div
        className="dash-corpo" role="tabpanel" id={PAINEL_ID} aria-labelledby={tabId(PAINEL_ID, aba)}
        aria-busy={carregandoPrimeira || undefined}
      >
        {db.erro && db.dados ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={() => void db.atualizar()}>Tentar de novo</Button>}>{db.erro} Os números são da carga anterior.</Alert> : null}
        {db.erro && !db.dados && !db.carregando ? (
          <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Não foi possível carregar o dashboard" action={<Button variant="primary" onClick={() => void db.atualizar()}>Tentar de novo</Button>}>{db.erro}</EmptyState>
        ) : null}
        {db.dados?.indisponiveis.length ? <Alert tone="warning" title="Alguns dados não carregaram">Os cards marcados com s/dado dependem de tabelas que não responderam. Os demais números estão corretos.</Alert> : null}
        {servicos === 0 && segmentado && ABAS_POR_SERVICO.has(aba) ? (
          <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhum serviço para estes filtros" action={<Button variant="secondary" onClick={limpar}>Limpar filtros</Button>}>Ajuste o período ou limpe os filtros de status, cliente, motorista e tipo.</EmptyState>
        ) : null}
        {aviso && db.dados ? <p className="dash-aviso-filtros"><Info size={14} aria-hidden="true" />{aviso}</p> : null}

        {/* Drill-down: um Drawer para a página; links "Abrir no Dataverse" só no modo Dataverse. */}
        <DetalheProvider clientUrl={host.mode === 'dataverse' ? host.clientUrl : null}>
          {db.dados || carregandoPrimeira ? conteudo[aba]() : null}
        </DetalheProvider>
      </div>
    </PageLayout>
  )
}
