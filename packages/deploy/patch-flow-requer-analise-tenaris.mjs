#!/usr/bin/env node
// Aviso "Cancelado pela Tenaris" no "Flow Notificação Novo "Requer Análise" | Interno".
// Antes: qualquer Requer Análise mandava "Novo Serviço com Status Requer Análise", e só com motorista.
// Depois: quando o Cr40f.Protecao.Plugin grava cr40f_cancelamentocliente (status que o serviço tinha quando a
// sincronização da Tenaris mandou Cancelado), a gestão recebe "A Tenaris cancelou o serviço X. Estava: Programado ·
// Agora: Requer Análise", com ou sem motorista; Concluído cancelado avisa com "(status mantido)". O resto fica igual.
// Já aplicado, não faz nada. docs/features/tenaris-cancelado-requer-analise
//
// Uso (requer `az login`; sem --apply é DRY RUN):
//   node packages/deploy/patch-flow-requer-analise-tenaris.mjs --ambiente DEV [--apply]
//   node packages/deploy/patch-flow-requer-analise-tenaris.mjs --ambiente DEV --apply --restaurar <backup.json>
// PROD recebe pelas soluções (o flow está na BetinhosAutomacao); --confirmar-prod existe só para hotfix.
// Antes de gravar, salva o clientdata atual em packages/deploy/flows/backup/ (fora do Git).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { rodandoComoCli } from './solucoes/arquivo.mjs'
import { URLS, backup, dataverse, gravar, problemasDeReferencia, semMojibake } from './patch-flow-tenaris-lote.mjs'

export const FLOW_ID = '3b12fce1-ec26-f111-88b4-7ced8da87663'
export const FLOW_NOME = 'Flow Notificação Novo "Requer Análise" | Interno'
const GATILHO = 'When_a_row_is_added,_modified_or_deleted'
export const FILTRO_ANTES = { atributos: 'cr40f_status', expressao: 'cr40f_status eq 100000001' }
export const FILTRO_DEPOIS = { atributos: 'cr40f_status,cr40f_cancelamentocliente', expressao: 'cr40f_status eq 100000001 or (cr40f_status eq 202410008 and cr40f_cancelamentocliente ne null)' }

const COL = "triggerOutputs()?['body/cr40f_cancelamentocliente']"
const MOTORISTA = "triggerOutputs()?['body/_cr40f_motorista_value']"
const APELIDO = "first(outputs('Listar_Motorista')?['body/value'])?['new_apelido']"
const DATA = "if(empty(coalesce(triggerOutputs()?['body/cr40f_dataehorriodesada'], '')), 'Não informado', formatDateTime(convertFromUtc(triggerOutputs()?['body/cr40f_dataehorriodesada'], 'E. South America Standard Time'), 'dd/MM/yyyy HH:mm'))"
const ID = "coalesce(triggerOutputs()?['body/cr40f_id'], 'Não informado')"
export const MENSAGEM_PADRAO = `Novo Serviço com Status "Requer Análise".\n| Data de Saída: @{${DATA}}\n| Motorista: @{coalesce(${APELIDO}, 'Não informado')}\n| ID: @{${ID}}`
export const MENSAGEM_TENARIS = `A Tenaris cancelou o serviço @{${ID}}.\nEstava: @{${COL}} · Agora: @{if(equals(triggerOutputs()?['body/cr40f_status'], 100000001), 'Requer Análise', concat(${COL}, ' (status mantido)'))}\n| Data de Saída: @{${DATA}}\n| Motorista: @{if(empty(${MOTORISTA}), 'sem motorista', concat(coalesce(${APELIDO}, 'Não informado'), if(equals(${COL}, 'Programado'), ' (avisado no App)', '')))}\n| ID: @{${ID}}`
export const MENSAGEM = `@if(empty(${COL}), outputs('Compose_Mensagem_Padrao'), outputs('Compose_Mensagem_Tenaris'))`
export const TITULO = `@if(empty(${COL}), 'Novo "Requer Análise"', 'Cancelado pela Tenaris')`

