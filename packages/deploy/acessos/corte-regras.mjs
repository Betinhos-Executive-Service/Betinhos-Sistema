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
  const daEquipe = estado.equipes.get(estado.equipe.id) ?? []
  const pessoasRemover = []
  for (const p of estado.pessoas) {
    if (p.app || p.id === estado.servico) continue
    for (const r of p.diretos) {
      if (PAPEIS_ANTIGOS.includes(nome(r)) || (ADMIN.includes(nome(r)) && !manter.has(p.id))) pessoasRemover.push({ usuario: p.id, papel: r })
    }
  }
  return {
    equipeRemover: daEquipe.filter((r) => r !== estado.base),
    equipeAdicionar: daEquipe.includes(estado.base) ? [] : [estado.base],
    pessoasRemover,
  }
}

export const planoVazio = (p) => !p.equipeRemover.length && !p.equipeAdicionar.length && !p.pessoasRemover.length

export function aplicarPlano(estado, plano) {
  const equipes = new Map(estado.equipes)
  const atuais = new Set(equipes.get(estado.equipe.id) ?? [])
  for (const r of plano.equipeRemover) atuais.delete(r)
  for (const r of plano.equipeAdicionar) atuais.add(r)
  equipes.set(estado.equipe.id, [...atuais])
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
