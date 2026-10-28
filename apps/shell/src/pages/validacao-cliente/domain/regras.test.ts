import { describe, expect, it } from 'vitest'
import { createMockLinhas, createMockMensagens, TENARIS } from '../data/mock'
import { planilhaFechamento, nomeArquivo } from './excel'
import { builtinViews, fechamentoChave } from './lista'
import { aplicarResposta, entraNoFechamento, fechamentoSugerido, linhasDoFechamento, podeResponder, podeRetirar, prazoTacita, prazoVencido, validarValidador } from './regras'
import type { Linha } from './types'

const linhas = createMockLinhas(createMockMensagens())
const por = (codigo: string) => linhas.find((l) => l.codigo === codigo)!
const com = (patch: Partial<Linha>): Linha => ({ ...linhas[0], ...patch })

describe('prazo da tácita', () => {
  it('conta 5 dias úteis sem o próprio dia', () => {
    expect(prazoTacita('2026-10-27T13:00:00Z')).toBe('2026-11-04') // ter → pula 02/11 (Finados)
  })
  it('liberado na sexta com feriado na segunda vence na sexta seguinte, não antes', () => {
    // 30/10/2026 é sexta; 02/11 é feriado → 03, 04, 05, 06, 09
    expect(prazoTacita('2026-10-30T15:00:00Z')).toBe('2026-11-09')
  })
  it('usa o dia de São Paulo (23h local ainda é o mesmo dia)', () => {
    expect(prazoTacita('2026-10-28T02:30:00Z')).toBe(prazoTacita('2026-10-27T15:00:00Z'))
  })
  it('vencido só quando espera o cliente', () => {
    expect(prazoVencido({ situacao: 'liberado', prazoTacita: '2026-10-01' }, '2026-10-28')).toBe(true)
    expect(prazoVencido({ situacao: 'aprovado', prazoTacita: '2026-10-01' }, '2026-10-28')).toBe(false)
  })
})

describe('transições', () => {
  it('responder leva a Respondido e reinicia o prazo', () => {
    const r = aplicarResposta(com({ situacao: 'em_duvida', prazoTacita: '2026-10-01' }), '2026-10-28T12:00:00Z')
    expect(r).toEqual({ situacao: 'respondido', prazoTacita: prazoTacita('2026-10-28T12:00:00Z') })
  })
  it('só responde com dúvida aberta ou já respondida', () => {
    expect(podeResponder('em_duvida')).toBe(true)
    expect(podeResponder('respondido')).toBe(true)
    expect(() => aplicarResposta(com({ situacao: 'aprovado' }), '2026-10-28T12:00:00Z')).toThrow(/dúvida aberta/)
  })
  it('retira só antes da aprovação', () => {
    expect(['liberado', 'em_duvida', 'respondido'].every((s) => podeRetirar(s as Linha['situacao']))).toBe(true)
    expect(podeRetirar('aprovado')).toBe(false)
    expect(podeRetirar('a_liberar')).toBe(false)
  })
})

describe('fechamento', () => {
  it('aprovados sem decisão vêm sugeridos', () => {
    expect(fechamentoSugerido({ situacao: 'aprovado', fechamento: 'pendente' })).toBe(true)
    expect(fechamentoSugerido({ situacao: 'aprovado_tacito', fechamento: 'pendente' })).toBe(true)
    expect(fechamentoSugerido({ situacao: 'aprovado', fechamento: 'nao' })).toBe(false)
    expect(fechamentoSugerido({ situacao: 'liberado', fechamento: 'pendente' })).toBe(false)
  })
  it('retirado e a liberar nunca entram, mesmo marcados', () => {
    expect(entraNoFechamento({ situacao: 'retirado', fechamento: 'sim' })).toBe(false)
    expect(entraNoFechamento({ situacao: 'a_liberar', fechamento: 'sim' })).toBe(false)
    expect(entraNoFechamento({ situacao: 'em_duvida', fechamento: 'sim' })).toBe(true)
  })
  it('Excel do mês leva só o cliente, o mês e o que entra', () => {
    const out = linhasDoFechamento(linhas, TENARIS.id, '2026-10')
    expect(out.map((l) => l.codigo)).toEqual(['48207', '48206']) // tácito 09/10 e aprovado 15/10; o "próximo mês" (48208) fica fora
    expect(out.every((l) => fechamentoChave(l) === 'sim')).toBe(true)
    const xml = planilhaFechamento(out, 'Tenaris outubro/2026')
    expect(xml).toContain('<Data ss:Type="String">48207</Data>')
    expect(xml).toContain('2 serviços')
    expect(nomeArquivo('Tenaris S.A.', '2026-10')).toBe('fechamento-tenaris-s-a-2026-10.xls')
  })
  it('escapa texto no XML', () => {
    expect(planilhaFechamento([com({ trajeto: 'A & B <C>', situacao: 'aprovado' })], 'x')).toContain('A &amp; B &lt;C&gt;')
  })
})

describe('mock e visões', () => {
  it('cobre todas as situações e dois clientes', () => {
    expect(new Set(linhas.map((l) => l.situacao)).size).toBe(7)
    expect(new Set(linhas.map((l) => l.cliente.id)).size).toBe(2)
    expect(por('48203').prazoTacita).toBeTruthy()
  })
  it('tem as cinco visões pedidas', () => {
    expect(builtinViews().map((v) => v.name)).toEqual(['A liberar', 'Liberados', 'Em dúvida', 'Aprovados', 'Retirados'])
  })
})

describe('validador', () => {
  it('exige nome, e-mail válido e único, e cliente', () => {
    expect(validarValidador({ nome: '', email: 'x', clienteId: '' }, [])).toEqual({ nome: expect.any(String), email: expect.stringMatching(/válido/), clienteId: expect.any(String) })
    expect(validarValidador({ nome: 'A', email: 'Carla@x.com', clienteId: '1' }, ['carla@x.com']).email).toMatch(/já é validador/)
    expect(validarValidador({ nome: 'A', email: 'a@x.com', clienteId: '1' }, [])).toEqual({})
  })
})
