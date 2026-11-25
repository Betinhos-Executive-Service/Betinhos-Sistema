// Montagem das consultas OData. Toda consulta de serviço leva o cliente da sessão no $filter:
// o isolamento entre clientes é aqui, não na tela.
import { CLIENTE_CAMPOS, COMPOSICAO_LINHAS, NAV, PEDIDO_CAMPOS, PESSOA_CAMPOS, RESERVA_CAMPOS, SET, STATUS_DV, VALIDACAO_CAMPOS } from './schema'

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const ehGuid = (valor: string) => GUID.test(valor)

export function guid(valor: string): string {
  if (!ehGuid(valor)) throw new Error('id inválido')
  return valor.toLowerCase()
}

export const texto = (v: string) => `'${v.replace(/'/g, "''")}'`

const VISIVEIS = [STATUS_DV.liberado, STATUS_DV.em_duvida, STATUS_DV.respondido, STATUS_DV.aprovado, STATUS_DV.aprovado_tacito]

const expandReserva =
  `${NAV.reserva}($select=${RESERVA_CAMPOS.join(',')};` +
  `$expand=${NAV.composicao}($select=new_valortotal,${COMPOSICAO_LINHAS.map(([c]) => c).join(',')}),` +
  `${NAV.passageiros}($select=_cr40f_bancodedados_value,cr40f_ordemdeselecao))`

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

const VALIDADOR_SELECT = 'cr40f_validadorclienteid,cr40f_name,cr40f_email,cr40f_senhahash,cr40f_senhadefinidaem,_cr40f_cliente_value,cr40f_ativo'
/** Os módulos do cliente vão na sessão: cliente sem módulo não entra. */
const expandCliente = `$expand=${NAV.cliente}($select=cr40f_portalmodulos,cr40f_portalhabilitado)`

/** Usuário ativo de um cliente com portal e módulos; `$top=2` para recusar e-mail duplicado. */
export const validadorPorEmail = (email: string) =>
  `${SET.validador}?$select=${VALIDADOR_SELECT}&${expandCliente}&$top=2` +
  `&$filter=${encodeURIComponent(`cr40f_email eq ${texto(email)} and cr40f_ativo eq true and ${NAV.cliente}/cr40f_portalhabilitado eq true and ${NAV.cliente}/cr40f_portalmodulos ne null`)}`

export const validadorPorId = (id: string) => `${SET.validador}(${guid(id)})?$select=${VALIDADOR_SELECT}&${expandCliente}`

/** Qualquer cadastro com o e-mail (inativo ou de cliente sem portal): quem foi desativado não volta pelo domínio. */
export const validadorQualquerPorEmail = (email: string) =>
  `${SET.validador}?$select=cr40f_validadorclienteid&$top=1&$filter=${encodeURIComponent(`cr40f_email eq ${texto(email)}`)}`

/** Validadores ativos de clientes com portal, com os módulos do cliente (o resumo diário é só de quem valida). */
export const validadoresAtivos = () =>
  `${SET.validador}?$select=cr40f_name,cr40f_email,_cr40f_cliente_value&${expandCliente}&$filter=${encodeURIComponent(`cr40f_ativo eq true and ${NAV.cliente}/cr40f_portalhabilitado eq true`)}`

/** Clientes com portal cujo campo de domínios contém o domínio; a igualdade exata é conferida no código. */
export const clientesPorDominio = (dominio: string) =>
  `${SET.cliente}?$select=${CLIENTE_CAMPOS.join(',')}&$filter=${encodeURIComponent(`cr40f_portalhabilitado eq true and contains(cr40f_portaldominios,${texto(dominio)})`)}`

/** Passageiros do pedido: vínculo (ordem) mais a pessoa com o contato. Lido pelo vínculo, nunca por `cr40f_passageirosetelefonedecontato`. */
const expandPassageiros = `${NAV.passageiros}($select=_cr40f_bancodedados_value,cr40f_ordemdeselecao;$expand=${NAV.vinculoPessoa}($select=${PESSOA_CAMPOS.join(',')}))`

/** Reservas pedidas pelo portal por este usuário (e do cliente da sessão, por garantia). */
export const pedidosDe = (validadorId: string, clienteId: string) =>
  `${SET.reserva}?$select=${PEDIDO_CAMPOS.join(',')}&$expand=${expandPassageiros}&$filter=${encodeURIComponent(`_cr40f_portalusuario_value eq ${guid(validadorId)} and ${doCliente(clienteId)}`)}&$orderby=cr40f_dataehorriodesada desc`

/** Um pedido do usuário (e do cliente da sessão), com a observação interna para o cancelamento acrescentar a nota. */
export const pedidoDe = (id: string, validadorId: string, clienteId: string) =>
  `${SET.reserva}?$select=${[...PEDIDO_CAMPOS, 'cr40f_observaointerna'].join(',')}&$expand=${expandPassageiros}&$filter=${encodeURIComponent(`_cr40f_portalusuario_value eq ${guid(validadorId)} and ${doCliente(clienteId)} and cr40f_reservadeveculosid eq ${guid(id)}`)}`

/** Pessoas ativas do cliente da sessão, por nome (busca do Pedir): 20 no máximo, em ordem alfabética. */
export const pessoasDoCliente = (clienteId: string, busca: string) =>
  `${SET.pessoa}?$select=${PESSOA_CAMPOS.join(',')}&$top=20&$orderby=cr40f_nomedopassageiro asc` +
  `&$filter=${encodeURIComponent(`${doCliente(clienteId)} and statecode eq 0${busca ? ` and contains(cr40f_nomedopassageiro,${texto(busca)})` : ''}`)}`

/** Uma pessoa por id, só se for do cliente da sessão (de outro cliente → lista vazia). */
export const pessoaDoCliente = (id: string, clienteId: string) =>
  `${SET.pessoa}?$select=${PESSOA_CAMPOS.join(',')}&$filter=${encodeURIComponent(`${doCliente(clienteId)} and statecode eq 0 and cr40f_bancodedadosid eq ${guid(id)}`)}`

/** Pessoas do cliente com este nome (o Dataverse compara sem diferenciar caixa); a igualdade fina é conferida no código. */
export const pessoasComNome = (clienteId: string, nome: string) =>
  `${SET.pessoa}?$select=${PESSOA_CAMPOS.join(',')}&$top=20&$filter=${encodeURIComponent(`${doCliente(clienteId)} and statecode eq 0 and cr40f_nomedopassageiro eq ${texto(nome)}`)}`

/** POST da pessoa: o `$select` define o que volta no `return=representation`. */
export const criarPessoa = () => `${SET.pessoa}?$select=${PESSOA_CAMPOS.join(',')}`

/** Caminho do POST da reserva: o `$select` define o que volta no `return=representation`. */
export const criarPedido = () => `${SET.reserva}?$select=${PEDIDO_CAMPOS.join(',')}`
