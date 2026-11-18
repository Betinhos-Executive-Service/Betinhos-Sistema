// apps/shell/src/pages/frota/data/mock.test.ts
import { describe, expect, it } from 'vitest'
import { segundaDe, somarDias } from '../domain/janela'
import { addMonths, todaySP } from './dates'
import { createMockSource } from './mock'
import { ANEXO_DESPESA, MANUT } from './schema'
import type { PedidoConclusao } from './source'

const pedido = (id: string, extra: Partial<PedidoConclusao> = {}): PedidoConclusao => ({ manutencaoId: id, servicos: [100000007], km: 51000, data: '2026-11-17T10:00:00-03:00', valor: 350.5, pagamento: 202410003, estabelecimento: 'Oficina Teste', cidadeId: 'c1', realizadoPorId: 'f1', servicoRealizado: null, comentario: null, linkNotaFiscal: 'https://example.invalid/nf', linkFotoFinal1: null, linkFotoFinal2: null, linkFotoFinal3: null, ...extra })

describe('mock das manutenções', () => {
  it('a fila de exemplo tem pedidos de graus diferentes, e o detalhe do m1 tem fotos', async () => {
    const source = createMockSource()
    const { data } = await source.load()
    expect(data.manutencoes.filter((m) => m.status === MANUT.SOLICITADO).map((m) => m.id)).toEqual(expect.arrayContaining(['m1', 'm7', 'm8']))
    expect(data.manutencoes.find((m) => m.id === 'm3')).toMatchObject({ status: MANUT.PROGRAMADO })
    expect((await source.detalheManutencao('m1'))?.fotosPedido).toHaveLength(2)
    expect(await source.detalheManutencao('nao-existe')).toBeNull()
  })

  it('mock: programar leva a Programado e o detalhe mostra a programação', async () => {
    const source = createMockSource()
    const antes = await source.detalheManutencao('m2') // m2 é Agendado nos fixtures
    expect(antes?.programacao).toMatchObject({ geralId: 'g-m2', motorista: null, saida: null })
    expect(antes?.despesa).toBeNull()
    await source.programarManutencao({ manutencaoId: 'm2', geralId: antes!.programacao!.geralId, motoristaId: 'f1', saida: '2026-11-24T13:00:00.000Z' })
    const depois = await source.detalheManutencao('m2')
    expect(depois?.status).toBe(MANUT.PROGRAMADO)
    expect(depois?.programacao).toEqual({ geralId: 'g-m2', motorista: { id: 'f1', label: 'Ana Souza (fictício)' }, saida: '2026-11-24T13:00:00.000Z' })
    // Programado não programa de novo (só Agendado).
    await expect(source.programarManutencao({ manutencaoId: 'm2', geralId: 'g-m2', motoristaId: 'f2', saida: '2026-11-24T13:00:00.000Z' })).rejects.toThrow('Só dá para programar uma manutenção agendada.')
  })

  it('mock: a linha da Geral cancelada junto com a manutenção não volta como programação', async () => {
    const source = createMockSource()
    await source.cancelarManutencao('m2', null)
    expect((await source.detalheManutencao('m2'))?.programacao).toBeNull()
  })

  it('mock: agendar cria ou zera a linha, aplica o grau e o detalhe da realizada traz a despesa', async () => {
    const source = createMockSource()
    const inicio = segundaDe(somarDias(todaySP(), 7))
    await source.agendarManutencao({ manutencaoId: 'm1', inicio, fim: somarDias(inicio, 6), comentario: null, grau: 2 })
    const m1 = await source.detalheManutencao('m1')
    expect(m1).toMatchObject({ status: MANUT.AGENDADO, grau: 2, programacao: { geralId: 'g-m1', motorista: null, saida: null } })
    expect((await source.detalheManutencao('m4'))?.despesa).toEqual({ id: 'd-m4', statusOperacional: 100000000, statusAnexo: 100000002 })
  })

  it('encaixa só janela válida e grava a data do encaixe e o comentário', async () => {
    const source = createMockSource()
    await expect(source.agendarManutencao({ manutencaoId: 'm1', inicio: '2026-11-17', fim: '2026-11-23', comentario: null })).rejects.toThrow('A janela precisa ser um dia ou uma semana de segunda a domingo.')
    const inicio = segundaDe(somarDias(todaySP(), 7))
    await source.agendarManutencao({ manutencaoId: 'm1', inicio, fim: somarDias(inicio, 6), comentario: 'Levar cedo' })
    expect(await source.detalheManutencao('m1')).toMatchObject({ status: MANUT.AGENDADO, janelaInicio: inicio, janelaFim: somarDias(inicio, 6), dataAprovacao: todaySP(), comentarioAoMotorista: 'Levar cedo' })
  })

  it('reprova só Solicitado e exige o motivo', async () => {
    const source = createMockSource()
    await expect(source.reprovarManutencao('m2', 'Sem verba')).rejects.toThrow('Só dá para reprovar uma manutenção que ainda não foi encaixada.')
    await expect(source.reprovarManutencao('m8', ' ')).rejects.toThrow('Escreva o motivo da reprovação.')
    await source.reprovarManutencao('m8', 'Sem verba')
    expect(await source.detalheManutencao('m8')).toMatchObject({ status: MANUT.REPROVADO, comentarioAprovador: 'Sem verba' })
  })

  it('conclui com a nota, devolve a despesa com anexo pendente e grava a classificação manual', async () => {
    const source = createMockSource()
    await expect(source.concluirManutencao(pedido('m2', { linkNotaFiscal: null }))).rejects.toThrow('Falta a foto da nota fiscal.')
    expect(await source.concluirManutencao(pedido('m2'))).toEqual({ despesaId: 'd-m2', statusAnexo: ANEXO_DESPESA.PENDENTE, geralId: null })
    expect(await source.detalheManutencao('m2')).toMatchObject({ status: MANUT.REALIZADO, servicos: [100000007], categorias: [100000001], kmRealizado: 51000, valor: 350.5, pagamento: 202410003, realizadoPor: { id: 'f1' }, linkNotaFiscal: 'https://example.invalid/nf' })
  })

  it('recusa como o servidor: conclusão sem os dados obrigatórios e ação em manutenção já encerrada', async () => {
    const source = createMockSource()
    await expect(source.concluirManutencao(pedido('m2', { servicos: [] }))).rejects.toThrow('Escolha pelo menos um serviço realizado.')
    await expect(source.concluirManutencao(pedido('m2', { km: 0 }))).rejects.toThrow('Informe o km do veículo.')
    await expect(source.concluirManutencao(pedido('m2', { valor: 0 }))).rejects.toThrow('Informe o valor pago.')
    await expect(source.concluirManutencao(pedido('m2', { pagamento: 1 }))).rejects.toThrow('Escolha a forma de pagamento.')
    await expect(source.concluirManutencao(pedido('m2', { estabelecimento: ' ' }))).rejects.toThrow('Informe o estabelecimento.')
    await source.reprovarManutencao('m8', 'Sem verba')
    await expect(source.cancelarManutencao('m8', null)).rejects.toThrow('Esta manutenção já foi encerrada.')
    await expect(source.concluirManutencao(pedido('m8'))).rejects.toThrow('Esta manutenção já foi encerrada.')
    await expect(source.agendarManutencao({ manutencaoId: 'm8', inicio: '2026-11-23', fim: '2026-11-29', comentario: null })).rejects.toThrow('Só dá para encaixar uma manutenção em aberto.')
  })

  it('cria a manutenção Solicitada no veículo escolhido', async () => {
    const source = createMockSource()
    const id = await source.criarManutencao({ veiculoId: 'v2', descricao: 'Pneu furado', grau: 3, tipo: null, km: 40000, solicitanteId: null })
    expect(await source.detalheManutencao(id)).toMatchObject({ descricao: 'Pneu furado', status: MANUT.SOLICITADO, veiculo: { id: 'v2', label: 'TST2B22' }, solicitante: null, km: 40000, grau: 3 })
  })

  it('buscas devolvem pessoas e cidades de exemplo pelo nome', async () => {
    const source = createMockSource()
    expect((await source.buscarFuncionarios('ana')).map((o) => o.id)).toEqual(['f1'])
    expect((await source.buscarCidades('')).length).toBeGreaterThan(1)
  })

  it('busca de veículos acha por placa ou modelo e esconde os vendidos', async () => {
    const source = createMockSource()
    expect(await source.buscarVeiculos('virtus')).toEqual([{ id: 'v2', nome: 'TST2B22 · Virtus' }])
    expect((await source.buscarVeiculos('tst')).map((o) => o.id)).not.toContain('v3')
  })
})

