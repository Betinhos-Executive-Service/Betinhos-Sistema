import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aplicarPlano, conferirManter, desde, efetivos, fotoDoCorte, lerCorte, lerFoto, lerIds, mesmoPlano, montarRelatorio,
  perdasPorPessoa, planoDesfazer, planoDoCorte, planoVazio, resumoPublico, tabelasDoFlow, travasDeFlows, travasDePessoas,
} from './corte-regras.mjs'

const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const UNI = { existia: true, recursoAntes: true, documentos: [], trocas: [] }
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

const plano0 = () => planoDoCorte(estado(), { manter: MANTER })

test('trava só perda de escrita em tabela usada nos 90 dias; o resto é informativo', () => {
  const lista = perdasPorPessoa(estado(), plano0())
  const uso = new Map([['cr40f_financeiro', new Set([ANA])], ['cr40f_reservadeveculos', new Set([ANA])]])
  const r = travasDePessoas(lista, { uso })
  assert.deepEqual(r.travas, [{ id: ANA, tabelas: ['cr40f_financeiro'] }])
  assert.deepEqual(r.informativo, [
    { id: ANA, tabelas: ['cr40f_funcionarios', 'cr40f_veiculos'] },
    { id: BIA, tabelas: ['cr40f_financeiro', 'cr40f_funcionarios', 'cr40f_reservadeveculos', 'cr40f_veiculos'] },
  ])
})

test('tabela sem medida de uso trava quem perde escrita nela', () => {
  const lista = perdasPorPessoa(estado(), plano0())
  const r = travasDePessoas(lista, { uso: new Map(), incertas: new Set(['cr40f_veiculos']) })
  assert.deepEqual(r.travas, [{ id: ANA, tabelas: ['cr40f_veiculos'] }, { id: BIA, tabelas: ['cr40f_veiculos'] }])
})

