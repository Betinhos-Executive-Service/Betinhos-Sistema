import { describe, expect, it, vi } from 'vitest'
import type { DataverseClient, Row } from '@betinhos/dataverse'
import { carregarDataverse, carregarExtraDataverse, createSource, resolverEntitySets, type Source } from './source'
import { filtrarServicos } from '../domain/base'
import { calcularResumo } from '../domain/resumo'
import { linhasScore } from '../domain/score'
import {
  ENTITIES, anexosDespesaPath, baselinesPath, categoriasDespesaPath, despesasPath, eventosPath, formasPagamentoPath, funcionariosPath, manutencoesPath, ocorrenciasPath, mapCategoriaDespesa, mapCps,
  mapDespesa, mapEvento, mapFormaPagamento, mapFuncionario, mapManutencao, mapMulta, mapPagante, mapReserva, mapTelemetria, mapVeiculo, mapViagem, multasPath,
  itensPlanoPath, manutencoesPreventivaPath, pagantesPath, reservasPath, telemetriaPath, veiculosPath, viagensPath,
} from './queries'

const F = '@OData.Community.Display.V1.FormattedValue'
const SETS = {
  reserva: 'res', composicao: 'cps', manutencao: 'man', multa: 'mul', ocorrencia: 'oco', funcionario: 'fun', veiculo: 'vei', telemetria: 'tel', evento: 'eve', viagem: 'via',
  pagante: 'pag', despesa: 'des', categoriaDespesa: 'cat', formaPagamentoDespesa: 'frm', anexoDespesa: 'anx', itemPlano: 'itp', baseline: 'bas',
}
const client = (getAll: (path: string) => Promise<Row[]>) => ({ apiUrl: '', request: vi.fn(), getAll: vi.fn(getAll), create: vi.fn(), update: vi.fn(), remove: vi.fn() }) as unknown as DataverseClient
/** Os dois estágios juntos, mesclados como o `useDashboard` faz quando as duas abas do estágio 2 já abriram. */
async function carregarTudo(c: DataverseClient, sets: typeof SETS, desde: string, ate: string) {
  const [d, pag, des] = await Promise.all([carregarDataverse(c, sets, desde, ate), carregarExtraDataverse(c, sets, 'pagantes', desde, ate), carregarExtraDataverse(c, sets, 'despesas', desde, ate)])
  const falhas = (['pagantes', 'despesas'] as const).filter((_, i) => [pag, des][i].indisponivel)
  return { ...d, ...pag.campos, ...des.campos, indisponiveis: [...d.indisponiveis, ...falhas], pendentes: [] }
}
async function mockTudo(s: Source, desde: string, ate: string) {
  const [d, pag, des] = await Promise.all([s.carregar(desde, ate), s.carregarExtra('pagantes', desde, ate), s.carregarExtra('despesas', desde, ate)])
  return { ...d, ...pag.campos, ...des.campos }
}

