import assert from 'node:assert/strict'
import { test } from 'node:test'
import { aplicarDestinatario } from './recibo-destinatario.mjs'

const email = (saudacao) => ({
  actions: {
    Enviar: { inputs: { parameters: {
      'emailMessage/To': "noreply@betinhos.onmicrosoft.com;financeiro@betinhos.com.br;@{outputs('Get_a_row_by_ID_BD')?['body/cr40f_email']}",
      'emailMessage/Body': `<p>${saudacao} @{outputs('Get_a_row_by_ID_BD')?['body/cr40f_nomedopassageiro']},</p>`,
    } } },
  },
})

const definicao = () => ({
  triggers: { manual: { inputs: { schema: { properties: { GUID: { type: 'string' } } } } } },
  actions: {
    Scope_Processo: {
      type: 'Scope',
      actions: {
        Get_a_row_by_ID_BD: { type: 'OpenApiConnection', runAfter: { Get_a_row_by_ID_PAG: ['Succeeded'] }, inputs: { parameters: { recordId: 'pessoa' } } },
        Get_a_row_by_ID_OP: { type: 'OpenApiConnection', runAfter: { Get_a_row_by_ID_BD: ['Succeeded'] }, inputs: { parameters: {} } },
        Switch_Idioma: { type: 'Switch', expression: 'antes', cases: { Pt: email('Prezado(a)'), En: email('Dear') } },
        Update_a_row_1: { type: 'OpenApiConnection', inputs: { parameters: { 'item/cr40f_linkdorecibo': 'link', 'item/cr40f_statusdorecibo': 202410001 } } },
        Marcar_Concluido: { type: 'OpenApiConnection', inputs: { parameters: { 'item/new_statusgeracaorecibo': 100000002 } } },
      },
    },
  },
})

test('e-mails usam o destino calculado e mantêm o financeiro', () => {
  const r = aplicarDestinatario(definicao(), { manual: false })
  const { Pt } = r.actions.Scope_Processo.actions.Switch_Idioma.cases
  const p = Pt.actions.Enviar.inputs.parameters
  assert.equal(p['emailMessage/To'], "noreply@betinhos.onmicrosoft.com;financeiro@betinhos.com.br;@{outputs('Destino_recibo')?['para']}")
  assert.match(p['emailMessage/Body'], /^@\{outputs\('Destino_recibo'\)\?\['aviso'\]\}<p>Prezado\(a\) @\{outputs\('Destino_recibo'\)\?\['nome'\]\},/)
  assert.doesNotMatch(p['emailMessage/Body'], /Get_a_row_by_ID_BD/)
})

test('busca a pessoa destinatária e cai no pagante sem destinatário', () => {
  const a = aplicarDestinatario(definicao(), { manual: false }).actions.Scope_Processo.actions
  assert.match(a.Get_destinatario_recibo.inputs.parameters.recordId, /^@coalesce\(.*_cr40f_destinatariorecibo_value.*_cr40f_bancodedados_value/)
  assert.deepEqual(a.Get_a_row_by_ID_OP.runAfter, { Destino_recibo: ['Succeeded'] })
  assert.equal(a.Get_a_row_by_ID_BD.inputs.parameters.recordId, 'pessoa')
})

test('só o manual aceita a troca avulsa', () => {
  const auto = aplicarDestinatario(definicao(), { manual: false })
  assert.equal(auto.triggers.manual.inputs.schema.properties.EMAIL_DESTINO, undefined)
  assert.doesNotMatch(JSON.stringify(auto.actions.Scope_Processo.actions.Destino_recibo), /EMAIL_DESTINO/)
  const manual = aplicarDestinatario(definicao(), { manual: true })
  assert.deepEqual(manual.triggers.manual.inputs.schema.properties.EMAIL_DESTINO, { type: 'string' })
  assert.match(manual.actions.Scope_Processo.actions.Get_destinatario_recibo.inputs.parameters.recordId, /^@if\(empty\(triggerBody\(\)\?\['EMAIL_DESTINO'\]\)/)
})

test('aplicar de novo não muda nada', () => {
  const uma = aplicarDestinatario(definicao(), { manual: true })
  assert.deepEqual(aplicarDestinatario(uma, { manual: true }), uma)
})

test('manual só marca Recibo Enviado quando o e-mail saiu', () => {
  const a = aplicarDestinatario(definicao(), { manual: true }).actions.Scope_Processo.actions
  assert.equal(a.Update_a_row_1.inputs.parameters['item/cr40f_statusdorecibo'], undefined)
  assert.equal(a.Update_a_row_1.inputs.parameters['item/cr40f_linkdorecibo'], 'link')
  const status = a.Marcar_Concluido.inputs.parameters['item/cr40f_statusdorecibo']
  assert.match(status, /^@if\(or\(and\(equals\(triggerBody\(\)\?\['SEND_EMAIL'\], true\), equals\(actions\('Condition_Enviar_Email'\)\?\['status'\], 'Succeeded'\)\)/)
  assert.match(status, /, 202410001, 202410002\)$/)
  const auto = aplicarDestinatario(definicao(), { manual: false }).actions.Scope_Processo.actions
  assert.equal(auto.Update_a_row_1.inputs.parameters['item/cr40f_statusdorecibo'], 202410001)
})
