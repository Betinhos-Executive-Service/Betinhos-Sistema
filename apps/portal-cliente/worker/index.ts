// Worker do portal de validação: /api/* (login, serviços) + build do app em ./dist (assets) + cron diário.
import { confirmarTotp, entrar, normalizarEmail, sair, sessaoAtual, solicitarCodigo, type Ctx } from './auth'
import { aplicarTacita, enviarResumos } from './cron'
import { sha256Hex } from './cripto'
import { criarDv } from './dataverse'
import type { Env } from './env'
import { erro } from './http'
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
  for (const [k, v] of Object.entries(SEGURANCA)) r.headers.set(k, v)
  return r
}

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

  if (rota === 'POST /auth/codigo' || rota === 'POST /auth/entrar') {
    const email = await emailDoCorpo(req)
    if (env.RL_EMAIL && email && !(await env.RL_EMAIL.limit({ key: `email:${await sha256Hex(email)}` })).success) return erro(429, 'bloqueado')
    return rota === 'POST /auth/codigo' ? solicitarCodigo(req, c) : entrar(req, c)
  }
  if (rota === 'POST /auth/totp') return confirmarTotp(req, c)
  if (rota === 'POST /auth/sair') return sair()

  const sessao = await sessaoAtual(req, c)
  if (!sessao) return erro(401, 'nao_permitido')
  if (rota === 'GET /servicos') return listar(c, sessao)
  if (rota === 'POST /servicos/aprovar') return aprovar(req, c, sessao)
  const m = /^POST \/servicos\/([^/]+)\/(duvida|responder)$/.exec(rota)
  if (m) return m[2] === 'duvida' ? abrirDuvida(req, c, sessao, m[1]) : responder(req, c, sessao, m[1])
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

  async scheduled(controller: { scheduledTime: number }, env: Env, exec: ExecCtx): Promise<void> {
    const dv = criarDv(env)
    exec.waitUntil(
      (async () => {
        const tacitas = await aplicarTacita(dv, controller.scheduledTime)
        const resumos = await enviarResumos(env, dv, controller.scheduledTime)
        console.log(`cron: ${tacitas} aprovação(ões) tácita(s), ${resumos} resumo(s)`)
      })(),
    )
  },
}