describe('consultas do Dashboard', () => {
  it('janela de reservas em Brasília com fim inclusivo', () => {
    const p = reservasPath('res', '2024-01-01', '2026-10-15')
    expect(p).toContain('$expand=cr40f_Motorista($select=cr40f_funcionariosid,cr40f_nomecompleto,new_apelido),cr40f_Cliente($select=cr40f_nomedocliente)')
    expect(decodeURIComponent(p)).toContain('cr40f_dataehorriodesada ge 2024-01-01T03:00:00.000Z and cr40f_dataehorriodesada lt 2026-10-16T03:00:00.000Z')
  })

  it('tabelas do Infleet: janela de datas e colunas mínimas', () => {
    expect(ENTITIES).toMatchObject({ telemetria: 'new_telemetriadiariainfleet', evento: 'new_eventoinfleet', viagem: 'new_viageminfleet' })
    const tel = telemetriaPath('tel', '2024-01-01', '2026-10-15')
    expect(tel).toContain('tel?$select=new_data,_new_veiculo_value,new_tempomotorociosomin,new_distanciapercorridakm,new_velocidademedia,new_velocidademaxima,new_excessosdevelocidade,new_autonomiakml,new_tempoacimavelocidademin&$filter=')
    expect(decodeURIComponent(tel)).toContain('new_data ge 2024-01-01 and new_data le 2026-10-15')
    const via = viagensPath('via', '2024-01-01', '2026-10-15')
    expect(via).toContain('via?$select=new_iniciadoem,_new_veiculo_value,_new_motorista_value,new_distanciakm,new_velocidademedia,new_velocidademaxima,new_combustivelconsumidolitros,new_custocombustivelconsumido&$filter=')
    expect(decodeURIComponent(via)).toContain('new_iniciadoem ge 2024-01-01T03:00:00.000Z and new_iniciadoem lt 2026-10-16T03:00:00.000Z')
    const eve = eventosPath('eve', '2024-01-01', '2026-10-15')
    expect(eve).toContain('eve?$select=new_reportadoem,_new_motorista_value,new_slug,_new_veiculo_value,new_descricao,new_velocidaderegistrada,new_limitedevelocidade&$filter=')
    expect(decodeURIComponent(eve)).toContain('new_reportadoem ge 2024-01-01T03:00:00.000Z and new_reportadoem lt 2026-10-16T03:00:00.000Z')
  })

  it('mapeia viagem, evento e telemetria do Infleet (mês = texto bruto, dia = Brasília)', () => {
    // 01/11 01:00Z é 31/10 22:00 em Brasília: `dia` fica em outubro, `mes` (slice do texto bruto, como o legado) em novembro.
    expect(mapViagem({ new_iniciadoem: '2026-11-01T01:00:00Z', _new_veiculo_value: 'V1', _new_motorista_value: 'M1', new_distanciakm: 12.5 }))
      .toEqual({ dia: '2026-10-31', mes: '2026-11', veiculoId: 'v1', motoristaId: 'm1', distancia: 12.5, velocidadeMedia: 0, velocidadeMaxima: 0, combustivelL: 0, custoCombustivel: 0 })
    expect(mapViagem({ new_iniciadoem: '2026-10-02T12:00:00Z', _new_veiculo_value: 'V1', _new_motorista_value: null, new_distanciakm: null }))
      .toEqual({ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', motoristaId: '', distancia: 0, velocidadeMedia: 0, velocidadeMaxima: 0, combustivelL: 0, custoCombustivel: 0 })
    expect(mapViagem({})).toEqual({ dia: '', mes: '', veiculoId: '', motoristaId: '', distancia: 0, velocidadeMedia: 0, velocidadeMaxima: 0, combustivelL: 0, custoCombustivel: 0 })
    expect(mapEvento({ new_reportadoem: '2026-10-02T20:13:39Z', _new_motorista_value: 'M1', new_slug: 'hardBraking' }))
      .toEqual({ dia: '2026-10-02', mes: '2026-10', motoristaId: 'm1', tipo: 'hardBraking', veiculoId: '', descricao: '', velocidade: 0, limite: 0 })
    expect(mapEvento({})).toEqual({ dia: '', mes: '', motoristaId: '', tipo: '', veiculoId: '', descricao: '', velocidade: 0, limite: 0 })
    expect(mapTelemetria({ new_data: '2026-08-02', _new_veiculo_value: 'V1', new_tempomotorociosomin: 14 }))
      .toEqual({ dia: '2026-08-02', mes: '2026-08', veiculoId: 'v1', ociosoMin: 14, distanciaKm: 0, velocidadeMedia: 0, velocidadeMaxima: 0, excessos: 0, autonomia: 0, tempoAcimaMin: 0 })
    expect(mapTelemetria({ new_data: '2026-08-02', _new_veiculo_value: 'V1', new_tempomotorociosomin: null }).ociosoMin).toBe(0)
  })

  it('mapeia reserva com CP, apelido, cliente e rótulos', () => {
    const cps = mapCps([{ cr40f_composicaodeprecosid: 'CP1', new_valortotal: 850.5, new_status: 100000001 }])
    const r = mapReserva({
      cr40f_reservadeveculosid: 'R1', cr40f_dataehorriodesada: '2026-10-02T12:00:00Z', createdon: '2026-10-01T10:00:00Z',
      cr40f_status: 202410008, [`cr40f_status${F}`]: 'Concluído', cr40f_statusdefaturamento: 202410010, [`cr40f_statusdefaturamento${F}`]: 'Pago',
      new_categoriadoitem: 100000000, [`new_categoriadoitem${F}`]: 'Serviço', cr40f_tipodeveiculo: 3, [`cr40f_tipodeveiculo${F}`]: 'Executivo',
      _cr40f_veiculo_value: 'V1', _new_composicaodepreco_value: 'cp1', [`_new_composicaodepreco_value${F}`]: 'CP-0042', _cr40f_financeiro_value: 'OP1', [`_cr40f_financeiro_value${F}`]: 'OP-0042',
      cr40f_Motorista: { cr40f_funcionariosid: 'M1', cr40f_nomecompleto: 'Carlos Oliveira', new_apelido: 'Oliveira' },
      cr40f_Cliente: { cr40f_nomedocliente: 'Tenaris' },
    }, cps)
    expect(r).toMatchObject({ id: 'r1', dia: '2026-10-02', mes: '2026-10', statusLabel: 'Concluído', fatStatus: 202410010, tipoVeiculo: 'Executivo', tipoVeiculoRaw: '3', veiculoId: 'v1', motoristaId: 'm1', motoristaKey: 'm1', motorista: 'Oliveira', cliente: 'Tenaris', valor: 850.5, cpConcluida: true, opId: 'op1', cpCodigo: 'CP-0042', opCodigo: 'OP-0042' })
    // Sem id do funcionário, a chave é o nome sem acento e sem caixa (`normL`), como nas despesas e no CSV 2026.
    expect(mapReserva({ cr40f_reservadeveculosid: 'R3', cr40f_Motorista: { cr40f_nomecompleto: 'João Ávila' } }, cps)).toMatchObject({ motoristaId: '', motoristaKey: 'nome:joao avila' })
    expect(mapReserva({ cr40f_reservadeveculosid: 'R2' }, cps)).toMatchObject({ motorista: 'Sem motorista', motoristaKey: 'nome:sem motorista', cliente: 'Sem cliente', valor: 0, dia: '', statusLabel: 'Sem status' })
  })

  it('reservas e CPs obrigatórias; secundário que falha vira indisponível; CSV entra', async () => {
    const c = client(async (path) => {
      if (path.startsWith('res?')) return [{ cr40f_reservadeveculosid: 'R1', cr40f_dataehorriodesada: '2026-10-02T12:00:00Z', new_categoriadoitem: 100000000 }]
      if (path.startsWith('mul?')) throw new Error('sem permissão')
      return []
    })
    const d = await carregarDataverse(c, SETS, '2024-01-01', '2026-10-15')
    expect(d.indisponiveis).toEqual(['multas'])
    expect(d.reservas.some((r) => r.id === 'r1')).toBe(true)
    expect(d.reservas.some((r) => r.id.startsWith('legacy-2026-'))).toBe(true)
    await expect(carregarDataverse(client(async (p) => { if (p.startsWith('cps?')) throw new Error('falhou'); return [] }), SETS, '2024-01-01', '2026-10-15')).rejects.toThrow('falhou')
  })

  it('com a navegação da CP, a composição vem no $expand das reservas e a tabela de CPs não é lida', async () => {
    const lidos: string[] = []
    const c = client(async (path) => {
      lidos.push(path)
      if (path.startsWith('res?')) return [{ cr40f_reservadeveculosid: 'R1', cr40f_dataehorriodesada: '2026-10-02T12:00:00Z', new_categoriadoitem: 100000000, _new_composicaodepreco_value: 'CP1', nav_cp: { cr40f_composicaodeprecosid: 'CP1', new_valortotal: 250, new_status: null } }]
      return []
    })
    const d = await carregarDataverse(c, SETS, '2024-01-01', '2026-10-15', 'nav_cp')
    expect(lidos.some((p) => p.startsWith('cps?'))).toBe(false)
    expect(lidos.find((p) => p.startsWith('res?'))).toContain('nav_cp($select=')
    expect(d.reservas.find((r) => r.id === 'r1')?.valor).toBe(250)
  })

  it('carrega as três tabelas do Infleet; uma que falha vira indisponível só para ela', async () => {
    const c = client(async (path) => {
      if (path.startsWith('via?')) return [{ new_iniciadoem: '2026-10-02T12:00:00Z', _new_veiculo_value: 'V1', _new_motorista_value: 'M1', new_distanciakm: 120 }]
      if (path.startsWith('eve?')) return [{ new_reportadoem: '2026-10-02T13:00:00Z', _new_motorista_value: 'M1', new_slug: 'hardBraking' }]
      if (path.startsWith('tel?')) return [{ new_data: '2026-10-02', _new_veiculo_value: 'V1', new_tempomotorociosomin: 3 }]
      return []
    })
    const ok = await carregarDataverse(c, SETS, '2024-01-01', '2026-10-15')
    expect(ok.indisponiveis).toEqual([])
    expect(ok.viagens).toEqual([{ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', motoristaId: 'm1', distancia: 120, velocidadeMedia: 0, velocidadeMaxima: 0, combustivelL: 0, custoCombustivel: 0 }])
    expect(ok.eventos).toEqual([{ dia: '2026-10-02', mes: '2026-10', motoristaId: 'm1', tipo: 'hardBraking', veiculoId: '', descricao: '', velocidade: 0, limite: 0 }])
    expect(ok.telemetria).toEqual([{ dia: '2026-10-02', mes: '2026-10', veiculoId: 'v1', ociosoMin: 3, distanciaKm: 0, velocidadeMedia: 0, velocidadeMaxima: 0, excessos: 0, autonomia: 0, tempoAcimaMin: 0 }])

    const semViagens = await carregarDataverse(client(async (path) => {
      if (path.startsWith('via?')) throw new Error('sem permissão')
      if (path.startsWith('eve?')) return [{ new_reportadoem: '2026-10-02T13:00:00Z', _new_motorista_value: 'M1', new_slug: 'hardBraking' }]
      return []
    }), SETS, '2024-01-01', '2026-10-15')
    expect(semViagens.indisponiveis).toEqual(['viagens'])
    expect(semViagens.viagens).toEqual([])
    expect(semViagens.eventos).toHaveLength(1)
    const dois = await carregarDataverse(client(async (path) => { if (path.startsWith('eve?') || path.startsWith('tel?')) throw new Error('x'); return [] }), SETS, '2024-01-01', '2026-10-15')
    expect(dois.indisponiveis).toEqual(['eventos', 'telemetria'])
  })

  it('mock devolve dados dentro da janela e marca mock', async () => {
    const s = createSource({ mode: 'mock' })
    expect(s.mock).toBe(true)
    const d = await s.carregar('2026-09-01', '2026-09-30')
    const doDataverse = d.reservas.filter((r) => !r.id.startsWith('legacy-'))
    expect(doDataverse.length).toBeGreaterThan(0)
    expect(doDataverse.every((r) => r.dia >= '2026-09-01' && r.dia <= '2026-09-30')).toBe(true)
  })

  it('mock do Infleet: fica na janela pedida e é determinístico', async () => {
    const s = createSource({ mode: 'mock' })
    const hoje = new Date().toISOString().slice(0, 10)
    const d = await s.carregar('2026-09-01', hoje)
    expect(d.viagens.length).toBeGreaterThan(0)
    expect(d.eventos.length).toBeGreaterThan(0)
    expect(d.telemetria.length).toBeGreaterThan(0)
    for (const x of [...d.viagens, ...d.eventos, ...d.telemetria]) expect(x.dia >= '2026-09-01' && x.dia <= hoje).toBe(true)
    const outra = await createSource({ mode: 'mock' }).carregar('2026-09-01', hoje)
    expect({ v: outra.viagens, e: outra.eventos, t: outra.telemetria }).toEqual({ v: d.viagens, e: d.eventos, t: d.telemetria })
  })

  it('mock do Infleet: notas válidas em faixas diferentes e meses com veículo compartilhado sem nota', async () => {
    const hoje = new Date()
    const d = await createSource({ mode: 'mock' }).carregar('2025-01-01', '2099-12-31')
    const linhas = linhasScore(d.viagens, d.eventos, d.telemetria, '2025-01-01', '2099-12-31')
    const validas = linhas.filter((l) => l.suficiente)
    expect(validas.length).toBeGreaterThanOrEqual(30)
    expect(validas.some((l) => (l.nota ?? 100) < 60)).toBe(true)
    expect(validas.some((l) => (l.nota ?? 0) >= 80)).toBe(true)
    expect(linhas.some((l) => !l.suficiente && l.distancia >= 100)).toBe(true)
    // Mês anterior fechado: vários motoristas com nota e o alerta mostra a média.
    const anterior = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1)).toISOString().slice(0, 7)
    expect(validas.filter((l) => l.mes === anterior).length).toBeGreaterThanOrEqual(3)
    const f = { atalho: 'personalizado' as const, inicio: `${anterior}-01`, fim: `${anterior}-28`, status: [], clientes: [], motoristas: [], tipos: [] }
    const score = calcularResumo({ todas: d.reservas, rv: filtrarServicos(d.reservas, f), f, now: hoje }, d).operacao.find((a) => a.id === 'score')
    expect(score?.valor).not.toBe('—')
    expect(score?.tom).not.toBe('neutral')
  })
})

describe('conjuntos das abas', () => {
  const J = (campo: string) => `${campo} ge 2024-01-01T03:00:00.000Z and ${campo} lt 2026-10-16T03:00:00.000Z`

  it('entidades novas e colunas extras dos cadastros', () => {
    expect(ENTITIES).toMatchObject({
      pagante: 'cr40f_pagantes', despesa: 'cr40f_despesaoperacional', categoriaDespesa: 'cr40f_categoriadespesaoperacional',
      formaPagamentoDespesa: 'cr40f_formapagamentodespesa', anexoDespesa: 'cr40f_anexodespesaoperacional',
    })
    expect(reservasPath('res', '2024-01-01', '2026-10-15')).toContain('cr40f_tipodoservico,')
    expect(reservasPath('res', '2024-01-01', '2026-10-15')).toContain(',new_datadefinalizacao')
    expect(veiculosPath('vei')).toBe('vei?$select=cr40f_veiculosid,cr40f_statusdoveiculo,new_categoriadoveiculo,cr40f_placa,cr40f_marca,cr40f_modelo,cr40f_blindado,cr40f_anodefabricacao,cr40f_hodometro,cr40f_hodometroem')
    expect(funcionariosPath('fun')).toBe('fun?$select=cr40f_funcionariosid,cr40f_nomecompleto,cr40f_status,cr40f_validadedacnh,cr40f_funcao,new_apelido,cr40f_nomedaempresa')
    expect(decodeURIComponent(manutencoesPath('man', '2024-01-01', '2026-10-15'))).toBe(`man?$select=cr40f_datamanutencao,cr40f_valor,cr40f_datadaaprovacao,cr40f_status,cr40f_tipodoreparo,_cr40f_placa_carro_value,createdon&$filter=${J('cr40f_datamanutencao')}`)
  })

  it('manutenções, multas e ocorrências pela janela das reservas (colunas DateTime, fim inclusivo em Brasília)', () => {
    expect(decodeURIComponent(ocorrenciasPath('oco', '2024-01-01', '2026-10-15'))).toBe(`oco?$select=cr40f_dataocorrencia&$filter=${J('cr40f_dataocorrencia')}`)
    expect(decodeURIComponent(multasPath('mul', '2024-01-01', '2026-10-15'))).toContain(`&$filter=${J('cr40f_dataehorario')}`)
    expect(decodeURIComponent(reservasPath('res', '2024-01-01', '2026-10-15'))).toContain(J('cr40f_dataehorriodesada'))
  })

  it('multas com $expand da infração e versão sem expand (fallback)', () => {
    expect(decodeURIComponent(multasPath('mul', '2024-01-01', '2026-10-15'))).toBe(`mul?$select=cr40f_multasid,cr40f_dataehorario,cr40f_status,_cr40f_codigodainfracao_value,_cr40f_motorista_value,_cr40f_placa_value&$expand=cr40f_Codigodainfracao($select=cr40f_codigodainfracao,cr40f_descricaodainfracao)&$filter=${J('cr40f_dataehorario')}`)
    expect(decodeURIComponent(multasPath('mul', '2024-01-01', '2026-10-15', false))).toBe(`mul?$select=cr40f_multasid,cr40f_dataehorario,cr40f_status,_cr40f_codigodainfracao_value,_cr40f_motorista_value,_cr40f_placa_value&$filter=${J('cr40f_dataehorario')}`)
  })

  it('pagantes inteiros, sem filtro (como o legado); despesas pela janela; cadastros de despesa inteiros e ativos', () => {
    // Pagantes: todos, sem $filter (o legado não filtra; atrasados e CP mais antiga dependem dos pendentes antigos).
    expect(pagantesPath('pag')).toBe('pag?$select=cr40f_pagantesid,createdon,_cr40f_financeiro_value,cr40f_status,cr40f_valor,cr40f_formadepagamento,_cr40f_bancodedados_value,cr40f_datadoprimeiropagamento')
    expect(pagantesPath('pag', false)).toBe('pag?$select=cr40f_pagantesid,createdon,_cr40f_financeiro_value,cr40f_status,cr40f_valor,cr40f_formadepagamento,_cr40f_bancodedados_value')
    const des = despesasPath('des', '2024-01-01', '2026-10-15')
    expect(des).toContain('des?$select=cr40f_despesaoperacionalid,cr40f_nome,cr40f_datagasto,cr40f_valor,_cr40f_categoria_value,_cr40f_formapagamento_value,_cr40f_motorista_value,_cr40f_reserva_value,cr40f_statusfinanceiro,cr40f_statusanexo&$filter=')
    expect(decodeURIComponent(des)).toContain(`statecode eq 0 and ${J('cr40f_datagasto')}`)
    expect(decodeURIComponent(categoriasDespesaPath('cat'))).toBe('cat?$select=cr40f_categoriadespesaoperacionalid,cr40f_nome,cr40f_grupodre&$filter=statecode eq 0 and cr40f_ativa eq true&$orderby=cr40f_ordem asc')
    expect(decodeURIComponent(formasPagamentoPath('frm'))).toBe('frm?$select=cr40f_formapagamentodespesaid,cr40f_nome&$filter=statecode eq 0 and cr40f_ativa eq true&$orderby=cr40f_ordem asc')
    expect(decodeURIComponent(anexosDespesaPath('anx'))).toBe('anx?$select=_cr40f_despesa_value&$filter=statecode eq 0')
  })

  it('reserva: tipo do serviço formatado e data de finalização', () => {
    const r = mapReserva({ cr40f_reservadeveculosid: 'R1', cr40f_tipodoservico: 202410001, [`cr40f_tipodoservico${F}`]: 'São Paulo', new_datadefinalizacao: '2026-10-02T18:00:00Z' }, new Map())
    expect(r).toMatchObject({ tipoServico: 'São Paulo', finalizadoRaw: '2026-10-02T18:00:00Z' })
    expect(mapReserva({ cr40f_reservadeveculosid: 'R2' }, new Map())).toMatchObject({ tipoServico: '—', finalizadoRaw: '' })
  })

  it('veículo com placa, marca, modelo, blindado e ano', () => {
    expect(mapVeiculo({
      cr40f_veiculosid: 'V1', cr40f_statusdoveiculo: 202410001, [`cr40f_statusdoveiculo${F}`]: 'Ativo', new_categoriadoveiculo: 100000000, [`new_categoriadoveiculo${F}`]: 'Próprio',
      cr40f_placa: 'ABC1D23', cr40f_marca: 'Toyota', cr40f_modelo: 'Corolla', cr40f_blindado: true, [`cr40f_blindado${F}`]: 'Sim', cr40f_anodefabricacao: 2023, [`cr40f_anodefabricacao${F}`]: '2.023',
    })).toEqual({ id: 'v1', statusLabel: 'Ativo', categoria: 'Propria', placa: 'ABC1D23', marca: 'Toyota', modelo: 'Corolla', blindado: true, ano: 2023 })
    expect(mapVeiculo({ cr40f_veiculosid: 'V2', cr40f_blindado: 1, cr40f_anodefabricacao: '2019' })).toMatchObject({ blindado: true, ano: 2019, placa: '', marca: '', modelo: '' })
    expect(mapVeiculo({ cr40f_veiculosid: 'V3', cr40f_blindado: 'true' }).blindado).toBe(true)
    expect(mapVeiculo({ cr40f_veiculosid: 'V4', cr40f_blindado: false, cr40f_anodefabricacao: null })).toMatchObject({ blindado: false, ano: null })
  })

  it('categoria do veículo: Própria, Terceirizada, Aluguel (código 100000002 ou rótulo) e vazia', () => {
    const cat = (raw: unknown, rotulo?: string) => mapVeiculo({ cr40f_veiculosid: 'V', new_categoriadoveiculo: raw, ...(rotulo ? { [`new_categoriadoveiculo${F}`]: rotulo } : {}) }).categoria
    expect(cat(100000000, 'Próprio')).toBe('Propria')
    expect(cat(100000001, 'Terceiro')).toBe('Terceirizada')
    expect(cat(100000002, 'Aluguel')).toBe('Aluguel')
    expect(cat(100000002)).toBe('Aluguel')
    expect(cat(7, 'Veículo de aluguel')).toBe('Aluguel')
    expect(cat(null)).toBe('')
  })

  it('funcionário com id, nome, apelido, função e empresa formatadas', () => {
    expect(mapFuncionario({
      cr40f_funcionariosid: 'F1', cr40f_nomecompleto: 'Carlos Oliveira', new_apelido: 'Oliveira', cr40f_status: 0, [`cr40f_status${F}`]: 'Ativo', cr40f_validadedacnh: '2027-01-10',
      cr40f_funcao: 202410000, [`cr40f_funcao${F}`]: 'Motorista', cr40f_nomedaempresa: 202410001, [`cr40f_nomedaempresa${F}`]: 'DEPAULA L AUTO LTDA EPP',
    })).toEqual({ id: 'f1', nome: 'Carlos Oliveira', apelido: 'Oliveira', statusLabel: 'Ativo', cnhMs: Date.parse('2027-01-10'), funcao: 'Motorista', empresa: 'DEPAULA L AUTO LTDA EPP' })
    expect(mapFuncionario({})).toMatchObject({ id: '', nome: '', apelido: '', funcao: '—', empresa: '' })
  })

  it('manutenção com aprovação, status, tipo do reparo e veículo', () => {
    expect(mapManutencao({
      cr40f_datamanutencao: '2026-10-02T12:00:00Z', cr40f_valor: 450, cr40f_datadaaprovacao: '2026-09-28T13:00:00Z', cr40f_status: 202410002, [`cr40f_status${F}`]: 'Realizado',
      cr40f_tipodoreparo: 1, [`cr40f_tipodoreparo${F}`]: 'Preventiva sistemática', _cr40f_placa_carro_value: 'V1', createdon: '2026-09-27T01:00:00Z',
    })).toEqual({
      dia: '2026-10-02', valor: 450, aprovacaoDia: '2026-09-28', statusLabel: 'Realizado', tipoReparo: 'Preventiva sistemática', veiculoId: 'v1', criadoDia: '2026-09-26',
      dataMs: Date.parse('2026-10-02T12:00:00Z'), criadoMs: Date.parse('2026-09-27T01:00:00Z'),
    })
    expect(mapManutencao({})).toEqual({ dia: '', valor: 0, aprovacaoDia: '', statusLabel: '', tipoReparo: '—', veiculoId: '', criadoDia: '', dataMs: NaN, criadoMs: NaN })
  })

  it('multa: infração pelo $expand, motorista pelo apelido do funcionário, fallback no rótulo do lookup', () => {
    const apelidos = new Map([['m1', 'Oliveira']])
    expect(mapMulta({
      cr40f_multasid: 'MU1', cr40f_dataehorario: '2026-10-02T12:00:00Z', cr40f_status: 202410000, [`cr40f_status${F}`]: 'Notificar o Condutor',
      _cr40f_motorista_value: 'M1', [`_cr40f_motorista_value${F}`]: 'Carlos Oliveira', _cr40f_placa_value: 'V1', [`_cr40f_placa_value${F}`]: 'ABC1D23',
      _cr40f_codigodainfracao_value: 'I1', [`_cr40f_codigodainfracao_value${F}`]: '745-50',
      cr40f_Codigodainfracao: { cr40f_codigodainfracao: ' 745-50 ', cr40f_descricaodainfracao: ' Transitar em velocidade superior ' },
    }, apelidos)).toEqual({
      id: 'mu1', dia: '2026-10-02', status: 202410000, statusLabel: 'Notificar o Condutor', motoristaId: 'm1', motorista: 'Oliveira', veiculoId: 'v1',
      infracaoCodigo: '745-50', infracaoDescricao: 'Transitar em velocidade superior',
    })
    expect(mapMulta({ _cr40f_motorista_value: 'M9', [`_cr40f_motorista_value${F}`]: 'Fulano', _cr40f_codigodainfracao_value: 'I2', [`_cr40f_codigodainfracao_value${F}`]: '501-00' }))
      .toMatchObject({ motorista: 'Fulano', infracaoCodigo: '501-00', infracaoDescricao: '' })
    expect(mapMulta({})).toEqual({ id: '', dia: '', status: null, statusLabel: '', motoristaId: '', motorista: '—', veiculoId: '', infracaoCodigo: '', infracaoDescricao: '' })
  })

  it('Infleet: campos de km, velocidades, excessos, consumo e eventos', () => {
    expect(mapTelemetria({
      new_data: '2026-08-02', _new_veiculo_value: 'V1', new_tempomotorociosomin: 14, new_distanciapercorridakm: 210.5, new_velocidademedia: 54.2, new_velocidademaxima: 118,
      new_excessosdevelocidade: 3, new_autonomiakml: 11.4, new_tempoacimavelocidademin: 6,
    })).toEqual({ dia: '2026-08-02', mes: '2026-08', veiculoId: 'v1', ociosoMin: 14, distanciaKm: 210.5, velocidadeMedia: 54.2, velocidadeMaxima: 118, excessos: 3, autonomia: 11.4, tempoAcimaMin: 6 })
    expect(mapViagem({
      new_iniciadoem: '2026-10-02T12:00:00Z', _new_veiculo_value: 'V1', _new_motorista_value: 'M1', new_distanciakm: 80, new_velocidademedia: 61, new_velocidademaxima: 104,
      new_combustivelconsumidolitros: 7.5, new_custocombustivelconsumido: 45.3,
    })).toMatchObject({ velocidadeMedia: 61, velocidadeMaxima: 104, combustivelL: 7.5, custoCombustivel: 45.3 })
    expect(mapEvento({
      new_reportadoem: '2026-10-02T20:13:39Z', _new_motorista_value: 'M1', _new_veiculo_value: 'V1', new_slug: 'routeOverspeed', new_descricao: 'Excesso de velocidade',
      new_velocidaderegistrada: 98, new_limitedevelocidade: 80,
    })).toEqual({ dia: '2026-10-02', mes: '2026-10', motoristaId: 'm1', tipo: 'routeOverspeed', veiculoId: 'v1', descricao: 'Excesso de velocidade', velocidade: 98, limite: 80 })
  })

  it('pagante com forma e status formatados', () => {
    expect(mapPagante({
      cr40f_pagantesid: 'P1', createdon: '2026-10-02T01:30:00Z', _cr40f_financeiro_value: 'OP1', cr40f_status: 202410002, [`cr40f_status${F}`]: 'Pago',
      cr40f_valor: 850.5, cr40f_formadepagamento: 202410000, [`cr40f_formadepagamento${F}`]: 'Cartão de crédito',
      _cr40f_bancodedados_value: 'PE1', [`_cr40f_bancodedados_value${F}`]: 'Ana Souza', cr40f_datadoprimeiropagamento: '2026-10-03T15:00:00Z',
    })).toEqual({
      id: 'p1', opId: 'op1', pessoaId: 'pe1', pessoa: 'Ana Souza', valor: 850.5, forma: 202410000, formaLabel: 'Cartão de crédito', status: 202410002, statusLabel: 'Pago',
      criadoRaw: '2026-10-02T01:30:00Z', criadoDia: '2026-10-01', primeiroPagamentoRaw: '2026-10-03T15:00:00Z',
    })
    expect(mapPagante({ _cr40f_bancodedados_value: 'PE2' })).toEqual({
      id: '', opId: '', pessoaId: 'pe2', pessoa: '', valor: 0, forma: null, formaLabel: '—', status: null, statusLabel: '—', criadoRaw: '', criadoDia: '', primeiroPagamentoRaw: '',
    })
  })

  it('categoria e forma de pagamento da despesa', () => {
    expect(mapCategoriaDespesa({ cr40f_categoriadespesaoperacionalid: 'C1', cr40f_nome: 'Hospedagem', cr40f_grupodre: 'Custos operacionais' })).toEqual({ id: 'c1', nome: 'Hospedagem', grupoDre: 'Custos operacionais' })
    expect(mapCategoriaDespesa({ cr40f_categoriadespesaoperacionalid: 'C2' })).toEqual({ id: 'c2', nome: 'Sem categoria', grupoDre: 'Sem grupo DRE' })
    expect(mapFormaPagamento({ cr40f_formapagamentodespesaid: 'FP1', cr40f_nome: 'Pix' })).toEqual({ id: 'fp1', nome: 'Pix' })
    expect(mapFormaPagamento({ cr40f_formapagamentodespesaid: 'FP2' })).toEqual({ id: 'fp2', nome: 'Sem forma de pagamento' })
  })

  it('despesa: cadastros, funcionário (nome completo e empresa normalizada) e anexos', () => {
    const ctx = {
      categorias: new Map([['c1', { id: 'c1', nome: 'Hospedagem', grupoDre: 'Viagem' }]]),
      formas: new Map([['fp1', { id: 'fp1', nome: 'Pix' }]]),
      funcionarios: new Map([['m1', { id: 'm1', nome: 'Carlos Oliveira', apelido: 'Oliveira', statusLabel: 'Ativo', cnhMs: NaN, funcao: 'Motorista', empresa: 'BETINHOS L AUTO LTDA EPP' }]]),
      anexos: new Map([['d1', 2]]),
    }
    expect(mapDespesa({
      cr40f_despesaoperacionalid: 'D1', cr40f_nome: 'Hotel Ibis', cr40f_datagasto: '2026-10-02T01:00:00Z', cr40f_valor: 180,
      _cr40f_categoria_value: 'C1', _cr40f_formapagamento_value: 'FP1', _cr40f_motorista_value: 'M1', _cr40f_reserva_value: 'R1',
      cr40f_statusfinanceiro: 100000001, [`cr40f_statusfinanceiro${F}`]: 'Aguardando pagamento', cr40f_statusanexo: 100000002,
    }, ctx)).toEqual({
      // `dia` é o texto bruto slice(0, 10), como o `dateKey` do legado (01:00Z seria 01/10 em Brasília).
      id: 'd1', dia: '2026-10-02', mes: '2026-10', valor: 180, categoriaId: 'c1', categoria: 'Hospedagem', formaId: 'fp1', forma: 'Pix', empresa: 'BETINHOS',
      motoristaId: 'm1', motorista: 'Carlos Oliveira', reservaId: 'r1', statusFinanceiro: 100000001, statusAnexo: 100000002, anexos: 2, descricao: 'Hotel Ibis',
    })
    const vazio = { categorias: new Map(), formas: new Map(), funcionarios: new Map(), anexos: new Map() }
    expect(mapDespesa({
      cr40f_despesaoperacionalid: 'D2', _cr40f_categoria_value: 'C9', [`_cr40f_categoria_value${F}`]: 'Pedágio', _cr40f_formapagamento_value: 'FP9', [`_cr40f_formapagamento_value${F}`]: 'Dinheiro',
      _cr40f_motorista_value: 'M9', [`_cr40f_motorista_value${F}`]: 'Fulano de Tal',
    }, vazio)).toMatchObject({ categoria: 'Pedágio', forma: 'Dinheiro', motorista: 'Fulano de Tal', empresa: 'Sem empresa', anexos: 0, statusAnexo: null })
    expect(mapDespesa({}, vazio)).toEqual({
      id: '', dia: '', mes: '', valor: 0, categoriaId: '', categoria: 'Sem categoria', formaId: '', forma: 'Sem forma de pagamento', empresa: 'Sem empresa',
      motoristaId: '', motorista: 'Sem motorista', reservaId: '', statusFinanceiro: null, statusAnexo: null, anexos: 0, descricao: 'Despesa sem título',
    })
    // Virada do mês: 23h de 30/09 em Brasília. O dia (filtro de período) é o texto bruto; o mês (séries) é o de Brasília (`mK`).
    expect(mapDespesa({ cr40f_datagasto: '2026-10-01T02:00:00Z' }, vazio)).toMatchObject({ dia: '2026-10-01', mes: '2026-09' })
    expect(mapDespesa({ cr40f_datagasto: '2026-10-01' }, vazio)).toMatchObject({ dia: '2026-10-01', mes: '2026-10' })
    const dePaula = { ...vazio, funcionarios: new Map([['m2', { id: 'm2', nome: '', apelido: 'Zé', statusLabel: 'Ativo', cnhMs: NaN, funcao: 'Motorista', empresa: 'DEPAULA L AUTO LTDA EPP' }]]) }
    expect(mapDespesa({ _cr40f_motorista_value: 'M2' }, dePaula)).toMatchObject({ motorista: 'Zé', empresa: 'DEPAULA' })
  })

  it('carrega pagantes e despesas; pagantes que falham viram indisponíveis só para eles', async () => {
    const linhas = (path: string): Row[] => {
      if (path.startsWith('pag?')) return [{ cr40f_pagantesid: 'P1', _cr40f_financeiro_value: 'OP1', cr40f_valor: 100, cr40f_status: 202410002 }]
      if (path.startsWith('des?')) return [{ cr40f_despesaoperacionalid: 'D1', cr40f_valor: 50, _cr40f_categoria_value: 'C1', _cr40f_formapagamento_value: 'FP1', _cr40f_motorista_value: 'M1' }]
      if (path.startsWith('cat?')) return [{ cr40f_categoriadespesaoperacionalid: 'C1', cr40f_nome: 'Alimentação', cr40f_grupodre: 'Custos' }]
      if (path.startsWith('frm?')) return [{ cr40f_formapagamentodespesaid: 'FP1', cr40f_nome: 'Pix' }]
      if (path.startsWith('anx?')) return [{ _cr40f_despesa_value: 'D1' }, { _cr40f_despesa_value: 'D1' }, { _cr40f_despesa_value: null }]
      if (path.startsWith('fun?')) return [{ cr40f_funcionariosid: 'M1', cr40f_nomecompleto: 'Carlos Oliveira', new_apelido: 'Oliveira', [`cr40f_nomedaempresa${F}`]: 'Betinhos L Auto' }]
      if (path.startsWith('mul?')) return [{ _cr40f_motorista_value: 'M1', cr40f_Codigodainfracao: { cr40f_codigodainfracao: '745-50', cr40f_descricaodainfracao: 'Velocidade' } }]
      return []
    }
    const ok = await carregarTudo(client(async (path) => linhas(path)), SETS, '2024-01-01', '2026-10-15')
    expect(ok.indisponiveis).toEqual([])
    expect(ok.pagantes).toMatchObject([{ id: 'p1', opId: 'op1', valor: 100, status: 202410002 }])
    expect(ok.categoriasDespesa).toEqual([{ id: 'c1', nome: 'Alimentação', grupoDre: 'Custos' }])
    expect(ok.formasPagamento).toEqual([{ id: 'fp1', nome: 'Pix' }])
    expect(ok.despesas).toMatchObject([{ id: 'd1', categoria: 'Alimentação', forma: 'Pix', motorista: 'Carlos Oliveira', empresa: 'BETINHOS', anexos: 2 }])
    expect(ok.multas).toMatchObject([{ motorista: 'Oliveira', infracaoCodigo: '745-50', infracaoDescricao: 'Velocidade' }])

    const semPagantes = await carregarTudo(client(async (path) => { if (path.startsWith('pag?')) throw new Error('sem permissão'); return linhas(path) }), SETS, '2024-01-01', '2026-10-15')
    expect(semPagantes.indisponiveis).toEqual(['pagantes'])
    expect(semPagantes.pagantes).toEqual([])
    expect(semPagantes.despesas).toHaveLength(1)

    // Funcionários que falham marcam só 'funcionarios': despesas seguem disponíveis, com motorista pelo rótulo do lookup e "Sem empresa".
    const semFuncionarios = await carregarTudo(client(async (path) => {
      if (path.startsWith('fun?')) throw new Error('sem permissão')
      if (path.startsWith('des?')) return [{ cr40f_despesaoperacionalid: 'D1', _cr40f_motorista_value: 'M1', [`_cr40f_motorista_value${F}`]: 'Carlos Oliveira' }]
      return linhas(path)
    }), SETS, '2024-01-01', '2026-10-15')
    expect(semFuncionarios.indisponiveis).toEqual(['funcionarios'])
    expect(semFuncionarios.despesas).toMatchObject([{ id: 'd1', motorista: 'Carlos Oliveira', empresa: 'Sem empresa' }])
  })

  it('pagantes sem a data do primeiro pagamento e multas sem o $expand caem na consulta reduzida', async () => {
    const c = client(async (path) => {
      if (path.startsWith('pag?') && path.includes('cr40f_datadoprimeiropagamento')) throw new Error('coluna inexistente')
      if (path.startsWith('pag?')) return [{ cr40f_pagantesid: 'P1', cr40f_valor: 10 }]
      if (path.startsWith('mul?') && path.includes('$expand')) throw new Error('navegação inexistente')
      if (path.startsWith('mul?')) return [{ _cr40f_codigodainfracao_value: 'I1', [`_cr40f_codigodainfracao_value${F}`]: '745-50' }]
      return []
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const d = await carregarTudo(c, SETS, '2024-01-01', '2026-10-15')
    expect(d.indisponiveis).toEqual([])
    expect(d.pagantes).toMatchObject([{ id: 'p1', valor: 10, primeiroPagamentoRaw: '' }])
    expect(d.multas).toMatchObject([{ infracaoCodigo: '745-50', infracaoDescricao: '' }])
    // O erro da consulta completa fica registrado antes da alternativa.
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls.map((c) => String(c[1]))).toEqual(expect.arrayContaining(['Error: coluna inexistente', 'Error: navegação inexistente']))
    warn.mockRestore()
  })

  it('tabela secundária ausente na metadata vira indisponível, sem consulta; reservas e CPs ausentes derrubam a tela', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const info = new Map(Object.values(ENTITIES).filter((n) => n !== ENTITIES.multa && n !== ENTITIES.anexoDespesa).map((n) => [n, { entitySetName: `${n}s` }]))
    const sets = resolverEntitySets(info)
    expect(sets).toMatchObject({ multa: '', anexoDespesa: '', reserva: `${ENTITIES.reserva}s` })
    expect(warn).toHaveBeenCalledTimes(2)
    const consultas: string[] = []
    const d = await carregarTudo(client(async (path) => { consultas.push(path); return [] }), { ...SETS, multa: '', anexoDespesa: '' }, '2024-01-01', '2026-10-15')
    expect(d.indisponiveis).toEqual(['multas', 'despesas'])
    expect(consultas.some((c) => c.startsWith('?'))).toBe(false)
    const semReserva = new Map([...info].filter(([n]) => n !== ENTITIES.reserva))
    expect(() => resolverEntitySets(semReserva)).toThrow(/cr40f_reservadeveculos/)
    warn.mockRestore()
  })

  it('despesas: falha em qualquer tabela de despesa marca o conjunto inteiro', async () => {
    for (const prefixo of ['des?', 'cat?', 'frm?', 'anx?']) {
      const d = await carregarTudo(client(async (path) => {
        if (path.startsWith(prefixo)) throw new Error('falhou')
        if (path.startsWith('des?')) return [{ cr40f_despesaoperacionalid: 'D1' }]
        return []
      }), SETS, '2024-01-01', '2026-10-15')
      expect(d.indisponiveis).toEqual(['despesas'])
      expect({ d: d.despesas, c: d.categoriasDespesa, f: d.formasPagamento }).toEqual({ d: [], c: [], f: [] })
    }
  })

  it('mock: pagantes nas OPs das reservas, despesas coerentes com cadastros, campos extras; determinístico e na janela', async () => {
    const hoje = new Date().toISOString().slice(0, 10)
    const d = await mockTudo(createSource({ mode: 'mock' }), '2025-01-01', hoje)
    // A OP pode ser de um serviço que sai depois de hoje (pagante criado antes da saída): confere contra todas as reservas.
    const tudo = await mockTudo(createSource({ mode: 'mock' }), '2025-01-01', '2099-12-31')
    const ops = new Set(tudo.reservas.map((r) => r.opId).filter(Boolean))
    expect(d.pagantes.length).toBeGreaterThan(20)
    expect(d.pagantes.every((p) => ops.has(p.opId) && p.criadoDia >= '2025-01-01' && p.criadoDia <= hoje)).toBe(true)
    // Como no Dataverse, o mock devolve todos os pagantes, qualquer que seja a janela.
    expect((await mockTudo(createSource({ mode: 'mock' }), '2026-09-01', '2026-09-30')).pagantes).toEqual(d.pagantes)
    expect(d.pagantes.some((p) => p.statusLabel === 'Pago' && p.primeiroPagamentoRaw)).toBe(true)
    expect(d.pagantes.some((p) => p.status !== 202410002)).toBe(true)
    expect(new Set(d.pagantes.map((p) => p.formaLabel)).size).toBeGreaterThan(1)
    const cats = new Map(d.categoriasDespesa.map((c) => [c.id, c.nome]))
    const formas = new Map(d.formasPagamento.map((f) => [f.id, f.nome]))
    const funcs = new Map(d.funcionarios.map((f) => [f.id, f]))
    expect(d.despesas.length).toBeGreaterThan(50)
    for (const x of d.despesas) {
      expect(x.dia >= '2025-01-01' && x.dia <= hoje).toBe(true)
      expect(cats.get(x.categoriaId)).toBe(x.categoria)
      expect(formas.get(x.formaId)).toBe(x.forma)
      expect(funcs.get(x.motoristaId)?.nome).toBe(x.motorista)
    }
    expect(d.despesas.some((x) => x.categoria === 'Hospedagem')).toBe(true)
    expect(d.despesas.some((x) => x.categoria === 'Alimentação')).toBe(true)
    expect(d.despesas.some((x) => x.statusFinanceiro === 100000001)).toBe(true)
    expect(d.despesas.some((x) => x.statusAnexo !== 100000002 && x.anexos === 0)).toBe(true)
    expect(new Set(d.despesas.map((x) => x.empresa))).toEqual(new Set(['BETINHOS', 'DEPAULA']))
    expect(d.veiculos.every((v) => v.placa && v.marca && v.modelo && v.ano)).toBe(true)
    expect(d.veiculos.some((v) => v.blindado)).toBe(true)
    expect(d.funcionarios.every((f) => f.id && f.nome && f.apelido && f.funcao === 'Motorista' && f.empresa)).toBe(true)
    expect(d.reservas.filter((r) => !r.id.startsWith('legacy-')).every((r) => r.tipoServico !== '—')).toBe(true)
    expect(d.reservas.some((r) => r.finalizadoRaw)).toBe(true)
    expect(new Set(d.manutencoes.map((m) => m.tipoReparo)).size).toBeGreaterThan(2)
    expect(d.manutencoes.every((m) => m.statusLabel && m.veiculoId && m.aprovacaoDia && m.aprovacaoDia <= m.dia && m.criadoDia && m.criadoDia <= m.aprovacaoDia)).toBe(true)
    // Um veículo de aluguel, usado em parte das reservas.
    const aluguel = d.veiculos.filter((v) => v.categoria === 'Aluguel').map((v) => v.id)
    expect(aluguel).toHaveLength(1)
    expect(d.reservas.some((r) => r.veiculoId === aluguel[0])).toBe(true)
    expect(d.multas.every((m) => m.motoristaId && m.motorista && m.infracaoCodigo && m.infracaoDescricao && m.statusLabel)).toBe(true)
    expect(d.multas.some((m) => m.status === 202410000)).toBe(true)
    expect(d.telemetria.some((t) => t.distanciaKm > 0 && t.velocidadeMaxima > 0)).toBe(true)
    expect(d.viagens.some((v) => v.combustivelL > 0)).toBe(true)
    const outra = await mockTudo(createSource({ mode: 'mock' }), '2025-01-01', hoje)
    expect({ p: outra.pagantes, d: outra.despesas }).toEqual({ p: d.pagantes, d: d.despesas })
  })

  it('estágio 1 não consulta pagantes nem despesas e os marca pendentes; estágio 2 consulta só o conjunto pedido', async () => {
    const consultas: string[] = []
    const c = client(async (path) => { consultas.push(path.slice(0, 3)); return [] })
    const d = await carregarDataverse(c, SETS, '2024-01-01', '2026-10-15')
    // Preventivas: plano (itp), baselines (bas) e as manutenções sem janela (segundo man); os veículos são os mesmos.
    expect(consultas.sort()).toEqual(['bas', 'cps', 'eve', 'fun', 'itp', 'man', 'man', 'mul', 'oco', 'res', 'tel', 'vei', 'via'])
    expect(d.pendentes).toEqual(['pagantes', 'despesas'])
    expect({ p: d.pagantes, d: d.despesas, c: d.categoriasDespesa, f: d.formasPagamento }).toEqual({ p: [], d: [], c: [], f: [] })
    consultas.length = 0
    expect(await carregarExtraDataverse(c, SETS, 'pagantes', '2024-01-01', '2026-10-15')).toEqual({ campos: { pagantes: [] }, indisponivel: false })
    expect(consultas).toEqual(['pag'])
    consultas.length = 0
    await carregarExtraDataverse(c, SETS, 'despesas', '2024-01-01', '2026-10-15')
    expect(consultas.sort()).toEqual(['anx', 'cat', 'des', 'frm', 'fun'])
  })

  it('mock: estágio 1 com manutenções, multas e ocorrências na janela e pagantes/despesas pendentes', async () => {
    const s = createSource({ mode: 'mock' })
    const d = await s.carregar('2026-09-01', '2026-09-30')
    const na = (x: { dia: string }) => x.dia >= '2026-09-01' && x.dia <= '2026-09-30'
    expect(d.manutencoes.every(na) && d.multas.every(na) && d.ocorrencias.every(na)).toBe(true)
    expect(d.pendentes).toEqual(['pagantes', 'despesas'])
    expect(d.pagantes).toEqual([])
    const extra = await s.carregarExtra('despesas', '2026-09-01', '2026-09-30')
    expect(extra.campos.despesas?.every(na)).toBe(true)
  })

  it('preventivas: itens do plano, baselines, manutenções sem janela e hodômetro do veículo', () => {
    expect(ENTITIES).toMatchObject({ itemPlano: 'cr40f_itemplanopreventivo', baseline: 'cr40f_baselinepreventiva' })
    expect(itensPlanoPath('itp')).toBe('itp?$select=cr40f_itemplanopreventivoid,cr40f_name,cr40f_servico,cr40f_intervalokm,cr40f_intervalomeses,cr40f_avisokm,cr40f_avisodias&$filter=statecode eq 0')
    expect(baselinesPath('bas')).toBe('bas?$select=cr40f_baselinepreventivaid,_cr40f_veiculo_value,_cr40f_item_value,cr40f_km,cr40f_data')
    expect(manutencoesPreventivaPath('man')).toBe('man?$select=cr40f_manutencoesid,cr40f_status,cr40f_datamanutencao,createdon,cr40f_kmatual,_cr40f_placa_carro_value,new_servicosmanutencao&$filter=statecode eq 0 and (cr40f_status eq 202410002 or cr40f_status eq 0 or cr40f_status eq 202410001 or cr40f_status eq 202410005)')
  })

  it('carrega as preventivas reaproveitando os veículos; qualquer das 4 consultas que falha marca só preventivas', async () => {
    const lidos: string[] = []
    const responder = (falha = '') => client(async (path) => {
      lidos.push(path)
      if (falha && path.startsWith(falha)) throw new Error('falhou')
      if (path.startsWith('vei?')) return [{ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23', cr40f_statusdoveiculo: 202410001, new_categoriadoveiculo: 100000000, cr40f_hodometro: 21000, cr40f_hodometroem: '2026-10-14T12:00:00Z' }]
      if (path.startsWith('itp?')) return [{ cr40f_itemplanopreventivoid: 'I1', cr40f_name: 'Troca de óleo', cr40f_servico: 7, cr40f_intervalokm: 10000, cr40f_intervalomeses: 6 }]
      if (path.startsWith('bas?')) return [{ cr40f_baselinepreventivaid: 'B1', _cr40f_veiculo_value: 'V1', [`_cr40f_veiculo_value${F}`]: 'ABC1D23', _cr40f_item_value: 'I1', cr40f_km: 10000, cr40f_data: '2026-01-10' }]
      if (path.startsWith('man?$select=cr40f_manutencoesid')) return [{ cr40f_manutencoesid: 'M1', cr40f_status: 202410002, cr40f_datamanutencao: '2026-02-01T12:00:00Z', createdon: '2026-02-01T12:00:00Z', cr40f_kmatual: 12000, _cr40f_placa_carro_value: 'V1', new_servicosmanutencao: '7,9' }]
      return []
    })
    const ok = await carregarDataverse(responder(), SETS, '2024-01-01', '2026-10-15')
    expect(ok.indisponiveis).toEqual([])
    expect(lidos.filter((p) => p.startsWith('vei?'))).toHaveLength(1)
    expect(ok.preventivas).toEqual({
      veiculos: [{ id: 'v1', placa: 'ABC1D23', status: 202410001, categoria: 100000000, hodometro: 21000, hodometroEm: '2026-10-14T12:00:00Z' }],
      manutencoes: [{ id: 'm1', status: 202410002, dataManutencao: '2026-02-01T12:00:00Z', criadoEm: '2026-02-01T12:00:00Z', km: 12000, veiculo: { id: 'v1', label: '' }, servicos: [7, 9] }],
      itens: [{ id: 'i1', nome: 'Troca de óleo', servico: 7, intervaloKm: 10000, intervaloMeses: 6, avisoKm: 1000, avisoDias: 30, ativo: true }],
      baselines: [{ id: 'b1', veiculo: { id: 'v1', label: 'ABC1D23' }, item: { id: 'i1', label: '' }, km: 10000, data: '2026-01-10' }],
    })
    // A janela das manutenções do período segue só nas manutenções da aba; a das preventivas não tem filtro de data.
    expect(lidos.find((p) => p.startsWith('man?$select=cr40f_manutencoesid'))).not.toContain('cr40f_datamanutencao ge')

    const vazio = { veiculos: [], manutencoes: [], itens: [], baselines: [] }
    for (const prefixo of ['itp?', 'bas?', 'man?$select=cr40f_manutencoesid']) {
      const d = await carregarDataverse(responder(prefixo), SETS, '2024-01-01', '2026-10-15')
      expect(d.indisponiveis).toEqual(['preventivas'])
      expect(d.preventivas).toEqual(vazio)
      expect(d.veiculos).toHaveLength(1)
    }
    const semVeiculos = await carregarDataverse(responder('vei?'), SETS, '2024-01-01', '2026-10-15')
    expect(semVeiculos.indisponiveis).toEqual(['veiculos', 'preventivas'])
    expect(semVeiculos.preventivas).toEqual(vazio)
  })

  it('sem as colunas de hodômetro: veículos carregam sem elas e preventivas ficam indisponíveis', async () => {
    const lidos: string[] = []
    const d = await carregarDataverse(client(async (path) => {
      lidos.push(path)
      if (path.startsWith('vei?') && path.includes('cr40f_hodometro')) throw new Error("Could not find a property named 'cr40f_hodometro' on type 'Microsoft.Dynamics.CRM.cr40f_veiculos'.")
      if (path.startsWith('vei?')) return [{ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23', cr40f_statusdoveiculo: 202410001, new_categoriadoveiculo: 100000000 }]
      return []
    }), SETS, '2024-01-01', '2026-10-15')
    const consultasVeiculos = lidos.filter((p) => p.startsWith('vei?'))
    expect(consultasVeiculos).toHaveLength(2)
    expect(consultasVeiculos[1]).toBe(veiculosPath('vei', false))
    expect(consultasVeiculos[1]).not.toContain('hodometro')
    expect(d.veiculos).toHaveLength(1)
    expect(d.indisponiveis).toEqual(['preventivas'])
    expect(d.preventivas).toEqual({ veiculos: [], manutencoes: [], itens: [], baselines: [] })
  })

  it('plano preventivo ausente na metadata: preventivas indisponível, sem consulta', async () => {
    const consultas: string[] = []
    const d = await carregarDataverse(client(async (path) => { consultas.push(path); return [] }), { ...SETS, itemPlano: '' }, '2024-01-01', '2026-10-15')
    expect(d.indisponiveis).toEqual(['preventivas'])
    expect(consultas.some((c) => c.startsWith('?'))).toBe(false)
  })
})

describe('comCacheCadastros', () => {
  it('reaproveita cadastros dentro do TTL, não guarda falhas e nunca guarda consultas com janela', async () => {
    const { comCacheCadastros } = await import('./source')
    let chamadas = 0
    let falhar = true
    const base = { getAll: async (p: string) => { chamadas++; if (p === 'falha' && falhar) throw new Error('x'); return [{ p }] } } as unknown as Parameters<typeof comCacheCadastros>[0]
    const c = comCacheCadastros(base, (p) => p !== 'janela', 1000)
    await Promise.all([c.getAll('fun'), c.getAll('fun')])
    await c.getAll('fun')
    expect(chamadas).toBe(1)
    await c.getAll('janela'); await c.getAll('janela')
    expect(chamadas).toBe(3)
    await expect(c.getAll('falha')).rejects.toThrow('x')
    falhar = false
    expect(await c.getAll('falha')).toEqual([{ p: 'falha' }])
  })
})
