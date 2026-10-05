import type { PassageiroServico, Reserva } from './types'
import { normalizeStatus as normalize } from './serviceState'

export type Passageiro = { key: string; nome: string; telefone: string; endereco: string; origem: 'servico' | 'lookup' | 'texto' }

// O "(" inicial entra no match para "Nome - (11) 98888-7777" não deixar um parêntese solto no nome.
const PHONE = /\(?\+?\d[\d\s().-]{7,}\d\)?/

/** Tira os parênteses que embrulham o telefone inteiro, como em "Nome - (11 98888-7777)" no legado. */
const unwrap = (phone: string) => {
  const inner = phone.match(/^\(([^()]*)\)$/)
  return inner ? inner[1].trim() : phone
}

/** Texto livre do campo VIEW: um passageiro por linha ou por ";", telefone em qualquer posição. */
export function parsePassengerText(text: string) {
  return text.split(/\r?\n|;/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const found = line.match(PHONE)?.[0].trim() ?? ''
    const nome = line.replace(found, '').replace(/^[\s\-–:|,]+|[\s\-–:|,]+$/g, '').trim()
    return { nome, telefone: unwrap(found) }
  })
}

const sameName = (a: string, b: string) => normalize(a).replace(/\s+/g, ' ') === normalize(b).replace(/\s+/g, ' ')

/** Ordem canônica: filhos (cr40f_servicosporpassageiro) > lookups passageiro1..4 > texto livre. */
export function passengerList(reserva: Reserva, filhos: PassageiroServico[] = []): Passageiro[] {
  const parsed = parsePassengerText(reserva.passageirosTexto)
  const phoneFor = (nome: string) => parsed.find((p) => sameName(p.nome, nome))?.telefone ?? ''
  if (filhos.length) return filhos.map((f) => ({ key: f.id, nome: f.nome, telefone: phoneFor(f.nome), endereco: f.enderecoSaida, origem: 'servico' }))
  if (reserva.passageirosLookup.length) return reserva.passageirosLookup.map((p) => ({ key: p.id, nome: p.nome, telefone: phoneFor(p.nome), endereco: '', origem: 'lookup' }))
  return parsed.map((p, index) => ({ key: `texto-${index}`, nome: p.nome, telefone: p.telefone, endereco: '', origem: 'texto' }))
}
