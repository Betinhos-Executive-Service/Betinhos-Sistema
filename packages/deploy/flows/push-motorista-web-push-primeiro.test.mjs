import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// Avisos ao motorista: Web Push primeiro (abre o PWA); o push do Power Apps (abre o model-driven) é só reserva,
// quando nenhuma inscrição entregou. Vale para os 4 flows versionados e para o gerador do "Aviso Motorista | Enviar".
const FLOWS = [
  { arquivo: 'checklist-push.json', status: true },
  { arquivo: 'comunicados-push.json', status: true },
  { arquivo: 'termo-multa-push.json', status: false },
  { arquivo: 'treinamentos-push.json', status: true },
]
const VARIAVEL = 'Web_Push_Entregue'
const WORKER_API = '/providers/Microsoft.PowerApps/apis/shared_new-5fapp-20motoristas-20web-20push-5f30e351431b40001e'
const ler = (arquivo) => JSON.parse(readFileSync(new URL(`./${arquivo}`, import.meta.url), 'utf8'))

// Percorre a definição inteira (escopos, condições, foreach) e devolve [nome, ação, mapa de irmãs].
function* percorrer(acoes) {
  for (const [nome, acao] of Object.entries(acoes ?? {})) {
    yield [nome, acao, acoes]
    yield* percorrer(acao.actions)
    yield* percorrer(acao.else?.actions)
  }
}
const achar = (flow, predicado) => [...percorrer(flow.actions)].filter(([nome, acao]) => predicado(nome, acao))

for (const { arquivo, status } of FLOWS) {
  const flow = ler(arquivo)

  test(`${arquivo}: o push do Power Apps só roda dentro de Fallback_V2, depois do escopo Web Push`, () => {
    const v2 = achar(flow, (_, a) => a.inputs?.host?.operationId === 'SendPushNotificationV2')
    assert.equal(v2.length, 1)
    const fallback = achar(flow, (n) => n === 'Fallback_V2')
    assert.equal(fallback.length, 1)
    const [, condicao, irmas] = fallback[0]
    assert.ok(condicao.actions[v2[0][0]], 'o V2 fica dentro da condição')
    assert.equal(condicao.type, 'If')
    assert.deepEqual(condicao.runAfter, { Web_Push_Send_push: ['Succeeded', 'Failed', 'TimedOut'] })
    assert.equal(irmas.Web_Push_Send_push.type, 'Scope')
    assert.deepEqual(condicao.expression, { equals: [`@variables('${VARIAVEL}')`, false] })
    assert.deepEqual(condicao.else, { actions: {} })
    assert.deepEqual(v2[0][1].runAfter, {})
  })

  test(`${arquivo}: a variável nasce falsa no topo e só vira verdadeira com alguma entrega 2xx do Worker`, () => {
    const init = flow.actions.Init_web_push_entregue
    assert.equal(init.type, 'InitializeVariable')
    assert.deepEqual(init.inputs.variables, [{ name: VARIAVEL, type: 'boolean', value: false }])
    const [[, filtro]] = achar(flow, (n) => n === 'Filter_ok_Send_push')
    assert.equal(filtro.inputs.where, "@and(greaterOrEquals(item()?['status'], 200), less(item()?['status'], 300))")
    assert.equal(filtro.inputs.from, "@outputs('Worker_Send_push')?['body/results']")
    const [[, set]] = achar(flow, (n) => n === 'Set_web_push_entregue')
    assert.deepEqual(set.inputs, { name: VARIAVEL, value: "@greater(length(body('Filter_ok_Send_push')), 0)" })
    assert.deepEqual(set.runAfter, { Filter_ok_Send_push: ['Succeeded'] })
    // Nenhuma ação lê a variável antes de a inicialização rodar: a primeira ação do flow é o Init.
    const primeiras = Object.entries(flow.actions).filter(([, a]) => Object.keys(a.runAfter ?? {}).length === 0)
    assert.deepEqual(primeiras.map(([n]) => n), ['Init_web_push_entregue'])
  })

  test(`${arquivo}: o Worker usa o conector do Web Push e o deep link abre a tela do app`, () => {
    const [[, worker]] = achar(flow, (n) => n === 'Worker_Send_push')
    assert.equal(worker.inputs.host.operationId, 'EnviarPush')
    assert.equal(worker.inputs.host.apiId, WORKER_API)
    assert.equal(worker.inputs.host.connectionName, WORKER_API.split('/').pop())
    assert.match(worker.inputs.parameters['body/payload/url'], /^\/WebResources\/new_app-motoristas-v2\?\w+Id=@\{triggerOutputs\(\)\?\['body\/\w+'\]\}$/)
  })

  test(`${arquivo}: as inscrições vão ao Worker por uma ação Select (a linguagem de expressões não tem select())`, () => {
    const [[, select, irmas]] = achar(flow, (n) => n === 'Select_subs_Send_push')
    assert.equal(select.type, 'Select')
    assert.equal(select.inputs.from, "@outputs('List_subs_Send_push')?['body/value']")
    assert.deepEqual(select.inputs.select, {
      endpoint: "@item()?['new_endpoint']",
      p256dh: "@item()?['new_chavep256dh']",
      auth: "@item()?['new_chaveauth']",
    })
    assert.deepEqual(irmas.Worker_Send_push.runAfter, { Select_subs_Send_push: ['Succeeded'] })
    assert.equal(irmas.Worker_Send_push.inputs.parameters['body/subscriptions'], "@body('Select_subs_Send_push')")
  })

  if (status) {
    test(`${arquivo}: Enviado se qualquer canal entregou; Falhou só se o Web Push não entregou e o V2 falhou`, () => {
      // Nos flows com respeito à configuração do App, o envio inteiro fica dentro de Se_modulo_ligado.
      const sent = achar(flow, (n) => n === 'Mark_sent')[0][1]
      const failed = achar(flow, (n) => n === 'Mark_failed')[0][1]
      assert.deepEqual(sent.runAfter, { Fallback_V2: ['Succeeded'] })
      assert.deepEqual(failed.runAfter, { Fallback_V2: ['Failed', 'TimedOut'] })
      const campos = (a) => Object.entries(a.inputs.parameters).filter(([k]) => k.endsWith('pushstatus')).map(([, v]) => v)
      assert.deepEqual(campos(sent), [100000001])
      assert.deepEqual(campos(failed), [100000002])
    })
  }
}

