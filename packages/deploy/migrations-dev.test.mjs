import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIGRATION, lerSubstituidas, listarMigrations, migrationsForcadas, migrationsPendentes, semSubstituidas } from './migrations-dev.mjs'

const aqui = fileURLToPath(new URL('.', import.meta.url))
const P = 'packages/deploy/migrations/'
const existentes = ['20261110-1600-postos-aceita-ctf.ps1', '20261111-0900-b.ps1', '20261109-2300-a.ps1']

test('tag ausente (sem base): todas, em ordem', () => assert.deepEqual(migrationsPendentes(null, existentes), [...existentes].sort()))
test('nada mudou em migrations: nada pendente', () => {
  assert.deepEqual(migrationsPendentes(['', 'apps/shell/src/x.ts', `${P}README.md`, `${P}remocoes.json`], existentes), [])
})
test('pendentes saem em ordem de nome, não na ordem do diff', () => {
  assert.deepEqual(migrationsPendentes([`${P}20261111-0900-b.ps1`, `${P}20261109-2300-a.ps1`, `${P}20261110-1600-postos-aceita-ctf.ps1`], existentes), [
    '20261109-2300-a.ps1', '20261110-1600-postos-aceita-ctf.ps1', '20261111-0900-b.ps1',
  ])
})
test('_dv.ps1, README, subpastas, nome fora do padrão e arquivo que não existe mais são ignorados', () => {
  assert.deepEqual(migrationsPendentes([`${P}_dv.ps1`, `${P}README.md`, `${P}sub/20261111-0900-b.ps1`, `${P}solta.ps1`, `${P}20261112-1000-apagada.ps1`], existentes), [])
})
test('forçar: nome com ou sem .ps1, todas e desconhecida', () => {
  assert.deepEqual(migrationsForcadas('20261111-0900-b, 20261109-2300-a.ps1', existentes), ['20261109-2300-a.ps1', '20261111-0900-b.ps1'])
  assert.deepEqual(migrationsForcadas('todas', existentes), ['20261109-2300-a.ps1', '20261110-1600-postos-aceita-ctf.ps1', '20261111-0900-b.ps1'])
  assert.deepEqual(migrationsForcadas('', existentes), [])
  assert.throws(() => migrationsForcadas('nao-existe', existentes), /desconhecida/)
})

test('toda migration do repositório tem nome válido, BOM, -Apply, dot-source do helper e host do DEV', () => {
  const dir = join(aqui, 'migrations')
  const ps1 = readdirSync(dir).filter((f) => f.endsWith('.ps1') && f !== '_dv.ps1')
  assert.deepEqual(ps1, listarMigrations(dir))
  for (const f of ps1) {
    assert.match(f, MIGRATION)
    const fonte = readFileSync(join(dir, f), 'utf8')
    assert.equal(fonte.charCodeAt(0), 0xfeff, `${f}: BOM`)
    assert.match(fonte, /\[switch\] \$Apply/, f)
    assert.match(fonte, /\. "\$PSScriptRoot\\_dv\.ps1"/, f)
    assert.match(fonte, /org23b93544\.crm2\.dynamics\.com/, f)
  }
  assert.equal(readFileSync(join(dir, '_dv.ps1'), 'utf8').charCodeAt(0), 0xfeff, '_dv.ps1: BOM')
})

test('substituída sai da lista; a substituta continua', () => {
  const substituidas = new Set(['20261110-1600-postos-aceita-ctf.ps1'])
  assert.deepEqual(semSubstituidas([...existentes].sort(), substituidas), ['20261109-2300-a.ps1', '20261111-0900-b.ps1'])
})
test('a 1800 da prova de mídia está substituída e a 1900 continua aplicável', () => {
  const dir = join(aqui, 'migrations')
  const aplicaveis = semSubstituidas(listarMigrations(dir), lerSubstituidas(dir))
  assert.ok(!aplicaveis.includes('20261116-1800-prova-midia-galeria.ps1'))
  assert.ok(aplicaveis.includes('20261116-1900-prova-midia-galeria-forms.ps1'))
})
