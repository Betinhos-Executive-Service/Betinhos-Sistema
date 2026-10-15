import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./documentos-resumo-semanal.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)

test('agenda toda segunda às 07:00 no horário de Brasília', () => {
  const recurrence = flow.triggers.Toda_segunda_7h.recurrence
  assert.equal(recurrence.frequency, 'Week')
  assert.equal(recurrence.interval, 1)
  assert.equal(recurrence.timeZone, 'E. South America Standard Time')
  assert.deepEqual(recurrence.schedule, { weekDays: ['Monday'], hours: ['7'], minutes: [0] })
})

test('chama a Custom API do resumo', () => {
  const resumo = flow.actions.Try.actions.Resumo
  assert.equal(resumo.inputs.host.operationId, 'PerformUnboundAction')
  assert.equal(resumo.inputs.parameters.actionName, 'cr40f_DocumentosResumoSemanal')
})

test('envia pela noreply só para destinatários com e-mail', () => {
  const enviar = flow.actions.Try.actions.Por_categoria.actions.Enviar
  const email = enviar.actions.Tem_email.actions.E_mail
  assert.equal(email.inputs.host.operationId, 'SendEmailV2')
  assert.equal(email.inputs.parameters['emailMessage/From'], '__REMETENTE__')
})

test('Catch roda só quando o Try falha, avisa o admin sem depender da noreply e marca a execução como falha', () => {
  assert.deepEqual(flow.actions.Catch.runAfter, { Try: ['Failed', 'TimedOut'] })
  const aviso = flow.actions.Catch.actions.Avisar_admin
  assert.equal(aviso.inputs.parameters['emailMessage/From'], undefined)
  assert.match(aviso.inputs.parameters['emailMessage/To'], /new_EmailAdminAvisos/)
  assert.equal(flow.actions.Catch.actions.Marcar_falha.type, 'Terminate')
})

test('tokens do script presentes e nenhum dado de ambiente no repo', () => {
  assert.ok(raw.includes('__SET_DESTINATARIOS__'))
  assert.ok(raw.includes('__REMETENTE__'))
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft/i)
})

test('toda ação citada em expressões existe', () => {
  const nomes = new Set()
  const percorrer = (acoes) => {
    for (const [nome, acao] of Object.entries(acoes ?? {})) {
      nomes.add(nome)
      percorrer(acao.actions)
      percorrer(acao.else?.actions)
    }
  }
  percorrer(flow.actions)
  for (const [, nome] of raw.matchAll(/(?:outputs|body|items|result)\('([^']+)'\)/g)) {
    assert.ok(nomes.has(nome), `ação inexistente: ${nome}`)
  }
})
