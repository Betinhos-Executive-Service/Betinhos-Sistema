import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lerEstado, lerFlows, lerUso } from './corte-estado.mjs'

const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const BU = ID(900), EQ = ID(100), SERV = ID(200), ANA = ID(202)
const P = { antigo: ID(1), admin: ID(3), base: ID(4), solto: ID(6) }

function falso(rotas) {
  const chamadas = []
  const achar = (c) => {
    for (const [prefixo, valor] of rotas) if (c.startsWith(prefixo)) return typeof valor === 'function' ? valor(c) : valor
    throw new Error(`rota sem resposta: ${c}`)
  }
  return {
    chamadas,
    api: 'https://x/api/data/v9.2',
    um: async (c) => (chamadas.push(c), achar(c)),
    todos: async (c) => (chamadas.push(c), achar(c)),
    ligacao: async (l) => (chamadas.push(`ligacao:${l}`), achar(`ligacao:${l}`)),
  }
}

const rotas = () => [
  ['WhoAmI', { UserId: SERV }],
  ['teams?', [{ teamid: EQ, name: 'Team-Betinhos-MDA', _businessunitid_value: BU }]],
  ['roles?', [
    { roleid: P.antigo, name: 'Acesso-Betinhos-MDA', _businessunitid_value: BU },
    { roleid: P.admin, name: 'Administrador do Sistema', _businessunitid_value: BU },
    { roleid: P.base, name: 'Perfil - Base', _businessunitid_value: BU },
    { roleid: P.solto, name: 'Papel sem ninguém', _businessunitid_value: BU },
  ]],
  ['ligacao:teamroles', [{ teamid: EQ, roleid: P.antigo }]],
  ['ligacao:teammembership', [{ teamid: EQ, systemuserid: ANA }]],
  ['ligacao:systemuserroles', [{ systemuserid: SERV, roleid: P.admin }]],
  ['systemusers?', [
    { systemuserid: SERV, applicationid: ID(500), accessmode: 4 },
    { systemuserid: ANA, applicationid: null, accessmode: 0 },
    { systemuserid: ID(300), applicationid: null, accessmode: 3 },
  ]],
  ['EntityDefinitions?', { value: [
    { LogicalName: 'cr40f_financeiro', EntitySetName: 'cr40f_financeiros', IsCustomEntity: true, TableType: 'Standard', Privileges: [{ PrivilegeId: ID(600), PrivilegeType: 'Write' }] },
    { LogicalName: 'systemuser', EntitySetName: 'systemusers', IsCustomEntity: false, TableType: 'Standard', Privileges: [] },
    { LogicalName: 'cr40f_virtual', EntitySetName: 'cr40f_virtuais', IsCustomEntity: true, TableType: 'Virtual', Privileges: [] },
  ] }],
  [`roles(${P.antigo})/`, { RolePrivileges: [{ PrivilegeId: ID(600), Depth: 'Global' }, { PrivilegeId: ID(999), Depth: 'Global' }] }],
  [`roles(${P.base})/`, { RolePrivileges: [] }],
]

test('lerEstado monta equipe, pessoas, papéis e catálogo', async () => {
  const dv = falso(rotas())
  const e = await lerEstado(dv)
  assert.equal(e.servico, SERV)
  assert.deepEqual(e.equipe, { id: EQ, bu: BU })
  assert.equal(e.base, P.base)
  assert.deepEqual(e.pessoas, [
    { id: SERV, app: true, equipes: [], diretos: [P.admin] },
    { id: ANA, app: false, equipes: [EQ], diretos: [] },
  ])
  assert.deepEqual(e.papeis.get(P.antigo).privilegios, [{ tabela: 'cr40f_financeiro', tipo: 'Write', nivel: 8 }])
  assert.equal(e.papeis.get(P.admin).admin, true)
  assert.deepEqual(e.papeis.get(P.solto).privilegios, [])
  assert.ok(!dv.chamadas.some((c) => c.startsWith(`roles(${P.admin})`)), 'admin não lê privilégios')
  assert.ok(!dv.chamadas.some((c) => c.startsWith(`roles(${P.solto})`)), 'papel sem ninguém não lê privilégios')
  assert.deepEqual(e.tabelas, ['cr40f_financeiro'])
  assert.equal(e.catalogo.get('cr40f_financeiros'), 'cr40f_financeiro')
  assert.equal(e.conjuntoDe.get('cr40f_financeiro'), 'cr40f_financeiros')
})

test('lerEstado recusa equipe ausente ou Base fora da unidade da equipe', async () => {
  const semEquipe = rotas().map(([k, v]) => (k === 'teams?' ? [k, []] : [k, v]))
  await assert.rejects(lerEstado(falso(semEquipe)), /0 encontradas/)
  const semBase = rotas().map(([k, v]) => (k === 'roles?' ? [k, v.filter((r) => r.name !== 'Perfil - Base')] : [k, v]))
  await assert.rejects(lerEstado(falso(semBase)), /Perfil - Base não existe/)
})

test('lerUso junta criou e alterou; tabela que falha fica incerta', async () => {
  const dv = falso([
    ['cr40f_financeiros?$apply=filter(createdon', [{ _createdby_value: ANA }]],
    ['cr40f_financeiros?$apply=filter(modifiedon', [{ _modifiedby_value: SERV }, { _modifiedby_value: null }]],
    ['cr40f_outros?', () => { throw new Error('400') }],
  ])
  const conjuntoDe = new Map([['cr40f_financeiro', 'cr40f_financeiros'], ['cr40f_outro', 'cr40f_outros']])
  const { uso, incertas } = await lerUso(dv, ['cr40f_financeiro', 'cr40f_outro'], conjuntoDe, '2026-08-26T00:00:00Z')
  assert.deepEqual([...uso.get('cr40f_financeiro')].sort(), [ANA, SERV].sort())
  assert.deepEqual([...incertas], ['cr40f_outro'])
  assert.ok(dv.chamadas[0].includes('filter(createdon ge 2026-08-26T00:00:00Z)/groupby((_createdby_value))'))
})

test('lerFlows separa dono usuário e equipe', async () => {
  const dv = falso([['workflows?', [
    { workflowid: 'f1', clientdata: '{', _owninguser_value: ANA, _owningteam_value: null },
    { workflowid: 'f2', clientdata: '{', _owninguser_value: null, _owningteam_value: EQ },
  ]]])
  const flows = await lerFlows(dv, new Map())
  assert.deepEqual(flows.map((f) => [f.id, f.dono, f.incerto]), [['f1', { tipo: 'usuario', id: ANA }, true], ['f2', { tipo: 'equipe', id: EQ }, true]])
})
