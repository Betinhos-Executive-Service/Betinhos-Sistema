// Login por e-mail + senha. Quem entra: e-mail liberado pela Betinhos (validador cadastrado) ou, sem cadastro, e-mail de
// um domínio autorizado do cliente (cr40f_clientes1.cr40f_portaldominios), que ganha o cadastro no primeiro pedido de código.
// A senha é criada pela própria pessoa: no 1º acesso e no "Esqueci a senha", um código de 6 dígitos por e-mail (10 min)
// libera a etapa "criar senha". 5 erros (senha ou código) no mesmo e-mail bloqueiam por 15 min.
// A sessão (cookie de 30 dias) é conferida no Dataverse a cada chamada: desativar o usuário, tirar o portal ou trocar a
// senha derruba as sessões abertas.
import { REENVIO_S, SENHA_MIN, senhaFraca } from '../src/api/PortalApi'
import { dominioDe, nomeDoEmail } from '../src/domain/pedidos'
import { conferirSenha, HASH_FALSO, hashSenha, iguais, novoCodigo, sha256Hex } from './cripto'
import type { Marca } from '../src/domain/marca'
import { enviarEmail, ErroDataverse, type Dv } from './dataverse'
import type { Env } from './env'
import { marcaDaSessao } from './marca'
import { mapearModulos, modulosDe, type Registro } from './mapear'
import { clientesPorDominio, guid, validadorPorEmail, validadorPorId, validadorQualquerPorEmail } from './odata'
import { NAV, SET } from './schema'
import { abrir, apagarCookie, COOKIE, erro, ETAPA_S, json, lerJson, selar, SESSAO_S, setCookie, type Etapa, type Sessao } from './http'

const CODIGO_MS = 10 * 60 * 1000
const MAX_FALHAS = 5
const BLOQUEIO_S = 15 * 60
/** Respostas "sem acesso" por IP em 15 min: freia quem testa e-mails. Passou do teto, o IP inteiro espera (até quem tem acesso); senão o 429 revelaria quem não tem. */
const MAX_SEM_ACESSO_IP = 10
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SENHA_MAX = 200

export const normalizarEmail = (e: unknown) => (typeof e === 'string' ? e.trim().toLowerCase() : '')

type Ctx = { env: Env; dv: Dv; agora: number; waitUntil(p: Promise<unknown>): void }

const chaveFalhas = async (email: string) => `falhas:${await sha256Hex(email)}`

async function bloqueado(env: Env, email: string): Promise<boolean> {
  return Number((await env.KV.get(await chaveFalhas(email))) ?? 0) >= MAX_FALHAS
}

/** Conta a falha; na 5ª devolve 429 e o contador vira o bloqueio (TTL de 15 min). */
async function falhar(env: Env, email: string, codigo: 'codigo_invalido' | 'codigo_expirado' | 'senha_invalida') {
  const chave = await chaveFalhas(email)
  const n = Number((await env.KV.get(chave)) ?? 0) + 1
  await env.KV.put(chave, String(n), { expirationTtl: BLOQUEIO_S })
  return n >= MAX_FALHAS ? erro(429, 'bloqueado') : erro(401, codigo)
}

async function buscarValidador(dv: Dv, email: string): Promise<Registro | null> {
  const achados = await dv.lista(validadorPorEmail(email))
  return achados.length === 1 ? achados[0] : null // duplicado no cadastro: ninguém entra
}

const dominios = (c: Registro) => String(c.cr40f_portaldominios ?? '').toLowerCase().split(/[\s,;]+/).filter(Boolean)

/** Cliente único dono do domínio do e-mail, com portal e algum módulo; dois clientes com o mesmo domínio = nenhum. */
async function clienteDoDominio(dv: Dv, email: string): Promise<Registro | null> {
  const dominio = dominioDe(email)
  if (!dominio) return null
  const donos = (await dv.lista(clientesPorDominio(dominio))).filter((c) => dominios(c).includes(dominio) && mapearModulos(c.cr40f_portalmodulos).length)
  return donos.length === 1 ? donos[0] : null
}

/**
 * Validador cadastrado ou, pelo domínio, cadastro criado agora (ativo, sem senha).
 * E-mail já cadastrado mas barrado (desativado, cliente sem portal ou sem módulo) não ganha cadastro novo.
 */
async function buscarOuCriarUsuario(dv: Dv, email: string): Promise<Registro | null> {
  const existente = await buscarValidador(dv, email)
  if (existente) return existente
  const cliente = await clienteDoDominio(dv, email)
  if (!cliente || (await dv.lista(validadorQualquerPorEmail(email))).length) return null
  return dv.criar(`${SET.validador}?$select=cr40f_validadorclienteid,cr40f_name`, {
    cr40f_name: nomeDoEmail(email).slice(0, 100),
    cr40f_email: email,
    cr40f_ativo: true,
    [`${NAV.cliente}@odata.bind`]: `/${SET.cliente}(${cliente.cr40f_clientes1id})`,
  })
}

