import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./aniversariantes-diario.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)
const tryActions = flow.actions.Try.actions

test('agenda de segunda a sexta às 08:30 no horário de Brasília', () => {
  const recurrence = flow.triggers.Dias_uteis_8h30.recurrence
  assert.equal(recurrence.frequency, 'Week')
  assert.equal(recurrence.timeZone, 'E. South America Standard Time')
  assert.deepEqual(recurrence.schedule, { weekDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], hours: ['8'], minutes: [30] })
})

test('na sexta cobre sexta, sábado e domingo; nos outros dias só hoje', () => {
  assert.equal(tryActions.Quantidade_de_dias.inputs, "@if(equals(dayOfWeek(outputs('Hoje')), 5), 3, 1)")
  assert.equal(tryActions.Dias.inputs.from, "@range(0, outputs('Quantidade_de_dias'))")
})

test('busca só funcionários ativos ou afastados com data de aniversário', () => {
  const p = tryActions.Funcionarios.inputs.parameters
  assert.equal(p.entityName, '__SET_FUNCIONARIOS__')
  assert.equal(p.$filter, 'statecode eq 0 and cr40f_status ne 1 and cr40f_datadeaniversario ne null')
})

test('nascido em 29/02 entra no 28/02 de ano não bissexto', () => {
  assert.match(tryActions.Por_dia.actions.Do_dia.inputs.where, /'02-29'.*'02-28'.*'03-01'/)
})

test('envia um e-mail só quando há aniversariante, pela noreply, aos gestores', () => {
  const se = tryActions.Algum_aniversariante
  assert.deepEqual(se.runAfter, { Por_dia: ['Succeeded'] })
  const p = se.actions.E_mail.inputs.parameters
  assert.equal(p['emailMessage/From'], '__REMETENTE__')
  assert.equal(p['emailMessage/To'], '__DESTINATARIOS__')
})

test('Catch avisa o admin e marca a execução como falha', () => {
  assert.deepEqual(flow.actions.Catch.runAfter, { Try: ['Failed', 'TimedOut'] })
  assert.match(flow.actions.Catch.actions.Avisar_admin.inputs.parameters['emailMessage/To'], /new_EmailAdminAvisos/)
  assert.equal(flow.actions.Catch.actions.Marcar_falha.type, 'Terminate')
})

test('nenhum dado de ambiente no repo', () => {
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
