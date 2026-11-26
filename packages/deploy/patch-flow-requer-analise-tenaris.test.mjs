import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { FILTRO_DEPOIS, MENSAGEM, MENSAGEM_TENARIS, TITULO, estado, transformar } from './patch-flow-requer-analise-tenaris.mjs'
import { problemasDeReferencia } from './patch-flow-tenaris-lote.mjs'

// Clientdata do DEV em 26/11/2026 (igual ao do PROD), com os e-mails trocados por gestao@example.com.
const fixture = () => JSON.parse(readFileSync(new URL('./patch-flow-requer-analise-tenaris.fixture.json', import.meta.url), 'utf8'))
const partes = (cd) => {
  const d = cd.properties.definition
  const cond = d.actions.Scope.actions['Condition_é_pra_rodar']
  return { d, gatilho: d.triggers['When_a_row_is_added,_modified_or_deleted'].inputs.parameters, cond, loop: cond.actions['For_each_funcionários_Notifcação_Operacional'].actions }
}

test('transforma o original, é idempotente e não altera a entrada', () => {
  const cd = fixture()
  assert.equal(estado(cd), 'original')
  const { clientdata, mudou } = transformar(cd)
  assert.equal(mudou, true)
  assert.equal(estado(clientdata), 'final')
  assert.equal(transformar(clientdata).mudou, false)
  assert.equal(estado(cd), 'original')
  assert.deepEqual(problemasDeReferencia(clientdata.properties.definition), [])
})

test('gatilho também dispara pelo cancelamento do cliente', () => {
  const { gatilho } = partes(transformar(fixture()).clientdata)
  assert.equal(gatilho['subscriptionRequest/filteringattributes'], FILTRO_DEPOIS.atributos)
  assert.equal(gatilho['subscriptionRequest/filterexpression'], FILTRO_DEPOIS.expressao)
  assert.match(FILTRO_DEPOIS.expressao, /202410008 and cr40f_cancelamentocliente ne null/)
  assert.equal(gatilho['subscriptionRequest/entityname'], 'cr40f_reservadeveculos')
})

test('roda sem motorista só no cancelamento do cliente e não usa mais o GetItem', () => {
  const { cond } = partes(transformar(fixture()).clientdata)
  assert.equal(cond.expression.or.length, 2)
  assert.ok(JSON.stringify(cond.expression).includes("cr40f_cancelamentocliente"))
  assert.equal(cond.actions.Get_a_row_by_ID_Motoristas, undefined)
  assert.match(cond.actions.Listar_Motorista.inputs.parameters.$filter, /00000000-0000-0000-0000-000000000000/)
  assert.deepEqual(cond.actions['List_rows_funcionários_Notifcação_Operacional'].runAfter, { Compose_Mensagem_Tenaris: ['Succeeded'] })
})

test('push e notificação usam a mensagem e o título escolhidos pela coluna', () => {
  const { loop } = partes(transformar(fixture()).clientdata)
  assert.equal(loop.Send_push_notification_V2.inputs.parameters['payload/message'], MENSAGEM)
  assert.equal(loop.Add_a_new_row_Notificações_1.inputs.parameters['item/body'], MENSAGEM)
  assert.equal(loop.Add_a_new_row_Notificações_1.inputs.parameters['item/title'], TITULO)
  assert.ok(TITULO.includes("'Cancelado pela Tenaris'"))
  for (const trecho of ['A Tenaris cancelou o serviço', 'Estava: @{', "'Requer Análise'", "' (status mantido)'", "'sem motorista'", "' (avisado no App)'"])
    assert.ok(MENSAGEM_TENARIS.includes(trecho), trecho)
})

test('flow fora do formato recusa sem alterar', () => {
  const cd = fixture()
  partes(cd).gatilho['subscriptionRequest/filterexpression'] = 'cr40f_status eq 1'
  assert.throws(() => transformar(cd), /fora do formato/)
})
