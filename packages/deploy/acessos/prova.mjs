// Prova dos acessos por perfil no DEV (spec, secao 10). Le como o usuario de teste (MSCRMCallerID) e confere
// edicao e exclusao pelos privilegios efetivos: nunca grava em dado de negocio. Nao imprime valor nem pessoa.
// Uso: DV_URL=https://org23b93544.crm2.dynamics.com DV_ACCESS_TOKEN=<token> DV_TESTE_ID=<guid> DV_ALVO_ID=<guid> node packages/deploy/acessos/prova.mjs
// Fora do alcance: telefone, e-mail, nascimento e endereco de saida do passageiro (protecao adiada para o plano do corte).
// O dono do token precisa ser Administrador do Sistema. Os dois usuarios nao podem ter papel nem perfil de coluna antigo.
const BASE = (process.env.DV_URL ?? '').replace(/\/+$/, '')
const TOKEN = process.env.DV_ACCESS_TOKEN
const TESTE = (process.env.DV_TESTE_ID ?? '').toLowerCase()
const ALVO = (process.env.DV_ALVO_ID ?? '').toLowerCase()
const DEV = 'https://org23b93544.crm2.dynamics.com'
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function parar(mensagem) {
  console.error(mensagem)
  process.exit(2)
}

if (!BASE || !TOKEN) parar('Defina DV_URL e DV_ACCESS_TOKEN.')
if (BASE !== DEV) parar('A prova so roda no DEV (org23b93544).')
if (!GUID.test(TESTE) || !GUID.test(ALVO) || TESTE === ALVO) parar('Defina DV_TESTE_ID e DV_ALVO_ID com dois ids de usuario diferentes.')

const API = `${BASE}/api/data/v9.2`

async function chamar(caminho, { como, metodo = 'GET', corpo } = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' }
  if (como) headers.MSCRMCallerID = como
  if (corpo) headers['Content-Type'] = 'application/json'
  const resposta = await fetch(`${API}/${caminho}`, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined })
  const texto = await resposta.text()
  let json = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    // resposta sem JSON (ex.: pagina de erro do gateway): o status ja diz o que houve
  }
  return { status: resposta.status, json, erro: json?.error?.message ?? '' }
}

async function valores(caminho) {
  const r = await chamar(caminho)
  if (r.status !== 200) throw new Error(`GET ${caminho.split('?')[0]} devolveu ${r.status}`)
  return r.json.value ?? []
}

const nomes = async (caminho) => (await valores(caminho)).map((linha) => linha.name)

// Papeis e perfis de coluna (diretos e de equipe) que nao sao "Perfil - *": com eles a prova nao prova nada.
async function sobras(usuario) {
  const u = `systemusers(${usuario})`
  const equipes = await valores(`${u}/teammembership_association?$select=teamid`)
  const listas = await Promise.all([
    nomes(`${u}/systemuserroles_association?$select=name`),
    nomes(`${u}/systemuserprofiles_association?$select=name`),
    ...equipes.flatMap((e) => [
      nomes(`teams(${e.teamid})/teamroles_association?$select=name`),
      nomes(`teams(${e.teamid})/teamprofiles_association?$select=name`),
    ]),
  ])
  return [...new Set(listas.flat())].filter((nome) => !nome.startsWith('Perfil - '))
}

const definir = (usuario, perfis, como) =>
  chamar('cr40f_AcessoDefinirPerfis', { como, metodo: 'POST', corpo: { Usuario: usuario, Perfis: JSON.stringify(perfis) } })

async function preparar(usuario, perfis) {
  const r = await definir(usuario, perfis)
  if (r.status !== 200) throw new Error(`Nao consegui preparar o cenario (${r.status}): ${r.erro}`)
}

const metas = new Map()
async function meta(tabela) {
  if (!metas.has(tabela)) {
    const r = await chamar(`EntityDefinitions(LogicalName='${tabela}')?$select=EntitySetName,PrimaryIdAttribute,Privileges`)
    if (r.status !== 200) throw new Error(`Tabela ${tabela} nao existe no ambiente (${r.status}).`)
    metas.set(tabela, { conjunto: r.json.EntitySetName, chave: r.json.PrimaryIdAttribute, privilegios: r.json.Privileges })
  }
  return metas.get(tabela)
}

// true/false = o usuario tem ou nao o privilegio (Read, Write, Delete...) na tabela; null = nao deu para saber.
async function pode(usuario, tabela, tipo) {
  const { privilegios } = await meta(tabela)
  const id = privilegios.find((p) => p.PrivilegeType === tipo)?.PrivilegeId?.toLowerCase()
  const r = await chamar(`systemusers(${usuario})/Microsoft.Dynamics.CRM.RetrieveUserPrivileges()`)
  if (!id || r.status !== 200) return null
  return r.json.RolePrivileges.some((p) => p.PrivilegeId.toLowerCase() === id)
}

