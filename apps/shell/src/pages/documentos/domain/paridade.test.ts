import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contarKpis, montarPendencias } from './pendencias'
import type { Categoria, DocEmitido, Dono, TipoDoc } from './types'

type Esperado = { contagens: Record<string, number>; urgentes: string[] }
type Fixture = { hoje: string; tipos: TipoDoc[]; donos: Dono[]; docs: DocEmitido[]; esperado: Record<Categoria, Esperado> }

// Mesmo arquivo usado pelos testes do plugin C# (Custom API cr40f_DocumentosResumoSemanal).
const caminho = fileURLToPath(new URL('../../../../../../packages/plugins/Cr40f.Documentos.Plugin.Tests/Fixtures/paridade.json', import.meta.url))
const fixture = JSON.parse(readFileSync(caminho, 'utf8')) as Fixture
const URGENTES = new Set(['vencido', 'vence7', 'faltando'])

describe('paridade com o resumo semanal do plugin', () => {
  for (const categoria of ['pessoas', 'frota'] as const) {
    it(`${categoria}: mesmas contagens e mesma lista urgente do fixture`, () => {
      const donos = fixture.donos.filter((d) => d.categoria === categoria)
      const pendencias = montarPendencias(fixture.tipos, donos, fixture.docs, fixture.hoje)
      expect(contarKpis(pendencias)).toEqual(fixture.esperado[categoria].contagens)
      const urgentes = pendencias.filter((p) => URGENTES.has(p.estado)).map((p) => `${p.dono.nome}|${p.tipo.nome}|${p.estado}|${p.dias ?? ''}`)
      expect(urgentes).toEqual(fixture.esperado[categoria].urgentes)
    })
  }
})
