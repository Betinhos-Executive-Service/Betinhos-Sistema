import { chunk, cleanId, formatted, type DataverseClient, type Row } from '@betinhos/dataverse'
import { diaLocal, fechamentoDoValor, motivoDoValor, statusDoValor, LADO_VALOR } from '../domain/regras'
import type { Cliente, ItemComposicao, Linha, Mensagem, Validador } from '../domain/types'

// Nomes lógicos das tabelas do portal (packages/deploy/provision-portal-cliente.ps1, sessão "Liberar para o portal").
// Mensagem e validador seguem a spec; confira na metadata do DEV depois do provision.
export const ENTITIES = {
  validacao: 'cr40f_validacaoservico',
  mensagem: 'cr40f_mensagemvalidacao',
  validador: 'cr40f_validadorcliente',
  reserva: 'cr40f_reservadeveculos',
  cliente: 'cr40f_clientes1',
  composicao: 'cr40f_composicaodeprecos',
} as const
export type EntitySets = Record<keyof typeof ENTITIES, string>

const VALIDACAO_SELECT = ['cr40f_validacaoservicoid', 'cr40f_status', 'cr40f_liberadoem', 'cr40f_observacao', 'cr40f_valorliberado', 'cr40f_valoranterior', 'cr40f_prazotacita', 'cr40f_aprovadoem', 'cr40f_aprovadopor', 'cr40f_incluirfechamento', '_cr40f_reserva_value', '_cr40f_cliente_value']
const RESERVA_SELECT = ['cr40f_reservadeveculosid', 'cr40f_id', 'cr40f_dataehorriodesada', 'cr40f_trajeto', 'cr40f_cr', 'cr40f_idtenaris', '_cr40f_cliente_value', '_new_composicaodepreco_value']
const MENSAGEM_SELECT = ['cr40f_mensagemvalidacaoid', '_cr40f_validacao_value', 'cr40f_lado', 'cr40f_autor', 'cr40f_motivo', 'cr40f_texto', 'createdon']
const VALIDADOR_SELECT = ['cr40f_validadorclienteid', 'cr40f_name', 'cr40f_email', '_cr40f_cliente_value', 'cr40f_ativo', 'cr40f_ultimoacesso', 'cr40f_totpcadastradoem']
/** `new_status` da composição de preços: 100000001 Concluído (metadata do DEV, 28/10/2026). */
const COMPOSICAO_CONCLUIDA = 100000001
/** Itens da composição exibidos no detalhe, na ordem; os que vierem vazios ou zerados ficam fora. */
const ITENS_COMPOSICAO: [string, string][] = [
  ['new_horamotorista', 'Hora motorista'], ['new_diaria', 'Diária'], ['new_espera', 'Espera'], ['new_pedagios', 'Pedágios'],
  ['new_estacionamento', 'Estacionamento'], ['new_ajuste', 'Ajuste'],
]
/** "A liberar" olha só os últimos 90 dias (fechamentos ainda abertos). */
const JANELA_A_LIBERAR_DIAS = 90

const idFilter = (attr: string, ids: string[]) => encodeURIComponent(ids.map((id) => `${attr} eq ${cleanId(id)}`).join(' or '))
const num = (v: unknown) => (typeof v === 'number' ? v : null)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const lookupId = (row: Row, attr: string) => (typeof row[`_${attr}_value`] === 'string' ? cleanId(row[`_${attr}_value`] as string) : null)

async function porIds(client: DataverseClient, set: string, idAttr: string, select: string[], ids: string[]): Promise<Row[]> {
  const unicos = [...new Set(ids)]
  const blocos = await Promise.all(chunk(unicos, 20).map((b) => client.getAll(`${set}?$select=${select.join(',')}&$filter=${idFilter(idAttr, b)}`)))
  return blocos.flat()
}

export function mapMensagem(row: Row): Mensagem {
  return {
    id: cleanId(str(row.cr40f_mensagemvalidacaoid)),
    validacaoId: lookupId(row, 'cr40f_validacao') ?? '',
    lado: row.cr40f_lado === LADO_VALOR.betinhos ? 'betinhos' : 'cliente',
    autor: str(row.cr40f_autor),
    motivo: motivoDoValor(row.cr40f_motivo),
    texto: str(row.cr40f_texto),
    criadaEm: str(row.createdon),
  }
}

export function mapValidador(row: Row, clientes: Map<string, Cliente>): Validador {
  const clienteId = lookupId(row, 'cr40f_cliente') ?? ''
  return {
    id: cleanId(str(row.cr40f_validadorclienteid)),
    nome: str(row.cr40f_name),
    email: str(row.cr40f_email),
    cliente: clientes.get(clienteId) ?? { id: clienteId, nome: formatted(row, '_cr40f_cliente_value') },
    ativo: row.cr40f_ativo !== false,
    ultimoAcesso: str(row.cr40f_ultimoacesso) || null,
    totpCadastradoEm: str(row.cr40f_totpcadastradoem) || null,
  }
}

function composicaoDe(row: Row | undefined): ItemComposicao[] {
  if (!row) return []
  return ITENS_COMPOSICAO.flatMap(([attr, item]) => { const v = num(row[attr]); return v ? [{ item, valor: v }] : [] })
}

