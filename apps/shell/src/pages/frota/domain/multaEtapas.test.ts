import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { aplicarPasso, avaliar, mudancas, PASSOS, ROTULO_PASSO, validarPasso, type DadosPasso, type MultaEstado } from './multaEtapas'

type F = {
  hoje: string
  avaliacoes: { nome: string; multa: MultaEstado; etapa: string; pendentes: string[]; proximoPasso: string; proximoPrazo: string | null; prazoVencido: boolean; aguardandoPenalidade: boolean }[]
  validacoes: { nome: string; multa: MultaEstado; passo: string; dados?: DadosPasso; erro: string | null }[]
  aplicacoes: { nome: string; multa: MultaEstado; passo: string; dados?: DadosPasso; mudancas: string[] }[]
}

// Mesmo arquivo dos testes do plugin C# (MultaEtapas.cs).
const caminho = fileURLToPath(new URL('../../../../../../packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/multa-etapas.json', import.meta.url))
const f = JSON.parse(readFileSync(caminho, 'utf8')) as F

describe('paridade de MultaEtapas com o plugin', () => {
  it('o fixture traz todos os casos', () => {
    expect([f.avaliacoes.length, f.validacoes.length, f.aplicacoes.length]).toEqual([17, 39, 23])
  })

  it.each(f.avaliacoes.map((c) => [c.nome, c] as const))('avalia: %s', (_nome, c) => {
    const s = avaliar(c.multa, f.hoje)
    expect(s).toEqual({ etapa: c.etapa, pendentes: c.pendentes, proximoPasso: c.proximoPasso, proximoPrazo: c.proximoPrazo, prazoVencido: c.prazoVencido, aguardandoPenalidade: c.aguardandoPenalidade })
  })

  it.each(f.validacoes.map((c) => [c.nome, c] as const))('valida: %s', (_nome, c) => {
    expect(validarPasso(c.multa, c.passo, c.dados ?? {}, f.hoje)).toBe(c.erro)
  })

  it.each(f.aplicacoes.map((c) => [c.nome, c] as const))('aplica: %s', (_nome, c) => {
    const dados = c.dados ?? {}
    expect(validarPasso(c.multa, c.passo, dados, f.hoje)).toBeNull()
    expect(mudancas(c.multa, aplicarPasso(c.multa, c.passo as (typeof PASSOS)[number], dados, f.hoje)).sort()).toEqual(c.mudancas)
  })

  it('todo passo tem rótulo e aplicar não muda a entrada', () => {
    expect(PASSOS.every((p) => ROTULO_PASSO[p])).toBe(true)
    const antes: MultaEstado = { status: 202410000 }
    aplicarPasso(antes, 'DefinirResponsavel', { responsavel: 'empresa' }, '2026-11-17')
    expect(antes).toEqual({ status: 202410000 })
  })
})
