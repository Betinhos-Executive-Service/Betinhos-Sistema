import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./multa-aceite-push.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)
const lista = flow.actions.Aceites_pendentes.inputs.parameters
const cada = flow.actions.Aceite_cada

test('diário às 09:00 no horário de Brasília', () => {
  const r = flow.triggers.Todo_dia_9h.recurrence
  assert.equal(r.frequency, 'Day')
  assert.equal(r.timeZone, 'E. South America Standard Time')
  assert.deepEqual(r.schedule, { hours: ['9'], minutes: [0] })
})

test('lista só multas da etapa Indicar, canal Senatran, indicadas e sem aceite conferido nem declarado', () => {
  assert.equal(lista.entityName, 'cr40f_multases')
  assert.equal(lista.$filter, 'cr40f_status eq 202410004 and cr40f_canalindicacao eq 100000000 and cr40f_datadeindicacao ne null and cr40f_aceiteem eq null and cr40f_aceitedeclaradoem eq null')
})

test('chama new_LembrarAceiteMulta um por vez e só envia o push com new_Lembrou', () => {
  assert.equal(cada.runtimeConfiguration.concurrency.repetitions, 1)
  const api = cada.actions.Lembrar_aceite.inputs.parameters
  assert.equal(api.actionName, 'new_LembrarAceiteMulta')
  assert.equal(api['item/new_MultaId'], "@{items('Aceite_cada')?['cr40f_multasid']}")
  assert.deepEqual(cada.actions.Lembrou.expression, { equals: ["@outputs('Lembrar_aceite')?['body/new_Lembrou']", true] })
  assert.ok(cada.actions.Lembrou.actions.Has_email)
})

test('push com o texto fixo, sem valor nem infração, e sem sobra do gatilho do termo', () => {
  assert.match(raw, /Você tem uma multa para resolver no app/)
  assert.doesNotMatch(raw, /triggerOutputs|new_termomulta|valor|infra/i)
  assert.doesNotMatch(raw, /sig=|connectionReferenceLogicalName|subscriptionRequest\/name/)
})