// Id de uma linha (lida como administrador) com todas as colunas preenchidas; null = o DEV nao tem linha assim.
async function linhaCom(tabela, colunas) {
  const { conjunto, chave } = await meta(tabela)
  const filtro = encodeURIComponent(colunas.map((c) => `${c} ne null`).join(' and '))
  const linhas = await valores(`${conjunto}?$select=${chave}&$filter=${filtro}&$top=1`)
  return linhas[0]?.[chave] ?? null
}

async function ler(tabela, id, colunas) {
  if (!id) return null
  const { conjunto } = await meta(tabela)
  return chamar(`${conjunto}(${id})?$select=${colunas.join(',')}`, { como: TESTE })
}

async function statusDaLista(tabela) {
  const { conjunto, chave } = await meta(tabela)
  return (await chamar(`${conjunto}?$select=${chave}&$top=1`, { como: TESTE })).status
}

async function historicoDe(usuario) {
  const { conjunto, chave } = await meta('cr40f_acessohistorico')
  return (await valores(`${conjunto}?$select=${chave}&$filter=_cr40f_usuario_value eq ${usuario}`)).length
}

const cheio = (r, coluna) => (r ? r.status === 200 && r.json[coluna] != null && r.json[coluna] !== '' : null)
const vazio = (r, coluna) => (r ? r.status === 200 && r.json[coluna] == null : null)
const nao = (valor) => (valor === null ? null : !valor)
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms))

let falhas = 0
let inconclusivos = 0

// passos() devolve [descricao, true | false | null]. O Dataverse leva alguns segundos para enxergar papel novo,
// por isso repete ate 5 vezes enquanto houver passo falso. O estado do cenario e preparado antes, fora de passos.
async function cenario(nome, passos) {
  let resultado = []
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    resultado = await passos()
    if (!resultado.some(([, ok]) => ok === false)) break
    if (tentativa < 5) await espera(3000)
  }
  const ruins = resultado.filter(([, ok]) => ok === false).map(([descricao]) => descricao)
  const semDado = resultado.filter(([, ok]) => ok === null).map(([descricao]) => descricao)
  if (ruins.length) {
    falhas++
    console.log(`cenario ${nome}: FALHOU\n  - ${ruins.join('\n  - ')}`)
  } else if (semDado.length) {
    inconclusivos++
    console.log(`cenario ${nome}: INCONCLUSIVO (sem linha de teste no DEV)\n  - ${semDado.join('\n  - ')}`)
  } else {
    console.log(`cenario ${nome}: OK`)
  }
}

const eu = (await chamar('WhoAmI')).json?.UserId
if (!eu) parar('Token recusado pelo DEV.')
if (eu === TESTE || eu === ALVO) parar('O dono do token nao pode ser o usuario de teste nem o alvo.')
if (!(await valores(`customapis?$select=uniquename&$filter=uniquename eq 'cr40f_AcessoDefinirPerfis'`)).length) {
  parar('A Custom API cr40f_AcessoDefinirPerfis ainda nao esta no DEV (espere o Deploy da develop).')
}
for (const [rotulo, id] of [['de teste', TESTE], ['alvo', ALVO]]) {
  const antigos = await sobras(id)
  if (antigos.length) parar(`O usuario ${rotulo} tem papel ou perfil de coluna fora dos "Perfil - *": ${antigos.join(', ')}.`)
}

const FINANCEIRO = { perfil: 'financeiro', nivel: 'operador' }
const ACESSOS = { perfil: 'acessos' }
const ordem = await linhaCom('cr40f_financeiro', ['cr40f_valor'])
const banco = await linhaCom('cr40f_bancodedados', ['cr40f_cr'])
const funcionario = await linhaCom('cr40f_funcionarios', ['cr40f_numerodocpf', 'cr40f_numerodorg', 'cr40f_cnh'])

