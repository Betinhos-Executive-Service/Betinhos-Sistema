#!/usr/bin/env node
// Corrige o lote do "Flow Novo Sistema Tenaris -> Dataverse" (par obrigatório: SyncTenaris v3.7 + MarcarStatusSync v5.5).
// Depois do patch:
//   - pessoas: o script manda pessoas[] já sem repetição e com telefone/e-mail/departamento coalescidos (versao 2).
//     Saem Select_Responsável, Select_Pax_1..4, Compose_TodasPessoas, Filter_SemVazios, Loop_Dedup e, no
//     Loop_UpsertBD, Filter_Ocorrencias, Filter_Ocorr_* e Compose_Telefone/Email/Departamento. O Loop_UpsertBD
//     percorre triggerBody().pessoas; Filter_BDLocal, criação/atualização e varGUIDMap continuam iguais.
//   - payload antigo (sem pessoas): Condition_PayloadAntigo grava "Erro" no painel e termina com erro claro.
//   - um serviço com erro não derruba o lote: o corpo do Loop_Servicos fica em Scope_Servico; se falhar,
//     Filter_ErroServico + Append_to_array_variable_varFalhas guardam ID e mensagem. O script recebe falhas
//     (JSON) e executadoEm; Condition_FalhasServico manda e-mail de aviso sem falhar a execução.
//   - status: "Concluído" quando a condição do lote termina bem (antes olhava só a primeira ação dela).
//   - Scope_1_1 (e-mail de erro + Terminate) espera o Run_script, para o Terminate não cancelar o painel.
//   - vínculos: sai Condition_PaxMudou (contains no snapshot); Select_PaxNativos + Filter_VinculosRemover apagam
//     só o vínculo cujo passageiro saiu do serviço; Loop_Create_Pax continua criando só o que falta.
// O resto do flow não muda (new_snapshotsharepoint inclusive). Já no formato final, não faz nada.
//
// Uso (requer `az login` com acesso ao ambiente; sem --apply é DRY RUN):
//   node packages/deploy/patch-flow-tenaris-lote.mjs --ambiente DEV [--apply]
//   node packages/deploy/patch-flow-tenaris-lote.mjs --ambiente PROD --apply --confirmar-prod
//   node packages/deploy/patch-flow-tenaris-lote.mjs --ambiente DEV --apply --restaurar <backup.json>
//   node packages/deploy/patch-flow-tenaris-lote.mjs --arquivo <clientdata.json> --saida <resultado.json>  (local)
// Antes de gravar, salva o clientdata atual em packages/deploy/flows/backup/ (fora do Git).
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rodandoComoCli } from './solucoes/arquivo.mjs'

const URLS = { DEV: 'https://org23b93544.crm2.dynamics.com', PROD: 'https://orgf261ae8e.crm2.dynamics.com' }
const FLOW_ID = 'cbcd9564-1b1e-f111-88b1-7ced8da87540'
const FLOW_NOME = 'Flow Novo Sistema Tenaris -> Dataverse'
export const MSG_PAYLOAD_ANTIGO = 'SyncTenaris antigo: instale v3.7 e MarcarStatusSync v5.5'
const TODOS = ['Succeeded', 'Failed', 'Skipped', 'TimedOut']
const ok = (nome) => ({ [nome]: ['Succeeded'] })
// Cópia de uma ação para outro lugar do flow: sem id de operação e sem dependência herdada.
const copiaSolta = (acao) => {
  const c = structuredClone(acao)
  delete c.metadata?.operationMetadataId
  c.runAfter = {}
  return c
}

const MOJIBAKE = /Ã|Â|â€/
const REF = /\b(actions|body|outputs|items|result)\('([^']+)'\)/g
const VAR = /\bvariables\('([^']+)'\)/g

