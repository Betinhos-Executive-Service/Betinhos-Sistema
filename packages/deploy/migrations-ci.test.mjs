import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checarMudancas, checarRemocoes, checarSubstituidas } from './migrations-ci.mjs'

const P = 'packages/deploy/migrations/'
const D = 'packages/deploy/'

test('migration nova (A) passa; helper, README e remocoes.json podem mudar', () => {
  assert.deepEqual(checarMudancas([`A\t${P}20261112-1000-x.ps1`, `M\t${P}_dv.ps1`, `M\t${P}README.md`, `M\t${P}remocoes.json`]), [])
})
test('editar migration que já existe reprova', () => assert.equal(checarMudancas([`M\t${P}20261110-1600-x.ps1`]).length, 1))
test('apagar migration que já existe reprova', () => assert.equal(checarMudancas([`D\t${P}20261110-1600-x.ps1`]).length, 1))
test('renomear migration que já existe reprova', () => assert.equal(checarMudancas([`R090\t${P}20261110-1600-x.ps1\t${P}20261110-1700-x.ps1`]).length, 1))
test('migration nova com nome fora do padrão reprova', () => assert.equal(checarMudancas([`A\t${P}001-coluna.ps1`]).length, 1))
test('provision-* novo reprova; provision-flow-* novo passa; editar provision-* antigo passa', () => {
  assert.equal(checarMudancas([`A\t${D}provision-tabela-nova.ps1`]).length, 1)
  assert.deepEqual(checarMudancas([`A\t${D}provision-flow-novo.ps1`, `M\t${D}provision-documentos.ps1`, `R100\t${D}provision-a.ps1\t${D}provision-b.ps1`]), [])
  assert.equal(checarMudancas([`R100\t${D}x.ps1\t${D}provision-b.ps1`]).length, 1)
})

function dirCom(arquivos, remocoes) {
  const dir = mkdtempSync(join(tmpdir(), 'migr-'))
  writeFileSync(join(dir, 'remocoes.json'), JSON.stringify(remocoes))
  for (const [nome, texto] of Object.entries(arquivos)) writeFileSync(join(dir, nome), texto)
  return dir
}
test('remocoes: cabeçalho e remocoes.json andam juntos', () => {
  const ok = { alvo: 'cr40f_x.coluna', migration: 'm.ps1', decisao: 'Renan, 10/11/2026' }
  assert.deepEqual(checarRemocoes(dirCom({ 'm.ps1': '# destrutiva: cr40f_x.coluna - sem uso\n' }, [ok])), [])
  assert.equal(checarRemocoes(dirCom({ 'm.ps1': '# destrutiva: cr40f_x.coluna - sem uso\n' }, [])).length, 1)
  assert.equal(checarRemocoes(dirCom({ 'm.ps1': '# nada\n' }, [ok])).length, 1)
  assert.equal(checarRemocoes(dirCom({}, [ok])).length, 1)
  assert.equal(checarRemocoes(dirCom({ 'm.ps1': '# destrutiva: cr40f_x.coluna - sem uso\n' }, [{ ...ok, decisao: '' }])).length, 1)
})
test('o remocoes.json do repositório é coerente com as migrations', () => {
  assert.deepEqual(checarRemocoes(fileURLToPath(new URL('./migrations', import.meta.url))), [])
})

function dirSubst(arquivos, lista) {
  const dir = mkdtempSync(join(tmpdir(), 'migr-'))
  writeFileSync(join(dir, 'substituidas.json'), JSON.stringify(lista))
  for (const nome of arquivos) writeFileSync(join(dir, nome), '')
  return dir
}
test('substituidas: migration e substituta existem, substituta vem depois e tem motivo', () => {
  const ok = { migration: '20261116-1800-a.ps1', por: '20261116-1900-a.ps1', motivo: 'falhou no DEV' }
  const ambas = ['20261116-1800-a.ps1', '20261116-1900-a.ps1']
  assert.deepEqual(checarSubstituidas(dirSubst(ambas, [ok])), [])
  assert.equal(checarSubstituidas(dirSubst(['20261116-1800-a.ps1'], [ok])).length, 1)
  assert.equal(checarSubstituidas(dirSubst(ambas, [{ ...ok, motivo: '' }])).length, 1)
  assert.equal(checarSubstituidas(dirSubst(ambas, [{ ...ok, migration: ok.por, por: ok.migration }])).length, 1)
})
test('o substituidas.json do repositório é coerente com as migrations', () => {
  assert.deepEqual(checarSubstituidas(fileURLToPath(new URL('./migrations', import.meta.url))), [])
})
