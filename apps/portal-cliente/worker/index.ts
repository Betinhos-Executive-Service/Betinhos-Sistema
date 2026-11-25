// Worker do portal do cliente: /api/* (login, validação, pedidos) + build do app em ./dist (assets) + cron diário.
// Cada rota exige o módulo do cliente na sessão (Tenaris valida; Latasa pede e acompanha).
import type { Modulo } from '../src/domain/types'
import { confirmarCodigo, criarSenha, entrarComSenha, lerSessao, normalizarEmail, sair, sessaoAtual, solicitarCodigo, type Ctx } from './auth'
import { decidirAprovacao, listarAprovacoes } from './aprovacao'
import { rodarAvisos } from './avisos'
import { aplicarTacita, enviarResumos } from './cron'
import { sha256Hex } from './cripto'
import { criarDv } from './dataverse'
import type { Env } from './env'
import { sugerirEnderecos } from './enderecos'
import { responderRota } from './rota'
import { erro } from './http'
import { baixarLogo, consultarMarca } from './marca'
import { cancelarPedido, criarPedido, listarPassageiros, listarPedidos } from './pedidos'
import { abrirDuvida, aprovar, listar, responder } from './servicos'

const SEGURANCA: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; " +
    "font-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000',
}

function comSeguranca(resp: Response): Response {
  const r = new Response(resp.body, resp)
  // Resposta que já traz a própria CSP (o logo, `default-src 'none'`) a mantém.
  for (const [k, v] of Object.entries(SEGURANCA)) if (k !== 'Content-Security-Policy' || !r.headers.has(k)) r.headers.set(k, v)
  return r
}

/** Rotas de login com e-mail no corpo: limite por e-mail além do por IP. */
const AUTH_POR_EMAIL: Record<string, (req: Request, c: Ctx) => Promise<Response>> = {
  'POST /auth/entrar': entrarComSenha,
  'POST /auth/codigo': solicitarCodigo,
  'POST /auth/codigo/confirmar': confirmarCodigo,
}

/** Cron de 10 em 10 minutos (wrangler.jsonc); o diário cuida da aprovação tácita e do resumo. */
export const CRON_AVISOS = '*/10 * * * *'

type ExecCtx = { waitUntil(p: Promise<unknown>): void }

/** E-mail do corpo, sem consumir o stream original (para o limite por e-mail). */
async function emailDoCorpo(req: Request): Promise<string> {
  try {
    return normalizarEmail(((await req.clone().json()) as { email?: unknown }).email)
  } catch {
    return ''
  }
}

async function api(req: Request, env: Env, url: URL, exec: ExecCtx): Promise<Response> {
  const caminho = url.pathname.slice('/api'.length)
  // CSRF: escrita só da própria origem (o navegador sempre manda Origin em POST).
  if (req.method !== 'GET' && req.headers.get('Origin') !== url.origin) return erro(403, 'nao_permitido')
  const ip = req.headers.get('CF-Connecting-IP') ?? 'local'
  if (env.RL_IP && !(await env.RL_IP.limit({ key: `ip:${ip}` })).success) return erro(429, 'bloqueado')

  const c: Ctx = { env, dv: criarDv(env), agora: Date.now(), waitUntil: (p) => exec.waitUntil(p) }
  const rota = `${req.method} ${caminho}`

  const porEmail = AUTH_POR_EMAIL[rota]
  if (porEmail) {
    const email = await emailDoCorpo(req)
    if (env.RL_EMAIL && email && !(await env.RL_EMAIL.limit({ key: `email:${await sha256Hex(email)}` })).success) return erro(429, 'bloqueado')
    return porEmail(req, c)
  }
  if (rota === 'POST /auth/senha') return criarSenha(req, c)
  if (rota === 'GET /auth/sessao') return lerSessao(req, c)
  if (rota === 'POST /auth/sair') return sair()
  if (rota === 'GET /marca') return consultarMarca(c.dv, url)
  const logo = /^GET \/marca\/logo\/([^/]+)$/.exec(rota)
  if (logo) return baixarLogo(c.dv, logo[1])

  const sessao = await sessaoAtual(req, c)
  if (!sessao) return erro(401, 'nao_permitido')
  const com = (modulo: Modulo, rodar: () => Promise<Response>) => (sessao.modulos.includes(modulo) ? rodar() : Promise.resolve(erro(403, 'nao_permitido')))
  if (rota === 'POST /pedidos') return com('pedir', () => criarPedido(req, c, sessao))
  if (rota === 'GET /passageiros') return com('pedir', () => listarPassageiros(c, sessao, url.searchParams.get('q') ?? ''))
  if (rota === 'GET /enderecos') return com('pedir', () => sugerirEnderecos(env, url.searchParams.get('q') ?? ''))
  if (rota === 'GET /rota') return com('pedir', () => responderRota(env, url.searchParams.get('o') ?? '', url.searchParams.get('d') ?? ''))
  if (rota === 'GET /pedidos') return com('meus_servicos', () => listarPedidos(c, sessao))
  // Aprovação: quem aprova pode não pedir, então basta ter Pedir ou Meus serviços; o papel de aprovador é conferido na rota.
  const comPedidos = (rodar: () => Promise<Response>) => (sessao.modulos.includes('pedir') || sessao.modulos.includes('meus_servicos') ? rodar() : Promise.resolve(erro(403, 'nao_permitido')))
  if (rota === 'GET /aprovacoes') return comPedidos(() => listarAprovacoes(c, sessao))
  const decidir = /^POST \/aprovacoes\/([^/]+)$/.exec(rota)
  if (decidir) return comPedidos(() => decidirAprovacao(req, c, sessao, decidir[1]))
  const cancelar = /^POST \/pedidos\/([^/]+)\/cancelar$/.exec(rota)
  if (cancelar) return com('meus_servicos', () => cancelarPedido(c, sessao, cancelar[1]))
  if (rota === 'GET /servicos') return com('validar', () => listar(c, sessao))
  if (rota === 'POST /servicos/aprovar') return com('validar', () => aprovar(req, c, sessao))
  const m = /^POST \/servicos\/([^/]+)\/(duvida|responder)$/.exec(rota)
  if (m) return com('validar', () => (m[2] === 'duvida' ? abrirDuvida(req, c, sessao, m[1]) : responder(req, c, sessao, m[1])))
  return erro(404, 'nao_permitido')
}

export default {
  async fetch(req: Request, env: Env, exec: ExecCtx): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/')) {
      try {
        return comSeguranca(await api(req, env, url, exec))
      } catch (e) {
        console.error('api', url.pathname, String(e))
        return comSeguranca(erro(500, 'falha'))
      }
    }
    const asset = env.ASSETS ? await env.ASSETS.fetch(req) : new Response('Não encontrado', { status: 404 })
    return comSeguranca(asset)
  },

  async scheduled(controller: { scheduledTime: number; cron?: string }, env: Env, exec: ExecCtx): Promise<void> {
    const dv = criarDv(env)
    if (controller.cron === CRON_AVISOS) {
      exec.waitUntil(rodarAvisos(env, dv, controller.scheduledTime).then((r) => console.log(`cron/avisos: ${r.confirmados} confirmado(s), ${r.lembretes} lembrete(s), ${r.operacao} aviso(s) à operação`)))
      return
    }
    exec.waitUntil(
      (async () => {
        const tacitas = await aplicarTacita(dv, controller.scheduledTime)
        const resumos = await enviarResumos(env, dv, controller.scheduledTime)
        console.log(`cron: ${tacitas} aprovação(ões) tácita(s), ${resumos} resumo(s)`)
      })(),
    )
  },
}
