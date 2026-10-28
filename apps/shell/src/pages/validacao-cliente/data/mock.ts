import { prazoTacita } from '../domain/regras'
import type { Cliente, ItemComposicao, Linha, Mensagem, Situacao, Validador } from '../domain/types'

// Dados fictícios para o pnpm dev: dois clientes com portal e todas as situações.

export const TENARIS: Cliente = { id: 'c1000000-0000-4000-8000-000000000001', nome: 'Tenaris' }
export const TERNIUM: Cliente = { id: 'c1000000-0000-4000-8000-000000000002', nome: 'Ternium' }
export const MOCK_CLIENTES = [TENARIS, TERNIUM]

const composicao = (hora: number, espera = 0, pedagio = 0, estacionamento = 0): ItemComposicao[] =>
  [
    { item: 'Hora motorista', valor: hora },
    { item: 'Espera', valor: espera },
    { item: 'Pedágios', valor: pedagio },
    { item: 'Estacionamento', valor: estacionamento },
  ].filter((i) => i.valor)
const soma = (c: ItemComposicao[]) => c.reduce((s, i) => s + i.valor, 0)

type Semente = { n: number; cliente: Cliente; data: string; trajeto: string; cr: string; situacao: Situacao; c: ItemComposicao[]; anterior?: number; liberadoEm?: string; fechamento?: Linha['fechamento']; obs?: string }

const SEMENTES: Semente[] = [
  { n: 1, cliente: TENARIS, data: '2026-10-27', trajeto: 'GRU Aeroporto → Tenaris Pindamonhangaba', cr: 'CR-4410', situacao: 'a_liberar', c: composicao(620, 0, 48.4) },
  { n: 2, cliente: TENARIS, data: '2026-10-26', trajeto: 'Hotel Hilton Morumbi → Congonhas', cr: 'CR-4410', situacao: 'a_liberar', c: composicao(280) },
  { n: 3, cliente: TENARIS, data: '2026-10-24', trajeto: 'Tenaris Pindamonhangaba → GRU Aeroporto', cr: 'CR-5120', situacao: 'liberado', c: composicao(620, 90, 48.4), liberadoEm: '2026-10-27T13:10:00Z', obs: 'Espera de 1 h no embarque, conforme voucher.' },
  { n: 4, cliente: TENARIS, data: '2026-10-22', trajeto: 'Av. Paulista, 1000 → Tenaris Pindamonhangaba', cr: 'CR-4410', situacao: 'em_duvida', c: composicao(620, 180, 48.4, 35), liberadoEm: '2026-10-23T12:00:00Z' },
  { n: 5, cliente: TENARIS, data: '2026-10-20', trajeto: 'Congonhas → Hotel Unique', cr: 'CR-5120', situacao: 'respondido', c: composicao(280, 60), liberadoEm: '2026-10-21T15:00:00Z' },
  { n: 6, cliente: TENARIS, data: '2026-10-15', trajeto: 'GRU Aeroporto → Hotel Hilton Morumbi', cr: 'CR-4410', situacao: 'aprovado', c: composicao(340, 0, 12.2), liberadoEm: '2026-10-16T12:00:00Z' },
  { n: 7, cliente: TENARIS, data: '2026-10-09', trajeto: 'Tenaris Pindamonhangaba → Viracopos', cr: 'CR-6230', situacao: 'aprovado_tacito', c: composicao(780, 0, 63.1), liberadoEm: '2026-10-10T12:00:00Z' },
  { n: 8, cliente: TENARIS, data: '2026-10-08', trajeto: 'Hotel Unique → GRU Aeroporto', cr: 'CR-5120', situacao: 'aprovado', c: composicao(340), liberadoEm: '2026-10-09T12:00:00Z', fechamento: 'nao' },
  { n: 9, cliente: TENARIS, data: '2026-10-06', trajeto: 'Av. Faria Lima, 3500 → Congonhas', cr: 'CR-4410', situacao: 'retirado', c: composicao(260), liberadoEm: '2026-10-07T12:00:00Z' },
  { n: 10, cliente: TENARIS, data: '2026-10-03', trajeto: 'Viracopos → Tenaris Pindamonhangaba', cr: 'CR-6230', situacao: 'liberado', c: composicao(860, 0, 63.1), anterior: 780, liberadoEm: '2026-10-27T18:00:00Z', obs: 'Valor corrigido: faltava a hora extra.' },
  { n: 11, cliente: TENARIS, data: '2026-09-29', trajeto: 'GRU Aeroporto → Hotel Unique', cr: 'CR-4410', situacao: 'aprovado', c: composicao(340), liberadoEm: '2026-09-30T12:00:00Z', fechamento: 'sim' },
  { n: 12, cliente: TERNIUM, data: '2026-10-25', trajeto: 'Galeão → Ternium Santa Cruz', cr: 'CC-210', situacao: 'liberado', c: composicao(540, 0, 22), liberadoEm: '2026-10-27T11:00:00Z' },
  { n: 13, cliente: TERNIUM, data: '2026-10-19', trajeto: 'Ternium Santa Cruz → Santos Dumont', cr: 'CC-210', situacao: 'em_duvida', c: composicao(520, 120), liberadoEm: '2026-10-20T11:00:00Z' },
  { n: 14, cliente: TERNIUM, data: '2026-10-12', trajeto: 'Santos Dumont → Hotel Fairmont', cr: 'CC-330', situacao: 'aprovado', c: composicao(240), liberadoEm: '2026-10-13T11:00:00Z' },
  { n: 15, cliente: TERNIUM, data: '2026-10-27', trajeto: 'Hotel Fairmont → Galeão', cr: 'CC-330', situacao: 'a_liberar', c: composicao(300) },
]

