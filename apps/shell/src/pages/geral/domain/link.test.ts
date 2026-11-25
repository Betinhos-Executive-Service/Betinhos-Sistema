import { describe, expect, it } from 'vitest'
import { LINK_FALHA, gerarLinkBlock, parseLinkJson } from './link'

const ok = { cr40f_status: 202410005, _cr40f_motorista_value: 'm1' }

describe('gerarLinkBlock', () => {
  it.each([202410000, 202410001, 202410005, 202410008])('libera o status %i, com ou sem motorista', (status) => {
    expect(gerarLinkBlock([{ ...ok, cr40f_status: status }], 1)).toBeNull()
    expect(gerarLinkBlock([{ cr40f_status: status }], 1)).toBeNull()
  })
  it('bloqueia sem seleção ou com várias', () => {
    expect(gerarLinkBlock([], 0)).toMatch(/exatamente um/)
    expect(gerarLinkBlock([ok, ok], 2)).toMatch(/exatamente um/)
  })
  it.each([202410004, 202410002, 202410010])('bloqueia solicitado e cancelados (%i)', (status) =>
    expect(gerarLinkBlock([{ ...ok, cr40f_status: status }], 1)).toMatch(/solicitado ou cancelado/))
})

describe('parseLinkJson', () => {
  it('lê sucesso', () => expect(parseLinkJson('{"ok":true,"link":"https://x/y"}')).toEqual({ ok: true, link: 'https://x/y' }))
  it('repassa erro do servidor', () => expect(parseLinkJson('{"ok":false,"erro":"Sem rastreador."}').erro).toBe('Sem rastreador.'))
  it('vazio ou inválido vira falha genérica', () => {
    for (const raw of [undefined, '', 'xx', '{}']) expect(parseLinkJson(raw)).toEqual({ ok: false, erro: LINK_FALHA })
  })
})
