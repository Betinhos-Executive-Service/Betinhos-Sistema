import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INFORMATIVO, PERDA, compararFotos, temPerda } from './comparar-fotos.mjs'

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
test('fluxo desligado é perda', () => assert.equal(temPerda(compararFotos(foto(), foto({ fluxos: { f1: { nome: 'Fluxo 1', estado: 0 } } }))), true))
test('fluxo ligado pelo import não é perda', () => {
  const d = compararFotos(foto({ fluxos: { f1: { nome: 'Fluxo 1', estado: 0 } } }), foto())
  assert.deepEqual(d.fluxosMudaramEstado, [{ id: 'f1', nome: 'Fluxo 1', antes: 0, depois: 1 }])
  assert.equal(temPerda(d), false)
})
test('step sem configuração segura é perda', () => {
  const d = compararFotos(foto(), foto({ steps: { s1: { nome: 'Step 1', estado: 0, seguro: false } } }))
  assert.deepEqual(d.stepsPerderamSeguro, [{ id: 's1', nome: 'Step 1' }])
  assert.equal(temPerda(d), true)
})
test('step desativado é perda', () => {
  const d = compararFotos(foto(), foto({ steps: { s1: { nome: 'Step 1', estado: 1, seguro: true } } }))
  assert.deepEqual(d.stepsDesativados, [{ id: 's1', nome: 'Step 1', antes: 0, depois: 1 }])
  assert.equal(temPerda(d), true)
})
test('step habilitado não é perda', () => {
  const d = compararFotos(foto({ steps: { s1: { nome: 'Step 1', estado: 1, seguro: true } } }), foto())
  assert.deepEqual(d.stepsMudaramEstado, [{ id: 's1', nome: 'Step 1', antes: 1, depois: 0 }])
  assert.equal(temPerda(d), false)
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

test('item de versão que só existe depois aparece em versoes', () => {
  const d = compararFotos(foto(), foto({ versoes: { sistemaBetinhos: 'v0.0.43', telaOperacional: 'v0.0.9' } }))
  assert.deepEqual(d.versoes, [{ item: 'telaOperacional', antes: undefined, depois: 'v0.0.9' }])
})
test('nenhuma lista é de perda e informativa ao mesmo tempo', () => {
  assert.equal(new Set([...PERDA, ...INFORMATIVO]).size, PERDA.length + INFORMATIVO.length)
})

// Um cenário por lista de perda: só ela fica não vazia e, sozinha, já torna temPerda verdadeiro.
const travadoAntes = { fluxos: { f1: { nome: 'Fluxo 1', estado: 0, categoria: 5 } }, steps: { s1: { nome: 'Step 1', estado: 1, seguro: true } } }
const cenarios = {
  registrosCairam: [foto(), foto({ registros: { cr40f_a: 9, cr40f_b: 5 } })],
  tabelasSumiram: [foto(), foto({ registros: { cr40f_a: 10 } })],
  fluxosSumiram: [foto(), foto({ fluxos: {} })],
  fluxosDesligados: [foto(), foto({ fluxos: { f1: { nome: 'Fluxo 1', estado: 0 } } })],
  stepsSumiram: [foto(), foto({ steps: {} })],
  stepsDesativados: [foto(), foto({ steps: { s1: { nome: 'Step 1', estado: 1, seguro: true } } })],
  stepsPerderamSeguro: [foto(), foto({ steps: { s1: { nome: 'Step 1', estado: 0, seguro: false } } })],
  variaveisSumiram: [foto(), foto({ variaveis: {} })],
  variaveisMudaram: [foto(), foto({ variaveis: { new_X: 'h2' } })],
  componentesSumiram: [foto(), foto({ componentes: {} })],
  fluxosLigadosNoTravado: [foto(travadoAntes), foto({ ...travadoAntes, fluxos: { f1: { nome: 'Fluxo 1', estado: 1, categoria: 5 } } }), { travado: true }],
  stepsHabilitadosNoTravado: [foto(travadoAntes), foto({ ...travadoAntes, steps: { ...travadoAntes.steps, s2: { nome: 'Step novo', estado: 0, seguro: false } } }), { travado: true }],
}
test('toda lista de perda tem cenário', () => assert.deepEqual(Object.keys(cenarios).sort(), [...PERDA].sort()))
for (const lista of PERDA) {
  test(`só ${lista} já é perda`, () => {
    const [antes, depois, opcoes] = cenarios[lista]
    const d = compararFotos(antes, depois, opcoes)
    assert.ok(d[lista].length > 0, `${lista} vazia`)
    assert.deepEqual(PERDA.filter((outra) => outra !== lista && d[outra].length), [])
    assert.equal(temPerda(d), true)
  })
}

test('sem --travado, fluxo e step ligados pelo import não são perda', () => {
  const [antes, depois] = cenarios.fluxosLigadosNoTravado
  assert.equal(temPerda(compararFotos(antes, depois)), false)
  const [antesS, depoisS] = cenarios.stepsHabilitadosNoTravado
  assert.equal(temPerda(compararFotos(antesS, depoisS)), false)
})
test('travado: fluxo novo que chega ligado é perda', () => {
  const d = compararFotos(foto(travadoAntes), foto({ ...travadoAntes, fluxos: { ...travadoAntes.fluxos, f2: { nome: 'Fluxo novo', estado: 1, categoria: 5 } } }), { travado: true })
  assert.deepEqual(d.fluxosLigadosNoTravado, [{ id: 'f2', nome: 'Fluxo novo', categoria: 5, antes: null }])
})
test('travado: fluxo que já estava ligado antes não é acusado de novo', () => {
  const d = compararFotos(foto(), foto(), { travado: true })
  assert.deepEqual(d.fluxosLigadosNoTravado, [])
})
test('travado: regra de negócio e BPF novos ligados não são perda', () => {
  const d = compararFotos(foto(travadoAntes), foto({ ...travadoAntes, fluxos: { ...travadoAntes.fluxos, r: { nome: 'Regra', estado: 1, categoria: 2 }, b: { nome: 'BPF', estado: 1, categoria: 4 } } }), { travado: true })
  assert.deepEqual(d.fluxosLigadosNoTravado, [])
})
test('travado: fluxo ligado sem categoria na foto é perda', () => {
  const d = compararFotos(foto(travadoAntes), foto({ ...travadoAntes, fluxos: { f1: { nome: 'Fluxo 1', estado: 1 } } }), { travado: true })
  assert.deepEqual(d.fluxosLigadosNoTravado, [{ id: 'f1', nome: 'Fluxo 1', categoria: null, antes: 0 }])
})
test('travado: step que já estava habilitado antes não é acusado', () => {
  const d = compararFotos(foto(), foto(), { travado: true })
  assert.deepEqual(d.stepsHabilitadosNoTravado, [])
})
test('travado: step desabilitado que volta habilitado é perda', () => {
  const d = compararFotos(foto(travadoAntes), foto({ ...travadoAntes, steps: { s1: { nome: 'Step 1', estado: 0, seguro: true } } }), { travado: true })
  assert.deepEqual(d.stepsHabilitadosNoTravado, [{ id: 's1', nome: 'Step 1', antes: 1 }])
})