test('treinamentos-push.json: Web Push por funcionário do gatilho, com tag e mensagem do treinamento', () => {
  const flow = ler('treinamentos-push.json')
  const [[, subs]] = achar(flow, (n) => n === 'List_subs_Send_push')
  assert.equal(subs.inputs.parameters.$filter, "_new_funcionario_value eq @{triggerOutputs()?['body/_cr40f_funcionario_value']}")
  const [[, worker]] = achar(flow, (n) => n === 'Worker_Send_push')
  const p = worker.inputs.parameters
  assert.equal(p['body/payload/url'], "/WebResources/new_app-motoristas-v2?treinamentoParticipacaoId=@{triggerOutputs()?['body/cr40f_treinamentoparticipacaoid']}")
  assert.equal(p['body/payload/title'], 'Novo treinamento')
  assert.equal(p['body/payload/body'], "@{outputs('Get_treinamento')?['body/cr40f_name']}\nToque para começar.")
  // O escopo do Web Push fica dentro de Se_modulo_ligado, que só roda depois de Get_treinamento (via Config_App).
  assert.deepEqual(flow.actions.Config_App.runAfter, { Get_treinamento: ['Succeeded'] })
  assert.deepEqual(flow.actions.Se_modulo_ligado.runAfter, { Config_App: ['Succeeded', 'Failed', 'TimedOut'] })
  assert.ok(flow.actions.Se_modulo_ligado.actions.Web_Push_Send_push)
})

