import { useCallback, useMemo } from 'react'
import { Alert, Button, SegmentedControl, useShellHeader } from '@betinhos/ui'
import { CalendarPlus, ChevronRight, RefreshCw } from 'lucide-react'
import type { Host } from '../../host'
import { hrefFor } from '../../nav/useHashRoute'
import { createSource } from './data/source'
import { VISOES, VISAO_LABEL, type Destino, type Indicador } from './domain/types'
import { useInicio } from './useInicio'
import { FaixaComunicado, FraseDoDia, Indicadores, PainelPlanner, Radar, ServicosAReceber } from './components/Paineis'
import './inicio.css'

/** Comunicados da Home (cr40f_comunicadohome) ainda são geridos no WebResource antigo. */
const ROTA_GERENCIAR_COMUNICADOS = 'cr40f_gerenciarcomunicados'
const QUANTOS: Record<string, number> = { operacao: 4, financeiro: 3, ti_marketing: 4, gestao: 4 }

const irPara = (rota: string, params?: Record<string, string>) => { location.hash = hrefFor(rota, params) }

/**
 * Página Inicial (antes WebResource `cr40f_HomeBetinhos`): saudação, frase do dia, indicadores por visão
 * (Operação, Financeiro, TI, Gestão), comunicado vigente, tarefas do Planner e o Radar Betinhos.
 * A visão e o filtro de tarefas ficam na URL (`visao=`, `tarefas=`).
 */
export function InicioPage({ host }: { host: Host }) {
  const source = useMemo(() => createSource(host), [host])
  const inicio = useInicio(source)

  const headerActions = useMemo(() => (
    <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar dados" onClick={inicio.atualizar} disabled={inicio.carregando} />
  ), [inicio.atualizar, inicio.carregando])
  useShellHeader({ title: 'Página Inicial', actions: headerActions })

  const abrirDestino = useCallback((destino: Destino) => {
    if ('rota' in destino) { irPara(destino.rota); return }
    // Tabelas fora do menu do shell: lista nativa do model-driven em outra aba.
    if (host.mode !== 'dataverse') return
    void host.appId().then((appId) => {
      const params = new URLSearchParams({ pagetype: 'entitylist', etn: destino.entidade })
      if (appId) params.set('appid', appId)
      window.open(`${host.clientUrl}/main.aspx?${params}`, '_blank', 'noopener')
    })
  }, [host])

  const { dados } = inicio
  return (
    <div className="page ini-page">
      <section className="ini-hero">
        <div className="ini-hero__texto">
          <h1>Olá{inicio.nome ? `, ${inicio.nome}` : ''}.</h1>
          <p>Bom trabalho. Sua visão de {VISAO_LABEL[inicio.visao].toLowerCase()} está atualizada.</p>
        </div>
        <FraseDoDia />
      </section>

      <div className="ini-barra">
        <SegmentedControl aria-label="Escolher visão" value={inicio.visao} onChange={inicio.setVisao}
          options={VISOES.map((v) => ({ value: v, label: VISAO_LABEL[v] }))} />
        <Button variant="action" icon={<CalendarPlus size={18} />} onClick={() => irPara('geral', { novo: '1' })}>Novo serviço<ChevronRight size={16} aria-hidden="true" /></Button>
      </div>

      {inicio.erro ? <Alert tone="warning" title="Erro parcial" action={<Button variant="secondary" size="compact" onClick={inicio.atualizar}>Tentar de novo</Button>}>{inicio.erro}</Alert> : null}

      <Indicadores itens={dados?.indicadores ?? null} carregando={inicio.carregando} quantos={QUANTOS[inicio.visao] ?? 4} onAbrir={(i: Indicador) => abrirDestino(i.destino)} />

      <FaixaComunicado comunicado={inicio.comunicado} carregando={inicio.carregando} onGerenciar={() => irPara(ROTA_GERENCIAR_COMUNICADOS)} />

      <div className="ini-grade">
        <div className="ini-coluna">
          <PainelPlanner atrasadas={inicio.atrasadas} hoje={inicio.hoje} carregando={inicio.carregando && !inicio.atrasadas.length && !inicio.hoje.length}
            escopo={inicio.escopo} onEscopo={inicio.setEscopo} onAbrir={(id) => irPara('planner', { taskId: id })} onVerTodas={() => irPara('planner')} />
          {inicio.visao === 'financeiro'
            ? <ServicosAReceber servicos={dados?.aReceber ?? []} carregando={!dados} onAbrir={() => irPara('geral')} />
            : null}
        </div>
        <Radar noticias={inicio.noticias} capas={inicio.capas} />
      </div>
    </div>
  )
}
