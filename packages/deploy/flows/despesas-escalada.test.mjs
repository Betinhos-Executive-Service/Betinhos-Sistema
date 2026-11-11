import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const flow = JSON.parse(readFileSync(new URL('./despesas-escalada.json', import.meta.url), 'utf8'))
const ps1 = readFileSync(new URL('../provision-flow-despesas-escalada.ps1', import.meta.url), 'utf8')
const { Limite, Paradas, Para_cada_parada: Para } = flow.actions.Try.actions

// Valores do design (docs/superpowers/specs/2026-11-10-despesa-devolucao-design.md).
const PRECISA_CORRIGIR = 100000001
const DIAS = 3

test('roda uma vez por dia às 07:30 de Brasília, sem execuções simultâneas', () => {
  const gatilho = flow.triggers.Todo_dia_7h30
  assert.equal(gatilho.recurrence.frequency, 'Day')
  assert.equal(gatilho.recurrence.timeZone, 'E. South America Standard Time')
  assert.deepEqual(gatilho.recurrence.schedule, { hours: ['7'], minutes: [30] })
  assert.equal(gatilho.runtimeConfiguration.concurrency.runs, 1)
})

test('o limite é agora menos 3 dias, em UTC como o modifiedon', () => {
  assert.equal(Limite.inputs, `@formatDateTime(addDays(utcNow(), -${DIAS}), 'yyyy-MM-ddTHH:mm:ssZ')`)
})

test('o filtro pega só Precisa corrigir, que ainda não espera o gestor, parada há mais de 3 dias', () => {
  const p = Paradas.inputs.parameters
  assert.equal(Paradas.inputs.host.operationId, 'ListRecords')
  assert.equal(p.$filter, `statecode eq 0 and cr40f_statusoperacional eq ${PRECISA_CORRIGIR} and (new_aguardandogestor eq false or new_aguardandogestor eq null) and createdon ge 2026-11-10T03:00:00Z and modifiedon lt @{outputs('Limite')}`)
  assert.equal(p.$select, 'cr40f_despesaoperacionalid')
  assert.equal(p.entityName, '__SET_DESPESA__')
})

test('a despesa mais antiga sai primeiro e o lote tem teto', () => {
  assert.equal(Paradas.inputs.parameters.$orderby, 'modifiedon asc')
  assert.equal(Paradas.inputs.parameters.$top, 500)
})

test('cada despesa parada só ganha new_aguardandogestor = Sim, sem mexer no status nem no motivo', () => {
  const escalar = Para.actions.Escalar.inputs
  assert.equal(Para.foreach, "@outputs('Paradas')?['body/value']")
  assert.equal(escalar.host.operationId, 'UpdateRecord')
  assert.equal(escalar.parameters.recordId, "@items('Para_cada_parada')?['cr40f_despesaoperacionalid']")
  const campos = Object.keys(escalar.parameters).filter((k) => k.startsWith('item/'))
  assert.deepEqual(campos, ['item/new_aguardandogestor'])
  assert.equal(escalar.parameters['item/new_aguardandogestor'], true)
})

test('falha em qualquer passo termina a execução como Failed, para não escalar em silêncio', () => {
  const { Catch } = flow.actions
  assert.deepEqual(Catch.runAfter.Try, ['Failed', 'TimedOut'])
  assert.equal(Catch.actions.Falhar.type, 'Terminate')
  assert.equal(Catch.actions.Falhar.inputs.runStatus, 'Failed')
})

test('o script troca o token da tabela, confere as colunas e mantém o BOM', () => {
  assert.ok(ps1.includes(".Replace('__SET_DESPESA__', $entitySet)"))
  assert.ok(ps1.includes("'cr40f_statusoperacional', 'new_aguardandogestor'"))
  assert.deepEqual([...readFileSync(new URL('../provision-flow-despesas-escalada.ps1', import.meta.url)).subarray(0, 3)], [0xef, 0xbb, 0xbf])
})
