// Login em duas etapas: código de 6 dígitos por e-mail (10 min) + TOTP do autenticador.
// 5 erros (código ou TOTP) no mesmo e-mail bloqueiam por 15 min. Dispositivo confiável dispensa o TOTP por 30 dias.
import { cifrar, decifrar, iguais, novoCodigo, novoSegredoTotp, novoToken, otpauthUrl, sha256Hex, verificarTotp } from './cripto'
import { enviarEmail, type Dv } from './dataverse'
import type { Env } from './env'
import type { Registro } from './mapear'
import { guid, validadorPorEmail, validadorPorId } from './odata'
import { SET } from './schema'
import {
  abrir, apagarCookie, COOKIE, DISPOSITIVO_S, erro, ETAPA_S, json, lerCookie, lerJson, selar, SESSAO_S, setCookie,
  type Etapa, type Sessao,
} from './http'

const CODIGO_MS = 10 * 60 * 1000
const MAX_FALHAS = 5
const BLOQUEIO_S = 15 * 60
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normalizarEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '')

type Ctx = { env: Env; dv: Dv; agora: number; waitUntil(p: Promise<unknown>): void }

const chaveFalhas = async (email: string) => `falhas:${await sha256Hex(email)}`

async function bloqueado(env: Env, email: string): Promise<boolean> {
  return Number((await env.KV.get(await chaveFalhas(email))) ?? 0) >= MAX_FALHAS
}

/** Conta a falha; na 5ª devolve 429 e o contador vira o bloqueio (TTL de 15 min). */
async function falhar(env: Env, email: string, status: number, codigo: 'codigo_invalido' | 'codigo_expirado' | 'totp_invalido') {
  const chave = await chaveFalhas(email)
  const n = Number((await env.KV.get(chave)) ?? 0) + 1
  await env.KV.put(chave, String(n), { expirationTtl: BLOQUEIO_S })
  return n >= MAX_FALHAS ? erro(429, 'bloqueado') : erro(status, codigo)
}

async function buscarValidador(dv: Dv, email: string): Promise<Registro | null> {
  const achados = await dv.lista(validadorPorEmail(email))
  return achados.length === 1 ? achados[0] : null // duplicado no cadastro: ninguém entra
}

const hashCodigo = (vid: string, codigo: string) => sha256Hex(`${vid}:${codigo}`)

export async function solicitarCodigo(req: Request, c: Ctx): Promise<Response> {
  const email = normalizarEmail((await lerJson<{ email?: string }>(req))?.email)
  if (!EMAIL.test(email)) return new Response(null, { status: 204 })
  // Busca e envio fora da resposta: o tempo de resposta não revela se o e-mail existe.
  c.waitUntil(
    (async () => {
      const v = await buscarValidador(c.dv, email)
      if (!v) return
      const vid = String(v.cr40f_validadorclienteid)
      const codigo = novoCodigo()
      await c.dv.post(SET.codigo, {
        cr40f_name: email.slice(0, 100),
        'cr40f_Validador@odata.bind': `/${SET.validador}(${vid})`,
        cr40f_hashcodigo: await hashCodigo(vid, codigo),
        cr40f_expiraem: new Date(c.agora + CODIGO_MS).toISOString(),
        cr40f_tentativas: 0,
        cr40f_usado: false,
      })
      await enviarEmail(c.env, 'codigo', [email], { nome: v.cr40f_name, codigo, validoMinutos: 10 })
    })().catch((e) => console.error('auth/codigo', String(e))),
  )
  return new Response(null, { status: 204 })
}

type SessaoPublica = { nome: string; email: string; cliente: string }

/** Grava o cookie de sessão (12 h), apaga o da etapa e responde com o corpo montado a partir da sessão pública. */
async function respostaSessao(c: Ctx, v: Registro, corpo: (s: SessaoPublica) => unknown, extras: string[] = []): Promise<Response> {
  const sessao: Sessao = {
    vid: String(v.cr40f_validadorclienteid),
    cid: String(v._cr40f_cliente_value),
    nome: String(v.cr40f_name ?? ''),
    email: String(v.cr40f_email ?? ''),
    cliente: String(v['_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue'] ?? ''),
    exp: c.agora + SESSAO_S * 1000,
  }
  c.waitUntil(c.dv.patch(`${SET.validador}(${sessao.vid})`, { cr40f_ultimoacesso: new Date(c.agora).toISOString() }).catch(() => {}))
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', setCookie(COOKIE.sessao, await selar(c.env, 'sessao', sessao), SESSAO_S))
  headers.append('Set-Cookie', apagarCookie(COOKIE.etapa))
  for (const h of extras) headers.append('Set-Cookie', h)
  return new Response(JSON.stringify(corpo({ nome: sessao.nome, email: sessao.email, cliente: sessao.cliente })), { status: 200, headers })
}

async function dispositivoValido(req: Request, c: Ctx, vid: string): Promise<boolean> {
  const token = lerCookie(req, COOKIE.dispositivo)
  if (!token) return false
  const filtro = `_cr40f_validador_value eq ${guid(vid)} and cr40f_hashtoken eq '${await sha256Hex(token)}' and cr40f_expiraem gt ${new Date(c.agora).toISOString()}`
  return (await c.dv.lista(`${SET.dispositivo}?$select=cr40f_dispositivoconfiavelid&$top=1&$filter=${encodeURIComponent(filtro)}`)).length > 0
}

