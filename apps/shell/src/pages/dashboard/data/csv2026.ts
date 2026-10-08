import { CAT_ITEM_SERVICO, SEM_CLIENTE, SEM_MOTORISTA } from '../domain/codes'
import { normL } from '../domain/format'
import { dayKey } from '../domain/periodo'
import type { Reserva } from '../domain/types'
import { CSV_2026, type Csv2026Row } from './historico2026'

export function mapCsv2026(row: Csv2026Row, index: number): Reserva {
  const [data, status, motorista, carro, , cliente, , veiculoTipo, valor] = row
  const ns = normL(status)
  const statusLabel = (ns === 'concluido' ? 'Concluído' : ns.indexOf('cancelado') === 0 ? 'Cancelado' : status) || 'Sem status'
  const mot = motorista && motorista !== '-' ? motorista : SEM_MOTORISTA
  const cli = cliente && cliente !== '-' ? cliente : SEM_CLIENTE
  const veiNome = carro && carro !== '.' && carro !== '-' ? carro : '—'
  const dia = dayKey(data)
  return {
    id: `legacy-2026-${String(index + 1).padStart(4, '0')}`,
    saidaRaw: data, saidaMs: Date.parse(data), dia, mes: dia.slice(0, 7), criadoRaw: '',
    status: null, statusLabel, fatStatus: null, fatStatusLabel: 'Histórico CSV',
    categoriaItem: CAT_ITEM_SERVICO, categoriaItemLabel: String(CAT_ITEM_SERVICO),
    tipoVeiculoRaw: veiculoTipo, tipoVeiculo: veiculoTipo || '—',
    veiculoId: veiNome === '—' ? '' : `legacy:${normL(veiNome)}`,
    motoristaId: '', motoristaKey: `nome:${normL(mot)}`, motorista: mot, cliente: cli,
    cpId: '', valor, cpPendente: false, cpConcluida: false, opId: '',
  }
}

let cache: Reserva[] | null = null
/** As linhas do CSV como reservas; o mesmo array é reaproveitado entre cargas. */
export function reservasCsv2026(): Reserva[] {
  return (cache ??= CSV_2026.map(mapCsv2026))
}
