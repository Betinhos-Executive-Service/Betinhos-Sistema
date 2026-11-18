import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { despesa, AGUARDANDO_MOTORISTA, MOTIVO_PRAZO } from './conciliacao-cartao-tempo-real.mjs'

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

test('roda uma vez por dia às 08:07 de Brasília, sem execuções simultâneas', () => {
  const gatilho = flow.triggers.Todo_dia_8h
  assert.equal(gatilho.recurrence.frequency, 'Day')
  assert.equal(gatilho.recurrence.timeZone, 'E. South America Standard Time')
  assert.deepEqual(gatilho.recurrence.schedule, { hours: ['8'], minutes: [7] })
  assert.equal(gatilho.runtimeConfiguration.concurrency.runs, 1)
})

test('janela D-10 nunca antes do início da conciliação', () => {
  assert.equal(acao('Parametros').inputs.inicio, '__INICIO__')
  assert.match(acao('De').inputs, /addDays\(outputs\('Hoje'\), -10\)/)
  assert.match(acao('De').inputs, /\['inicio'\]/)
})

test('lê o Banco MCP só com operações de leitura e esconde entradas e saídas', () => {
  const banco = [...todas.values()].filter((a) => a.inputs?.host?.apiId === '__BANCO__')
  assert.deepEqual([...new Set(banco.map((a) => a.inputs.host.operationId))].sort(), ['ListarContas', 'ListarConexoes', 'ListarTransacoes'].sort())
  for (const a of banco) assert.deepEqual(a.runtimeConfiguration.secureData.properties, ['inputs', 'outputs'])
  assert.equal(acao('Contas').inputs.parameters['body/type'], 'CREDIT')
  const pagina = acao('Transacoes_pagina').inputs.parameters
  assert.equal(pagina['body/page_size'], 500)
  assert.equal(pagina['body/detail'], 'rich')
})

