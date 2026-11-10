import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ps1 = readFileSync(new URL('./provision-flow-despesas-ia.ps1', import.meta.url), 'utf8').replace(/^﻿/, '')

test('gatilho aceita despesa do App e despesa do cartão conciliada, quando o anexo fica completo e a IA ainda não analisou ou deu erro, ou analisou e o motorista reenviou (Enviado) ou a despesa está em Precisa corrigir', () => {
  const filtro = ps1.match(/^\$triggerFilter = '(.*)'$/m)?.[1]
  assert.equal(
    filtro,
    "cr40f_statusanexo eq 100000002 and (cr40f_origem eq 100000000 or (cr40f_origem eq 100000002 and cr40f_conciliadacartao eq true)) and (cr40f_iastatusanalise eq null or cr40f_iastatusanalise eq 100000000 or cr40f_iastatusanalise eq 100000003 or (cr40f_iastatusanalise eq 100000002 and (cr40f_statusoperacional eq 100000000 or cr40f_statusoperacional eq 100000001)))",
  )
})

test('Contexto informa à IA que o valor veio do extrato do cartão (false para despesa do App)', () => {
  assert.ok(
    ps1.includes(`"valorDoExtratoCartao": "@and(equals(triggerOutputs()?['body/cr40f_origem'], 100000002), equals(triggerOutputs()?['body/cr40f_conciliadacartao'], true))"`),
  )
})

test('reanálise lê só o último envio: comprovantes mais novos, limitado à quantidade enviada (máx. 3), na ordem do envio', () => {
  assert.ok(ps1.includes(`"$orderby": "createdon desc,cr40f_ordem desc",`))
  assert.ok(ps1.includes(`"foreach": "@reverse(outputs('Comprovantes')?['body/value'])",`))
  assert.ok(ps1.includes(`"$top": "@min(3, max(1, coalesce(triggerOutputs()?['body/new_uploadexpectedcount'], 3)))"`))
})

test('script mantém o BOM', () => {
  const bruto = readFileSync(new URL('./provision-flow-despesas-ia.ps1', import.meta.url))
  assert.deepEqual([...bruto.subarray(0, 3)], [0xef, 0xbb, 0xbf])
})

// Trecho do script entre `$gravarText = @'` e `'@`: a ação UpdateRecord que grava a decisão.
const gravar = JSON.parse(ps1.match(/\$gravarText = @'\r?\n([\s\S]*?)\r?\n'@/)[1]).inputs.parameters
const contexto = ps1.match(/"justificativaMotorista": "(.*)"\r?\n/)?.[1]

