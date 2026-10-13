import { describe, expect, it } from 'vitest'
import { LINK_FALHA, gerarLinkBlock, parseLinkJson } from './link'

const ok = { cr40f_status: 202410005, _cr40f_motorista_value: 'm1' }

describe('gerarLinkBlock', () => {
  it('libera um serviço Programado com motorista', () => expect(gerarLinkBlock([ok], 1)).toBeNull())
  it('bloqueia sem seleção ou com várias', () => {
    expect(gerarLinkBlock([], 0)).toMatch(/exatamente um/)
    expect(gerarLinkBlock([ok, ok], 2)).toMatch(/exatamente um/)
  })
  it('bloqueia status diferente de Programado', () => expect(gerarLinkBlock([{ ...ok, cr40f_status: 202410001 }], 1)).toMatch(/Programado/))
  it('bloqueia sem motorista', () => expect(gerarLinkBlock([{ cr40f_status: 202410005 }], 1)).toMatch(/motorista/))
})

describe('parseLinkJson', () => {
  it('lê sucesso', () => expect(parseLinkJson('{"ok":true,"link":"https://x/y"}')).toEqual({ ok: true, link: 'https://x/y' }))
  it('repassa erro do servidor', () => expect(parseLinkJson('{"ok":false,"erro":"Sem rastreador."}').erro).toBe('Sem rastreador.'))
  it('vazio ou inválido vira falha genérica', () => {
    for (const raw of [undefined, '', 'xx', '{}']) expect(parseLinkJson(raw)).toEqual({ ok: false, erro: LINK_FALHA })
  })
})
