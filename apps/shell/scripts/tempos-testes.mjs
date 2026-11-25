// Reporter do Vitest que grava em tempos-testes.json quanto cada arquivo de teste custou: preparar o ambiente (jsdom),
// importar o arquivo e o que ele puxa, e rodar os testes. Só o tempo dos testes não basta: arquivo de tela com testes
// curtos custa quase tudo no import, e as fatias saíam desiguais (56 s contra 90 s).
// O sequenciador do CI (vitest.sequenciador.ts) usa esses tempos para equilibrar as fatias.
// Uso: pnpm --filter @betinhos/shell tempos:testes (roda a suíte e atualiza o arquivo). Atualize quando uma fatia do CI
// passar a demorar bem mais que as outras; arquivo novo sem tempo entra com a mediana do mesmo tipo.
import { writeFileSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))

export default class TemposDosTestes {
  tempos = {}

  onTestModuleEnd(modulo) {
    const d = modulo.diagnostic()
    const total = d.environmentSetupDuration + d.prepareDuration + d.collectDuration + d.setupDuration + d.duration
    this.tempos[relative(raiz, modulo.moduleId).split('\\').join('/')] = Math.max(1, Math.round(total))
  }

  onTestRunEnd() {
    const ordenado = Object.fromEntries(Object.entries(this.tempos).sort(([a], [b]) => (a < b ? -1 : 1)))
    writeFileSync(new URL('../tempos-testes.json', import.meta.url), `${JSON.stringify(ordenado, null, 1)}\n`)
    console.log(`tempos-testes.json: ${Object.keys(ordenado).length} arquivos`)
  }
}
