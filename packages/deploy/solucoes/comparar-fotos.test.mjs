import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compararFotos, temPerda } from './comparar-fotos.mjs'

const foto = (extra = {}) => ({
  ambiente: 'x', quando: 't', aproximados: [],
  registros: { cr40f_a: 10, cr40f_b: 5 },
  fluxos: { f1: { nome: 'Fluxo 1', estado: 1 } },
  steps: { s1: { nome: 'Step 1', estado: 0, seguro: true } },
  variaveis: { new_X: 'h1' },
  componentes: { c1: ['AppBetinhos'] },
  versoes: { sistemaBetinhos: 'v0.0.43' },
  ...extra,
})

test('fotos iguais não têm perda', () => assert.equal(temPerda(compararFotos(foto(), foto())), false))
test('registro a mais não é perda, mas aparece', () => {
  const d = compararFotos(foto(), foto({ registros: { cr40f_a: 11, cr40f_b: 5 } }))
  assert.deepEqual(d.registrosMudaram, [{ tabela: 'cr40f_a', antes: 10, depois: 11 }])
  assert.equal(temPerda(d), false)
})
test('registro a menos é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ registros: { cr40f_a: 9, cr40f_b: 5 } }))), true))
test('tabela que sumiu é perda', () => {
  const d = compararFotos(foto(), foto({ registros: { cr40f_a: 10 } }))
  assert.deepEqual(d.tabelasSumiram, ['cr40f_b'])
  assert.equal(temPerda(d), true)
})
test('contagem aproximada não acusa queda', () => {
  const d = compararFotos(foto({ aproximados: ['cr40f_a'] }), foto({ aproximados: ['cr40f_a'], registros: { cr40f_a: 9, cr40f_b: 5 } }))
  assert.deepEqual(d.registrosCairam, [])
})
test('fluxo desligado é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ fluxos: { f1: { nome: 'Fluxo 1', estado: 0 } } }))), true))
test('step sem configuração segura é perda', () => {
  const d = compararFotos(foto(), foto({ steps: { s1: { nome: 'Step 1', estado: 0, seguro: false } } }))
  assert.deepEqual(d.stepsPerderamSeguro, [{ id: 's1', nome: 'Step 1' }])
  assert.equal(temPerda(d), true)
})
test('variável com valor diferente é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ variaveis: { new_X: 'h2' } }))), true))
test('troca de dono não é perda, mas aparece', () => {
  const d = compararFotos(foto(), foto({ componentes: { c1: ['BetinhosCore'] } }))
  assert.deepEqual(d.donosMudaram, [{ id: 'c1', antes: ['AppBetinhos'], depois: ['BetinhosCore'] }])
  assert.equal(temPerda(d), false)
})
test('componente sem nenhum dono é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ componentes: {} }))), true))
test('ordem dos donos não importa', () => {
  const d = compararFotos(foto({ componentes: { c1: ['B', 'A'] } }), foto({ componentes: { c1: ['A', 'B'] } }))
  assert.deepEqual(d.donosMudaram, [])
})
