import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  COLUNAS_GESTOR, GESTORES, PAPEL_BASE, PAPEL_PROJETOS, administrativos, fotoDoPreparo, lerFoto, montarRelatorio,
  planoDesfazer, planoDesfazerPreparo, planoDoPreparo, preparoVazio, resumoDoPreparo,
} from './corte-regras.mjs'

const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
const RAIZ = ID(900), FROTA = ID(901)
const EQ = ID(100), SERV = ID(200), ANA = ID(202), BIA = ID(203), CAIO = ID(204), APP = ID(205), DUDA = ID(206)
const NOMES = [PAPEL_BASE, ...GESTORES, PAPEL_PROJETOS]
const priv = (tabela, tipo, nivel = 8) => ({ tabela, tipo, nivel })

// Papéis novos nas duas unidades (ids 10.. na raiz, 30.. na Frota) mais o antigo, o admin e o legado da equipe.
function estado({ semFrota = [] } = {}) {
  const papeis = new Map()
  const add = (id, nome, bu, extra = {}) => papeis.set(id, { id, nome, bu, admin: false, privilegios: [], ...extra })
  NOMES.forEach((n, i) => {
    add(ID(10 + i), n, RAIZ)
    if (!semFrota.includes(n)) add(ID(30 + i), n, FROTA)
  })
  add(ID(1), 'Acesso-Betinhos-MDA', RAIZ, { privilegios: [priv('cr40f_financeiro', 'Read'), priv('cr40f_financeiro', 'Write'), priv('cr40f_financeiro', 'Delete')] })
  add(ID(3), 'Administrador do Sistema', RAIZ, { admin: true })
  return {
    servico: SERV,
    equipe: { id: EQ, bu: RAIZ },
    base: ID(10),
    papeis,
    equipes: new Map([[EQ, [ID(1)]]]),
    pessoas: [
      { id: SERV, app: true, bu: RAIZ, equipes: [], diretos: [ID(3)] },
      { id: APP, app: true, bu: RAIZ, equipes: [EQ], diretos: [] },
      { id: ANA, app: false, bu: RAIZ, equipes: [EQ], diretos: [ID(11)] },
      { id: BIA, app: false, bu: FROTA, equipes: [], diretos: [ID(3)] },
      { id: CAIO, app: false, bu: RAIZ, equipes: [], diretos: [] },
      { id: DUDA, app: false, bu: RAIZ, equipes: [EQ], diretos: [ID(3)] },
    ],
    tabelas: ['cr40f_financeiro'],
    colunas: {
      perfis: new Map(COLUNAS_GESTOR.map((n, i) => [n, ID(50 + i)])),
      deUsuario: new Map([[ANA, new Set([ID(50)])]]),
      protegidas: new Set(),
      leitura: new Map(),
    },
  }
}

test('administrativas: equipe ou admin direto, sem app nem a conta de serviço', () => {
  assert.deepEqual(administrativos(estado()).map((p) => p.id), [ANA, BIA, DUDA])
})

test('preparo: dá o que falta no papel da unidade da pessoa e pula o que já tem', () => {
  const plano = planoDoPreparo(estado())
  assert.deepEqual(plano.erros, [])
  const de = (u) => plano.papeis.filter((x) => x.usuario === u).map((x) => x.papel).sort()
  // ANA já tem o 1º Gestor (ID 11) direto: recebe os outros na raiz.
  assert.deepEqual(de(ANA), NOMES.map((_, i) => ID(10 + i)).filter((id) => id !== ID(11)).sort())
  // BIA está na unidade Frota: recebe as cópias de lá.
  assert.deepEqual(de(BIA), NOMES.map((_, i) => ID(30 + i)).sort())
  assert.equal(de(CAIO).length, 0)
  const colunas = (u) => plano.colunas.filter((x) => x.usuario === u).length
  assert.equal(colunas(ANA), COLUNAS_GESTOR.length - 1)
  assert.equal(colunas(BIA), COLUNAS_GESTOR.length)
})

test('preparo: papel ausente na unidade ou perfil de coluna ausente trava', () => {
  const e = estado({ semFrota: [PAPEL_PROJETOS] })
  e.colunas.perfis.delete(COLUNAS_GESTOR[0])
  const plano = planoDoPreparo(e)
  assert.ok(plano.erros.some((x) => x.id === BIA && x.motivo.includes(PAPEL_PROJETOS)))
  assert.equal(plano.erros.filter((x) => x.motivo.includes('perfil de coluna')).length, 1)
  assert.match(resumoDoPreparo(plano, { ambiente: 'dev', sal: 'h', total: 3 }), /TRAVADO/)
  assert.doesNotMatch(resumoDoPreparo(plano, { ambiente: 'dev', sal: 'h', total: 3 }), /[0-9a-f]{8}-[0-9a-f]{4}-/)
})

test('preparo: depois de aplicado fica vazio', () => {
  const e = estado()
  const plano = planoDoPreparo(e)
  for (const { usuario, papel } of plano.papeis) e.pessoas.find((p) => p.id === usuario).diretos.push(papel)
  for (const { usuario, perfil } of plano.colunas) {
    if (!e.colunas.deUsuario.has(usuario)) e.colunas.deUsuario.set(usuario, new Set())
    e.colunas.deUsuario.get(usuario).add(perfil)
  }
  assert.ok(preparoVazio(planoDoPreparo(e)))
})

const META = { ambiente: 'dev', host: 'h', quando: '2026-11-26T12:00:00.000Z', commit: 'abc' }

