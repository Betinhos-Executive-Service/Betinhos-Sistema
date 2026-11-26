import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { ANTES, DEPOIS, SO_CANCELADO, estado, transformar } from './patch-flow-tenaris-cancelado.mjs'
import { transformar as transformarLote, problemasDeReferencia } from './patch-flow-tenaris-lote.mjs'

// Fixture sanitizada do patch do lote (formato antigo, Upsert_Geral resumido) com a expressão do status de DEV e PROD
// (conferida em 26/11/2026); o patch do lote move o Upsert_Geral para Scope_Servico.
const fixture = () => {
  const cd = JSON.parse(readFileSync(new URL('./patch-flow-tenaris-lote.fixture.json', import.meta.url), 'utf8'))
  const lote = cd.properties.definition.actions.Scope.actions.Condition_linhas_mais_que_0.actions
  lote.Loop_Servicos.actions.Upsert_Geral.inputs.parameters['item/cr40f_status'] = ANTES
  return cd
}
const status = (cd) => JSON.stringify(cd).includes(JSON.stringify(DEPOIS).slice(1, -1))

for (const [nome, cd] of [['flow antigo', fixture()], ['flow com o patch do lote', transformarLote(fixture()).clientdata]]) {
  test(`${nome}: troca só a expressão do status e é idempotente`, () => {
    assert.equal(estado(cd), 'original')
    const { clientdata, mudou } = transformar(cd)
    assert.equal(mudou, true)
    assert.equal(estado(clientdata), 'final')
    assert.ok(status(clientdata))
    assert.deepEqual(problemasDeReferencia(clientdata.properties.definition), [])
    const antes = JSON.stringify(cd).replace(JSON.stringify(ANTES).slice(1, -1), '')
    const depois = JSON.stringify(clientdata).replace(JSON.stringify(DEPOIS).slice(1, -1), '')
    assert.equal(depois, antes)
    assert.equal(transformar(clientdata).mudou, false)
    assert.equal(estado(cd), 'original') // não altera o original
  })
}

test('primeira versão (só Cancelado) é atualizada para a final', () => {
  const cd = fixture()
  cd.properties.definition.actions.Scope.actions.Condition_linhas_mais_que_0.actions.Loop_Servicos.actions.Upsert_Geral.inputs.parameters['item/cr40f_status'] = SO_CANCELADO
  assert.equal(estado(cd), 'so-cancelado')
  const { clientdata, mudou } = transformar(cd)
  assert.equal(mudou, true)
  assert.equal(estado(clientdata), 'final')
})

test('expressão nova: Cancelado e Requer Análise passam, o resto respeita a proteção', () => {
  assert.ok(DEPOIS.startsWith("@if(and(contains(coalesce(first(body('List_rows_Geral')?['value'])?['new_camposprotegidos'],''),'cr40f_status'),"))
  assert.ok(DEPOIS.includes("not(equals(coalesce(outputs('Compose_Status'),''),'202410002'))"))
  assert.ok(DEPOIS.includes("not(equals(coalesce(outputs('Compose_Status'),''),'100000001'))"))
  assert.ok(DEPOIS.endsWith(",first(body('List_rows_Geral')?['value'])?['cr40f_status'],outputs('Compose_Status'))"))
  assert.ok(!DEPOIS.includes('202410010'), 'Cancelado com ressalvas continua protegido')
})

test('Upsert_Geral fora do formato recusa sem alterar', () => {
  const cd = fixture()
  cd.properties.definition.actions.Scope.actions.Condition_linhas_mais_que_0.actions.Loop_Servicos.actions.Upsert_Geral.inputs.parameters['item/cr40f_status'] = "@outputs('Compose_Status')"
  assert.throws(() => transformar(cd), /fora do formato esperado/)
})
