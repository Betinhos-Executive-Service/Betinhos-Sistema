import { podeAprovar } from '../domain/regras'
import type { Motivo, Servico, Sessao } from '../domain/types'
import { gerarServicos } from './mockDados'
import { ErroPortal, type PortalApi } from './PortalApi'

export const CODIGO_MOCK = '123456'
const VALIDADORES: Record<string, string> = {
  'fiscal@tenaris.com': 'Marcos Albuquerque',
  'financeiro@tenaris.com': 'Renata Siqueira',
}
const MAX_TENTATIVAS = 5
const BLOQUEIO_MS = 15 * 60 * 1000

/** PortalApi em memória para o protótipo: nada sai do navegador. */
export function createMockApi(opts: { atrasoMs?: number; agora?: () => Date } = {}): PortalApi {
  const agora = opts.agora ?? (() => new Date())
  const espera = () => new Promise<void>((r) => setTimeout(r, opts.atrasoMs ?? 0))
  let servicos = gerarServicos(agora())
  let sessao: Sessao | null = null
  let tentativasErradas = 0
  let bloqueadoAte = 0

  const copia = (s: Servico): Servico => structuredClone(s)
  const exigirSessao = () => {
    if (!sessao) throw new ErroPortal('nao_permitido')
    return sessao
  }
  const atualizar = (id: string, muda: (s: Servico) => Servico) => {
    const atual = servicos.find((s) => s.id === id)
    if (!atual) throw new ErroPortal('nao_permitido')
    const novo = muda(copia(atual))
    servicos = servicos.map((s) => (s.id === id ? novo : s))
    return copia(novo)
  }
  const mensagem = (s: Servico, autor: string, texto: string, motivo?: Motivo) => ({
    id: `${s.id}-m${s.mensagens.length + 1}`, lado: 'cliente' as const, autor, texto, motivo, criadaEm: agora().toISOString(),
  })

  return {
    async solicitarCodigo() {
      await espera()
    },
    async entrar(email, codigo) {
      await espera()
      if (agora().getTime() < bloqueadoAte) throw new ErroPortal('bloqueado')
      const emailNorm = email.trim().toLowerCase()
      const nome = VALIDADORES[emailNorm]
      if (!nome || codigo.trim() !== CODIGO_MOCK) {
        if (++tentativasErradas < MAX_TENTATIVAS) throw new ErroPortal('codigo_invalido')
        tentativasErradas = 0
        bloqueadoAte = agora().getTime() + BLOQUEIO_MS
        throw new ErroPortal('bloqueado')
      }
      tentativasErradas = 0
      sessao = { nome, email: emailNorm, cliente: 'Tenaris' }
      return { ...sessao }
    },
    async sair() {
      sessao = null
    },
    async listar() {
      await espera()
      exigirSessao()
      return servicos.map(copia)
    },
    async aprovar(ids) {
      await espera()
      const { nome } = exigirSessao()
      const quando = agora().toISOString()
      return ids
        .filter((id) => servicos.some((s) => s.id === id && podeAprovar(s)))
        .map((id) => atualizar(id, (s) => ({ ...s, status: 'aprovado', aprovadoPor: nome, aprovadoEm: quando })))
    },
    async abrirDuvida(id, motivo, texto) {
      await espera()
      const { nome } = exigirSessao()
      if (!texto.trim()) throw new ErroPortal('nao_permitido', 'Escreva a dúvida.')
      return atualizar(id, (s) => {
        if (!podeAprovar(s)) throw new ErroPortal('nao_permitido')
        return { ...s, status: 'em_duvida', mensagens: [...s.mensagens, mensagem(s, nome, texto.trim(), motivo)] }
      })
    },
    async responder(id, texto) {
      await espera()
      const { nome } = exigirSessao()
      if (!texto.trim()) throw new ErroPortal('nao_permitido', 'Escreva a resposta.')
      return atualizar(id, (s) => ({ ...s, status: 'em_duvida', mensagens: [...s.mensagens, mensagem(s, nome, texto.trim())] }))
    },
  }
}
