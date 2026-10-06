import { describe, expect, it } from 'vitest'
import { FORMATTED, mapColisao, mapManutencao, mapMulta, mapVeiculo, ref } from './mappers'

describe('mappers', () => {
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
})
