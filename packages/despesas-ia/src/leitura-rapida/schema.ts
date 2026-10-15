const anulavel = (tipo: Record<string, unknown>) => ({ anyOf: [tipo, { type: 'null' }] })

export type LeituraRapida = {
  legivel: boolean
  valor: number | null
  data: string | null
  hora: string | null
  estabelecimento: string | null
  cnpj: string | null
  litros: number | null
  categoria_sugerida: string | null
  forma_pagamento_sugerida: string | null
  motivo_ilegivel: string | null
}

export function schemaLeituraRapida(categorias: string[], formasPagamento: string[]) {
  const properties = {
    legivel: { type: 'boolean' },
    valor: anulavel({ type: 'number' }),
    data: anulavel({ type: 'string', format: 'date' }),
    hora: anulavel({ type: 'string' }),
    estabelecimento: anulavel({ type: 'string' }),
    cnpj: anulavel({ type: 'string' }),
    litros: anulavel({ type: 'number' }),
    categoria_sugerida: anulavel({ type: 'string', enum: [...categorias] }),
    forma_pagamento_sugerida: anulavel({ type: 'string', enum: [...formasPagamento] }),
    motivo_ilegivel: anulavel({ type: 'string' }),
  }
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) } as const
}
