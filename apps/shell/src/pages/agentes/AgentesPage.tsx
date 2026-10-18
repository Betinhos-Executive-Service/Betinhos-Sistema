import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, EmptyState, Field, Input, Skeleton, ToastProvider, useShellHeader, useToast } from '@betinhos/ui'
import { Inbox, RefreshCw, Sparkles } from 'lucide-react'
import type { Host } from '../../host'
import { PageLayout } from '../../app/PageLayout'
import { createSource } from './data/source'
import { agentePorId } from './domain/agentes'
import { ehGuid } from './domain/acoes'
import { ORIGEM_ROTULO, type Agente, type Proposta } from './domain/types'
import { useAgente } from './useAgente'
import { PropostaCard } from './components/PropostaCard'
import { AprovarDialog, DescartarDialog } from './components/DecisaoDialogs'
import { Historico } from './components/Historico'
import './agentes.css'

export function AgentesPage({ host, agente = 'financeiro' }: { host: Host; agente?: Agente }) {
  return <ToastProvider><Agentes host={host} agente={agente} /></ToastProvider>
}

const GRUPOS: { prioridade: Proposta['prioridade']; label: string }[] = [{ prioridade: 'alta', label: 'Prioridade alta' }, { prioridade: 'media', label: 'Prioridade média' }, { prioridade: 'baixa', label: 'Prioridade baixa' }]
const fmtData = (d: Date | null) => (d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const ENTITY_SET: Record<string, string> = { cr40f_reservadeveculos: 'cr40f_reservadeveculos', cr40f_financeiro: 'cr40f_financeiro', cr40f_pagamentoaterceiro: 'cr40f_pagamentoaterceiro', cr40f_funcionarios: 'cr40f_funcionarios', cr40f_documento: 'cr40f_documento', cr40f_multas: 'cr40f_multas' }

function Agentes({ host, agente }: { host: Host; agente: Agente }) {
  const info = agentePorId(agente)!
  const source = useMemo(() => createSource(host), [host])
  const estado = useAgente(source, agente)
  const toast = useToast()
  const [pergunta, setPergunta] = useState('')
  const [aprovando, setAprovando] = useState<Proposta | null>(null)
  const [descartando, setDescartando] = useState<Proposta | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Logística: roda sozinha ao abrir se a última execução for antiga.
  const [autoDisparado, setAutoDisparado] = useState(false)
  useEffect(() => {
    if (autoDisparado || estado.loading || estado.error || info.rodaAoAbrirAposMin == null) return
    setAutoDisparado(true)
    const ultima = estado.atual?.criadaEm?.getTime() ?? 0
    if (Date.now() - ultima > info.rodaAoAbrirAposMin * 60_000) void estado.analisar('', 'ao_abrir')
  }, [autoDisparado, estado, info.rodaAoAbrirAposMin])

  const { reload } = estado
  const headerActions = useMemo(() => <Button variant="secondary" icon={<RefreshCw size={18} />} aria-label="Atualizar" onClick={() => void reload()} />, [reload])
  useShellHeader({ title: info.label, actions: headerActions })

  const linkAlvo = (p: Proposta) => (host.mode === 'dataverse' && ENTITY_SET[p.entidadeAlvo] && ehGuid(p.idAlvo) ? `${host.clientUrl}/main.aspx?pagetype=entityrecord&etn=${ENTITY_SET[p.entidadeAlvo]}&id=${p.idAlvo}` : null)

  async function confirmarAprovar(p: Proposta) {
    setBusyId(p.id)
    try { await estado.aprovar(p); setAprovando(null); toast({ tone: 'success', message: 'Proposta aprovada.' }) }
    catch (r) { toast({ tone: 'danger', message: `Não foi possível aprovar: ${r instanceof Error ? r.message : String(r)}` }) }
    finally { setBusyId(null) }
  }
  async function confirmarDescartar(p: Proposta, motivo: string) {
    setBusyId(p.id)
    try { await estado.descartar(p, motivo); toast({ tone: 'success', message: 'Proposta descartada.' }) } finally { setBusyId(null) }
  }

  const atual = estado.atual
  const meta = atual ? `Última execução ${fmtData(atual.criadaEm)} · ${ORIGEM_ROTULO[atual.origem].toLowerCase()}${atual.status === 'concluida' ? ` · ${atual.tokensEntrada + atual.tokensSaida} tokens` : ''}` : 'Nenhuma execução ainda'

  return (
    <PageLayout eyebrow={info.grupo} title={info.label} description={info.descricao} meta={meta}
      actions={<form className="agentes__form" onSubmit={(e) => { e.preventDefault(); void estado.analisar(pergunta); setPergunta('') }}>
        <Field label="Pergunta" hint="Opcional. Enter envia."><Input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Ex.: quem está livre sexta à tarde?" maxLength={2000} /></Field>
        <Button type="submit" variant="primary" icon={<Sparkles size={18} />} loading={estado.polling}>Analisar agora</Button>
      </form>}>
      {estado.error && <Alert tone="danger" title="Falha ao carregar" action={<Button variant="secondary" size="compact" onClick={() => void estado.reload()}>Tentar de novo</Button>}>{estado.error}</Alert>}
      {estado.polling && <div className="surface agentes__analisando" role="status"><Skeleton shape="rect" height={72} /><p>Analisando… leva cerca de 15 s.</p></div>}
      {!estado.polling && atual?.status === 'erro' && <Alert tone="danger" title="A última análise falhou" action={<Button variant="secondary" size="compact" onClick={() => void estado.analisar(atual.pergunta)}>Tentar de novo</Button>}>{atual.erro}</Alert>}
      {!estado.polling && atual?.status === 'concluida' && (
        <>
          <section className="surface agentes__resumo" aria-label="Resumo"><p>{atual.resumo}</p></section>
          {estado.propostas.length === 0 && <EmptyState className="surface" align="start" icon={<Inbox size={36} />} title="Nenhuma proposta para hoje">O assistente não encontrou nada que exija ação.</EmptyState>}
          {GRUPOS.map((g) => {
            const itens = estado.propostas.filter((p) => p.prioridade === g.prioridade)
            if (!itens.length) return null
            return (
              <section key={g.prioridade} className="agentes__grupo" aria-label={g.label}>
                <h2 className="agentes__grupo-titulo">{g.label} <span className="texto-secundario">({itens.length})</span></h2>
                <div className="agentes__cards">{itens.map((p) => <PropostaCard key={p.id} proposta={p} linkAlvo={linkAlvo(p)} busy={busyId === p.id} onAprovar={() => setAprovando(p)} onDescartar={() => setDescartando(p)} />)}</div>
              </section>
            )
          })}
        </>
      )}
      {!estado.loading && !atual && !estado.polling && <EmptyState className="surface" align="start" icon={<Sparkles size={36} />} title="Nenhuma análise ainda">Clique em Analisar agora para a primeira rodada.</EmptyState>}
      {estado.historico.length > 0 && <Historico execucoes={estado.historico} atualId={atual?.id ?? null} onAbrir={estado.abrir} />}
      <AprovarDialog proposta={aprovando} busy={Boolean(busyId)} onClose={() => setAprovando(null)} onConfirm={(p) => void confirmarAprovar(p)} />
      <DescartarDialog proposta={descartando} busy={Boolean(busyId)} onClose={() => setDescartando(null)} onConfirm={confirmarDescartar} />
    </PageLayout>
  )
}
