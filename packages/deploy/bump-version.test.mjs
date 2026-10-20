import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextVersion } from './bump-version.mjs'

test('sem versão publicada, sobe o patch do repo', () => assert.equal(nextVersion('0.0.54'), '0.0.55'))
test('publicada maior (CI) vence o repo atrasado', () => assert.equal(nextVersion('0.0.54', 'v0.0.56'), '0.0.57'))
test('repo à frente da publicada usa o repo', () => assert.equal(nextVersion('0.0.60', '0.0.56'), '0.0.61'))
test('minor publicado maior vence', () => assert.equal(nextVersion('0.0.90', '0.1.2'), '0.1.3'))
test('versão inválida falha', () => {
  assert.throws(() => nextVersion('x'))
  assert.throws(() => nextVersion('0.0.1', 'lixo'))
})
