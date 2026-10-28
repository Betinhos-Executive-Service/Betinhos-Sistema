import { Secret, TOTP } from 'otpauth'
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
const LEMBRAR_MS = 30 * 24 * 60 * 60 * 1000
const CHAVE_SEGREDOS = 'pc-mock-autenticadores'
const CHAVE_DISPOSITIVO = 'pc-dispositivo'

export type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** localStorage quando existe e funciona (aba privada pode lançar); senão, memória. */
export function armazenamentoPadrao(): Armazenamento {
  try {
    const t = '__pc_teste__'
    localStorage.setItem(t, t)
    localStorage.removeItem(t)
    return localStorage
  } catch {
    return armazenamentoEmMemoria()
  }
}

export function armazenamentoEmMemoria(): Armazenamento {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) }
}

/** Só do protótipo: apaga autenticadores e computador lembrado para testar o 1º acesso de novo. */
export function refazerAutenticadorMock(armazenamento: Armazenamento = armazenamentoPadrao()) {
  armazenamento.removeItem(CHAVE_SEGREDOS)
  armazenamento.removeItem(CHAVE_DISPOSITIVO)
}

/** Mesmos parâmetros que o Worker usará: RFC 6238, SHA-1, 30 s, 6 dígitos. */
export function totpDo(email: string, segredo: string) {
  return new TOTP({ issuer: 'Betinhos', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(segredo) })
}

/** PortalApi em memória para o protótipo: nada sai do navegador. O segredo TOTP fica em `armazenamento` (no real, cifrado pelo Worker). */
export function createMockApi(opts: { atrasoMs?: number; agora?: () => Date; armazenamento?: Armazenamento } = {}): PortalApi {
  const agora = opts.agora ?? (() => new Date())
  const armazenamento = opts.armazenamento ?? armazenamentoPadrao()
  const espera = () => new Promise<void>((r) => setTimeout(r, opts.atrasoMs ?? 0))
  let servicos = gerarServicos(agora())
  let sessao: Sessao | null = null
  let tentativasErradas = 0
  let bloqueadoAte = 0
  /** Validador que passou pelo código do e-mail e falta o TOTP; `segredoNovo` só existe no cadastro. */
  let pendente: { nome: string; email: string; segredoNovo?: string } | null = null

  const lerJson = <T,>(chave: string): T | null => {
    try {
      return JSON.parse(armazenamento.getItem(chave) ?? 'null') as T | null
    } catch {
      return null
    }
  }
  const gravar = (chave: string, valor: unknown) => armazenamento.setItem(chave, JSON.stringify(valor))
  const segredos = () => lerJson<Record<string, string>>(CHAVE_SEGREDOS) ?? {}
  const lembrado = (email: string) => {
    const d = lerJson<{ email: string; expiraEm: number }>(CHAVE_DISPOSITIVO)
    return !!d && d.email === email && d.expiraEm > agora().getTime()
  }
  const verificarBloqueio = () => {
    if (agora().getTime() < bloqueadoAte) throw new ErroPortal('bloqueado')
  }
  const errou = (codigo: 'codigo_invalido' | 'totp_invalido'): never => {
    if (++tentativasErradas < MAX_TENTATIVAS) throw new ErroPortal(codigo)
    tentativasErradas = 0
    pendente = null
    bloqueadoAte = agora().getTime() + BLOQUEIO_MS
    throw new ErroPortal('bloqueado')
  }
  const abrirSessao = (nome: string, email: string): Sessao => {
    tentativasErradas = 0
    pendente = null
    sessao = { nome, email, cliente: 'Tenaris' }
    return { ...sessao }
  }

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
      verificarBloqueio()
      // Nova tentativa de e-mail invalida a etapa do autenticador que estava aberta.
      pendente = null
      const emailNorm = email.trim().toLowerCase()
      const nome = VALIDADORES[emailNorm]
      if (!nome || codigo.trim() !== CODIGO_MOCK) return errou('codigo_invalido')
      tentativasErradas = 0
      if (lembrado(emailNorm)) return { etapa: 'ok', sessao: abrirSessao(nome, emailNorm) }
      const segredo = segredos()[emailNorm]
      if (segredo) {
        pendente = { nome, email: emailNorm }
        return { etapa: 'autenticador' }
      }
      const segredoNovo = new Secret({ size: 20 }).base32
      pendente = { nome, email: emailNorm, segredoNovo }
      return { etapa: 'cadastrar_autenticador', otpauthUrl: totpDo(emailNorm, segredoNovo).toString(), segredo: segredoNovo }
    },
    async confirmarAutenticador(codigoTotp, lembrar) {
      await espera()
      verificarBloqueio()
      if (!pendente) throw new ErroPortal('nao_permitido')
      const { nome, email, segredoNovo } = pendente
      const segredo = segredoNovo ?? segredos()[email]
      // janela 1: aceita o código do intervalo anterior e do seguinte (relógio do celular adiantado/atrasado).
      if (!segredo || totpDo(email, segredo).validate({ token: codigoTotp.trim(), timestamp: agora().getTime(), window: 1 }) === null) {
        return errou('totp_invalido')
      }
      if (segredoNovo) gravar(CHAVE_SEGREDOS, { ...segredos(), [email]: segredoNovo })
      // No portal real é um token opaco do Worker; aqui basta o e-mail e a validade.
      if (lembrar) gravar(CHAVE_DISPOSITIVO, { email, expiraEm: agora().getTime() + LEMBRAR_MS })
      return abrirSessao(nome, email)
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