// Ações de cada escopo (ramos de If e casos de Switch incluídos), com o caminho de quem as contém.
function* escopos(acoes, caminho = 'actions') {
  yield [caminho, acoes]
  for (const [nome, a] of Object.entries(acoes ?? {})) {
    if (a.actions) yield* escopos(a.actions, `${caminho}.${nome}`)
    if (a.else?.actions) yield* escopos(a.else.actions, `${caminho}.${nome}.else`)
    for (const [c, caso] of Object.entries(a.cases ?? {})) yield* escopos(caso.actions, `${caminho}.${nome}.${c}`)
    if (a.default?.actions) yield* escopos(a.default.actions, `${caminho}.${nome}.default`)
  }
}

// Referências a ações ou variáveis que não existem e runAfter apontando para fora do próprio escopo.
export function problemasDeReferencia(definition) {
  const nomes = new Set(Object.keys(definition.triggers ?? {}))
  const variaveis = new Set()
  const problemas = []
  for (const [, acoes] of escopos(definition.actions)) {
    for (const [nome, a] of Object.entries(acoes)) {
      if (nomes.has(nome)) problemas.push(`ação duplicada: ${nome}`)
      nomes.add(nome)
      for (const v of a.inputs?.variables ?? []) variaveis.add(v.name)
    }
  }
  for (const [caminho, acoes] of escopos(definition.actions)) {
    for (const [nome, a] of Object.entries(acoes)) {
      for (const dep of Object.keys(a.runAfter ?? {})) {
        if (!(dep in acoes)) problemas.push(`${caminho}.${nome}: runAfter ${dep} fora do escopo`)
      }
    }
  }
  const texto = JSON.stringify(definition.actions)
  for (const [, , alvo] of texto.matchAll(REF)) if (!nomes.has(alvo)) problemas.push(`referência a ação inexistente: ${alvo}`)
  for (const [, alvo] of texto.matchAll(VAR)) if (!variaveis.has(alvo)) problemas.push(`variável não inicializada: ${alvo}`)
  return [...new Set(problemas)]
}

function exigir(cond, oQue) {
  if (!cond) throw new Error(`O flow não está no formato esperado: ${oQue}.`)
}

function remover(acoes, nomes, onde) {
  for (const n of nomes) exigir(n in acoes, `ação '${n}' ausente${onde}`)
  for (const n of nomes) delete acoes[n]
}

export function partes(clientdata) {
  const definition = clientdata?.properties?.definition
  exigir(definition?.actions?.Scope?.actions, 'Scope ausente')
  const scope = definition.actions.Scope.actions
  const lote = scope.Condition_linhas_mais_que_0?.actions
  exigir(lote?.Loop_UpsertBD && lote?.Loop_Servicos, 'Condition_linhas_mais_que_0 sem Loop_UpsertBD/Loop_Servicos')
  return { definition, scope, lote }
}

export function estado(clientdata) {
  const { scope, lote } = partes(clientdata)
  const finais = [
    'Condition_PayloadAntigo' in scope,
    'Condition_FalhasServico' in scope,
    'Scope_Servico' in lote.Loop_Servicos.actions,
    !('Loop_Dedup' in lote),
  ]
  if (finais.every(Boolean)) return 'final'
  if (!finais.some(Boolean)) return 'original'
  throw new Error('O flow está com o patch do lote pela metade; restaure um backup antes de aplicar de novo.')
}

const coalescido = (campo) => `trim(coalesce(items('Loop_UpsertBD')?['${campo}'], ''))`

