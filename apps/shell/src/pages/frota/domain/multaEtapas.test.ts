import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { aplicarPasso, avaliar, dataAceiteInicial, dividirParcelas, janelaCompetencia, mudancas, previaParcelas, PASSOS, ROTULO_PASSO, validarPasso, type DadosPasso, type MultaEstado } from './multaEtapas'

type F = {
  hoje: string
  avaliacoes: { nome: string; multa: MultaEstado; etapa: string; pendentes: string[]; proximoPasso: string; proximoPrazo: string | null; prazoVencido: boolean; aguardandoPenalidade: boolean; descontando?: boolean; aguardandoTermo?: boolean }[]
  divisoes: { valor: number; parcelas: number; primeira: string; esperado: { numero: number; competencia: string; valor: number }[] }[]
  validacoes: { nome: string; multa: MultaEstado; passo: string; dados?: DadosPasso; erro: string | null }[]
  aplicacoes: { nome: string; multa: MultaEstado; passo: string; dados?: DadosPasso; mudancas: string[] }[]
}

// Mesmo arquivo dos testes do plugin C# (MultaEtapas.cs).
const caminho = fileURLToPath(new URL('../../../../../../packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json', import.meta.url))
const f = JSON.parse(readFileSync(caminho, 'utf8')) as F

describe('paridade de MultaEtapas com o plugin', () => {
  it('o fixture traz todos os casos', () => {
    expect([f.avaliacoes.length, f.validacoes.length, f.aplicacoes.length]).toEqual([23, 71, 29])
  })

  it.each(f.avaliacoes.map((c) => [c.nome, c] as const))('avalia: %s', (_nome, c) => {
    const s = avaliar(c.multa, f.hoje)
    expect(s).toEqual({ etapa: c.etapa, pendentes: c.pendentes, proximoPasso: c.proximoPasso, proximoPrazo: c.proximoPrazo, prazoVencido: c.prazoVencido, aguardandoPenalidade: c.aguardandoPenalidade, descontando: c.descontando ?? false, aguardandoTermo: c.aguardandoTermo ?? false })
  })

  it.each(f.validacoes.map((c) => [c.nome, c] as const))('valida: %s', (_nome, c) => {
    expect(validarPasso(c.multa, c.passo, c.dados ?? {}, f.hoje)).toBe(c.erro)
  })

  it.each(f.aplicacoes.map((c) => [c.nome, c] as const))('aplica: %s', (_nome, c) => {
    const dados = c.dados ?? {}
    expect(validarPasso(c.multa, c.passo, dados, f.hoje)).toBeNull()
    expect(mudancas(c.multa, aplicarPasso(c.multa, c.passo as (typeof PASSOS)[number], dados, f.hoje)).sort()).toEqual(c.mudancas)
  })

  it('divisões do fixture', () => {
    expect(f.divisoes.length).toBeGreaterThan(0)
    for (const c of f.divisoes) {
      expect(dividirParcelas(c.valor, c.parcelas, c.primeira).map(({ numero, competencia, valor }) => ({ numero, competencia, valor }))).toEqual(c.esperado)
    }
  })

  it('todo passo tem rótulo e aplicar não muda a entrada', () => {
    expect(PASSOS.every((p) => ROTULO_PASSO[p])).toBe(true)
    const antes: MultaEstado = { status: 202410000 }
    aplicarPasso(antes, 'DefinirResponsavel', { responsavel: 'empresa' }, '2026-11-17')
    expect(antes).toEqual({ status: 202410000 })
  })
})

describe('parcelas da folha', () => {
  it('trunca e põe a sobra na última', () => {
    expect(dividirParcelas(100, 3, '2026-12').map((p) => p.valor)).toEqual([33.33, 33.33, 33.34])
    expect(dividirParcelas(0.05, 2, '2026-12').map((p) => p.valor)).toEqual([0.02, 0.03])
  })
  it('competências viram o ano', () => {
    expect(dividirParcelas(90, 3, '2026-11-01').map((p) => p.competencia)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })
  it('janela do mês anterior até 12 meses', () => {
    expect(janelaCompetencia('2026-11-17')).toEqual({ de: '2026-10-01', ate: '2027-11-01' })
  })
  it('prévia', () => {
    expect(previaParcelas(100, 3)).toBe('3× R$ 33,33 · última R$ 33,34')
    expect(previaParcelas(100, 2)).toBe('2× R$ 50,00')
    expect(previaParcelas(130.16, 1)).toBe('1× R$ 130,16')
  })
})

describe('aceite declarado pelo motorista', () => {
  it('preenche a data do campo com a declarada', () => {
    expect(dataAceiteInicial({ status: 202410000, aceiteDeclaradoEm: '2026-11-17' })).toBe('2026-11-17')
    expect(dataAceiteInicial({ status: 202410000, aceiteDeclaradoEm: '2026-11-17T10:00:00Z' })).toBe('2026-11-17')
  })
  it('deixa o campo vazio quando não houve declaração', () => {
    expect(dataAceiteInicial({ status: 202410000, aceiteDeclaradoEm: null })).toBeUndefined()
  })
})
