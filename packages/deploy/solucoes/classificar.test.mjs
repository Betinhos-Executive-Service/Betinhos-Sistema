import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chaveTipo, classificar, validarRegras } from './classificar.mjs'

const regras = JSON.parse(await readFile(new URL('./regras.json', import.meta.url), 'utf8'))
const c = (tipo, extra = {}) => ({ id: `id-${tipo}-${extra.nome ?? ''}`, tipo, entidade: null, nome: '', app: null, bpf: false, comportamento: 0, ...extra })
const solucaoDe = (comp) => classificar([comp], regras).atribuicoes[0]?.solucao

test('regras.json é válido', () => assert.doesNotThrow(() => validarRegras(regras)))
test('tipo abaixo de 10000 vira número em texto', () => assert.equal(chaveTipo({ tipo: 61 }), '61'))
test('tipo acima de 10000 usa a entidade', () => assert.equal(chaveTipo({ tipo: 10036, entidade: 'customapi' }), 'customapi'))
test('tabela vai para o Core', () => assert.equal(solucaoDe(c(1, { nome: 'cr40f_reservadeveculos' })), 'BetinhosCore'))
test('tabela de BPF vai para a Automação', () => assert.equal(solucaoDe(c(1, { bpf: true })), 'BetinhosAutomacao'))
test('fluxo vai para a Automação', () => assert.equal(solucaoDe(c(29)), 'BetinhosAutomacao'))
test('regra de negócio (categoria 2) vai para o Core, junto com a tabela', () => assert.equal(solucaoDe(c(29, { categoria: 2, nome: 'Regra de negocio' })), 'BetinhosCore'))
test('fluxo moderno (categoria 5) continua na Automação', () => assert.equal(solucaoDe(c(29, { categoria: 5, nome: 'Fluxo' })), 'BetinhosAutomacao'))
test('Custom API e parâmetros vão para a Automação', () => {
  assert.equal(solucaoDe(c(10036, { entidade: 'customapi' })), 'BetinhosAutomacao')
  assert.equal(solucaoDe(c(10037, { entidade: 'customapirequestparameter' })), 'BetinhosAutomacao')
})
test('WebResource comum vai para a Interface', () => assert.equal(solucaoDe(c(61, { nome: 'cr40f_SistemaBetinhos.html' })), 'BetinhosInterface'))
test('WebResource do app de motoristas vai para Motoristas', () => assert.equal(solucaoDe(c(61, { nome: 'new_app-motoristas-v2' })), 'BetinhosMotoristas'))
test('biblioteca de comandos do ribbon de tabela vai para o Core, não para a Interface', () => {
  assert.equal(solucaoDe(c(61, { nome: 'new_troca_operacional_commands' })), 'BetinhosCore')
  assert.equal(solucaoDe(c(61, { nome: 'new_model_driven_formulario_geral_command.js' })), 'BetinhosCore')
})
test('ícone de tabela do Core vai para o Core', () => {
  for (const nome of ['new_moneyreceivesvgrepocom', 'new_judgesvgrepocom', 'cr40f_megaphonesvgrepocom']) assert.equal(solucaoDe(c(61, { nome })), 'BetinhosCore', nome)
})
test('biblioteca de formulário de tabela usada pelo app de motoristas vai para o Core', () => {
  assert.equal(solucaoDe(c(61, { nome: 'new_appmotoristas_push_redirect.js' })), 'BetinhosCore')
  assert.equal(solucaoDe(c(61, { nome: 'new_comunicadodestinatario_redirect.js' })), 'BetinhosMotoristas')
})
test('logo usado pelos dois apps (Interface e Motoristas) vai para o Core', () => assert.equal(solucaoDe(c(61, { nome: 'cr40f_LogoBetinhosB' })), 'BetinhosCore'))
test('app e sitemap de motoristas vão para Motoristas', () => {
  assert.equal(solucaoDe(c(80, { nome: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(62, { nome: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(80, { nome: 'cr40f_ModelDrivenBetinhos' })), 'BetinhosInterface')
})
test('configuração de app segue o app pai', () => {
  assert.equal(solucaoDe(c(10091, { entidade: 'appsetting', app: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(10091, { entidade: 'appsetting', app: 'cr40f_ModelDrivenBetinhos' })), 'BetinhosInterface')
})
test('busca do Dataverse segue o app: o dvtablesearch só existe numa solução junto com o app', () => {
  assert.equal(solucaoDe(c(10159, { entidade: 'dvtablesearch', nome: 'M365_Primary_model_new_AppMotoristasv2', app: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(10159, { entidade: 'dvtablesearch', nome: 'M365_Primary_model_cr40f_ModelDrivenBetinhos', app: 'cr40f_ModelDrivenBetinhos' })), 'BetinhosInterface')
  assert.equal(solucaoDe(c(10159, { entidade: 'dvtablesearch', nome: 'outra', app: null })), 'BetinhosCore')
})
test('entidades da busca do Dataverse seguem o app do dvtablesearch pai', () => {
  assert.equal(solucaoDe(c(10161, { entidade: 'dvtablesearchentity', app: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(10161, { entidade: 'dvtablesearchentity', app: 'cr40f_ModelDrivenBetinhos' })), 'BetinhosInterface')
  assert.equal(solucaoDe(c(10161, { entidade: 'dvtablesearchentity', app: null })), 'BetinhosCore')
})
test('servidor MCP vai para Motoristas', () => assert.equal(solucaoDe(c(10288, { entidade: 'mcpserver' })), 'BetinhosMotoristas'))
test('valor de variável é proibido', () => {
  const r = classificar([c(381, { nome: 'new_EmailAdminAvisos' })], regras)
  assert.equal(r.proibidos.length, 1)
  assert.equal(r.atribuicoes.length, 0)
})
test('tipo sem regra não é adivinhado', () => {
  const r = classificar([c(10999, { entidade: 'tipo_novo' })], regras)
  assert.equal(r.semRegra.length, 1)
  assert.equal(r.atribuicoes.length, 0)
})
test('regra que aponta para solução desconhecida falha', () => {
  assert.throws(() => validarRegras({ ...regras, porTipo: { ...regras.porTipo, '61': 'Outra' } }), /Outra/)
})
test('valor de permitidas fora de solucoes falha e nomeia o valor', () => {
  assert.throws(() => validarRegras({ ...regras, permitidas: { ...regras.permitidas, BetinhosCore: ['BetinhosCoer'] } }), /BetinhosCoer/)
})
test('exceção sem exatamente uma condição falha e nomeia o tipo', () => {
  assert.throws(() => validarRegras({ ...regras, excecoes: [{ tipo: '61', solucao: 'BetinhosMotoristas' }] }), /tipo 61/)
  assert.throws(() => validarRegras({ ...regras, excecoes: [{ tipo: '1', nomes: ['x'], bpf: true, solucao: 'BetinhosAutomacao' }] }), /tipo 1/)
})
test('exceção por categoria junto com outra condição falha e nomeia o tipo', () => {
  assert.throws(() => validarRegras({ ...regras, excecoes: [{ tipo: '29', categoria: 2, nomes: ['x'], solucao: 'BetinhosCore' }] }), /tipo 29/)
})
test('exceção com tipo fora de porTipo falha e nomeia o tipo', () => {
  assert.throws(() => validarRegras({ ...regras, excecoes: [{ tipo: '999', nomes: ['x'], solucao: 'BetinhosCore' }] }), /999/)
})

// Cobertura de regras.json (spec, Verificação item 1): toda chave de porTipo, toda exceção e todo proibido.
const componenteDaChave = (chave, extra = {}) => (/^\d+$/.test(chave) ? c(Number(chave), extra) : c(10000, { entidade: chave, ...extra }))
test('toda chave de porTipo sem exceção vai para a solução do tipo', () => {
  for (const [chave, solucao] of Object.entries(regras.porTipo)) assert.equal(solucaoDe(componenteDaChave(chave)), solucao, `porTipo ${chave}`)
})
test('toda exceção de regras.json leva à solução dela', () => {
  for (const e of regras.excecoes) {
    const casos = e.nomes ? e.nomes.map((nome) => ({ nome })) : e.app ? [{ app: e.app }] : e.bpf ? [{ bpf: true }] : [{ categoria: e.categoria }]
    for (const extra of casos) assert.equal(solucaoDe(componenteDaChave(e.tipo, extra)), e.solucao, `excecao ${e.tipo} ${JSON.stringify(extra)}`)
  }
})
test('todo tipo proibido de regras.json é recusado', () => {
  for (const chave of Object.keys(regras.proibidos)) {
    const r = classificar([componenteDaChave(chave)], regras)
    assert.equal(r.proibidos.length, 1, `proibido ${chave}`)
    assert.equal(r.atribuicoes.length, 0)
  }
})
test('dependências permitidas são as da spec', () => {
  assert.deepEqual(regras.permitidas, {
    BetinhosCore: [],
    BetinhosAutomacao: ['BetinhosCore'],
    BetinhosInterface: ['BetinhosCore', 'BetinhosAutomacao'],
    BetinhosMotoristas: ['BetinhosCore', 'BetinhosAutomacao'],
  })
})
