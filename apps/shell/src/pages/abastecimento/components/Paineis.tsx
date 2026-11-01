import { useState } from 'react'
import { Button, EmptyState, Select, StatusBadge, Table, useToast, type TableColumn } from '@betinhos/ui'
import { Copy, ExternalLink, Fuel, Lightbulb, Link2, Sparkles, TriangleAlert } from 'lucide-react'
import { ANOMALIA_ROTULO, type Anomalia } from '../domain/anomalias'
import type { Proposta } from '../domain/dicas'
import { fmtData, fmtDataHora, fmtKmPorLitro, fmtLitros, fmtMoeda, fmtPrecoLitro } from '../domain/formato'
import type { ResumoMotorista, ResumoVeiculo } from '../domain/indicadores'
import { ORIGEM_ROTULO, type Abastecimento, type Veiculo } from '../domain/types'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const num = (texto: string) => <span className="ab-num">{texto}</span>

export function PainelVeiculos({ veiculos, motoristas, onVeiculo }: { veiculos: ResumoVeiculo[]; motoristas: ResumoMotorista[]; onVeiculo: (chave: string) => void }) {
  const colunasVeiculo: TableColumn<ResumoVeiculo>[] = [
    { key: 'veiculo', header: 'Veículo', width: 'minmax(150px, 1.4fr)', cell: (r) => <span className="ab-dupla"><strong>{r.placa}</strong><span>{r.modelo || (r.veiculoId ? '' : 'Sem cadastro')}</span></span> },
    { key: 'qtd', header: 'Abast.', align: 'end', width: 'minmax(70px, .5fr)', cell: (r) => num(String(r.qtd)) },
    { key: 'litros', header: 'Litros', align: 'end', width: 'minmax(90px, .7fr)', cell: (r) => num(fmtLitros(r.litros)) },
    { key: 'valor', header: 'Gasto', align: 'end', width: 'minmax(110px, .8fr)', cell: (r) => num(fmtMoeda(r.valor)) },
    { key: 'kml', header: 'km/l médio', align: 'end', width: 'minmax(100px, .7fr)', cell: (r) => num(fmtKmPorLitro(r.kmPorLitro)) },
    { key: 'preco', header: 'Preço médio', align: 'end', width: 'minmax(110px, .8fr)', hideBelow: 'compact', cell: (r) => num(fmtPrecoLitro(r.precoMedio)) },
    { key: 'ultimo', header: 'Último', width: 'minmax(130px, .9fr)', hideBelow: 'compact', cell: (r) => num(fmtDataHora(r.ultimo)) },
    { key: 'motoristas', header: 'Motoristas', width: 'minmax(150px, 1.2fr)', hideBelow: 'mobile', cell: (r) => r.motoristas.join(', ') || '—' },
  ]
  const colunasMotorista: TableColumn<ResumoMotorista>[] = [
    { key: 'nome', header: 'Motorista', width: 'minmax(160px, 1.4fr)', cell: (r) => <span className="ab-dupla"><strong>{r.nome}</strong><span>{r.placas.join(', ')}</span></span> },
    { key: 'qtd', header: 'Abast.', align: 'end', width: 'minmax(70px, .5fr)', cell: (r) => num(String(r.qtd)) },
    { key: 'litros', header: 'Litros', align: 'end', width: 'minmax(90px, .7fr)', cell: (r) => num(fmtLitros(r.litros)) },
    { key: 'valor', header: 'Gasto', align: 'end', width: 'minmax(110px, .8fr)', cell: (r) => num(fmtMoeda(r.valor)) },
    { key: 'kml', header: 'km/l médio', align: 'end', width: 'minmax(100px, .7fr)', cell: (r) => num(fmtKmPorLitro(r.kmPorLitro)) },
  ]
  return (
    <div className="ab-paineis">
      <section aria-labelledby="ab-por-veiculo">
        <h2 id="ab-por-veiculo" className="ab-h2">Por veículo</h2>
        <Table columns={colunasVeiculo} rows={veiculos} rowKey={(r) => r.veiculoId ?? `placa:${r.placa}`} onRowClick={(r) => onVeiculo(r.veiculoId ?? `placa:${r.placa}`)} rowActions={() => []}
          empty={<EmptyState align="start" icon={<Fuel size={36} />} title="Nenhum abastecimento no período">Importe um extrato do CTF, do Ticket Log ou da fatura do cartão.</EmptyState>} />
      </section>
      <section aria-labelledby="ab-por-motorista">
        <h2 id="ab-por-motorista" className="ab-h2">Por motorista</h2>
        <Table columns={colunasMotorista} rows={motoristas} rowKey={(r) => r.motoristaId ?? `nome:${r.nome}`} empty={<EmptyState align="start" title="Sem motoristas no período" />} />
      </section>
    </div>
  )
}

