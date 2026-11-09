// Flows em tempo real da conciliação do cartão, gerados a partir do diário (conciliacao-cartao-diario.json):
// - reprocessada: transação de compra que volta a Pendente com cartão e motorista e sem despesa (Reprocessar/Reabrir)
//   roda na hora o mesmo corpo de `Cada_reaberta` do diário (casa, marca divergência ou cria a despesa).
// - despesa: despesa do cartão que sai de "Precisa corrigir" tira a transação de "Aguardando motorista"
//   (ou da Divergência por prazo do diário, `MOTIVO_PRAZO`);
//   despesa que volta a "Precisa corrigir" devolve a Aguardando motorista a transação conciliada automática
//   (a manual é decisão do gestor e não muda), para voltar a ser cobrada e escalada em 3 dias;
//   despesa recusada ou cancelada depois de conciliada leva a transação já conciliada para Divergência.
// O diário segue lendo o banco, mandando o push e reprocessando o que o tempo real não pegou.
// Uso: node conciliacao-cartao-tempo-real.mjs <reprocessada|despesa>  -> JSON da definição com os tokens __X__ do diário.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const DV = { apiId: '__DV__', connectionName: 'shared_commondataserviceforapps' }
const SITUACAO = { pendente: 100000000, automatica: 100000001, manual: 100000002, aguardando: 100000003, divergencia: 100000005 }
const STATUS = { compra: 100000000, corrigir: 100000001, recusado: 100000003, cancelado: 100000004 }

/** Mesma condição do `$filter` de `Reabertas` no diário. */
export const FILTRO_REPROCESSADA =
  `cr40f_situacao eq ${SITUACAO.pendente} and cr40f_tipo eq ${STATUS.compra} and _cr40f_cartao_value ne null and _cr40f_motorista_value ne null and _cr40f_despesa_value eq null`

/** Motivo gravado pelo diário (`Atrasar`) quando a compra passa 3 dias sem comprovante válido. */
export const MOTIVO_PRAZO = 'Sem comprovante válido do motorista no prazo de 3 dias; confira com o motorista.'
/** Transação à espera do motorista: Aguardando, ou já escalada ao gestor por prazo (volta sozinha quando ele envia). */
export const AGUARDANDO_MOTORISTA =
  `(cr40f_situacao eq ${SITUACAO.aguardando} or (cr40f_situacao eq ${SITUACAO.divergencia} and cr40f_motivo eq '${MOTIVO_PRAZO}'))`

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
  const corrigir = `equals(${status}, ${STATUS.corrigir})`
  const fora = `or(equals(${status}, ${STATUS.recusado}), equals(${status}, ${STATUS.cancelado}))`
  const dv = (operationId, parameters) => ({ type: 'OpenApiConnection', runAfter: {}, inputs: { host: { ...DV, operationId }, authentication: "@parameters('$authentication')", parameters: { entityName: '__SET_TRANS__', ...parameters } } })
  // Lista as transações ligadas à despesa do gatilho em `situacoes` e grava `item` em cada uma.
  const ligadas = (lista, laco, gravar, situacoes, item) => ({
    [lista]: dv('ListRecords', {
      $select: 'cr40f_transacaocartaoid',
      $filter: `_cr40f_despesa_value eq @{triggerOutputs()?['body/cr40f_despesaoperacionalid']} and ${situacoes}`,
    }),
    [laco]: { type: 'Foreach', runAfter: { [lista]: ['Succeeded'] }, foreach: `@coalesce(outputs('${lista}')?['body/value'], json('[]'))`, actions: {
      [gravar]: dv('UpdateRecord', { recordId: `@items('${laco}')?['cr40f_transacaocartaoid']`, ...item }),
    } },
  })
  return base(diario, {
    Quando_despesa_muda: gatilho('cr40f_despesaoperacional', 'cr40f_statusoperacional', `cr40f_conciliadacartao eq true`),
  }, {
    // Precisa corrigir não conclui nada: só devolve (Se_corrigir).
    Se_concluir: { type: 'If', runAfter: {}, expression: { equals: [`@${corrigir}`, false] }, actions: ligadas('Aguardando', 'Cada_aguardando', 'Concluir', AGUARDANDO_MOTORISTA, {
      'item/cr40f_situacao': `@if(${fora}, ${SITUACAO.divergencia}, ${SITUACAO.automatica})`,
      'item/cr40f_motivo': `@if(${fora}, 'A despesa criada pelo cartão foi recusada ou cancelada; confira a cobrança.', 'O motorista completou a despesa criada pelo cartão.')`,
    }), else: { actions: {} } },
    Se_corrigir: { type: 'If', runAfter: {}, expression: { equals: [`@${corrigir}`, true] }, actions: ligadas('Automaticas', 'Cada_automatica', 'Devolver',
      `cr40f_situacao eq ${SITUACAO.automatica}`, {
        'item/cr40f_situacao': SITUACAO.aguardando,
        'item/cr40f_motivo': 'A despesa voltou ao motorista para corrigir o comprovante.',
      }), else: { actions: {} } },
    // Só a recusa/cancelamento mexe em transação já conciliada; Enviado/Validado não reabre nada.
    Se_fora: { type: 'If', runAfter: {}, expression: { equals: [`@${fora}`, true] }, actions: ligadas('Conciliadas', 'Cada_conciliada', 'Divergir',
      `(cr40f_situacao eq ${SITUACAO.automatica} or cr40f_situacao eq ${SITUACAO.manual})`, {
        'item/cr40f_situacao': SITUACAO.divergencia,
        'item/cr40f_motivo': 'A despesa ligada a esta compra foi recusada ou cancelada depois de conciliada; confira a cobrança.',
      }), else: { actions: {} } },
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const diario = JSON.parse(readFileSync(new URL('./conciliacao-cartao-diario.json', import.meta.url), 'utf8').replace(/^﻿/, ''))
  const qual = { reprocessada, despesa }[process.argv[2]]
  if (!qual) { console.error('uso: node conciliacao-cartao-tempo-real.mjs <reprocessada|despesa>'); process.exit(1) }
  process.stdout.write(JSON.stringify(qual(diario)))
}
