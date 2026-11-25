#!/usr/bin/env node
// Trava do CI (plano 4): a migration que protege o contato do passageiro só entra depois do corte do PROD, para que a
// proteção não chegue ao PROD pelas soluções antes de as pessoas terem os perfis. Condição: corte.json com
// "prod": "cortar" e a tag acessos-corte-prod no origin.
// Uso: git diff --name-status -M origin/$BASE...HEAD | node packages/deploy/acessos/corte-ci.mjs --tag-prod <0|1>
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { lerCorte } from './corte-regras.mjs'

export const PASSAGEIRO = /^packages\/deploy\/migrations\/\d{8}-\d{4}-acessos-passageiro[^/]*\.ps1$/

export function checarPassageiro(linhas, { modoProd, tagProd }) {
  const novas = linhas
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split('\t'))
    .filter(([s, a, b]) => (s[0] === 'A' && PASSAGEIRO.test(a)) || ((s[0] === 'R' || s[0] === 'C') && PASSAGEIRO.test(b ?? '')))
    .map(([s, a, b]) => (s[0] === 'A' ? a : b))
  if (!novas.length || (modoProd === 'cortar' && tagProd)) return []
  return novas.map((m) => `${m}: a proteção do passageiro só entra depois do corte do PROD (corte.json "prod": "cortar" e tag acessos-corte-prod no origin; hoje "prod": "${modoProd}", tag ${tagProd ? 'presente' : 'ausente'}).`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { 'tag-prod': { type: 'string', default: '0' } } })
  const modoProd = lerCorte(readFileSync(new URL('./corte.json', import.meta.url), 'utf8'), 'prod')
  const erros = checarPassageiro(readFileSync(0, 'utf8').split('\n'), { modoProd, tagProd: Number(values['tag-prod']) > 0 })
  for (const e of erros) console.error(`::error::${e}`)
  process.exit(erros.length ? 1 : 0)
}
