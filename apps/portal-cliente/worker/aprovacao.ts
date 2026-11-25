// Aprovação de pedidos (cliente com `cr40f_portalexigeaprovacao`): o pedido nasce Pendente e inativo (fora das telas da operação)
// até um aprovador do cliente decidir. Aprovado reativa a reserva; recusado a cancela com o motivo e a mantém inativa.
import { dataHora } from '../src/domain/formato'
import { MOTIVO_RECUSA_MAX, MOTIVO_RECUSA_MIN } from '../src/domain/pedidos'
import type { DecisaoAprovacao, PedidoParaAprovar } from '../src/domain/types'
import type { Ctx } from './auth'
import type { Dv } from './dataverse'
import { enviarEmail, ErroDataverse } from './dataverse'
import type { Env } from './env'
import { erro, json, lerJson, type Sessao } from './http'
import { mapearPedido, str, type Registro } from './mapear'
import { aprovadoresDoCliente, clienteExigeAprovacao, ehGuid, guid, pedidoParaDecidir, pendentesDeAprovacao, usuarioAprovador } from './odata'
import { APROVACAO, RESERVA_CANCELADO, RESERVA_SOLICITADO, SET } from './schema'

export const ESTADO = { ativo: { statecode: 0, statuscode: 1 }, inativo: { statecode: 1, statuscode: 2 } } as const

/**
 * Altera uma reserva que está inativa (pedido pendente). O Dataverse não aceita gravar coluna em registro inativo, então reativa primeiro;
 * `voltarInativa` a inativa de novo (recusa e cancelamento: a operação não precisa ver o que nunca chegou a ela).
 */
export async function alterarPendente(dv: Dv, alvo: string, corpo: Registro, voltarInativa: boolean): Promise<void> {
  await dv.patch(alvo, ESTADO.ativo)
  try {
    await dv.patch(alvo, corpo)
  } catch (e) {
    // Reativada e sem a decisão gravada, a reserva ainda pendente apareceria para a operação: volta a inativar antes de falhar.
    await dv.patch(alvo, ESTADO.inativo).catch((x) => console.error('aprovação: não voltou a inativar', String(x)))
    throw e
  }
  if (voltarInativa) await dv.patch(alvo, ESTADO.inativo)
}

/** Coluna ainda não criada (Worker antes da migration) vale o padrão; qualquer outra falha sobe, para o pedido não entrar sem aprovação por um erro passageiro. */
async function tolerante<T>(rodar: () => Promise<T>, padrao: T): Promise<T> {
  try {
    return await rodar()
  } catch (e) {
    if (!(e instanceof ErroDataverse && e.status === 400)) throw e
    console.error('aprovação: coluna ausente', e.message)
    return padrao
  }
}

export const clienteExige = (dv: Dv, cid: string) => tolerante(async () => (await dv.get(clienteExigeAprovacao(cid))).cr40f_portalexigeaprovacao === true, false)
/** Falha fecha o acesso: na dúvida, não é aprovador. */
export const usuarioEhAprovador = (dv: Dv, vid: string) => tolerante(async () => (await dv.get(usuarioAprovador(vid))).cr40f_aprovador === true, false).catch(() => false)

export type Aprovador = { id: string; nome: string; email: string }
export const aprovadoresAtivos = (dv: Dv, cid: string): Promise<Aprovador[]> =>
  tolerante(async () => (await dv.lista(aprovadoresDoCliente(cid))).map((v) => ({ id: str(v, 'cr40f_validadorclienteid').toLowerCase(), nome: str(v, 'cr40f_name'), email: str(v, 'cr40f_email') })).filter((a) => a.email), [])

/** O pedido precisa de aprovação? Só se o cliente exige e há ao menos um aprovador que não seja o próprio solicitante; senão entra direto. */
export async function aprovadoresDoPedido(dv: Dv, cid: string, solicitanteId: string): Promise<Aprovador[]> {
  if (!(await clienteExige(dv, cid))) return []
  return (await aprovadoresAtivos(dv, cid)).filter((a) => a.id !== solicitanteId.toLowerCase())
}

export const solicitanteDe = (r: Registro) => (r.cr40f_PortalUsuario ?? undefined) as Registro | undefined

export function paraAprovar(r: Registro): PedidoParaAprovar {
  const p = mapearPedido(r, '')
  const s = solicitanteDe(r)
  return { id: p.id, numero: p.numero, saida: p.saida, origem: p.origem, destino: p.destino, passageiros: p.passageiros, criadoEm: p.criadoEm, solicitante: str(s, 'cr40f_name') || str(s, 'cr40f_email'), ...(p.observacao ? { observacao: p.observacao } : {}), ...(p.tipoVeiculo !== undefined ? { tipoVeiculo: p.tipoVeiculo } : {}) }
}

/** Campos de data e trajeto que os e-mails de pedido repetem. */
export const quandoETrajeto = (p: Pick<PedidoParaAprovar, 'saida' | 'origem' | 'destino'>) => ({ data: p.saida ? dataHora(p.saida) : '', trajeto: `${p.origem} → ${p.destino}` })

