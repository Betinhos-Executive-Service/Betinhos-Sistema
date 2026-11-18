import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./multas-do-dia.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)
const tem = flow.actions.Try.actions.Tem_itens

test('dias úteis às 07:00 no horário de Brasília', () => {
  const r = flow.triggers.Dias_uteis_7h.recurrence
  assert.equal(r.frequency, 'Week')
  assert.equal(r.interval, 1)
  assert.equal(r.timeZone, 'E. South America Standard Time')
  assert.deepEqual(r.schedule, { weekDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], hours: ['7'], minutes: [0] })
})

test('lê a Custom API cr40f_MultasDoDia e só envia com itens', () => {
  const api = flow.actions.Try.actions.Multas_do_dia
  assert.equal(api.inputs.host.operationId, 'PerformUnboundAction')
  assert.equal(api.inputs.parameters.actionName, 'cr40f_MultasDoDia')
  assert.deepEqual(tem.expression, { and: [{ greater: ["@int(outputs('Dados')?['total'])", 0] }] })
  assert.deepEqual(tem.else.actions, {})
})

test('seções na ordem da spec, cada linha com auto, placa, responsável, prazo, passo e link da multa', () => {
  const corpo = tem.actions.Corpo.inputs
  const ordem = ['1. Prazo vencido: responda', '2. Contestadas pelo motorista', '3. Indicar em até 7 dias', '4. Aceite pendente na CNH Digital', '5. Pagar com 40% em até 5 dias', '6. Aguardando acerto']
  const posicoes = ordem.map((t) => corpo.indexOf(t))
  assert.ok(posicoes.every((p) => p >= 0), 'todas as seções no corpo')
  assert.deepEqual([...posicoes].sort((a, b) => a - b), posicoes)
  for (const lista of ['Linhas_prazo', 'Linhas_contestadas', 'Linhas_indicar', 'Linhas_aceite', 'Linhas_pagar']) {
    const sel = tem.actions[lista].inputs.select
    for (const campo of ["item()?['auto']", "item()?['placa']", "item()?['responsavel']", "item()?['prazo']", "item()?['passo']", '#/frota-multas?registro=multa:']) assert.ok(sel.includes(campo), `${lista}: ${campo}`)
    assert.match(sel, /if\(empty\(item\(\)\?\['prazo'\]\), '—', formatDateTime\(item\(\)\?\['prazo'\], 'dd\/MM\/yyyy'\)\)/, `${lista}: prazo sem guarda de vazio`)
    for (const campo of ['auto', 'placa', 'responsavel', 'passo']) assert.match(sel, new RegExp(`coalesce\\(item\\(\\)\\?\\['${campo}'\\]`), `${lista}: ${campo} sem coalesce`)
  }
  assert.match(corpo, /#\/frota-multas\?status=202410006/)
})

test('aceite não repete o aviso de declarado: o passo já traz "motorista declarou em dd/mm"', () => {
  assert.ok(!tem.actions.Linhas_aceite.inputs.select.includes(' · motorista declarou'))
  assert.equal(tem.actions.Linhas_contestadas.inputs.from, "@outputs('Dados')?['contestadas']")
})

test('um e-mail para cada funcionário ativo com cr40f_recebeemailmultas, pela noreply', () => {
  const dest = tem.actions.Destinatarios.inputs.parameters
  assert.equal(dest.entityName, 'cr40f_funcionarioses')
  assert.equal(dest.$filter, 'statecode eq 0 and cr40f_status eq 0 and cr40f_recebeemailmultas eq true and cr40f_emailbetinhos ne null')
  const email = tem.actions.Enviar.actions.E_mail.inputs
  assert.equal(email.host.operationId, 'SendEmailV2')
  assert.equal(email.parameters['emailMessage/From'], '__REMETENTE__')
})

test('Catch avisa o admin e marca a execução como falha', () => {
  assert.deepEqual(flow.actions.Catch.runAfter, { Try: ['Failed', 'TimedOut'] })
  assert.match(flow.actions.Catch.actions.Avisar_admin.inputs.parameters['emailMessage/To'], /new_EmailAdminAvisos/)
  assert.equal(flow.actions.Catch.actions.Marcar_falha.type, 'Terminate')
})

test('nenhum dado de ambiente no repositório', () => {
  assert.ok(raw.includes('__REMETENTE__'))
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft|sig=/i)
})
