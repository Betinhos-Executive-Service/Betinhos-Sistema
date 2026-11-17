import { describe, expect, it } from 'vitest'
import { MANUT } from '../data/schema'
import type { DetalheManutencao } from '../data/types'
import { avaliar, lerAgendar, lerProgramar, rotuloExtra, textoDespesa, valoresAgendarIniciais } from './manutencaoEtapas'

const HOJE = '2026-11-17'
const base: DetalheManutencao = {
  id: 'm1', codigo: 'OM-1', descricao: 'Revisão fictícia', status: MANUT.SOLICITADO, grau: 2, tipo: null, agendarPara: null, janelaInicio: null, janelaFim: null,
  dataAprovacao: null, kmRealizado: null, dataManutencao: null, valor: null, estabelecimento: null, servicoRealizado: null, comentarioAprovador: null, km: 60000,
  veiculo: { id: 'v1', label: 'TST4D44' }, solicitante: { id: 'p1', label: 'Motorista Fictício' }, criadoEm: '2026-11-14T12:00:00Z', servicos: [], categorias: [],
  origemClassificacao: null, confiancaIa: null, comentarioAoMotorista: null, comentarioColaborador: null, pagamento: null, realizadoPor: null, fotosPedido: [],
  linkNotaFiscal: null, fotosFinais: [], programacao: null, despesa: null,
}
const m = (patch: Partial<DetalheManutencao>): DetalheManutencao => ({ ...base, ...patch })
const agendada = m({ status: MANUT.AGENDADO, janelaInicio: '2026-11-23', janelaFim: '2026-11-29', dataAprovacao: '2026-11-17', programacao: { geralId: 'g1', motorista: null, saida: '2026-11-23T03:00:00.000Z' } })
const programada = m({ ...agendada, status: MANUT.PROGRAMADO, programacao: { geralId: 'g1', motorista: { id: 'p2', label: 'Outro Fictício' }, saida: '2026-11-24T13:00:00.000Z' } })

describe('avaliar', () => {
  it('Solicitado: etapa agendar, passo Agendar, esperando há 3 dias', () => {
    const s = avaliar(base, HOJE)
    expect(s).toMatchObject({ etapa: 'agendar', passo: 'Agendar', atual: 0, prazo: { rotulo: 'Esperando', texto: 'há 3 dias', perigo: false } })
    expect(s.extras).toEqual(['reprovar', 'cancelar', 'concluir'])
    expect(s.feitos).toEqual([])
  })
  it('Agendado: etapa programar, prazo é a janela, feito do agendamento', () => {
    const s = avaliar(agendada, HOJE)
    expect(s).toMatchObject({ etapa: 'programar', passo: 'Programar', atual: 1, prazo: { rotulo: 'Janela', perigo: false } })
    expect(s.prazo?.texto).toBe('23 a 29/11')
    expect(s.feitos).toEqual(['Agendada em 17/11/2026 para a semana de 23/11 a 29/11/2026 · Média'])
    expect(s.extras).toEqual(['reagendar', 'cancelar', 'concluir'])
  })
  it('Programado: etapa realizar, aguardando conclusão, feito da programação', () => {
    const s = avaliar(programada, HOJE)
    expect(s).toMatchObject({ etapa: 'realizar', passo: 'AguardarConclusao', atual: 2 })
    expect(s.feitos[1]).toBe('Programada: Outro Fictício, saída 24/11/2026 10:00')
    expect(s.extras).toEqual(['concluir', 'reagendar', 'cancelar'])
  })
  it('agendada para um dia: o feito diz o dia', () => {
    const s = avaliar(m({ ...agendada, janelaInicio: '2026-11-15', janelaFim: '2026-11-15' }), HOJE)
    expect(s.feitos[0]).toBe('Agendada em 17/11/2026 para o dia 15/11/2026 · Média')
  })
  it('janela vencida: prazo Atrasada desde o fim, em perigo', () => {
    const s = avaliar(m({ ...agendada, janelaInicio: '2026-11-09', janelaFim: '2026-11-15' }), HOJE)
    expect(s.prazo).toEqual({ rotulo: 'Atrasada', texto: 'desde 15/11', perigo: true })
  })
  it('Realizado: sem passo, prazo é o valor, extra só corrigir classificação', () => {
    const s = avaliar(m({ ...programada, status: MANUT.REALIZADO, valor: 1240, dataManutencao: '2026-11-24T13:00:00Z' }), HOJE)
    expect(s).toMatchObject({ etapa: 'realizada', passo: null, atual: null, extras: ['corrigirClassificacao'] })
    expect(s.prazo).toMatchObject({ rotulo: 'Valor', perigo: false })
    expect(s.feitos.at(-1)).toBe('Realizada em 24/11/2026')
  })
  it('Reprovada para em Agendar, sem extras, com o motivo nos feitos', () => {
    const s = avaliar(m({ status: MANUT.REPROVADO, comentarioAprovador: 'Duplicada' }), HOJE)
    expect(s).toMatchObject({ etapa: 'reprovada', passo: null, atual: 0, extras: [], prazo: null })
    expect(s.feitos).toEqual(['Reprovada: Duplicada'])
  })
  it('Cancelada depois de programada para em Realizar', () => {
    const s = avaliar(m({ ...programada, status: MANUT.CANCELADO, comentarioAprovador: null }), HOJE)
    expect(s).toMatchObject({ etapa: 'cancelada', atual: 2, extras: [] })
    expect(s.feitos.at(-1)).toBe('Cancelada')
  })
})

