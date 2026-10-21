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
test('Custom API e parâmetros vão para a Automação', () => {
  assert.equal(solucaoDe(c(10036, { entidade: 'customapi' })), 'BetinhosAutomacao')
  assert.equal(solucaoDe(c(10037, { entidade: 'customapirequestparameter' })), 'BetinhosAutomacao')
})
test('WebResource comum vai para a Interface', () => assert.equal(solucaoDe(c(61, { nome: 'cr40f_SistemaBetinhos.html' })), 'BetinhosInterface'))
test('WebResource do app de motoristas vai para Motoristas', () => assert.equal(solucaoDe(c(61, { nome: 'new_app-motoristas-v2' })), 'BetinhosMotoristas'))
test('app e sitemap de motoristas vão para Motoristas', () => {
  assert.equal(solucaoDe(c(80, { nome: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(62, { nome: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(80, { nome: 'cr40f_ModelDrivenBetinhos' })), 'BetinhosInterface')
})
test('configuração de app segue o app pai', () => {
  assert.equal(solucaoDe(c(10091, { entidade: 'appsetting', app: 'new_AppMotoristasv2' })), 'BetinhosMotoristas')
  assert.equal(solucaoDe(c(10091, { entidade: 'appsetting', app: 'cr40f_ModelDrivenBetinhos' })), 'BetinhosInterface')
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
test('exceção com tipo fora de porTipo falha e nomeia o tipo', () => {
  assert.throws(() => validarRegras({ ...regras, excecoes: [{ tipo: '999', nomes: ['x'], solucao: 'BetinhosCore' }] }), /999/)
})
