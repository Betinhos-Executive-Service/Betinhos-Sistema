#!/usr/bin/env node
// Somente leitura. Informativo para o plano do corte: lista quem hoje le cr40f_bancodedados sem perfil de coluna
// de administrador ou Motoristas e deixaria de ler telefone, e-mail, nascimento e endereco quando a protecao dessas
// colunas ligar (adiada para o plano do corte; nao existe migration para ela). DEPENDENTES > 0 e esperado.
// A saida do PROD nunca vai para repositorio, commit, PR ou issue.
// Uso: DV_URL=https://<org>.crm2.dynamics.com DV_ACCESS_TOKEN=<token> node packages/deploy/acessos/quem-le.mjs
// Imprime so nomes de papeis e equipes e contagens; nunca nomes de pessoas.

import { criarCliente, limpo, tokenDoAmbiente } from './dv.mjs'

// Local: DV_URL + DV_ACCESS_TOKEN (DEV ou PROD, so GET). No CI (job acessos): DV_ENVIRONMENT_URL e conta de servico.
let sessao
try {
  sessao = await tokenDoAmbiente({ somenteDevLocal: false })
} catch (e) {
  console.error(limpo(e.message))
  process.exit(2)
}
const { todos, um, ligacao } = criarCliente(sessao)
const TABELA = 'cr40f_bancodedados'
const ADMIN = ['Administrador do Sistema', 'System Administrator']

function agrupar(linhas, chave, valor) {
  const mapa = new Map()
  for (const l of linhas) {
    if (!mapa.has(l[chave])) mapa.set(l[chave], new Set())
    mapa.get(l[chave]).add(l[valor])
  }
  return mapa
}

const meta = await um(`EntityDefinitions(LogicalName='${TABELA}')?$select=LogicalName,Privileges`)
const leitura = meta.Privileges.find((p) => p.PrivilegeType === 'Read')
if (!leitura) throw new Error(`${TABELA} sem privilegio de leitura na metadata.`)

const [papeis, perfisDeColuna, equipes, usuarios, comLeitura, papeisDoUsuario, equipesDoUsuario, papeisDaEquipe, perfisDoUsuario, perfisDaEquipe] =
  await Promise.all([
    todos('roles?$select=roleid,name'),
    todos('fieldsecurityprofiles?$select=fieldsecurityprofileid,name'),
    todos('teams?$select=teamid,name'),
    todos('systemusers?$select=systemuserid,applicationid&$filter=isdisabled eq false'),
    todos(`roleprivilegescollection?$select=roleid&$filter=privilegeid eq ${leitura.PrivilegeId}`),
    ligacao('systemuserroles', 'systemuserid,roleid'),
    ligacao('teammembership', 'systemuserid,teamid'),
    ligacao('teamroles', 'teamid,roleid'),
    ligacao('systemuserprofiles', 'systemuserid,fieldsecurityprofileid'),
    ligacao('teamprofiles', 'teamid,fieldsecurityprofileid'),
  ])

const nomeDoPapel = new Map(papeis.map((p) => [p.roleid, p.name]))
const nomeDoPerfil = new Map(perfisDeColuna.map((p) => [p.fieldsecurityprofileid, p.name]))
const nomeDaEquipe = new Map(equipes.map((e) => [e.teamid, e.name]))
const papeisQueLeem = new Set(comLeitura.map((l) => l.roleid))
const diretos = agrupar(papeisDoUsuario, 'systemuserid', 'roleid')
const equipesDe = agrupar(equipesDoUsuario, 'systemuserid', 'teamid')
const papeisDe = agrupar(papeisDaEquipe, 'teamid', 'roleid')
const perfisDiretos = agrupar(perfisDoUsuario, 'systemuserid', 'fieldsecurityprofileid')
const perfisDe = agrupar(perfisDaEquipe, 'teamid', 'fieldsecurityprofileid')

const nomes = (ids, mapa) => [...ids].map((id) => mapa.get(id)).filter(Boolean)
const ehAdmin = (lista) => lista.some((n) => ADMIN.includes(n))

let admins = 0
let cobertos = 0
let motoristas = 0
let semLeitura = 0
const dependentes = new Map() // origem -> { pessoas, aplicacoes }

for (const u of usuarios) {
  const minhasEquipes = [...(equipesDe.get(u.systemuserid) ?? [])]
  const origens = [] // [origem, roleid]
  for (const id of diretos.get(u.systemuserid) ?? []) origens.push([`papel "${nomeDoPapel.get(id)}"`, id])
  for (const t of minhasEquipes)
    for (const id of papeisDe.get(t) ?? []) origens.push([`equipe "${nomeDaEquipe.get(t)}" (papel "${nomeDoPapel.get(id)}")`, id])
  const perfis = new Set(perfisDiretos.get(u.systemuserid) ?? [])
  for (const t of minhasEquipes) for (const id of perfisDe.get(t) ?? []) perfis.add(id)

  const leem = origens.filter(([, id]) => papeisQueLeem.has(id))
  if (ehAdmin(nomes(origens.map(([, id]) => id), nomeDoPapel))) admins++
  else if (leem.length === 0) semLeitura++
  else if (ehAdmin(nomes(perfis, nomeDoPerfil))) cobertos++
  else if (nomes(perfis, nomeDoPerfil).includes('Motoristas')) motoristas++
  else
    for (const origem of new Set(leem.map(([o]) => o))) {
      const conta = dependentes.get(origem) ?? { pessoas: 0, aplicacoes: 0 }
      if (u.applicationid) conta.aplicacoes++
      else conta.pessoas++
      dependentes.set(origem, conta)
    }
}

// Equipe de grupo do Entra so ganha membro quando a pessoa entra: conferir a equipe em si.
const equipesExpostas = [...papeisDe.entries()]
  .filter(([t, ids]) => [...ids].some((id) => papeisQueLeem.has(id)) && !ehAdmin(nomes(ids, nomeDoPapel)) && !ehAdmin(nomes(perfisDe.get(t) ?? [], nomeDoPerfil)))
  .map(([t]) => nomeDaEquipe.get(t))

console.log(`${sessao.url}: ${usuarios.length} usuarios ativos`)
console.log(`  administradores (leem tudo): ${admins}`)
console.log(`  nao leem ${TABELA}: ${semLeitura}`)
console.log(`  cobertos pelo perfil de coluna do administrador: ${cobertos}`)
console.log(`  com o perfil Motoristas (passam a ler so o telefone): ${motoristas}`)
for (const [origem, c] of [...dependentes].sort()) console.log(`  DEPENDE: ${origem}: ${c.pessoas} pessoa(s), ${c.aplicacoes} aplicacao(oes)`)
for (const nome of equipesExpostas.sort()) console.log(`  EQUIPE SEM COBERTURA: "${nome}" le a tabela e nao tem perfil de coluna`)
const total = [...dependentes.values()].reduce((s, c) => s + c.pessoas + c.aplicacoes, 0)
console.log(`DEPENDENTES: ${total}`)
