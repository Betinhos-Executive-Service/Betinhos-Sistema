const anulavel = (tipo: Record<string, unknown>) => ({ anyOf: [tipo, { type: 'null' }] })

export const DECISOES = ['validar', 'precisa_corrigir'] as const
export const TIPOS_COMPROVANTE = ['cupom_fiscal', 'nfce', 'pedagio', 'estacionamento', 'recibo', 'outro'] as const

const properties = {
  comprovante_legivel: { type: 'boolean' },
  tipo_comprovante: { type: 'string', enum: [...TIPOS_COMPROVANTE] },
  valor_lido: anulavel({ type: 'number' }),
  data_lida: anulavel({ type: 'string', format: 'date' }),
  hora_lida: anulavel({ type: 'string' }),
  cnpj_lido: anulavel({ type: 'string' }),
  estabelecimento_lido: anulavel({ type: 'string' }),
  litros_lidos: anulavel({ type: 'number' }),
  decisao: { type: 'string', enum: [...DECISOES] },
  motivos: { type: 'array', items: { type: 'string' } },
  reserva_id: anulavel({ type: 'string' }),
  possivel_duplicidade: { type: 'boolean' },
  confianca: { type: 'number' },
}

/** Schema da saída estruturada (`output_config.format`). Sem minimum/maximum/minLength: a API não suporta; a validação fica em `analisarMensagem`. */
export const RESPOSTA_SCHEMA = {
  type: 'object',
  properties,
  required: Object.keys(properties) as (keyof typeof properties)[],
  additionalProperties: false,
} as const

export type Decisao = (typeof DECISOES)[number]
export type RespostaIA = {
  comprovante_legivel: boolean
  tipo_comprovante: (typeof TIPOS_COMPROVANTE)[number]
  valor_lido: number | null
  data_lida: string | null
  hora_lida: string | null
  cnpj_lido: string | null
  estabelecimento_lido: string | null
  litros_lidos: number | null
  decisao: Decisao
  motivos: string[]
  reserva_id: string | null
  possivel_duplicidade: boolean
  confianca: number
}
