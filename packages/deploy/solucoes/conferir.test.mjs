import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SOLUCAO_ACTIVE, conferenciaOk, conferirCobertura, conferirDependencias } from './conferir.mjs'

const permitidas = {
  BetinhosCore: [],
  BetinhosAutomacao: ['BetinhosCore'],
  BetinhosInterface: ['BetinhosCore', 'BetinhosAutomacao'],
  BetinhosMotoristas: ['BetinhosCore', 'BetinhosAutomacao'],
}

test('tudo distribuído e no lugar passa', () => {
  const cobertura = conferirCobertura({
    caixa: ['a', 'b'],
    porSolucao: { BetinhosCore: ['a'], BetinhosInterface: ['b'] },
    atribuicoes: [{ id: 'a', solucao: 'BetinhosCore' }, { id: 'b', solucao: 'BetinhosInterface' }],
  })
  assert.deepEqual(cobertura, { semDono: [], emDuas: [], foraDoLugar: [] })
  assert.equal(conferenciaOk(cobertura, []), true)
})
test('componente da caixa sem dono aparece', () => {
  const r = conferirCobertura({ caixa: ['a', 'x'], porSolucao: { BetinhosCore: ['a'] }, atribuicoes: [] })
  assert.deepEqual(r.semDono, ['x'])
})
test('componente em duas soluções aparece', () => {
  const r = conferirCobertura({ caixa: ['a'], porSolucao: { BetinhosCore: ['a'], BetinhosInterface: ['a'] }, atribuicoes: [] })
  assert.deepEqual(r.emDuas, [{ id: 'a', solucoes: ['BetinhosCore', 'BetinhosInterface'] }])
})
test('componente na solução errada aparece', () => {
  const r = conferirCobertura({ caixa: ['a'], porSolucao: { BetinhosInterface: ['a'] }, atribuicoes: [{ id: 'a', solucao: 'BetinhosCore' }] })
  assert.deepEqual(r.foraDoLugar, [{ id: 'a', esta: 'BetinhosInterface', deveria: 'BetinhosCore' }])
})
const SISTEMA = 'fd140aad-4df4-11dd-bd17-0019b9312238'
const dep = (requerido, tipo, extra = {}) => ({ requerido, tipo, base: SOLUCAO_ACTIVE, pai: null, dependente: 'd', tipoDependente: 1, ...extra })

test('Interface depender de Core é permitido', () => {
  const v = conferirDependencias({ ausentes: { BetinhosInterface: [dep('t', 1)] }, porSolucao: { BetinhosCore: ['t'] }, permitidas })
  assert.deepEqual(v, [])
})
test('Core depender de Interface é violação para cima', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [dep('w', 61)] }, porSolucao: { BetinhosInterface: ['w'] }, permitidas })
  assert.deepEqual(v, [{ solucao: 'BetinhosCore', requerido: 'w', tipo: 61, pai: null, dependente: 'd', tipoDependente: 1, motivo: 'para cima', donoDoRequerido: 'BetinhosInterface' }])
})
test('dependência do sistema (base diferente da Active) fora das 4 é ignorada', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [dep('systemuser', 1, { base: SISTEMA }), dep('msdyn_x', 1, { base: 'b0000000-0000-0000-0000-00000000000b' })] }, porSolucao: {}, permitidas })
  assert.deepEqual(v, [])
})
test('dependência de componente próprio (base Active) fora das 4 é violação', () => {
  // Caso real do DEV em 21/10: cr40f_funcionarios e cr40f_reservadeveculos (Core) exigem cr40f_cobrancastripe, que só estava na Default.
  const cobranca = '9157c887-f088-4ae0-b047-6c32a8714ea1'
  const v = conferirDependencias({
    ausentes: { BetinhosCore: [dep(cobranca, 1, { dependente: 'funcionarios' }), dep(cobranca, 1, { dependente: 'reservas' })] },
    porSolucao: { BetinhosCore: ['funcionarios', 'reservas'] }, permitidas,
  })
  assert.deepEqual(v.map((x) => [x.motivo, x.requerido, x.dependente, x.donoDoRequerido]), [['fora das 4', cobranca, 'funcionarios', null], ['fora das 4', cobranca, 'reservas', null]])
})
test('base Active em maiúsculas também conta como componente próprio', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [dep('x', 1, { base: SOLUCAO_ACTIVE.toUpperCase() })] }, porSolucao: {}, permitidas })
  assert.equal(v[0].motivo, 'fora das 4')
})
test('dependência sem base informada fora das 4 é violação (não adivinhar)', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [{ requerido: 'x', tipo: 1 }] }, porSolucao: {}, permitidas })
  assert.equal(v.length, 1)
  assert.equal(v[0].motivo, 'fora das 4')
})
test('atributo cuja tabela pai está no Core é permitido para a Automação', () => {
  const v = conferirDependencias({ ausentes: { BetinhosAutomacao: [dep('coluna', 2, { pai: 'tabela' })] }, porSolucao: { BetinhosCore: ['tabela'] }, permitidas })
  assert.deepEqual(v, [])
})
test('formulário cuja tabela pai está no Core é permitido para Motoristas', () => {
  const v = conferirDependencias({ ausentes: { BetinhosMotoristas: [dep('form', 60, { pai: 'tabela' })] }, porSolucao: { BetinhosCore: ['tabela'] }, permitidas })
  assert.deepEqual(v, [])
})
test('subcomponente cuja tabela pai está numa camada acima é violação para cima', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [dep('coluna', 2, { pai: 'tabela' })] }, porSolucao: { BetinhosAutomacao: ['tabela'] }, permitidas })
  assert.deepEqual(v.map((x) => [x.motivo, x.donoDoRequerido]), [['para cima', 'BetinhosAutomacao']])
})
test('subcomponente próprio sem pai resolvido é violação fora das 4', () => {
  const v = conferirDependencias({ ausentes: { BetinhosAutomacao: [dep('coluna', 2)] }, porSolucao: { BetinhosCore: ['tabela'] }, permitidas })
  assert.deepEqual(v.map((x) => [x.motivo, x.requerido]), [['fora das 4', 'coluna']])
})
test('subcomponente com pai fora das 4 e base Active é violação fora das 4', () => {
  const v = conferirDependencias({ ausentes: { BetinhosAutomacao: [dep('coluna', 2, { pai: 'tabela-da-default' })] }, porSolucao: { BetinhosCore: ['tabela'] }, permitidas })
  assert.deepEqual(v.map((x) => [x.motivo, x.pai]), [['fora das 4', 'tabela-da-default']])
})
test('violação reprova a conferência', () => assert.equal(conferenciaOk({ semDono: [], emDuas: [], foraDoLugar: [] }, [{}]), false))
