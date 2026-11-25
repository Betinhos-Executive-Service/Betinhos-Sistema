import { chaveDuplicado, chaveNome, dominioDe, JANELA_DUPLICADO_MS, MSG_NAO_CANCELA, nomeDoEmail, normalizarPedido, podeCancelar, primeiroErroPedido, soDigitos } from '../domain/pedidos'
import { podeAprovar } from '../domain/regras'
import type { Modulo, Motivo, NovoPedido, PassageiroPedido, Pedido, Servico, Sessao } from '../domain/types'
import { gerarPedidos, gerarServicos, PESSOAS_LATASA, type PedidoMock } from './mockDados'
import { ErroPortal, senhaFraca, type PortalApi } from './PortalApi'

export const CODIGO_MOCK = '123456'
type Usuario = { nome: string; cliente: string; modulos: Modulo[] }
/** Mesma configuração que `cr40f_clientes1` terá: módulos e domínios por cliente. */
const CLIENTES: Record<string, { modulos: Modulo[]; dominios: string[] }> = {
  Tenaris: { modulos: ['validar'], dominios: [] },
  Latasa: { modulos: ['pedir', 'meus_servicos'], dominios: ['latasa.com.br'] },
  // Portal habilitado sem módulo nenhum: ninguém entra.
  'Sem Módulo': { modulos: [], dominios: ['semmodulo.com.br'] },
}
/** Validadores cadastrados pela Betinhos (Tenaris). Quem entra pelo domínio não precisa de cadastro. */
const VALIDADORES: Record<string, Usuario> = {
  'fiscal@tenaris.com': { nome: 'Marcos Albuquerque', cliente: 'Tenaris', modulos: ['validar'] },
  'financeiro@tenaris.com': { nome: 'Renata Siqueira', cliente: 'Tenaris', modulos: ['validar'] },
}

/** Cadastro por e-mail ou, sem cadastro, pelo domínio do cliente; cliente sem módulo não autoriza. */
export function usuarioMock(email: string): Usuario | null {
  const direto = VALIDADORES[email]
  if (direto) return direto
  const clientes = Object.entries(CLIENTES).filter(([, c]) => c.dominios.includes(dominioDe(email)))
  if (clientes.length !== 1) return null // dois clientes com o mesmo domínio: ninguém entra
  const [cliente, { modulos }] = clientes[0]
  return modulos.length ? { nome: nomeDoEmail(email), cliente, modulos } : null
}
const MAX_TENTATIVAS = 5
const BLOQUEIO_MS = 15 * 60 * 1000
const SESSAO_MS = 30 * 24 * 60 * 60 * 1000
const CHAVE_SENHAS = 'pc-mock-senhas'
const CHAVE_SESSAO = 'pc-mock-sessao'

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

/** Só do protótipo: apaga as senhas criadas e a sessão para testar o 1º acesso de novo. */
export function apagarSenhasMock(armazenamento: Armazenamento = armazenamentoPadrao()) {
  armazenamento.removeItem(CHAVE_SENHAS)
  armazenamento.removeItem(CHAVE_SESSAO)
}

