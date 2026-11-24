import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./multa-aviso-motorista.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)
const gatilho = flow.triggers.When_aviso_is_requested.inputs.parameters

test('dispara só na alteração da data do aviso automático, para multa de motorista', () => {
  assert.equal(gatilho['subscriptionRequest/entityname'], 'cr40f_multas')
  assert.equal(gatilho['subscriptionRequest/message'], 3)
  assert.equal(gatilho['subscriptionRequest/filteringattributes'], 'cr40f_avisoautomaticoem')
  assert.equal(gatilho['subscriptionRequest/filterexpression'], 'cr40f_responsavel eq 100000000 and cr40f_avisoautomaticoem ne null')
})

test('lê o motorista da multa e respeita a chave "multas" da configuração do App', () => {
  assert.equal(flow.actions.Get_driver.inputs.parameters.recordId, "@triggerOutputs()?['body/_cr40f_motorista_value']")
  assert.equal(flow.actions.Config_App.actions.Config_efetiva.inputs.parameters['item/Funcionario'], "@triggerOutputs()?['body/_cr40f_motorista_value']")
  assert.match(JSON.stringify(flow.actions.Config_App), /\['multas'\]/)
})

test('Web Push primeiro com o texto fixo, sem valor nem infração; o push do Power Apps só como reserva', () => {
  assert.match(raw, /Você tem uma multa para ver no app/)
  assert.doesNotMatch(raw, /valor|infra|termomulta|new_motorista/i)
  assert.doesNotMatch(raw, /sig=|connectionReferenceLogicalName|subscriptionRequest\/name/)
  const escopo = flow.actions.Has_email.actions
  assert.ok(escopo.Web_Push_Send_push)
  assert.deepEqual(escopo.Fallback_V2.expression, { equals: ["@variables('Web_Push_Entregue')", false] })
  const worker = escopo.Web_Push_Send_push.actions.Has_func_Send_push.actions.Has_subs_Send_push.actions.Worker_Send_push.inputs.parameters
  assert.equal(worker['body/payload/title'], 'Você tem uma multa para ver no app')
  assert.equal(worker['body/payload/url'], '/WebResources/new_app-motoristas-v2')
})

test('o script nasce com BOM, é dry run por padrão e fica fora do flows-dev.mjs', () => {
  const ps1 = readFileSync(new URL('../provision-flow-multa-aviso-motorista.ps1', import.meta.url), 'utf8')
  assert.equal(ps1.charCodeAt(0), 0xfeff)
  assert.ok(ps1.includes("Sync-FlowExistente $sessao 'Multa | Aviso ao motorista'"))
  assert.ok(ps1.includes("-FlowDeReferencias 'Termo de multa | Push ao motorista'"))
  assert.doesNotMatch(readFileSync(new URL('../flows-dev.mjs', import.meta.url), 'utf8'), /multa-aviso-motorista/)
})
