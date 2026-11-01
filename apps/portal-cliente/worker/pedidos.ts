// Módulos Pedir e Meus serviços: o pedido vira uma Reserva de Veículos em Solicitado, ligada ao usuário do portal;
// a operação precifica e programa no shell e o solicitante acompanha o status aqui.
import { chaveDuplicado, JANELA_DUPLICADO_MS, normalizarPedido, primeiroErroPedido } from '../src/domain/pedidos'
import type { NovoPedido } from '../src/domain/types'
import type { Ctx } from './auth'
import { sha256Hex } from './cripto'
import { erro, json, lerJson, type Sessao } from './http'
import { mapearPedido, type PedidoPortal } from './mapear'
import { criarPedido as caminhoCriar, pedidosDe } from './odata'
import { NAV, RESERVA_SOLICITADO, SET } from './schema'

const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const textoOu = (v: unknown) => (typeof v === 'string' ? v : '')

export async function criarPedido(req: Request, c: Ctx, sessao: Sessao): Promise<Response> {
  const corpo = await lerJson<Partial<Record<keyof NovoPedido, unknown>>>(req)
  const pedido = normalizarPedido({
    passageiros: lista(corpo?.passageiros), origem: textoOu(corpo?.origem), destino: textoOu(corpo?.destino), saida: textoOu(corpo?.saida), observacao: textoOu(corpo?.observacao),
  })
  const primeiroErro = primeiroErroPedido(pedido, c.agora)
  if (primeiroErro) return erro(400, 'nao_permitido', primeiroErro)

  // Clique duplo ou reenvio: mesmo pedido do mesmo usuário em 1 minuto não cria outra reserva.
  const chave = `pedido:${await sha256Hex(`${sessao.vid}|${chaveDuplicado(sessao.email, pedido)}`)}`
  if (await c.env.KV.get(chave)) return erro(409, 'duplicado', 'Este pedido acabou de ser enviado.')

  const portal: PedidoPortal = { passageiros: pedido.passageiros, ...(pedido.observacao ? { observacao: pedido.observacao } : {}) }
  const criado = await c.dv.criar(caminhoCriar(), {
    cr40f_status: RESERVA_SOLICITADO,
    cr40f_dataehorriodesada: new Date(Date.parse(pedido.saida)).toISOString(),
    cr40f_endereodesada: pedido.origem,
    cr40f_destino: pedido.destino,
    cr40f_portalpedido: JSON.stringify(portal),
    // Cortesia para a operação (só escrita): os plugins e o shell são donos destas colunas depois.
    cr40f_passageirosetelefonedecontato: pedido.passageiros.join('; '),
    cr40f_observaointerna: `Pedido pelo portal por ${sessao.nome} (${sessao.email})${pedido.observacao ? `: ${pedido.observacao}` : ''}`,
    [`${NAV.cliente}@odata.bind`]: `/${SET.cliente}(${sessao.cid})`,
    [`${NAV.portalUsuario}@odata.bind`]: `/${SET.validador}(${sessao.vid})`,
  })
  // Marca só depois de criar: uma falha no Dataverse não bloqueia a nova tentativa por 1 minuto.
  c.waitUntil(c.env.KV.put(chave, '1', { expirationTtl: JANELA_DUPLICADO_MS / 1000 }))
  return json(mapearPedido(criado), 201)
}

export async function listarPedidos(c: Ctx, sessao: Sessao): Promise<Response> {
  return json((await c.dv.lista(pedidosDe(sessao.vid, sessao.cid))).map(mapearPedido))
}