/** Ativo, de cliente com portal e com algum módulo (o filtro por e-mail já exige; a leitura por id, não). */
const liberado = (v: Registro) =>
  v.cr40f_ativo === true && (v[NAV.cliente] as Registro | undefined)?.cr40f_portalhabilitado === true && modulosDe(v).length > 0

/** Impressão da senha guardada, que vai na sessão; senha trocada = sessões antigas não valem mais. */
const impressao = async (hash: string) => (await sha256Hex(`sessao:${hash}`)).slice(0, 16)

/** Validador pelo id; apagado (404) = `null`. */
const validadorOuNada = (dv: Dv, vid: string) =>
  dv.get(validadorPorId(vid)).catch((e) => {
    if (e instanceof ErroDataverse && e.status === 404) return null
    throw e
  })

const hashCodigo = (vid: string, codigo: string) => sha256Hex(`${vid}:${codigo}`)

/** Grava o cookie de sessão (30 dias), apaga o da etapa e devolve a sessão pública. */
async function respostaSessao(c: Ctx, v: Registro, senhaHash: string): Promise<Response> {
  const sessao: Sessao = {
    vid: String(v.cr40f_validadorclienteid),
    cid: String(v._cr40f_cliente_value),
    nome: String(v.cr40f_name ?? ''),
    email: String(v.cr40f_email ?? ''),
    cliente: String(v['_cr40f_cliente_value@OData.Community.Display.V1.FormattedValue'] ?? ''),
    modulos: modulosDe(v),
    sv: await impressao(senhaHash),
    exp: c.agora + SESSAO_S * 1000,
  }
  c.waitUntil(c.dv.patch(`${SET.validador}(${sessao.vid})`, { cr40f_ultimoacesso: new Date(c.agora).toISOString() }).catch(() => {}))
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  headers.append('Set-Cookie', setCookie(COOKIE.sessao, await selar(c.env, 'sessao', sessao), SESSAO_S))
  headers.append('Set-Cookie', apagarCookie(COOKIE.etapa))
  return new Response(JSON.stringify(publica(sessao, await marcaDaSessao(c.dv, sessao.cid))), { status: 200, headers })
}

const publica = (s: Sessao, marca: Marca | null) => ({ nome: s.nome, email: s.email, cliente: s.cliente, modulos: s.modulos, ...(marca ? { marca } : {}) })

/** O "Zerar senha" do shell limpa só a data (a coluna do hash tem segurança de coluna e só o Worker a grava). */
function hashVigente(v: Registro): string {
  return v.cr40f_senhahash && v.cr40f_senhadefinidaem ? String(v.cr40f_senhahash) : ''
}

export async function entrarComSenha(req: Request, c: Ctx): Promise<Response> {
  const corpo = await lerJson<{ email?: string; senha?: string }>(req)
  const email = normalizarEmail(corpo?.email)
  const senha = typeof corpo?.senha === 'string' ? corpo.senha : ''
  if (!EMAIL.test(email) || !senha || senha.length > SENHA_MAX) return erro(401, 'senha_invalida')
  if (await bloqueado(c.env, email)) return erro(429, 'bloqueado')
  const v = await buscarValidador(c.dv, email)
  const hash = v ? hashVigente(v) : ''
  // Sem cadastro, sem senha criada ou barrado (cliente sem módulo): mesma resposta e mesmo custo de senha errada.
  if (!v || !hash || !liberado(v)) {
    await conferirSenha(senha, HASH_FALSO)
    return falhar(c.env, email, 'senha_invalida')
  }
  if (!(await conferirSenha(senha, hash))) return falhar(c.env, email, 'senha_invalida')
  await c.env.KV.delete(await chaveFalhas(email))
  return respostaSessao(c, v, hash)
}

export async function solicitarCodigo(req: Request, c: Ctx): Promise<Response> {
  const email = normalizarEmail((await lerJson<{ email?: string }>(req))?.email)
  if (!EMAIL.test(email)) return erro(400, 'nao_permitido')
  const chaveIp = `semacesso:${await sha256Hex(req.headers.get('CF-Connecting-IP') ?? 'local')}`
  const negados = Number((await c.env.KV.get(chaveIp)) ?? 0)
  if (negados >= MAX_SEM_ACESSO_IP) return erro(429, 'bloqueado')
  // Decisão do Renan (24/11/2026): e-mail sem acesso ouve isso na hora, em vez do "enviado" genérico.
  const v = await buscarOuCriarUsuario(c.dv, email)
  if (!v) {
    await c.env.KV.put(chaveIp, String(negados + 1), { expirationTtl: BLOQUEIO_S })
    return erro(403, 'sem_acesso')
  }
  const chaveReenvio = `reenvio:${await sha256Hex(email)}`
  if (await c.env.KV.get(chaveReenvio)) return erro(429, 'aguarde')
  const vid = String(v.cr40f_validadorclienteid)
  const codigo = novoCodigo()
  // Sem waitUntil: se gravar ou enviar falhar, a tela mostra o erro em vez de "enviado".
  await c.dv.post(SET.codigo, {
    cr40f_name: email.slice(0, 100),
    'cr40f_Validador@odata.bind': `/${SET.validador}(${vid})`,
    cr40f_hashcodigo: await hashCodigo(vid, codigo),
    cr40f_expiraem: new Date(c.agora + CODIGO_MS).toISOString(),
    cr40f_tentativas: 0,
    cr40f_usado: false,
  })
  await enviarEmail(c.env, 'codigo', [email], { nome: String(v.cr40f_name || nomeDoEmail(email)), codigo, validadeMinutos: 10 })
  await c.env.KV.put(chaveReenvio, '1', { expirationTtl: REENVIO_S })
  return new Response(null, { status: 204 })
}

