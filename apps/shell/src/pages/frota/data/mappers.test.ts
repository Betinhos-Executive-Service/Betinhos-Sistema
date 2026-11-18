import { describe, expect, it } from 'vitest'
import { FORMATTED, mapBaseline, mapColisao, mapDespesaCombustivel, mapDetalheManutencao, mapItemPlano, mapManutencao, mapMulta, mapParcelaFolha, mapPosse, mapTelemetriaKm, mapVeiculo, ref, SELECT, SELECT_DETALHE_MANUTENCAO } from './mappers'

describe('mappers', () => {
  it('multa: lê responsável, canal, datas dos passos, valores e nomes dos arquivos', () => {
    const m = mapMulta({
      cr40f_multasid: '{U1}', cr40f_novacoluna: 'AIT 1', cr40f_status: 202410001, cr40f_responsavel: 100000001, cr40f_motivoempresa: 100000000,
      cr40f_canalindicacao: 100000000, cr40f_vencimento: '2026-11-20', cr40f_valorcomdesconto: 105.53, cr40f_valorpago: 175.88, cr40f_pagaem: '2026-11-16',
      cr40f_competenciadesconto: '2026-12-01', cr40f_motivocancelamento: null, cr40f_autodainfracao_name: 'auto.pdf', cr40f_comprovantepagamento_name: 'comprovante.pdf',
    }, { cr40f_vencimento: 'DateOnly', cr40f_pagaem: 'DateOnly', cr40f_competenciadesconto: 'DateOnly' })
    expect(m).toMatchObject({
      responsavel: 100000001, motivoEmpresa: 100000000, canal: 100000000, vencimento: '2026-11-20', valorComDesconto: 105.53, valorPago: 175.88,
      pagaEm: '2026-11-16', competencia: '2026-12-01', motivoCancelamento: null, arquivos: { autuacao: 'auto.pdf', penalidade: null, comprovante: 'comprovante.pdf' },
    })
  })
  it('mapeia veículo com hodômetro', () => {
    const v = mapVeiculo({ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23', cr40f_hodometro: 175233, cr40f_hodometroem: '2026-10-14T13:37:38Z' })
    expect(v.hodometro).toBe(175233); expect(v.hodometroEm).toBe('2026-10-14T13:37:38Z')
    expect(mapVeiculo({ cr40f_veiculosid: 'V2', cr40f_placa: 'X' }).hodometro).toBeNull()
  })
  it('mapeia item do plano com avisos padrão quando vazios', () => {
    const item = mapItemPlano({ cr40f_itemplanopreventivoid: 'I1', cr40f_name: 'Troca de óleo', cr40f_servico: 100000000, cr40f_intervalokm: 10000, cr40f_intervalomeses: null, cr40f_avisokm: null, cr40f_avisodias: 15, statecode: 0 })
    expect(item).toEqual({ id: 'i1', nome: 'Troca de óleo', servico: 100000000, intervaloKm: 10000, intervaloMeses: null, avisoKm: 1000, avisoDias: 15, ativo: true })
    expect(mapItemPlano({ cr40f_itemplanopreventivoid: 'I2', statecode: 1 }).ativo).toBe(false)
  })
  it('mapeia baseline com lookups', () => {
    const b = mapBaseline({ cr40f_baselinepreventivaid: 'B1', _cr40f_veiculo_value: 'V1', '_cr40f_veiculo_value@OData.Community.Display.V1.FormattedValue': 'ABC1D23', _cr40f_item_value: 'I1', cr40f_km: 160000, cr40f_data: '2026-05-10' })
    expect(b).toEqual({ id: 'b1', veiculo: { id: 'v1', label: 'ABC1D23' }, item: { id: 'i1', label: '' }, km: 160000, data: '2026-05-10' })
  })
  it('mapeia despesa só nas categorias combustível e manutenção', () => {
    const cat = (id: string) => (id === 'c1' ? 'combustivel' : id === 'c2' ? 'manutencao' : null)
    expect(mapDespesaCombustivel({ cr40f_despesaoperacionalid: 'D1', cr40f_datagasto: '2026-09-01T10:00:00Z', cr40f_valor: 250.5, _cr40f_veiculo_value: 'V1', _cr40f_categoria_value: 'c1' }, cat)).toEqual({ id: 'd1', dia: '2026-09-01', valor: 250.5, veiculo: { id: 'v1', label: '' }, manutencao: null, categoria: 'combustivel' })
    expect(mapDespesaCombustivel({ cr40f_despesaoperacionalid: 'D2', _cr40f_categoria_value: 'c9' }, cat)).toBeNull()
  })
  it('mapeia telemetria diária e descarta linha sem veículo', () => {
    expect(mapTelemetriaKm({ new_data: '2026-09-01', _new_veiculo_value: 'V1', new_distanciapercorridakm: 120.4 })).toEqual({ dia: '2026-09-01', veiculoId: 'v1', km: 120.4 })
    expect(mapTelemetriaKm({ new_data: '2026-09-01', new_distanciapercorridakm: 5 })).toBeNull()
    expect(mapTelemetriaKm({ _new_veiculo_value: 'V1', new_distanciapercorridakm: 5 })).toBeNull()
  })

  it('lê lookup com id limpo e rótulo formatado', () => {
    const row = { _x_value: '{ABC-1}', [`_x_value${FORMATTED}`]: 'ABC1D23' }
    expect(ref(row, '_x_value')).toEqual({ id: 'abc-1', label: 'ABC1D23' })
    expect(ref({}, '_x_value')).toBeNull()
  })

  it('mapeia veículo sem status como null', () => {
    const veiculo = mapVeiculo({ cr40f_veiculosid: 'V1', cr40f_placa: 'ABC1D23', cr40f_modelo: 'Corolla' })
    expect(veiculo).toMatchObject({ id: 'v1', placa: 'ABC1D23', modelo: 'Corolla', status: null, motorista: null })
  })

  it('mapeia manutenção mantendo valor ausente como null', () => {
    const manutencao = mapManutencao(
      { cr40f_manutencoesid: 'M1', cr40f_descricao: 'Troca de óleo', cr40f_status: 0, cr40f_agendarpara: '2026-10-05T03:00:00Z', createdon: '2026-10-01T12:00:00Z', _cr40f_placa_carro_value: 'V1', [`_cr40f_placa_carro_value${FORMATTED}`]: 'ABC1D23' },
      { cr40f_agendarpara: 'UserLocal' },
    )
    expect(manutencao).toMatchObject({ id: 'm1', status: 0, valor: null, agendarPara: '2026-10-05', veiculo: { id: 'v1', label: 'ABC1D23' } })
  })

  it('mapeia janela, data do encaixe e km da realização', () => {
    const m = mapManutencao(
      { cr40f_manutencoesid: 'M2', cr40f_status: 202410001, cr40f_janelainicio: '2026-11-23', cr40f_janelafim: '2026-11-29', cr40f_datadaaprovacao: '2026-11-17T13:00:00Z', cr40f_kmrealizado: 85200, createdon: '2026-11-10T12:00:00Z' },
      { cr40f_janelainicio: 'DateOnly', cr40f_janelafim: 'DateOnly', cr40f_datadaaprovacao: 'UserLocal' },
    )
    expect(m).toMatchObject({ janelaInicio: '2026-11-23', janelaFim: '2026-11-29', dataAprovacao: '2026-11-17', kmRealizado: 85200 })
    expect(mapManutencao({ cr40f_manutencoesid: 'M3' })).toMatchObject({ janelaInicio: null, janelaFim: null, dataAprovacao: null, kmRealizado: null })
    expect(SELECT.manutencoes).toEqual(expect.arrayContaining(['cr40f_janelainicio', 'cr40f_janelafim', 'cr40f_datadaaprovacao', 'cr40f_kmrealizado']))
  })

  it('detalhe da manutenção junta fotos, nota, pagamento, comentários e quem realizou', () => {
    const d = mapDetalheManutencao({
      cr40f_manutencoesid: 'M4', cr40f_pagamento: 202410003,
      _cr40f_realizado_por_nome_value: 'F1', [`_cr40f_realizado_por_nome_value${FORMATTED}`]: 'Ana',
      cr40f_foto01: 'https://x.invalid/1', cr40f_linkdaevidencia: '', cr40f_foto03: 'https://x.invalid/3',
      new_linkdanotafiscal: 'https://x.invalid/nf1\nhttps://x.invalid/nf2', new_linkdafotofinal1: 'https://x.invalid/f1',
      cr40f_comentariosaomotorista: 'Levar cedo', new_comentariosdocolaborador: 'Feito',
    })
    expect(d).toMatchObject({
      id: 'm4', pagamento: 202410003, realizadoPor: { id: 'f1', label: 'Ana' },
      fotosPedido: ['https://x.invalid/1', 'https://x.invalid/3'], linkNotaFiscal: 'https://x.invalid/nf1\nhttps://x.invalid/nf2', fotosFinais: ['https://x.invalid/f1'],
      comentarioAoMotorista: 'Levar cedo', comentarioColaborador: 'Feito',
    })
    expect(SELECT_DETALHE_MANUTENCAO).toEqual(expect.arrayContaining(['cr40f_janelafim', 'cr40f_kmrealizado', '_cr40f_realizado_por_nome_value', 'new_linkdanotafiscal', 'cr40f_foto01']))
  })

  it('mapeia multa com indicado booleano e datas de dia', () => {
    const multa = mapMulta({ cr40f_multasid: 'U1', cr40f_id_multa: 'NT-1073', cr40f_novacoluna: 'AIT 123', cr40f_status: 202410000, cr40f_dataparaindicar: '2026-10-10', createdon: '2026-10-01T12:00:00Z' }, { cr40f_dataparaindicar: 'DateOnly' })
    expect(multa).toMatchObject({ id: 'u1', codigo: 'NT-1073', titulo: 'AIT 123', indicado: false, dataParaIndicar: '2026-10-10', infracaoId: null })
  })

  it('mapeia colisão', () => {
    const colisao = mapColisao({ cr40f_colisao_v2id: 'C1', cr40f_name: 'Colisão 1', cr40f_statusoperacional: 100000000, cr40f_houveterceiro: true, createdon: '2026-09-10T10:00:00Z' })
    expect(colisao).toMatchObject({ id: 'c1', status: 100000000, houveTerceiro: true })
  })

  it('mapeia posse com local de base', () => {
    const posse = mapPosse({ new_possedeveiculoid: 'P1', new_iniciodaposse: '2026-10-01T12:00:00Z', _new_veiculo_value: 'V1', _new_localdebase_value: 'B1', [`_new_localdebase_value${FORMATTED}`]: 'Base Centro' })
    expect(posse).toMatchObject({ id: 'p1', fim: null, motorista: null, localBase: { id: 'b1', label: 'Base Centro' } })
  })

  it('parcela de folha: lê multa e colaborador expandidos e o lançamento', () => {
    const p = mapParcelaFolha({
      new_parcelamultafolhaid: '{PF1}', new_numero: 2, new_competencia: '2026-12-01', new_valor: 33.33, new_status: 100000001, new_lancadoem: '2026-11-18T12:00:00Z',
      _new_multa_value: '{M1}', _new_motorista_value: '{F1}',
      new_Multa: { cr40f_novacoluna: 'TST0002', cr40f_dataehorario: '2026-09-01T15:00:00Z', [`_cr40f_placa_value${FORMATTED}`]: 'TST4B56', [`_cr40f_codigodainfracao_value${FORMATTED}`]: 'Infração fictícia' },
      new_Motorista: { cr40f_nomecompleto: 'Bruno Teste (fictício)', cr40f_numerodocpf: '111.111.111-11' },
    }, 3)
    expect(p).toMatchObject({ id: 'pf1', numero: 2, total: 3, competencia: '2026-12-01', valor: 33.33, status: 'descontada', lancadoEm: '2026-11-18', origem: 'multa' })
    expect(p.multa).toEqual({ id: 'm1', auto: 'TST0002', placa: 'TST4B56', dataInfracao: '2026-09-01', infracao: 'Infração fictícia' })
    expect(p.colaborador).toEqual({ id: 'f1', nome: 'Bruno Teste (fictício)', cpf: '111.111.111-11' })
  })
  it('parcela de termo: sem multa vira origem termo e status padrão prevista', () => {
    const p = mapParcelaFolha({ new_parcelamultafolhaid: 'PF2', new_numero: 1, new_competencia: '2026-11-01', new_valor: 10, _new_termo_value: 'T1' }, 1)
    expect(p).toMatchObject({ origem: 'termo', status: 'prevista', multa: null, colaborador: null, lancadoEm: null })
  })
})