/** Acrescenta a nota de auditoria à observação interna da reserva. */
export const anexarNota = (antes: string, nota: string) => (antes ? `${antes}\n${nota}` : nota)

/** Dados do e-mail de aprovação pendente e lembrete (um por aprovador). */
const dadosPendente = (env: Env, r: Registro, aprovador: Aprovador) => {
  const p = paraAprovar(r)
  return { nome: aprovador.nome || aprovador.email.split('@')[0], solicitante: p.solicitante, numero: p.numero, ...quandoETrajeto(p), passageiros: p.passageiros.join(', '), linkPortal: env.PORTAL_URL }
}

/** Avisa cada aprovador; a falha de um não impede os demais nem o pedido. */
export async function avisarAprovadores(env: Env, tipo: 'aprovacao_pendente' | 'aprovacao_lembrete', r: Registro, aprovadores: Aprovador[]): Promise<number> {
  let enviados = 0
  for (const a of aprovadores) {
    try {
      await enviarEmail(env, tipo, [a.email], dadosPendente(env, r, a))
      enviados++
    } catch (e) {
      console.error(`aprovação: ${tipo}`, String(e))
    }
  }
  return enviados
}

/** Pendentes do cliente que o aprovador pode decidir: os dele não aparecem. */
export async function listarAprovacoes(c: Ctx, sessao: Sessao): Promise<Response> {
  if (!(await usuarioEhAprovador(c.dv, sessao.vid))) return erro(403, 'nao_permitido')
  const linhas = await c.dv.lista(pendentesDeAprovacao(sessao.cid))
  return json(linhas.filter((r) => str(r, '_cr40f_portalusuario_value').toLowerCase() !== sessao.vid.toLowerCase()).map(paraAprovar))
}

export const dataHoraSp = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

export async function decidirAprovacao(req: Request, c: Ctx, sessao: Sessao, id: string): Promise<Response> {
  if (!(await usuarioEhAprovador(c.dv, sessao.vid))) return erro(403, 'nao_permitido')
  const corpo = await lerJson<Partial<Record<keyof DecisaoAprovacao, unknown>>>(req)
  const decisao = corpo?.decisao
  if (decisao !== 'aprovar' && decisao !== 'recusar') return erro(400, 'nao_permitido', 'Decisão inválida.')
  const motivo = typeof corpo?.motivo === 'string' ? corpo.motivo.trim().slice(0, MOTIVO_RECUSA_MAX) : ''
  if (decisao === 'recusar' && motivo.length < MOTIVO_RECUSA_MIN) return erro(400, 'nao_permitido', `Informe o motivo da recusa (mínimo ${MOTIVO_RECUSA_MIN} caracteres).`)

  // Pedido de outro cliente não existe para este aprovador (a consulta já leva o cliente da sessão).
  if (!ehGuid(id)) return erro(404, 'nao_permitido', 'Pedido não encontrado.')
  const [reg] = await c.dv.lista(pedidoParaDecidir(id, sessao.cid))
  if (!reg) return erro(403, 'nao_permitido')
  if (str(reg, '_cr40f_portalusuario_value').toLowerCase() === sessao.vid.toLowerCase()) return erro(403, 'nao_permitido', 'Você não pode aprovar o seu próprio pedido.')
  if (reg.cr40f_portalaprovacao !== APROVACAO.pendente || reg.cr40f_status !== RESERVA_SOLICITADO) return erro(409, 'nao_permitido', 'Este pedido já foi decidido ou cancelado.')

  const quem = `${sessao.nome} (${sessao.email})`
  const quando = new Date(c.agora).toISOString()
  const nota = `${decisao === 'aprovar' ? 'Aprovado' : 'Recusado'} pelo cliente no portal por ${quem} em ${dataHoraSp.format(c.agora)}${decisao === 'recusar' ? `: ${motivo}` : ''}`
  const base = { cr40f_portalaprovadopor: quem, cr40f_portalaprovadoem: quando, cr40f_observaointerna: anexarNota(str(reg, 'cr40f_observaointerna'), nota) }
  const corpoDecisao = decisao === 'aprovar' ? { ...base, cr40f_portalaprovacao: APROVACAO.aprovado } : { ...base, cr40f_portalaprovacao: APROVACAO.recusado, cr40f_status: RESERVA_CANCELADO, cr40f_portalmotivorecusa: motivo }
  await alterarPendente(c.dv, `${SET.reserva}(${guid(id)})`, corpoDecisao, decisao === 'recusar')

  const solicitante = solicitanteDe(reg)
  const email = str(solicitante, 'cr40f_email')
  if (email) {
    const p = paraAprovar(reg)
    c.waitUntil(
      enviarEmail(c.env, 'aprovacao_resultado', [email], {
        nome: str(solicitante, 'cr40f_name') || email.split('@')[0], resultado: decisao === 'aprovar' ? 'aprovado' : 'recusado', aprovador: sessao.nome,
        numero: p.numero, ...quandoETrajeto(p), motivo, linkPortal: c.env.PORTAL_URL,
      }).catch((e) => console.error('aprovação: resultado', String(e))),
    )
  }
  return json({ id, decisao: decisao === 'aprovar' ? 'aprovado' : 'recusado' })
}