test('foto do preparo: ida e volta; formato inválido recusa', () => {
  const plano = planoDoPreparo(estado())
  const foto = lerFoto(JSON.stringify(fotoDoPreparo(plano, META)))
  assert.equal(foto.versao, 3)
  assert.deepEqual(foto.papeis, plano.papeis)
  assert.throws(() => lerFoto(JSON.stringify({ ...fotoDoPreparo(plano, META), papeis: [{ usuario: 'x', papel: ID(1) }] })), /foto do preparo/)
  assert.throws(() => lerFoto(JSON.stringify({ ...fotoDoPreparo(plano, META), ambiente: 'test' })), /foto do preparo/)
})

test('desfazer: tira só o que o preparo pôs e ainda está; o desfazer do corte ignora a foto v3', () => {
  const e = estado()
  const plano = planoDoPreparo(e)
  const foto = fotoDoPreparo(plano, META)
  const [primeiro, ...resto] = plano.papeis
  for (const { usuario, papel } of resto) e.pessoas.find((p) => p.id === usuario).diretos.push(papel)
  e.colunas.deUsuario.set(BIA, new Set(plano.colunas.filter((x) => x.usuario === BIA).map((x) => x.perfil)))
  const sair = planoDesfazerPreparo([foto], e)
  assert.equal(sair.papeis.length, resto.length)
  assert.ok(!sair.papeis.some((x) => x.usuario === primeiro.usuario && x.papel === primeiro.papel))
  assert.ok(sair.colunas.every((x) => x.usuario === BIA))
  assert.equal(sair.colunas.length, COLUNAS_GESTOR.length)
  // O perfil que ANA já tinha (ID 50) não está na foto e fica.
  assert.ok(!sair.colunas.some((x) => x.usuario === ANA))
  const corte = planoDesfazer([foto], e)
  assert.equal(corte.equipeAdicionar.length + corte.pessoasAdicionar.length, 0)
})

test('trava da fase 2: essencial de administrativa trava, secundário só informa, fora não conta', () => {
  const e = estado()
  const manter = new Set([BIA])
  const base = { estado: e, manter, uso: new Map(), incertas: new Set(), flows: [] }
  // Sem o papel antigo da equipe, ANA perde Read/Write/Delete no financeiro.
  const travado = montarRelatorio(base)
  assert.deepEqual(travado.travasAdmin.map((t) => t.id), [ANA, DUDA])
  assert.equal(travado.zero, false)
  const fora = montarRelatorio({ ...base, fora: new Set(['cr40f_financeiro']) })
  assert.deepEqual(fora.travasAdmin, [])
  // Com os essenciais Global vindo de outro papel, sobra só o Delete: informativo (DUDA perdia o admin, que cobre tudo).
  e.papeis.get(ID(11)).privilegios = ['Read', 'Create', 'Write', 'Append', 'AppendTo'].map((t) => priv('cr40f_financeiro', t))
  e.pessoas.find((p) => p.id === DUDA).diretos.push(ID(11))
  const so = montarRelatorio(base)
  assert.deepEqual(so.travasAdmin, [])
  assert.deepEqual(so.secundariosAdmin.map((t) => t.id).sort(), [ANA, DUDA].sort())
})

test('trava da fase 2: conexão de quem perde acesso trava', () => {
  const e = estado()
  const rel = montarRelatorio({
    estado: e, manter: new Set([BIA]), uso: new Map(), incertas: new Set(), flows: [], fora: new Set(['cr40f_financeiro']),
    referencias: [{ id: ID(800), dono: ANA }, { id: ID(801), dono: BIA }],
  })
  assert.deepEqual(rel.travasConexao.map((r) => r.id), [ID(800)])
  assert.equal(rel.zero, false)
})

test('trava da fase 2: tabela só leitura exige só o Read', () => {
  const e = estado()
  // ANA e DUDA ficam com Read Global de outro papel: perdem só Write e Delete.
  e.papeis.get(ID(12)).privilegios = [priv('cr40f_financeiro', 'Read')]
  for (const id of [ANA, DUDA]) e.pessoas.find((p) => p.id === id).diretos.push(ID(12))
  const base = { estado: e, manter: new Set([BIA]), uso: new Map(), incertas: new Set(), flows: [] }
  assert.deepEqual(montarRelatorio(base).travasAdmin.map((t) => t.id), [ANA, DUDA])
  const so = montarRelatorio({ ...base, soLeitura: new Set(['cr40f_financeiro']) })
  assert.deepEqual(so.travasAdmin, [])
  assert.deepEqual(so.secundariosAdmin.map((t) => t.id), [ANA, DUDA])
})

test('trava da fase 2: quem perde o admin sem perfil que leia toda coluna protegida trava', () => {
  const e = estado()
  const CPF = 'cr40f_funcionarios|cr40f_cpf', SENHA = 'cr40f_funcionarios|cr40f_loginsesenhas'
  e.colunas.protegidas = new Set([CPF, SENHA])
  e.colunas.leitura = new Map([[ID(51), new Set([CPF])]])
  const base = { estado: e, manter: new Set([BIA]), uso: new Map(), incertas: new Set(), flows: [], fora: new Set(['cr40f_financeiro']) }
  // DUDA perde o admin e não tem perfil; ANA nunca teve admin; BIA mantém.
  const travado = montarRelatorio(base)
  assert.deepEqual(travado.travasColunas, [{ id: DUDA, colunas: [CPF, SENHA] }])
  assert.equal(travado.zero, false)
  // Com o perfil que lê o CPF e a senha só do admin, zera.
  e.colunas.deUsuario.set(DUDA, new Set([ID(51)]))
  const ok = montarRelatorio({ ...base, soAdmin: new Set([SENHA]) })
  assert.deepEqual(ok.travasColunas, [])
  assert.equal(ok.zero, true)
})