/** PortalApi em memória para o protótipo: nada sai do navegador. Senhas e sessão ficam em `armazenamento` (no real, hash no Dataverse e cookie do Worker). */
export function createMockApi(opts: { atrasoMs?: number; agora?: () => Date; armazenamento?: Armazenamento } = {}): PortalApi {
  const agora = opts.agora ?? (() => new Date())
  const armazenamento = opts.armazenamento ?? armazenamentoPadrao()
  const espera = () => new Promise<void>((r) => setTimeout(r, opts.atrasoMs ?? 0))
  let servicos = gerarServicos(agora())
  let pedidos = gerarPedidos(agora())
  /** Pessoas por cliente (nome da sessão): no real, `cr40f_bancodedados` filtrado pelo cliente. */
  const pessoas: Record<string, Required<PassageiroPedido>[]> = { Latasa: structuredClone(PESSOAS_LATASA) }
  let seqPessoa = PESSOAS_LATASA.length
  let sessao: Sessao | null = null
  let tentativasErradas = 0
  let bloqueadoAte = 0
  /** Quem acertou o código do e-mail e falta criar a senha. */
  let pendente: { usuario: Usuario; email: string } | null = null

  const lerJson = <T,>(chave: string): T | null => {
    try {
      return JSON.parse(armazenamento.getItem(chave) ?? 'null') as T | null
    } catch {
      return null
    }
  }
  const gravar = (chave: string, valor: unknown) => armazenamento.setItem(chave, JSON.stringify(valor))
  const senhas = () => lerJson<Record<string, string>>(CHAVE_SENHAS) ?? {}
  const verificarBloqueio = () => {
    if (agora().getTime() < bloqueadoAte) throw new ErroPortal('bloqueado')
  }
  const errou = (codigo: 'codigo_invalido' | 'senha_invalida'): never => {
    if (++tentativasErradas < MAX_TENTATIVAS) throw new ErroPortal(codigo)
    tentativasErradas = 0
    pendente = null
    bloqueadoAte = agora().getTime() + BLOQUEIO_MS
    throw new ErroPortal('bloqueado')
  }
  const paraSessao = (u: Usuario, email: string): Sessao => ({ nome: u.nome, email, cliente: u.cliente, modulos: u.modulos })
  const abrirSessao = (u: Usuario, email: string): Sessao => {
    tentativasErradas = 0
    pendente = null
    sessao = paraSessao(u, email)
    gravar(CHAVE_SESSAO, { email, expiraEm: agora().getTime() + SESSAO_MS })
    return { ...sessao }
  }

  const copia = (s: Servico): Servico => structuredClone(s)
  const semSolicitante = ({ solicitante: _, ...p }: PedidoMock): Pedido => structuredClone(p)
  const exigirSessao = (modulo: Modulo) => {
    if (!sessao?.modulos.includes(modulo)) throw new ErroPortal('nao_permitido')
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
    async sessao() {
      await espera()
      const salva = lerJson<{ email: string; expiraEm: number }>(CHAVE_SESSAO)
      if (!salva || salva.expiraEm <= agora().getTime() || !senhas()[salva.email]) return null
      const usuario = usuarioMock(salva.email)
      if (!usuario) return null
      // Como o cookie do Worker: a validade conta do login, não renova ao recarregar.
      sessao = paraSessao(usuario, salva.email)
      return { ...sessao }
    },
    async entrar(email, senha) {
      await espera()
      verificarBloqueio()
      const emailNorm = email.trim().toLowerCase()
      const usuario = usuarioMock(emailNorm)
      const guardada = senhas()[emailNorm]
      if (!usuario || !guardada || guardada !== senha) return errou('senha_invalida')
      return abrirSessao(usuario, emailNorm)
    },
    async solicitarCodigo(email) {
      await espera()
      if (!usuarioMock(email.trim().toLowerCase())) throw new ErroPortal('sem_acesso')
    },
    async confirmarCodigo(email, codigo) {
      await espera()
      verificarBloqueio()
      pendente = null
      const emailNorm = email.trim().toLowerCase()
      const usuario = usuarioMock(emailNorm)
      if (!usuario || codigo.trim() !== CODIGO_MOCK) return errou('codigo_invalido')
      tentativasErradas = 0
      pendente = { usuario, email: emailNorm }
    },
    async criarSenha(senha) {
      await espera()
      if (!pendente) throw new ErroPortal('nao_permitido')
      if (senhaFraca(senha)) throw new ErroPortal('senha_fraca')
      const { usuario, email } = pendente
      gravar(CHAVE_SENHAS, { ...senhas(), [email]: senha })
      return abrirSessao(usuario, email)
    },
    async sair() {
      sessao = null
      armazenamento.removeItem(CHAVE_SESSAO)
    },
    async listar() {
      await espera()
      exigirSessao('validar')
      return servicos.map(copia)
    },
    async aprovar(ids) {
      await espera()
      const { nome } = exigirSessao('validar')
      const quando = agora().toISOString()
      return ids
        .filter((id) => servicos.some((s) => s.id === id && podeAprovar(s)))
        .map((id) => atualizar(id, (s) => ({ ...s, status: 'aprovado', aprovadoPor: nome, aprovadoEm: quando })))
    },
    async abrirDuvida(id, motivo, texto) {
      await espera()
      const { nome } = exigirSessao('validar')
      if (!texto.trim()) throw new ErroPortal('nao_permitido', 'Escreva a dúvida.')
      return atualizar(id, (s) => {
        if (!podeAprovar(s)) throw new ErroPortal('nao_permitido')
        return { ...s, status: 'em_duvida', mensagens: [...s.mensagens, mensagem(s, nome, texto.trim(), motivo)] }
      })
    },
    async responder(id, texto) {
      await espera()
      const { nome } = exigirSessao('validar')
      if (!texto.trim()) throw new ErroPortal('nao_permitido', 'Escreva a resposta.')
      return atualizar(id, (s) => ({ ...s, status: 'em_duvida', mensagens: [...s.mensagens, mensagem(s, nome, texto.trim())] }))
    },
    async buscarPassageiros(q) {
      await espera()
      const { cliente } = exigirSessao('pedir')
      const busca = chaveNome(q)
      return (pessoas[cliente] ?? [])
        .filter((p) => chaveNome(p.nome).includes(busca))
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .slice(0, 20)
        .map((p) => ({ ...p }))
    },
    async pedir(novo) {
      await espera()
      const { email, cliente } = exigirSessao('pedir')
      const pedido = normalizarPedido(novo)
      const primeiro = primeiroErroPedido(pedido, agora().getTime())
      if (primeiro) throw new ErroPortal('nao_permitido', primeiro)
      const chave = chaveDuplicado(email, pedido)
      const repetido = pedidos.some((p) => chaveDuplicado(p.solicitante, p) === chave && agora().getTime() - Date.parse(p.criadoEm) < JANELA_DUPLICADO_MS)
      if (repetido) throw new ErroPortal('duplicado', 'Este pedido acabou de ser enviado.')
      // Como o Worker: id tem de ser de pessoa do cliente; sem id, reaproveita mesmo nome + mesmo celular ou e-mail; contato mudado corrige a pessoa.
      const base = (pessoas[cliente] ??= [])
      const resolvidas = pedido.passageiros.map((p): Required<PassageiroPedido> => {
        const contato = { telefone: p.telefone ?? '', email: p.email ?? '' }
        if (p.id) {
          const atual = base.find((x) => x.id === p.id)
          if (!atual) throw new ErroPortal('nao_permitido', 'Passageiro não encontrado.')
          return { ...atual, ...contato }
        }
        const igual = base.find((x) => chaveNome(x.nome) === chaveNome(p.nome)
          && ((!!x.telefone && !!contato.telefone && soDigitos(x.telefone) === soDigitos(contato.telefone)) || (!!x.email && !!contato.email && x.email.toLowerCase() === contato.email.toLowerCase())))
        return igual ? { ...igual, telefone: igual.telefone || contato.telefone, email: igual.email || contato.email } : { id: '', nome: p.nome, ...contato }
      })
      const ids = resolvidas.map((p) => p.id).filter(Boolean)
      if (new Set(ids).size < ids.length) throw new ErroPortal('nao_permitido', 'Este passageiro já está no pedido.')
      const gravadas = resolvidas.map((p) => {
        if (p.id) {
          base.splice(base.findIndex((x) => x.id === p.id), 1, p)
          return p
        }
        const nova = { ...p, id: `pes-${++seqPessoa}` }
        base.push(nova)
        return nova
      })
      const criado: PedidoMock = {
        ...pedido, passageiros: gravadas.map((p) => p.nome), pessoas: gravadas.map((p) => ({ ...p })),
        id: `ped-${pedidos.length + 1}`, numero: `RV-${48400 + pedidos.length}`, status: 'solicitado', criadoEm: agora().toISOString(), solicitante: email,
      }
      pedidos = [criado, ...pedidos]
      return semSolicitante(criado)
    },
    async meusServicos() {
      await espera()
      const { email } = exigirSessao('meus_servicos')
      return pedidos.filter((p) => p.solicitante === email).map(semSolicitante)
    },
    async cancelarPedido(id) {
      await espera()
      const { email } = exigirSessao('meus_servicos')
      const atual = pedidos.find((p) => p.id === id && p.solicitante === email)
      if (!atual) throw new ErroPortal('nao_permitido', 'Pedido não encontrado.')
      if (!podeCancelar(atual.status)) throw new ErroPortal('nao_permitido', MSG_NAO_CANCELA)
      const cancelado: PedidoMock = { ...atual, status: 'cancelado' }
      pedidos = pedidos.map((p) => (p.id === id ? cancelado : p))
      return semSolicitante(cancelado)
    },
  }
}
