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

// CLI direta, com arquivos temporários: o JSON escrito aqui é o que o PowerShell gravaria.
function rodarCli(script, argumentos, arquivos) {
  const tmp = mkdtempSync(join(tmpdir(), 'cli-solucoes-'))
  try {
    const caminhos = Object.fromEntries(Object.entries(arquivos).map(([nome, conteudo]) => {
      const caminho = join(tmp, nome)
      writeFileSync(caminho, JSON.stringify(conteudo))
      return [nome, caminho]
    }))
    return spawnSync(process.execPath, [join(solucoes, script), ...argumentos.map((a) => caminhos[a] ?? a)], { encoding: 'utf8' })
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

test('comparar-fotos --travado: fluxo ligado pelo import sai com código 1; sem a opção, 0', () => {
  const antes = { ...foto({}), fluxos: { f: { nome: 'F', estado: 0, categoria: 5 } } }
  const depois = { ...foto({}), fluxos: { f: { nome: 'F', estado: 1, categoria: 5 } } }
  const travado = rodarCli('comparar-fotos.mjs', ['--travado', 'a.json', 'b.json'], { 'a.json': antes, 'b.json': depois })
  assert.equal(travado.status, 1, travado.stderr)
  assert.match(travado.stdout, /"fluxosLigadosNoTravado": \[\s*\{/)
  const livre = rodarCli('comparar-fotos.mjs', ['a.json', 'b.json'], { 'a.json': antes, 'b.json': depois })
  assert.equal(livre.status, 0, livre.stderr)
})

test('comparar-fotos --aceitar-tabelas: tabela com registros que some sai com 0 só quando aceita', () => {
  const antes = foto({ cr40f_a: 3, cr40f_b: 1 })
  const depois = foto({ cr40f_a: 3 })
  const aceita = rodarCli('comparar-fotos.mjs', ['--aceitar-tabelas', 'cr40f_b', 'a.json', 'b.json'], { 'a.json': antes, 'b.json': depois })
  assert.equal(aceita.status, 0, aceita.stderr)
  assert.match(aceita.stdout, /"tabelasAceitasSumiram": \[\s*\{/)
  const recusa = rodarCli('comparar-fotos.mjs', ['a.json', 'b.json'], { 'a.json': antes, 'b.json': depois })
  assert.equal(recusa.status, 1, recusa.stderr)
})
test('comparar-fotos sem as duas fotos falha', () => {
  const r = rodarCli('comparar-fotos.mjs', ['--travado', 'a.json'], { 'a.json': foto({}) })
  assert.notEqual(r.status, 0)
})

test('conferir-retirada: componente só na AppBetinhos sai com 1; tudo nas 4 sai com 0', () => {
  const ruim = rodarCli('conferir-retirada.mjs', ['f.json'], { 'f.json': { componentes: { v: ['AppBetinhos'] }, tipos: { v: 381 }, pacotes: {} } })
  assert.equal(ruim.status, 1, ruim.stderr)
  assert.match(ruim.stdout, /"soNaCaixa"/)
  const bom = rodarCli('conferir-retirada.mjs', ['f.json'], { 'f.json': { componentes: { t: ['AppBetinhos', 'BetinhosCore'] }, tipos: { t: 1 }, pacotes: {} } })
  assert.equal(bom.status, 0, bom.stderr)
})

test('conferir-retirada --dev: só na caixa e ausente do DEV sai com 0; --aceitar-tabelas libera tabela com registros', () => {
  const alvo = { componentes: { v: ['AppBetinhos'], tb: ['AppBetinhos'] }, tipos: { v: 381, tb: 1 }, pacotes: {}, nomes: { tb: 'cr40f_x' }, registros: { cr40f_x: 2 } }
  const dev = { componentes: { outro: ['BetinhosCore'] } }
  const bloqueia = rodarCli('conferir-retirada.mjs', ['f.json', '--dev', 'd.json'], { 'f.json': alvo, 'd.json': dev })
  assert.equal(bloqueia.status, 1, bloqueia.stderr)
  assert.match(bloqueia.stdout, /"tabelasComDadosNaCaixa": \[\s*\{/)
  const passa = rodarCli('conferir-retirada.mjs', ['f.json', '--dev', 'd.json', '--aceitar-tabelas', 'cr40f_x'], { 'f.json': alvo, 'd.json': dev })
  assert.equal(passa.status, 0, passa.stderr)
})

test('conferir-retirada: foto vazia não passa', () => {
  const r = rodarCli('conferir-retirada.mjs', ['f.json'], { 'f.json': { componentes: {}, tipos: {}, pacotes: {} } })
  assert.notEqual(r.status, 0)
})