export async function entrar(req: Request, c: Ctx): Promise<Response> {
  const corpo = await lerJson<{ email?: string; codigo?: string }>(req)
  const email = normalizarEmail(corpo?.email)
  const codigo = String(corpo?.codigo ?? '').trim()
  if (!EMAIL.test(email)) return erro(400, 'codigo_invalido')
  if (await bloqueado(c.env, email)) return erro(429, 'bloqueado')

  const v = await buscarValidador(c.dv, email)
  if (!v || !/^\d{6}$/.test(codigo)) return falhar(c.env, email, 401, 'codigo_invalido')
  const vid = String(v.cr40f_validadorclienteid)
  const filtro = `_cr40f_validador_value eq ${guid(vid)} and cr40f_usado eq false`
  const [ultimo] = await c.dv.lista(`${SET.codigo}?$select=cr40f_codigoacessoid,cr40f_hashcodigo,cr40f_expiraem&$orderby=createdon desc&$top=1&$filter=${encodeURIComponent(filtro)}`)
  if (!ultimo || !iguais(String(ultimo.cr40f_hashcodigo ?? ''), await hashCodigo(vid, codigo))) return falhar(c.env, email, 401, 'codigo_invalido')
  if (Date.parse(String(ultimo.cr40f_expiraem)) <= c.agora) return falhar(c.env, email, 401, 'codigo_expirado')

  await c.dv.patch(`${SET.codigo}(${ultimo.cr40f_codigoacessoid})`, { cr40f_usado: true })
  if (await dispositivoValido(req, c, vid)) {
    await c.env.KV.delete(await chaveFalhas(email))
    return respostaSessao(c, v, (sessao) => ({ etapa: 'ok', sessao }))
  }

  const etapa: Etapa = { vid, email, exp: c.agora + ETAPA_S * 1000 }
  let corpoResposta: unknown = { etapa: 'autenticador' }
  if (!v.cr40f_segredototp) {
    etapa.segredo = novoSegredoTotp()
    corpoResposta = { etapa: 'cadastrar_autenticador', otpauthUrl: otpauthUrl(etapa.segredo, email), segredo: etapa.segredo }
  }
  return json(corpoResposta, 200, { 'Set-Cookie': setCookie(COOKIE.etapa, await selar(c.env, 'etapa', etapa), ETAPA_S) })
}

export async function confirmarTotp(req: Request, c: Ctx): Promise<Response> {
  const etapa = await abrir<Etapa>(c.env, req, COOKIE.etapa, 'etapa', c.agora)
  if (!etapa) return erro(401, 'nao_permitido')
  if (await bloqueado(c.env, etapa.email)) return erro(429, 'bloqueado')
  const corpo = await lerJson<{ codigo?: string; lembrar?: boolean }>(req)
  const codigo = String(corpo?.codigo ?? '').trim()

  const v = await c.dv.get(validadorPorId(etapa.vid))
  if (v.cr40f_ativo !== true) return erro(401, 'nao_permitido')
  const segredo = etapa.segredo ?? (v.cr40f_segredototp ? await decifrar(String(v.cr40f_segredototp), c.env.CHAVE_TOTP, `totp:${etapa.vid}`) : null)
  if (!segredo) return erro(401, 'nao_permitido') // segredo zerado ("Refazer autenticador") no meio do login: recomeça
  // Mesmo código não vale duas vezes (replay dentro da janela de ±30 s).
  const chaveUso = `totp:${etapa.vid}:${codigo}`
  if (!(await verificarTotp(segredo, codigo, c.agora)) || (await c.env.KV.get(chaveUso))) return falhar(c.env, etapa.email, 401, 'totp_invalido')
  await c.env.KV.put(chaveUso, '1', { expirationTtl: 120 })
  await c.env.KV.delete(await chaveFalhas(etapa.email))

  if (etapa.segredo) await c.dv.patch(`${SET.validador}(${etapa.vid})`, { cr40f_segredototp: await cifrar(etapa.segredo, c.env.CHAVE_TOTP, `totp:${etapa.vid}`), cr40f_totpcadastradoem: new Date(c.agora).toISOString() })
  const extras: string[] = []
  if (corpo?.lembrar === true) {
    const token = novoToken()
    await c.dv.post(SET.dispositivo, {
      cr40f_name: etapa.email.slice(0, 100),
      'cr40f_Validador@odata.bind': `/${SET.validador}(${etapa.vid})`,
      cr40f_hashtoken: await sha256Hex(token),
      cr40f_expiraem: new Date(c.agora + DISPOSITIVO_S * 1000).toISOString(),
    })
    extras.push(setCookie(COOKIE.dispositivo, token, DISPOSITIVO_S))
  }
  return respostaSessao(c, v, (sessao) => sessao, extras)
}

export const sair = () =>
  new Response(null, { status: 204, headers: { 'Set-Cookie': apagarCookie(COOKIE.sessao) } })

export const sessaoAtual = (req: Request, c: Ctx) => abrir<Sessao>(c.env, req, COOKIE.sessao, 'sessao', c.agora)

export type { Ctx }
