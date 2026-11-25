import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aplicarPlano, conferirManter, desde, efetivos, lerCorte, lerIds, perdasPorPessoa, planoDoCorte, planoVazio,
} from './corte-regras.mjs'

const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const P = { antigo: ID(1), dev: ID(2), admin: ID(3), base: ID(4), op: ID(5) }
const EQ = ID(100), SERV = ID(200), MANTIDO = ID(201), ANA = ID(202), BIA = ID(203)
const priv = (tabela, tipo, nivel = 8) => ({ tabela, tipo, nivel })
function estado() {
  return {
    servico: SERV,
    equipe: { id: EQ, bu: ID(900) },
    base: P.base,
    papeis: new Map([
      [P.antigo, { id: P.antigo, nome: 'Acesso-Betinhos-MDA', admin: false, privilegios: [
        priv('cr40f_reservadeveculos', 'Read'), priv('cr40f_reservadeveculos', 'Write'),
        priv('cr40f_financeiro', 'Read'), priv('cr40f_financeiro', 'Write'), priv('cr40f_funcionarios', 'Read'),
      ] }],
      [P.dev, { id: P.dev, nome: 'DEV - Usuário', admin: false, privilegios: [priv('cr40f_veiculos', 'Write')] }],
      [P.admin, { id: P.admin, nome: 'Administrador do Sistema', admin: true, privilegios: [] }],
      [P.base, { id: P.base, nome: 'Perfil - Base', admin: false, privilegios: [priv('cr40f_reservadeveculos', 'Read', 1)] }],
      [P.op, { id: P.op, nome: 'Perfil - Operacional - Operador', admin: false, privilegios: [
        priv('cr40f_reservadeveculos', 'Read'), priv('cr40f_reservadeveculos', 'Write'),
      ] }],
    ]),
    equipes: new Map([[EQ, [P.antigo, P.dev]]]),
    pessoas: [
      { id: SERV, app: true, equipes: [], diretos: [P.admin] },
      { id: MANTIDO, app: false, equipes: [EQ], diretos: [P.admin] },
      { id: ANA, app: false, equipes: [EQ], diretos: [P.op] },
      { id: BIA, app: false, equipes: [EQ], diretos: [P.antigo, P.admin] },
    ],
    tabelas: ['cr40f_financeiro', 'cr40f_funcionarios', 'cr40f_reservadeveculos', 'cr40f_veiculos'],
  }
}
const MANTER = new Set([MANTIDO])

test('corte.json: lê o modo de cada ambiente', () => {
  const texto = '﻿{ "dev": "cortar", "prod": "esperar" }'
  assert.equal(lerCorte(texto, 'dev'), 'cortar')
  assert.equal(lerCorte(texto, 'prod'), 'esperar')
})

test('corte.json: recusa modo, chave, ambiente e JSON inválidos', () => {
  assert.throws(() => lerCorte('{ "dev": "ligar", "prod": "esperar" }', 'dev'), /dev precisa ser/)
  assert.throws(() => lerCorte('{ "dev": "esperar", "prod": "esperar", "test": "cortar" }', 'dev'), /chave desconhecida test/)
  assert.throws(() => lerCorte('{ "dev": "esperar", "prod": "esperar" }', 'test'), /ambiente desconhecido/)
  assert.throws(() => lerCorte('{ dev: esperar }', 'dev'), /não é JSON válido/)
  assert.throws(() => lerCorte('{ "dev": "esperar" }', 'prod'), /prod precisa ser/)
})

test('o corte.json versionado começa esperando nos dois ambientes', async () => {
  const { readFileSync } = await import('node:fs')
  const texto = readFileSync(new URL('./corte.json', import.meta.url), 'utf8')
  assert.equal(lerCorte(texto, 'dev'), 'esperar')
  assert.equal(lerCorte(texto, 'prod'), 'esperar')
})

test('ids da variável: vírgulas, espaços, maiúsculas e repetidos', () => {
  assert.deepEqual(lerIds(''), [])
  assert.deepEqual(lerIds(undefined), [])
  assert.deepEqual(
    lerIds(' 00000000-0000-0000-0000-0000000000AA , 00000000-0000-0000-0000-0000000000aa,00000000-0000-0000-0000-0000000000bb '),
    ['00000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000bb'],
  )
  assert.throws(() => lerIds('00000000-0000-0000-0000-0000000000aa, fulano'), /1 id\(s\) fora do formato GUID/)
})

test('janela de 90 dias começa à 00:00 UTC', () => {
  assert.equal(desde(new Date('2026-11-24T15:00:00Z')), '2026-08-26T00:00:00Z')
  assert.equal(desde(new Date('2026-11-24T02:00:00Z'), 1), '2026-11-23T00:00:00Z')
})

test('efetivos: união com o maior nível; admin vale tudo', () => {
  const e = efetivos([{ privilegios: [priv('t', 'Read', 1)] }, { privilegios: [priv('t', 'Read', 4), priv('t', 'Write', 2)] }])
  assert.equal(e.admin, false)
  assert.equal(e.privs.get('t|Read'), 4)
  assert.equal(e.privs.get('t|Write'), 2)
  assert.equal(efetivos([{ admin: true, privilegios: [] }]).admin, true)
})

test('plano: equipe fica só com a Base; antigos e admin direto saem, menos manter e conta de serviço', () => {
  const plano = planoDoCorte(estado(), { manter: MANTER })
  assert.deepEqual(plano.equipeRemover, [P.antigo, P.dev])
  assert.deepEqual(plano.equipeAdicionar, [P.base])
  assert.deepEqual(plano.pessoasRemover, [{ usuario: BIA, papel: P.antigo }, { usuario: BIA, papel: P.admin }])
})

test('plano é idempotente: depois de aplicado, nada a fazer', () => {
  const e = estado()
  const plano = planoDoCorte(e, { manter: MANTER })
  assert.equal(planoVazio(plano), false)
  assert.equal(planoVazio(planoDoCorte(aplicarPlano(e, plano), { manter: MANTER })), true)
})

test('perdas por pessoa: escrita e só leitura', () => {
  const lista = perdasPorPessoa(estado(), planoDoCorte(estado(), { manter: MANTER }))
  const de = (id) => lista.find((p) => p.id === id)
  assert.deepEqual(de(SERV), { id: SERV, escrita: [], leitura: [] })
  assert.deepEqual(de(MANTIDO), { id: MANTIDO, escrita: [], leitura: [] })
  assert.deepEqual(de(ANA), { id: ANA, escrita: ['cr40f_financeiro', 'cr40f_veiculos'], leitura: ['cr40f_funcionarios'] })
  assert.deepEqual(de(BIA).escrita, ['cr40f_financeiro', 'cr40f_funcionarios', 'cr40f_reservadeveculos', 'cr40f_veiculos'])
})

test('admins a manter: vazio, inexistente e sem admin direto travam', () => {
  assert.equal(conferirManter(estado(), new Set()).length, 1)
  assert.deepEqual(conferirManter(estado(), MANTER), [])
  assert.deepEqual(conferirManter(estado(), new Set([ANA])), [{ id: ANA, motivo: 'admin a manter não tem Administrador do Sistema direto' }])
  assert.deepEqual(conferirManter(estado(), new Set([ID(999)])), [{ id: ID(999), motivo: 'admin a manter não é pessoa ativa' }])
  assert.deepEqual(conferirManter(estado(), new Set([SERV])), [{ id: SERV, motivo: 'admin a manter não é pessoa ativa' }])
})
