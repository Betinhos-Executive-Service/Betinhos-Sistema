/** Contexto que o flow monta para cada despesa. Datas em America/Sao_Paulo (YYYY-MM-DD); saída da OS em ISO UTC. */
export type ContextoDespesa = {
  despesa: {
    id: string
    valor: number
    dataGasto: string
    categoria: string
    formaPagamento: string
    estabelecimento: string | null
    litros: number | null
    km: number | null
    observacao: string | null
  }
  reservas: { id: string; saida: string; cliente: string; status: string }[]
  duplicatas: { id: string; valor: number; dataGasto: string; motivo: 'mesmo_arquivo' | 'mesmo_valor_data' }[]
  referencia: { categoria: string; mediana: number | null; maximo: number | null; amostras: number }
}

export type Comprovante = { mime: string; base64: string }
