import { describe, expect, it } from 'vitest'
import { anexosPath, despesasPath, mapAnexo, mapDespesa } from './queries'

const F = '@OData.Community.Display.V1.FormattedValue'

describe('consultas de despesas', () => {
  it('filtra ativas pela data do gasto e ordena da mais recente', () => {
    const path = decodeURIComponent(despesasPath('cr40f_despesaoperacionals', new Date('2026-07-11T03:00:00Z')))
    expect(path).toContain('cr40f_despesaoperacionals?$select=cr40f_despesaoperacionalid,cr40f_nome,cr40f_datagasto,cr40f_valor,')
    expect(path).toContain('_cr40f_categoria_value,_cr40f_formapagamento_value,_cr40f_motorista_value,_cr40f_veiculo_value,_cr40f_reserva_value,_cr40f_manutencao_value,_cr40f_cidade_value')
    expect(path).toContain('$filter=statecode eq 0 and cr40f_datagasto ge 2026-07-11T03:00:00.000Z')
    expect(path).toContain('$orderby=cr40f_datagasto desc')
    expect(decodeURIComponent(despesasPath('s', null))).toContain('$filter=statecode eq 0&')
  })

  it('anexos da despesa por id limpo, na ordem de envio', () => {
    expect(decodeURIComponent(anexosPath('anx', '{ABC-1}'))).toContain('$filter=statecode eq 0 and _cr40f_despesa_value eq abc-1&$orderby=cr40f_ordem asc,createdon asc')
  })

  it('mapeia despesa com lookups pelo rótulo formatado', () => {
    const d = mapDespesa({
      cr40f_despesaoperacionalid: 'D1', cr40f_nome: ' Combustível ', cr40f_datagasto: '2026-10-02T13:00:00Z', cr40f_valor: 180.5,
      _cr40f_categoria_value: 'C1', [`_cr40f_categoria_value${F}`]: 'Combustível', _cr40f_motorista_value: 'M1', [`_cr40f_motorista_value${F}`]: 'Carlos',
      _cr40f_cidade_value: 'CI', [`_cr40f_cidade_value${F}`]: 'São Paulo',
      cr40f_statusoperacional: 100000002, cr40f_statusfinanceiro: 100000001, cr40f_possivelduplicidade: true, cr40f_kminformado: 48000,
      _createdby_value: 'U1', [`_createdby_value${F}`]: 'App Motoristas',
    })
    expect(d).toMatchObject({
      id: 'd1', nome: 'Combustível', valor: 180.5, categoriaId: 'c1', categoria: 'Combustível', motoristaId: 'm1', motorista: 'Carlos',
      cidade: 'São Paulo', reservaId: '', reserva: '', statusOperacional: 100000002, statusFinanceiro: 100000001,
      possivelDuplicidade: true, km: 48000, litros: null, criadoPor: 'App Motoristas',
    })
    expect(d.data?.toISOString()).toBe('2026-10-02T13:00:00.000Z')
    expect(mapDespesa({}).possivelDuplicidade).toBe(false)
  })

  it('anexo usa o link de compartilhamento e só aceita http(s)', () => {
    expect(mapAnexo({ cr40f_anexodespesaoperacionalid: 'A1', cr40f_nomearquivo: 'cupom.jpg', cr40f_sharelink: 'https://x/s', cr40f_urlsharepoint: 'https://x/u' }).url).toBe('https://x/s')
    expect(mapAnexo({ cr40f_sharelink: 'javascript:alert(1)', cr40f_urlsharepoint: 'https://x/u' }).url).toBe('https://x/u')
    expect(mapAnexo({ cr40f_nome: 'Comprovante' })).toMatchObject({ nome: 'Comprovante', url: null })
  })
})
