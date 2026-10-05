import type { Reserva } from './types'

let seq = 0

/** Fábrica de reservas para testes; `hora` ("HH:mm") vira `saida` em 05/10/2026, fuso de São Paulo. */
export function reserva(partial: Partial<Reserva> & { hora?: string } = {}): Reserva {
  const { hora, ...rest } = partial
  seq += 1
  return {
    id: `r${seq}`, codigo: String(1000 + seq), statusValue: null, status: 'Confirmado', faturamento: '', tipoServico: 'Transfer', tipoVeiculo: '',
    saida: hora ? new Date(`2026-10-05T${hora}:00-03:00`) : null, retorno: null, destino: '', enderecoSaida: '', trajeto: '', obsOperacao: '', obsInterna: '',
    motoristaId: 'm1', motorista: 'Carlos', veiculo: '', cliente: '', solicitante: '', passageirosLookup: [], passageirosTexto: '',
    ...rest,
  }
}
