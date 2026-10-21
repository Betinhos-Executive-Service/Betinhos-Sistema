import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conferenciaOk, conferirCobertura, conferirDependencias } from './conferir.mjs'

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
test('Interface depender de Core é permitido', () => {
  const v = conferirDependencias({ ausentes: { BetinhosInterface: [{ requerido: 't', tipo: 1 }] }, porSolucao: { BetinhosCore: ['t'] }, permitidas })
  assert.deepEqual(v, [])
})
test('Core depender de Interface é violação', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [{ requerido: 'w', tipo: 61 }] }, porSolucao: { BetinhosInterface: ['w'] }, permitidas })
  assert.deepEqual(v, [{ solucao: 'BetinhosCore', requerido: 'w', tipo: 61, donoDoRequerido: 'BetinhosInterface' }])
})
test('dependência de componente do sistema (fora das 4) é ignorada', () => {
  const v = conferirDependencias({ ausentes: { BetinhosCore: [{ requerido: 'systemuser', tipo: 1 }] }, porSolucao: {}, permitidas })
  assert.deepEqual(v, [])
})
test('violação reprova a conferência', () => assert.equal(conferenciaOk({ semDono: [], emDuas: [], foraDoLugar: [] }, [{}]), false))
