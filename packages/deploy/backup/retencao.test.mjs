import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aExcluir, classes, nomeArquivo } from './retencao.mjs'

test('nome usa o horário de Brasília', () => {
  // 06:23 UTC = 03:23 em Brasília (sem horário de verão).
  assert.equal(nomeArquivo(new Date('2026-11-18T06:23:00Z')), 'betinhos-prod-20261118-0323.tar.enc')
  // 01:00 UTC do dia 2 ainda é dia 1 em Brasília.
  assert.equal(nomeArquivo(new Date('2026-12-02T01:00:00Z')), 'betinhos-prod-20261201-2200.tar.enc')
})

test('classes: diário sempre, semanal no domingo, mensal no dia 1', () => {
  assert.deepEqual(classes(new Date('2026-11-18T06:23:00Z')), ['diario']) // quarta
  assert.deepEqual(classes(new Date('2026-11-22T06:23:00Z')), ['diario', 'semanal']) // domingo
  assert.deepEqual(classes(new Date('2026-12-01T06:23:00Z')), ['diario', 'mensal'])
  assert.deepEqual(classes(new Date('2026-11-01T06:23:00Z')), ['diario', 'semanal', 'mensal']) // domingo e dia 1
  // 02:00 UTC de segunda ainda é domingo em Brasília.
  assert.deepEqual(classes(new Date('2026-11-23T02:00:00Z')), ['diario', 'semanal'])
})

test('excluir mantém as mais novas de cada pasta', () => {
  const diarias = Array.from({ length: 10 }, (_, i) => `diario/betinhos-prod-202611${String(10 + i).padStart(2, '0')}-0323.tar.enc`)
  const semanais = ['semanal/betinhos-prod-20261101-0323.tar.enc', 'semanal/betinhos-prod-20261108-0323.tar.enc']
  const excluir = aExcluir([...diarias, ...semanais])
  assert.deepEqual(excluir, diarias.slice(0, 3))
})

test('excluir ignora chaves fora do padrão e respeita limites dados', () => {
  const chaves = [
    'diario/betinhos-prod-20261101-0323.tar.enc',
    'diario/betinhos-prod-20261102-0323.tar.enc',
    'diario/manual.tar.enc',
    'outro/betinhos-prod-20261101-0323.tar.enc',
  ]
  assert.deepEqual(aExcluir(chaves, { diario: 1 }), ['diario/betinhos-prod-20261101-0323.tar.enc'])
  assert.deepEqual(aExcluir(chaves, { diario: 0 }), [])
})

test('poucas cópias: nada a apagar', () => {
  assert.deepEqual(aExcluir(['mensal/betinhos-prod-20261101-0323.tar.enc']), [])
  assert.deepEqual(aExcluir([]), [])
})
