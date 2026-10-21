import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const solucoes = dirname(fileURLToPath(import.meta.url))

const foto = (registros) => ({
  ambiente: 'x', quando: 't', aproximados: [], registros,
  fluxos: {}, steps: {}, variaveis: {}, componentes: {}, versoes: {},
})

// Remove só o link, sem recursão: se ele não sair, a limpeza para antes de tocar no alvo.
function removerLink(link) {
  try { unlinkSync(link) } catch {
    try { rmdirSync(link) } catch (e) { if (e.code !== 'ENOENT') throw e }
  }
}

// Roda a CLI por um junction apontando para a pasta solucoes, como o PowerShell faria em outro caminho.
function rodarPeloJunction(registrosAntes, registrosDepois) {
  const tmp = mkdtempSync(join(tmpdir(), 'cli-solucoes-'))
  const link = join(tmp, 'link-solucoes')
  let resultado
  try {
    symlinkSync(solucoes, link, 'junction')
    const antes = join(tmp, 'antes.json')
    const depois = join(tmp, 'depois.json')
    writeFileSync(antes, JSON.stringify(foto(registrosAntes)))
    writeFileSync(depois, JSON.stringify(foto(registrosDepois)))
    resultado = spawnSync(process.execPath, [join(link, 'comparar-fotos.mjs'), antes, depois], { encoding: 'utf8' })
  } finally {
    removerLink(link)
    rmSync(tmp, { recursive: true, force: true })
  }
  assert.ok(existsSync(join(solucoes, 'comparar-fotos.mjs')), 'a limpeza não pode apagar a pasta alvo')
  return resultado
}

test('CLI chamada por junction com perda sai com código 1', () => {
  const r = rodarPeloJunction({ cr40f_a: 10 }, { cr40f_a: 9 })
  assert.equal(r.status, 1, r.stderr)
  assert.match(r.stdout, /registrosCairam/)
})

test('CLI chamada por junction sem perda sai com código 0', () => {
  const r = rodarPeloJunction({ cr40f_a: 10 }, { cr40f_a: 10 })
  assert.equal(r.status, 0, r.stderr)
})
