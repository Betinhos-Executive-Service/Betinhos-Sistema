import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const raw = readFileSync(new URL('./conciliacao-cartao-diario.json', import.meta.url), 'utf8')
const flow = JSON.parse(raw)

const todas = new Map()
const percorrer = (acoes) => {
  for (const [nome, acao] of Object.entries(acoes ?? {})) {
    todas.set(nome, acao)
    percorrer(acao.actions)
    percorrer(acao.else?.actions)
    for (const caso of Object.values(acao.cases ?? {})) percorrer(caso.actions)
    percorrer(acao.default?.actions)
  }
}
percorrer(flow.actions)
const acao = (nome) => {
  assert.ok(todas.has(nome), `ação ausente: ${nome}`)
  return todas.get(nome)
}

test('roda uma vez por dia às 08:00 de Brasília, sem execuções simultâneas', () => {
  const gatilho = flow.triggers.Todo_dia_8h
  assert.equal(gatilho.recurrence.frequency, 'Day')
  assert.equal(gatilho.recurrence.timeZone, 'E. South America Standard Time')
  assert.deepEqual(gatilho.recurrence.schedule, { hours: ['8'], minutes: [0] })
  assert.equal(gatilho.runtimeConfiguration.concurrency.runs, 1)
})

test('janela D-10 nunca antes do início da conciliação', () => {
  assert.equal(acao('Parametros').inputs.inicio, '__INICIO__')
  assert.match(acao('De').inputs, /addDays\(outputs\('Hoje'\), -10\)/)
  assert.match(acao('De').inputs, /\['inicio'\]/)
})

test('lê o Banco MCP só com operações de leitura e esconde entradas e saídas', () => {
  const banco = [...todas.values()].filter((a) => a.inputs?.host?.apiId === '__BANCO__')
  assert.deepEqual(banco.map((a) => a.inputs.host.operationId).sort(), ['ListarContas', 'ListarConexoes', 'ListarTransacoes'].sort())
  for (const a of banco) assert.deepEqual(a.runtimeConfiguration.secureData.properties, ['inputs', 'outputs'])
  assert.equal(acao('Contas').inputs.parameters['body/type'], 'CREDIT')
  const pagina = acao('Transacoes_pagina').inputs.parameters
  assert.equal(pagina['body/page_size'], 500)
  assert.equal(pagina['body/detail'], 'rich')
})

test('toda a leitura acontece antes de qualquer gravação', () => {
  assert.deepEqual(acao('Ids').runAfter, { Cada_conexao: ['Succeeded'] })
  assert.deepEqual(acao('Cada_transacao').runAfter, { Ids: ['Succeeded'] })
  const gravacoes = ['CreateRecord', 'UpdateRecord', 'DeleteRecord']
  for (const nome of ['Cada_conexao']) {
    const dentro = new Map()
    const ir = (acoes) => { for (const [n, a] of Object.entries(acoes ?? {})) { dentro.set(n, a); ir(a.actions) } }
    ir(acao(nome).actions)
    for (const [n, a] of dentro) assert.ok(!gravacoes.includes(a.inputs?.host?.operationId), `${n} grava durante a leitura`)
  }
})

