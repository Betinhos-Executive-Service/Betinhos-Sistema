// Regras puras do corte dos acessos (plano 4 dos acessos por perfil). Sem rede: corte-estado.mjs lê o Dataverse e
// entrega o estado; relatorio-corte.mjs e corte.mjs só combinam estas funções. Nada aqui imprime id ou nome de pessoa.
import { hashCurto } from './dv.mjs'

export const AMBIENTES = ['dev', 'prod']
export const MODOS = ['esperar', 'cortar', 'desfazer']
export const EQUIPE = 'Team-Betinhos-MDA'
export const PAPEL_BASE = 'Perfil - Base'
// Saem da equipe e de quem os tem direto. Os papéis em si nunca mudam (estão na BetinhosCore).
export const PAPEIS_ANTIGOS = ['Acesso-Betinhos-MDA', 'DEV - Usuário']
export const ADMIN = ['Administrador do Sistema', 'System Administrator']
export const DIAS = 90
export const NIVEL = { Basic: 1, Local: 2, Deep: 4, Global: 8 }
export const ESCRITA = ['Create', 'Write']
export const PERFIL_AUTOMACAO = 'Passageiros - automação'
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function lerCorte(texto, ambiente) {
  if (!AMBIENTES.includes(ambiente)) throw new Error(`ambiente desconhecido: ${ambiente}`)
  let json
  try {
    json = JSON.parse(String(texto).replace(/^﻿/, ''))
  } catch {
    throw new Error('corte.json não é JSON válido')
  }
  const extras = Object.keys(json).filter((k) => !AMBIENTES.includes(k))
  if (extras.length) throw new Error(`corte.json: chave desconhecida ${extras.join(', ')}`)
  const modo = json[ambiente]
  if (!MODOS.includes(modo)) throw new Error(`corte.json: ${ambiente} precisa ser ${MODOS.join(' | ')}`)
  return modo
}