test('treinamentos-push.json: gatilho só em alteração, senão o motorista recebe o aviso duas vezes', () => {
  // A tela cria a participação sem status e logo depois grava Pendente (e o Lembrar também só altera). O Dataverse
  // avalia o filtro do gatilho de forma assíncrona, já com o registro em Pendente: com "criado ou alterado" (4),
  // a criação também passava no filtro e o flow rodava duas vezes para a mesma participação.
  const { parameters } = ler('treinamentos-push.json').triggers.When_participation_is_queued.inputs
  assert.equal(parameters['subscriptionRequest/message'], 3)
  assert.equal(parameters['subscriptionRequest/filterexpression'], 'cr40f_pushstatus eq 100000000')
  assert.equal(parameters['subscriptionRequest/filteringattributes'], 'cr40f_pushstatus')
})

test('o treinamentos-push.ps1 pega a conexão do Worker de outro flow e o sincronizador só empresta com o parâmetro e recusa conexão sem origem', () => {
  const ps1 = readFileSync(new URL('../provision-flow-treinamentos-push.ps1', import.meta.url), 'utf8')
  assert.ok(ps1.includes("-FlowDeReferencias 'Flow Push Checklist | Motoristas'"))
  const sync = readFileSync(new URL('./sincronizar-flow.ps1', import.meta.url), 'utf8')
  assert.ok(sync.includes('ausente no flow existente e no flow de referência'))
  assert.ok(sync.includes('if ($ClientDataReferencias) {'))
})

test('Aviso Motorista | Enviar: Web Push primeiro, V2 em Fallback_V2, Enviado/Falhou pelo resultado da condição', () => {
  const ps1 = readFileSync(new URL('../provision-flow-aviso-motorista.ps1', import.meta.url), 'utf8')
  assert.ok(ps1.includes('runAfter = @{ Web_Push_Send_push = @("Succeeded", "Failed", "TimedOut") }'))
  assert.ok(ps1.includes('expression = @{ equals = @("@variables(\'$webPushVariable\')", $false) }'))
  assert.ok(ps1.includes('actions = @{ Send_push = $sendPush }'))
  assert.ok(ps1.includes('(Ok "Fallback_V2"))'))
  assert.ok(ps1.includes('@{ Fallback_V2 = @("Failed", "TimedOut") })'))
  assert.ok(ps1.includes('Set_web_push_entregue'))
  assert.ok(ps1.includes('Init_web_push_entregue = @{ type = "InitializeVariable"'))
  assert.ok(ps1.includes('runAfter = (Ok "Init_web_push_entregue")'))
  assert.ok(ps1.includes('"body/subscriptions" = "@body(\'Select_subs\')"'))
  assert.ok(ps1.includes('runAfter = (Ok "Select_subs")'))
  assert.ok(ps1.includes('Select_subs = $selectSubs'))
  // O V2 da Vigia (operadores internos) continua como estava, sem Web Push.
  assert.ok(ps1.includes('connectionName = "shared_powerappsnotificationv2"; operationId = "SendPushNotificationV2"'))
})

test('nenhum JSON de flow com push do Power Apps ao motorista fica sem o escopo Web Push', () => {
  const dir = new URL('./', import.meta.url)
  for (const arquivo of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const flow = ler(arquivo)
    const v2 = achar(flow, (_, a) => a.inputs?.host?.operationId === 'SendPushNotificationV2')
    if (!v2.length) continue
    assert.ok(achar(flow, (n) => n === 'Web_Push_Send_push').length > 0, `${arquivo} tem V2 sem escopo Web Push`)
  }
})

test('nenhum flow usa select() como função de expressão (não existe no Power Automate: InvalidTemplate na execução)', () => {
  const dir = new URL('./', import.meta.url)
  const fontes = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')])
  for (const ps1 of readdirSync(new URL('../', import.meta.url)).filter((f) => /^provision-flow-.*\.ps1$/.test(f))) {
    fontes.push([ps1, readFileSync(new URL(`../${ps1}`, import.meta.url), 'utf8')])
  }
  for (const [nome, texto] of fontes) {
    assert.doesNotMatch(texto, /[@{(,\s]select\(/, `${nome} chama select() numa expressão`)
  }
})
