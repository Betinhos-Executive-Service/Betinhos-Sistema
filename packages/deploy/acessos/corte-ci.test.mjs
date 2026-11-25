import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checarPassageiro } from './corte-ci.mjs'

const NOVA = 'A\tpackages/deploy/migrations/20261201-0900-acessos-passageiro.ps1'

test('migration do passageiro nova sem o corte do PROD reprova', () => {
  assert.equal(checarPassageiro([NOVA], { modoProd: 'esperar', tagProd: false }).length, 1)
  assert.equal(checarPassageiro([NOVA], { modoProd: 'cortar', tagProd: false }).length, 1)
  assert.equal(checarPassageiro([NOVA], { modoProd: 'desfazer', tagProd: true }).length, 1)
  assert.match(checarPassageiro([NOVA], { modoProd: 'esperar', tagProd: false })[0], /só entra depois do corte do PROD/)
})

test('com o PROD cortado passa; sem migration do passageiro não olha nada', () => {
  assert.deepEqual(checarPassageiro([NOVA, ''], { modoProd: 'cortar', tagProd: true }), [])
  assert.deepEqual(checarPassageiro(['M\tpackages/deploy/acessos/corte.json', 'A\tpackages/deploy/migrations/20261201-0900-outra.ps1'], { modoProd: 'esperar', tagProd: false }), [])
  assert.equal(checarPassageiro(['R100\tpackages/deploy/migrations/x.ps1\tpackages/deploy/migrations/20261201-0900-acessos-passageiro.ps1'], { modoProd: 'esperar', tagProd: false }).length, 1)
})
