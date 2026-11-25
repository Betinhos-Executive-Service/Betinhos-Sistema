import { describe, expect, it } from 'vitest'
import { lerLogoResposta } from './source'

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])

describe('lerLogoResposta', () => {
  it('bytes crus viram data URL com o tipo do conteúdo', async () => {
    expect(await lerLogoResposta(new Response(png, { headers: { 'Content-Type': 'application/octet-stream' } }))).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...png))}`)
  })
  it('JSON com base64 também funciona', async () => {
    const value = btoa(String.fromCharCode(...png))
    expect(await lerLogoResposta(new Response(JSON.stringify({ value }), { headers: { 'Content-Type': 'application/json' } }))).toBe(`data:image/png;base64,${value}`)
  })
  it('sem imagem: null; erro de servidor: lança', async () => {
    expect(await lerLogoResposta(new Response(null, { status: 204 }))).toBeNull()
    expect(await lerLogoResposta(new Response('x', { status: 404 }))).toBeNull()
    await expect(lerLogoResposta(new Response('x', { status: 500 }))).rejects.toThrow('HTTP 500')
  })
})