const host = { apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataserviceforapps', connectionName: 'shared_commondataserviceforapps' }
const catalogo = new Map([
  ['cr40f_financeiro', 'cr40f_financeiro'], ['cr40f_financeiros', 'cr40f_financeiro'],
  ['cr40f_reservadeveculos', 'cr40f_reservadeveculos'], ['cr40f_reservadeveculoses', 'cr40f_reservadeveculos'],
])
const fluxo = (acoes) => JSON.stringify({ properties: { definition: {
  triggers: { quando: { type: 'OpenApiConnectionWebhook', inputs: { host, parameters: { 'subscriptionRequest/entityname': 'cr40f_financeiro' } } } },
  actions: acoes,
} } })

test('tabelas do flow: gatilho e ações do Dataverse, inclusive aninhadas', () => {
  const texto = fluxo({
    listar: { type: 'OpenApiConnection', inputs: { host, parameters: { entityName: 'cr40f_reservadeveculoses' } } },
    se: { type: 'If', actions: { email: { type: 'OpenApiConnection', inputs: { host: { connectionName: 'shared_office365' }, parameters: {} } } } },
  })
  assert.deepEqual(tabelasDoFlow(texto, catalogo), { tabelas: ['cr40f_financeiro', 'cr40f_reservadeveculos'], incerto: false })
})

test('tabelas do flow: expressão, tabela desconhecida, ação sem tabela e JSON ruim ficam incertos', () => {
  const op = (parameters) => fluxo({ a: { type: 'OpenApiConnection', inputs: { host, parameters } } })
  assert.equal(tabelasDoFlow(op({ entityName: "@variables('t')" }), catalogo).incerto, true)
  assert.equal(tabelasDoFlow(op({ entityName: 'cr40f_naoexiste' }), catalogo).incerto, true)
  assert.equal(tabelasDoFlow(op({ actionName: 'cr40f_AcessoDefinirPerfis' }), catalogo).incerto, true)
  assert.equal(tabelasDoFlow('{', catalogo).incerto, true)
  assert.equal(tabelasDoFlow('', catalogo).incerto, true)
  const antigo = { apiId: '/providers/Microsoft.PowerApps/apis/shared_commondataservice', connectionName: 'shared_commondataservice' }
  const legado = fluxo({ a: { type: 'OpenApiConnection', inputs: { host: antigo, parameters: { dataset: 'default.cds', table: 'cr40f_financeiros' } } } })
  assert.equal(tabelasDoFlow(legado, catalogo).incerto, true)
})

test('flows: trava dono que perde tabela do flow, incerto de pessoa comum e equipe do corte', () => {
  const lista = perdasPorPessoa(estado(), plano0())
  const flows = [
    { id: 'f1', dono: { tipo: 'usuario', id: ANA }, tabelas: ['cr40f_financeiro'], incerto: false },
    { id: 'f2', dono: { tipo: 'usuario', id: SERV }, tabelas: [], incerto: true },
    { id: 'f3', dono: { tipo: 'usuario', id: BIA }, tabelas: [], incerto: true },
    { id: 'f4', dono: { tipo: 'equipe', id: EQ }, tabelas: ['cr40f_reservadeveculos'], incerto: false },
    { id: 'f5', dono: { tipo: 'usuario', id: MANTIDO }, tabelas: [], incerto: true },
    { id: 'f6', dono: { tipo: 'usuario', id: ANA }, tabelas: ['cr40f_reservadeveculos'], incerto: false },
  ]
  const travas = travasDeFlows(flows, { perdasPorUsuario: new Map(lista.map((p) => [p.id, p])), servico: SERV, manter: MANTER, equipeCorte: EQ })
  assert.deepEqual(travas.map((t) => t.id), ['f1', 'f3', 'f4'])
  assert.deepEqual(travas[0].tabelas, ['cr40f_financeiro'])
})

test('relatório: zero só sem trava; resumo público sem GUID', () => {
  const e = estado()
  const limpo = montarRelatorio({ estado: e, manter: MANTER, uso: new Map(), incertas: new Set(), flows: [], referencias: [] })
  assert.equal(limpo.zero, true)
  const travado = montarRelatorio({
    estado: e, manter: MANTER, uso: new Map([['cr40f_financeiro', new Set([ANA])]]), incertas: new Set(),
    flows: [{ id: ID(700), dono: { tipo: 'usuario', id: BIA }, tabelas: [], incerto: true }],
    referencias: [{ id: ID(800), dono: BIA }, { id: ID(801), dono: SERV }],
  })
  assert.equal(travado.zero, false)
  assert.equal(travado.referencias.length, 1)
  const texto = resumoPublico(travado, { ambiente: 'dev', sal: 'host' })
  assert.match(texto, /TRAVADO/)
  assert.match(texto, /Travas de pessoas: 1/)
  assert.match(texto, /Travas de flows: 1/)
  assert.doesNotMatch(texto, /[0-9a-f]{8}-[0-9a-f]{4}-/)
  assert.match(resumoPublico(montarRelatorio({ estado: e, manter: new Set(), uso: new Map(), incertas: new Set(), flows: [] }), { ambiente: 'dev', sal: 'h' }), /Erro: ACESSOS_ADMINS_MANTER vazia/)
})

const META = { ambiente: 'dev', host: 'h', quando: '2026-11-25T12:00:00.000Z', commit: 'abc' }
function devolver(e, pd) {
  const equipes = new Map(e.equipes)
  equipes.set(e.equipe.id, [...(equipes.get(e.equipe.id) ?? []), ...pd.equipeAdicionar])
  const pessoas = e.pessoas.map((p) => ({ ...p, diretos: [...p.diretos, ...pd.pessoasAdicionar.filter((x) => x.usuario === p.id).map((x) => x.papel)] }))
  return { ...e, equipes, pessoas }
}

test('foto: guarda o que sai, relê e confere com o plano', () => {
  const e = estado()
  const plano = planoDoCorte(e, { manter: MANTER })
  const foto = lerFoto(JSON.stringify(fotoDoCorte(e, plano, META, UNI)))
  assert.deepEqual(foto.equipe, { id: EQ, papeis: [P.antigo, P.dev] })
  assert.deepEqual(foto.pessoas, [{ id: BIA, papeis: [P.antigo, P.admin] }])
  assert.equal(foto.nomes[P.dev], 'DEV - Usuário')
  assert.equal(mesmoPlano(foto, plano), true)
  assert.equal(mesmoPlano(foto, { ...plano, pessoasRemover: [] }), false)
})

test('foto: formato desconhecido é recusado', () => {
  assert.throws(() => lerFoto('{"versao":3}'), /formato desconhecido/)
  assert.throws(() => lerFoto(JSON.stringify({ ...fotoDoCorte(estado(), planoDoCorte(estado(), { manter: MANTER }), META, UNI), pessoas: [{ id: 'fulano', papeis: [] }] })), /formato desconhecido/)
})

test('foto v2 exige unidade valida', () => {
  const e = estado()
  const base = JSON.parse(JSON.stringify(fotoDoCorte(e, planoDoCorte(e, { manter: MANTER }), META, UNI)))
  assert.throws(() => lerFoto(JSON.stringify({ ...base, unidade: undefined })), /unidade/)
  assert.throws(() => lerFoto(JSON.stringify({ ...base, unidade: { ...UNI, documentos: ['x'] } })), /unidade/)
  const ok = { ...base, unidade: { existia: false, recursoAntes: false, documentos: [ID(40)], trocas: [{ usuario: ID(30), papel: ID(11) }] } }
  assert.equal(lerFoto(JSON.stringify(ok)).unidade.existia, false)
  const v1 = { ...base, versao: 1 }
  delete v1.unidade
  assert.equal(lerFoto(JSON.stringify(v1)).versao, 1)
})

test('desfazer devolve à equipe e às pessoas e depois não tem nada a fazer', () => {
  const e = estado()
  const plano = planoDoCorte(e, { manter: MANTER })
  const cortado = aplicarPlano(e, plano)
  const foto = lerFoto(JSON.stringify(fotoDoCorte(e, plano, META, UNI)))
  const pd = planoDesfazer([foto], cortado)
  assert.deepEqual(pd.equipeAdicionar, [P.antigo, P.dev])
  assert.deepEqual(pd.pessoasAdicionar, [{ usuario: BIA, papel: P.antigo }, { usuario: BIA, papel: P.admin }])
  assert.deepEqual(pd.ignorados, [])
  const resto = planoDesfazer([foto, foto], devolver(cortado, pd))
  assert.deepEqual([resto.equipeAdicionar, resto.pessoasAdicionar], [[], []])
})

test('desfazer ignora pessoa inativa e papel que não existe mais; recusa outra equipe', () => {
  const e = estado()
  const plano = planoDoCorte(e, { manter: MANTER })
  const foto = lerFoto(JSON.stringify(fotoDoCorte(e, plano, META, UNI)))
  const cortado = aplicarPlano(e, plano)
  const semBia = { ...cortado, pessoas: cortado.pessoas.filter((p) => p.id !== BIA), papeis: new Map([...cortado.papeis].filter(([id]) => id !== P.dev)) }
  const pd = planoDesfazer([foto], semBia)
  assert.deepEqual(pd.equipeAdicionar, [P.antigo])
  assert.deepEqual(pd.pessoasAdicionar, [])
  assert.deepEqual(pd.ignorados.sort(), [P.dev, BIA].sort())
  assert.throws(() => planoDesfazer([{ ...foto, equipe: { id: ID(101), papeis: [] } }], cortado), /outra equipe/)
})

test('sem a equipe: só os papéis diretos saem, a foto guarda equipe nula e o desfazer devolve às pessoas', () => {
  const e = { ...estado(), equipe: null }
  const plano = planoDoCorte(e, { manter: MANTER })
  assert.deepEqual([plano.equipeRemover, plano.equipeAdicionar], [[], []])
  assert.deepEqual(plano.pessoasRemover, [{ usuario: BIA, papel: P.antigo }, { usuario: BIA, papel: P.admin }])
  const cortado = aplicarPlano(e, plano)
  const foto = lerFoto(JSON.stringify(fotoDoCorte(e, plano, META, UNI)))
  assert.equal(foto.equipe, null)
  assert.equal(mesmoPlano(foto, plano), true)
  const pd = planoDesfazer([foto], cortado)
  assert.deepEqual([pd.equipeAdicionar, pd.pessoasAdicionar.length], [[], 2])
  assert.throws(() => planoDesfazer([foto], estado()), /outra equipe/)
})
