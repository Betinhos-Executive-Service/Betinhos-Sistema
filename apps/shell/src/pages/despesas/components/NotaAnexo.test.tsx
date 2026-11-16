// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { anexosPath, mapAnexo, mapNota } from '../data/queries'
import { createSource } from '../data/source'
import { NotaDoAnexo, formatarCnpj } from './NotaAnexo'

afterEach(cleanup)

// CNPJs fictícios (repositório público).
describe('nota fiscal do comprovante', () => {
  it('mapeia a situação pelas choices e a decomposição da chave; comprovante antigo fica sem nota', () => {
    expect(mapNota({ cr40f_situacaonota: 100000000, cr40f_notacnpjemitente: '12ABC34501DE35', cr40f_notauf: 'RJ', cr40f_notamodelo: '65', cr40f_notanumero: 4321 }))
      .toEqual({ situacao: 'verificada', cnpj: '12ABC34501DE35', uf: 'RJ', modelo: '65', numero: 4321 })
    expect(mapNota({ cr40f_situacaonota: 100000001 })?.situacao).toBe('nao-verificada')
    expect(mapNota({ cr40f_situacaonota: 100000002 })?.situacao).toBe('sem-nota')
    expect(mapNota({})).toBeNull()
    expect(mapAnexo({ cr40f_anexodespesaoperacionalid: 'a1' }).nota).toBeNull()
    expect(decodeURIComponent(anexosPath('cr40f_anexodespesaoperacionals', 'd1'))).toContain('cr40f_situacaonota,cr40f_notacnpjemitente')
    expect(decodeURIComponent(anexosPath('cr40f_anexodespesaoperacionals', 'd1', false))).not.toContain('cr40f_situacaonota')
  })

  it('chave conferida mostra CNPJ formatado, UF, modelo e número; nunca "Nota confirmada"', () => {
    render(<NotaDoAnexo nota={{ situacao: 'verificada', cnpj: '12ABC34501DE35', uf: 'RJ', modelo: '65', numero: 4321 }} />)
    expect(screen.getByText('Chave conferida')).toBeTruthy()
    expect(document.querySelector('.dsp-nota__detalhe')?.textContent).toBe('CNPJ 12.ABC.345/01DE-35 · RJ · NFC-e nº 4321')
    expect(screen.queryByText(/confirmada/i)).toBeNull()
  })

  it('nota não verificada e sem nota fiscal mostram só a situação', () => {
    const { rerender } = render(<NotaDoAnexo nota={{ situacao: 'nao-verificada', cnpj: '', uf: '', modelo: '', numero: null }} />)
    expect(screen.getByText('Nota não verificada')).toBeTruthy()
    rerender(<NotaDoAnexo nota={{ situacao: 'sem-nota', cnpj: '', uf: '', modelo: '', numero: null }} />)
    expect(screen.getByText('Sem nota fiscal')).toBeTruthy()
    rerender(<NotaDoAnexo nota={null} />)
    expect(screen.queryByText(/nota/i)).toBeNull()
  })

  it('formata CNPJ numérico e alfanumérico', () => {
    expect(formatarCnpj('12345678000195')).toBe('12.345.678/0001-95')
    expect(formatarCnpj('12ABC34501DE35')).toBe('12.ABC.345/01DE-35')
    expect(formatarCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35')
    expect(formatarCnpj('123')).toBe('123')
  })
})

describe('source e as colunas da nota', () => {
  const montar = (colunas: string[]) => {
    const getAll = vi.fn(async () => [{ cr40f_anexodespesaoperacionalid: 'a1', cr40f_nomearquivo: 'cupom.jpg', cr40f_situacaonota: 100000001 }])
    const entities = async () => new Map([['cr40f_despesaoperacional', { entitySetName: 'cr40f_despesaoperacionals' }], ['cr40f_anexodespesaoperacional', { entitySetName: 'cr40f_anexodespesaoperacionals' }]])
    const attributes = vi.fn(async () => colunas.map((logicalName) => ({ logicalName })))
    const host = { mode: 'dataverse', metadata: { entities, attributes, choices: async () => [] }, client: { getAll } } as never
    return { source: createSource(host), getAll, attributes }
  }

  it('sem as colunas no ambiente, lê os anexos sem elas numa consulta só, e a metadata uma vez', async () => {
    const { source, getAll, attributes } = montar(['cr40f_nome'])
    await source.anexos('d1')
    await source.anexos('d2')
    expect(getAll).toHaveBeenCalledTimes(2)
    expect(getAll.mock.calls.every((c) => !decodeURIComponent(String((c as unknown[])[0])).includes('cr40f_situacaonota'))).toBe(true)
    expect(attributes).toHaveBeenCalledTimes(1)
  })

  it('com as colunas, pede a nota', async () => {
    const { source, getAll } = montar(['cr40f_situacaonota', 'cr40f_notacnpjemitente', 'cr40f_notauf', 'cr40f_notamodelo', 'cr40f_notanumero'])
    const [anexo] = await source.anexos('d1')
    expect(decodeURIComponent(String((getAll.mock.calls[0] as unknown[])[0]))).toContain('cr40f_situacaonota')
    expect(anexo.nota?.situacao).toBe('nao-verificada')
  })
})
