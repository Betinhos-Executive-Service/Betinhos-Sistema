import { describe, expect, it } from 'vitest'
import { describeLoadFailure } from './load-failure'

describe('describeLoadFailure', () => {
  it('nomeia o campo removido citado pelo FetchXML do Dataverse', () => {
    const failure = describeLoadFailure("'cr40f_ComposicaodePrecos' entity doesn't contain attribute with Name = 'new_valorsubtotal' and NameMapping = 'Logical' (look up attribute by name is case-sensitive).orgIndex: 78")
    expect(failure.title).toBe('Esta visão usa o campo new_valorsubtotal, que não existe mais')
    expect(failure.detail).toMatch(/Edite as colunas ou troque de visão/)
  })

  it('nomeia o campo citado pelo OData', () => {
    expect(describeLoadFailure("Could not find a property named 'new_antigo' on type 'Microsoft.Dynamics.CRM.cr40f_composicaodeprecos'.").title).toBe('Esta visão usa o campo new_antigo, que não existe mais')
  })

  it('outras falhas mantêm a mensagem do servidor', () => {
    expect(describeLoadFailure('Failed to fetch')).toEqual({ title: 'Não foi possível carregar as composições', detail: 'Failed to fetch' })
  })
})