// Avalia só as expressões deste flow (funções usadas aqui), sobre o gatilho e a resposta da IA, para provar o resultado.
function avaliar(expr, { gatilho, resposta }) {
  const fns = {
    if_: (c, a, b) => (c ? a : b),
    equals: (a, b) => a === b,
    not: (a) => !a,
    and: (...a) => a.every(Boolean),
    or: (...a) => a.some(Boolean),
    empty: (a) => a == null || a.length === 0,
    trim: (a) => String(a).trim(),
    length: (a) => a.length,
    min: (...a) => Math.min(...a),
    substring: (s, i, n) => s.substring(i, i + n),
    coalesce: (...a) => a.find((x) => x != null) ?? null,
    join: (arr, sep) => arr.join(sep),
    decodeUriComponent: (x) => decodeURIComponent(x),
    triggerOutputs: () => ({ body: gatilho }),
    outputs: () => ({ ...resposta }),
  }
  const js = expr
    .replace(/^@\{?/, '')
    .replace(/\}$/, '')
    .replace(/\?\['body\/([a-z0-9_]+)'\]/g, (_, c) => `.body.${c}`)
    .replace(/outputs\('Resposta'\)\?\['([a-z_]+)'\]/g, (_, c) => `outputs().${c}`)
    .replace(/\bif\(/g, 'if_(')
    .replace(/'/g, '"')
  return new Function(...Object.keys(fns), `return ${js}`)(...Object.values(fns))
}

const corrigir = { decisao: 'precisa_corrigir', motivos: ['Valor lido R$ 82,00; lançado R$ 92,00.'], mensagem_motorista: 'O valor do comprovante (R$ 82,00) é diferente do informado (R$ 92,00). Troque o comprovante ou explique.' }
const validar = { decisao: 'validar', motivos: [], mensagem_motorista: null }
const primeira = { new_justificativamotorista: null, new_motivodevolucao: null }

test('devolução da IA grava a mensagem ao motorista em new_motivodevolucao, sem as palavras erro ou inválido', () => {
  const motivo = avaliar(gravar['item/new_motivodevolucao'], { gatilho: primeira, resposta: corrigir })
  assert.equal(motivo, corrigir.mensagem_motorista)
  assert.doesNotMatch(motivo, /erro|inv[áa]lid/i)
})

test('mensagem da IA acima de 200 caracteres é cortada em 200; abaixo disso segue inteira', () => {
  const longa = 'a'.repeat(350)
  const motivo = avaliar(gravar['item/new_motivodevolucao'], { gatilho: primeira, resposta: { ...corrigir, mensagem_motorista: longa } })
  assert.equal(motivo.length, 200)
  assert.equal(avaliar(gravar['item/new_motivodevolucao'], { gatilho: primeira, resposta: corrigir }), corrigir.mensagem_motorista)
})

test('mensagem vazia da IA cai numa frase genérica, nunca nos motivos antifraude', () => {
  const motivo = avaliar(gravar['item/new_motivodevolucao'], { gatilho: primeira, resposta: { ...corrigir, mensagem_motorista: '  ' } })
  assert.match(motivo, /^Precisamos conferir esta despesa\./)
  assert.ok(!motivo.includes(corrigir.motivos[0]))
})

test('segunda dúvida (vai ao gestor) preserva o motivo que já existia em vez de trocá-lo', () => {
  const gatilho = { new_justificativamotorista: 'Cupom corrigido à mão.', new_motivodevolucao: 'Motivo da primeira devolução' }
  assert.equal(avaliar(gravar['item/new_motivodevolucao'], { gatilho, resposta: corrigir }), 'Motivo da primeira devolução')
})

test('validar preserva o motivo anterior da devolução', () => {
  const motivo = avaliar(gravar['item/new_motivodevolucao'], { gatilho: { ...primeira, new_motivodevolucao: 'Motivo antigo' }, resposta: validar })
  assert.equal(motivo, 'Motivo antigo')
})

test('a justificativa do motorista vai no contexto enviado à IA (só quando preenchida)', () => {
  assert.ok(contexto)
  assert.equal(avaliar(contexto, { gatilho: { new_justificativamotorista: '  Cupom corrigido à mão  ' }, resposta: {} }), 'Cupom corrigido à mão')
  assert.equal(avaliar(contexto, { gatilho: { new_justificativamotorista: '   ' }, resposta: {} }), null)
  assert.equal(avaliar(contexto, { gatilho: { new_justificativamotorista: null }, resposta: {} }), null)
})

test('primeira dúvida volta ao motorista (aguardandogestor = Não)', () => {
  assert.equal(avaliar(gravar['item/new_aguardandogestor'], { gatilho: primeira, resposta: corrigir }), false)
})

test('segunda dúvida com justificativa preenchida vai ao gestor (aguardandogestor = Sim), com status Precisa corrigir', () => {
  const gatilho = { new_justificativamotorista: 'O posto corrigiu o cupom à mão.', new_motivodevolucao: 'Valor diferente.' }
  assert.equal(avaliar(gravar['item/new_aguardandogestor'], { gatilho, resposta: corrigir }), true)
  assert.match(gravar['item/cr40f_statusoperacional'], /validar'\), 100000002, 100000001\)/)
})

test('segunda dúvida só com troca de comprovante (motivo de devolução anterior, sem justificativa) também vai ao gestor', () => {
  const gatilho = { new_justificativamotorista: null, new_motivodevolucao: 'Valor diferente.' }
  assert.equal(avaliar(gravar['item/new_aguardandogestor'], { gatilho, resposta: corrigir }), true)
})

test('IA valida: aguardandogestor = Não, mesmo com justificativa', () => {
  const gatilho = { new_justificativamotorista: 'O posto corrigiu o cupom à mão.', new_motivodevolucao: 'Valor diferente.' }
  assert.equal(avaliar(gravar['item/new_aguardandogestor'], { gatilho, resposta: validar }), false)
})

test('Conferir exige no DEV os campos novos nos dois ramos de gravação', () => {
  assert.ok(ps1.includes("'Gravar_resultado grava motivo da devolução e aguardandogestor nos dois ramos'"))
  assert.ok(ps1.includes("'Contexto com justificativaMotorista (só texto preenchido)'"))
})

test('o gatilho continua filtrando só cr40f_statusanexo: update com o mesmo valor também dispara (o filtro vale pela presença da coluna no PATCH)', () => {
  assert.match(ps1, /"subscriptionRequest\/filteringattributes": "cr40f_statusanexo"/)
})
