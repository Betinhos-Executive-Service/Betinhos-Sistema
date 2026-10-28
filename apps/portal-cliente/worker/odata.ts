// Montagem das consultas OData. Toda consulta de serviço leva o cliente da sessão no $filter:
// o isolamento entre clientes é aqui, não na tela.
import { COMPOSICAO_LINHAS, NAV, RESERVA_CAMPOS, SET, STATUS_DV, VALIDACAO_CAMPOS } from './schema'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function guid(valor: string): string {
  if (!GUID.test(valor)) throw new Error('id inválido')
  return valor.toLowerCase()
}

export const texto = (v: string) => `'${v.replace(/'/g, "''")}'`

const VISIVEIS = [STATUS_DV.liberado, STATUS_DV.em_duvida, STATUS_DV.respondido, STATUS_DV.aprovado, STATUS_DV.aprovado_tacito]

const expandReserva =
  `${NAV.reserva}($select=${RESERVA_CAMPOS.join(',')};` +
  `$expand=${NAV.composicao}($select=new_valortotal,${COMPOSICAO_LINHAS.map(([c]) => c).join(',')}))`

const consulta = (filtro: string) =>
  `${SET.validacao}?$select=${VALIDACAO_CAMPOS.join(',')}&$expand=${expandReserva}&$filter=${encodeURIComponent(filtro)}`

const doCliente = (clienteId: string) => `_cr40f_cliente_value eq ${guid(clienteId)}`
const visivel = `Microsoft.Dynamics.CRM.In(PropertyName='cr40f_status',PropertyValues=[${VISIVEIS.map((v) => `'${v}'`).join(',')}])`

/** Serviços do portal: do cliente da sessão e não retirados. */
export const listarServicos = (clienteId: string) => `${consulta(`${doCliente(clienteId)} and ${visivel}`)}&$orderby=cr40f_liberadoem desc`

/** Um serviço por id, só se for do cliente da sessão (id de outro cliente → lista vazia → 404). */
export const servicosPorIds = (ids: string[], clienteId: string) =>
  consulta(`${doCliente(clienteId)} and ${visivel} and Microsoft.Dynamics.CRM.In(PropertyName='cr40f_validacaoservicoid',PropertyValues=[${ids.map((id) => `'${guid(id)}'`).join(',')}])`)

export const mensagensDe = (validacaoIds: string[]) =>
  `${SET.mensagem}?$select=cr40f_mensagemvalidacaoid,cr40f_lado,cr40f_autor,cr40f_texto,cr40f_motivo,createdon,_cr40f_validacao_value` +
  `&$filter=${encodeURIComponent(`Microsoft.Dynamics.CRM.In(PropertyName='cr40f_validacao',PropertyValues=[${validacaoIds.map((id) => `'${guid(id)}'`).join(',')}])`)}` +
  `&$orderby=createdon asc`

/** Liberado ou Respondido com o último dia do prazo antes de hoje (o cron roda depois da meia-noite em São Paulo). */
export const tacitaVencida = (hoje: string) =>
  `${SET.validacao}?$select=cr40f_validacaoservicoid&$filter=${encodeURIComponent(
    `(cr40f_status eq ${STATUS_DV.liberado} or cr40f_status eq ${STATUS_DV.respondido}) and cr40f_prazotacita lt ${hoje}`,
  )}`

/** Resumo diário: liberados desde `desdeIso` ou com prazo vencendo hoje, ainda aguardando o cliente. */
export const resumoDoCliente = (clienteId: string, desdeIso: string, hoje: string) =>
  consulta(
    `${doCliente(clienteId)} and (cr40f_status eq ${STATUS_DV.liberado} or cr40f_status eq ${STATUS_DV.respondido}) and ` +
      `(cr40f_liberadoem ge ${desdeIso} or cr40f_prazotacita eq ${hoje})`,
  )

/** Validador ativo de um cliente com o portal habilitado; `$top=2` para recusar e-mail duplicado. */
export const validadorPorEmail = (email: string) =>
  `${SET.validador}?$select=cr40f_validadorclienteid,cr40f_name,cr40f_email,cr40f_segredototp,_cr40f_cliente_value&$top=2` +
  `&$filter=${encodeURIComponent(`cr40f_email eq ${texto(email)} and cr40f_ativo eq true and ${NAV.cliente}/cr40f_portalhabilitado eq true`)}`

export const validadorPorId = (id: string) =>
  `${SET.validador}(${guid(id)})?$select=cr40f_validadorclienteid,cr40f_name,cr40f_email,cr40f_segredototp,_cr40f_cliente_value,cr40f_ativo`
