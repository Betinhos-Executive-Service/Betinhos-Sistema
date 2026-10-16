import { describe, expect, it } from 'vitest'
import { descreverErroLink, validadeLabel } from './LinkAcompanhamento'

describe('validadeLabel', () => {
  const now = new Date('2026-10-15T12:00:00Z')
  it('formata a validade em São Paulo', () => {
    expect(validadeLabel('2026-10-15T21:30:00Z', now)).toBe('Válido até 15/10 18:30')
    expect(validadeLabel(new Date('2026-10-16T03:00:00Z'), now)).toBe('Válido até 16/10 00:00')
  })
  it('marca link vencido e ignora data ausente ou inválida', () => {
    expect(validadeLabel('2026-10-15T11:00:00Z', now)).toBe('Link expirado')
    expect(validadeLabel(null, now)).toBeNull()
    expect(validadeLabel('abc', now)).toBeNull()
  })
})

describe('descreverErroLink', () => {
  it('explica a falta de configuração do plugin', () => {
    const r = descreverErroLink('Link de acompanhamento não configurado.')
    expect(r.title).toBe('Link de acompanhamento não configurado neste ambiente')
    expect(r.body).toContain('Peça ao TI')
  })
  it('repassa os demais erros', () => {
    expect(descreverErroLink('Serviço sem motorista.')).toEqual({ title: 'Não foi possível gerar o link', body: 'Serviço sem motorista.' })
  })
})
