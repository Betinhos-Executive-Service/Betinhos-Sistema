export type TipoPendencia = 'op-paga-desalinhada' | 'pago-sem-op-paga' | 'op-sem-pagamento-reserva-paga' | 'rateio-nao-fecha' | 'mensal-sem-op'

export type Reserva = {
  id: string; codigo: string; saida: Date | null; cliente: string; clienteId: string
  status: number | null; fatStatus: number | null; fatLabel: string
  opId: string | null; opCodigo: string; cpId: string | null; cpStatus: number | null; cpValor: number | null
}
export type OpResumo = { id: string; codigo: string; status: number | null; valor: number | null; cliente: string }
export type PaganteResumo = { id: string; opId: string; status: number | null; valor: number | null }

export type Pendencia = {
  id: string                 // `${tipo}:${opId ?? reservaId}`
  tipo: TipoPendencia
  opId: string | null
  opCodigo: string
  reservaIds: string[]
  reservaCodigos: string[]
  cliente: string
  clienteId: string          // confiável só no tipo 4 (nos demais vem da primeira reserva)
  mes: string | null         // 'AAAA-MM' (tipo 4)
  data: Date | null          // saída mais recente das reservas envolvidas
  valor: number | null       // valor da OP, ou soma das CPs
  detalhe: string            // frase curta para a lista
  corrigivel: boolean        // tipos 1 e 3: botão Corrigir (Custom API)
}

export const TIPO_LABEL: Record<TipoPendencia, string> = {
  'op-paga-desalinhada': 'OP paga, serviço desalinhado',
  'pago-sem-op-paga': 'Serviço pago sem OP paga',
  'op-sem-pagamento-reserva-paga': 'OP sem pagamento, serviço pago',
  'rateio-nao-fecha': 'Rateio não fecha',
  'mensal-sem-op': 'Mensal sem OP',
}
