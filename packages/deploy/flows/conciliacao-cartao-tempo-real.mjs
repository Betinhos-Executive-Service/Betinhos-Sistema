// Flows em tempo real da conciliação do cartão, gerados a partir do diário (conciliacao-cartao-diario.json):
// - reprocessada: transação de compra que volta a Pendente com cartão e motorista e sem despesa (Reprocessar/Reabrir)
//   roda na hora o mesmo corpo de `Cada_reaberta` do diário (casa, marca divergência ou cria a despesa).
// - despesa: despesa do cartão que sai de "Precisa corrigir" tira a transação de "Aguardando motorista".
// O diário segue lendo o banco, mandando o push e reprocessando o que o tempo real não pegou.
// Uso: node conciliacao-cartao-tempo-real.mjs <reprocessada|despesa>  -> JSON da definição com os tokens __X__ do diário.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DV = { apiId: '__DV__', connectionName: 'shared_commondataserviceforapps' }
const SITUACAO = { pendente: 100000000, automatica: 100000001, aguardando: 100000003, divergencia: 100000005 }
const STATUS = { compra: 100000000, corrigir: 100000001, recusado: 100000003, cancelado: 100000004 }

/** Mesma condição do `$filter` de `Reabertas` no diário. */
export const FILTRO_REPROCESSADA =
  `cr40f_situacao eq ${SITUACAO.pendente} and cr40f_tipo eq ${STATUS.compra} and _cr40f_cartao_value ne null and _cr40f_motorista_value ne null and _cr40f_despesa_value eq null`

const gatilho = (entityname, filteringattributes, filterexpression) => ({
  type: 'OpenApiConnectionWebhook',
  inputs: {
    host: { ...DV, operationId: 'SubscribeWebhookTrigger' },
    parameters: {
      'subscriptionRequest/message': 3,
      'subscriptionRequest/entityname': entityname,
      'subscriptionRequest/scope': 4,
      'subscriptionRequest/filteringattributes': filteringattributes,
      'subscriptionRequest/filterexpression': filterexpression,
    },
    authentication: "@parameters('$authentication')",
  },
  runtimeConfiguration: { concurrency: { runs: 1 } },
})

const base = (diario, triggers, actions) => ({
  $schema: diario.$schema, contentVersion: diario.contentVersion, parameters: diario.parameters, triggers, actions, outputs: {},
})

export function reprocessada(diario) {
  const a = diario.actions
  const corpo = JSON.parse(JSON.stringify(a.Cada_reaberta.actions).replaceAll("items('Cada_reaberta')", "triggerOutputs()?['body']"))
  // O gatilho pode trazer a data com hora; Candidatas e Criar_despesa esperam só aaaa-mm-dd.
  corpo.Dados_R.inputs.compra = "@take(string(triggerOutputs()?['body/cr40f_datacompra']), 10)"
  const variavel = (nome, depois) => ({ ...a[nome], runAfter: { [depois]: ['Succeeded'] } })
  return base(diario, { Quando_reprocessada: gatilho('cr40f_transacaocartao', 'cr40f_situacao,cr40f_cartao,cr40f_motorista', FILTRO_REPROCESSADA) }, {
    Parametros: { ...a.Parametros, runAfter: {} },
    Var_situacao: variavel('Var_situacao', 'Parametros'),
    Var_motivo: variavel('Var_motivo', 'Var_situacao'),
    Var_despesa: variavel('Var_despesa', 'Var_motivo'),
    ...Object.fromEntries(Object.entries(corpo).map(([k, v]) => [k, k === 'Dados_R' ? { ...v, runAfter: { Var_despesa: ['Succeeded'] } } : v])),
  })
}

export function despesa(diario) {
  const status = "triggerOutputs()?['body/cr40f_statusoperacional']"
  const fora = `or(equals(${status}, ${STATUS.recusado}), equals(${status}, ${STATUS.cancelado}))`
  return base(diario, {
    Quando_despesa_muda: gatilho('cr40f_despesaoperacional', 'cr40f_statusoperacional', `cr40f_conciliadacartao eq true and cr40f_statusoperacional ne ${STATUS.corrigir}`),
  }, {
    Aguardando: { type: 'OpenApiConnection', runAfter: {}, inputs: { host: { ...DV, operationId: 'ListRecords' }, authentication: "@parameters('$authentication')", parameters: {
      entityName: '__SET_TRANS__', $select: 'cr40f_transacaocartaoid',
      $filter: `_cr40f_despesa_value eq @{triggerOutputs()?['body/cr40f_despesaoperacionalid']} and cr40f_situacao eq ${SITUACAO.aguardando}`,
    } } },
    Cada_aguardando: { type: 'Foreach', runAfter: { Aguardando: ['Succeeded'] }, foreach: "@coalesce(outputs('Aguardando')?['body/value'], json('[]'))", actions: {
      Concluir: { type: 'OpenApiConnection', runAfter: {}, inputs: { host: { ...DV, operationId: 'UpdateRecord' }, authentication: "@parameters('$authentication')", parameters: {
        entityName: '__SET_TRANS__', recordId: "@items('Cada_aguardando')?['cr40f_transacaocartaoid']",
        'item/cr40f_situacao': `@if(${fora}, ${SITUACAO.divergencia}, ${SITUACAO.automatica})`,
        'item/cr40f_motivo': `@if(${fora}, 'A despesa criada pelo cartão foi recusada ou cancelada; confira a cobrança.', 'O motorista completou a despesa criada pelo cartão.')`,
      } } },
    } },
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const diario = JSON.parse(readFileSync(new URL('./conciliacao-cartao-diario.json', import.meta.url), 'utf8').replace(/^﻿/, ''))
  const qual = { reprocessada, despesa }[process.argv[2]]
  if (!qual) { console.error('uso: node conciliacao-cartao-tempo-real.mjs <reprocessada|despesa>'); process.exit(1) }
  process.stdout.write(JSON.stringify(qual(diario)))
}
