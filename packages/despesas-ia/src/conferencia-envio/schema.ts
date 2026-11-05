export const TIPOS_SINAL = ['acima_politica', 'refeicao_proxima', 'abastecimento_proximo', 'muitos_cafes', 'possivel_duplicidade', 'refeicao_sem_servico', 'data_diferente_cupom'] as const
export type TipoSinal = (typeof TIPOS_SINAL)[number]

export type RespostaConferencia = { resultado: 'sem_duvida' | 'duvida'; pergunta: string | null; motivos: TipoSinal[] }

export function schemaConferencia() {
  const properties = {
    resultado: { type: 'string', enum: ['sem_duvida', 'duvida'] },
    pergunta: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    motivos: { type: 'array', items: { type: 'string', enum: [...TIPOS_SINAL] } },
  }
  return { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) } as const
}