const id = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`
export const validacaoId = (n: number) => id('a1000000', n)

const MENSAGENS: Omit<Mensagem, 'id'>[] = [
  { validacaoId: validacaoId(4), lado: 'cliente', autor: 'Carla Menezes', motivo: 'espera', texto: 'A espera de 3 h não consta no nosso registro de portaria. Podem confirmar o horário de chegada?', criadaEm: '2026-10-24T14:20:00Z' },
  { validacaoId: validacaoId(5), lado: 'cliente', autor: 'Carla Menezes', motivo: 'valor', texto: 'O valor está acima do contrato para este trecho.', criadaEm: '2026-10-22T10:05:00Z' },
  { validacaoId: validacaoId(5), lado: 'betinhos', autor: 'Juliana (Financeiro)', motivo: null, texto: 'O trecho teve 1 h de espera no desembarque; o voucher assinado está anexado.', criadaEm: '2026-10-22T17:30:00Z' },
  { validacaoId: validacaoId(9), lado: 'cliente', autor: 'Roberto Lima', motivo: 'passageiro', texto: 'Este passageiro não é da Tenaris.', criadaEm: '2026-10-08T09:00:00Z' },
  { validacaoId: validacaoId(13), lado: 'cliente', autor: 'Marcos Ternium', motivo: 'km_rota', texto: 'A rota usada foi mais longa que a combinada.', criadaEm: '2026-10-21T13:00:00Z' },
]
export const createMockMensagens = (): Mensagem[] => MENSAGENS.map((m, i) => ({ ...m, id: id('b1000000', i + 1) }))

export function createMockLinhas(mensagens: Mensagem[]): Linha[] {
  return SEMENTES.map((s) => {
    const vId = s.situacao === 'a_liberar' ? null : validacaoId(s.n)
    const reservaId = id('d1000000', s.n)
    const valor = soma(s.c)
    const conversa = mensagens.filter((m) => m.validacaoId === vId)
    const esperaCliente = s.situacao === 'liberado' || s.situacao === 'respondido'
    const respondidaEm = conversa.filter((m) => m.lado === 'betinhos').at(-1)?.criadaEm
    return {
      id: vId ?? `reserva:${reservaId}`,
      validacaoId: vId,
      reservaId,
      codigo: String(48200 + s.n),
      data: s.data,
      trajeto: s.trajeto,
      cliente: s.cliente,
      cr: s.cr,
      pedido: s.cliente === TENARIS ? `PO-77${String(s.n).padStart(3, '0')}` : '',
      situacao: s.situacao,
      valorLiberado: vId ? valor : null,
      valorAnterior: s.anterior ?? null,
      valorComposicao: valor,
      composicao: s.c,
      observacao: s.obs ?? '',
      liberadoEm: s.liberadoEm ?? null,
      prazoTacita: esperaCliente ? prazoTacita(respondidaEm ?? s.liberadoEm!) : null,
      aprovadoEm: s.situacao === 'aprovado' || s.situacao === 'aprovado_tacito' ? `${s.data}T20:00:00Z` : null,
      aprovadoPor: s.situacao === 'aprovado' ? 'carla.menezes@tenaris.com' : '',
      fechamento: s.fechamento ?? 'pendente',
      ultimaMensagem: conversa.at(-1) ?? null,
    }
  })
}

export const createMockValidadores = (): Validador[] => [
  { id: id('e1000000', 1), nome: 'Carla Menezes', email: 'carla.menezes@tenaris.com', cliente: TENARIS, ativo: true, ultimoAcesso: '2026-10-27T12:40:00Z', totpCadastradoEm: '2026-10-02T12:00:00Z' },
  { id: id('e1000000', 2), nome: 'Roberto Lima', email: 'roberto.lima@tenaris.com', cliente: TENARIS, ativo: true, ultimoAcesso: null, totpCadastradoEm: null },
  { id: id('e1000000', 3), nome: 'Ana Souza', email: 'ana.souza@tenaris.com', cliente: TENARIS, ativo: false, ultimoAcesso: '2026-09-15T12:00:00Z', totpCadastradoEm: '2026-09-01T12:00:00Z' },
  { id: id('e1000000', 4), nome: 'Marcos Ternium', email: 'marcos@ternium.com', cliente: TERNIUM, ativo: true, ultimoAcesso: '2026-10-21T13:00:00Z', totpCadastradoEm: '2026-10-01T12:00:00Z' },
]
