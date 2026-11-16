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
  })
})

describe('source sem as colunas da nota', () => {
  it('repete a leitura dos anexos sem elas, sem derrubar a ficha', async () => {
    const getAll = vi.fn(async (path: string) => {
      if (decodeURIComponent(path).includes('cr40f_situacaonota')) throw new Error("Could not find a property named 'cr40f_situacaonota'")
      return [{ cr40f_anexodespesaoperacionalid: 'a1', cr40f_nomearquivo: 'cupom.jpg' }]
    })
    const entities = async () => new Map([['cr40f_despesaoperacional', { entitySetName: 'cr40f_despesaoperacionals' }], ['cr40f_anexodespesaoperacional', { entitySetName: 'cr40f_anexodespesaoperacionals' }]])
    const host = { mode: 'dataverse', metadata: { entities, choices: async () => [] }, client: { getAll } } as never
    const anexos = await createSource(host).anexos('d1')
    expect(anexos).toHaveLength(1)
    expect(anexos[0].nota).toBeNull()
    expect(getAll).toHaveBeenCalledTimes(2)
  })
})
