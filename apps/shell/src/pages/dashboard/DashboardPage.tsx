import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, EmptyState, StatusBadge, buttonClassName, useShellHeader } from '@betinhos/ui'
import { ExternalLink, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { hrefFor } from '../../nav/useHashRoute'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { opcoesFiltro, type OpcoesFiltro } from './domain/base'
import { int } from './domain/format'
import { atalho, cargaDesde } from './domain/periodo'
import { calcularResumo } from './domain/resumo'
import type { Filtros } from './domain/types'
import { useDashboard } from './useDashboard'
import { AlertList } from './components/AlertList'
import { Analises } from './components/Analises'
import { DashboardToolbar } from './components/DashboardToolbar'
import { Emergenciais } from './components/Emergenciais'
import { FrotaPessoas } from './components/FrotaPessoas'
import { KPI_PLACEHOLDER, KpiGrid } from './components/KpiGrid'
import { ProducaoPropriaTerceira } from './components/ProducaoPropriaTerceira'
import './dashboard.css'

const SEM_OPCOES: OpcoesFiltro = { status: [], clientes: [], motoristas: [], tipos: [] }
const dataBR = (dia: string) => dia.split('-').reverse().join('/')
const horaBR = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export function DashboardPage({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const mobile = useMedia('(max-width: 820px)')
  const [filtros, setFiltros] = useState<Filtros>(() => ({ atalho: 'esteAno', ...atalho('esteAno', new Date()), status: [], clientes: [], motoristas: [], tipos: [] }))
  const [now, setNow] = useState(() => new Date())
  const db = useDashboard(source, cargaDesde(filtros.inicio, now), filtros.fim)

  // Cada recarga avança o relógio; um atalho relativo ("Este mês") acompanha a virada do dia.
  useEffect(() => { if (db.atualizadoEm) setNow(db.atualizadoEm) }, [db.atualizadoEm])
  useEffect(() => {
    if (filtros.atalho === 'personalizado') return
    const p = atalho(filtros.atalho, now)
    if (p.inicio !== filtros.inicio || p.fim !== filtros.fim) setFiltros((f) => ({ ...f, ...p }))
  }, [now, filtros.atalho, filtros.inicio, filtros.fim])

  const resumo = useMemo(() => (db.dados ? calcularResumo(db.dados, filtros, now) : null), [db.dados, filtros, now])
  // Ao trocar de janela `db.dados` volta a null; as últimas opções conhecidas seguem nos filtros até a nova carga.
  const ultimasOpcoes = useRef(SEM_OPCOES)
  const opcoes = useMemo(() => {
    if (db.dados) ultimasOpcoes.current = opcoesFiltro(db.dados.reservas)
    return ultimasOpcoes.current
  }, [db.dados])
  const periodo = `${dataBR(filtros.inicio)} a ${dataBR(filtros.fim)}`
  const carregandoPrimeira = !resumo && db.carregando

  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar dashboard" onClick={() => void db.atualizar()} />, [db.atualizar])
  useShellHeader({ title: 'Dashboard', actions: headerActions })

  const segmentado = filtros.status.length + filtros.clientes.length + filtros.motoristas.length + filtros.tipos.length > 0
  const limpar = () => setFiltros((f) => ({ ...f, status: [], clientes: [], motoristas: [], tipos: [] }))

  return (
    <PageLayout
      eyebrow="Operacional"
      title="Dashboard"
      meta={<span className="dash-meta">
        <span>{periodo}</span>
        {resumo ? <span>{int(resumo.servicos)} serviços</span> : null}
        {db.atualizadoEm ? <span>atualizado {horaBR(db.atualizadoEm)}</span> : null}
        {source.mock ? <StatusBadge tone="info">Dados de exemplo</StatusBadge> : null}
      </span>}
      description="Indicadores executivos, alertas e análises da operação no período escolhido."
      actions={<>
        <a className={buttonClassName({ variant: 'secondary' })} href={hrefFor('new_dashboard')}><ExternalLink size={16} aria-hidden="true" /> Abrir dashboard completo</a>
        {mobile ? null : <Button variant="secondary" icon={<RefreshCw size={16} />} loading={db.carregando && Boolean(resumo)} onClick={() => void db.atualizar()}>Atualizar</Button>}
      </>}
      toolbar={<DashboardToolbar filtros={filtros} opcoes={opcoes} now={now} onChange={setFiltros} />}
    >
      {db.erro && resumo ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={() => void db.atualizar()}>Tentar de novo</Button>}>{db.erro} Os números são da carga anterior.</Alert> : null}
      {db.erro && !resumo && !db.carregando ? (
        <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Não foi possível carregar o dashboard" action={<Button variant="primary" onClick={() => void db.atualizar()}>Tentar de novo</Button>}>{db.erro}</EmptyState>
      ) : null}
      {db.dados?.indisponiveis.length ? <Alert tone="warning" title="Alguns dados não carregaram">Os cards marcados com s/dado dependem de tabelas que não responderam. Os demais números estão corretos.</Alert> : null}

      {carregandoPrimeira ? <KpiGrid kpis={KPI_PLACEHOLDER} carregando /> : null}
      {resumo && resumo.servicos === 0 && segmentado ? (
        <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhum serviço para estes filtros" action={<Button variant="secondary" onClick={limpar}>Limpar filtros</Button>}>Ajuste o período ou limpe os filtros de status, cliente, motorista e tipo.</EmptyState>
      ) : null}
      {resumo ? <>
        <KpiGrid kpis={resumo.kpis} carregando={false} />
        <div className="dash-alertas-grid">
          <AlertList titulo="Operação" itens={resumo.operacao} />
          <AlertList titulo="Qualidade dos dados" itens={resumo.qualidade} />
        </div>
        <FrotaPessoas cards={resumo.frota} />
        <div className="dash-destaques">
          <ProducaoPropriaTerceira dados={resumo.producao} periodo={periodo} />
          <Emergenciais dados={resumo.emergenciais} periodo={periodo} />
        </div>
        <Analises resumo={resumo} periodo={periodo} />
      </> : null}
    </PageLayout>
  )
}