/** Código do e-mail certo → cookie da etapa (10 min) para criar a senha. */
export async function confirmarCodigo(req: Request, c: Ctx): Promise<Response> {
  const corpo = await lerJson<{ email?: string; codigo?: string }>(req)
  const email = normalizarEmail(corpo?.email)
  const codigo = String(corpo?.codigo ?? '').trim()
  if (!EMAIL.test(email)) return erro(400, 'codigo_invalido')
  if (await bloqueado(c.env, email)) return erro(429, 'bloqueado')

  const v = await buscarValidador(c.dv, email)
  if (!v || !/^\d{6}$/.test(codigo)) return falhar(c.env, email, 'codigo_invalido')
  const vid = String(v.cr40f_validadorclienteid)
  const filtro = `_cr40f_validador_value eq ${guid(vid)} and cr40f_usado eq false`
  const [ultimo] = await c.dv.lista(`${SET.codigo}?$select=cr40f_codigoacessoid,cr40f_hashcodigo,cr40f_expiraem&$orderby=createdon desc&$top=1&$filter=${encodeURIComponent(filtro)}`)
  if (!ultimo || !iguais(String(ultimo.cr40f_hashcodigo ?? ''), await hashCodigo(vid, codigo))) return falhar(c.env, email, 'codigo_invalido')
  if (Date.parse(String(ultimo.cr40f_expiraem)) <= c.agora) return falhar(c.env, email, 'codigo_expirado')

  await c.dv.patch(`${SET.codigo}(${ultimo.cr40f_codigoacessoid})`, { cr40f_usado: true })
  await c.env.KV.delete(await chaveFalhas(email))
  const etapa: Etapa = { vid, email, exp: c.agora + ETAPA_S * 1000 }
  return json({ etapa: 'criar_senha' }, 200, { 'Set-Cookie': setCookie(COOKIE.etapa, await selar(c.env, 'etapa', etapa), ETAPA_S) })
}

/** Grava a senha nova (1º acesso ou troca) e já abre a sessão; as sessões com a senha antiga caem. */
export async function criarSenha(req: Request, c: Ctx): Promise<Response> {
  const etapa = await abrir<Etapa>(c.env, req, COOKIE.etapa, 'etapa', c.agora)
  if (!etapa) return erro(401, 'nao_permitido')
  const senha = (await lerJson<{ senha?: unknown }>(req))?.senha
  if (typeof senha !== 'string' || senhaFraca(senha) || senha.length > SENHA_MAX)
    return erro(400, 'senha_fraca', `Use de ${SENHA_MIN} a ${SENHA_MAX} caracteres.`)
  const v = await validadorOuNada(c.dv, etapa.vid)
  if (!v || !liberado(v)) return erro(401, 'nao_permitido')
  const hash = await hashSenha(senha)
  await c.dv.patch(`${SET.validador}(${etapa.vid})`, { cr40f_senhahash: hash, cr40f_senhadefinidaem: new Date(c.agora).toISOString() })
  return respostaSessao(c, v, hash)
}

export const sair = () =>
  new Response(null, { status: 204, headers: { 'Set-Cookie': apagarCookie(COOKIE.sessao) } })

/** Sessão do cookie, conferida no cadastro atual; os módulos vêm do cliente agora (tirar um módulo vale na hora). */
export async function sessaoAtual(req: Request, c: Ctx): Promise<Sessao | null> {
  const s = await abrir<Sessao>(c.env, req, COOKIE.sessao, 'sessao', c.agora)
  if (!s?.sv) return null
  const v = await validadorOuNada(c.dv, s.vid)
  // Trocado de cliente: a sessão antiga não lê os dados do cliente novo nem do antigo.
  if (!v || !liberado(v) || String(v._cr40f_cliente_value) !== s.cid) return null
  const hash = hashVigente(v)
  if (!hash || !iguais(await impressao(hash), s.sv)) return null
  return { ...s, modulos: modulosDe(v) }
}

/** `GET /auth/sessao`: o app abre já logado enquanto o cookie valer. */
export async function lerSessao(req: Request, c: Ctx): Promise<Response> {
  const s = await sessaoAtual(req, c)
  return s ? json(publica(s, await marcaDaSessao(c.dv, s.cid))) : erro(401, 'nao_permitido')
}

export type { Ctx }
