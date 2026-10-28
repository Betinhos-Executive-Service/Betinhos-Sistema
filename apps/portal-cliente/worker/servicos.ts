// Rotas de serviço. Toda leitura e toda escrita passam por `carregar`, que filtra pelo cliente da sessão:
// id de outro cliente não volta do Dataverse e a rota responde 404.
import type { Motivo, Servico } from '../src/domain/types'
import type { Ctx } from './auth'
import type { Sessao } from './http'
import { erro, json, lerJson } from './http'
import { mapearMensagem, mapearServico } from './mapear'
import { guid, listarServicos, mensagensDe, servicosPorIds } from './odata'
import { LADO_DV, MOTIVO_DV, SET, STATUS_DV } from './schema'

const LOTE = 50 // ids por consulta (limite de URL do OData)
const MAX_APROVAR = 500
const MAX_TEXTO = 2000

const lotes = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / LOTE) }, (_, i) => xs.slice(i * LOTE, (i + 1) * LOTE))

async function comMensagens(c: Ctx, registros: Record<string, unknown>[]): Promise<Servico[]> {
  const ids = registros.map((r) => String(r.cr40f_validacaoservicoid))
  const msgs = (await Promise.all(lotes(ids).map((l) => c.dv.lista(mensagensDe(l))))).flat()
  const porValidacao = Map.groupBy(msgs, (m) => String(m._cr40f_validacao_value))
  return registros.flatMap((r) => {
    const s = mapearServico(r, (porValidacao.get(String(r.cr40f_validacaoservicoid)) ?? []).map(mapearMensagem))
    return s ? [s] : []
  })
}

async function carregar(c: Ctx, sessao: Sessao, ids: string[]): Promise<Servico[]> {
  const registros = (await Promise.all(lotes(ids).map((l) => c.dv.lista(servicosPorIds(l, sessao.cid))))).flat()
  return comMensagens(c, registros)
}

const ehGuid = (id: unknown): id is string => typeof id === 'string' && (() => { try { guid(id); return true } catch { return false } })()

export async function listar(c: Ctx, sessao: Sessao): Promise<Response> {
  return json(await comMensagens(c, await c.dv.lista(listarServicos(sessao.cid))))
}

export async function aprovar(req: Request, c: Ctx, sessao: Sessao): Promise<Response> {
  const ids = (await lerJson<{ ids?: unknown }>(req))?.ids
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_APROVAR || !ids.every(ehGuid)) return erro(400, 'nao_permitido', 'Lista de serviços inválida.')
  const aprovaveis = (await carregar(c, sessao, [...new Set(ids)])).filter((s) => ['liberado', 'em_duvida', 'respondido'].includes(s.status))
  const quando = new Date(c.agora).toISOString()
  await Promise.all(aprovaveis.map((s) =>
    c.dv.patch(`${SET.validacao}(${s.id})`, { cr40f_status: STATUS_DV.aprovado, cr40f_aprovadoem: quando, cr40f_aprovadopor: sessao.email }),
  ))
  return json(aprovaveis.length ? await carregar(c, sessao, aprovaveis.map((s) => s.id)) : [])
}

async function registrarMensagem(c: Ctx, sessao: Sessao, id: string, texto: string, motivo?: Motivo) {
  await c.dv.post(SET.mensagem, {
    cr40f_name: texto.slice(0, 100),
    'cr40f_Validacao@odata.bind': `/${SET.validacao}(${id})`,
    cr40f_lado: LADO_DV.cliente,
    cr40f_autor: sessao.nome || sessao.email,
    cr40f_texto: texto,
    ...(motivo ? { cr40f_motivo: MOTIVO_DV[motivo] } : {}),
  })
}

/** Lê o serviço (404 se não for do cliente), valida o texto e aplica a mudança; devolve o serviço atualizado. */
async function conversa(req: Request, c: Ctx, sessao: Sessao, id: string, permitidos: string[], comMotivo: boolean): Promise<Response> {
  if (!ehGuid(id)) return erro(404, 'nao_permitido')
  const corpo = await lerJson<{ texto?: unknown; motivo?: unknown }>(req)
  const texto = typeof corpo?.texto === 'string' ? corpo.texto.trim() : ''
  const motivo = corpo?.motivo as Motivo
  if (!texto || texto.length > MAX_TEXTO) return erro(400, 'nao_permitido', 'Escreva a mensagem (até 2000 caracteres).')
  if (comMotivo && !(motivo in MOTIVO_DV)) return erro(400, 'nao_permitido', 'Escolha o motivo da dúvida.')
  const [atual] = await carregar(c, sessao, [id])
  if (!atual) return erro(404, 'nao_permitido')
  if (!permitidos.includes(atual.status)) return erro(409, 'nao_permitido', 'O serviço não aceita mensagem neste status.')
  await registrarMensagem(c, sessao, id, texto, comMotivo ? motivo : undefined)
  if (atual.status !== 'em_duvida') await c.dv.patch(`${SET.validacao}(${id})`, { cr40f_status: STATUS_DV.em_duvida })
  const [novo] = await carregar(c, sessao, [id])
  return json(novo)
}

export const abrirDuvida = (req: Request, c: Ctx, s: Sessao, id: string) => conversa(req, c, s, id, ['liberado', 'respondido'], true)
export const responder = (req: Request, c: Ctx, s: Sessao, id: string) => conversa(req, c, s, id, ['em_duvida', 'respondido'], false)
