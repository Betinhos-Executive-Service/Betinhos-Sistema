import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAPEIS_FROTA, UNIDADE, aplicarUnidade, mesmaUnidade, resumoUnidade, lerUnidade, planoDaUnidade, planoDesfazerUnidade, recursoLigado, unidadeVazia } from './corte-unidade.mjs'

const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const RAIZ = ID(1), FROTA = ID(2), ORG = ID(3)
const R_OP = ID(10), R_GE = ID(11), C_OP = ID(20), C_GE = ID(21)
const XML = (v) => `<OrgSettings><EnableOwnershipAcrossBusinessUnits>${v}</EnableOwnershipAcrossBusinessUnits></OrgSettings>`

function estado(extra = {}) {
  return {
    org: { id: ORG, xml: XML(false) }, recurso: false, raiz: RAIZ, frota: null,
    raizPorNome: { [PAPEIS_FROTA[0]]: R_OP, [PAPEIS_FROTA[1]]: R_GE }, copiaPorRaiz: {},
    atribuicoes: [], documentos: [], datasNulas: [], ...extra,
  }
}

test('recursoLigado le o XML', () => {
  assert.equal(recursoLigado(XML(true)), true)
  assert.equal(recursoLigado(XML(false)), false)
  assert.equal(recursoLigado('<OrgSettings/>'), false)
})

test('plano antes do corte liga, cria, move documentos e troca papeis', () => {
  const u = estado({ atribuicoes: [{ usuario: ID(30), papel: R_GE }], documentos: [{ id: ID(40), unidade: RAIZ }] })
  assert.deepEqual(planoDaUnidade(u), {
    ligarRecurso: true, criarUnidade: true, documentos: [ID(40)], trocas: [{ usuario: ID(30), papel: R_GE }], travas: [],
  })
})

test('plano depois do corte e vazio', () => {
  const u = estado({ recurso: true, frota: FROTA, copiaPorRaiz: { [R_OP]: C_OP, [R_GE]: C_GE },
    atribuicoes: [{ usuario: ID(30), papel: C_GE }], documentos: [{ id: ID(40), unidade: FROTA }] })
  assert.equal(unidadeVazia(planoDaUnidade(u)), true)
})

test('datas nulas viram trava', () => {
  const p = planoDaUnidade(estado({ datasNulas: ['cr40f_x.cr40f_data'] }))
  assert.deepEqual(p.travas, ['cr40f_x.cr40f_data'])
  assert.equal(unidadeVazia(p), false)
})

test('desfazer troca de volta todas as copias, devolve documentos, apaga a unidade criada e desliga o recurso', () => {
  const u = estado({ recurso: true, frota: FROTA, copiaPorRaiz: { [R_OP]: C_OP, [R_GE]: C_GE },
    atribuicoes: [{ usuario: ID(30), papel: C_GE }, { usuario: ID(31), papel: C_OP }], documentos: [{ id: ID(40), unidade: FROTA }, { id: ID(41), unidade: RAIZ }] })
  const fotos = [{ unidade: { existia: false, recursoAntes: false, documentos: [ID(40)], trocas: [{ usuario: ID(30), papel: R_GE }] } }]
  assert.deepEqual(planoDesfazerUnidade(fotos, u), {
    trocas: [{ usuario: ID(30), de: C_GE, para: R_GE }, { usuario: ID(31), de: C_OP, para: R_OP }],
    documentos: [ID(40)], apagarUnidade: FROTA, desligarRecurso: true,
  })
})

test('desfazer nao apaga unidade que ja existia nem desliga recurso que ja estava ligado', () => {
  const u = estado({ recurso: true, frota: FROTA, copiaPorRaiz: { [R_OP]: C_OP, [R_GE]: C_GE } })
  const fotos = [{ unidade: { existia: true, recursoAntes: true, documentos: [], trocas: [] } }]
  assert.deepEqual(planoDesfazerUnidade(fotos, u), { trocas: [], documentos: [], apagarUnidade: null, desligarRecurso: false })
})

function falso(rotas) {
  const chamadas = []
  const achar = (c) => Object.entries(rotas).find(([p]) => c.startsWith(p))?.[1]
  return {
    chamadas,
    api: async (c) => achar(c) ?? { value: [] },
    todos: async (c) => (achar(c)?.value ?? []),
    um: async (c) => (achar(c)?.value?.[0] ?? null),
    ligacao: async () => rotas.__ligacao ?? [],
    chamar: async (metodo, caminho, corpo) => { chamadas.push([metodo, caminho, corpo]); return metodo === 'POST' && caminho === 'businessunits' ? { businessunitid: FROTA } : null },
  }
}

test('lerUnidade monta o estado pela Web API', async () => {
  const dv = falso({
    'organizations': { value: [{ organizationid: ORG, orgdborgsettings: XML(true) }] },
    'businessunits': { value: [{ businessunitid: RAIZ, name: 'org', _parentbusinessunitid_value: null, isdisabled: false },
      { businessunitid: FROTA, name: 'frota', _parentbusinessunitid_value: RAIZ, isdisabled: false }] },
    'roles': { value: [{ roleid: R_OP, name: PAPEIS_FROTA[0], _businessunitid_value: RAIZ, _parentrootroleid_value: null },
      { roleid: R_GE, name: PAPEIS_FROTA[1], _businessunitid_value: RAIZ, _parentrootroleid_value: R_GE },
      { roleid: C_GE, name: PAPEIS_FROTA[1], _businessunitid_value: FROTA, _parentrootroleid_value: R_GE }] },
    'cr40f_documentos': { value: [{ cr40f_documentoid: ID(40), _owningbusinessunit_value: FROTA }] },
    'EntityDefinitions': { value: [] },
    __ligacao: [{ systemuserid: ID(30), roleid: C_GE }, { systemuserid: ID(31), roleid: ID(99) }],
  })
  const u = await lerUnidade(dv)
  assert.equal(u.recurso, true)
  assert.equal(u.frota, FROTA)
  assert.deepEqual(u.copiaPorRaiz, { [R_GE]: C_GE })
  assert.deepEqual(u.atribuicoes, [{ usuario: ID(30), papel: C_GE }])
  assert.deepEqual(u.documentos, [{ id: ID(40), unidade: FROTA }])
})

