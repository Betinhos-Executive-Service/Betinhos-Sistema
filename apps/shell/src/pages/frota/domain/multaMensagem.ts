import { diaSP, formatBR, horaSP } from '../data/dates'
import { brl } from '../data/format'
import type { Dossie, DossieServico } from '../data/types'

const quando = (iso: string | null) => (iso ? `${formatBR(diaSP(iso))} às ${horaSP(iso)}` : 'sem data e hora')

function linhasServico(servicos: DossieServico[]) {
  if (!servicos.length) return ['Agenda: nenhum serviço desse veículo no horário.']
  return servicos.map((s) => {
    const titulo = s.noHorario ? 'Serviço na agenda' : 'Serviço próximo do horário'
    const horario = `${horaSP(s.saida)}${s.retorno ? `–${horaSP(s.retorno)}` : ''}`
    return `${titulo}: ${[s.codigo, s.cliente, horario].filter(Boolean).join(' · ')}${s.motorista ? ` (${s.motorista})` : ''}`
  })
}

function linhasRastreador(infleet: Dossie['infleet']) {
  if (infleet.erro) return [`Rastreador: indisponível (${infleet.erro})`]
  const viagens = infleet.viagens ?? []
  if (!viagens.length) return ['Rastreador: nenhuma viagem 30 minutos antes ou depois.']
  return viagens.map((v) => `Rastreador: viagem ${horaSP(v.inicio)}–${horaSP(v.fim)}${v.motorista ? ` com ${v.motorista}` : ''}`)
}

/** Texto que o gestor cola no WhatsApp do motorista (spec §5.6 e §7). Só usa o primeiro nome. */
export function mensagemWhatsApp(d: Dossie, motorista: string | null): string {
  const m = d.multa
  const nome = motorista?.trim().split(/\s+/)[0]
  const infracao = m.infracao ? [m.infracao.codigo, m.infracao.descricao].filter(Boolean).join(' - ') || 'não informada' : 'não informada'
  return [
    `Olá${nome ? `, ${nome}` : ''}. Chegou uma notificação de multa do veículo ${m.placa ?? 'sem placa'}.`,
    `Infração: ${infracao}${m.infracao?.valor != null ? ` (${brl(m.infracao.valor)})` : ''}`,
    `Quando: ${quando(m.dataHora)}`,
    `Local: ${m.local ?? 'não informado'}`,
    ...linhasServico(d.servicos),
    ...linhasRastreador(d.infleet),
    ...(m.dataParaIndicar ? [`Prazo para indicar o condutor: ${formatBR(m.dataParaIndicar)}`] : []),
    'Pode me confirmar se era você ao volante? Com a sua confirmação eu faço a indicação.',
  ].join('\n')
}