/** Clientes com "Portal habilitado", validações, reservas, composições e mensagens, montados em linhas. */
export async function loadAll(client: DataverseClient, s: EntitySets) {
  const clientesRows = await client.getAll(`${s.cliente}?$select=cr40f_clientes1id,cr40f_name&$filter=cr40f_portalhabilitado eq true`)
  const clientes: Cliente[] = clientesRows.map((r) => ({ id: cleanId(str(r.cr40f_clientes1id)), nome: str(r.cr40f_name) || 'Cliente' }))
  const porCliente = new Map(clientes.map((c) => [c.id, c]))
  if (!clientes.length) return { linhas: [] as Linha[], clientes, validadores: [] as Validador[] }

  const desde = new Date(Date.now() - JANELA_A_LIBERAR_DIAS * 86_400_000).toISOString()
  const doCliente = encodeURIComponent(clientes.map((c) => `_cr40f_cliente_value eq ${c.id}`).join(' or '))
  const [validacoes, validadoresRows, candidatas] = await Promise.all([
    client.getAll(`${s.validacao}?$select=${VALIDACAO_SELECT.join(',')}&$filter=${doCliente}`),
    client.getAll(`${s.validador}?$select=${VALIDADOR_SELECT.join(',')}&$filter=${doCliente}`),
    // Candidatas a liberar: do cliente, com composição e saída nos últimos 90 dias; as já liberadas saem abaixo.
    client.getAll(`${s.reserva}?$select=${RESERVA_SELECT.join(',')}&$filter=(${doCliente}) and _new_composicaodepreco_value ne null and cr40f_dataehorriodesada ge ${desde}`),
  ])
  const liberadas = new Set(validacoes.map((v) => lookupId(v, 'cr40f_reserva')))
  const reservasExtra = await porIds(client, s.reserva, 'cr40f_reservadeveculosid', RESERVA_SELECT, [...liberadas].filter((id): id is string => !!id && !candidatas.some((c) => cleanId(str(c.cr40f_reservadeveculosid)) === id)))
  const reservas = new Map([...candidatas, ...reservasExtra].map((r) => [cleanId(str(r.cr40f_reservadeveculosid)), r]))
  const composicoesRows = await porIds(client, s.composicao, 'cr40f_composicaodeprecosid', ['cr40f_composicaodeprecosid', 'new_status', 'new_valortotal', ...ITENS_COMPOSICAO.map(([a]) => a)],
    [...reservas.values()].map((r) => lookupId(r, 'new_composicaodepreco')).filter((id): id is string => !!id))
  const composicoes = new Map(composicoesRows.map((r) => [cleanId(str(r.cr40f_composicaodeprecosid)), r]))
  const mensagens = validacoes.length
    ? (await porIds(client, s.mensagem, '_cr40f_validacao_value', MENSAGEM_SELECT, validacoes.map((v) => str(v.cr40f_validacaoservicoid)))).map(mapMensagem)
    : []
  const ultima = new Map<string, Mensagem>()
  for (const m of mensagens) { const atual = ultima.get(m.validacaoId); if (!atual || atual.criadaEm < m.criadaEm) ultima.set(m.validacaoId, m) }

  const base = (r: Row, clienteId: string | null) => {
    const comp = composicoes.get(lookupId(r, 'new_composicaodepreco') ?? '')
    const saida = str(r.cr40f_dataehorriodesada)
    return {
      reservaId: cleanId(str(r.cr40f_reservadeveculosid)),
      codigo: formatted(r, 'cr40f_id'),
      data: saida ? diaLocal(saida) : null,
      trajeto: str(r.cr40f_trajeto),
      cliente: porCliente.get(clienteId ?? '') ?? { id: clienteId ?? '', nome: formatted(r, '_cr40f_cliente_value') },
      cr: str(r.cr40f_cr),
      pedido: str(r.cr40f_idtenaris),
      valorComposicao: num(comp?.new_valortotal),
      composicao: composicaoDe(comp),
      composicaoConcluida: comp?.new_status === COMPOSICAO_CONCLUIDA,
    }
  }

  const linhas: Linha[] = validacoes.flatMap((v) => {
    const r = reservas.get(lookupId(v, 'cr40f_reserva') ?? '')
    const situacao = statusDoValor(v.cr40f_status)
    if (!r || !situacao) return []
    const { composicaoConcluida: _, ...b } = base(r, lookupId(v, 'cr40f_cliente'))
    const id = cleanId(str(v.cr40f_validacaoservicoid))
    return [{
      ...b, id, validacaoId: id, situacao,
      valorLiberado: num(v.cr40f_valorliberado), valorAnterior: num(v.cr40f_valoranterior),
      observacao: str(v.cr40f_observacao), liberadoEm: str(v.cr40f_liberadoem) || null, prazoTacita: str(v.cr40f_prazotacita) || null,
      aprovadoEm: str(v.cr40f_aprovadoem) || null, aprovadoPor: str(v.cr40f_aprovadopor), fechamento: fechamentoDoValor(v.cr40f_incluirfechamento),
      ultimaMensagem: ultima.get(id) ?? null,
    }]
  })
  for (const r of candidatas) {
    const { composicaoConcluida, ...b } = base(r, lookupId(r, 'cr40f_cliente'))
    if (liberadas.has(b.reservaId) || !composicaoConcluida) continue
    linhas.push({
      ...b, id: `reserva:${b.reservaId}`, validacaoId: null, situacao: 'a_liberar', valorLiberado: null, valorAnterior: null,
      observacao: '', liberadoEm: null, prazoTacita: null, aprovadoEm: null, aprovadoPor: '', fechamento: 'pendente', ultimaMensagem: null,
    })
  }
  return { linhas, clientes, validadores: validadoresRows.map((r) => mapValidador(r, porCliente)) }
}

export const mensagensPath = (set: string, validacaoId: string) =>
  `${set}?$select=${MENSAGEM_SELECT.join(',')}&$filter=${encodeURIComponent(`_cr40f_validacao_value eq ${cleanId(validacaoId)}`)}&$orderby=createdon asc`
