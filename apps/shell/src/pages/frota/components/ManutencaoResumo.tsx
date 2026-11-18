// apps/shell/src/pages/frota/components/ManutencaoResumo.tsx
import { MoreHorizontal } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Button, Menu, StatusBadge, type MenuAction, type StatusTone } from '@betinhos/ui'
import { formatBR, diaSP } from '../data/dates'
import { GRAU, STATUS_OPTIONS, TIPO_REPARO, label } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { rotuloExtra, textoSaida, type Extra, type Situacao } from '../domain/manutencaoEtapas'
import { Arquivos } from './ManutencaoPassoAPasso'

const tomDoGrau = (grau: number | null): StatusTone => (grau === 4 ? 'danger' : grau === 3 ? 'warning' : 'neutral')

/** Bloco da gaveta: título curto em caixa alta e conteúdo. `destaque` = o passo atual (fundo branco, borda forte). */
export function Bloco({ titulo, destaque = false, children }: { titulo: string; destaque?: boolean; children: ReactNode }) {
  const id = useId()
  return (
    <section className="frota-bloco" data-destaque={destaque ? '' : undefined} aria-labelledby={id}>
      <h2 id={id} className="frota-bloco__titulo">{titulo}</h2>
      {children}
    </section>
  )
}

/** Linha de chips logo abaixo do título da gaveta: grau, status, prazo e quem pediu (ou quem leva). */
export function CabecalhoManutencao({ m, situacao }: { m: DetalheManutencao; situacao: Situacao }) {
  const p = m.programacao
  const leva = situacao.etapa === 'realizar' && p?.motorista && p.saida ? `${p.motorista.label} leva em ${textoSaida(p.saida)}` : null
  const dia = formatBR(diaSP(m.criadoEm)).slice(0, 5)
  const pedido = `pedido por ${m.solicitante?.label || 'não informado'}${dia ? ` em ${dia}` : ''}`
  return (
    <div className="frota-cabecalho">
      {m.grau !== null ? <StatusBadge tone={tomDoGrau(m.grau)}>{label(GRAU, m.grau)}</StatusBadge> : null}
      <StatusBadge tone="info">{label(STATUS_OPTIONS.manutencao, m.status)}</StatusBadge>
      {situacao.prazo ? (
        <StatusBadge tone={situacao.prazo.perigo ? 'danger' : 'neutral'} data-perigo={situacao.prazo.perigo ? '' : undefined}>
          {situacao.prazo.rotulo} <span>{situacao.prazo.texto}</span>
        </StatusBadge>
      ) : null}
      <span className="frota-muted">{leva ?? pedido}</span>
    </div>
  )
}

/** "⋯ Mais ações" com as exceções da etapa; vai nas actions do Drawer. */
export function MaisAcoes({ situacao, onExtra }: { situacao: Situacao; onExtra: (extra: Extra) => void }) {
  const acoes: MenuAction[] = situacao.extras.map((extra) => ({ id: extra, label: rotuloExtra(extra, situacao.etapa), onSelect: () => onExtra(extra) }))
  if (!acoes.length) return null
  return <Menu trigger={(props) => <Button variant="ghost" size="compact" icon={<MoreHorizontal size={16} />} aria-label="Mais ações" {...props} />} actions={acoes} />
}

/** Card do pedido do motorista: descrição citada, campos preenchidos, fotos e link do veículo. */
export function PedidoManutencao({ m, onOpenVeiculo }: { m: DetalheManutencao; onOpenVeiculo?: (id: string) => void }) {
  const linhas: [string, string][] = []
  if (m.km !== null) linhas.push(['Km no pedido', `${m.km.toLocaleString('pt-BR')} km`])
  if (m.tipo !== null) linhas.push(['Tipo de reparo', label(TIPO_REPARO, m.tipo)])
  if (m.comentarioAoMotorista) linhas.push(['Comentário ao motorista', m.comentarioAoMotorista])
  return (
    <Bloco titulo="Pedido">
      {m.descricao ? <p className="frota-bloco__citacao">“{m.descricao}”</p> : null}
      {linhas.length ? (
        <dl className="frota-detail">
          {linhas.map(([nome, valor]) => <div key={nome} className="frota-detail__row"><dt>{nome}</dt><dd>{valor}</dd></div>)}
        </dl>
      ) : null}
      <Arquivos titulo="Fotos do pedido" links={m.fotosPedido} />
      {m.veiculo && onOpenVeiculo ? <button type="button" className="frota-link" onClick={() => onOpenVeiculo(m.veiculo!.id)}>Ver o veículo {m.veiculo.label}</button> : null}
    </Bloco>
  )
}

/** O que já foi feito, como linha do tempo. Reprovada/cancelada mostram o motivo no card do passo, não aqui. */
export function HistoricoManutencao({ situacao }: { situacao: Situacao }) {
  const parada = situacao.etapa === 'reprovada' || situacao.etapa === 'cancelada'
  if (parada || !situacao.feitos.length) return null
  return (
    <Bloco titulo="Histórico">
      <ol className="frota-linha-tempo">{situacao.feitos.map((f) => <li key={f}>{f}</li>)}</ol>
    </Bloco>
  )
}
