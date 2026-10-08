import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, EmptyState, StatusBadge, Tabs, buttonClassName, useShellHeader } from '@betinhos/ui'
import { ExternalLink, RefreshCw, SearchX } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { hrefFor, setHashQuery, useHashQuery } from '../../nav/useHashRoute'
import { useMedia } from '../operacional/useMedia'
import { createSource } from './data/source'
import { filtrarServicos, opcoesFiltro, type OpcoesFiltro } from './domain/base'
import { int } from './domain/format'
import { atalho, cargaDesde } from './domain/periodo'
import { calcularResumo } from './domain/resumo'
import type { Filtros } from './domain/types'
import { useDashboard } from './useDashboard'
import { ABAS, abaDaUrl, rotuloAba, type Aba } from './components/abas/abas'
import { AbaEmConstrucao } from './components/abas/AbaEmConstrucao'
import { ResumoCarregando, ResumoTab } from './components/abas/ResumoTab'
import { DespesasCarregando, DespesasTab, FILTROS_DESPESA_VAZIOS, type FiltrosDespesaProprios } from './components/abas/DespesasTab'
import { FrotaCarregando, FrotaTab } from './components/abas/FrotaTab'
import { DashboardToolbar } from './components/DashboardToolbar'
import './dashboard.css'

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
  // Filtros próprios da aba Despesas: ficam na página para sobreviver à troca de aba.
  const [filtrosDespesa, setFiltrosDespesa] = useState<FiltrosDespesaProprios>(FILTROS_DESPESA_VAZIOS)
  // Carga única com todos os conjuntos; a aba só escolhe o que calcular.
  const db = useDashboard(source, cargaDesde(filtros.inicio, now), filtros.fim)

  // Cada recarga avança o relógio; um atalho relativo ("Este mês") acompanha a virada do dia.
  useEffect(() => { if (db.atualizadoEm) setNow(db.atualizadoEm) }, [db.atualizadoEm])
  useEffect(() => {
    if (filtros.atalho === 'personalizado') return
    const p = atalho(filtros.atalho, now)
    if (p.inicio !== filtros.inicio || p.fim !== filtros.fim) setFiltros((f) => ({ ...f, ...p }))
  }, [now, filtros.atalho, filtros.inicio, filtros.fim])

  // Serviços do recorte: contador do cabeçalho e estado vazio valem para todas as abas.
  const servicos = useMemo(() => (db.dados ? filtrarServicos(db.dados.reservas, filtros).length : null), [db.dados, filtros])
  // Um `useMemo` por aba: só a aba ativa calcula.
  const resumo = useMemo(() => (aba === 'resumo' && db.dados ? calcularResumo(db.dados, filtros, now) : null), [aba, db.dados, filtros, now])
  // Ao trocar de janela `db.dados` volta a null; as últimas opções conhecidas seguem nos filtros até a nova carga.
  const ultimasOpcoes = useRef(SEM_OPCOES)
  const opcoes = useMemo(() => {
    if (db.dados) ultimasOpcoes.current = opcoesFiltro(db.dados.reservas)
    return ultimasOpcoes.current
  }, [db.dados])
  const periodo = `${dataBR(filtros.inicio)} a ${dataBR(filtros.fim)}`
  const carregandoPrimeira = !db.dados && db.carregando

  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar dashboard" onClick={() => void db.atualizar()} />, [db.atualizar])
  useShellHeader({ title: 'Dashboard', actions: headerActions })

  const segmentado = filtros.status.length + filtros.clientes.length + filtros.motoristas.length + filtros.tipos.length > 0
  const limpar = () => setFiltros((f) => ({ ...f, status: [], clientes: [], motoristas: [], tipos: [] }))

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
      tabs={<div className="dash-abas"><Tabs tabs={[...ABAS]} value={aba} onChange={trocarAba} aria-label="Abas do dashboard" /></div>}
      toolbar={<DashboardToolbar filtros={filtros} opcoes={opcoes} now={now} onChange={setFiltros} />}
    >
      <div className="dash-corpo" role="tabpanel" aria-label={rotuloAba(aba)} aria-busy={carregandoPrimeira || undefined}>
        {db.erro && db.dados ? <Alert tone="danger" title="A última atualização falhou" action={<Button variant="secondary" onClick={() => void db.atualizar()}>Tentar de novo</Button>}>{db.erro} Os números são da carga anterior.</Alert> : null}
        {db.erro && !db.dados && !db.carregando ? (
          <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Não foi possível carregar o dashboard" action={<Button variant="primary" onClick={() => void db.atualizar()}>Tentar de novo</Button>}>{db.erro}</EmptyState>
        ) : null}
        {db.dados?.indisponiveis.length ? <Alert tone="warning" title="Alguns dados não carregaram">Os cards marcados com s/dado dependem de tabelas que não responderam. Os demais números estão corretos.</Alert> : null}
        {servicos === 0 && segmentado ? (
          <EmptyState className="surface" align="start" icon={<SearchX size={36} />} title="Nenhum serviço para estes filtros" action={<Button variant="secondary" onClick={limpar}>Limpar filtros</Button>}>Ajuste o período ou limpe os filtros de status, cliente, motorista e tipo.</EmptyState>
        ) : null}

        {aba === 'resumo' ? (resumo ? <ResumoTab resumo={resumo} periodo={periodo} /> : carregandoPrimeira ? <ResumoCarregando /> : null) : null}
        {aba === 'despesas' ? (db.dados ? <DespesasTab dados={db.dados} filtros={filtros} periodo={periodo} proprios={filtrosDespesa} onProprios={setFiltrosDespesa} /> : carregandoPrimeira ? <DespesasCarregando /> : null) : null}
        {aba === 'frota' ? (db.dados ? <FrotaTab dados={db.dados} filtros={filtros} now={now} periodo={periodo} /> : carregandoPrimeira ? <FrotaCarregando /> : null) : null}
        {aba !== 'resumo' && aba !== 'despesas' && aba !== 'frota' && (db.dados || carregandoPrimeira) ? <AbaEmConstrucao nome={rotuloAba(aba)} /> : null}
      </div>
    </PageLayout>
  )
}
