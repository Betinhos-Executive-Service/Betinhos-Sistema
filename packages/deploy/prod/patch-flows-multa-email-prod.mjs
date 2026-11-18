#!/usr/bin/env node
// Somente PROD. Corrige o destinatário "financeiro@betinhos.com..br" (domínio inválido) nos três flows de multa que
// só existem no PROD e os religa. O Power Automate passou a validar o e-mail ao ativar: no import de 18/11/2026
// (run 44339231779) o "Restaurar estados ligado/desligado" não conseguiu religá-los (OpenApiOperationParameterValidationFailed
// em Send_an_email_(V2)_1). Só muda emailMessage/To, Cc e Bcc dos envios de e-mail; nada mais no flow.
//
// Uso (requer `az login` com acesso ao PROD; sem --apply é DRY RUN):
//   node packages/deploy/prod/patch-flows-multa-email-prod.mjs
//   node packages/deploy/prod/patch-flows-multa-email-prod.mjs --apply --confirmar-prod
// Antes de gravar, salva o clientdata de cada flow em packages/deploy/flows/backup/ (fora do Git).
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rodandoComoCli } from '../solucoes/arquivo.mjs'

const PROD = 'https://orgf261ae8e.crm2.dynamics.com'
const PROD_ORG = '9e4ef53e-8bfc-f011-89f6-6045bd3ad1ec'
export const FLOWS = {
  '2eff1da8-0efd-f011-8406-002248e0a05f': 'Flow  Notificar Condutor Multas',
  '412f23a2-0efd-f011-8406-002248e0a05f': 'Flow Notificação Email Multa não Indicada',
  '422f23a2-0efd-f011-8406-002248e0a05f': 'Flow Gerar Contrato',
}
const ERRADO = 'betinhos.com..br'
const CERTO = 'betinhos.com.br'
const CAMPOS = ['emailMessage/To', 'emailMessage/Cc', 'emailMessage/Bcc']

function* acoes(lista) {
  for (const a of Object.values(lista ?? {})) {
    yield a
    yield* acoes(a.actions)
    yield* acoes(a.else?.actions)
    yield* acoes(a.default?.actions)
    for (const c of Object.values(a.cases ?? {})) yield* acoes(c.actions)
  }
}

// Troca o domínio inválido nos destinatários dos envios de e-mail. Devolve quantos campos mudaram.
export function corrigir(clientdata) {
  let n = 0
  for (const a of acoes(clientdata.properties.definition.actions)) {
    const p = a.inputs?.parameters
    if (a.inputs?.host?.operationId !== 'SendEmailV2' || !p) continue
    for (const c of CAMPOS) {
      if (typeof p[c] === 'string' && p[c].includes(ERRADO)) { p[c] = p[c].replaceAll(ERRADO, CERTO); n++ }
    }
  }
  return n
}

function dataverse() {
  const az = process.platform === 'win32' ? 'az.cmd' : 'az'
  const token = process.env.DV_ACCESS_TOKEN?.trim() || execFileSync(az, ['account', 'get-access-token', '--resource', `${PROD}/`, '--query', 'accessToken', '-o', 'tsv'], { encoding: 'utf8' }).trim()
  if (!token) throw new Error('Token do Dataverse PROD indisponível (rode az login).')
  return async (metodo, caminho, corpo) => {
    const r = await fetch(`${PROD}/api/data/v9.2/${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0', ...(corpo ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const texto = await r.text()
    if (!r.ok) throw new Error(`${metodo} ${caminho.split('?')[0]}: ${r.status} ${texto.slice(0, 600)}`)
    return texto ? JSON.parse(texto) : null
  }
}

function backup(id, nome, clientdata) {
  if (clientdata.includes('sig=')) throw new Error(`'${nome}' tem URL assinada (sig=); revise antes de continuar.`)
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'flows', 'backup')
  mkdirSync(dir, { recursive: true })
  const arquivo = join(dir, `PROD-multa-email-${id.slice(0, 8)}-${Date.now()}.json`)
  writeFileSync(arquivo, clientdata, { flag: 'wx' })
  console.log(`  backup: ${arquivo}`)
}

async function main(argv) {
  const apply = argv.includes('--apply')
  if (apply && !argv.includes('--confirmar-prod')) throw new Error('PROD exige --confirmar-prod junto com --apply.')
  const dv = dataverse()
  if ((await dv('GET', 'WhoAmI')).OrganizationId !== PROD_ORG) throw new Error('A API não respondeu pela organização PROD.')
  for (const [id, nome] of Object.entries(FLOWS)) {
    const flow = await dv('GET', `workflows(${id})?$select=name,statecode,clientdata`)
    if (flow.name !== nome) throw new Error(`Flow ${id} tem nome inesperado: '${flow.name}'.`)
    const cd = JSON.parse(flow.clientdata)
    const n = corrigir(cd)
    console.log(`${nome}: statecode ${flow.statecode}, ${n} destinatário(s) a corrigir`)
    if (!apply) continue
    if (n) {
      backup(id, nome, flow.clientdata)
      if (flow.statecode === 1) await dv('PATCH', `workflows(${id})`, { statecode: 0, statuscode: 1 })
      await dv('PATCH', `workflows(${id})`, { clientdata: JSON.stringify(cd) })
    }
    await dv('PATCH', `workflows(${id})`, { statecode: 1, statuscode: 2 })
    const conf = await dv('GET', `workflows(${id})?$select=statecode,clientdata`)
    if (conf.clientdata.includes(ERRADO) || conf.statecode !== 1) throw new Error(`'${nome}' não confere (statecode ${conf.statecode}).`)
    console.log('  corrigido e ligado')
  }
}

if (rodandoComoCli(import.meta.url)) main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1) })