function pessoasDoScript(lote) {
  for (const n of ['List_rows_BancodeDados_Completo', 'Filter_array_Tenaris']) exigir(n in lote, `ação '${n}' ausente`)
  remover(lote, ['Select_Responsável', 'Select_Pax_1', 'Select_Pax_2', 'Select_Pax_3', 'Select_Pax_4', 'Compose_TodasPessoas', 'Filter_SemVazios', 'Loop_Dedup'], '')
  lote.List_rows_BancodeDados_Completo.runAfter = ok('Filter_array_Tenaris')

  const loop = lote.Loop_UpsertBD
  const noUpsert = ' no Loop_UpsertBD (patch dos contatos)'
  for (const n of ['Filter_BDLocal', 'Condition_nome_nao_existe_ainda']) exigir(n in loop.actions, `ação '${n}' ausente${noUpsert}`)
  remover(loop.actions, ['Filter_Ocorrencias', 'Filter_Ocorr_Telefone', 'Compose_Telefone', 'Filter_Ocorr_Email', 'Compose_Email', 'Filter_Ocorr_Departamento', 'Compose_Departamento'], noUpsert)
  loop.foreach = "@triggerBody()?['pessoas']"
  loop.runAfter = ok('List_rows_BancodeDados_Completo')
  loop.actions.Filter_BDLocal.runAfter = {}
  let texto = JSON.stringify(loop.actions)
  for (const campo of ['Telefone', 'Email', 'Departamento']) {
    texto = texto.replaceAll(`outputs('Compose_${campo}')`, coalescido(campo.toLowerCase()))
  }
  loop.actions = JSON.parse(texto)
}

function payloadAntigo(scope) {
  const runScript = copiaSolta(scope.Run_script)
  Object.assign(runScript.inputs.parameters, {
    'ScriptParameters/status': 'Erro',
    'ScriptParameters/mensagem': MSG_PAYLOAD_ANTIGO,
    'ScriptParameters/dataSync': '@utcNow()',
    'ScriptParameters/executadoEm': "@{triggerBody()?['executadoEm']}",
  })
  delete runScript.inputs.parameters['ScriptParameters/falhas']
  scope.Condition_PayloadAntigo = {
    type: 'If',
    expression: "@equals(triggerBody()?['pessoas'], null)",
    actions: {
      Run_script_PayloadAntigo: runScript,
      Terminate_PayloadAntigo: {
        type: 'Terminate',
        inputs: { runStatus: 'Failed', runError: { code: 'SyncTenarisAntigo', message: MSG_PAYLOAD_ANTIGO } },
        runAfter: { Run_script_PayloadAntigo: TODOS },
      },
    },
    else: { actions: {} },
    runAfter: ok('Response_1'),
  }
  scope.Condition_linhas_mais_que_0.runAfter = ok('Condition_PayloadAntigo')
}

const LOTE_OK = "equals(actions('Condition_linhas_mais_que_0')?['status'], 'Succeeded')"
const QTD_FALHAS = "length(variables('varFalhas'))"

function painel(scope) {
  exigir(scope.Run_script?.inputs?.parameters, 'Run_script ausente')
  Object.assign(scope.Run_script.inputs.parameters, {
    'ScriptParameters/status': `@if(${LOTE_OK}, 'Concluído', 'Erro')`,
    'ScriptParameters/mensagem': `@if(${LOTE_OK}, concat(triggerBody()?['totalLinhas'], ' linha(s) processada(s).', if(greater(${QTD_FALHAS}, 0), concat(' ', ${QTD_FALHAS}, ' serviço(s) com erro, reenviados na próxima sincronização.'), '')), concat('FALHA no processamento. Verifique o histórico do flow. Erro: ', coalesce(actions('Condition_linhas_mais_que_0')?['error']?['message'], actions('Condition_linhas_mais_que_0')?['status'], 'desconhecido')))`,
    'ScriptParameters/executadoEm': "@{triggerBody()?['executadoEm']}",
    'ScriptParameters/falhas': "@{string(variables('varFalhas'))}",
  })
  exigir(scope.Scope_1_1?.actions?.['Send_an_email_(V2)_2'] && scope.Scope_1_1.actions.Select_Falhas, 'Scope_1_1/Send_an_email_(V2)_2/Select_Falhas ausente')
  scope.Scope_1_1.runAfter = { Delay: ['TimedOut', 'Skipped', 'Failed'], Run_script: TODOS }

  const email = copiaSolta(scope.Scope_1_1.actions['Send_an_email_(V2)_2'])
  const link = "https://make.powerautomate.com/environments/@{workflow()?['tags']?['environmentName']}/flows/@{workflow()?['name']}/runs/@{workflow()?['run']?['name']}"
  Object.assign(email.inputs.parameters, {
    'emailMessage/Subject': 'AVISO - Novo Sistema Tenaris -> Dataverse: serviço(s) com erro',
    'emailMessage/Body': `<p>O lote terminou, mas @{${QTD_FALHAS}} serviço(s) falharam e serão reenviados na próxima sincronização.</p><p>Execução: <a href="${link}">@{workflow()?['run']?['name']}</a></p><p>Serviços com erro:</p><pre>@{replace(replace(string(variables('varFalhas')), '&', '&amp;'), '<', '&lt;')}</pre>`,
    'emailMessage/Importance': 'Normal',
  })
  scope.Condition_FalhasServico = {
    type: 'If',
    expression: `@greater(${QTD_FALHAS}, 0)`,
    actions: { Send_an_email_Falhas_Servico: email },
    else: { actions: {} },
    runAfter: ok('Delay'),
  }
}

