import { describe, expect, it } from 'vitest'
import { LOGIN_DENIED_TEXT, PAGE_SECURITY_HEADERS, loginDenialLog } from './seguranca'

describe('cabeçalhos da página de consentimento', () => {
  it('bloqueia iframe, script e cache', () => {
    expect(PAGE_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
    expect(PAGE_SECURITY_HEADERS['Content-Security-Policy']).toMatch(/default-src 'none'.*frame-ancestors 'none'/)
    expect(PAGE_SECURITY_HEADERS['Cache-Control']).toBe('no-store')
  })

  it('não usa no-referrer (o Chrome mandaria Origin: null no POST e a trava de origem recusaria)', () => {
    expect(PAGE_SECURITY_HEADERS['Referrer-Policy']).toBe('same-origin')
  })
})

describe('login recusado (rodada 6)', () => {
  it('o texto devolvido ao cliente é fixo e o detalhe do Entra só vai para o log (primeira linha)', () => {
    expect(LOGIN_DENIED_TEXT).toBe('Login recusado pela Microsoft.')
    const log = loginDenialLog('access_denied', 'AADSTS50105: sem acesso\r\nTrace ID: abc\nCorrelation ID: def')
    expect(log).toEqual({ evento: 'login_recusado', erro: 'access_denied', detalhe: 'AADSTS50105: sem acesso' })
    expect(JSON.stringify(log)).not.toMatch(/Trace ID/)
    expect(loginDenialLog('x', null).detalhe).toBe('')
  })
})
