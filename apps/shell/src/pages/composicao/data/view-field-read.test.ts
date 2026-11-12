import { describe, expect, it } from 'vitest'
import { readViewField } from './view-field-read'

const FORMATTED = '@OData.Community.Display.V1.FormattedValue'

describe('readViewField', () => {
  it('lê o valor pela própria chave, com o texto formatado', () => {
    expect(readViewField({ new_status: 3, [`new_status${FORMATTED}`]: 'Aberto' }, 'new_status')).toEqual({ value: 3, formatted: 'Aberto' })
  })

  it('cai em _<chave>_value quando a WebApi devolve o lookup da tabela base nesse formato', () => {
    const fields = { _cr40f_cliente_value: 'id-do-cliente', [`_cr40f_cliente_value${FORMATTED}`]: 'Cliente Alfa' }
    expect(readViewField(fields, 'cr40f_cliente')).toEqual({ value: 'id-do-cliente', formatted: 'Cliente Alfa' })
  })

  it('prefere a chave direta quando as duas existem e o texto formatado de qualquer uma das duas', () => {
    const fields = { cr40f_cliente: 'direto', _cr40f_cliente_value: 'outro', [`_cr40f_cliente_value${FORMATTED}`]: 'Texto' }
    expect(readViewField(fields, 'cr40f_cliente')).toEqual({ value: 'direto', formatted: 'Texto' })
  })

  it('devolve vazio sem viewFields ou sem a chave', () => {
    expect(readViewField(undefined, 'x')).toEqual({ value: '', formatted: undefined })
    expect(readViewField({}, 'x')).toEqual({ value: '', formatted: undefined })
  })

  it('mantém null quando o valor existe e é nulo', () => {
    expect(readViewField({ cr40f_cliente: null }, 'cr40f_cliente').value).toBeNull()
  })
})