// Passageiro i do serviço corresponde à entrada do varGUIDMap como no Filter_FindGUID/Filter_FindGUID_PorNome.
function paxCorresponde(i) {
  const nome = `items('Loop_Servicos')?['Passageiro ${i} - Nome']`
  const guid = `string(coalesce(items('Loop_Servicos')?['Passageiro ${i} - GUID'], ''))`
  return `and(not(empty(coalesce(${nome}, ''))), or(and(not(empty(${guid})), equals(item()?['guidTenaris'], ${guid})), equals(toLower(trim(coalesce(item()?['guidNome'], ''))), toLower(trim(coalesce(${nome}, ''))))))`
}

function vinculos(servico) {
  for (const n of ['Compose_PaxAtual', 'Compose_PaxSalvo', 'Condition_PaxMudou', 'List_rows_Geral', 'Compose_Status', 'List_rows_LinksServicoExistentes', 'Loop_Create_Pax']) {
    exigir(n in servico, `ação '${n}' ausente no Loop_Servicos`)
  }
  const deleteRow = servico.Condition_PaxMudou.actions?.Loop_Delete_Pax?.actions?.Condition_nao_vazio?.actions?.Delete_a_row
  exigir(deleteRow, 'Delete_a_row ausente em Condition_PaxMudou')
  remover(servico, ['Compose_PaxAtual', 'Compose_PaxSalvo', 'Condition_PaxMudou'], ' no Loop_Servicos')
  servico.List_rows_Geral.runAfter = {}
  servico.Compose_Status.runAfter = ok('List_rows_Geral')

  servico.Select_PaxNativos = {
    type: 'Select',
    inputs: {
      from: "@variables('varGUIDMap')",
      select: `@if(or(${[1, 2, 3, 4].map(paxCorresponde).join(', ')}), toLower(coalesce(item()?['guidNativo'], '')), '-')`,
    },
    runAfter: ok('List_rows_LinksServicoExistentes'),
  }
  servico.Filter_VinculosRemover = {
    type: 'Query',
    inputs: {
      from: "@outputs('List_rows_LinksServicoExistentes')?['body/value']",
      // Só apaga quando o serviço tem passageiro (protege contra linha vazia vinda do Power Query) e todos eles foram
      // achados no varGUIDMap (protege contra pessoas[] incompleto do script: sem isso o vínculo sumiria sem ser recriado).
      where: "@and(greater(length(body('Filter_PaxValidos')), 0), greaterOrEquals(sub(length(union(body('Select_PaxNativos'), createArray('-'))), 1), length(body('Filter_PaxValidos'))), not(contains(body('Select_PaxNativos'), toLower(coalesce(item()?['_cr40f_bancodedados_value'], '')))))",
    },
    runAfter: ok('Select_PaxNativos'),
  }
  const apagar = copiaSolta(deleteRow)
  apagar.inputs.parameters.recordId = "@items('Loop_Delete_Pax')?['cr40f_servicosporpassageiroid']"
  servico.Loop_Delete_Pax = {
    type: 'Foreach',
    foreach: "@body('Filter_VinculosRemover')",
    actions: { Delete_a_row: apagar },
    runAfter: ok('Filter_VinculosRemover'),
    runtimeConfiguration: { concurrency: { repetitions: 50 } },
  }
  servico.Loop_Create_Pax.runAfter = ok('Loop_Delete_Pax')
}

