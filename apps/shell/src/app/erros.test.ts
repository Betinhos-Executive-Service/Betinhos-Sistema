// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DataverseClient } from '@betinhos/dataverse'
import { assinatura, ERRO_ENTITY_SET, iniciarCapturaDeErros, reportarErro } from './erros'

function clienteFalso(create = vi.fn().mockResolvedValue('id')) {
  return { client: { create } as unknown as DataverseClient, create }
}

let desligar: () => void = () => {}
afterEach(() => desligar())

describe('assinatura', () => {
  it('é a mesma para o mesmo bug em builds diferentes (hash do chunk e linha mudam)', () => {
    const a = assinatura('x is undefined', 'TypeError: x\n    at abrir (https://h/assets/Geral.ab12cd34.js:10:5)')
    const b = assinatura('x is undefined', 'TypeError: x\n    at abrir (https://h/assets/Geral.zz99yy88.js:99:1)')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
  })

  it('muda quando a mensagem ou a função mudam', () => {
    const base = assinatura('x is undefined', 'at abrir (a.js:1:1)')
    expect(assinatura('y is undefined', 'at abrir (a.js:1:1)')).not.toBe(base)
    expect(assinatura('x is undefined', 'at fechar (a.js:1:1)')).not.toBe(base)
  })
})

describe('reportarErro', () => {
  it('não faz nada antes de iniciar a captura (modo mock)', () => {
    const { create } = clienteFalso()
    reportarErro(new Error('boom'))
    expect(create).not.toHaveBeenCalled()
  })

  it('grava o erro com origem App, situação Novo, rota e versão', () => {
    const { client, create } = clienteFalso()
    desligar = iniciarCapturaDeErros(client)
    reportarErro(new Error('boom'), 'tela Geral')
    expect(create).toHaveBeenCalledTimes(1)
    const [set, row] = create.mock.calls[0]
    expect(set).toBe(ERRO_ENTITY_SET)
    expect(row).toMatchObject({ cr40f_errodosistemanome: '[tela Geral] boom', cr40f_origem: 100000000, cr40f_situacao: 100000000 })
    expect(row.cr40f_assinatura).toMatch(/^[0-9a-f]{16}$/)
    expect(typeof row.cr40f_versao).toBe('string')
  })

  it('envia cada assinatura uma vez e no máximo 10 por carga', () => {
    const { client, create } = clienteFalso()
    desligar = iniciarCapturaDeErros(client)
    reportarErro(new Error('repetido'))
    reportarErro(new Error('repetido'))
    for (let i = 0; i < 20; i++) reportarErro(new Error(`erro ${i}`))
    expect(create).toHaveBeenCalledTimes(10)
  })

  it('ignora chunk ausente e ruído do navegador', () => {
    const { client, create } = clienteFalso()
    desligar = iniciarCapturaDeErros(client)
    reportarErro(new TypeError('Failed to fetch dynamically imported module: /assets/x.js'))
    reportarErro(new Error('ResizeObserver loop completed with undelivered notifications.'))
    reportarErro('Script error.')
    expect(create).not.toHaveBeenCalled()
  })

  it('falha ao gravar não lança', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { client } = clienteFalso(vi.fn().mockRejectedValue(new Error('403')))
    desligar = iniciarCapturaDeErros(client)
    expect(() => reportarErro(new Error('qualquer'))).not.toThrow()
    await vi.waitFor(() => expect(warn).toHaveBeenCalled())
    warn.mockRestore()
  })

  it('captura erros soltos e promessas rejeitadas da janela', () => {
    const { client, create } = clienteFalso()
    desligar = iniciarCapturaDeErros(client)
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('solto'), message: 'solto' }))
    const rejeitada = new Event('unhandledrejection') as PromiseRejectionEvent
    Object.defineProperty(rejeitada, 'reason', { value: new Error('rejeitada') })
    window.dispatchEvent(rejeitada)
    expect(create.mock.calls.map(([, row]) => row.cr40f_mensagem)).toEqual(['[window.onerror] solto', '[promessa rejeitada] rejeitada'])
  })
})
