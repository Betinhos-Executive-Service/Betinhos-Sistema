import type { Motorista, Reserva, Veiculo } from './types'

const STATUS_CONCLUIDO = 202410008

const suavizar = (t: string) =>
  t.length > 3 && t === t.toUpperCase() && t !== t.toLowerCase() ? t.toLowerCase().replace(/(^|\s)\p{L}/gu, (l) => l.toUpperCase()) : t

const nomeDoCarro = (v: Veiculo) => [v.modelo, v.cor].map((p) => suavizar(p.trim())).filter(Boolean).join(' ')

/** Antes de concluir: carro atual do motorista. Depois: carro gravado no serviço (o do faturamento). */
export function carroDoServico(reserva: Reserva, motorista: Motorista | undefined, veiculos: Veiculo[]): Veiculo | null {
  const id = reserva.statusValue === STATUS_CONCLUIDO ? reserva.veiculoId : motorista?.veiculoAtualId
  return (id && veiculos.find((v) => v.id === id)) || null
}

export function descreverCarro(v: Veiculo) {
  const cor = v.cor.trim() ? '' : ' · cor não cadastrada'
  return `${nomeDoCarro(v) || v.modelo}${cor} · ${v.placa}`
}

export function mensagemCliente({ motorista, carro, link }: { motorista: string; carro: Veiculo | null; link: string | null }) {
  const linhas = [`*Seu motorista:* ${motorista}`]
  if (carro) linhas.push(`• *Carro:* ${nomeDoCarro(carro) || carro.modelo}`, `• *Placa:* ${carro.placa}`)
  if (link) linhas.push(`• *Acompanhe:* ${link}`)
  return linhas.join('\n')
}

export function linkValido(reserva: Reserva, now: Date) {
  return reserva.linkAcompanhamento && reserva.linkExpiraEm && reserva.linkExpiraEm > now ? reserva.linkAcompanhamento : null
}
