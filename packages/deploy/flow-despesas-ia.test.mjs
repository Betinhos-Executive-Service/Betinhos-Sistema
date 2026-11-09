import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ps1 = readFileSync(new URL('./provision-flow-despesas-ia.ps1', import.meta.url), 'utf8').replace(/^﻿/, '')

test('gatilho aceita despesa do App e despesa do cartão conciliada, quando o anexo fica completo e a IA ainda não analisou ou pediu correção (reanálise da foto nova)', () => {
  const filtro = ps1.match(/^\$triggerFilter = '(.*)'$/m)?.[1]
  assert.equal(
    filtro,
    "cr40f_statusanexo eq 100000002 and (cr40f_origem eq 100000000 or (cr40f_origem eq 100000002 and cr40f_conciliadacartao eq true)) and ((cr40f_iastatusanalise eq null or cr40f_iastatusanalise eq 100000000 or (cr40f_iastatusanalise eq 100000002 and cr40f_statusoperacional eq 100000001)))",
  )
})

test('Contexto informa à IA que o valor veio do extrato do cartão (false para despesa do App)', () => {
  assert.ok(
    ps1.includes(`"valorDoExtratoCartao": "@and(equals(triggerOutputs()?['body/cr40f_origem'], 100000002), equals(triggerOutputs()?['body/cr40f_conciliadacartao'], true))"`),
  )
})

test('script mantém o BOM', () => {
  const bruto = readFileSync(new URL('./provision-flow-despesas-ia.ps1', import.meta.url))
  assert.deepEqual([...bruto.subarray(0, 3)], [0xef, 0xbb, 0xbf])
})