export function Anomalias({ lista }: { lista: Anomalia[] }) {
  const colunas: TableColumn<Anomalia>[] = [
    { key: 'data', header: 'Data', width: 'minmax(130px, .9fr)', cell: (a) => num(fmtDataHora(a.abastecimento.data)) },
    { key: 'veiculo', header: 'Veículo', width: 'minmax(110px, .8fr)', cell: (a) => <strong>{a.abastecimento.placa}</strong> },
    { key: 'motorista', header: 'Motorista', width: 'minmax(140px, 1fr)', hideBelow: 'mobile', cell: (a) => a.abastecimento.motorista || '—' },
    { key: 'tipo', header: 'Anomalia', width: 'minmax(210px, 1fr)', cell: (a) => <StatusBadge tone={a.gravidade === 'alta' ? 'danger' : 'warning'} dot>{ANOMALIA_ROTULO[a.tipo]}</StatusBadge> },
    { key: 'motivo', header: 'Motivo', width: 'minmax(220px, 2fr)', cell: (a) => a.motivo },
    { key: 'abast', header: 'Abastecimento', width: 'minmax(150px, 1fr)', hideBelow: 'compact', cell: (a) => num(`${fmtLitros(a.abastecimento.litros)} · ${fmtMoeda(a.abastecimento.valor)}`) },
  ]
  return (
    <Table columns={colunas} rows={lista} rowKey={(a) => a.id} severity={(a) => ({ tone: a.gravidade === 'alta' ? 'danger' : 'warning', label: a.gravidade === 'alta' ? 'Gravidade alta' : 'Gravidade média' })}
      empty={<EmptyState align="start" icon={<TriangleAlert size={36} />} title="Nenhuma anomalia no período">As regras: litros acima do tanque, km/l fora de 2 desvios do histórico do veículo e dois abastecimentos em menos de 1 h.</EmptyState>} />
  )
}

const PRIORIDADE_TONE = { alta: 'danger', media: 'warning', baixa: 'neutral' } as const
const PRIORIDADE_ROTULO = { alta: 'Prioridade alta', media: 'Prioridade média', baixa: 'Prioridade baixa' } as const

function PropostaCard({ p, linkAlvo }: { p: Proposta; linkAlvo: string | null }) {
  const toast = useToast()
  const copiar = () => {
    void navigator.clipboard?.writeText(`*${p.titulo}*\n${p.justificativa}`).then(() => toast({ tone: 'success', message: 'Texto copiado.' }), () => toast({ tone: 'danger', message: 'Não foi possível copiar.' }))
  }
  return (
    <article className="ab-proposta surface" aria-label={p.titulo}>
      <header className="ab-proposta__cabecalho">
        <StatusBadge tone={PRIORIDADE_TONE[p.prioridade]} dot>{PRIORIDADE_ROTULO[p.prioridade]}</StatusBadge>
        {linkAlvo ? <a className="ab-link" href={linkAlvo}>Abrir {p.alvo.entidade === 'cr40f_veiculos' ? 'veículo' : 'motorista'} <ExternalLink size={14} aria-hidden /></a> : null}
      </header>
      <h3 className="ab-proposta__titulo">{p.titulo}</h3>
      <p className="ab-proposta__texto">{p.justificativa}</p>
      {p.tipo === 'FrotaDicaCombustivel' ? <footer className="ab-proposta__acoes"><Button variant="secondary" size="compact" icon={<Copy size={16} />} onClick={copiar}>Copiar para WhatsApp</Button></footer> : null}
    </article>
  )
}

type DicasProps = { alertas: Proposta[]; dicas: Proposta[]; contexto: () => string; linkAlvo: (p: Proposta) => string | null }