test('toda a leitura acontece antes de qualquer gravação', () => {
  assert.deepEqual(acao('Ids').runAfter, { Cada_conexao: ['Succeeded', 'Failed'] })
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
  assert.deepEqual(acao('Reabertas').runAfter, { Cada_transacao: ['Succeeded', 'Failed'] })
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

test('transação reaberta pelo Reprocessar da tela passa pela mesma regra de casar ou criar despesa, antes do push', () => {
  const ordem = Object.keys(flow.actions)
  assert.ok(ordem.indexOf('Cada_transacao') < ordem.indexOf('Reabertas') && ordem.indexOf('Cada_reaberta') < ordem.indexOf('Pendentes'))
  assert.deepEqual(acao('Paradas').runAfter, { Cada_reaberta: ['Succeeded', 'Failed', 'Skipped'] })
  assert.deepEqual(acao('Pendentes').runAfter, { Cada_atrasada: ['Succeeded', 'Failed', 'Skipped'] })
  const filtro = acao('Reabertas').inputs.parameters.$filter
  for (const parte of ['cr40f_situacao eq 100000000', 'cr40f_tipo eq 100000000', '_cr40f_cartao_value ne null', '_cr40f_motorista_value ne null', '_cr40f_despesa_value eq null']) assert.ok(filtro.includes(parte), parte)
  const loop = acao('Cada_reaberta')
  assert.equal(loop.runtimeConfiguration.concurrency.repetitions, 1)
  const texto = JSON.stringify(loop)
  assert.doesNotMatch(texto, /items\('Cada_transacao'\)|outputs\('(Dados|Motorista|Candidatas|Criar_despesa|Usuario|Funcionario|Valor_despesa)'\)/)
  assert.deepEqual(Object.keys(acao('Quantas_R').cases).sort(), Object.keys(acao('Quantas').cases).sort())
  assert.equal(acao('Criar_despesa_R').inputs.parameters['item/cr40f_origem'], 100000002)
  assert.ok(acao('Dono_motorista_R'))
  assert.match(JSON.stringify(acao('Houve_erro').expression), /Cada_reaberta/)
})

test('falha ao passar a despesa para o motorista (dono) não impede vincular a despesa à transação', () => {
  for (const s of ['', '_R']) assert.deepEqual(acao(`Despesa_criada${s}`).runAfter, { [`Tem_usuario${s}`]: ['Succeeded', 'Failed'] })
})

test('varre transação parada em Aguardando quando o gatilho da despesa não pegou', () => {
  assert.match(acao('Paradas').inputs.parameters.$filter, /cr40f_situacao eq 100000003 .*__NAV_T_DESPESA__\/cr40f_statusoperacional ne 100000001/)
  assert.equal(acao('Paradas').inputs.parameters.$expand, '__NAV_T_DESPESA__($select=cr40f_statusoperacional)')
  // Mesma regra do flow Despesa atualizada: só muda de onde vem o status.
  const gravar = acao('Concluir_parada').inputs.parameters
  const regra = despesa(flow).actions.Se_concluir.actions.Cada_aguardando.actions.Concluir.inputs.parameters
  for (const campo of ['item/cr40f_situacao', 'item/cr40f_motivo']) {
    assert.equal(gravar[campo].replaceAll("items('Cada_parada')?['__NAV_T_DESPESA__']?['cr40f_statusoperacional']", "triggerOutputs()?['body/cr40f_statusoperacional']"), regra[campo])
  }
  const erro = JSON.stringify(acao('Houve_erro').expression)
  assert.match(erro, /Paradas/)
  assert.match(erro, /Cada_parada/)
})

test('toda leitura do Banco MCP tenta de novo em espera crescente, por causa do 429 do Pluggy', () => {
  for (const nome of ['Conexoes', 'Contas', 'Contas_segunda', 'Transacoes_pagina']) {
    assert.deepEqual(acao(nome).inputs.retryPolicy, {
      type: 'exponential',
      count: 4,
      interval: 'PT30S',
    }, nome)
  }
})

test('conexão que falha na leitura não impede gravar as contas lidas por inteiro', () => {
  assert.deepEqual(acao('Primeira_pagina').runAfter, { Conta_vazia: ['Succeeded'] })
  assert.equal(acao('Conta_vazia').inputs.name, 'Conta')
  assert.equal(acao('Guardar').inputs.name, 'Conta')
  assert.equal(acao('Acumulado').inputs, "@union(variables('Conta'), body('Com_conta'))")
  assert.deepEqual(acao('Juntar_conta').runAfter, { Paginas: ['Succeeded'] })
  // Se o Until parar no limite de voltas sem ler todas as páginas, a conta incompleta fica de fora.
  assert.equal(acao('Juntar_conta').inputs, "@if(greater(variables('Pagina'), variables('TotalPaginas')), union(variables('Transacoes'), variables('Conta')), variables('Transacoes'))")
  assert.equal(acao('Conta_lida').inputs.name, 'Transacoes')
  // Conta e Pagina são compartilhadas: os dois laços precisam ser sequenciais.
  for (const n of ['Cada_conexao', 'Cada_conta']) assert.equal(acao(n).runtimeConfiguration.concurrency.repetitions, 1, n)
})

test('varre compra conciliada ou aguardando cuja despesa foi excluída (RemoveLink zera o lookup) e marca Divergência, antes do push', () => {
  assert.deepEqual(acao('Excluidas').runAfter, { Cada_parada: ['Succeeded', 'Failed', 'Skipped'] })
  assert.deepEqual(acao('Cada_excluida').runAfter, { Excluidas: ['Succeeded'] })
  const p = acao('Excluidas').inputs.parameters
  assert.equal(p.entityName, '__SET_TRANS__')
  assert.equal(p.$filter, `statecode eq 0 and cr40f_tipo eq 100000000 and (_cr40f_despesa_value eq null or __NAV_T_DESPESA__/statecode eq 1) and (cr40f_situacao eq 100000001 or cr40f_situacao eq 100000002 or ${AGUARDANDO_MOTORISTA}) and modifiedon lt @{formatDateTime(trigger()?['startTime'], 'yyyy-MM-ddTHH:mm:ssZ')}`)
  const g = acao('Divergir_excluida').inputs.parameters
  assert.equal(g.recordId, "@items('Cada_excluida')?['cr40f_transacaocartaoid']")
  assert.equal(g['item/cr40f_situacao'], 100000005)
  assert.equal(g['item/cr40f_motivo'], 'A compra está sem despesa ativa ligada (excluída, desativada ou o vínculo falhou); confira a cobrança.')
  const ordem = Object.keys(flow.actions)
  assert.ok(ordem.indexOf('Cada_transacao') < ordem.indexOf('Cada_reaberta') && ordem.indexOf('Cada_reaberta') < ordem.indexOf('Excluidas') && ordem.indexOf('Cada_excluida') < ordem.indexOf('Pendentes'))
  const erro = JSON.stringify(acao('Houve_erro').expression)
  assert.match(erro, /Excluidas/)
  assert.match(erro, /Cada_excluida/)
})

test('compra do cartão 3 dias corridos sem comprovante válido vai ao gestor (Divergência) e volta sozinha quando o motorista envia', () => {
  assert.deepEqual(acao('Atrasadas').runAfter, { Cada_excluida: ['Succeeded', 'Failed', 'Skipped'] })
  assert.deepEqual(acao('Cada_atrasada').runAfter, { Atrasadas: ['Succeeded'] })
  const f = acao('Atrasadas').inputs.parameters.$filter
  for (const parte of ['(cr40f_situacao eq 100000001 or cr40f_situacao eq 100000003)', '__NAV_T_DESPESA__/cr40f_origem eq 100000002', '__NAV_T_DESPESA__/cr40f_statusoperacional eq 100000001']) assert.ok(f.includes(parte), parte)
  // Criada no dia D (São Paulo) -> escalada no run de D+3; 03:00Z = meia-noite de São Paulo.
  // Também 3 dias depois da última análise da IA: foto devolvida tarde ganha prazo para corrigir.
  const corte = "@{addDays(outputs('Hoje'), -2, 'yyyy-MM-dd')}T03:00:00Z"
  assert.ok(f.endsWith(`__NAV_T_DESPESA__/createdon lt ${corte} and (__NAV_T_DESPESA__/cr40f_iadataanalise eq null or __NAV_T_DESPESA__/cr40f_iadataanalise lt ${corte})`))
  // Despesa excluída depois da escalada: Excluidas troca o motivo.
  assert.ok(acao('Excluidas').inputs.parameters.$filter.includes(`or ${AGUARDANDO_MOTORISTA})`))
  const g = acao('Atrasar').inputs.parameters
  assert.equal(g.recordId, "@items('Cada_atrasada')?['cr40f_transacaocartaoid']")
  assert.equal(g['item/cr40f_situacao'], 100000005)
  assert.equal(g['item/cr40f_motivo'], MOTIVO_PRAZO)
  assert.doesNotMatch(MOTIVO_PRAZO, /'/)
  // Volta pelo Paradas (o tempo real é coberto em conciliacao-cartao-tempo-real.test.mjs).
  assert.ok(acao('Paradas').inputs.parameters.$filter.includes(` and ${AGUARDANDO_MOTORISTA} and `))
  const erro = JSON.stringify(acao('Houve_erro').expression)
  assert.match(erro, /'Atrasadas'/)
  assert.match(erro, /'Cada_atrasada'/)
})

test('conexão que falhou em Contas espera 30 min e é lida de novo no mesmo run (429 do Pluggy às 08:07)', () => {
  assert.deepEqual(acao('Esperar_banco').runAfter, { Contas: ['Failed', 'TimedOut'] })
  assert.deepEqual(acao('Esperar_banco').inputs.interval, { count: 30, unit: 'Minute' })
  const { runAfter, ...segunda } = acao('Contas_segunda')
  const { runAfter: _, ...primeira } = acao('Contas')
  assert.deepEqual(segunda, primeira)
  assert.deepEqual(runAfter, { Esperar_banco: ['Succeeded'] })
  // Contas ok: a segunda fica Skipped e a conta é lida; as duas falham: Cada_conta é pulada e Cada_conexao fica Failed.
  assert.deepEqual(acao('Cada_conta').runAfter, { Contas_segunda: ['Succeeded', 'Skipped'] })
  assert.match(acao('Cada_conta').foreach, /if\(equals\(actions\('Contas'\)\?\['status'\], 'Succeeded'\), outputs\('Contas'\).*outputs\('Contas_segunda'\)/)
})