describe('mock dos descontos em folha', () => {
  const mes = (n: number) => addMonths(`${todaySP().slice(0, 7)}-01`, n).slice(0, 7)

  it('o mês atual traz os colaboradores fictícios e a linha do tempo tem parcelas de outros meses', async () => {
    const source = createMockSource()
    const atual = await source.listarDescontosPeriodo(mes(0), mes(0))
    expect(new Set(atual.map((p) => p.colaborador?.nome))).toEqual(new Set(['Ana Teste (fictício)', 'Bruno Teste (fictício)', 'Carla Teste (fictício)', 'Diego Teste (fictício)']))
    expect(atual.find((p) => p.multa?.auto === 'TST0002')).toMatchObject({ numero: 2, total: 3, valor: 33.33, status: 'prevista' })
    const periodo = await source.listarDescontosPeriodo(mes(-2), mes(2))
    expect(periodo.some((p) => p.competencia.slice(0, 7) === mes(-1) && p.status === 'descontada')).toBe(true)
    expect(periodo.some((p) => p.competencia.slice(0, 7) === mes(1))).toBe(true)
    expect(await source.previstasAntes(mes(0))).toEqual({ quantidade: 1, maisAntigo: mes(-2) })
  })

  it('lançar marca descontada com a data de hoje; lançar de novo recusa a parcela', async () => {
    const source = createMockSource()
    const [alvo] = (await source.listarDescontosPeriodo(mes(0), mes(0))).filter((p) => p.status === 'prevista')
    const r = await source.lancarDescontoFolha([alvo.id], 'lancar')
    expect(r.parcelas).toEqual([{ id: alvo.id, ok: true, erro: null }])
    const depois = (await source.listarDescontosPeriodo(mes(0), mes(0))).find((p) => p.id === alvo.id)
    expect(depois).toMatchObject({ status: 'descontada', lancadoEm: todaySP() })
    const de_novo = await source.lancarDescontoFolha([alvo.id], 'lancar')
    expect(de_novo.parcelas[0]).toEqual({ id: alvo.id, ok: false, erro: 'Esta parcela já foi lançada.' })
  })

  it('lançar a última parcela encerra a multa e desfazer a reabre', async () => {
    const source = createMockSource()
    const parcelas = await source.listarParcelasMulta('u11')
    expect(parcelas.map((p) => p.status)).toEqual(['descontada', 'prevista', 'prevista'])
    const r = await source.lancarDescontoFolha([parcelas[1].id, parcelas[2].id], 'lancar')
    expect(r.encerradas).toEqual(['u11'])
    const desfeito = await source.lancarDescontoFolha([parcelas[2].id], 'desfazer')
    expect(desfeito.reabertas).toEqual(['u11'])
  })
})
