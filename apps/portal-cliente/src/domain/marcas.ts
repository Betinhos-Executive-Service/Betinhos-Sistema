import logoReciclaBr from '../assets/logo-reciclabr-latasa.webp'
import { dominioDe } from './pedidos'

export type Marca = { nome: string; logo: string }

/** Clientes que aparecem em parceria com a Betinhos. Cliente fora da lista mostra só a Betinhos. */
const PARCEIRAS: { chave: string; clientes: string[]; dominios: string[]; marca: Marca }[] = [
  { chave: 'latasa', clientes: ['latasa', 'reciclabr'], dominios: ['reciclabr.com.br'], marca: { nome: 'ReciclaBR Latasa', logo: logoReciclaBr } },
]

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Marca do cliente para o co-branding. Depois do login vem do nome do cliente da sessão;
 * na tela de entrada, do `?c=<chave>` do link ou do domínio do e-mail digitado.
 */
export function marcaParceira({ cliente, email, chave }: { cliente?: string; email?: string; chave?: string | null }): Marca | null {
  const nome = cliente ? normal(cliente) : ''
  const dominio = email ? normal(dominioDe(email.trim())) : ''
  const achada = PARCEIRAS.find((p) =>
    (chave && normal(chave) === p.chave)
    || (nome && p.clientes.some((c) => nome.includes(c)))
    || (dominio && p.dominios.includes(dominio)))
  return achada?.marca ?? null
}