test('idempotente pelo id do banco e religa a transação quando o id muda', () => {
  assert.match(acao('Existente').inputs.parameters.$filter, /^cr40f_idexterno eq /)
  assert.match(acao('Mesma_compra').inputs.parameters.$filter, /cr40f_chavecompra eq .* and cr40f_statusapi eq 100000000/)
  assert.match(acao('Orfas').inputs.where, /contains\(body\('Ids'\)/)
  assert.equal(acao('Religar_id').inputs.parameters['item/cr40f_idexterno'], "@outputs('Dados')?['id']")
})

test('só compra à vista ou parcela 1 vira despesa, com o valor total da compra', () => {
  assert.equal(acao('Classificar').expression.equals[1], 100000000)
  assert.equal(acao('Parcela_seguinte').expression.greater[1], 1)
  assert.equal(acao('Parcela_ignorada').inputs.value, 100000006)
  assert.match(acao('Valor_despesa').inputs, /mul\(.*\['valor'\].*\['total'\]/)
})

test('casa por motorista do cartão vigente, forma cartão, valor ±0,05 e data próxima', () => {
  const cartao = acao('Cartao').inputs.parameters.$filter
  assert.match(cartao, /statecode eq 0 and _cr40f_motorista_value ne null/)
  assert.match(cartao, /cr40f_iniciovigencia le .*\(cr40f_fimvigencia eq null or cr40f_fimvigencia ge/)
  const cand = acao('Candidatas').inputs.parameters.$filter
  for (const trecho of ['_cr40f_motorista_value eq', "_cr40f_formapagamento_value eq @{outputs('Parametros')?['formaCartao']}", 'sub(', 'add(', '0.05', '(cr40f_conciliadacartao eq false or cr40f_conciliadacartao eq null)']) {
    assert.ok(cand.includes(trecho), `filtro sem ${trecho}`)
  }
  assert.equal(acao('Conciliada').inputs.value, 100000001)
  assert.equal(acao('Divergencia_varias').inputs.value, 100000005)
})

test('sem despesa lançada cria uma para o motorista validar', () => {
  const p = acao('Criar_despesa').inputs.parameters
  assert.equal(p.entityName, '__SET_DESPESA__')
  assert.equal(p['item/cr40f_origem'], 100000002)
  assert.equal(p['item/cr40f_statusoperacional'], 100000001)
  assert.equal(p['item/cr40f_conciliadacartao'], true)
  for (const nav of ['__NAV_D_MOTORISTA__', '__NAV_D_CATEGORIA__', '__NAV_D_FORMA__']) {
    assert.ok(Object.keys(p).some((k) => k.startsWith(`item/${nav}@odata.bind`)), `sem bind ${nav}`)
  }
  assert.equal(acao('Aguardando').inputs.value, 100000003)
  assert.match(acao('Dono_motorista').inputs.parameters['item/ownerid@odata.bind'], /^\/systemusers\(/)
})

test('grava a transação antes de criar despesa, depois situação e motivo, e vincula cartão, motorista e despesa', () => {
  const p = acao('Criar_transacao').inputs.parameters
  assert.equal(p['item/cr40f_situacao'], 100000000)
  assert.deepEqual(acao('Classificar').runAfter, { Criar_transacao: ['Succeeded'] })
  const s = acao('Gravar_situacao').inputs.parameters
  assert.equal(s['item/cr40f_situacao'], "@variables('Situacao')")
  assert.equal(s['item/cr40f_motivo'], "@variables('Motivo')")
  assert.equal(p['item/cr40f_chavecompra'], "@outputs('Chave')")
  assert.ok(acao('Vincular_tudo').inputs.parameters['item/__NAV_T_DESPESA__@odata.bind'])
  assert.ok(acao('Vincular_cartao').inputs.parameters['item/__NAV_T_CARTAO__@odata.bind'])
})

test('avisa cada motorista com pendência por push e limpa inscrições expiradas', () => {
  assert.match(acao('Pendentes').inputs.parameters.$filter, /cr40f_origem eq 100000002 and cr40f_statusoperacional eq 100000001/)
  assert.equal(acao('Cada_motorista').foreach, "@union(body('Motoristas'), body('Motoristas'))")
  const push = acao('Enviar_push').inputs
  assert.equal(push.host.apiId, '__PUSH__')
  assert.equal(push.host.operationId, 'EnviarPush')
  assert.equal(push.parameters['body/payload/tag'], 'gastos-cartao')
  assert.match(push.parameters['body/payload/url'], /despesaId=.*gastosCartao=1/)
  assert.equal(acao('Remover_inscricao').inputs.host.operationId, 'DeleteRecord')
})

test('tokens do script presentes e nenhum dado de ambiente no repo', () => {
  for (const t of ['__DV__', '__BANCO__', '__PUSH__', '__SET_TRANS__', '__SET_CARTAO__', '__SET_DESPESA__', '__SET_FUNC__', '__SET_SUBS__',
    '__SET_CATEGORIA__', '__SET_FORMA__', '__FORMA_CARTAO__', '"__CATEGORIAS__"', '__INICIO__', '__NAV_T_CARTAO__', '__NAV_T_MOTORISTA__', '__NAV_T_DESPESA__']) {
    assert.ok(raw.includes(t), `token ausente: ${t}`)
  }
  assert.doesNotMatch(raw, /@betinhos\.|dynamics\.com|sharepoint\.com|onmicrosoft|sk_live|usr_/i)
  assert.doesNotMatch(raw, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
})

test('toda ação citada em expressões e runAfter existe', () => {
  for (const [, nome] of raw.matchAll(/(?:outputs|body|items|result)\('([^']+)'\)/g)) assert.ok(todas.has(nome), `ação inexistente: ${nome}`)
  for (const [nome, a] of todas) for (const dep of Object.keys(a.runAfter ?? {})) assert.ok(todas.has(dep), `${nome} depende de ${dep}`)
})

test('referências a ações e propriedades sempre entre aspas simples', () => {
  assert.doesNotMatch(raw, /(?:outputs|body|items|result|actions|variables)\([A-Za-z_]/, 'nome de ação sem aspas')
  assert.doesNotMatch(raw, /\?\[[A-Za-z_][\w/]*\]/, 'propriedade sem aspas em ?[...]')
})

test('variáveis usadas foram inicializadas', () => {
  const iniciadas = new Set([...todas.values()].filter((a) => a.type === 'InitializeVariable').map((a) => a.inputs.variables[0].name))
  for (const [, nome] of raw.matchAll(/variables\('([^']+)'\)/g)) assert.ok(iniciadas.has(nome), `variável sem init: ${nome}`)
  for (const a of todas.values()) if (['SetVariable', 'IncrementVariable'].includes(a.type)) assert.ok(iniciadas.has(a.inputs.name), a.inputs.name)
})

test('erro numa transação não bloqueia o push e marca o run como falho', () => {
  assert.deepEqual(acao('Pendentes').runAfter, { Cada_transacao: ['Succeeded', 'Failed'] })
  assert.equal(acao('Marcar_falha').inputs.runStatus, 'Failed')
})

test('prefere o cartão do final específico ao da conta inteira', () => {
  assert.equal(acao('Cartao').inputs.parameters.$orderby, 'cr40f_final desc')
  assert.ok(acao('Um_cartao').expression.or)
})

test('falha na leitura do banco ou no push também marca o run como falho', () => {
  const nomes = acao('Houve_erro').expression.or.map((c) => c.equals[0])
  for (const n of ['Conexoes', 'Cada_conexao', 'Cada_transacao', 'Pendentes', 'Cada_motorista']) assert.ok(nomes.includes(`@actions('${n}')?['status']`), n)
})

test('merchant e merchantInfo em texto não derrubam a transação (o banco às vezes manda string)', () => {
  const dados = acao('Dados').inputs
  for (const campo of ['estabelecimento', 'cnpj']) {
    assert.doesNotMatch(dados[campo], /\?\['merchant(Info)?'\]\?\[/, `${campo} seleciona propriedade direto em merchant/merchantInfo`)
    assert.match(dados[campo], /json\(if\(startsWith\(string\(coalesce\(items\('Cada_transacao'\)\?\['merchant(Info)?'\], ''\)\), '\{'\)/)
  }
  assert.match(dados.estabelecimento, /'', string\(coalesce\(items\('Cada_transacao'\)\?\['merchant'\], ''\)\)\)\), 200\)$/)
})

test('operationType PAGAMENTO é compra; pagamento de fatura só como crédito com PAGAMENTO/PAGTO na descrição', () => {
  const tipo = acao('Dados').inputs.tipo
  assert.doesNotMatch(tipo, /if\(equals\(items\('Cada_transacao'\)\?\['operationType'\], 'PAGAMENTO'\)/)
  assert.match(tipo, /if\(and\(or\(less\(float\(items\('Cada_transacao'\)\?\['amount'\]\), 0\), equals\(items\('Cada_transacao'\)\?\['type'\], 'CREDIT'\)\), not\(equals\(items\('Cada_transacao'\)\?\['operationType'\], 'ESTORNO'\)\), or\(contains\(.*'PAGAMENTO'\), contains\(.*'PAGTO'\)\)\), 100000002/)
})
