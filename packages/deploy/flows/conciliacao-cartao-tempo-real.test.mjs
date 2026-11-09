import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { despesa, FILTRO_REPROCESSADA, reprocessada } from './conciliacao-cartao-tempo-real.mjs'

const diario = JSON.parse(readFileSync(new URL('./conciliacao-cartao-diario.json', import.meta.url), 'utf8').replace(/^\uFEFF/, ''))
const refs = (o) => new Set([...JSON.stringify(o).matchAll(/(?:outputs|body|actions)\('([^']+)'\)/g)].map((m) => m[1]))
const nomes = (acoes, out = new Set()) => {
  for (const [k, v] of Object.entries(acoes ?? {})) {
    out.add(k); nomes(v.actions, out); nomes(v.else?.actions, out); nomes(v.default?.actions, out)
    for (const c of Object.values(v.cases ?? {})) nomes(c.actions, out)
  }
  return out
}

test('reprocessada: gatilho com o mesmo filtro de Reabertas do diário', () => {
  const f = reprocessada(diario)
  const p = f.triggers.Quando_reprocessada.inputs.parameters
  assert.equal(p['subscriptionRequest/entityname'], 'cr40f_transacaocartao')
  assert.equal(p['subscriptionRequest/message'], 3)
  assert.equal(p['subscriptionRequest/filterexpression'], FILTRO_REPROCESSADA)
  assert.equal(diario.actions.Reabertas.inputs.parameters.$filter, `statecode eq 0 and ${FILTRO_REPROCESSADA}`)
})

test('reprocessada: mesmo corpo de Cada_reaberta, lendo a linha do gatilho, sem referência solta', () => {
  const f = reprocessada(diario)
  const texto = JSON.stringify(f.actions)
  assert.doesNotMatch(texto, /items\('Cada_reaberta'\)/)
  for (const k of Object.keys(diario.actions.Cada_reaberta.actions)) assert.ok(f.actions[k], `falta ${k}`)
  const existentes = nomes(f.actions)
  for (const r of refs(f.actions)) assert.ok(existentes.has(r), `referência a ação inexistente: ${r}`)
  assert.deepEqual(f.actions.Dados_R.runAfter, { Var_despesa: ['Succeeded'] })
  assert.match(f.actions.Dados_R.inputs.compra, /take\(string\(triggerOutputs\(\)\?\['body\/cr40f_datacompra'\]\), 10\)/)
  assert.ok(existentes.has('Criar_despesa_R') && existentes.has('Gravar_reaberta'))
})

test('despesa: só despesa do cartão que saiu de Precisa corrigir; completada concilia, recusada ou cancelada diverge', () => {
  const f = despesa(diario)
  const p = f.triggers.Quando_despesa_muda.inputs.parameters
  assert.equal(p['subscriptionRequest/entityname'], 'cr40f_despesaoperacional')
  assert.equal(p['subscriptionRequest/filteringattributes'], 'cr40f_statusoperacional')
  assert.equal(p['subscriptionRequest/filterexpression'], 'cr40f_conciliadacartao eq true and cr40f_statusoperacional ne 100000001')
  assert.match(f.actions.Aguardando.inputs.parameters.$filter, /cr40f_situacao eq 100000003$/)
  const item = f.actions.Cada_aguardando.actions.Concluir.inputs.parameters
  assert.match(item['item/cr40f_situacao'], /100000003\), equals\(.*100000004\)\), 100000005, 100000001\)$/)
  for (const r of refs(f.actions)) assert.ok(nomes(f.actions).has(r), r)
})

test('despesa: recusada ou cancelada depois de conciliar leva a transação conciliada (automática ou manual) para Divergência; outro status não mexe', () => {
  const f = despesa(diario)
  const se = f.actions.Se_fora
  assert.match(se.expression.equals[0], /^@or\(equals\(triggerOutputs\(\)\?\['body\/cr40f_statusoperacional'\], 100000003\), equals\(.*, 100000004\)\)$/)
  assert.equal(se.expression.equals[1], true)
  assert.deepEqual(se.else, { actions: {} })
  assert.match(se.actions.Conciliadas.inputs.parameters.$filter, /^_cr40f_despesa_value eq @\{triggerOutputs\(\)\?\['body\/cr40f_despesaoperacionalid'\]\} and \(cr40f_situacao eq 100000001 or cr40f_situacao eq 100000002\)$/)
  const item = se.actions.Cada_conciliada.actions.Divergir.inputs.parameters
  assert.equal(item['item/cr40f_situacao'], 100000005)
  assert.equal(item['item/cr40f_motivo'], 'A despesa ligada a esta compra foi recusada ou cancelada depois de conciliada; confira a cobrança.')
  assert.deepEqual(se.runAfter, {}, 'em paralelo com Aguardando: falha de um ramo não fica escondida')
  const existentes = nomes(f.actions)
  for (const r of refs(f.actions)) assert.ok(existentes.has(r), r)
})

test('despesa: o comportamento de Aguardando não mudou e a varredura de excluída do diário não vaza para os flows tempo real', () => {
  const f = despesa(diario)
  assert.match(f.actions.Aguardando.inputs.parameters.$filter, /cr40f_situacao eq 100000003$/)
  assert.match(f.actions.Cada_aguardando.actions.Concluir.inputs.parameters['item/cr40f_motivo'], /'A despesa criada pelo cartão foi recusada ou cancelada; confira a cobrança\.'/)
  for (const flow of [f, reprocessada(diario)]) {
    assert.ok(!nomes(flow.actions).has('Excluidas') && !nomes(flow.actions).has('Cada_excluida'))
    assert.doesNotMatch(JSON.stringify(flow), /sem despesa ativa ligada/)
  }
})