const dv = (operationId, parameters) => ({
  type: 'OpenApiConnection',
  inputs: { parameters, host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps', operationId, connectionName: 'shared_commondataserviceforapps' } },
})
const exigir = (ok, msg) => { if (!ok) throw new Error(`${msg}; nada foi alterado.`) }

function partes(clientdata) {
  const definition = clientdata?.properties?.definition
  const gatilho = definition?.triggers?.[GATILHO]?.inputs?.parameters
  const condicao = definition?.actions?.Scope?.actions?.['Condition_é_pra_rodar']
  const acoes = condicao?.actions
  const loop = acoes?.['For_each_funcionários_Notifcação_Operacional']?.actions
  exigir(gatilho && condicao && loop?.Send_push_notification_V2 && loop?.Add_a_new_row_Notificações_1, 'Flow fora do formato esperado (gatilho, Condition_é_pra_rodar ou For_each)')
  return { definition, gatilho, condicao, acoes, loop }
}

export function estado(clientdata) {
  const { gatilho, acoes } = partes(clientdata)
  const filtro = { atributos: gatilho['subscriptionRequest/filteringattributes'], expressao: gatilho['subscriptionRequest/filterexpression'] }
  if (JSON.stringify(filtro) === JSON.stringify(FILTRO_DEPOIS) && acoes.Listar_Motorista && acoes.Compose_Mensagem_Tenaris) return 'final'
  if (JSON.stringify(filtro) === JSON.stringify(FILTRO_ANTES) && acoes.Get_a_row_by_ID_Motoristas && !acoes.Listar_Motorista) return 'original'
  throw new Error('Flow fora do formato esperado (patch pela metade ou editado à mão); nada foi alterado.')
}

export function transformar(clientdataOriginal) {
  if (estado(clientdataOriginal) === 'final') return { clientdata: clientdataOriginal, mudou: false }
  const clientdata = structuredClone(clientdataOriginal)
  const { definition, gatilho, condicao, acoes, loop } = partes(clientdata)
  exigir(String(loop.Send_push_notification_V2.inputs.parameters['payload/message']).startsWith('Novo Serviço com Status'), 'Mensagem do push diferente da esperada')

  gatilho['subscriptionRequest/filteringattributes'] = FILTRO_DEPOIS.atributos
  gatilho['subscriptionRequest/filterexpression'] = FILTRO_DEPOIS.expressao
  // Sem motorista só roda quando é cancelamento do cliente; os outros casos continuam como antes.
  condicao.expression = { or: [{ equals: [`@empty(${MOTORISTA})`, false] }, { equals: [`@empty(${COL})`, false] }] }

  // O GetItem falha sem motorista; a lista com o id zerado volta vazia.
  delete acoes.Get_a_row_by_ID_Motoristas
  acoes.Listar_Motorista = dv('ListRecords', {
    entityName: 'cr40f_funcionarioses', $select: 'new_apelido', $top: 1,
    $filter: `cr40f_funcionariosid eq @{coalesce(${MOTORISTA}, '00000000-0000-0000-0000-000000000000')}`,
  })
  acoes.Compose_Mensagem_Padrao = { type: 'Compose', inputs: MENSAGEM_PADRAO, runAfter: { Listar_Motorista: ['Succeeded'] } }
  acoes.Compose_Mensagem_Tenaris = { type: 'Compose', inputs: MENSAGEM_TENARIS, runAfter: { Compose_Mensagem_Padrao: ['Succeeded'] } }
  acoes['List_rows_funcionários_Notifcação_Operacional'].runAfter = { Compose_Mensagem_Tenaris: ['Succeeded'] }

  loop.Send_push_notification_V2.inputs.parameters['payload/message'] = MENSAGEM
  loop.Add_a_new_row_Notificações_1.inputs.parameters['item/body'] = MENSAGEM
  loop.Add_a_new_row_Notificações_1.inputs.parameters['item/title'] = TITULO

  const problemas = problemasDeReferencia(definition)
  if (problemas.length) throw new Error(`Patch gerou referências quebradas:\n  ${problemas.join('\n  ')}`)
  return { clientdata, mudou: true }
}

function args(argv) {
  const o = { apply: false, confirmarProd: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const valor = () => { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${a} exige um valor.`); return argv[++i] }
    if (a === '--apply') o.apply = true
    else if (a === '--confirmar-prod') o.confirmarProd = true
    else if (a === '--ambiente') o.ambiente = valor().toUpperCase()
    else if (a === '--restaurar') o.restaurar = valor()
    else throw new Error(`Argumento desconhecido: ${a}`)
  }
  if (!URLS[o.ambiente]) throw new Error('Informe --ambiente DEV ou PROD.')
  if (o.restaurar && !o.apply) throw new Error('--restaurar grava no flow; use junto com --apply.')
  if (o.ambiente === 'PROD' && o.apply && !o.confirmarProd) throw new Error('PROD exige --confirmar-prod junto com --apply.')
  return o
}

async function main(argv) {
  const o = args(argv)
  const dv = dataverse(o.ambiente)
  const flow = await dv('GET', `workflows(${FLOW_ID})?$select=name,statecode,clientdata,modifiedon`)
  if (flow.name !== FLOW_NOME) throw new Error(`O workflow ${FLOW_ID} não é '${FLOW_NOME}' no ${o.ambiente}.`)
  semMojibake(flow.clientdata, `clientdata do ${o.ambiente}`)

  const alvo = o.restaurar ? JSON.parse(readFileSync(resolve(o.restaurar), 'utf8').replace(/^﻿/, '')) : null
  const { clientdata, mudou } = alvo ? { clientdata: alvo, mudou: true } : transformar(JSON.parse(flow.clientdata))
  const esperado = estado(clientdata) // no restaurar, recusa arquivo que não é deste flow
  // Restaurar vale para qualquer formato atual (é a volta de um patch pela metade).
  const atual = (() => { try { return estado(JSON.parse(flow.clientdata)) } catch (e) { if (o.restaurar) return 'fora do formato'; throw e } })()
  console.log(`${o.ambiente}: '${FLOW_NOME}' (statecode ${flow.statecode}, modificado ${flow.modifiedon}), formato atual: ${atual}`)
  if (!mudou) { console.log('Já aplicado; nada a fazer.'); return }
  console.log(`Depois: formato '${esperado}'`)
  if (!o.apply) { console.log('DRY RUN: nada foi gravado. Use --apply para gravar.'); return }

  backup(o.ambiente, flow.clientdata, 'Flow-RequerAnalise')
  await gravar(dv, flow, JSON.stringify(clientdata), FLOW_ID)
  const conf = await dv('GET', `workflows(${FLOW_ID})?$select=clientdata,statecode`)
  if (estado(JSON.parse(conf.clientdata)) !== esperado) throw new Error(`A gravação não persistiu o formato '${esperado}'; restaure o backup.`)
  console.log(`${o.ambiente}: '${FLOW_NOME}' gravado no formato '${esperado}' (statecode ${conf.statecode}, antes ${flow.statecode}).`)
}

if (rodandoComoCli(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1) })
}
