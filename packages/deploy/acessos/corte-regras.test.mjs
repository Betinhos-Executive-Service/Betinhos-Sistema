import assert from 'node:assert/strict'
import { test } from 'node:test'
import { desde, lerCorte, lerIds } from './corte-regras.mjs'

test('corte.json: lê o modo de cada ambiente', () => {
  const texto = '﻿{ "dev": "cortar", "prod": "esperar" }'
  assert.equal(lerCorte(texto, 'dev'), 'cortar')
  assert.equal(lerCorte(texto, 'prod'), 'esperar')
})

test('corte.json: recusa modo, chave, ambiente e JSON inválidos', () => {
  assert.throws(() => lerCorte('{ "dev": "ligar", "prod": "esperar" }', 'dev'), /dev precisa ser/)
  assert.throws(() => lerCorte('{ "dev": "esperar", "prod": "esperar", "test": "cortar" }', 'dev'), /chave desconhecida test/)
  assert.throws(() => lerCorte('{ "dev": "esperar", "prod": "esperar" }', 'test'), /ambiente desconhecido/)
  assert.throws(() => lerCorte('{ dev: esperar }', 'dev'), /não é JSON válido/)
  assert.throws(() => lerCorte('{ "dev": "esperar" }', 'prod'), /prod precisa ser/)
})

test('o corte.json versionado começa esperando nos dois ambientes', async () => {
  const { readFileSync } = await import('node:fs')
  const texto = readFileSync(new URL('./corte.json', import.meta.url), 'utf8')
  assert.equal(lerCorte(texto, 'dev'), 'esperar')
  assert.equal(lerCorte(texto, 'prod'), 'esperar')
})

test('ids da variável: vírgulas, espaços, maiúsculas e repetidos', () => {
  assert.deepEqual(lerIds(''), [])
  assert.deepEqual(lerIds(undefined), [])
  assert.deepEqual(
    lerIds(' 00000000-0000-0000-0000-0000000000AA , 00000000-0000-0000-0000-0000000000aa,00000000-0000-0000-0000-0000000000bb '),
    ['00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000bb'],
  )
  assert.throws(() => lerIds('00000000-0000-0000-0000-0000000000aa, fulano'), /1 id\(s\) fora do formato GUID/)
})

test('janela de 90 dias começa à 00:00 UTC', () => {
  assert.equal(desde(new Date('2026-11-24T15:00:00Z')), '2026-08-26T00:00:00Z')
  assert.equal(desde(new Date('2026-11-24T02:00:00Z'), 1), '2026-11-23T00:00:00Z')
})
