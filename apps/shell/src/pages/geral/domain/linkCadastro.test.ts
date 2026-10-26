import { describe, expect, it } from 'vitest'
import { LINK_CADASTRO_FALHA, linkCadastroBlock, mensagemWhatsapp, parseLinkCadastroJson, pedidoAquecer, temDadosCadastrados, validadeTexto, whatsappCadastroHref } from './linkCadastro'

describe('linkCadastroBlock', () => {
  it('libera um serviço ativo', () => expect(linkCadastroBlock([{ cr40f_status: 202410001 }], 1)).toBeNull())
  it('exige exatamente um', () => {
    expect(linkCadastroBlock([], 0)).toMatch(/exatamente um/)
    expect(linkCadastroBlock([{}, {}], 2)).toMatch(/exatamente um/)
  })
  it('bloqueia cancelados', () => {
    expect(linkCadastroBlock([{ cr40f_status: 202410002 }], 1)).toMatch(/cancelado/)
    expect(linkCadastroBlock([{ cr40f_status: 202410010 }], 1)).toMatch(/cancelado/)
  })
})

describe('parseLinkCadastroJson', () => {
  it('lê sucesso com passageiros', () => {
    const r = parseLinkCadastroJson('{"ok":true,"link":"https://c/x","expiraEm":"2026-10-24T15:00:00Z","passageiros":[{"id":"1","nome":"Ana"}]}')
    expect(r.ok).toBe(true); expect(r.passageiros).toHaveLength(1)
  })
  it('sucesso sem lista vira lista vazia', () => expect(parseLinkCadastroJson('{"ok":true,"link":"https://c/x"}').passageiros).toEqual([]))
  it('repassa erro do servidor', () => expect(parseLinkCadastroJson('{"ok":false,"erro":"Sem passageiros."}').erro).toBe('Sem passageiros.'))
  it('inválido vira falha genérica', () => {
    for (const raw of [undefined, '', 'xx', '{}', '{"ok":true}']) expect(parseLinkCadastroJson(raw)).toEqual({ ok: false, erro: LINK_CADASTRO_FALHA })
  })
})

describe('validade e mensagem', () => {
  it('formata em São Paulo', () => expect(validadeTexto('2026-10-24T15:05:00Z')).toBe('vale até 24/10 12:05'))
  it('sem data', () => { expect(validadeTexto(undefined)).toBeNull(); expect(validadeTexto('x')).toBeNull() })
  it('detecta dados já cadastrados', () => {
    expect(temDadosCadastrados([{ id: '1', nome: 'A' }])).toBe(false)
    expect(temDadosCadastrados([{ id: '1', nome: 'A', email: 'a@b.c' }])).toBe(true)
  })
  it('monta a mensagem e o link do WhatsApp', () => {
    expect(mensagemWhatsapp('https://c/x', 'vale até 24/10 12:05')).toContain('https://c/x (vale até 24/10 12:05)')
    expect(whatsappCadastroHref('https://c/x', null)).toMatch(/^https:\/\/wa\.me\/\?text=.*https%3A%2F%2Fc%2Fx$/)
  })
})

describe('pedidoAquecer', () => {
  const token = 'A'.repeat(40) + '_-9'
  it('monta o POST no-cors para /api/aquecer com o token do link', () => {
    const p = pedidoAquecer(`https://cadastro-passageiro.betinhosexecutiveservice.workers.dev/#t=${token}`)
    expect(p?.url).toBe('https://cadastro-passageiro.betinhosexecutiveservice.workers.dev/api/aquecer')
    expect(p?.init).toMatchObject({ method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } })
    expect(JSON.parse(String(p?.init.body))).toEqual({ token })
  })
  it('ignora link sem token válido ou não https', () => {
    expect(pedidoAquecer('https://cadastro.mock/c/abc123')).toBeNull()
    expect(pedidoAquecer(`http://x.dev/#t=${token}`)).toBeNull()
  })
})
