import { describe, expect, it } from 'vitest'
import { PAGE_SECURITY_HEADERS } from './seguranca'

describe('cabeçalhos da página de consentimento', () => {
  it('bloqueia iframe, script e cache', () => {
    expect(PAGE_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
    expect(PAGE_SECURITY_HEADERS['Content-Security-Policy']).toMatch(/default-src 'none'.*frame-ancestors 'none'/)
    expect(PAGE_SECURITY_HEADERS['Cache-Control']).toBe('no-store')
  })
})
