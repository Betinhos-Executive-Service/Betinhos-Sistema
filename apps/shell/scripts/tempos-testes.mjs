// Grava em tempos-testes.json quanto cada arquivo de teste levou, a partir do relatório JSON do Vitest.
// O sequenciador do CI (vitest.sequenciador.ts) usa esses tempos para equilibrar as fatias.
// Uso: pnpm --filter @betinhos/shell tempos:testes (roda a suíte e atualiza o arquivo). Atualize quando surgir
// um arquivo de teste pesado ou quando uma fatia do CI passar a demorar bem mais que as outras.
import { readFileSync, writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const relatorio = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const tempos = {}
for (const arquivo of relatorio.testResults) {
  tempos[relative(raiz, arquivo.name).split('\\').join('/')] = Math.max(1, Math.round(arquivo.endTime - arquivo.startTime))
}
const ordenado = Object.fromEntries(Object.entries(tempos).sort(([a], [b]) => (a < b ? -1 : 1)))
writeFileSync(new URL('../tempos-testes.json', import.meta.url), `${JSON.stringify(ordenado, null, 1)}\n`)
console.log(`tempos-testes.json: ${Object.keys(ordenado).length} arquivos`)
