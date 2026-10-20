import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Baseline, ItemPlano, Manutencao, Veiculo } from '../data/types'
import { buildPendencias, type PendenciaTipo } from './pendencias'

type F = {
  hoje: string; agora: string; esperado: string[]
  veiculos: Pick<Veiculo, 'id' | 'placa' | 'status' | 'categoria' | 'hodometro' | 'hodometroEm'>[]
  itens: ItemPlano[]
  baselines: { veiculoId: string; itemId: string; km: number | null; data: string | null }[]
  manutencoes: (Omit<Manutencao, 'veiculo' | 'codigo' | 'tipo' | 'servicoRealizado' | 'comentarioAprovador' | 'solicitante' | 'categorias' | 'origemClassificacao' | 'confiancaIa'> & { veiculoId: string; veiculoLabel: string })[]
}

// Mesmo arquivo dos testes do plugin C# (Custom API cr40f_FrotaPendencias).
const caminho = fileURLToPath(new URL('../../../../../../packages/plugins/Cr40f.Frota.Plugin.Tests/Fixtures/paridade.json', import.meta.url))
const f = JSON.parse(readFileSync(caminho, 'utf8')) as F
// A Custom API só devolve as regras proativas; "agendada" só quando já venceu.
const PROATIVOS: PendenciaTipo[] = ['prioridade', 'reincidencia', 'preventiva', 'agendada', 'custo', 'hodometro']

describe('paridade com a Custom API cr40f_FrotaPendencias', () => {
  it('mesmas pendências proativas do fixture', () => {
    const pendencias = buildPendencias({
      veiculos: f.veiculos.map((v) => ({ ...v, marca: null, modelo: null, cor: null, anoModelo: null, motorista: null })),
      manutencoes: f.manutencoes.map(({ veiculoId, veiculoLabel, ...m }) => ({ ...m, codigo: m.id, tipo: null, servicoRealizado: null, comentarioAprovador: null, solicitante: null, categorias: [], origemClassificacao: null, confiancaIa: null, veiculo: { id: veiculoId, label: veiculoLabel } })),
      planoPreventivo: f.itens,
      baselines: f.baselines.map((b): Baseline => ({ id: `${b.veiculoId}-${b.itemId}`, veiculo: { id: b.veiculoId, label: b.veiculoId }, item: { id: b.itemId, label: b.itemId }, km: b.km, data: b.data })),
      multas: [], colisoes: [],
    }, f.hoje, new Date(f.agora))
    const proativas = pendencias.filter((p) => PROATIVOS.includes(p.tipo) && (p.tipo !== 'agendada' || (p.dias ?? 0) < 0))
    expect(proativas.map((p) => `${p.tipo}|${p.id}`).sort()).toEqual(f.esperado)
  })
})
