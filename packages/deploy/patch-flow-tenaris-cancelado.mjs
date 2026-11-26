#!/usr/bin/env node
// Deixa o cancelamento da Tenaris passar pela proteção do status no "Flow Novo Sistema Tenaris -> Dataverse".
// Antes: com cr40f_status em new_camposprotegidos, o Upsert_Geral regravava o status atual e o cancelamento sumia.
// Depois: Cancelado (202410002) e Requer Análise (100000001, como a Tenaris marca o cancelamento; execuções do PROD
// desde 21/10/2026) vão sempre; o Cr40f.Protecao.Plugin decide (serviço aberto vira Requer Análise com a marca,
// fechado continua barrado, só quando o cancelamento é novo). Os outros status continuam respeitando a proteção.
// O formato 'so-cancelado' (primeira versão, só 202410002, aplicada no DEV em 26/11/2026) é atualizado.
// Já aplicado, não faz nada.
// docs/features/tenaris-cancelado-requer-analise
//
// Uso (requer `az login`; sem --apply é DRY RUN):
//   node packages/deploy/patch-flow-tenaris-cancelado.mjs --ambiente DEV [--apply]
//   node packages/deploy/patch-flow-tenaris-cancelado.mjs --ambiente DEV --apply --restaurar <backup.json>
// PROD recebe pelas soluções (o flow está na BetinhosAutomacao); --confirmar-prod existe só para hotfix.
// Antes de gravar, salva o clientdata atual em packages/deploy/flows/backup/ (fora do Git).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { rodandoComoCli } from './solucoes/arquivo.mjs'
import { FLOW_ID, FLOW_NOME, URLS, backup, dataverse, gravar, semMojibake } from './patch-flow-tenaris-lote.mjs'

const CAMPO = 'item/cr40f_status'
const LINHA = "first(body('List_rows_Geral')?['value'])"
const PROTEGIDO = `contains(coalesce(${LINHA}?['new_camposprotegidos'],''),'cr40f_status')`
export const ANTES = `@if(${PROTEGIDO},${LINHA}?['cr40f_status'],outputs('Compose_Status'))`
const STATUS = "coalesce(outputs('Compose_Status'),'')"
export const SO_CANCELADO = `@if(and(${PROTEGIDO},not(equals(${STATUS},'202410002'))),${LINHA}?['cr40f_status'],outputs('Compose_Status'))`
export const DEPOIS = `@if(and(${PROTEGIDO},not(equals(${STATUS},'202410002')),not(equals(${STATUS},'100000001'))),${LINHA}?['cr40f_status'],outputs('Compose_Status'))`

// Upsert_Geral em qualquer escopo (Loop_Servicos no formato antigo, Scope_Servico depois do patch do lote).
function upsertGeral(acoes) {
  for (const [nome, a] of Object.entries(acoes ?? {})) {
    if (nome === 'Upsert_Geral') return a
    for (const filhas of [a.actions, a.else?.actions, a.default?.actions, ...Object.values(a.cases ?? {}).map((c) => c.actions)]) {
      const achou = filhas && upsertGeral(filhas)
      if (achou) return achou
    }
  }
  return null
}

export function estado(clientdata) {
  const upsert = upsertGeral(clientdata?.properties?.definition?.actions)
  const valor = upsert?.inputs?.parameters?.[CAMPO]
  if (valor === DEPOIS) return 'final'
  if (valor === ANTES) return 'original'
  if (valor === SO_CANCELADO) return 'so-cancelado'
  throw new Error(`Upsert_Geral fora do formato esperado (${CAMPO} = ${JSON.stringify(valor)}); nada foi alterado.`)
}

export function transformar(clientdataOriginal) {
  if (estado(clientdataOriginal) === 'final') return { clientdata: clientdataOriginal, mudou: false }
  const clientdata = structuredClone(clientdataOriginal)
  upsertGeral(clientdata.properties.definition.actions).inputs.parameters[CAMPO] = DEPOIS
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
  console.log(`${o.ambiente}: '${FLOW_NOME}' (statecode ${flow.statecode}, modificado ${flow.modifiedon}), status do Upsert_Geral: ${estado(JSON.parse(flow.clientdata))}`)
  if (!mudou) { console.log('Já aplicado; nada a fazer.'); return }
  console.log(`Depois: ${CAMPO} = ${{ final: DEPOIS, original: ANTES, 'so-cancelado': SO_CANCELADO }[esperado]}`)
  if (!o.apply) { console.log('DRY RUN: nada foi gravado. Use --apply para gravar.'); return }

  backup(o.ambiente, flow.clientdata)
  await gravar(dv, flow, JSON.stringify(clientdata))
  const conf = await dv('GET', `workflows(${FLOW_ID})?$select=clientdata,statecode`)
  if (estado(JSON.parse(conf.clientdata)) !== esperado) throw new Error(`A gravação não persistiu o formato '${esperado}'; restaure o backup.`)
  console.log(`${o.ambiente}: '${FLOW_NOME}' gravado no formato '${esperado}' (statecode ${conf.statecode}, antes ${flow.statecode}).`)
}

if (rodandoComoCli(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1) })
}
