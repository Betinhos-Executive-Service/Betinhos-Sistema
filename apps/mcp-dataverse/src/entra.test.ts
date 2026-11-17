import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntraError, exchangeCode, refreshForResource, validateIdentity } from './entra'
import { env, json, mockFetch, tokenReply } from './helpers.test-util'

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const idToken = (claims: Record<string, unknown>) => `h.${b64({ tid: 'tenant-1', aud: 'client-1', oid: 'o1', email: 'ana@betinhos.com.br', name: 'Ana', ...claims })}.s`

afterEach(() => vi.unstubAllGlobals())

describe('validateIdentity', () => {
  it('aceita tenant, audiência e domínio corretos', () => {
    expect(validateIdentity(env, idToken({}))).toEqual({ oid: 'o1', email: 'ana@betinhos.com.br', name: 'Ana' })
  })
  it('usa preferred_username/upn quando não há email', () => {
    expect(validateIdentity(env, idToken({ email: undefined, preferred_username: 'Bia@Betinhos.com.br' })).email).toBe('bia@betinhos.com.br')
  })
  it('prefere preferred_username e upn ao email (que não é verificado)', () => {
    expect(validateIdentity(env, idToken({ email: 'outra@betinhos.com.br', preferred_username: 'bia@betinhos.com.br' })).email).toBe('bia@betinhos.com.br')
    expect(validateIdentity(env, idToken({ email: 'outra@betinhos.com.br', upn: 'cad@betinhos.com.br' })).email).toBe('cad@betinhos.com.br')
    expect(() => validateIdentity(env, idToken({ email: 'ana@betinhos.com.br', preferred_username: 'x@exemplo.com' }))).toThrowError(expect.objectContaining({ code: 'wrong_domain' }))
  })
  it('recusa convidado (#EXT# ou acct 1) com guest_not_allowed 403', () => {
    for (const claims of [{ preferred_username: 'x_betinhos.com.br#EXT#@betinhos.onmicrosoft.com' }, { upn: 'x#EXT#@betinhos.com.br' }, { acct: 1 }]) {
      expect(() => validateIdentity(env, idToken(claims))).toThrowError(expect.objectContaining({ code: 'guest_not_allowed', status: 403 }))
    }
  })
  it('recusa outro tenant', () => {
    expect(() => validateIdentity(env, idToken({ tid: 'outro' }))).toThrowError(expect.objectContaining({ code: 'wrong_tenant' }))
  })
  it('recusa outra audiência', () => {
    expect(() => validateIdentity(env, idToken({ aud: 'x' }))).toThrowError(expect.objectContaining({ code: 'wrong_audience' }))
  })
  it('recusa domínio de e-mail diferente (inclusive sufixo enganoso)', () => {
    expect(() => validateIdentity(env, idToken({ email: 'ana@exemplo.com' }))).toThrowError(expect.objectContaining({ code: 'wrong_domain' }))
    expect(() => validateIdentity(env, idToken({ email: 'a@evilbetinhos.com.br' }))).toThrowError(expect.objectContaining({ code: 'wrong_domain' }))
  })

  it('aceita qualquer domínio da lista separada por vírgula', () => {
    const multi = { ...env, ALLOWED_EMAIL_DOMAIN: 'betinhos.com.br, betinhos.onmicrosoft.com' }
    expect(validateIdentity(multi, idToken({ email: 'renan@betinhos.onmicrosoft.com' })).email).toBe('renan@betinhos.onmicrosoft.com')
    expect(() => validateIdentity(multi, idToken({ email: 'a@onmicrosoft.com' }))).toThrowError(expect.objectContaining({ code: 'wrong_domain' }))
  })
  it('recusa id_token ausente', () => {
    expect(() => validateIdentity(env, undefined)).toThrow(EntraError)
  })
})

describe('troca de tokens no Entra', () => {
  it('exchangeCode envia PKCE, secret e o escopo de login com o Dataverse DEV', async () => {
    const calls = mockFetch(() => tokenReply({ id_token: 'x' }))
    const r = await exchangeCode(env, { code: 'c', redirectUri: 'https://mcp.test/callback', verifier: 'v' })
    expect(r.refreshToken).toBe('rt-2')
    const body = new URLSearchParams(calls[0].body)
    expect(calls[0].url).toBe('https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token')
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code_verifier')).toBe('v')
    expect(body.get('scope')).toContain('https://dev.crm.test/user_impersonation')
    expect(body.get('scope')).toContain('offline_access')
  })

  it('refreshForResource pede o .default do ambiente', async () => {
    const calls = mockFetch(() => tokenReply())
    await refreshForResource(env, 'rt-1', 'https://prod.crm.test')
    const body = new URLSearchParams(calls[0].body)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('scope')).toBe('https://prod.crm.test/.default offline_access')
  })

  it('erro do Entra vira EntraError com o código e sem trace id', async () => {
    mockFetch(() => json({ error: 'invalid_grant', error_description: 'AADSTS70008 expirou\r\nTrace ID: abc' }, 400))
    const error = await refreshForResource(env, 'rt', 'https://dev.crm.test').catch((e) => e)
    expect(error).toBeInstanceOf(EntraError)
    expect(error.code).toBe('invalid_grant')
    expect(error.message).not.toContain('Trace ID')
  })
})