function servicoIsolado(loopServicos) {
  loopServicos.actions = {
    Scope_Servico: { type: 'Scope', actions: loopServicos.actions, runAfter: {} },
    Filter_ErroServico: {
      type: 'Query',
      inputs: {
        from: "@result('Scope_Servico')",
        where: "@or(equals(item()?['status'], 'Failed'), equals(item()?['status'], 'TimedOut'))",
      },
      runAfter: { Scope_Servico: ['Failed', 'TimedOut'] },
    },
    Append_to_array_variable_varFalhas: {
      type: 'AppendToArrayVariable',
      inputs: {
        name: 'varFalhas',
        value: {
          id: "@{items('Loop_Servicos')?['GUID']}",
          idPrincipal: "@{items('Loop_Servicos')?['IDPrincipal']}",
          acao: "@{first(body('Filter_ErroServico'))?['name']}",
          erro: "@{take(coalesce(first(body('Filter_ErroServico'))?['error']?['message'], first(body('Filter_ErroServico'))?['code'], 'sem detalhe'), 300)}",
        },
      },
      runAfter: { Filter_ErroServico: ['Succeeded', 'Failed'] },
    },
  }
}

function variaveis(definition) {
  const a = definition.actions
  exigir('Initialize_variable_varGUIDMap' in a, "ação 'Initialize_variable_varGUIDMap' ausente")
  remover(a, ['Initialize_variable_varGUIDsVistos', 'Initialize_variable_varNomesVistos', 'Initialize_variable_varPessoasUnicas'], '')
  a.Initialize_variable_varGUIDMap.runAfter = {}
  a.Initialize_variable_varFalhas = {
    type: 'InitializeVariable',
    inputs: { variables: [{ name: 'varFalhas', type: 'array', value: [] }] },
    runAfter: ok('Initialize_variable_varGUIDMap'),
  }
  a.Scope.runAfter = ok('Initialize_variable_varFalhas')
}

function gatilho(definition) {
  const props = definition.triggers?.manual?.inputs?.schema?.properties
  exigir(props && 'ultimaSyncAntes' in props && 'executadoEm' in props, 'gatilho sem ultimaSyncAntes/executadoEm')
  props.pessoas = { type: 'array' }
  props.versao = { type: 'integer' }
}

// Lança erro se o formato for inesperado; nunca altera o objeto recebido.
export function transformar(clientdataOriginal) {
  if (estado(clientdataOriginal) === 'final') return { clientdata: clientdataOriginal, mudou: false }
  const clientdata = structuredClone(clientdataOriginal)
  const { definition, scope, lote } = partes(clientdata)
  gatilho(definition)
  variaveis(definition)
  pessoasDoScript(lote)
  vinculos(lote.Loop_Servicos.actions)
  servicoIsolado(lote.Loop_Servicos)
  painel(scope)
  payloadAntigo(scope)
  const problemas = problemasDeReferencia(definition)
  if (problemas.length) throw new Error(`Patch gerou referências quebradas:\n  ${problemas.join('\n  ')}`)
  return { clientdata, mudou: true }
}

// ---------- CLI ----------

