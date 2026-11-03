import { describe, expect, it } from 'vitest'
import { contarProgresso, dataCurta, exigenciasDe, progressoDe, publicoCelula, validadeDe } from './tabela'
import { ESTADO, PUBLICO, emptyDraft, type Funcionario, type Treinamento } from './treinamentos'

const t = (patch: Partial<Treinamento> = {}): Treinamento => ({ ...emptyDraft(), titulo: 'X', ...patch })
const pub = (patch: Partial<Treinamento> = {}) => t({ estado: ESTADO.publicado, ...patch })
const HOJE = '2026-11-03'

describe('validadeDe', () => {
  it('sem validade não mostra nada', () => expect(validadeDe(pub(), HOJE)).toBeNull())
  it('vencido diz há quantos dias', () => {
    expect(validadeDe(pub({ validade: '2026-11-02' }), HOJE)).toMatchObject({ estado: 'vencido', texto: 'Venceu ontem' })
    expect(validadeDe(pub({ validade: '2026-10-31' }), HOJE)).toMatchObject({ estado: 'vencido', texto: 'Venceu há 3 dias' })
  })
  it('a vencer em até 7 dias', () => {
    expect(validadeDe(pub({ validade: HOJE }), HOJE)).toMatchObject({ estado: 'avencer', texto: 'Vence hoje' })
    expect(validadeDe(pub({ validade: '2026-11-04' }), HOJE)).toMatchObject({ estado: 'avencer', texto: 'Vence amanhã' })
    expect(validadeDe(pub({ validade: '2026-11-10' }), HOJE)).toMatchObject({ estado: 'avencer', texto: 'Vence em 7 dias' })
  })
  it('depois disso mostra a data; rascunho nunca alerta', () => {
    expect(validadeDe(pub({ validade: '2026-11-18' }), HOJE)).toMatchObject({ estado: 'ok', texto: 'Vence em 18/11/2026' })
    expect(validadeDe(t({ validade: '2026-10-01' }), HOJE)).toMatchObject({ estado: 'ok', texto: 'Prazo 01/10/2026' })
  })
  it('traz a data completa para o tooltip', () => expect(validadeDe(pub({ validade: '2026-11-02' }), HOJE)?.completa).toBe('02/11/2026'))
})

describe('dataCurta', () => {
  const agora = new Date('2026-11-03T15:00:00Z')
  it('hoje, ontem, há N dias e data', () => {
    expect(dataCurta('2026-11-03T12:00:00Z', agora)).toBe('Hoje')
    expect(dataCurta('2026-11-02T12:00:00Z', agora)).toBe('Ontem')
    expect(dataCurta('2026-10-30T12:00:00Z', agora)).toBe('Há 4 dias')
    expect(dataCurta('2026-09-01T12:00:00Z', agora)).toBe('01/09/2026')
  })
  it('usa o dia de São Paulo, não o UTC', () => expect(dataCurta('2026-11-04T01:00:00Z', new Date('2026-11-04T02:00:00Z'))).toBe('Hoje'))
  it('vazio vira vazio', () => expect(dataCurta(null, agora)).toBe(''))
})

describe('progressoDe', () => {
  it('sem participantes não há progresso', () => {
    expect(progressoDe(undefined)).toBeNull()
    expect(progressoDe({ concluidos: 0, total: 0 })).toBeNull()
  })
  it('conta e percentual', () => {
    expect(progressoDe({ concluidos: 3, total: 5 })).toEqual({ pct: 60, texto: '3 de 5 concluíram', completo: false })
    expect(progressoDe({ concluidos: 1, total: 1 })).toEqual({ pct: 100, texto: '1 de 1 concluiu', completo: true })
    expect(progressoDe({ concluidos: 0, total: 4 })?.texto).toBe('0 de 4 concluíram')
  })
})

describe('exigenciasDe', () => {
  it('lista assinatura e quiz; sem nenhum é só leitura', () => {
    expect(exigenciasDe(t({ exigeAssinatura: true, exigeQuiz: true })).map((e) => e.key)).toEqual(['assinatura', 'quiz'])
    expect(exigenciasDe(t()).map((e) => e.key)).toEqual(['leitura'])
  })
})

describe('publicoCelula', () => {
  const F: Funcionario[] = [
    { id: 'a', nome: 'Carlos', apelido: '', funcao: 202410000, ativo: true },
    { id: 'b', nome: 'Márcio', apelido: '', funcao: 202410000, ativo: true },
    { id: 'c', nome: 'Bruna', apelido: '', funcao: 202410001, ativo: false },
  ]
  it('todos os motoristas traz a contagem de ativos', () => expect(publicoCelula(t({ publicoTipo: PUBLICO.motoristas }), F)).toEqual({ principal: 'Todos os motoristas', detalhe: '2 funcionários' }))
  it('selecionados nomeia', () => expect(publicoCelula(t({ publicoTipo: PUBLICO.selecionados, publico: ['a'] }), F)).toEqual({ principal: 'Carlos', detalhe: '1 funcionário' }))
  it('rascunho sem público escolhido avisa', () => expect(publicoCelula(t({ publicoTipo: PUBLICO.funcao, publico: [] }), F).principal).toBe('Público não definido'))
  it('sem funcionários carregados não inventa contagem', () => expect(publicoCelula(t({ publicoTipo: PUBLICO.motoristas }), []).detalhe).toBe(''))
})

describe('contarProgresso', () => {
  it('agrupa por treinamento', () => {
    expect(contarProgresso([{ treinamentoId: 'a', concluida: true }, { treinamentoId: 'a', concluida: false }, { treinamentoId: 'b', concluida: false }]))
      .toEqual({ a: { concluidos: 1, total: 2 }, b: { concluidos: 0, total: 1 } })
    expect(contarProgresso([])).toEqual({})
  })
})
