import { dayKey } from './periodo'
import type { Dados, EventoConducao, Funcionario, Manutencao, Multa, Reserva, TelemetriaDia, Veiculo, Viagem } from './types'

/** Todos os conjuntos vazios e disponíveis; sobrescreva o que importa. */
export const dadosVazios = (p: Partial<Dados> = {}): Dados => ({
  reservas: [], manutencoes: [], multas: [], ocorrencias: [], funcionarios: [], veiculos: [], viagens: [], eventos: [], telemetria: [],
  pagantes: [], despesas: [], categoriasDespesa: [], formasPagamento: [], preventivas: { veiculos: [], manutencoes: [], itens: [], baselines: [] }, indisponiveis: [], ...p,
})

/** Reserva de teste: serviço concluído de R$ 0 sem motorista, cliente nem veículo; sobrescreva o que importa. */
export function reserva(p: Partial<Reserva> & { saidaRaw?: string } = {}): Reserva {
  const saidaRaw = p.saidaRaw ?? '2026-10-05T15:00:00Z'
  const dia = dayKey(saidaRaw)
  return {
    id: Math.random().toString(36).slice(2), saidaRaw, saidaMs: saidaRaw ? Date.parse(saidaRaw) : NaN, dia, mes: dia.slice(0, 7),
    criadoRaw: '2026-09-01T12:00:00Z', status: 202410008, statusLabel: 'Concluído', fatStatus: null, fatStatusLabel: '—',
    categoriaItem: 100000000, categoriaItemLabel: 'Serviço', tipoVeiculoRaw: '1', tipoVeiculo: 'Executivo', veiculoId: '',
    motoristaId: '', motoristaKey: 'nome:sem motorista', motorista: 'Sem motorista', cliente: 'Sem cliente', cpId: '', cpCodigo: '', opCodigo: '',
    valor: 0, cpPendente: false, cpConcluida: false, opId: '', tipoServico: '—', finalizadoRaw: '',
    ...p,
  }
}

/** Fábricas de teste dos conjuntos secundários: campos extras vazios/zerados; sobrescreva o que importa. */
export const manutencao = (p: Partial<Manutencao> = {}): Manutencao => ({
  dia: '2026-10-05', valor: 0, aprovacaoDia: '', statusLabel: '', tipoReparo: '—', veiculoId: '', criadoDia: '', dataMs: NaN, criadoMs: NaN, ...p,
})
export const multa = (p: Partial<Multa> = {}): Multa => ({
  id: '', dia: '2026-10-05', status: null, statusLabel: '', motoristaId: '', motorista: '—', veiculoId: '', infracaoCodigo: '', infracaoDescricao: '', ...p,
})
export const funcionario = (p: Partial<Funcionario> = {}): Funcionario => ({ id: '', nome: '', apelido: '', statusLabel: 'Ativo', cnhMs: NaN, funcao: '—', empresa: '', ...p })
export const veiculo = (p: Partial<Veiculo> = {}): Veiculo => ({ id: '', statusLabel: '', categoria: '', placa: '', marca: '', modelo: '', blindado: false, ano: null, ...p })
export const viagem = (p: Partial<Viagem> = {}): Viagem => ({
  dia: '2026-10-05', mes: '2026-10', veiculoId: '', motoristaId: '', distancia: 0, velocidadeMedia: 0, velocidadeMaxima: 0, combustivelL: 0, custoCombustivel: 0, ...p,
})
export const evento = (p: Partial<EventoConducao> = {}): EventoConducao => ({
  dia: '2026-10-05', mes: '2026-10', motoristaId: '', tipo: '', veiculoId: '', descricao: '', velocidade: 0, limite: 0, ...p,
})
export const telemetria = (p: Partial<TelemetriaDia> = {}): TelemetriaDia => ({
  dia: '2026-10-05', mes: '2026-10', veiculoId: '', ociosoMin: 0, distanciaKm: 0, velocidadeMedia: 0, velocidadeMaxima: 0, excessos: 0, autonomia: 0, tempoAcimaMin: 0, ...p,
})