try {
  await preparar(ALVO, [])

  await preparar(TESTE, [])
  await cenario('1 (so Base)', async () => {
    const tela = await chamar(`webresourceset?$select=name&$filter=name eq 'cr40f_SistemaBetinhos.html'`, { como: TESTE })
    return [
      ['WhoAmI responde 200', (await chamar('WhoAmI', { como: TESTE })).status === 200],
      ['le o web resource da tela', tela.status === 200 && tela.json.value.length === 1],
      ['cr40f_financeiro devolve 403', (await statusDaLista('cr40f_financeiro')) === 403],
      ['cr40f_funcionarios devolve 403', (await statusDaLista('cr40f_funcionarios')) === 403],
      ['cr40f_veiculos devolve 403', (await statusDaLista('cr40f_veiculos')) === 403],
    ]
  })

  await preparar(TESTE, [FINANCEIRO])
  await cenario('2 (Financeiro Operador)', async () => {
    const op = await ler('cr40f_financeiro', ordem, ['cr40f_valor'])
    const pessoa = await ler('cr40f_funcionarios', funcionario, ['cr40f_numerodocpf', 'cr40f_numerodorg'])
    const cr = await ler('cr40f_bancodedados', banco, ['cr40f_cr'])
    return [
      ['le cr40f_financeiro com o valor preenchido', cheio(op, 'cr40f_valor')],
      ['le cr40f_cr de cr40f_bancodedados preenchido', cheio(cr, 'cr40f_cr')],
      ['pode editar cr40f_financeiro', await pode(TESTE, 'cr40f_financeiro', 'Write')],
      ['nao pode excluir cr40f_financeiro', nao(await pode(TESTE, 'cr40f_financeiro', 'Delete'))],
      ['le cr40f_funcionarios com o CPF vazio', vazio(pessoa, 'cr40f_numerodocpf')],
      ['le cr40f_funcionarios com o RG vazio', vazio(pessoa, 'cr40f_numerodorg')],
      ['nao pode editar cr40f_funcionarios', nao(await pode(TESTE, 'cr40f_funcionarios', 'Write'))],
    ]
  })

  await preparar(TESTE, [{ perfil: 'rh', nivel: 'operador' }])
  await cenario('3a (RH Operador)', async () => {
    const pessoa = await ler('cr40f_funcionarios', funcionario, ['cr40f_numerodocpf', 'cr40f_numerodorg'])
    return [
      ['CPF vazio', vazio(pessoa, 'cr40f_numerodocpf')],
      ['RG vazio', vazio(pessoa, 'cr40f_numerodorg')],
      ['pode editar cr40f_funcionarios', await pode(TESTE, 'cr40f_funcionarios', 'Write')],
      ['nao pode excluir cr40f_funcionarios', nao(await pode(TESTE, 'cr40f_funcionarios', 'Delete'))],
    ]
  })

  await preparar(TESTE, [{ perfil: 'rh', nivel: 'gestor' }])
  await cenario('3b (RH Gestor)', async () => {
    const pessoa = await ler('cr40f_funcionarios', funcionario, ['cr40f_numerodocpf', 'cr40f_numerodorg'])
    return [
      ['CPF preenchido', cheio(pessoa, 'cr40f_numerodocpf')],
      ['RG preenchido', cheio(pessoa, 'cr40f_numerodorg')],
      ['pode excluir cr40f_funcionarios', await pode(TESTE, 'cr40f_funcionarios', 'Delete')],
    ]
  })

  await preparar(TESTE, [{ perfil: 'frota', nivel: 'operador' }])
  await cenario('4 (Frota Operador)', async () => {
    const pessoa = await ler('cr40f_funcionarios', funcionario, ['cr40f_cnh', 'cr40f_numerodocpf'])
    return [
      ['CNH preenchida', cheio(pessoa, 'cr40f_cnh')],
      ['CPF vazio', vazio(pessoa, 'cr40f_numerodocpf')],
      ['nao pode editar cr40f_funcionarios', nao(await pode(TESTE, 'cr40f_funcionarios', 'Write'))],
    ]
  })

  await preparar(TESTE, [ACESSOS])
  const antes = await historicoDe(ALVO)
  await cenario('5 (Administrador de acessos)', async () => {
    const concede = await definir(ALVO, [FINANCEIRO], TESTE)
    const proprio = await definir(TESTE, [ACESSOS, FINANCEIRO], TESTE)
    const promove = await definir(ALVO, [ACESSOS, FINANCEIRO], TESTE)
    const ausente = await chamar('cr40f_AcessoDefinirPerfis', { como: TESTE, metodo: 'POST', corpo: { Usuario: ALVO } })
    const vaziaExplicita = await chamar('cr40f_AcessoDefinirPerfis', { como: TESTE, metodo: 'POST', corpo: { Usuario: ALVO, Perfis: '[]' } })
    const { conjunto, chave } = await meta('cr40f_acessohistorico')
    return [
      ['atribui Financeiro Operador ao alvo', concede.status === 200],
      ['a mudanca aparece no historico do alvo', (await historicoDe(ALVO)) > antes],
      ['le o historico', (await chamar(`${conjunto}?$select=${chave}&$top=1`, { como: TESTE })).status === 200],
      ['mudar o proprio acesso devolve PROPRIO_ACESSO', proprio.erro.includes('PROPRIO_ACESSO')],
      ['conceder Administrador de acessos devolve SEM_PERMISSAO', promove.erro.includes('SEM_PERMISSAO')],
      ['Perfis ausente devolve PERFIL_INVALIDO', ausente.erro.includes('PERFIL_INVALIDO')],
      ['Perfis "[]" explicito deixa o alvo so com o Base', vaziaExplicita.status === 200],
    ]
  })

  await preparar(TESTE, [])
  await cenario('6 (sem o perfil de acessos)', async () => [
    ['definir perfis devolve SEM_PERMISSAO', (await definir(ALVO, [FINANCEIRO], TESTE)).erro.includes('SEM_PERMISSAO')],
  ])
} finally {
  await definir(TESTE, [])
  await definir(ALVO, [])
}

if (falhas) process.exit(1)
if (inconclusivos) process.exit(3)
console.log('prova dos acessos: OK')