describe('rotuloExtra', () => {
  it('concluir muda de nome em Realizar', () => {
    expect(rotuloExtra('concluir', 'realizar')).toBe('Concluir por ele')
    expect(rotuloExtra('concluir', 'agendar')).toBe('Já foi feita: concluir')
    expect(rotuloExtra('cancelar', 'programar')).toBe('Cancelar manutenção')
  })
})

describe('lerAgendar', () => {
  it('começa com o grau do pedido e exige grau', () => {
    const v = valoresAgendarIniciais(base, HOJE)
    expect(v.grau).toBe(2)
    expect(lerAgendar({ ...v, grau: null }, HOJE).erros.grau).toBe('Escolha o grau')
  })
  it('devolve o pedido com a janela, o comentário e o grau', () => {
    const v = { ...valoresAgendarIniciais(base, HOJE), modo: 'semana' as const, semana: '2026-11-23', grau: 3 }
    expect(lerAgendar(v, HOJE).pedido).toEqual({ inicio: '2026-11-23', fim: '2026-11-29', comentario: null, grau: 3 })
  })
})

describe('lerProgramar', () => {
  it('exige motorista e saída', () => {
    expect(lerProgramar({ motoristaId: null, saida: '' }, agendada).erros).toEqual({ motorista: 'Escolha o motorista', saida: 'Informe a data e hora de saída' })
  })
  it('converte o horário de São Paulo para UTC e diz se ficou fora da janela', () => {
    expect(lerProgramar({ motoristaId: 'p2', saida: '2026-11-24T10:00' }, agendada)).toEqual({ erros: {}, saidaIso: '2026-11-24T13:00:00.000Z', foraDaJanela: false })
    expect(lerProgramar({ motoristaId: 'p2', saida: '2026-11-30T10:00' }, agendada).foraDaJanela).toBe(true)
  })
})

describe('textoDespesa', () => {
  it('anexo incompleto vem antes do status operacional', () => {
    expect(textoDespesa({ id: 'd', statusOperacional: 100000002, statusAnexo: 100000001 })).toBe('Aguardando a nota')
    expect(textoDespesa({ id: 'd', statusOperacional: 100000000, statusAnexo: 100000002 })).toBe('Em conferência')
    expect(textoDespesa({ id: 'd', statusOperacional: 100000002, statusAnexo: 100000002 })).toBe('Conferida')
  })
})
