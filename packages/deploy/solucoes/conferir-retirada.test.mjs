import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerJson } from './arquivo.mjs'
import { conferirRetirada, retiradaOk } from './conferir-retirada.mjs'

const regras = await lerJson(new URL('./regras.json', import.meta.url))
const foto = (componentes, tipos = {}, pacotes = {}) => ({ componentes, tipos, pacotes })

test('componente na AppBetinhos e numa das 4 pode sair', () => {
  const r = conferirRetirada(foto({ t: ['AppBetinhos', 'BetinhosCore'], f: ['gerarpagantes', 'AppBetinhos', 'BetinhosAutomacao'] }, { t: 1, f: 29 }), regras)
  assert.deepEqual(r, { soNaCaixa: [], emDuasNovas: [], peloPacote: [], retiradosNoDev: [], tabelasComDadosNaCaixa: [] })
  assert.equal(retiradaOk(r), true)
})
test('componente só na AppBetinhos seria apagado: reprova', () => {
  const r = conferirRetirada(foto({ v: ['AppBetinhos'], t: ['AppBetinhos', 'BetinhosCore'] }, { v: 381, t: 1 }), regras)
  assert.deepEqual(r.soNaCaixa, [{ id: 'v', tipo: 381, solucoes: ['AppBetinhos'] }])
  assert.equal(retiradaOk(r), false)
})
test('componente só na gerarpagantes, ou nas duas caixas, também reprova', () => {
  const r = conferirRetirada(foto({ a: ['gerarpagantes'], b: ['AppBetinhos', 'gerarpagantes'] }, { a: 61, b: 61 }), regras)
  assert.deepEqual(r.soNaCaixa.map((x) => x.id), ['a', 'b'])
})
test('componente em duas das 4 reprova', () => {
  const r = conferirRetirada(foto({ a: ['AppBetinhos', 'BetinhosCore', 'BetinhosInterface'] }, { a: 61 }), regras)
  assert.deepEqual(r.emDuasNovas, [{ id: 'a', tipo: 61, solucoes: ['BetinhosCore', 'BetinhosInterface'] }])
  assert.equal(retiradaOk(r), false)
})
test('assembly cujo pacote está na Automação é liberado e aparece em peloPacote', () => {
  const r = conferirRetirada(foto({ asm: ['AppBetinhos'], pkg: ['AppBetinhos', 'BetinhosAutomacao'] }, { asm: 91, pkg: 10090 }, { asm: 'pkg' }), regras)
  assert.deepEqual(r, { soNaCaixa: [], emDuasNovas: [], peloPacote: [{ id: 'asm', pacote: 'pkg' }], retiradosNoDev: [], tabelasComDadosNaCaixa: [] })
})
test('assembly cujo pacote não está na Automação reprova', () => {
  const r = conferirRetirada(foto({ asm: ['AppBetinhos'], pkg: ['AppBetinhos'] }, { asm: 91, pkg: 10090 }, { asm: 'pkg' }), regras)
  assert.deepEqual(r.soNaCaixa.map((x) => x.id).sort(), ['asm', 'pkg'])
})
test('assembly sem pacote reprova', () => {
  const r = conferirRetirada(foto({ asm: ['AppBetinhos'] }, { asm: 91 }), regras)
  assert.deepEqual(r.soNaCaixa, [{ id: 'asm', tipo: 91, solucoes: ['AppBetinhos'] }])
})
test('a liberação vale só para assembly: outro tipo com pacote registrado reprova', () => {
  const r = conferirRetirada(foto({ x: ['AppBetinhos'], pkg: ['BetinhosAutomacao'] }, { x: 61, pkg: 10090 }, { x: 'pkg' }), regras)
  assert.deepEqual(r.soNaCaixa.map((x) => x.id), ['x'])
})
test('componente sem nenhum dono na foto reprova', () => {
  const r = conferirRetirada(foto({ x: [] }, { x: 61 }), regras)
  assert.deepEqual(r.soNaCaixa, [{ id: 'x', tipo: 61, solucoes: [] }])
  assert.equal(retiradaOk(r), false)
})
test('componente sem tipo na foto aparece com tipo null', () => {
  const r = conferirRetirada(foto({ x: ['AppBetinhos'] }), regras)
  assert.deepEqual(r.soNaCaixa, [{ id: 'x', tipo: null, solucoes: ['AppBetinhos'] }])
})
test('foto sem componentes falha', () => assert.throws(() => conferirRetirada(foto({}), regras), /nao tem componentes/))
test('foto antiga, sem tipos ou pacotes, falha', () => {
  assert.throws(() => conferirRetirada({ componentes: { a: ['BetinhosCore'] }, pacotes: {} }, regras), /foto antiga/)
  assert.throws(() => conferirRetirada({ componentes: { a: ['BetinhosCore'] }, tipos: {} }, regras), /foto antiga/)
})

const dev = { componentes: { t: ['AppBetinhos', 'BetinhosCore'] } }
test('com foto do DEV: componente só na caixa que o DEV não tem mais saiu de propósito (informativo)', () => {
  const r = conferirRetirada(foto({ v: ['AppBetinhos'], t: ['AppBetinhos', 'BetinhosCore'] }, { v: 381, t: 1 }), regras, { fotoDev: dev })
  assert.deepEqual(r.soNaCaixa, [])
  assert.deepEqual(r.retiradosNoDev, [{ id: 'v', tipo: 381, nome: null }])
  assert.equal(retiradaOk(r), true)
})
test('com foto do DEV: componente só na caixa que o DEV ainda tem é falha de distribuição (reprova)', () => {
  const r = conferirRetirada(foto({ v: ['AppBetinhos'] }, { v: 381 }), regras, { fotoDev: { componentes: { v: ['AppBetinhos'] } } })
  assert.deepEqual(r.soNaCaixa.map((x) => x.id), ['v'])
  assert.equal(retiradaOk(r), false)
})
test('com foto do DEV: tabela retirada vazia passa; com registros só se aceita; sem nome na foto reprova', () => {
  const f = { ...foto({ a: ['AppBetinhos'], b: ['AppBetinhos'], c: ['AppBetinhos'] }, { a: 1, b: 1, c: 1 }), nomes: { a: 'cr40f_a', b: 'cr40f_b' }, registros: { cr40f_a: 0, cr40f_b: 3 } }
  const r = conferirRetirada(f, regras, { fotoDev: dev })
  assert.deepEqual(r.tabelasComDadosNaCaixa, [{ id: 'b', nome: 'cr40f_b', registros: 3 }, { id: 'c', nome: null, registros: null }])
  assert.equal(retiradaOk(r), false)
  const aceita = conferirRetirada({ ...f, componentes: { a: ['AppBetinhos'], b: ['AppBetinhos'] } }, regras, { fotoDev: dev, aceitarTabelas: ['cr40f_b'] })
  assert.deepEqual(aceita.tabelasComDadosNaCaixa, [])
  assert.equal(retiradaOk(aceita), true)
})
test('foto do DEV sem componentes falha', () => {
  assert.throws(() => conferirRetirada(foto({ v: ['AppBetinhos'] }, { v: 381 }), regras, { fotoDev: { componentes: {} } }), /foto do DEV/)
})