function args(argv) {
  const o = { apply: false, confirmarProd: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const valor = () => { if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`${a} exige um valor.`); return argv[++i] }
    if (a === '--apply') o.apply = true
    else if (a === '--confirmar-prod') o.confirmarProd = true
    else if (a === '--ambiente') o.ambiente = valor().toUpperCase()
    else if (a === '--restaurar') o.restaurar = valor()
    else if (a === '--arquivo') o.arquivo = valor()
    else if (a === '--saida') o.saida = valor()
    else throw new Error(`Argumento desconhecido: ${a}`)
  }
  if (o.arquivo) {
    if (!o.saida || o.apply || o.restaurar || o.ambiente) throw new Error('--arquivo é só local: use com --saida, sem --ambiente, --apply nem --restaurar.')
    return o
  }
  if (!URLS[o.ambiente]) throw new Error('Informe --ambiente DEV ou PROD.')
  if (o.restaurar && !o.apply) throw new Error('--restaurar grava no flow; use junto com --apply.')
  if (o.ambiente === 'PROD' && o.apply && !o.confirmarProd) throw new Error('PROD exige --confirmar-prod junto com --apply.')
  return o
}

const lerTexto = (f) => readFileSync(resolve(f), 'utf8').replace(/^\uFEFF/, '')
function semMojibake(texto, origem) {
  if (MOJIBAKE.test(texto)) throw new Error(`Texto com acentuação corrompida em ${origem}; nada foi gravado.`)
}
// Aceita o clientdata puro ou o registro do workflow com clientdata em texto.
function lerClientdata(texto) {
  const obj = JSON.parse(texto)
  return typeof obj.clientdata === 'string' ? JSON.parse(obj.clientdata) : obj
}
const resumo = (cd) => {
  const { scope, lote } = partes(cd)
  return `Scope: ${Object.keys(scope).join(', ')}\n  Lote: ${Object.keys(lote).join(', ')}\n  Loop_Servicos: ${Object.keys(lote.Loop_Servicos.actions).join(', ')}`
}

