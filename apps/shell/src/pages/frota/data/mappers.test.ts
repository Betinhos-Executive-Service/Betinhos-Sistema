import { describe, expect, it } from 'vitest'
import { FORMATTED, mapBaseline, mapColisao, mapDespesaCombustivel, mapItemPlano, mapManutencao, mapMulta, mapPosse, mapTelemetriaKm, mapVeiculo, ref } from './mappers'

describe('mappers', () => {
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

  it('mapeia multa com indicado booleano e datas de dia', () => {
    const multa = mapMulta({ cr40f_multasid: 'U1', cr40f_novacoluna: 'AIT 123', cr40f_status: 202410000, cr40f_dataparaindicar: '2026-10-10', createdon: '2026-10-01T12:00:00Z' }, { cr40f_dataparaindicar: 'DateOnly' })
    expect(multa).toMatchObject({ id: 'u1', titulo: 'AIT 123', indicado: false, dataParaIndicar: '2026-10-10', infracaoId: null })
  })

  it('mapeia colisão', () => {
    const colisao = mapColisao({ cr40f_colisao_v2id: 'C1', cr40f_name: 'Colisão 1', cr40f_statusoperacional: 100000000, cr40f_houveterceiro: true, createdon: '2026-09-10T10:00:00Z' })
    expect(colisao).toMatchObject({ id: 'c1', status: 100000000, houveTerceiro: true })
  })

  it('mapeia posse com local de base', () => {
    const posse = mapPosse({ new_possedeveiculoid: 'P1', new_iniciodaposse: '2026-10-01T12:00:00Z', _new_veiculo_value: 'V1', _new_localdebase_value: 'B1', [`_new_localdebase_value${FORMATTED}`]: 'Base Centro' })
    expect(posse).toMatchObject({ id: 'p1', fim: null, motorista: null, localBase: { id: 'b1', label: 'Base Centro' } })
  })
})