/** Alertas (gestor) e dicas (motorista) calculados por regra; a IA do Assistente da Frota redige a partir do mesmo contexto. */
export function DicasAlertas({ alertas, dicas, contexto, linkAlvo }: DicasProps) {
  const toast = useToast()
  const copiarContexto = () => {
    void navigator.clipboard?.writeText(contexto()).then(() => toast({ tone: 'success', message: 'Contexto copiado.' }), () => toast({ tone: 'danger', message: 'Não foi possível copiar.' }))
  }
  return (
    <div className="ab-paineis">
      <p className="ab-nota">
        <Sparkles size={16} aria-hidden /> Calculado por regras fixas sobre o período filtrado. O Assistente da Frota ainda não recebe este contexto sozinho (o flow agendado está pendente): use "Copiar contexto da IA" e, quando o flow existir, o gestor aprova as propostas em <a className="ab-link" href="#/assistente-frota">Frota › Assistente</a>.<Button variant="ghost" size="compact" icon={<Copy size={16} />} onClick={copiarContexto}>Copiar contexto da IA</Button>
      </p>
      <section aria-labelledby="ab-alertas">
        <h2 id="ab-alertas" className="ab-h2"><TriangleAlert size={16} aria-hidden /> Alertas ao gestor <span className="ab-contagem">{alertas.length}</span></h2>
        {alertas.length ? <div className="ab-cards">{alertas.map((p) => <PropostaCard key={p.id} p={p} linkAlvo={linkAlvo(p)} />)}</div> : <EmptyState align="start" title="Nenhum alerta">Sem anomalias no período.</EmptyState>}
      </section>
      <section aria-labelledby="ab-dicas">
        <h2 id="ab-dicas" className="ab-h2"><Lightbulb size={16} aria-hidden /> Dicas aos motoristas <span className="ab-contagem">{dicas.length}</span></h2>
        {dicas.length ? <div className="ab-cards">{dicas.map((p) => <PropostaCard key={p.id} p={p} linkAlvo={linkAlvo(p)} />)}</div> : <EmptyState align="start" title="Nenhuma dica">Consumo, preço pago e odômetro informados dentro do esperado.</EmptyState>}
      </section>
    </div>
  )
}

type PendenciasProps = { lista: Abastecimento[]; veiculos: Veiculo[]; onVincular: (id: string, veiculoId: string) => Promise<void> }

/** Abastecimentos importados com placa sem cadastro: o gestor escolhe o veículo e o vínculo é gravado na hora. */
export function Pendencias({ lista, veiculos, onVincular }: PendenciasProps) {
  const toast = useToast()
  const [escolha, setEscolha] = useState<Record<string, string | null>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const opcoes = veiculos.filter((v) => v.ativo).map((v) => ({ value: v.id, label: v.placa, subtitle: v.modelo }))
  async function vincular(a: Abastecimento) {
    const veiculoId = escolha[a.id]
    if (!veiculoId) return
    setSalvando(a.id)
    try { await onVincular(a.id, veiculoId); toast({ tone: 'success', message: `${a.placa} vinculada ao veículo.` }) }
    catch (reason) { toast({ tone: 'danger', message: `Não foi possível vincular: ${reason instanceof Error ? reason.message : String(reason)}` }) }
    finally { setSalvando(null) }
  }
  if (!lista.length) return <EmptyState className="surface" align="start" icon={<Link2 size={36} />} title="Nenhuma pendência">Todas as placas dos extratos têm veículo cadastrado.</EmptyState>
  return (
    <ul className="ab-pendencias" aria-label="Pendências de veículo">
      {lista.map((a) => (
        <li key={a.id} className="ab-pendencia surface">
          <div className="ab-pendencia__info">
            <strong>{a.placa}</strong>
            <span className="ab-muted">{fmtData(a.data)} · {fmtLitros(a.litros)} · {fmtMoeda(a.valor)} · {ORIGEM_ROTULO[a.origem]}{a.motorista ? ` · ${a.motorista}` : ''}{a.posto ? ` · ${a.posto}` : ''}</span>
          </div>
          <div className="ab-pendencia__acao">
            <Select aria-label={`Veículo para ${a.placa}`} options={opcoes} value={escolha[a.id] ?? null} onChange={(v) => setEscolha({ ...escolha, [a.id]: v })} placeholder="Escolher veículo" disabled={salvando === a.id} />
            <Button size="compact" disabled={!escolha[a.id]} loading={salvando === a.id} onClick={() => void vincular(a)}>Vincular</Button>
          </div>
        </li>
      ))}
      <li className="ab-muted">{plural(lista.length, 'abastecimento sem veículo', 'abastecimentos sem veículo')}. Cadastre a placa em Frota › Veículos se for um carro novo.</li>
    </ul>
  )
}
