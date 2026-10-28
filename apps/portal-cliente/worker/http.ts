// Respostas, cookies e sessão. A sessão é um cookie cifrado (AES-GCM), sem tabela: some ao expirar ou ao sair.
import { cifrar, decifrar } from './cripto'
import type { Env } from './env'

/** Mesmos códigos do `ErroPortal` do app (contrato das duas etapas). */
export type CodigoErro = 'codigo_invalido' | 'codigo_expirado' | 'totp_invalido' | 'bloqueado' | 'nao_permitido' | 'falha'

export const json = (corpo: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } })

export const erro = (status: number, codigo: CodigoErro, mensagem?: string) => json({ erro: codigo, ...(mensagem ? { mensagem } : {}) }, status)

export const COOKIE = { sessao: '__Host-portal_sessao', etapa: '__Host-portal_etapa', dispositivo: '__Host-portal_dispositivo' } as const

export const SESSAO_S = 12 * 60 * 60
export const ETAPA_S = 10 * 60
export const DISPOSITIVO_S = 30 * 24 * 60 * 60

export const setCookie = (nome: string, valor: string, maxAge: number) =>
  `${nome}=${valor}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`
export const apagarCookie = (nome: string) => setCookie(nome, '', 0)

export function lerCookie(req: Request, nome: string): string | null {
  for (const parte of (req.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = parte.trim().split('=')
    if (k === nome) return v.join('=') || null
  }
  return null
}

export type Sessao = { vid: string; cid: string; nome: string; email: string; cliente: string; exp: number }
/** Entre o código do e-mail e o TOTP. `segredo` só no 1º acesso (ainda não gravado no Dataverse). */
export type Etapa = { vid: string; email: string; exp: number; segredo?: string }

export async function selar(env: Env, contexto: 'sessao' | 'etapa', dados: Sessao | Etapa): Promise<string> {
  return cifrar(JSON.stringify(dados), env.CHAVE_SESSAO, contexto)
}

export async function abrir<T extends { exp: number }>(env: Env, req: Request, nome: string, contexto: 'sessao' | 'etapa', agoraMs: number): Promise<T | null> {
  const valor = lerCookie(req, nome)
  if (!valor) return null
  const texto = await decifrar(valor, env.CHAVE_SESSAO, contexto)
  if (!texto) return null
  const dados = JSON.parse(texto) as T
  return dados.exp > agoraMs ? dados : null
}

export async function lerJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}
