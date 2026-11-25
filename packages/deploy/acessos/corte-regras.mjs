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
