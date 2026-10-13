import type { Motorista, OperacionalData, Reserva, Veiculo } from '../domain/types'

const VEICULOS: Veiculo[] = [
  { id: 'v-corolla', placa: 'RUH7G45', modelo: 'Corolla', cor: 'Prata' },
  { id: 'v-compass', placa: 'FCB8B61', modelo: 'Compass', cor: 'PRETA' },
  { id: 'v-spin', placa: 'GHT2C19', modelo: 'Spin', cor: '' },
]

const MOTORISTAS: Motorista[] = [
  { id: 'm-carlos', nome: 'Carlos Henrique Lima', apelido: 'Carlão', celular: '(11) 98888-1001', veiculoAtualId: 'v-corolla', terceiro: false },
  { id: 'm-marina', nome: 'Marina Lopes', apelido: '', celular: '(11) 98888-1002', veiculoAtualId: 'v-compass', terceiro: false },
  { id: 'm-joao', nome: 'João Pedro de Araújo', apelido: 'JP', celular: '', veiculoAtualId: 'v-spin', terceiro: false },
  { id: 'm-rita', nome: 'Rita Fernandes', apelido: '', celular: '(11) 98888-1004', veiculoAtualId: null, terceiro: true },
]

export const MOCK_STATUS = [
  { value: 202410000, label: 'Pré-reserva' }, { value: 202410004, label: 'Solicitado' }, { value: 202410001, label: 'Confirmado' },
  { value: 202410005, label: 'Programado' }, { value: 100000001, label: 'Requer Análise' }, { value: 202410008, label: 'Concluído' },
  { value: 202410002, label: 'Cancelado' },
]

/** Dia de exemplo em torno de `now`: sem motorista, atrasado, aberto, conflito, concluído e tranquilos. */
export function createMockData(now: Date): OperacionalData {
  const at = (minutes: number) => new Date(Math.floor(now.getTime() / 60_000) * 60_000 + minutes * 60_000)
  const status = (label: string) => MOCK_STATUS.find((s) => s.label === label)!
  let seq = 0
  const make = (minutes: number, label: string, motorista: (typeof MOTORISTAS)[number] | null, extra: Partial<Reserva> = {}): Reserva => {
    seq += 1
    return {
      id: `mock-${seq}`, codigo: String(4200 + seq), statusValue: status(label).value, status: label, faturamento: 'A faturar',
      tipoServico: ['Transfer', 'Aeroporto', 'Disposição', 'City Tour'][seq % 4], tipoVeiculo: seq % 2 ? 'Sedan executivo' : 'Van executiva',
      saida: at(minutes), retorno: at(minutes + 120), destino: 'Av. Brigadeiro Faria Lima, 3477', enderecoSaida: 'Aeroporto de Guarulhos, Terminal 3',
      trajeto: seq % 2 ? 'GRU → Faria Lima' : 'Congonhas → Paulista', obsOperacao: seq === 2 ? 'Placa de recepção com o nome do cliente.' : '', obsInterna: '',
      motoristaId: motorista?.id ?? null, motorista: motorista?.nome ?? '', veiculo: motorista ? `Placa ABC-${1000 + seq}` : '',
      cliente: 'Cliente Exemplo S.A.', solicitante: 'Paula Martins', passageirosLookup: [],
      passageirosTexto: 'Ana Souza - (11) 97777-0001\nBruno Teixeira - (21) 97777-0002',
      veiculoId: label === 'Concluído' ? motorista?.veiculoAtualId ?? null : null, linkAcompanhamento: '', linkExpiraEm: null, ...extra,
    }
  }
  const [carlos, marina, joao, rita] = MOTORISTAS
  const reservas = [
    make(-180, 'Concluído', marina),
    make(-15, 'Solicitado', joao),
    make(-40, 'Programado', rita),
    make(18, 'Confirmado', null),
    make(25, 'Pré-reserva', marina),
    make(70, 'Confirmado', carlos),
    make(90, 'Programado', carlos),
    make(200, 'Requer Análise', rita),
    make(420, 'Confirmado', joao),
    make(480, 'Cancelado', marina),
  ].sort((a, b) => a.saida!.getTime() - b.saida!.getTime())
  const first = reservas.find((r) => r.motoristaId === carlos.id)!
  return {
    reservas,
    motoristas: MOTORISTAS,
    veiculos: VEICULOS,
    passageiros: { [first.id]: [{ id: 'sp-1', ordem: 1, nome: 'Ana Souza', enderecoSaida: 'Rua Haddock Lobo, 595' }] },
    queryMode: 'full',
    warnings: [],
  }
}