function dataverse(ambiente) {
  const base = URLS[ambiente]
  // DV_ACCESS_TOKEN (dv-token.mjs, Linux sem az) tem prioridade, como nos outros scripts de packages/deploy.
  const az = process.platform === 'win32' ? 'az.cmd' : 'az'
  const token = process.env.DV_ACCESS_TOKEN?.trim() || execFileSync(az, ['account', 'get-access-token', '--resource', `${base}/`, '--query', 'accessToken', '-o', 'tsv'], {
    encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'inherit'],
  }).trim()
  if (!token) throw new Error(`Token do Dataverse ${ambiente} indisponível (rode az login ou defina DV_ACCESS_TOKEN).`)
  return async (metodo, caminho, corpo) => {
    const rota = caminho.split('?')[0]
    console.log(`[tenaris-lote] ${metodo} ${rota}`)
    const r = await fetch(`${base}/api/data/v9.2/${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
        ...(corpo ? { 'Content-Type': 'application/json; charset=utf-8', 'If-Match': '*' } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const texto = await r.text()
    if (!r.ok) {
      // O conector do Excel confere os parâmetros do Run_script no script publicado na planilha.
      const dica = texto.includes('WorkflowOperationParametersExtraParameter')
        ? '\nO script da planilha ainda não tem executadoEm/falhas: instale o MarcarStatusSync_v5.5 no Excel antes do patch.'
        : ''
      throw new Error(`${metodo} ${rota}: HTTP ${r.status} ${texto.slice(0, 600)}${dica}`)
    }
    return texto ? JSON.parse(texto) : null
  }
}

function backup(ambiente, clientdataTexto) {
  if (clientdataTexto.includes('sig=')) throw new Error('O clientdata contém URL assinada (sig=); revise antes de continuar.')
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'flows', 'backup')
  mkdirSync(dir, { recursive: true })
  const agora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(/\D/g, '')
  const arquivo = join(dir, `Flow-Tenaris-${ambiente}-${agora.slice(0, 8)}-${agora.slice(8)}.json`)
  writeFileSync(arquivo, clientdataTexto, { encoding: 'utf8', flag: 'wx' })
  console.log(`[tenaris-lote] backup: ${arquivo}`)
  return arquivo
}

async function gravar(dv, flow, clientdataTexto) {
  semMojibake(clientdataTexto, 'clientdata novo')
  const id = `workflows(${FLOW_ID})`
  if (flow.statecode !== 1) return dv('PATCH', id, { clientdata: clientdataTexto })
  const reativar = async () => {
    await dv('PATCH', id, { statecode: 1, statuscode: 2 })
    const depois = await dv('GET', `${id}?$select=statecode`)
    if (depois.statecode !== 1) throw new Error(`Flow não reativou (statecode ${depois.statecode}). Restaure com --restaurar.`)
  }
  await dv('PATCH', id, { statecode: 0, statuscode: 1 })
  try {
    await dv('PATCH', id, { clientdata: clientdataTexto })
  } catch (e) {
    // Mantém o erro da gravação (com a dica do Excel) mesmo se a reativação também falhar.
    await reativar().catch((r) => { e.message += `\n${r.message}` })
    throw e
  }
  await reativar()
}

async function main(argv) {
  const o = args(argv)
  if (o.arquivo) {
    const { clientdata, mudou } = transformar(lerClientdata(lerTexto(o.arquivo)))
    const texto = JSON.stringify(clientdata, null, 2)
    semMojibake(texto, o.saida)
    writeFileSync(resolve(o.saida), texto, 'utf8')
    console.log(`${mudou ? 'Transformado' : 'Já estava no formato final'}: ${o.saida}\n  ${resumo(clientdata)}`)
    return
  }
  const dv = dataverse(o.ambiente)
  const flow = await dv('GET', `workflows(${FLOW_ID})?$select=name,statecode,clientdata,modifiedon`)
  if (flow.name !== FLOW_NOME) throw new Error(`O workflow ${FLOW_ID} não é '${FLOW_NOME}' no ${o.ambiente}.`)
  semMojibake(flow.clientdata, `clientdata do ${o.ambiente}`)

  if (o.restaurar) {
    const backupLido = JSON.parse(lerTexto(o.restaurar))
    const esperado = estado(backupLido) // recusa arquivo que não é backup deste flow ou que está pela metade
    backup(o.ambiente, flow.clientdata)
    await gravar(dv, flow, JSON.stringify(backupLido))
    const conf = await dv('GET', `workflows(${FLOW_ID})?$select=clientdata`)
    if (estado(JSON.parse(conf.clientdata)) !== esperado) throw new Error(`A restauração não persistiu o formato '${esperado}' do backup.`)
    console.log(`${o.ambiente}: '${FLOW_NOME}' restaurado de ${o.restaurar} (statecode original ${flow.statecode}).`)
    return
  }

  const { clientdata, mudou } = transformar(JSON.parse(flow.clientdata))
  console.log(`${o.ambiente}: '${FLOW_NOME}' (statecode ${flow.statecode}, modificado ${flow.modifiedon})`)
  if (!mudou) { console.log('Já está no formato final; nada a fazer.'); return }
  console.log(`Depois do patch:\n  ${resumo(clientdata)}`)
  if (!o.apply) { console.log('DRY RUN: nada foi gravado. Use --apply para gravar.'); return }

  backup(o.ambiente, flow.clientdata)
  await gravar(dv, flow, JSON.stringify(clientdata))
  const conf = await dv('GET', `workflows(${FLOW_ID})?$select=clientdata,statecode`)
  if (estado(JSON.parse(conf.clientdata)) !== 'final') throw new Error('A gravação não persistiu o formato final; restaure o backup.')
  console.log(`${o.ambiente}: '${FLOW_NOME}' atualizado (statecode ${conf.statecode}).`)
}

if (rodandoComoCli(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1) })
}
