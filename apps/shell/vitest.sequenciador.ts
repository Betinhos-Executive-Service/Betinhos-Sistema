// Divide os arquivos de teste entre as fatias do CI (`vitest run --shard=N/M`) pelo tempo de cada um, e não pela
// quantidade de arquivos como o Vitest faz por padrão (hash do caminho): com poucos arquivos pesados (Geral,
// Equipamentos) a divisão padrão deixava uma fatia com o dobro do tempo das outras.
// Os tempos vêm de tempos-testes.json (atualize com `pnpm --filter @betinhos/shell tempos:testes`). Arquivo novo,
// ainda sem tempo registrado, entra com a mediana. Toda fatia calcula a mesma divisão, então nada roda duas vezes
// nem fica de fora. Sem --shard (pnpm test local) este sequenciador não muda nada.
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { BaseSequencer, type TestSpecification } from 'vitest/node'

const ARQUIVO_TEMPOS = new URL('./tempos-testes.json', import.meta.url)

function lerTempos(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(ARQUIVO_TEMPOS, 'utf8')) as Record<string, number>
  } catch {
    return {}
  }
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 1000
  const ordenados = [...valores].sort((a, b) => a - b)
  return ordenados[Math.floor(ordenados.length / 2)]
}

export class SequenciadorPorTempo extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const { shard, root } = this.ctx.config
    if (!shard) return files
    const tempos = lerTempos()
    const padrao = mediana(Object.values(tempos))
    const caminho = (spec: TestSpecification) => relative(root, spec.moduleId).split('\\').join('/')
    const peso = (spec: TestSpecification) => tempos[caminho(spec)] ?? padrao

    // Maior primeiro, sempre para a fatia mais leve (LPT). Empate pelo caminho: a ordem é a mesma em toda fatia.
    const fatias = Array.from({ length: shard.count }, () => ({ total: 0, specs: [] as TestSpecification[] }))
    const ordenados = [...files].sort((a, b) => peso(b) - peso(a) || (caminho(a) < caminho(b) ? -1 : 1))
    for (const spec of ordenados) {
      const alvo = fatias.reduce((leve, fatia) => (fatia.total < leve.total ? fatia : leve))
      alvo.total += peso(spec)
      alvo.specs.push(spec)
    }
    return fatias[shard.index - 1].specs
  }
}