test('aplicarUnidade segue a ordem: recurso, unidade, copias, documentos, trocas', async () => {
  const dv = falso({ 'roles': { value: [{ roleid: C_OP, name: PAPEIS_FROTA[0], _businessunitid_value: FROTA, _parentrootroleid_value: R_OP },
    { roleid: C_GE, name: PAPEIS_FROTA[1], _businessunitid_value: FROTA, _parentrootroleid_value: R_GE }] } })
  const u = estado({ atribuicoes: [{ usuario: ID(30), papel: R_GE }], documentos: [{ id: ID(40), unidade: RAIZ }] })
  await aplicarUnidade(dv, planoDaUnidade(u), u, { esperar: async () => {} })
  assert.deepEqual(dv.chamadas.map(([m, c]) => `${m} ${c}`), [
    `PATCH organizations(${ORG})`,
    'POST businessunits',
    `PATCH cr40f_documentos(${ID(40)})`,
    `POST systemusers(${ID(30)})/systemuserroles_association/$ref`,
    `DELETE systemusers(${ID(30)})/systemuserroles_association(${R_GE})/$ref`,
  ])
  assert.match(dv.chamadas[0][2].orgdborgsettings, /<EnableOwnershipAcrossBusinessUnits>true</)
  assert.equal(dv.chamadas[1][2].name, UNIDADE)
})

test('mesmaUnidade compara a foto com o plano de agora', () => {
  const u = estado({ atribuicoes: [{ usuario: ID(30), papel: R_GE }], documentos: [{ id: ID(40), unidade: RAIZ }] })
  const plano = planoDaUnidade(u)
  const foto = { unidade: { existia: false, recursoAntes: false, documentos: [ID(40)], trocas: [{ usuario: ID(30), papel: R_GE }] } }
  assert.equal(mesmaUnidade(foto, plano), true)
  assert.equal(mesmaUnidade({ unidade: { ...foto.unidade, documentos: [] } }, plano), false)
  assert.equal(mesmaUnidade({ unidade: { ...foto.unidade, existia: true } }, plano), false)
  assert.equal(mesmaUnidade({}, plano), false)
  assert.match(resumoUnidade(plano), /Documentos de veículo a mover: 1/)
})

test('PAPEIS_FROTA bate com os perfis Frota do mapa gerado', () => {
  const gerado = Object.keys(JSON.parse(readFileSync(new URL('./perfis.gerado.json', import.meta.url), 'utf8')).papeis).filter((n) => n.startsWith('Perfil - Frota - ')).sort()
  assert.equal(PAPEIS_FROTA.length, 2)
  assert.deepEqual([...PAPEIS_FROTA], gerado)
})

test('papel raiz ausente no ambiente falha com erro claro', async () => {
  const dv = falso({
    'organizations': { value: [{ organizationid: ORG, orgdborgsettings: XML(true) }] },
    'businessunits': { value: [{ businessunitid: RAIZ, name: 'org', _parentbusinessunitid_value: null, isdisabled: false }] },
    'roles': { value: [{ roleid: R_GE, name: PAPEIS_FROTA[1], _businessunitid_value: RAIZ, _parentrootroleid_value: null }] },
  })
  await assert.rejects(() => lerUnidade(dv), /raiz da Frota ausente/)
})

test('trava de datas nulas só vale com o recurso desligado (e a varredura nem roda ligado)', async () => {
  const montar = (ligado) => {
    const dv = falso({
      'organizations': { value: [{ organizationid: ORG, orgdborgsettings: XML(ligado) }] },
      'businessunits': { value: [{ businessunitid: RAIZ, name: 'org', _parentbusinessunitid_value: null, isdisabled: false }] },
      'roles': { value: [{ roleid: R_OP, name: PAPEIS_FROTA[0], _businessunitid_value: RAIZ, _parentrootroleid_value: null },
        { roleid: R_GE, name: PAPEIS_FROTA[1], _businessunitid_value: RAIZ, _parentrootroleid_value: null }] },
      'EntityDefinitions?': { value: [{ LogicalName: 'cr40f_x', IsCustomEntity: true, Attributes: [{ LogicalName: 'cr40f_data', AttributeType: 'DateTime', IsCustomAttribute: true }] }] },
      "EntityDefinitions(LogicalName='cr40f_x')": { value: [{ LogicalName: 'cr40f_data', IsCustomAttribute: true, DateTimeBehavior: null }] },
    })
    return dv
  }
  const desligado = planoDaUnidade(await lerUnidade(montar(false)))
  assert.deepEqual(desligado.travas, ['cr40f_x.cr40f_data'])
  const ligado = planoDaUnidade(await lerUnidade(montar(true)))
  assert.deepEqual(ligado.travas, [])
  assert.equal(planoDaUnidade({ ...estado({ recurso: true }), datasNulas: ['cr40f_x.cr40f_data'] }).travas.length, 0)
})
