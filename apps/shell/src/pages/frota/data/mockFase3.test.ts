import { describe, expect, it } from 'vitest'
import { todaySP } from './dates'
import { createMockSource } from './mock'
import { situacaoDaMulta } from '../domain/multaEstado'

// Cada caso da fase 3 do mock tem de cair no passo corrente que o nome promete.
const CASOS: [string, string, string][] = [
  ['A000000101', 'indicar', 'AvisarMotorista'],
  ['A000000102', 'indicar', 'AvisarMotorista'],
  ['A000000103', 'identificar', 'DefinirResponsavel'],
  ['A000000104', 'indicar', 'RegistrarAceite'],
  ['A000000105', 'acertar', 'RegistrarAcerto'],
  ['A000000106', 'acertar', 'RegistrarAcerto'],
]

describe('mock da fase 3 de multas', () => {
  it.each(CASOS)('%s está na etapa %s com o passo %s', async (auto, etapa, passo) => {
    const source = createMockSource()
    const { data } = await source.load()
    const m = data.multas.find((x) => x.titulo === auto)!
    expect(m).toBeTruthy()
    const termo = (await source.listarTermos(m.id))[0] ?? null
    const s = situacaoDaMulta(m, todaySP(), termo)
    expect(s.etapa).toBe(etapa)
    expect(s.pendentes[0]).toBe(passo)
    if (auto === 'A000000102') expect(s.aguardandoTermo).toBe(true)
  })
})