export function lerIds(texto) {
  const ids = String(texto ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const ruins = ids.filter((id) => !GUID.test(id))
  if (ruins.length) throw new Error(`${ruins.length} id(s) fora do formato GUID na variável`)
  return [...new Set(ids)]
}

export function desde(hoje, dias = DIAS) {
  const meiaNoite = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  return new Date(meiaNoite - dias * 86_400_000).toISOString().replace('.000Z', 'Z')
}

const nivelDe = (ef, tabela, tipo) => (ef.admin ? NIVEL.Global : ef.privs.get(`${tabela}|${tipo}`) ?? 0)

export function papeisDe(estado, pessoa) {
  const ids = [...pessoa.diretos, ...pessoa.equipes.flatMap((t) => estado.equipes.get(t) ?? [])]
  return ids.map((id) => estado.papeis.get(id)).filter(Boolean)
}

export function efetivos(papeis) {
  const r = { admin: false, privs: new Map() }
  for (const p of papeis) {
    if (p.admin) r.admin = true
    for (const { tabela, tipo, nivel } of p.privilegios ?? []) {
      const k = `${tabela}|${tipo}`
      if ((r.privs.get(k) ?? 0) < nivel) r.privs.set(k, nivel)
    }
  }
  return r
}

export function perdas(antes, depois, universo) {
  const escrita = [], leitura = []
  for (const t of universo) {
    if (ESCRITA.some((tipo) => nivelDe(depois, t, tipo) < nivelDe(antes, t, tipo))) escrita.push(t)
    else if (nivelDe(depois, t, 'Read') < nivelDe(antes, t, 'Read')) leitura.push(t)
  }
  return { escrita, leitura }
}

// A equipe fica só com a Base. Saem os papéis antigos diretos de todos e o admin direto de quem não está em manter.
// Usuário de aplicação e a conta que roda nunca perdem papel direto.
export function planoDoCorte(estado, { manter }) {
  const nome = (id) => estado.papeis.get(id)?.nome ?? ''
  const daEquipe = estado.equipe ? estado.equipes.get(estado.equipe.id) ?? [] : null
  const pessoasRemover = []
  for (const p of estado.pessoas) {
    if (p.app || p.id === estado.servico) continue
    for (const r of p.diretos) {
      if (PAPEIS_ANTIGOS.includes(nome(r)) || (ADMIN.includes(nome(r)) && !manter.has(p.id))) pessoasRemover.push({ usuario: p.id, papel: r })
    }
  }
  return {
    equipeRemover: daEquipe ? daEquipe.filter((r) => r !== estado.base) : [],
    equipeAdicionar: !daEquipe || daEquipe.includes(estado.base) ? [] : [estado.base],
    pessoasRemover,
  }
}

export const planoVazio = (p) => !p.equipeRemover.length && !p.equipeAdicionar.length && !p.pessoasRemover.length

export function aplicarPlano(estado, plano) {
  const equipes = new Map(estado.equipes)
  if (estado.equipe) {
    const atuais = new Set(equipes.get(estado.equipe.id) ?? [])
    for (const r of plano.equipeRemover) atuais.delete(r)
    for (const r of plano.equipeAdicionar) atuais.add(r)
    equipes.set(estado.equipe.id, [...atuais])
  }
  const tirar = new Map()
  for (const { usuario, papel } of plano.pessoasRemover) tirar.set(usuario, new Set([...(tirar.get(usuario) ?? []), papel]))
  const pessoas = estado.pessoas.map((p) => ({ ...p, diretos: p.diretos.filter((r) => !tirar.get(p.id)?.has(r)) }))
  return { ...estado, equipes, pessoas }
}

export function perdasPorPessoa(estado, plano) {
  const depois = aplicarPlano(estado, plano)
  return estado.pessoas.map((p, i) => ({
    id: p.id,
    ...perdas(efetivos(papeisDe(estado, p)), efetivos(papeisDe(depois, depois.pessoas[i])), estado.tabelas),
  }))
}

export function conferirManter(estado, manter) {
  if (!manter.size) return [{ motivo: 'ACESSOS_ADMINS_MANTER vazia: o corte tiraria o admin de todas as pessoas' }]
  const porId = new Map(estado.pessoas.map((p) => [p.id, p]))
  const erros = []
  for (const id of manter) {
    const p = porId.get(id)
    if (!p || p.app || id === estado.servico) erros.push({ id, motivo: 'admin a manter não é pessoa ativa' })
    else if (!p.diretos.some((r) => estado.papeis.get(r)?.admin)) erros.push({ id, motivo: 'admin a manter não tem Administrador do Sistema direto' })
  }
  return erros
}

export function travasDePessoas(lista, { uso, incertas = new Set() }) {
  const travas = [], informativo = []
  for (const p of lista) {
    const usadas = p.escrita.filter((t) => incertas.has(t) || uso.get(t)?.has(p.id))
    const semUso = [...p.leitura, ...p.escrita.filter((t) => !usadas.includes(t))]
    if (usadas.length) travas.push({ id: p.id, tabelas: usadas })
    if (semUso.length) informativo.push({ id: p.id, tabelas: semUso })
  }
  return { travas, informativo }
}

// Pega também o conector antigo (shared_commondataservice): sem entityName, o flow que o usa fica incerto.
const DATAVERSE = /commondataservice/i

// Tabelas que o flow toca pelo conector do Dataverse. Qualquer operação do conector sem tabela conhecida
// (expressão, ação sem entityName, nome fora do catálogo) deixa o flow incerto.
export function tabelasDoFlow(clientdata, catalogo) {
  let definicao
  try {
    definicao = JSON.parse(clientdata)?.properties?.definition
  } catch {
    return { tabelas: [], incerto: true }
  }
  if (!definicao) return { tabelas: [], incerto: true }
  const tabelas = new Set()
  let incerto = false
  const visitar = (no) => {
    const host = no?.inputs?.host
    if (host && DATAVERSE.test(JSON.stringify(host))) {
      const p = no.inputs.parameters ?? {}
      const bruto = p.entityName ?? p['subscriptionRequest/entityname']
      const logico = typeof bruto === 'string' && !bruto.includes('@') ? catalogo.get(bruto.toLowerCase()) : undefined
      if (logico) tabelas.add(logico)
      else incerto = true
    }
    for (const v of Object.values(no ?? {})) if (v && typeof v === 'object') visitar(v)
  }
  visitar(definicao)
  return { tabelas: [...tabelas].sort(), incerto }
}

export function travasDeFlows(flows, { perdasPorUsuario, servico, manter, equipeCorte }) {
  const travas = []
  for (const f of flows) {
    if (f.dono.tipo === 'equipe') {
      if (f.dono.id === equipeCorte) travas.push({ id: f.id, motivo: 'dono é a equipe do corte' })
      continue
    }
    if (f.dono.id === servico || manter.has(f.dono.id)) continue
    if (f.incerto) {
      travas.push({ id: f.id, motivo: 'tabelas do flow incertas: mover o flow para a conta de serviço' })
      continue
    }
    const p = perdasPorUsuario.get(f.dono.id)
    const perdidas = f.tabelas.filter((t) => p && (p.escrita.includes(t) || p.leitura.includes(t)))
    if (perdidas.length) travas.push({ id: f.id, motivo: 'dono perde acesso a tabela do flow', tabelas: perdidas })
  }
  return travas
}

export function montarRelatorio({ estado, manter, uso, incertas, flows, referencias = [] }) {
  const erros = conferirManter(estado, manter)
  const plano = planoDoCorte(estado, { manter })
  const lista = perdasPorPessoa(estado, plano)
  const { travas, informativo } = travasDePessoas(lista, { uso, incertas })
  const perdasPorUsuario = new Map(lista.map((p) => [p.id, p]))
  const travasFlows = travasDeFlows(flows, { perdasPorUsuario, servico: estado.servico, manter, equipeCorte: estado.equipe?.id })
  const perdem = new Set(lista.filter((p) => p.escrita.length || p.leitura.length).map((p) => p.id))
  return {
    zero: !erros.length && !travas.length && !travasFlows.length,
    erros, plano, travas, travasFlows, informativo,
    referencias: referencias.filter((r) => perdem.has(r.dono)),
    incertas: [...incertas].sort(),
  }
}

// Log público do Actions: só contagens, nomes de tabela e ids curtos com hash.
export function resumoPublico(rel, { ambiente, sal }) {
  const h = (id) => hashCurto(id, sal)
  const pessoas = new Set(rel.plano.pessoasRemover.map((p) => p.usuario)).size
  const lista = (itens, f) => (itens.length ? ` (${itens.map(f).join('; ')})` : '')
  return [
    `Corte dos acessos (${ambiente}): ${rel.zero ? 'ZERO, pode aplicar' : 'TRAVADO, nada aplicado'}`,
    `Plano: equipe perde ${rel.plano.equipeRemover.length} papel(is) e ganha ${rel.plano.equipeAdicionar.length}; ${rel.plano.pessoasRemover.length} papel(is) direto(s) saem de ${pessoas} pessoa(s)`,
    `Travas de pessoas: ${rel.travas.length}${lista(rel.travas, (t) => `${h(t.id)}: ${t.tabelas.join(', ')}`)}`,
    `Travas de flows: ${rel.travasFlows.length}${lista(rel.travasFlows, (t) => `${h(t.id)}: ${t.motivo}`)}`,
    ...rel.erros.map((e) => `Erro: ${e.id ? `${h(e.id)}: ` : ''}${e.motivo}`),
    `Informativo: ${rel.informativo.length} pessoa(s) perdem acesso sem uso nos últimos ${DIAS} dias; ${rel.referencias.length} referência(s) de conexão de quem perde acesso; tabelas sem medida de uso: ${rel.incertas.join(', ') || 'nenhuma'}`,
  ].join('\n')
}

export function fotoDoCorte(estado, plano, { ambiente, host, quando, commit }, unidade) {
  const porPessoa = new Map()
  for (const { usuario, papel } of plano.pessoasRemover) porPessoa.set(usuario, [...(porPessoa.get(usuario) ?? []), papel])
  const ids = [...plano.equipeRemover, ...plano.pessoasRemover.map((p) => p.papel)]
  return {
    versao: 2, ambiente, host, quando, commit,
    equipe: estado.equipe ? { id: estado.equipe.id, papeis: [...plano.equipeRemover] } : null,
    base: estado.base,
    pessoas: [...porPessoa].map(([id, papeis]) => ({ id, papeis })),
    nomes: Object.fromEntries(ids.map((id) => [id, estado.papeis.get(id)?.nome ?? ''])),
    unidade,
  }
}

export function lerFoto(texto) {
  let f
  try {
    f = JSON.parse(String(texto).replace(/^﻿/, ''))
  } catch {
    f = null
  }
  const ids = (lista) => Array.isArray(lista) && lista.every((x) => GUID.test(x))
  const ok = (f?.versao === 1 || f?.versao === 2) && AMBIENTES.includes(f.ambiente) && typeof f.host === 'string' &&
    (f.equipe === null || (GUID.test(f.equipe?.id ?? '') && ids(f.equipe.papeis))) && Array.isArray(f.pessoas) && f.pessoas.every((p) => GUID.test(p?.id ?? '') && ids(p.papeis))
  if (!ok) throw new Error('foto do corte em formato desconhecido; nada feito')
  if (f.versao === 2) {
    const u = f.unidade
    const unidadeOk = u && typeof u.existia === 'boolean' && typeof u.recursoAntes === 'boolean' && ids(u.documentos) &&
      Array.isArray(u.trocas) && u.trocas.every((t) => GUID.test(t?.usuario ?? '') && GUID.test(t?.papel ?? ''))
    if (!unidadeOk) throw new Error('foto do corte versao 2 sem unidade valida; nada feito')
  }
  return f
}

export function mesmoPlano(foto, plano) {
  const chave = (lista) => JSON.stringify([...lista].sort())
  return chave(foto.equipe?.papeis ?? []) === chave(plano.equipeRemover) &&
    chave(foto.pessoas.flatMap((p) => p.papeis.map((r) => `${p.id}|${r}`))) === chave(plano.pessoasRemover.map((p) => `${p.usuario}|${p.papel}`))
}

// União de todas as fotos: um corte em mais de uma execução continua desfazível. Perfil - Base fica na equipe.
export function planoDesfazer(fotos, estado) {
  const daEquipe = new Set(estado.equipe ? estado.equipes.get(estado.equipe.id) ?? [] : [])
  const pessoas = new Map(estado.pessoas.filter((p) => !p.app).map((p) => [p.id, p]))
  const equipe = new Set(), diretos = new Map(), ignorados = new Set()
  for (const f of fotos) {
    if ((f.equipe?.id ?? null) !== (estado.equipe?.id ?? null)) throw new Error('foto de outra equipe; nada feito')
    for (const r of f.equipe?.papeis ?? []) {
      if (!estado.papeis.has(r)) ignorados.add(r)
      else if (!daEquipe.has(r)) equipe.add(r)
    }
    for (const p of f.pessoas) {
      const atual = pessoas.get(p.id)
      if (!atual) { ignorados.add(p.id); continue }
      for (const r of p.papeis) {
        if (!estado.papeis.has(r)) ignorados.add(r)
        else if (!atual.diretos.includes(r)) diretos.set(`${p.id}|${r}`, { usuario: p.id, papel: r })
      }
    }
  }
  return { equipeAdicionar: [...equipe], pessoasAdicionar: [...diretos.values()], ignorados: [...ignorados] }
}
